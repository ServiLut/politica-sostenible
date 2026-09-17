import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  DivisionType,
  ElectoralCatalogEntryType,
  ElectoralCatalogStatus,
  ElectoralCatalogType,
  ElectoralCodeNamespace,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { PrismaService } from '../prisma/prisma.service';
import { lockAndAssertOperationOpen } from '../common/utils/operation-lifecycle-fence.util';
import { toStoredDateOnlyKey } from '../operation-profile/operation-readiness';
import {
  CatalogReleaseDetailQueryDto,
  CatalogReleaseDiffQueryDto,
  CatalogReleaseIntegrityDto,
  ListCatalogReleasesQueryDto,
} from './dto/catalog-release.dto';
import {
  ElectoralCatalogParseError,
  parseRnecDivipoleTree,
  type ParsedElectoralCatalogEntry,
  type ParsedRnecDivipoleTree,
} from './rnec-divipole-tree.parser';

const RNEC_ORGANIZATION = 'Registraduría Nacional del Estado Civil';
const CATALOG_REVIEW_ROLES = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;
const OFFICIAL_RNEC_HOST = /(^|\.)registraduria\.gov\.co$/iu;
const CATALOG_KEY = /^[A-Z0-9][A-Z0-9_-]{2,159}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_DIFF_ITEMS = 500;
const MATERIALIZATION_BATCH_SIZE = 500;
const RETIREMENT_BATCH_SIZE = 500;
const MUNICIPALITY_ENTRY_TYPES: readonly ElectoralCatalogEntryType[] = [
  ElectoralCatalogEntryType.MUNICIPALITY,
  ElectoralCatalogEntryType.NON_MUNICIPALIZED_AREA,
  ElectoralCatalogEntryType.ISLAND,
];

const RELEASE_SELECT = {
  id: true,
  tenantId: true,
  catalogKey: true,
  type: true,
  status: true,
  sourceUrl: true,
  sourceOrganization: true,
  sourceDataset: true,
  sourceCutoffAt: true,
  electionDate: true,
  contentSha256: true,
  parserVersion: true,
  authorizationReference: true,
  licenseDeclaration: true,
  sourceArtifactPath: true,
  recordCount: true,
  departmentCount: true,
  municipalityCount: true,
  zoneCount: true,
  pollingPlaceCount: true,
  physicalPollingPlaceCount: true,
  expectedTableCount: true,
  validationSummary: true,
  rejectionReason: true,
  createdById: true,
  validatedById: true,
  activatedById: true,
  approvedById: true,
  supersededByReleaseId: true,
  createdAt: true,
  validatedAt: true,
  activatedAt: true,
  supersededAt: true,
} satisfies Prisma.ElectoralCatalogReleaseSelect;

const ENTRY_SELECT = {
  id: true,
  tenantId: true,
  releaseId: true,
  namespace: true,
  type: true,
  canonicalCode: true,
  departmentCode: true,
  municipalityCode: true,
  zoneCode: true,
  pollingPlaceCode: true,
  sourceLocationCode: true,
  votingDate: true,
  parentId: true,
  name: true,
  nameIsDerived: true,
  address: true,
  commune: true,
  latitude: true,
  longitude: true,
  timeZone: true,
  expectedTables: true,
} satisfies Prisma.ElectoralCatalogEntrySelect;

const REFERENCED_DIVISION_SELECT = {
  id: true,
  code: true,
  name: true,
  _count: {
    select: {
      users: true,
      voters: true,
      witnesses: true,
      issueCases: true,
    },
  },
} satisfies Prisma.PoliticalDivisionSelect;

type SelectedRelease = Prisma.ElectoralCatalogReleaseGetPayload<{
  select: typeof RELEASE_SELECT;
}>;
type SelectedEntry = Prisma.ElectoralCatalogEntryGetPayload<{
  select: typeof ENTRY_SELECT;
}>;
type ReferencedDivision = Prisma.PoliticalDivisionGetPayload<{
  select: typeof REFERENCED_DIVISION_SELECT;
}>;

export interface StageRnecCatalogMetadata {
  catalogKey: string;
  sourceUrl: string;
  sourceDataset: string;
  sourceCutoffAt?: Date | string | null;
  electionDate: Date | string;
  authorizationReference?: string | null;
  licenseDeclaration?: string | null;
  sourceArtifactPath?: string | null;
}

export interface NormalizedStageRnecCatalogMetadata {
  catalogKey: string;
  sourceUrl: string;
  sourceDataset: string;
  sourceCutoffAt: Date | null;
  electionDate: Date;
  authorizationReference: string | null;
  licenseDeclaration: string | null;
  sourceArtifactPath: string | null;
}

export interface CatalogIntegrityReport {
  valid: boolean;
  blockingIssues: string[];
  counts: {
    records: number;
    departments: number;
    municipalities: number;
    zones: number;
    pollingPlaces: number;
    physicalPollingPlaces: number | null;
    additionalVotingDayRepresentations: number | null;
    expectedTables: number;
  };
  gaps: {
    departmentsWithoutMunicipalities: number;
    municipalitiesWithoutZones: number;
    zonesWithoutPollingPlaces: number;
    pollingPlacesWithoutCoordinates: number;
    pollingPlacesWithoutCommune: number;
    pollingPlaceRecordsWithoutAddress: number;
    physicalPollingPlacesWithoutAddress: number | null;
    physicalPollingPlacesWithoutTimeZone: number | null;
  };
}

const SERIALIZABLE_TRANSACTION = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 120_000,
} as const;

