import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  DivisionType,
  Prisma,
  Role,
  StorageObjectModule,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWitnessReportDto } from './dto/create-witness-report.dto';
import { isOwnedCanonicalStoragePath } from '../common/utils/tenant-storage-path.util';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';

const WITNESS_OPERATION_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;
const TERRITORIALLY_SCOPED_WITNESS_ROLES = [
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;
const WITNESS_READ_ROLES = [...WITNESS_OPERATION_ROLES, Role.AUDITOR] as const;

const WITNESS_REPORT_VIEW_SELECT = {
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

@Injectable()
export class WitnessService {
  constructor(private prisma: PrismaService) {}

  async create(
    tenantId: string,
    witnessId: string,
    data: CreateWitnessReportDto,
  ) {
    await this.assertCampaignMode(tenantId);

    if (data.candidateVotes > data.totalTableVotes) {
      throw new BadRequestException(
        'Los votos del candidato no pueden superar el total de votos de la mesa',
      );
    }

    if (
      !isOwnedCanonicalStoragePath({
        tenantId,
        module: 'e14',
        path: data.e14ImageUrl,
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
      allowedRoles: WITNESS_OPERATION_ROLES,
      territoriallyScopedRoles: TERRITORIALLY_SCOPED_WITNESS_ROLES,
    });

    if (
      access.divisionIds !== null &&
      !access.divisionIds.includes(data.puestoId)
    ) {
      throw new ForbiddenException(
        'El puesto no pertenece a la asignación territorial del usuario',
      );
    }

    const [puesto, existing] = await Promise.all([
      this.prisma.politicalDivision.findFirst({
        where: { id: data.puestoId, tenantId, type: DivisionType.PUESTO },
        select: { id: true },
      }),
      this.prisma.witnessReport.findFirst({
        where: {
          tenantId,
          puestoId: data.puestoId,
          mesa: data.mesa,
        },
        select: { id: true },
      }),
    ]);

    if (!puesto) {
      throw new BadRequestException(
        'Puesto inválido para la campaña autenticada',
      );
    }

    if (existing) {
      throw new ConflictException(
        'Ya existe un reporte E-14 para este puesto y mesa',
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const report = await transaction.witnessReport.create({
          data: {
            ...data,
            tenantId,
            witnessId,
          },
          select: WITNESS_REPORT_VIEW_SELECT,
        });
        await consumeConfirmedStorageUpload(
          transaction,
          tenantId,
          data.e14ImageUrl,
          StorageObjectModule.E14,
          'WitnessReport',
          report.id,
        );
        return report;
      });
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe un reporte E-14 para este puesto y mesa',
        );
      }
      throw error;
    }
  }

  async findAll(tenantId: string, actorId: string) {
    await this.assertCampaignMode(tenantId);
    const access = await resolveTerritorialAccess({
      client: this.prisma,
      tenantId,
      userId: actorId,
      allowedRoles: WITNESS_READ_ROLES,
      territoriallyScopedRoles: TERRITORIALLY_SCOPED_WITNESS_ROLES,
    });

    return this.prisma.witnessReport.findMany({
      where: {
        tenantId,
        ...(access.divisionIds === null
          ? {}
          : { puestoId: { in: access.divisionIds } }),
      },
      select: WITNESS_REPORT_VIEW_SELECT,
      orderBy: { createdAt: 'desc' },
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

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
