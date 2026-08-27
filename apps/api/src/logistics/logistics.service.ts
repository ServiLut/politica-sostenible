import {
  BadRequestException,
  ConflictException,
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
} from '../../prisma/generated/prisma';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { assertConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import { isOwnedCanonicalStoragePath } from '../common/utils/tenant-storage-path.util';
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

const SYNCED_VOTER_VIEW_SELECT = {
  id: true,
  consentAccepted: true,
  consentTimestamp: true,
} satisfies Prisma.VoterSelect;

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

    await assertConfirmedStorageUpload(this.prisma, tenantId, e14ImageUrl);

    const [witness, puesto] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: witnessId, tenantId },
        select: { id: true },
      }),
      this.prisma.politicalDivision.findFirst({
        where: { id: puestoId, tenantId, type: DivisionType.PUESTO },
        select: { id: true },
      }),
    ]);

    if (!witness || !puesto) {
      throw new BadRequestException(
        'Testigo o puesto inválido para la campaña autenticada',
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
    return this.prisma.witnessReport.create({
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
  }

  /**
   * Sincroniza un nuevo simpatizante recolectado offline.
   */
  async syncVoter(
    tenantId: string,
    registrarId: string,
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
      termsVersion,
    } = data;

    const grantedAt = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const tenant = await transaction.tenant.findUnique({
        where: { id: tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      });
      assertCampaignTenant(tenant);
      const sourceIpHash = this.consentEvidence.hashIp(consentIp);

      const registrar = await transaction.user.findFirst({
        where: { id: registrarId, tenantId },
        select: { id: true },
      });

      if (!registrar) {
        throw new BadRequestException(
          'Registrador inválido para la campaña autenticada',
        );
      }

      if (puestoId) {
        const puesto = await transaction.politicalDivision.findFirst({
          where: { id: puestoId, tenantId, type: DivisionType.PUESTO },
          select: { id: true },
        });

        if (!puesto) {
          throw new BadRequestException(
            'Puesto de votación inválido para la campaña autenticada',
          );
        }
      }

      const voter = await transaction.voter.upsert({
        where: { documentId_tenantId: { documentId, tenantId } },
        update: {
          firstName,
          lastName,
          phone,
          email,
          puestoId,
          consentAccepted: true,
          consentIp: sourceIpHash,
          consentTimestamp: grantedAt,
          termsVersion,
        },
        create: {
          documentId,
          firstName,
          lastName,
          phone,
          email,
          tenantId,
          registrarId,
          puestoId,
          consentAccepted: true,
          consentIp: sourceIpHash,
          consentTimestamp: grantedAt,
          termsVersion,
        },
        select: SYNCED_VOTER_VIEW_SELECT,
      });

      await transaction.consentRecord.create({
        data: {
          tenantId,
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
          capturedById: registrarId,
          grantedAt,
        },
      });

      return voter;
    });
  }

  private async assertCampaignMode(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    assertCampaignTenant(tenant);
  }
}