@Injectable()
export class ElectoralCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Trusted-worker boundary. Raw catalog files arrive through the signed
   * Storage/BullMQ workflow and never as a request body or arbitrary remote URL.
   */
  async stageRnecTreeContent(
    user: AuthenticatedUser,
    metadata: StageRnecCatalogMetadata,
    content: string,
  ) {
    let parsed: ParsedRnecDivipoleTree;
    try {
      parsed = parseRnecDivipoleTree(content);
    } catch (error: unknown) {
      if (error instanceof ElectoralCatalogParseError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    const normalized = this.validateRnecStageMetadata(user.tenantId, metadata);

    return this.prisma.$transaction(async (transaction) => {
      await lockAndAssertOperationOpen(transaction, user.tenantId);
      const actor = await this.requireActiveCatalogActor(transaction, user, [
        Role.ADMIN,
      ]);
      const existing = await transaction.electoralCatalogRelease.findFirst({
        where: {
          tenantId: user.tenantId,
          type: ElectoralCatalogType.ELECTORAL_RNEC,
          sourceDataset: normalized.sourceDataset,
          contentSha256: parsed.contentSha256,
          parserVersion: parsed.parserVersion,
        },
        select: RELEASE_SELECT,
      });
      if (existing) {
        this.assertIdempotentMetadata(existing, normalized);
        return { release: existing, created: false };
      }

      const release = await transaction.electoralCatalogRelease.create({
        data: {
          tenantId: user.tenantId,
          catalogKey: normalized.catalogKey,
          type: ElectoralCatalogType.ELECTORAL_RNEC,
          status: ElectoralCatalogStatus.STAGED,
          sourceUrl: normalized.sourceUrl,
          sourceOrganization: RNEC_ORGANIZATION,
          sourceDataset: normalized.sourceDataset,
          sourceCutoffAt: normalized.sourceCutoffAt,
          electionDate: normalized.electionDate,
          contentSha256: parsed.contentSha256,
          parserVersion: parsed.parserVersion,
          authorizationReference: normalized.authorizationReference,
          licenseDeclaration: normalized.licenseDeclaration,
          sourceArtifactPath: normalized.sourceArtifactPath,
          recordCount: parsed.counts.records,
          departmentCount: parsed.counts.departments,
          municipalityCount: parsed.counts.municipalities,
          zoneCount: parsed.counts.zones,
          pollingPlaceCount: parsed.counts.pollingPlaces,
          physicalPollingPlaceCount: parsed.counts.physicalPollingPlaces,
          expectedTableCount: parsed.counts.expectedTables,
          createdById: actor.id,
        },
        select: RELEASE_SELECT,
      });

      const idsByCanonicalCode = new Map(
        parsed.entries.map((entry) => [entry.canonicalCode, randomUUID()]),
      );
      for (const level of this.catalogEntryLevels()) {
        const entries = parsed.entries.filter((entry) =>
          level.includes(entry.type),
        );
        if (!entries.length) continue;
        await transaction.electoralCatalogEntry.createMany({
          data: entries.map((entry) =>
            this.toCatalogEntryCreate(
              user.tenantId,
              release.id,
              entry,
              idsByCanonicalCode,
            ),
          ),
        });
      }

      await transaction.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          actorType: AuditActorType.USER,
          actorUserId: actor.id,
          action: 'ELECTORAL_CATALOG_STAGED',
          resourceType: 'ElectoralCatalogRelease',
          resourceId: release.id,
          after: this.releaseAuditSnapshot(release),
          metadata: {
            contentBytes: parsed.contentBytes,
            transport: 'INTERNAL_TRUSTED_METHOD',
          },
        },
      });

      return { release, created: true };
    }, SERIALIZABLE_TRANSACTION);
  }

  async listReleases(
    user: AuthenticatedUser,
    query: ListCatalogReleasesQueryDto,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.requireActiveCatalogActor(
          transaction,
          user,
          CATALOG_REVIEW_ROLES,
        );
        return transaction.electoralCatalogRelease.findMany({
          where: {
            tenantId: user.tenantId,
            ...(query.type ? { type: query.type } : {}),
            ...(query.status ? { status: query.status } : {}),
          },
          select: RELEASE_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.limit ?? 50,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async getRelease(
    user: AuthenticatedUser,
    releaseId: string,
    query: CatalogReleaseDetailQueryDto,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.requireActiveCatalogActor(
          transaction,
          user,
          CATALOG_REVIEW_ROLES,
        );
        const release = await this.findTenantRelease(
          transaction,
          user.tenantId,
          releaseId,
        );
        const limit = query.entryLimit ?? 200;
        if (query.entryCursorId) {
          const cursor = await transaction.electoralCatalogEntry.findFirst({
            where: {
              id: query.entryCursorId,
              tenantId: user.tenantId,
              releaseId: release.id,
            },
            select: { id: true },
          });
          if (!cursor) {
            throw new BadRequestException(
              'El cursor no pertenece al release y tenant autenticados',
            );
          }
        }
        const entries = await transaction.electoralCatalogEntry.findMany({
          where: { tenantId: user.tenantId, releaseId: release.id },
          select: ENTRY_SELECT,
          orderBy: { id: 'asc' },
          take: limit + 1,
          ...(query.entryCursorId
            ? { cursor: { id: query.entryCursorId }, skip: 1 }
            : {}),
        });
        const hasMore = entries.length > limit;
        const page = hasMore ? entries.slice(0, limit) : entries;
        return {
          release,
          entries: page,
          pagination: {
            hasMore,
            nextCursorId: hasMore ? (page.at(-1)?.id ?? null) : null,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async getReleaseGaps(user: AuthenticatedUser, releaseId: string) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.requireActiveCatalogActor(
          transaction,
          user,
          CATALOG_REVIEW_ROLES,
        );
        const release = await this.findTenantRelease(
          transaction,
          user.tenantId,
          releaseId,
        );
        const entries = await this.findTenantEntries(
          transaction,
          user.tenantId,
          release.id,
        );
        return {
          releaseId: release.id,
          contentSha256: release.contentSha256,
          integrity: this.analyzeIntegrity(release, entries),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async validateRelease(
    user: AuthenticatedUser,
    releaseId: string,
    dto: CatalogReleaseIntegrityDto,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockAndAssertOperationOpen(transaction, user.tenantId);
      const actor = await this.requireActiveCatalogActor(
        transaction,
        user,
        CATALOG_REVIEW_ROLES,
      );
      const release = await this.findTenantRelease(
        transaction,
        user.tenantId,
        releaseId,
      );
      this.assertExpectedHash(release, dto.expectedContentSha256);

      if (
        release.status === ElectoralCatalogStatus.VALIDATED ||
        release.status === ElectoralCatalogStatus.ACTIVE ||
        release.status === ElectoralCatalogStatus.SUPERSEDED
      ) {
        return { release, validated: true, noOp: true };
      }
      if (release.status !== ElectoralCatalogStatus.STAGED) {
        throw new ConflictException(
          `El release ${release.id} esta ${release.status} y no puede validarse`,
        );
      }

      const entries = await this.findTenantEntries(
        transaction,
        user.tenantId,
        release.id,
      );
      const integrity = this.analyzeIntegrity(release, entries);
      const now = new Date();
      const nextStatus = integrity.valid
        ? ElectoralCatalogStatus.VALIDATED
        : ElectoralCatalogStatus.REJECTED;
      const updated = await transaction.electoralCatalogRelease.update({
        where: { id_tenantId: { id: release.id, tenantId: user.tenantId } },
        data: {
          status: nextStatus,
          validatedAt: now,
          validatedById: actor.id,
          validationSummary: integrity as unknown as Prisma.InputJsonValue,
          rejectionReason: integrity.valid
            ? null
            : integrity.blockingIssues.slice(0, 5).join('; '),
        },
        select: RELEASE_SELECT,
      });

      await transaction.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          actorType: AuditActorType.USER,
          actorUserId: actor.id,
          action: integrity.valid
            ? 'ELECTORAL_CATALOG_VALIDATED'
            : 'ELECTORAL_CATALOG_REJECTED',
          resourceType: 'ElectoralCatalogRelease',
          resourceId: release.id,
          before: this.releaseAuditSnapshot(release),
          after: this.releaseAuditSnapshot(updated),
          metadata: integrity as unknown as Prisma.InputJsonObject,
        },
      });

      return {
        release: updated,
        validated: integrity.valid,
        noOp: false,
        integrity,
      };
    }, SERIALIZABLE_TRANSACTION);
  }

  async activateRelease(
    user: AuthenticatedUser,
    releaseId: string,
    dto: CatalogReleaseIntegrityDto,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockAndAssertOperationOpen(transaction, user.tenantId);
        const actor = await this.requireActiveCatalogActor(
          transaction,
          user,
          CATALOG_REVIEW_ROLES,
        );
        let release = await this.findTenantRelease(
          transaction,
          user.tenantId,
          releaseId,
        );
        await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
          WITH electoral_catalog_projection_lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`electoral-catalog:${user.tenantId}:RNEC_PROJECTION`}, 0)
            )
          )
          SELECT TRUE AS "locked" FROM electoral_catalog_projection_lock
        `);
        release = await this.findTenantRelease(
          transaction,
          user.tenantId,
          releaseId,
        );
        this.assertExpectedHash(release, dto.expectedContentSha256);

        if (release.status === ElectoralCatalogStatus.ACTIVE) {
          return {
            release,
            activated: true,
            noOp: true,
            superseded: 0,
            retiredLegacy: 0,
            retiredRnec: 0,
          };
        }
        if (release.status !== ElectoralCatalogStatus.VALIDATED) {
          throw new ConflictException(
            `Solo un release VALIDATED puede activarse; estado actual: ${release.status}`,
          );
        }
        if (release.type !== ElectoralCatalogType.ELECTORAL_RNEC) {
          throw new ConflictException(
            'La ingesta administrativa DANE versionada aun no esta habilitada para activacion',
          );
        }
        if (
          !this.hasText(release.authorizationReference) ||
          !this.hasText(release.licenseDeclaration) ||
          !release.sourceCutoffAt
        ) {
          throw new ConflictException(
            'El release no puede activarse sin fecha de corte, autorizacion verificable y declaracion de licencia',
          );
        }
        if (actor.id === release.createdById) {
          throw new ConflictException(
            'La activacion requiere aprobacion de una segunda persona revisora autorizada distinta de quien creo el release',
          );
        }

        const operationProfile = await transaction.operationProfile.findUnique({
          where: { tenantId: user.tenantId },
          select: { electionDate: true },
        });
        if (
          operationProfile &&
          release.electionDate &&
          toStoredDateOnlyKey(release.electionDate) !==
            toStoredDateOnlyKey(operationProfile.electionDate)
        ) {
          throw new ConflictException(
            'La fecha electoral del release no coincide con el perfil operativo de la organizacion',
          );
        }

        const entries = await this.findTenantEntries(
          transaction,
          user.tenantId,
          release.id,
        );
        const integrity = this.analyzeIntegrity(release, entries);
        if (!integrity.valid) {
          throw new ConflictException(
            `El release tiene vacios bloqueantes: ${integrity.blockingIssues.slice(0, 5).join('; ')}`,
          );
        }

        const currentActive =
          await transaction.electoralCatalogRelease.findFirst({
            where: {
              tenantId: user.tenantId,
              type: ElectoralCatalogType.ELECTORAL_RNEC,
              status: ElectoralCatalogStatus.ACTIVE,
              id: { not: release.id },
            },
            select: RELEASE_SELECT,
          });
        const now = new Date();
        const retiredLegacy = currentActive
          ? 0
          : await this.retireInitialLegacyProjection(
              transaction,
              user.tenantId,
              now,
            );
        const removedRnecIds = await this.findRemovedRnecDivisionIds(
          transaction,
          user.tenantId,
          entries,
        );
        await this.assertNoReferencedRetirements(
          transaction,
          user.tenantId,
          removedRnecIds,
          'El nuevo release retira divisiones RNEC que todavia tienen usuarios, votantes, testigos o casos asociados. Defina y ejecute un crosswalk antes de activar',
        );

        await this.materializePoliticalDivisions(
          transaction,
          user.tenantId,
          release.id,
          entries,
        );
        const retiredRnec = await this.retireRnecDivisions(
          transaction,
          user.tenantId,
          removedRnecIds,
          now,
        );

        const superseded = await transaction.electoralCatalogRelease.updateMany(
          {
            where: {
              tenantId: user.tenantId,
              type: ElectoralCatalogType.ELECTORAL_RNEC,
              status: ElectoralCatalogStatus.ACTIVE,
              id: { not: release.id },
            },
            data: {
              status: ElectoralCatalogStatus.SUPERSEDED,
              supersededAt: now,
              supersededByReleaseId: release.id,
            },
          },
        );
        const activated = await transaction.electoralCatalogRelease.update({
          where: { id_tenantId: { id: release.id, tenantId: user.tenantId } },
          data: {
            status: ElectoralCatalogStatus.ACTIVE,
            activatedAt: now,
            activatedById: actor.id,
            approvedById: actor.id,
          },
          select: RELEASE_SELECT,
        });

        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: actor.id,
            action: 'ELECTORAL_CATALOG_ACTIVATED',
            resourceType: 'ElectoralCatalogRelease',
            resourceId: release.id,
            before: this.releaseAuditSnapshot(release),
            after: this.releaseAuditSnapshot(activated),
            metadata: {
              supersededReleases: superseded.count,
              materializedEntries: entries.length,
              retiredLegacyDivisions: retiredLegacy,
              retiredRnecDivisions: retiredRnec,
            },
          },
        });

        return {
          release: activated,
          activated: true,
          noOp: false,
          superseded: superseded.count,
          retiredLegacy,
          retiredRnec,
        };
      }, SERIALIZABLE_TRANSACTION);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'Otro release del mismo catalogo fue activado al mismo tiempo; recarga e intenta nuevamente',
        );
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'El catalogo cambio durante la activacion; recarga e intenta nuevamente',
        );
      }
      throw error;
    }
  }

  async diffRelease(
    user: AuthenticatedUser,
    releaseId: string,
    query: CatalogReleaseDiffQueryDto,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.requireActiveCatalogActor(
          transaction,
          user,
          CATALOG_REVIEW_ROLES,
        );
        const target = await this.findTenantRelease(
          transaction,
          user.tenantId,
          releaseId,
        );
        const base = query.againstReleaseId
          ? await transaction.electoralCatalogRelease.findFirst({
              where: {
                id: query.againstReleaseId,
                tenantId: user.tenantId,
                catalogKey: target.catalogKey,
              },
              select: RELEASE_SELECT,
            })
          : await transaction.electoralCatalogRelease.findFirst({
              where: {
                tenantId: user.tenantId,
                catalogKey: target.catalogKey,
                id: { not: target.id },
                status: {
                  in: [
                    ElectoralCatalogStatus.ACTIVE,
                    ElectoralCatalogStatus.SUPERSEDED,
                    ElectoralCatalogStatus.VALIDATED,
                  ],
                },
              },
              select: RELEASE_SELECT,
              orderBy: [{ activatedAt: 'desc' }, { createdAt: 'desc' }],
            });
        if (query.againstReleaseId && !base) {
          throw new NotFoundException(
            'Release base no encontrado dentro del mismo catalogo y tenant',
          );
        }

        const [targetEntries, baseEntries] = await Promise.all([
          this.findTenantEntries(transaction, user.tenantId, target.id),
          base
            ? this.findTenantEntries(transaction, user.tenantId, base.id)
            : Promise.resolve([] as SelectedEntry[]),
        ]);
        return this.buildDiff(target, targetEntries, base, baseEntries);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async requireActiveCatalogActor(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    allowedRoles: readonly Role[],
  ): Promise<{ id: string }> {
    const [tenant, actor] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      transaction.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          role: { in: [...allowedRoles] },
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!actor) {
      throw new ForbiddenException(
        'La cuenta vigente no puede consultar ni revisar catalogos electorales',
      );
    }
    return actor;
  }

  private async findTenantRelease(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    releaseId: string,
  ): Promise<SelectedRelease> {
    const release = await transaction.electoralCatalogRelease.findFirst({
      where: { id: releaseId, tenantId },
      select: RELEASE_SELECT,
    });
    if (!release) {
      throw new NotFoundException('Release electoral no encontrado');
    }
    return release;
  }

  private findTenantEntries(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    releaseId: string,
  ): Promise<SelectedEntry[]> {
    return transaction.electoralCatalogEntry.findMany({
      where: { tenantId, releaseId },
      select: ENTRY_SELECT,
      orderBy: { canonicalCode: 'asc' },
    });
  }

  validateRnecStageMetadata(
    tenantId: string,
    metadata: StageRnecCatalogMetadata,
  ): NormalizedStageRnecCatalogMetadata {
    const catalogKey = this.requiredText(
      metadata.catalogKey,
      'catalogKey',
      160,
    );
    if (!CATALOG_KEY.test(catalogKey)) {
      throw new BadRequestException(
        'catalogKey solo admite mayusculas, numeros, guion y guion bajo',
      );
    }
    const sourceUrl = this.requiredText(metadata.sourceUrl, 'sourceUrl', 2048);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      throw new BadRequestException('sourceUrl debe ser una URL valida');
    }
    if (
      parsedUrl.protocol !== 'https:' ||
      !OFFICIAL_RNEC_HOST.test(parsedUrl.hostname)
    ) {
      throw new BadRequestException(
        'sourceUrl debe usar HTTPS y pertenecer a un dominio oficial de la Registraduria',
      );
    }
    parsedUrl.hash = '';

    const sourceArtifactPath = this.optionalText(
      metadata.sourceArtifactPath,
      'sourceArtifactPath',
      512,
    );
    if (
      sourceArtifactPath &&
      (!sourceArtifactPath.startsWith(`${tenantId}/electoral-catalog/`) ||
        sourceArtifactPath.includes('..') ||
        sourceArtifactPath.includes('\\'))
    ) {
      throw new BadRequestException(
        'sourceArtifactPath debe permanecer dentro del prefijo electoral-catalog del tenant',
      );
    }

    const sourceCutoffAt = this.optionalDate(
      metadata.sourceCutoffAt,
      'sourceCutoffAt',
    );
    if (sourceCutoffAt && sourceCutoffAt.getTime() > Date.now()) {
      throw new BadRequestException(
        'sourceCutoffAt no puede estar en el futuro',
      );
    }

    return {
      catalogKey,
      sourceUrl: parsedUrl.toString(),
      sourceDataset: this.requiredText(
        metadata.sourceDataset,
        'sourceDataset',
        300,
      ),
      sourceCutoffAt,
      electionDate: this.requiredElectionDate(metadata.electionDate),
      authorizationReference: this.optionalText(
        metadata.authorizationReference,
        'authorizationReference',
        500,
      ),
      licenseDeclaration: this.optionalText(
        metadata.licenseDeclaration,
        'licenseDeclaration',
        500,
      ),
      sourceArtifactPath,
    };
  }

  private assertIdempotentMetadata(
    existing: SelectedRelease,
    metadata: NormalizedStageRnecCatalogMetadata,
  ): void {
    const same =
      existing.catalogKey === metadata.catalogKey &&
      existing.sourceUrl === metadata.sourceUrl &&
      existing.electionDate?.getTime() === metadata.electionDate.getTime() &&
      (existing.sourceCutoffAt?.getTime() ?? null) ===
        (metadata.sourceCutoffAt?.getTime() ?? null) &&
      existing.authorizationReference === metadata.authorizationReference &&
      existing.licenseDeclaration === metadata.licenseDeclaration &&
      existing.sourceArtifactPath === metadata.sourceArtifactPath;
    if (!same) {
      throw new ConflictException(
        'El mismo contenido ya fue registrado con metadatos de procedencia diferentes',
      );
    }
  }

  private assertExpectedHash(
    release: SelectedRelease,
    expectedContentSha256: string,
  ): void {
    if (
      !SHA256.test(expectedContentSha256) ||
      release.contentSha256 !== expectedContentSha256
    ) {
      throw new ConflictException(
        'El SHA-256 revisado no coincide con el release; recarga antes de continuar',
      );
    }
  }

  private toCatalogEntryCreate(
    tenantId: string,
    releaseId: string,
    entry: ParsedElectoralCatalogEntry,
    idsByCanonicalCode: ReadonlyMap<string, string>,
  ): Prisma.ElectoralCatalogEntryCreateManyInput {
    const id = idsByCanonicalCode.get(entry.canonicalCode);
    const parentId = entry.parentCanonicalCode
      ? idsByCanonicalCode.get(entry.parentCanonicalCode)
      : null;
    if (!id || (entry.parentCanonicalCode && !parentId)) {
      throw new BadRequestException(
        `No se pudo resolver la jerarquia de ${entry.canonicalCode}`,
      );
    }
    return {
      id,
      tenantId,
      releaseId,
      namespace: entry.namespace,
      type: entry.type,
      canonicalCode: entry.canonicalCode,
      departmentCode: entry.departmentCode,
      municipalityCode: entry.municipalityCode,
      zoneCode: entry.zoneCode,
      pollingPlaceCode: entry.pollingPlaceCode,
      sourceLocationCode: entry.sourceLocationCode,
      votingDate: entry.votingDate
        ? new Date(`${entry.votingDate}T00:00:00.000Z`)
        : null,
      parentId,
      name: entry.name,
      nameIsDerived: entry.nameIsDerived,
      address: entry.address,
      commune: entry.commune,
      latitude:
        entry.latitude === null
          ? null
          : new Prisma.Decimal(String(entry.latitude)),
      longitude:
        entry.longitude === null
          ? null
          : new Prisma.Decimal(String(entry.longitude)),
      timeZone: entry.timeZone,
      expectedTables: entry.expectedTables,
    };
  }

  private catalogEntryLevels(): ReadonlyArray<
    readonly ElectoralCatalogEntryType[]
  > {
    return [
      [ElectoralCatalogEntryType.DEPARTMENT],
      [
        ElectoralCatalogEntryType.MUNICIPALITY,
        ElectoralCatalogEntryType.NON_MUNICIPALIZED_AREA,
        ElectoralCatalogEntryType.ISLAND,
      ],
      [ElectoralCatalogEntryType.ZONE],
      [ElectoralCatalogEntryType.POLLING_PLACE],
    ];
  }

  private analyzeIntegrity(
    release: SelectedRelease,
    entries: SelectedEntry[],
  ): CatalogIntegrityReport {
    const blockingIssues: string[] = [];
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    const childCount = new Map<string, number>();
    const uniqueCodes = new Set<string>();
    const expectedNamespace =
      release.type === ElectoralCatalogType.ELECTORAL_RNEC
        ? ElectoralCodeNamespace.RNEC_DIVIPOLE
        : ElectoralCodeNamespace.DANE_DIVIPOLA;
    let departments = 0;
    let municipalities = 0;
    let zones = 0;
    let pollingPlaces = 0;
    let expectedTables = 0;
    let pollingPlacesWithoutCoordinates = 0;
    let pollingPlacesWithoutCommune = 0;
    let pollingPlaceRecordsWithoutAddress = 0;
    let incompletePhysicalIdentity = 0;
    const physicalPollingPlaces = new Map<string, SelectedEntry>();

    for (const entry of entries) {
      const uniqueKey = `${entry.namespace}:${entry.canonicalCode}`;
      if (uniqueCodes.has(uniqueKey)) {
        blockingIssues.push(`Codigo duplicado: ${uniqueKey}`);
      }
      uniqueCodes.add(uniqueKey);
      if (entry.namespace !== expectedNamespace) {
        blockingIssues.push(
          `Namespace invalido en ${entry.canonicalCode}: ${entry.namespace}`,
        );
      }
      if (entry.parentId) {
        childCount.set(
          entry.parentId,
          (childCount.get(entry.parentId) ?? 0) + 1,
        );
      }

      if (entry.type === ElectoralCatalogEntryType.DEPARTMENT) {
        departments += 1;
        if (entry.parentId) {
          blockingIssues.push(`Departamento con padre: ${entry.canonicalCode}`);
        }
      } else {
        const parent = entry.parentId
          ? entriesById.get(entry.parentId)
          : undefined;
        if (!parent || !this.isAllowedCatalogParent(parent.type, entry.type)) {
          blockingIssues.push(`Padre invalido: ${entry.canonicalCode}`);
        }
      }

      if (this.isMunicipalityType(entry.type)) municipalities += 1;
      if (entry.type === ElectoralCatalogEntryType.ZONE) zones += 1;
      if (entry.type === ElectoralCatalogEntryType.POLLING_PLACE) {
        pollingPlaces += 1;
        expectedTables += entry.expectedTables ?? 0;
        if (entry.latitude === null || entry.longitude === null) {
          pollingPlacesWithoutCoordinates += 1;
        }
        if (!this.hasText(entry.commune)) pollingPlacesWithoutCommune += 1;
        if (!this.hasText(entry.address))
          pollingPlaceRecordsWithoutAddress += 1;
        if (!entry.sourceLocationCode || !entry.votingDate) {
          incompletePhysicalIdentity += 1;
        } else {
          const previous = physicalPollingPlaces.get(entry.sourceLocationCode);
          if (
            previous &&
            (previous.address !== entry.address ||
              previous.commune !== entry.commune ||
              previous.latitude?.toString() !== entry.latitude?.toString() ||
              previous.longitude?.toString() !== entry.longitude?.toString() ||
              previous.timeZone !== entry.timeZone)
          ) {
            blockingIssues.push(
              `Ubicacion fisica ambigua: ${entry.sourceLocationCode}`,
            );
          }
          if (!previous) {
            physicalPollingPlaces.set(entry.sourceLocationCode, entry);
          }
        }
      }
    }

    const observedPhysicalPollingPlaces =
      incompletePhysicalIdentity === 0 ? physicalPollingPlaces.size : null;
    const additionalVotingDayRepresentations =
      observedPhysicalPollingPlaces === null
        ? null
        : pollingPlaces - observedPhysicalPollingPlaces;

    const counts = {
      records: entries.length,
      departments,
      municipalities,
      zones,
      pollingPlaces,
      physicalPollingPlaces: observedPhysicalPollingPlaces,
      additionalVotingDayRepresentations,
      expectedTables,
    };
    const declaredCounts = {
      records: release.recordCount,
      departments: release.departmentCount,
      municipalities: release.municipalityCount,
      zones: release.zoneCount,
      pollingPlaces: release.pollingPlaceCount,
      physicalPollingPlaces: release.physicalPollingPlaceCount,
      additionalVotingDayRepresentations:
        release.physicalPollingPlaceCount === null
          ? null
          : release.pollingPlaceCount - release.physicalPollingPlaceCount,
      expectedTables: release.expectedTableCount,
    };
    for (const key of Object.keys(counts) as Array<keyof typeof counts>) {
      if (counts[key] !== declaredCounts[key]) {
        blockingIssues.push(
          `Conteo ${key} no coincide: declarado ${declaredCounts[key]}, observado ${counts[key]}`,
        );
      }
    }
    if (
      release.physicalPollingPlaceCount !== null &&
      incompletePhysicalIdentity > 0
    ) {
      blockingIssues.push(
        `${incompletePhysicalIdentity} puestos no conservan codigo fisico o jornada`,
      );
    }

    if (release.type === ElectoralCatalogType.ELECTORAL_RNEC) {
      if (!departments)
        blockingIssues.push('El release no contiene departamentos');
      if (!municipalities)
        blockingIssues.push('El release no contiene municipios');
      if (!zones) blockingIssues.push('El release no contiene zonas');
      if (!pollingPlaces)
        blockingIssues.push('El release no contiene puestos de votacion');
    }

    const gaps = {
      departmentsWithoutMunicipalities: entries.filter(
        (entry) =>
          entry.type === ElectoralCatalogEntryType.DEPARTMENT &&
          !childCount.has(entry.id),
      ).length,
      municipalitiesWithoutZones: entries.filter(
        (entry) =>
          this.isMunicipalityType(entry.type) && !childCount.has(entry.id),
      ).length,
      zonesWithoutPollingPlaces: entries.filter(
        (entry) =>
          entry.type === ElectoralCatalogEntryType.ZONE &&
          !childCount.has(entry.id),
      ).length,
      pollingPlacesWithoutCoordinates,
      pollingPlacesWithoutCommune,
      pollingPlaceRecordsWithoutAddress,
      physicalPollingPlacesWithoutAddress:
        observedPhysicalPollingPlaces === null
          ? null
          : [...physicalPollingPlaces.values()].filter(
              (entry) => !this.hasText(entry.address),
            ).length,
      physicalPollingPlacesWithoutTimeZone:
        observedPhysicalPollingPlaces === null
          ? null
          : [...physicalPollingPlaces.values()].filter(
              (entry) => !this.hasText(entry.timeZone),
            ).length,
    };
    if (release.type === ElectoralCatalogType.ELECTORAL_RNEC) {
      if (gaps.departmentsWithoutMunicipalities) {
        blockingIssues.push(
          `${gaps.departmentsWithoutMunicipalities} departamentos no tienen municipios`,
        );
      }
      if (gaps.municipalitiesWithoutZones) {
        blockingIssues.push(
          `${gaps.municipalitiesWithoutZones} municipios no tienen zonas`,
        );
      }
      if (gaps.zonesWithoutPollingPlaces) {
        blockingIssues.push(
          `${gaps.zonesWithoutPollingPlaces} zonas no tienen puestos`,
        );
      }
    }

    return {
      valid: blockingIssues.length === 0,
      blockingIssues,
      counts,
      gaps,
    };
  }

  private isAllowedCatalogParent(
    parent: ElectoralCatalogEntryType,
    child: ElectoralCatalogEntryType,
  ): boolean {
    if (this.isMunicipalityType(child)) {
      return parent === ElectoralCatalogEntryType.DEPARTMENT;
    }
    if (child === ElectoralCatalogEntryType.ZONE) {
      return this.isMunicipalityType(parent);
    }
    if (child === ElectoralCatalogEntryType.POLLING_PLACE) {
      return parent === ElectoralCatalogEntryType.ZONE;
    }
    return false;
  }

  private isMunicipalityType(type: ElectoralCatalogEntryType): boolean {
    return MUNICIPALITY_ENTRY_TYPES.includes(type);
  }

  private async materializePoliticalDivisions(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    releaseId: string,
    entries: SelectedEntry[],
  ): Promise<void> {
    const divisionIdsByCode = new Map<string, string>();
    const catalogEntriesById = new Map(
      entries.map((entry) => [entry.id, entry]),
    );
    for (const level of this.catalogEntryLevels()) {
      const levelEntries = entries.filter((entry) =>
        level.includes(entry.type),
      );
      for (
        let offset = 0;
        offset < levelEntries.length;
        offset += MATERIALIZATION_BATCH_SIZE
      ) {
        const batch = levelEntries.slice(
          offset,
          offset + MATERIALIZATION_BATCH_SIZE,
        );
        const rows = batch.map((entry) => {
          const code = this.materializedDivisionCode(entry);
          const parentCode = entry.parentId
            ? this.materializedDivisionCode(
                catalogEntriesById.get(entry.parentId) ??
                  this.missingParent(entry),
              )
            : null;
          const parentId = parentCode
            ? divisionIdsByCode.get(parentCode)
            : null;
          if (parentCode && !parentId) {
            throw new ConflictException(
              `No se pudo materializar el padre de ${entry.canonicalCode}`,
            );
          }
          const divisionType = this.toDivisionType(entry.type);
          return Prisma.sql`(${randomUUID()}, ${tenantId}, ${code}, ${entry.name}, ${divisionType}::"DivisionType", ${parentId}, ${entry.expectedTables}, ${ElectoralCodeNamespace.RNEC_DIVIPOLE}::"ElectoralCodeNamespace", ${releaseId}, ${entry.sourceLocationCode}, ${entry.votingDate}, ${entry.address}, ${entry.commune}, ${entry.latitude}, ${entry.longitude}, ${entry.timeZone}, true, NULL)`;
        });
        await transaction.$executeRaw(
          Prisma.sql`
            INSERT INTO "PoliticalDivision"
              ("id", "tenantId", "code", "name", "type", "parentId", "expectedTables", "sourceNamespace", "sourceReleaseId", "sourceLocationCode", "votingDate", "address", "commune", "latitude", "longitude", "timeZone", "isActive", "retiredAt")
            VALUES ${Prisma.join(rows)}
            ON CONFLICT ("tenantId", "sourceNamespace", "code")
              WHERE "sourceNamespace" IS NOT NULL
            DO UPDATE SET
              "name" = EXCLUDED."name",
              "type" = EXCLUDED."type",
              "parentId" = EXCLUDED."parentId",
              "expectedTables" = EXCLUDED."expectedTables",
              "sourceReleaseId" = EXCLUDED."sourceReleaseId",
              "sourceLocationCode" = EXCLUDED."sourceLocationCode",
              "votingDate" = EXCLUDED."votingDate",
              "address" = EXCLUDED."address",
              "commune" = EXCLUDED."commune",
              "latitude" = EXCLUDED."latitude",
              "longitude" = EXCLUDED."longitude",
              "timeZone" = EXCLUDED."timeZone",
              "isActive" = true,
              "retiredAt" = NULL
          `,
        );
      }

      if (
        levelEntries.some(
          (entry) => entry.type !== ElectoralCatalogEntryType.POLLING_PLACE,
        )
      ) {
        const codes = levelEntries.map((entry) =>
          this.materializedDivisionCode(entry),
        );
        const divisions = await transaction.politicalDivision.findMany({
          where: {
            tenantId,
            code: { in: codes },
            sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
            isActive: true,
          },
          select: { id: true, code: true },
        });
        for (const division of divisions) {
          divisionIdsByCode.set(division.code, division.id);
        }
      }
    }
  }

  private async retireInitialLegacyProjection(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    retiredAt: Date,
  ): Promise<number> {
    const sourceFilter: Prisma.PoliticalDivisionWhereInput = {
      OR: [
        { sourceNamespace: null },
        { sourceNamespace: ElectoralCodeNamespace.DANE_DIVIPOLA },
      ],
    };
    const referenced = await transaction.politicalDivision.findMany({
      where: {
        tenantId,
        isActive: true,
        AND: [sourceFilter, this.divisionReferenceFilter(tenantId)],
      },
      select: REFERENCED_DIVISION_SELECT,
      take: 20,
    });
    if (referenced.length) {
      throw new ConflictException(
        `La primera activacion RNEC no puede retirar divisiones legacy/DANE con referencias. Falta un crosswalk para reasignar usuarios, votantes, testigos y casos: ${this.describeReferences(referenced)}`,
      );
    }
    const retired = await transaction.politicalDivision.updateMany({
      where: {
        tenantId,
        isActive: true,
        ...sourceFilter,
      },
      data: { isActive: false, retiredAt },
    });
    return retired.count;
  }

  private async findRemovedRnecDivisionIds(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    nextEntries: SelectedEntry[],
  ): Promise<string[]> {
    const nextCodes = new Set(
      nextEntries.map((entry) => this.materializedDivisionCode(entry)),
    );
    const active = await transaction.politicalDivision.findMany({
      where: {
        tenantId,
        sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        isActive: true,
      },
      select: { id: true, code: true },
    });
    return active
      .filter((division) => !nextCodes.has(division.code))
      .map((division) => division.id);
  }

  private async assertNoReferencedRetirements(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    divisionIds: string[],
    message: string,
  ): Promise<void> {
    for (
      let offset = 0;
      offset < divisionIds.length;
      offset += RETIREMENT_BATCH_SIZE
    ) {
      const batch = divisionIds.slice(offset, offset + RETIREMENT_BATCH_SIZE);
      const referenced = await transaction.politicalDivision.findMany({
        where: {
          tenantId,
          id: { in: batch },
          AND: [this.divisionReferenceFilter(tenantId)],
        },
        select: REFERENCED_DIVISION_SELECT,
        take: 20,
      });
      if (referenced.length) {
        throw new ConflictException(
          `${message}: ${this.describeReferences(referenced)}`,
        );
      }
    }
  }

  private async retireRnecDivisions(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    divisionIds: string[],
    retiredAt: Date,
  ): Promise<number> {
    let retired = 0;
    for (
      let offset = 0;
      offset < divisionIds.length;
      offset += RETIREMENT_BATCH_SIZE
    ) {
      const batch = divisionIds.slice(offset, offset + RETIREMENT_BATCH_SIZE);
      const result = await transaction.politicalDivision.updateMany({
        where: {
          tenantId,
          id: { in: batch },
          sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
          isActive: true,
        },
        data: { isActive: false, retiredAt },
      });
      if (result.count !== batch.length) {
        throw new ConflictException(
          'La proyeccion territorial cambio durante la activacion; reintente con el estado mas reciente',
        );
      }
      retired += result.count;
    }
    return retired;
  }

  private divisionReferenceFilter(
    tenantId: string,
  ): Prisma.PoliticalDivisionWhereInput {
    return {
      OR: [
        { users: { some: { tenantId } } },
        { voters: { some: { tenantId } } },
        { witnesses: { some: { tenantId } } },
        { issueCases: { some: { tenantId } } },
      ],
    };
  }

  private describeReferences(divisions: ReferencedDivision[]): string {
    return divisions
      .slice(0, 5)
      .map(
        (division) =>
          `${division.code} (usuarios=${division._count.users}, votantes=${division._count.voters}, testigos=${division._count.witnesses}, casos=${division._count.issueCases})`,
      )
      .join('; ');
  }

  private missingParent(entry: SelectedEntry): never {
    throw new ConflictException(
      `La entrada ${entry.canonicalCode} referencia un padre inexistente`,
    );
  }

  private materializedDivisionCode(entry: SelectedEntry): string {
    return `${entry.namespace}:${entry.canonicalCode}`;
  }

  private toDivisionType(type: ElectoralCatalogEntryType): DivisionType {
    if (type === ElectoralCatalogEntryType.DEPARTMENT) {
      return DivisionType.DEPARTAMENTO;
    }
    if (this.isMunicipalityType(type)) return DivisionType.MUNICIPIO;
    if (type === ElectoralCatalogEntryType.ZONE) return DivisionType.ZONA;
    return DivisionType.PUESTO;
  }

  private buildDiff(
    target: SelectedRelease,
    targetEntries: SelectedEntry[],
    base: SelectedRelease | null,
    baseEntries: SelectedEntry[],
  ) {
    const targetByCode = new Map(
      targetEntries.map((entry) => [this.entryKey(entry), entry]),
    );
    const baseByCode = new Map(
      baseEntries.map((entry) => [this.entryKey(entry), entry]),
    );
    const added: string[] = [];
    const removed: string[] = [];
    const changed: Array<{ code: string; fields: string[] }> = [];

    for (const [code, entry] of targetByCode) {
      const previous = baseByCode.get(code);
      if (!previous) {
        added.push(code);
        continue;
      }
      const fields = this.changedEntryFields(previous, entry);
      if (fields.length) changed.push({ code, fields });
    }
    for (const code of baseByCode.keys()) {
      if (!targetByCode.has(code)) removed.push(code);
    }
    added.sort();
    removed.sort();
    changed.sort((left, right) => left.code.localeCompare(right.code));

    return {
      target: {
        id: target.id,
        sha256: target.contentSha256,
        status: target.status,
      },
      base: base
        ? { id: base.id, sha256: base.contentSha256, status: base.status }
        : null,
      summary: {
        added: added.length,
        removed: removed.length,
        changed: changed.length,
      },
      sample: {
        limit: MAX_DIFF_ITEMS,
        truncated:
          added.length > MAX_DIFF_ITEMS ||
          removed.length > MAX_DIFF_ITEMS ||
          changed.length > MAX_DIFF_ITEMS,
        added: added.slice(0, MAX_DIFF_ITEMS),
        removed: removed.slice(0, MAX_DIFF_ITEMS),
        changed: changed.slice(0, MAX_DIFF_ITEMS),
      },
    };
  }

  private entryKey(entry: SelectedEntry): string {
    return `${entry.namespace}:${entry.canonicalCode}`;
  }

  private changedEntryFields(
    previous: SelectedEntry,
    current: SelectedEntry,
  ): string[] {
    const comparable = [
      'type',
      'name',
      'nameIsDerived',
      'address',
      'commune',
      'sourceLocationCode',
      'timeZone',
      'expectedTables',
    ] as const;
    const changed = comparable.filter(
      (field) => previous[field] !== current[field],
    ) as string[];
    if (previous.latitude?.toString() !== current.latitude?.toString()) {
      changed.push('latitude');
    }
    if (previous.longitude?.toString() !== current.longitude?.toString()) {
      changed.push('longitude');
    }
    if (previous.votingDate?.getTime() !== current.votingDate?.getTime()) {
      changed.push('votingDate');
    }
    return changed;
  }

  private releaseAuditSnapshot(
    release: SelectedRelease,
  ): Prisma.InputJsonObject {
    return {
      catalogKey: release.catalogKey,
      type: release.type,
      status: release.status,
      sourceOrganization: release.sourceOrganization,
      sourceDataset: release.sourceDataset,
      sourceUrl: release.sourceUrl,
      sourceCutoffAt: release.sourceCutoffAt?.toISOString() ?? null,
      electionDate: release.electionDate?.toISOString() ?? null,
      contentSha256: release.contentSha256,
      parserVersion: release.parserVersion,
      authorizationReference: release.authorizationReference,
      licenseDeclaration: release.licenseDeclaration,
      recordCount: release.recordCount,
      departmentCount: release.departmentCount,
      municipalityCount: release.municipalityCount,
      zoneCount: release.zoneCount,
      pollingPlaceCount: release.pollingPlaceCount,
      physicalPollingPlaceCount: release.physicalPollingPlaceCount,
      expectedTableCount: release.expectedTableCount,
      createdById: release.createdById,
      validatedById: release.validatedById,
      approvedById: release.approvedById,
      activatedById: release.activatedById,
    };
  }

  private requiredText(
    value: unknown,
    field: string,
    maxLength: number,
  ): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} debe ser texto`);
    }
    const normalized = value.trim().normalize('NFC');
    if (!normalized || normalized.length > maxLength) {
      throw new BadRequestException(
        `${field} debe tener entre 1 y ${maxLength} caracteres`,
      );
    }
    return normalized;
  }

  private optionalText(
    value: unknown,
    field: string,
    maxLength: number,
  ): string | null {
    if (value === null || value === undefined) return null;
    return this.requiredText(value, field, maxLength);
  }

  private requiredDate(value: Date | string, field: string): Date {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} debe ser una fecha valida`);
    }
    return date;
  }

  private requiredElectionDate(value: Date | string): Date {
    const parsed = this.requiredDate(value, 'electionDate');
    return new Date(
      Date.UTC(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
      ),
    );
  }

  private optionalDate(
    value: Date | string | null | undefined,
    field: string,
  ): Date | null {
    if (value === null || value === undefined) return null;
    return this.requiredDate(value, field);
  }

  private hasText(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 0;
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
