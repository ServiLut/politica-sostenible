import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AuditActorType,
  ConsentLegalBasis,
  ConsentPurpose,
  ConsentStatus,
  ConsentSubjectType,
  DivisionType,
  OfflineSyncOperationType,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { OfflineSyncService } from '../common/services/offline-sync.service';
import { requireActiveConsentNotice } from '../common/utils/consent-notice.util';
import { lockAndAssertOperationOpen } from '../common/utils/operation-lifecycle-fence.util';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { WitnessService } from '../witness/witness.service';
import { SyncE14Dto } from './dto/sync-e14.dto';
import { SyncVoterDto } from './dto/sync-voter.dto';
import {
  assertPlanQuotaInTransaction,
  ensureTenantSubscription,
} from '../auth/guards/plan-limits.guard';

const VOTER_SYNC_TRANSACTION_OPTIONS = {
  // The advisory quota lock is acquired in one statement; READ COMMITTED makes
  // the following count observe the transaction that released that lock.
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
} as const;

const VOTER_SYNC_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
] as const;
const TERRITORIALLY_SCOPED_VOTER_SYNC_ROLES = [
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
] as const;

@Injectable()
export class LogisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentEvidence: ConsentEvidenceService,
    private readonly witnessService: WitnessService,
    private readonly offlineSync: OfflineSyncService,
  ) {}

  /**
   * Sincroniza un acta E-14. Implementa resolución de conflictos básica.
   */
  async syncE14(tenantId: string, witnessId: string, data: SyncE14Dto) {
    const {
      clientOperationId,
      capturedAt,
      captureGrant,
      evidenceSha256,
      ...report
    } = data;
    return this.witnessService.create(tenantId, witnessId, report, {
      isSynced: true,
      source: 'OFFLINE_SYNC',
      offlineSync: {
        clientOperationId,
        capturedAt,
        captureGrant,
        evidenceSha256,
      },
    });
  }

  /**
   * Sincroniza un nuevo simpatizante recolectado offline.
   */
  async syncVoter(
    user: AuthenticatedUser,
    syncRequestIp: string,
    data: SyncVoterDto,
  ) {
    if (data.consentAccepted !== true) {
      throw new BadRequestException(
        'Se requiere consentimiento expreso para sincronizar al ciudadano',
      );
    }

    const {
      documentId,
      firstName,
      lastName,
      phone,
      email,
      puestoId,
      mesa,
      consentAccepted,
      termsVersion,
      collectionChannel,
      clientOperationId,
      capturedAt,
    } = data;

    const descriptor = this.offlineSync.prepare(
      OfflineSyncOperationType.VOTER_CAPTURE,
      clientOperationId,
      capturedAt,
      {
        documentId,
        firstName,
        lastName,
        phone,
        email,
        puestoId,
        mesa,
        consentAccepted,
        termsVersion,
        collectionChannel,
      },
    );
    const receivedAt = new Date();

    await ensureTenantSubscription(this.prisma, user.tenantId);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockAndAssertOperationOpen(transaction, user.tenantId);
        const tenant = await transaction.tenant.findUnique({
          where: { id: user.tenantId },
          select: CAMPAIGN_TENANT_SELECT,
        });
        assertCampaignTenant(tenant);

        const { divisionIds } = await resolveTerritorialAccess({
          client: transaction,
          tenantId: user.tenantId,
          userId: user.userId,
          allowedRoles: VOTER_SYNC_ROLES,
          territoriallyScopedRoles: TERRITORIALLY_SCOPED_VOTER_SYNC_ROLES,
        });

        if (divisionIds !== null) {
          if (!puestoId) {
            throw new BadRequestException(
              'La sincronización requiere un puesto dentro de la asignación territorial',
            );
          }
          if (!divisionIds.includes(puestoId)) {
            throw new ForbiddenException(
              'El puesto no pertenece a la asignación territorial del usuario',
            );
          }
        }

        if (puestoId) {
          const puesto = await transaction.politicalDivision.findFirst({
            where: {
              id: puestoId,
              tenantId: user.tenantId,
              type: DivisionType.PUESTO,
              isActive: true,
            },
            select: { id: true, expectedTables: true },
          });

          if (!puesto) {
            throw new BadRequestException(
              'Puesto de votación inválido para la campaña autenticada',
            );
          }

          if (mesa && puesto.expectedTables && mesa > puesto.expectedTables) {
            throw new BadRequestException(
              `La mesa supera las ${puesto.expectedTables} mesas configuradas para el puesto`,
            );
          }
        } else if (mesa) {
          throw new BadRequestException(
            'La mesa solo puede registrarse junto con un puesto de votacion',
          );
        }

        const duplicate = await this.offlineSync.lockAndFindDuplicate(
          transaction,
          user.tenantId,
          user.userId,
          descriptor,
        );
        if (duplicate) {
          return this.offlineSync.present(duplicate, 'DUPLICATE');
        }

        const consentNotice = await requireActiveConsentNotice(
          transaction,
          user.tenantId,
          PoliticalOperationMode.CAMPAIGN,
          termsVersion,
          ConsentPurpose.POLITICAL_COMMUNICATION,
        );
        if (descriptor.capturedAt < consentNotice.activatedAt) {
          throw new ConflictException(
            'La captura es anterior a la activacion del aviso de privacidad presentado',
          );
        }

        // Acquire the tenant quota lock before the natural voter-key lookup.
        // This serializes different offline operation IDs for one document.
        await assertPlanQuotaInTransaction(
          transaction,
          user.tenantId,
          'voters',
          0,
        );

        const existing = await transaction.voter.findUnique({
          where: {
            documentId_tenantId: { documentId, tenantId: user.tenantId },
          },
          select: { id: true },
        });
        if (existing) {
          await transaction.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'VOTER_OFFLINE_SYNC_ACKNOWLEDGED',
              resourceType: 'Voter',
              resourceId: existing.id,
              metadata: {
                clientOperationId,
                capturedAt: descriptor.capturedAt.toISOString(),
                receivedAt: receivedAt.toISOString(),
                changed: false,
              },
            },
          });
          const receipt = await this.offlineSync.createReceipt(
            transaction,
            user.tenantId,
            user.userId,
            descriptor,
            'Voter',
            existing.id,
            receivedAt,
          );
          return this.offlineSync.present(receipt, 'APPLIED');
        }

        await assertPlanQuotaInTransaction(
          transaction,
          user.tenantId,
          'voters',
        );

        const syncSourceIpHash = this.consentEvidence.hashIp(syncRequestIp);
        const voter = await transaction.voter.create({
          data: {
            documentId,
            firstName,
            lastName,
            phone,
            email,
            tenantId: user.tenantId,
            registrarId: user.userId,
            puestoId,
            mesa,
            consentAccepted,
            // The request IP belongs to the later synchronization, not to the
            // original capture event.
            consentIp: null,
            consentTimestamp: descriptor.capturedAt,
            termsVersion: consentNotice.version,
          },
          select: { id: true },
        });

        await transaction.consentRecord.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            subjectType: ConsentSubjectType.VOTER,
            subjectRef: voter.id,
            voterId: voter.id,
            purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
            legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
            status: ConsentStatus.GRANTED,
            collectionChannel,
            noticeVersion: consentNotice.version,
            sourceIpHash: null,
            capturedAt: descriptor.capturedAt,
            receivedAt,
            syncSourceIpHash,
            capturedById: user.userId,
            grantedAt: descriptor.capturedAt,
          },
        });

        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: user.userId,
            action: 'VOTER_REGISTERED_WITH_CONSENT',
            resourceType: 'Voter',
            resourceId: voter.id,
            after: { consentStatus: ConsentStatus.GRANTED },
            metadata: {
              registeredFields: this.definedFieldNames({
                documentId,
                firstName,
                lastName,
                phone,
                email,
                puestoId,
                mesa,
              }),
              purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
              collectionChannel,
              noticeVersion: consentNotice.version,
              source: 'OFFLINE_SYNC',
              timestampSource: 'CLIENT_CAPTURED_AT',
              capturedAt: descriptor.capturedAt.toISOString(),
              receivedAt: receivedAt.toISOString(),
              syncNetworkEvidenceStored: true,
            },
          },
        });

        const receipt = await this.offlineSync.createReceipt(
          transaction,
          user.tenantId,
          user.userId,
          descriptor,
          'Voter',
          voter.id,
          receivedAt,
        );
        return this.offlineSync.present(receipt, 'APPLIED');
      }, VOTER_SYNC_TRANSACTION_OPTIONS);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'La sincronizacion cambio durante la solicitud; intente nuevamente',
        );
      }
      throw error;
    }
  }

  private definedFieldNames(value: object): string[] {
    return Object.entries(value)
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .map(([fieldName]) => fieldName)
      .sort();
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
}
