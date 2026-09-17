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
  ConsentPurpose,
  ConsentStatus,
  ConsentSubjectType,
  DivisionType,
  ElectoralCatalogEntryType,
  ElectoralCatalogStatus,
  ElectoralCatalogType,
  ElectoralCodeNamespace,
  IssueCaseStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
  WitnessCaptureContext,
  WitnessReportStatus,
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
import { findActiveConsentNotice } from '../common/utils/consent-notice.util';
import { pollingPlaceOperationalStatus } from '../common/utils/polling-place-operating-time';
import { lockAndAssertOperationOpen } from '../common/utils/operation-lifecycle-fence.util';
import {
  TERRITORY_HEATMAP_LEVELS,
  TerritoryHeatmapMetric,
  type TerritoryHeatmapLevel,
  type TerritoryHeatmapQueryDto,
} from './dto/territory-heatmap-query.dto';

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

const OPEN_CASE_STATUSES = [
  IssueCaseStatus.OPEN,
  IssueCaseStatus.TRIAGED,
  IssueCaseStatus.IN_PROGRESS,
  IssueCaseStatus.WAITING_ON_CITIZEN,
  IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY,
] as const;

const HEATMAP_PRIVACY_THRESHOLDS: Readonly<
  Record<TerritoryHeatmapMetric, number | null>
> = {
  [TerritoryHeatmapMetric.VOTER_ACTIVITY]: 5,
  [TerritoryHeatmapMetric.E14_COVERAGE]: null,
  [TerritoryHeatmapMetric.OPEN_CASES]: 3,
  [TerritoryHeatmapMetric.TEAM_COVERAGE]: 3,
};

const HEATMAP_METRIC_LABELS: Readonly<Record<TerritoryHeatmapMetric, string>> =
  {
    [TerritoryHeatmapMetric.VOTER_ACTIVITY]: 'Registros autorizados',
    [TerritoryHeatmapMetric.E14_COVERAGE]: 'Cobertura E-14 aceptada',
    [TerritoryHeatmapMetric.OPEN_CASES]: 'Casos territoriales abiertos',
    [TerritoryHeatmapMetric.TEAM_COVERAGE]: 'Equipo activo asignado',
  };

interface HeatmapDivision {
  id: string;
  code: string;
  name: string;
  type: DivisionType;
  parentId: string | null;
  expectedTables: number | null;
  sourceNamespace?: ElectoralCodeNamespace | null;
  sourceReleaseId?: string | null;
}

