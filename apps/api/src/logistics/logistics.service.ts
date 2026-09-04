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
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { requireActiveConsentNotice } from '../common/utils/consent-notice.util';
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

const VOTER_SYNC_RECEIPT = { received: true } as const;
const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
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
    // The default only preserves direct construction in legacy unit tests;
    // Nest always injects the exported singleton from WitnessModule.
    private readonly witnessService: WitnessService = new WitnessService(
      prisma,
    ),
  ) {}

  /**
   * Sincroniza un acta E-14. Implementa resolución de conflictos básica.
   */
  async syncE14(tenantId: string, witnessId: string, data: SyncE14Dto) {
    return this.witnessService.create(tenantId, witnessId, data, {
      isSynced: true,
      source: 'OFFLINE_SYNC',
    });
  }

  /**
   * Sincroniza un nuevo simpatizante recolectado offline.
   */
  async syncVoter(
    user: AuthenticatedUser,
    consentIp: string,
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
      consentAccepted,
      termsVersion,
      collectionChannel,
    } = data;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.findUnique({
          where: { id: user.tenantId },
          select: CAMPAIGN_TENANT_SELECT,
        });
        assertCampaignTenant(tenant);
        const consentNotice = await requireActiveConsentNotice(
          transaction,
          user.tenantId,
          PoliticalOperationMode.CAMPAIGN,
          termsVersion,
          ConsentPurpose.POLITICAL_COMMUNICATION,
        );

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
            },
            select: { id: true },
          });

          if (!puesto) {
            throw new BadRequestException(
              'Puesto de votación inválido para la campaña autenticada',
            );
          }
        }

        const existing = await transaction.voter.findUnique({
          where: {
            documentId_tenantId: { documentId, tenantId: user.tenantId },
          },
          select: { id: true },
        });
        if (existing) return VOTER_SYNC_RECEIPT;

        const grantedAt = new Date();
        const sourceIpHash = this.consentEvidence.hashIp(consentIp);
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
            consentAccepted,
            consentIp: sourceIpHash,
            consentTimestamp: grantedAt,
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
            sourceIpHash,
            capturedById: user.userId,
            grantedAt,
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
              }),
              purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
              collectionChannel,
              noticeVersion: consentNotice.version,
            },
          },
        });

        return VOTER_SYNC_RECEIPT;
      }, SERIALIZABLE_OPTIONS);
    } catch (error: unknown) {
      if (this.isPrismaUniqueViolation(error)) {
        return VOTER_SYNC_RECEIPT;
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'La sincronizacion cambio durante la solicitud; intente nuevamente',
        );
      }
      throw error;
    }
  }

  private isPrismaUniqueViolation(error: unknown): boolean {
    return this.isPrismaError(error, 'P2002');
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
