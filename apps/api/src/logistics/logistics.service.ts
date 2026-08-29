import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ConsentCollectionChannel,
  ConsentLegalBasis,
  ConsentPurpose,
  ConsentStatus,
  ConsentSubjectType,
  DivisionType,
  PoliticalOperationMode,
  Prisma,
  Role,
  StorageObjectModule,
} from '../../prisma/generated/prisma';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import { isOwnedCanonicalStoragePath } from '../common/utils/tenant-storage-path.util';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { SyncE14Dto } from './dto/sync-e14.dto';
import { SyncVoterDto } from './dto/sync-voter.dto';

const E14_REPORT_VIEW_SELECT = {
  id: true,
  puestoId: true,
  mesa: true,
  candidateVotes: true,
  totalTableVotes: true,
  observations: true,
  isSynced: true,
  createdAt: true,
  puesto: { select: { code: true, name: true } },
  witness: { select: { name: true } },
} satisfies Prisma.WitnessReportSelect;

const VOTER_SYNC_RECEIPT = { received: true } as const;

const E14_OPERATION_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;
const TERRITORIALLY_SCOPED_E14_ROLES = [
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;
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
  ) {}

  /**
   * Sincroniza un acta E-14. Implementa resolución de conflictos básica.
   */
  async syncE14(tenantId: string, witnessId: string, data: SyncE14Dto) {
    await this.assertCampaignMode(tenantId);

    const {
      puestoId,
      mesa,
      candidateVotes,
      totalTableVotes,
      e14ImageUrl,
      observations,
    } = data;

    if (candidateVotes > totalTableVotes) {
      throw new BadRequestException(
        'Los votos del candidato no pueden superar el total de votos de la mesa',
      );
    }

    if (
      !isOwnedCanonicalStoragePath({
        tenantId,
        module: 'e14',
        path: e14ImageUrl,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      })
    ) {
      throw new BadRequestException(
        'El E-14 debe ser una ruta privada confirmada del tenant autenticado',
      );
    }

    const access = await resolveTerritorialAccess({
      client: this.prisma,
      tenantId,
      userId: witnessId,
      allowedRoles: E14_OPERATION_ROLES,
      territoriallyScopedRoles: TERRITORIALLY_SCOPED_E14_ROLES,
    });

    if (access.divisionIds !== null && !access.divisionIds.includes(puestoId)) {
      throw new ForbiddenException(
        'El puesto no pertenece a la asignación territorial del usuario',
      );
    }

    const puesto = await this.prisma.politicalDivision.findFirst({
      where: { id: puestoId, tenantId, type: DivisionType.PUESTO },
      select: { id: true },
    });

    if (!puesto) {
      throw new BadRequestException(
        'Puesto inválido para la campaña autenticada',
      );
    }

    // Buscar si ya existe un reporte para esta mesa en este puesto
    const existing = await this.prisma.witnessReport.findFirst({
      where: { puestoId, mesa, tenantId },
      select: E14_REPORT_VIEW_SELECT,
    });

    if (existing) {
      // Si existe y los datos de votos son diferentes, reportar conflicto
      if (
        existing.candidateVotes !== candidateVotes ||
        existing.totalTableVotes !== totalTableVotes
      ) {
        console.warn(
          `[Conflict] Mesa ${mesa} en Puesto ${puestoId} tiene datos discrepantes.`,
        );
        // Podríamos guardar el duplicado con un flag de conflicto en una tabla de auditoría
        throw new ConflictException('CONFLICT');
      }
      // Si son iguales, simplemente ignoramos el duplicado (Idempotencia)
      return existing;
    }

    // Crear el reporte si no existe
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const report = await transaction.witnessReport.create({
          data: {
            tenantId,
            witnessId,
            puestoId,
            mesa,
            e14ImageUrl,
            candidateVotes,
            totalTableVotes,
            observations,
            isSynced: true,
          },
          select: E14_REPORT_VIEW_SELECT,
        });
        await consumeConfirmedStorageUpload(
          transaction,
          tenantId,
          e14ImageUrl,
          StorageObjectModule.E14,
          'WitnessReport',
          report.id,
        );
        return report;
      });
    } catch (error: unknown) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException('CONFLICT');
      }
      throw error;
    }
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
    } = data;

    try {
      return await this.prisma.$transaction(async (transaction) => {
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
            termsVersion,
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
            collectionChannel: ConsentCollectionChannel.IN_PERSON,
            noticeVersion: termsVersion,
            sourceIpHash,
            capturedById: user.userId,
            grantedAt,
          },
        });

        return VOTER_SYNC_RECEIPT;
      });
    } catch (error: unknown) {
      if (!this.isPrismaUniqueViolation(error)) {
        throw error;
      }

      return VOTER_SYNC_RECEIPT;
    }
  }

  private isPrismaUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private async assertCampaignMode(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    assertCampaignTenant(tenant);
  }
}