interface HeatmapCoordinateTarget {
  divisionId: string;
  releaseId: string;
  canonicalCode: string;
}

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly daneDivipolaClient: DaneDivipolaClient,
  ) {}

  /**
   * Sincroniza la geografía administrativa de la campaña autenticada con DANE
   * DIVIPOLA MGN 2025. DIVIPOLA no reemplaza el catálogo electoral DIVIPOLE de
   * Registraduría: este flujo crea únicamente departamentos y municipios. La
   * descarga se valida antes de escribir y nunca elimina divisiones.
   */
  async initializeElectoralData(user: AuthenticatedUser) {
    const tenantId = user.tenantId;
    const [tenant, admin, activeElectoralCatalog] = await Promise.all([
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
      this.prisma.electoralCatalogRelease.findFirst({
        where: {
          tenantId,
          type: ElectoralCatalogType.ELECTORAL_RNEC,
          status: ElectoralCatalogStatus.ACTIVE,
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
    if (activeElectoralCatalog) {
      throw new ConflictException(
        'La geografia administrativa DANE no puede mezclarse con la proyeccion electoral RNEC activa',
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
          await lockAndAssertOperationOpen(transaction, tenantId);
          const [currentTenant, currentAdmin, currentElectoralCatalog] =
            await Promise.all([
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
              transaction.electoralCatalogRelease.findFirst({
                where: {
                  tenantId,
                  type: ElectoralCatalogType.ELECTORAL_RNEC,
                  status: ElectoralCatalogStatus.ACTIVE,
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
          if (currentElectoralCatalog) {
            throw new ConflictException(
              'Se activo un catalogo electoral RNEC durante la sincronizacion; DANE no fue aplicado',
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

          await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
            WITH electoral_catalog_projection_lock AS MATERIALIZED (
              SELECT pg_advisory_xact_lock(
                hashtextextended(${`electoral-catalog:${tenantId}:RNEC_PROJECTION`}, 0)
              )
            )
            SELECT TRUE AS "locked" FROM electoral_catalog_projection_lock
          `);
          const latestElectoralCatalog =
            await transaction.electoralCatalogRelease.findFirst({
              where: {
                tenantId,
                type: ElectoralCatalogType.ELECTORAL_RNEC,
                status: ElectoralCatalogStatus.ACTIVE,
              },
              select: { id: true },
            });
          if (latestElectoralCatalog) {
            throw new ConflictException(
              'Se activo un catalogo electoral RNEC durante la sincronizacion; DANE no fue aplicado',
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
              update: {
                name: department.name,
                isActive: true,
                retiredAt: null,
              },
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
                isActive: true,
                retiredAt: null,
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
      message: 'Geografía administrativa sincronizada correctamente desde DANE',
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
          await lockAndAssertOperationOpen(tx, user.tenantId);
          await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
            WITH electoral_catalog_projection_lock AS MATERIALIZED (
              SELECT pg_advisory_xact_lock(
                hashtextextended(${`electoral-catalog:${user.tenantId}:RNEC_PROJECTION`}, 0)
              )
            )
            SELECT TRUE AS "locked" FROM electoral_catalog_projection_lock
          `);
          const [tenant, admin, parent, activeElectoralCatalog] =
            await Promise.all([
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
                  isActive: true,
                },
                select: { id: true, type: true },
              }),
              tx.electoralCatalogRelease.findFirst({
                where: {
                  tenantId: user.tenantId,
                  type: ElectoralCatalogType.ELECTORAL_RNEC,
                  status: ElectoralCatalogStatus.ACTIVE,
                },
                select: { id: true },
              }),
            ]);
          assertCampaignTenant(tenant);

          if (!admin) {
            throw new ForbiddenException(
              'La cuenta ya no puede administrar el territorio',
            );
          }
          if (activeElectoralCatalog) {
            throw new ConflictException(
              'No se pueden crear zonas o puestos manuales mientras exista una proyeccion electoral RNEC activa',
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
              sourceNamespace: true,
              sourceReleaseId: true,
              sourceLocationCode: true,
              votingDate: true,
              address: true,
              commune: true,
              latitude: true,
              longitude: true,
              timeZone: true,
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
          isActive: true,
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
                  {
                    sourceLocationCode: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
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
              sourceNamespace: true,
              sourceReleaseId: true,
              sourceLocationCode: true,
              votingDate: true,
              address: true,
              commune: true,
              latitude: true,
              longitude: true,
              timeZone: true,
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

        const evaluatedAt = new Date();
        return {
          items: items.map((division) => ({
            ...division,
            operationalStatus:
              division.type === DivisionType.PUESTO
                ? pollingPlaceOperationalStatus(division, evaluatedAt)
                : null,
          })),
          evaluatedAt: evaluatedAt.toISOString(),
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

  async getTerritoryHeatmap(
    user: AuthenticatedUser,
    query: TerritoryHeatmapQueryDto,
  ) {
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
        const divisions = await transaction.politicalDivision.findMany({
          where: { tenantId: user.tenantId, isActive: true },
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            parentId: true,
            expectedTables: true,
            sourceNamespace: true,
            sourceReleaseId: true,
          },
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
        });

        const divisionsById = new Map(
          divisions.map((division) => [division.id, division]),
        );
        const childrenByParent = this.indexDivisionChildren(divisions);
        const visibleIds = this.resolveHeatmapVisibleIds(
          divisionsById,
          access.divisionIds,
        );
        const parent = this.resolveHeatmapParent({
          query,
          divisionsById,
          visibleIds,
        });
        const items = divisions.filter(
          (division) =>
            division.type === query.level &&
            visibleIds.has(division.id) &&
            (query.level === DivisionType.DEPARTAMENTO
              ? division.parentId === null ||
                divisionsById.get(division.parentId)?.type ===
                  DivisionType.COUNTRY
              : division.parentId === parent?.id),
        );

        const authorizedOperationalIds =
          access.divisionIds === null ? null : new Set(access.divisionIds);
        const subtreeByItem = new Map<string, string[]>();
        const relevantDivisionIds = new Set<string>();
        const relevantPlaceIds = new Set<string>();

        for (const item of items) {
          const subtree = this.collectSubtreeIds(
            item.id,
            childrenByParent,
          ).filter(
            (id) =>
              authorizedOperationalIds === null ||
              authorizedOperationalIds.has(id),
          );
          subtreeByItem.set(item.id, subtree);
          for (const id of subtree) {
            relevantDivisionIds.add(id);
            if (divisionsById.get(id)?.type === DivisionType.PUESTO) {
              relevantPlaceIds.add(id);
            }
          }
        }

        const placeIds = [...relevantPlaceIds];
        const divisionIds = [...relevantDivisionIds];
        const coordinateTargets = placeIds.flatMap((placeId) => {
          const place = divisionsById.get(placeId);
          const target = place ? this.toHeatmapCoordinateTarget(place) : null;
          return target ? [target] : [];
        });
        const coordinateEntriesPromise = coordinateTargets.length
          ? transaction.electoralCatalogEntry.findMany({
              where: {
                tenantId: user.tenantId,
                type: ElectoralCatalogEntryType.POLLING_PLACE,
                releaseId: {
                  in: [
                    ...new Set(
                      coordinateTargets.map(({ releaseId }) => releaseId),
                    ),
                  ],
                },
                canonicalCode: {
                  in: [
                    ...new Set(
                      coordinateTargets.map(
                        ({ canonicalCode }) => canonicalCode,
                      ),
                    ),
                  ],
                },
              },
              select: {
                releaseId: true,
                canonicalCode: true,
                latitude: true,
                longitude: true,
              },
            })
          : Promise.resolve(
              [] as Array<{
                releaseId: string;
                canonicalCode: string;
                latitude: Prisma.Decimal | null;
                longitude: Prisma.Decimal | null;
              }>,
            );
        const checkedAt = new Date();
        const currentConsentNotice =
          query.metric === TerritoryHeatmapMetric.VOTER_ACTIVITY
            ? await findActiveConsentNotice(
                transaction,
                user.tenantId,
                PoliticalOperationMode.CAMPAIGN,
                ConsentPurpose.POLITICAL_COMMUNICATION,
              )
            : null;
        const votersPromise =
          query.metric === TerritoryHeatmapMetric.VOTER_ACTIVITY &&
          currentConsentNotice &&
          placeIds.length
            ? transaction.voter.groupBy({
                by: ['puestoId'],
                where: {
                  tenantId: user.tenantId,
                  puestoId: { in: placeIds },
                  consentAccepted: true,
                  termsVersion: currentConsentNotice.version,
                  consentRecords: {
                    some: {
                      tenantId: user.tenantId,
                      mode: PoliticalOperationMode.CAMPAIGN,
                      subjectType: ConsentSubjectType.VOTER,
                      purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
                      status: ConsentStatus.GRANTED,
                      noticeVersion: currentConsentNotice.version,
                      revokedAt: null,
                      grantedAt: { lte: checkedAt },
                      OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: checkedAt } },
                      ],
                    },
                  },
                },
                _count: { _all: true },
              })
            : Promise.resolve(
                [] as Array<{
                  puestoId: string | null;
                  _count: { _all: number };
                }>,
              );
        const acceptedTablesPromise =
          query.metric === TerritoryHeatmapMetric.E14_COVERAGE &&
          placeIds.length
            ? transaction.witnessReport.findMany({
                where: {
                  tenantId: user.tenantId,
                  captureContext: WitnessCaptureContext.REAL,
                  puestoId: { in: placeIds },
                  status: WitnessReportStatus.ACCEPTED,
                },
                select: { puestoId: true, mesa: true },
                distinct: ['puestoId', 'mesa'],
              })
            : Promise.resolve([] as Array<{ puestoId: string; mesa: number }>);
        const openCasesPromise =
          query.metric === TerritoryHeatmapMetric.OPEN_CASES &&
          divisionIds.length
            ? transaction.issueCase.groupBy({
                by: ['divisionId'],
                where: {
                  tenantId: user.tenantId,
                  divisionId: { in: divisionIds },
                  status: { in: [...OPEN_CASE_STATUSES] },
                },
                _count: { _all: true },
              })
            : Promise.resolve(
                [] as Array<{
                  divisionId: string | null;
                  _count: { _all: number };
                }>,
              );
        const teamMembersPromise =
          query.metric === TerritoryHeatmapMetric.TEAM_COVERAGE &&
          divisionIds.length
            ? transaction.user.groupBy({
                by: ['divisionId'],
                where: {
                  tenantId: user.tenantId,
                  divisionId: { in: divisionIds },
                  isActive: true,
                },
                _count: { _all: true },
              })
            : Promise.resolve(
                [] as Array<{
                  divisionId: string | null;
                  _count: { _all: number };
                }>,
              );

        const [
          rawVoters,
          acceptedTables,
          rawOpenCases,
          rawTeamMembers,
          coordinateEntries,
        ] = await Promise.all([
          votersPromise,
          acceptedTablesPromise,
          openCasesPromise,
          teamMembersPromise,
          coordinateEntriesPromise,
        ]);

        const allTerritoryLeaders = await transaction.territoryLeader.findMany({
          where: { tenantId: user.tenantId, divisionId: { in: divisionIds } },
          select: { id: true, name: true, phone: true, socialNetworkUrl: true, roleDescription: true, divisionId: true },
        });
        const leadersByDivisionId = new Map<string, Array<{id: string; name: string; phone: string | null; socialNetworkUrl: string | null; roleDescription: string}>>();
        for (const leader of allTerritoryLeaders) {
          const list = leadersByDivisionId.get(leader.divisionId) ?? [];
          list.push({
            id: leader.id,
            name: leader.name,
            phone: leader.phone,
            socialNetworkUrl: leader.socialNetworkUrl,
            roleDescription: leader.roleDescription,
          });
          leadersByDivisionId.set(leader.divisionId, list);
        }

        // Prisma's groupBy conditional return type is not preserved through a
        // heterogeneous Promise.all tuple. The selected shape is fixed above;
        // naming it here keeps downstream aggregation type-safe and lintable.
        const voters = rawVoters as Array<{
          puestoId: string | null;
          _count: { _all: number };
        }>;
        const openCases = rawOpenCases as Array<{
          divisionId: string | null;
          _count: { _all: number };
        }>;
        const teamMembers = rawTeamMembers as Array<{
          divisionId: string | null;
          _count: { _all: number };
        }>;

        const voterCounts = new Map(
          voters.flatMap((group) =>
            group.puestoId
              ? ([[group.puestoId, group._count._all]] as const)
              : [],
          ),
        );
        const acceptedTableCounts = new Map<string, number>();
        for (const table of acceptedTables) {
          acceptedTableCounts.set(
            table.puestoId,
            (acceptedTableCounts.get(table.puestoId) ?? 0) + 1,
          );
        }
        const openCaseCounts = new Map(
          openCases.flatMap((group) =>
            group.divisionId
              ? ([[group.divisionId, group._count._all]] as const)
              : [],
          ),
        );
        const teamCounts = new Map(
          teamMembers.flatMap((group) =>
            group.divisionId
              ? ([[group.divisionId, group._count._all]] as const)
              : [],
          ),
        );
        const coordinateTargetBySource = new Map(
          coordinateTargets.map((target) => [
            `${target.releaseId}:${target.canonicalCode}`,
            target.divisionId,
          ]),
        );
        const coordinatesByPlaceId = new Map<
          string,
          { latitude: number; longitude: number }
        >();
        for (const entry of coordinateEntries) {
          const divisionId = coordinateTargetBySource.get(
            `${entry.releaseId}:${entry.canonicalCode}`,
          );
          if (entry.latitude === null || entry.longitude === null) continue;
          const latitude = Number(entry.latitude);
          const longitude = Number(entry.longitude);
          if (
            !divisionId ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            continue;
          }
          coordinatesByPlaceId.set(divisionId, { latitude, longitude });
        }

        const rawItems = items.map((item) => {
          const subtree = subtreeByItem.get(item.id) ?? [];
          let voterCount = 0;
          let acceptedTableCount = 0;
          let expectedTableCount = 0;
          let openCaseCount = 0;
          let teamCount = 0;
          let totalPollingPlaces = 0;
          let locatedPollingPlaces = 0;
          const uniqueCoordinates = new Map<
            string,
            { latitude: number; longitude: number }
          >();

          for (const id of subtree) {
            const division = divisionsById.get(id);
            if (!division) continue;
            openCaseCount += openCaseCounts.get(id) ?? 0;
            teamCount += teamCounts.get(id) ?? 0;
            if (division.type !== DivisionType.PUESTO) continue;
            totalPollingPlaces += 1;
            voterCount += voterCounts.get(id) ?? 0;
            acceptedTableCount += acceptedTableCounts.get(id) ?? 0;
            expectedTableCount += Math.max(division.expectedTables ?? 0, 0);
            const coordinates = coordinatesByPlaceId.get(id);
            if (coordinates) {
              locatedPollingPlaces += 1;
              uniqueCoordinates.set(
                `${coordinates.latitude}:${coordinates.longitude}`,
                coordinates,
              );
            }
          }

          const coordinateValues = [...uniqueCoordinates.values()];
          const latitudeTotal = coordinateValues.reduce(
            (total, coordinates) => total + coordinates.latitude,
            0,
          );
          const longitudeTotal = coordinateValues.reduce(
            (total, coordinates) => total + coordinates.longitude,
            0,
          );

          const rawValue = this.resolveHeatmapMetricValue(query.metric, {
            voterCount,
            acceptedTableCount,
            expectedTableCount,
            openCaseCount,
            teamCount,
          });

          return {
            item,
            rawValue,
            expectedTableCount,
            acceptedTableCount,
            hasChildren: (childrenByParent.get(item.id) ?? []).some((id) =>
              visibleIds.has(id),
            ),
            geo:
              coordinateValues.length > 0
                ? {
                    latitude: Number(
                      (latitudeTotal / coordinateValues.length).toFixed(6),
                    ),
                    longitude: Number(
                      (longitudeTotal / coordinateValues.length).toFixed(6),
                    ),
                    basis:
                      item.type === DivisionType.PUESTO
                        ? ('POLLING_PLACE' as const)
                        : ('CENTROID' as const),
                    locatedPollingPlaces,
                    totalPollingPlaces,
                  }
                : {
                    latitude: null,
                    longitude: null,
                    basis: null,
                    locatedPollingPlaces: 0,
                    totalPollingPlaces,
                  },
            leaders: leadersByDivisionId.get(item.id) ?? [],
          };
        });
        const threshold = HEATMAP_PRIVACY_THRESHOLDS[query.metric];
        const reportableValues = rawItems
          .map(({ rawValue }) => rawValue)
          .filter(
            (value): value is number =>
              value !== null && (threshold === null || value >= threshold),
          );
        const maximumValue = Math.max(...reportableValues, 0);

        return {
          generatedAt: new Date().toISOString(),
          level: query.level,
          metric: {
            code: query.metric,
            label: HEATMAP_METRIC_LABELS[query.metric],
            unit:
              query.metric === TerritoryHeatmapMetric.E14_COVERAGE
                ? 'PERCENT'
                : 'COUNT',
          },
          parent: parent
            ? {
                id: parent.id,
                code: parent.code,
                name: parent.name,
                type: parent.type,
              }
            : null,
          breadcrumbs: this.buildHeatmapBreadcrumbs(
            parent,
            divisionsById,
            visibleIds,
          ),
          privacy: {
            minimumReportableCount: threshold,
            rule:
              threshold === null
                ? 'La métrica no contiene conteos personales.'
                : `Los conteos entre 1 y ${threshold - 1} se agrupan para evitar reidentificación.`,
          },
          items: rawItems.map(
            ({
              item,
              rawValue,
              expectedTableCount,
              acceptedTableCount,
              hasChildren,
              geo,
              leaders,
            }) => {
              const suppressed =
                rawValue !== null &&
                rawValue > 0 &&
                threshold !== null &&
                rawValue < threshold;
              const intensity = this.toHeatmapIntensity({
                metric: query.metric,
                rawValue,
                maximumValue,
                suppressed,
              });

              return {
                id: item.id,
                code: item.code,
                name: item.name,
                type: item.type,
                parentId: item.parentId,
                hasChildren,
                nextLevel: this.resolveNextHeatmapLevel(
                  item,
                  childrenByParent,
                  divisionsById,
                  visibleIds,
                ),
                value: suppressed ? null : rawValue,
                displayValue: this.formatHeatmapDisplayValue({
                  metric: query.metric,
                  value: suppressed ? null : rawValue,
                  suppressed,
                  threshold,
                }),
                suppressed,
                intensity,
                bucket:
                  intensity === 0 ? 0 : Math.min(5, Math.ceil(intensity / 20)),
                operationalContext: {
                  expectedTables: expectedTableCount,
                  acceptedTables: acceptedTableCount,
                },
                geo,
                leaders,
              };
            },
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private toHeatmapCoordinateTarget(
    division: HeatmapDivision,
  ): HeatmapCoordinateTarget | null {
    if (
      division.type !== DivisionType.PUESTO ||
      division.sourceNamespace !== ElectoralCodeNamespace.RNEC_DIVIPOLE ||
      !division.sourceReleaseId
    ) {
      return null;
    }
    const prefix = `${ElectoralCodeNamespace.RNEC_DIVIPOLE}:`;
    if (!division.code.startsWith(prefix)) return null;
    const canonicalCode = division.code.slice(prefix.length);
    if (!canonicalCode) return null;
    return {
      divisionId: division.id,
      releaseId: division.sourceReleaseId,
      canonicalCode,
    };
  }

  private indexDivisionChildren(
    divisions: HeatmapDivision[],
  ): Map<string, string[]> {
    const children = new Map<string, string[]>();
    for (const division of divisions) {
      if (!division.parentId) continue;
      const current = children.get(division.parentId) ?? [];
      current.push(division.id);
      children.set(division.parentId, current);
    }
    return children;
  }

  private resolveHeatmapVisibleIds(
    divisionsById: Map<string, HeatmapDivision>,
    scopedIds: string[] | null,
  ): Set<string> {
    if (scopedIds === null) return new Set(divisionsById.keys());

    const visible = new Set(scopedIds);
    for (const scopedId of scopedIds) {
      let current = divisionsById.get(scopedId);
      const visited = new Set<string>();
      while (current?.parentId && !visited.has(current.id)) {
        visited.add(current.id);
        visible.add(current.parentId);
        current = divisionsById.get(current.parentId);
      }
    }
    return visible;
  }

  private resolveHeatmapParent(input: {
    query: TerritoryHeatmapQueryDto;
    divisionsById: Map<string, HeatmapDivision>;
    visibleIds: Set<string>;
  }): HeatmapDivision | null {
    const { query, divisionsById, visibleIds } = input;
    if (query.level === DivisionType.DEPARTAMENTO) {
      if (query.parentId) {
        throw new BadRequestException(
          'El nivel departamento no admite un territorio padre',
        );
      }
      return null;
    }
    if (!query.parentId) {
      throw new BadRequestException(
        'Selecciona el territorio padre antes de consultar este nivel',
      );
    }

    const parent = divisionsById.get(query.parentId);
    if (!parent || !visibleIds.has(parent.id)) {
      throw new NotFoundException('Territorio padre no encontrado');
    }
    const allowedParentTypes: Readonly<
      Record<TerritoryHeatmapLevel, DivisionType[]>
    > = {
      [DivisionType.DEPARTAMENTO]: [DivisionType.COUNTRY],
      [DivisionType.MUNICIPIO]: [DivisionType.DEPARTAMENTO],
      [DivisionType.ZONA]: [DivisionType.MUNICIPIO],
      [DivisionType.PUESTO]: [DivisionType.MUNICIPIO, DivisionType.ZONA],
    };
    if (!allowedParentTypes[query.level].includes(parent.type)) {
      throw new BadRequestException(
        'El nivel solicitado no es hijo del territorio seleccionado',
      );
    }
    return parent;
  }

  private collectSubtreeIds(
    rootId: string,
    childrenByParent: Map<string, string[]>,
  ): string[] {
    const collected: string[] = [];
    const pending = [rootId];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      collected.push(current);
      pending.push(...(childrenByParent.get(current) ?? []));
    }
    return collected;
  }

  private resolveHeatmapMetricValue(
    metric: TerritoryHeatmapMetric,
    values: {
      voterCount: number;
      acceptedTableCount: number;
      expectedTableCount: number;
      openCaseCount: number;
      teamCount: number;
    },
  ): number | null {
    if (metric === TerritoryHeatmapMetric.VOTER_ACTIVITY) {
      return values.voterCount;
    }
    if (metric === TerritoryHeatmapMetric.OPEN_CASES) {
      return values.openCaseCount;
    }
    if (metric === TerritoryHeatmapMetric.TEAM_COVERAGE) {
      return values.teamCount;
    }
    if (values.expectedTableCount <= 0) return null;
    return Math.min(
      100,
      Math.round(
        (values.acceptedTableCount / values.expectedTableCount) * 10_000,
      ) / 100,
    );
  }

  private toHeatmapIntensity(input: {
    metric: TerritoryHeatmapMetric;
    rawValue: number | null;
    maximumValue: number;
    suppressed: boolean;
  }): number {
    if (input.rawValue === null || input.rawValue <= 0) return 0;
    if (input.suppressed) return 10;
    if (input.metric === TerritoryHeatmapMetric.E14_COVERAGE) {
      return Math.min(100, Math.max(0, input.rawValue));
    }
    if (input.maximumValue <= 0) return 0;
    return Math.min(
      100,
      Math.max(1, Math.round((input.rawValue / input.maximumValue) * 100)),
    );
  }

  private formatHeatmapDisplayValue(input: {
    metric: TerritoryHeatmapMetric;
    value: number | null;
    suppressed: boolean;
    threshold: number | null;
  }): string {
    if (input.suppressed && input.threshold !== null) {
      return `Menos de ${input.threshold}`;
    }
    if (input.value === null) return 'Sin base suficiente';
    if (input.metric === TerritoryHeatmapMetric.E14_COVERAGE) {
      return `${input.value.toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`;
    }
    return input.value.toLocaleString('es-CO');
  }

  private buildHeatmapBreadcrumbs(
    parent: HeatmapDivision | null,
    divisionsById: Map<string, HeatmapDivision>,
    visibleIds: Set<string>,
  ) {
    if (!parent) return [];
    const breadcrumbs: Array<{
      id: string;
      code: string;
      name: string;
      type: DivisionType;
    }> = [];
    let current: HeatmapDivision | undefined = parent;
    const visited = new Set<string>();
    while (current && visibleIds.has(current.id) && !visited.has(current.id)) {
      visited.add(current.id);
      if (
        TERRITORY_HEATMAP_LEVELS.includes(current.type as TerritoryHeatmapLevel)
      ) {
        breadcrumbs.unshift({
          id: current.id,
          code: current.code,
          name: current.name,
          type: current.type,
        });
      }
      current = current.parentId
        ? divisionsById.get(current.parentId)
        : undefined;
    }
    return breadcrumbs;
  }

  private resolveNextHeatmapLevel(
    item: HeatmapDivision,
    childrenByParent: Map<string, string[]>,
    divisionsById: Map<string, HeatmapDivision>,
    visibleIds: Set<string>,
  ): TerritoryHeatmapLevel | null {
    const childTypes = new Set(
      (childrenByParent.get(item.id) ?? [])
        .filter((id) => visibleIds.has(id))
        .map((id) => divisionsById.get(id)?.type)
        .filter((type): type is DivisionType => type !== undefined),
    );
    const orderedLevels: TerritoryHeatmapLevel[] = [
      DivisionType.MUNICIPIO,
      DivisionType.ZONA,
      DivisionType.PUESTO,
    ];
    return orderedLevels.find((level) => childTypes.has(level)) ?? null;
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
