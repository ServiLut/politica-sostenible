import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AuditActorType,
  DivisionType,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import {
  DANE_DIVIPOLA_SOURCE,
  DaneDivipolaClient,
  type DaneMunicipality,
} from './dane-divipola.client';
import { ListDivisionsQueryDto } from './dto/list-divisions-query.dto';
import {
  CreatePoliticalDivisionDto,
  CreatableDivisionType,
} from './dto/create-political-division.dto';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';

export const CAMPAIGN_DIVISION_READ_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
  Role.VOLUNTEER,
] as const;

const TERRITORIALLY_SCOPED_DIVISION_ROLES = [
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
  Role.VOLUNTEER,
] as const;

interface Department {
  code: string;
  name: string;
}

const CAMPAIGN_VIEW_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  defaultMode: true,
} satisfies Prisma.TenantSelect;

const TERRITORY_SYNC_TRANSACTION_TIMEOUT_MS = 120_000;

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly daneDivipolaClient: DaneDivipolaClient,
  ) {}

  /**
   * Sincroniza la geografía electoral de la campaña autenticada con DANE
   * DIVIPOLA MGN 2025. La descarga se completa y valida antes de escribir en
   * PostgreSQL; la operación sólo hace upsert y nunca elimina divisiones.
   */
  async initializeElectoralData(user: AuthenticatedUser) {
    const tenantId = user.tenantId;
    const [tenant, admin] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_VIEW_SELECT,
      }),
      this.prisma.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          role: Role.ADMIN,
          isActive: true,
        },
        select: { id: true },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException('Campaña no encontrada');
    }
    assertCampaignTenant(tenant);
    if (!admin) {
      throw new ForbiddenException(
        'La cuenta ya no puede sincronizar el territorio',
      );
    }

    let municipalities: DaneMunicipality[];
    try {
      municipalities = await this.daneDivipolaClient.fetchMunicipalities();
    } catch (error) {
      this.logger.error(
        'No se pudo obtener o validar DIVIPOLA MGN 2025',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'No fue posible sincronizar con DANE; no se realizaron cambios',
      );
    }

    const departments = this.collectDepartments(municipalities);

    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const [currentTenant, currentAdmin] = await Promise.all([
            transaction.tenant.findUnique({
              where: { id: user.tenantId },
              select: CAMPAIGN_VIEW_SELECT,
            }),
            transaction.user.findFirst({
              where: {
                id: user.userId,
                tenantId: user.tenantId,
                role: Role.ADMIN,
                isActive: true,
              },
              select: { id: true },
            }),
          ]);
          assertCampaignTenant(currentTenant);
          if (!currentAdmin) {
            throw new ForbiddenException(
              'La cuenta ya no puede sincronizar el territorio',
            );
          }

          const lockName = `campaign-territory-sync:${tenantId}`;
          const [syncLock] = await transaction.$queryRaw<
            Array<{ acquired: boolean }>
          >`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockName}, 0)) AS acquired`;
          if (!syncLock?.acquired) {
            throw new ConflictException(
              'Ya hay una sincronizacion territorial en curso para esta campaña',
            );
          }

          const departmentIds = new Map<string, string>();

          for (const department of departments) {
            const saved = await transaction.politicalDivision.upsert({
              where: {
                tenantId_code_type: {
                  tenantId,
                  code: department.code,
                  type: DivisionType.DEPARTAMENTO,
                },
              },
              update: { name: department.name },
              create: {
                tenantId,
                code: department.code,
                name: department.name,
                type: DivisionType.DEPARTAMENTO,
              },
              select: { id: true },
            });
            departmentIds.set(department.code, saved.id);
          }

          for (const municipality of municipalities) {
            const parentId = departmentIds.get(municipality.departmentCode);
            if (!parentId) {
              throw new Error(
                `No se creó el departamento ${municipality.departmentCode}`,
              );
            }

            await transaction.politicalDivision.upsert({
              where: {
                tenantId_code_type: {
                  tenantId,
                  code: municipality.municipalityCode,
                  type: DivisionType.MUNICIPIO,
                },
              },
              update: {
                name: municipality.municipalityName,
                parentId,
              },
              create: {
                tenantId,
                code: municipality.municipalityCode,
                name: municipality.municipalityName,
                type: DivisionType.MUNICIPIO,
                parentId,
              },
            });
          }

          await transaction.auditEvent.create({
            data: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'POLITICAL_GEOGRAPHY_SYNCHRONIZED',
              resourceType: 'Tenant',
              resourceId: tenantId,
              metadata: {
                source: DANE_DIVIPOLA_SOURCE.organization,
                dataset: DANE_DIVIPOLA_SOURCE.dataset,
                version: DANE_DIVIPOLA_SOURCE.version,
                departments: departments.length,
                municipalities: municipalities.length,
              },
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: TERRITORY_SYNC_TRANSACTION_TIMEOUT_MS,
        },
      );
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(
        `Falló la persistencia DIVIPOLA para tenant ${user.tenantId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'La sincronización territorial no pudo completarse',
      );
    }

    return {
      message: 'Geografía electoral sincronizada correctamente desde DANE',
      tenant,
      source: DANE_DIVIPOLA_SOURCE,
      synchronized: {
        departments: departments.length,
        municipalities: municipalities.length,
      },
      synchronizedAt: new Date().toISOString(),
    };
  }

  async getCampaign(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_VIEW_SELECT,
    });

    if (!tenant) {
      throw new NotFoundException('Campaña no encontrada');
    }
    assertCampaignTenant(tenant);

    return tenant;
  }

  async createDivision(
    user: AuthenticatedUser,
    dto: CreatePoliticalDivisionDto,
  ) {
    const allowedParentTypes =
      dto.type === CreatableDivisionType.ZONA
        ? [DivisionType.MUNICIPIO]
        : [DivisionType.MUNICIPIO, DivisionType.ZONA];

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [tenant, admin, parent] = await Promise.all([
            tx.tenant.findUnique({
              where: { id: user.tenantId },
              select: CAMPAIGN_TENANT_SELECT,
            }),
            tx.user.findFirst({
              where: {
                id: user.userId,
                tenantId: user.tenantId,
                role: Role.ADMIN,
                isActive: true,
              },
              select: { id: true },
            }),
            tx.politicalDivision.findFirst({
              where: {
                id: dto.parentId,
                tenantId: user.tenantId,
                type: { in: allowedParentTypes },
              },
              select: { id: true, type: true },
            }),
          ]);
          assertCampaignTenant(tenant);

          if (!admin) {
            throw new ForbiddenException(
              'La cuenta ya no puede administrar el territorio',
            );
          }
          if (!parent) {
            throw new BadRequestException(
              'El territorio padre no pertenece al tenant o no es compatible',
            );
          }

          const division = await tx.politicalDivision.create({
            data: {
              tenantId: user.tenantId,
              type: dto.type,
              code: dto.code.trim().toUpperCase(),
              name: dto.name.trim(),
              parentId: parent.id,
            },
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              parentId: true,
              expectedTables: true,
              parent: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          });

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'POLITICAL_DIVISION_CREATED',
              resourceType: 'PoliticalDivision',
              resourceId: division.id,
              after: {
                type: division.type,
                code: division.code,
                parentId: division.parentId,
              },
            },
          });

          return division;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new ConflictException(
          error.code === 'P2002'
            ? 'Ya existe una división con ese código y tipo'
            : 'El territorio cambió durante la solicitud; vuelve a intentarlo',
        );
      }
      throw error;
    }
  }

  async findDivisions(user: AuthenticatedUser, query: ListDivisionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    return this.prisma.$transaction(
      async (transaction) => {
        const tenant = await transaction.tenant.findUnique({
          where: { id: user.tenantId },
          select: CAMPAIGN_TENANT_SELECT,
        });
        assertCampaignTenant(tenant);

        const access = await resolveTerritorialAccess({
          client: transaction,
          tenantId: user.tenantId,
          userId: user.userId,
          allowedRoles: CAMPAIGN_DIVISION_READ_ROLES,
          territoriallyScopedRoles: TERRITORIALLY_SCOPED_DIVISION_ROLES,
        });
        const where: Prisma.PoliticalDivisionWhereInput = {
          tenantId: user.tenantId,
          type: query.type,
          ...(access.divisionIds ? { id: { in: access.divisionIds } } : {}),
          ...(query.search
            ? {
                OR: [
                  {
                    code: { contains: query.search, mode: 'insensitive' },
                  },
                  {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                ],
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          transaction.politicalDivision.findMany({
            where,
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              parentId: true,
              expectedTables: true,
              parent: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
            orderBy: [{ code: 'asc' }, { id: 'asc' }],
            skip: (page - 1) * limit,
            take: limit,
          }),
          transaction.politicalDivision.count({ where }),
        ]);

        return {
          items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private collectDepartments(municipalities: DaneMunicipality[]): Department[] {
    const departments = new Map<string, Department>();

    for (const municipality of municipalities) {
      departments.set(municipality.departmentCode, {
        code: municipality.departmentCode,
        name: municipality.departmentName,
      });
    }

    return [...departments.values()].sort((left, right) =>
      left.code.localeCompare(right.code),
    );
  }
}
