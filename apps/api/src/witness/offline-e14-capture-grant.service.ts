import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditActorType,
  DivisionType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  WitnessCaptureContext,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ensureTenantSubscription } from '../auth/guards/plan-limits.guard';
import {
  assertCandidacyCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { pollingPlaceOperationalStatus } from '../common/utils/polling-place-operating-time';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
import {
  electionOperatingWindowSha256,
  isWithinElectionOperatingWindow,
  toStoredDateOnlyKey,
} from '../operation-profile/election-operating-window';
import { PrismaService } from '../prisma/prisma.service';

const MINIMUM_SECRET_BYTES = 32;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CAPTURE_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const SIMULATION_GRANT_TTL_MS = 12 * 60 * 60 * 1_000;
const REAL_GRANT_TTL_MS = 48 * 60 * 60 * 1_000;
const MAX_GRANT_POLLING_PLACES = 5_000;

const GRANT_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;

const TERRITORIALLY_SCOPED_GRANT_ROLES = [
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;

type GrantTransaction = Prisma.TransactionClient;

interface LockedGrantRow {
  id: string;
  tenantId: string;
  actorUserId: string;
  operationProfileId: string;
  tokenHmac: string;
  userAuthVersion: number;
  roleAtIssue: Role;
  captureContext: WitnessCaptureContext;
  issuedStage: PoliticalOperationStage;
  electionDate: Date;
  votingStartDate: Date;
  votingEndDate: Date;
  electionWindowSha256: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface LockedProfileRow {
  id: string;
  stage: PoliticalOperationStage;
  electionDate: Date;
  votingStartDate: Date;
  votingEndDate: Date;
  votingWindowSourceUrl: string | null;
  votingWindowReference: string | null;
}

export interface ResolvedOfflineE14Grant {
  readonly grantId: string;
  readonly tokenHmac: string;
  readonly captureContext: Extract<
    WitnessCaptureContext,
    'SIMULATION' | 'REAL'
  >;
  readonly actorUserId: string;
  readonly operationProfileId: string;
  readonly userAuthVersion: number;
  readonly roleAtIssue: Role;
  readonly electionDate: Date;
  readonly votingStartDate: Date;
  readonly votingEndDate: Date;
  readonly electionWindowSha256: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

@Injectable()
export class OfflineE14CaptureGrantService {
  private readonly hmacSecret: Buffer;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const configuredSecret = configService
      .get<string>('OFFLINE_SYNC_HMAC_SECRET')
      ?.trim();
    if (
      !configuredSecret ||
      Buffer.byteLength(configuredSecret, 'utf8') < MINIMUM_SECRET_BYTES
    ) {
      throw new Error(
        `OFFLINE_SYNC_HMAC_SECRET es obligatorio y debe tener al menos ${MINIMUM_SECRET_BYTES} bytes`,
      );
    }
    this.hmacSecret = Buffer.from(configuredSecret, 'utf8');
  }

  async provision(user: AuthenticatedUser) {
    await ensureTenantSubscription(this.prisma, user.tenantId);
    const now = new Date();
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHmac = this.digestToken(token);

    const response = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
          WITH offline_e14_grant_lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`offline-e14-grant:${user.tenantId}:${user.userId}`}, 0)
            )
          )
          SELECT TRUE AS "locked" FROM offline_e14_grant_lock
        `);
        const tenant = await transaction.tenant.findUnique({
          where: { id: user.tenantId },
          select: CAMPAIGN_TENANT_SELECT,
        });
        assertCandidacyCampaignTenant(tenant);

        const profiles = await transaction.$queryRaw<LockedProfileRow[]>(
          Prisma.sql`
            SELECT
              "id", "stage", "electionDate", "votingStartDate",
              "votingEndDate", "votingWindowSourceUrl",
              "votingWindowReference"
            FROM "OperationProfile"
            WHERE "tenantId" = ${user.tenantId}
            FOR SHARE
          `,
        );
        const profile = profiles[0];
        if (!profile) {
          throw new ConflictException({
            code: 'OPERATION_STAGE_NOT_CONFIGURED',
            message:
              'Configura o adopta la etapa vigente antes de provisionar captura E-14 offline',
          });
        }
        const captureContext = this.captureContextForProvision(profile, now);
        const electionWindowSha256 = electionOperatingWindowSha256({
          tenantId: user.tenantId,
          operationProfileId: profile.id,
          electionDate: profile.electionDate,
          votingStartDate: profile.votingStartDate,
          votingEndDate: profile.votingEndDate,
          votingWindowSourceUrl: profile.votingWindowSourceUrl,
          votingWindowReference: profile.votingWindowReference,
        });
        const access = await resolveTerritorialAccess({
          client: transaction,
          tenantId: user.tenantId,
          userId: user.userId,
          allowedRoles: GRANT_ROLES,
          territoriallyScopedRoles: TERRITORIALLY_SCOPED_GRANT_ROLES,
        });
        const actor = await transaction.user.findFirst({
          where: {
            id: user.userId,
            tenantId: user.tenantId,
            isActive: true,
            role: access.role,
          },
          select: { id: true, authVersion: true, role: true },
        });
        if (!actor) {
          throw new ForbiddenException(
            'La identidad vigente no puede provisionar captura E-14 offline',
          );
        }

        const scopedPlaces = await transaction.politicalDivision.findMany({
          where: {
            tenantId: user.tenantId,
            type: DivisionType.PUESTO,
            isActive: true,
            expectedTables: { gt: 0 },
            ...(access.divisionIds === null
              ? {}
              : { id: { in: access.divisionIds } }),
          },
          select: {
            id: true,
            code: true,
            name: true,
            expectedTables: true,
            sourceReleaseId: true,
            sourceLocationCode: true,
            votingDate: true,
            timeZone: true,
            address: true,
            commune: true,
          },
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          take: MAX_GRANT_POLLING_PLACES + 1,
        });
        if (scopedPlaces.length === 0) {
          throw new ConflictException({
            code: 'E14_OFFLINE_SCOPE_EMPTY',
            message:
              'No hay puestos activos con mesas configuradas dentro del alcance vigente',
          });
        }
        if (scopedPlaces.length > MAX_GRANT_POLLING_PLACES) {
          throw new ConflictException({
            code: 'E14_OFFLINE_SCOPE_TOO_LARGE',
            message:
              'El alcance supera el limite seguro de puestos para una capacidad offline',
          });
        }
        const places =
          captureContext === WitnessCaptureContext.REAL
            ? scopedPlaces.filter(
                (place) =>
                  pollingPlaceOperationalStatus(place, now).operationalNow,
              )
            : scopedPlaces;
        if (places.length === 0) {
          const placeStatuses = scopedPlaces.map((place) =>
            pollingPlaceOperationalStatus(place, now),
          );
          if (
            placeStatuses.some(
              (status) => status.code === 'TIME_ZONE_NOT_VERIFIED',
            )
          ) {
            throw new ConflictException({
              code: 'E14_OFFLINE_POLLING_PLACE_TIME_ZONE_NOT_VERIFIED',
              message:
                'Ningun puesto del alcance tiene una zona horaria IANA verificable para su jornada; no se emitio capacidad REAL',
            });
          }
          if (
            placeStatuses.some(
              (status) => status.code === 'VOTING_DATE_NOT_DOCUMENTED',
            )
          ) {
            throw new ConflictException({
              code: 'E14_OFFLINE_POLLING_PLACE_DATE_NOT_DOCUMENTED',
              message:
                'Ningun puesto del alcance tiene una fecha logica documentada para la jornada; no se emitio capacidad REAL',
            });
          }
          throw new ConflictException({
            code: 'E14_OFFLINE_POLLING_PLACE_DAY_NOT_ACTIVE',
            message:
              'Ningun puesto del alcance opera en su fecha local documentada en este momento; no se emitio capacidad REAL',
          });
        }

        const expiresAt = new Date(
          now.getTime() +
            (captureContext === WitnessCaptureContext.SIMULATION
              ? SIMULATION_GRANT_TTL_MS
              : REAL_GRANT_TTL_MS),
        );
        await transaction.offlineE14CaptureGrant.updateMany({
          where: {
            tenantId: user.tenantId,
            actorUserId: user.userId,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { revokedAt: now },
        });
        const grant = await transaction.offlineE14CaptureGrant.create({
          data: {
            tenantId: user.tenantId,
            actorUserId: user.userId,
            operationProfileId: profile.id,
            tokenHmac,
            userAuthVersion: actor.authVersion,
            roleAtIssue: actor.role,
            captureContext,
            issuedStage: profile.stage,
            electionDate: profile.electionDate,
            votingStartDate: profile.votingStartDate,
            votingEndDate: profile.votingEndDate,
            electionWindowSha256,
            issuedAt: now,
            expiresAt,
            allowedPlaces: {
              create: places.map((place) => ({
                tenantId: user.tenantId,
                puestoId: place.id,
                expectedTables: place.expectedTables!,
                sourceReleaseIdAtIssue: place.sourceReleaseId,
                sourceLocationCodeAtIssue: place.sourceLocationCode,
                votingDateAtIssue: place.votingDate,
                timeZoneAtIssue: place.timeZone,
              })),
            },
          },
          select: { id: true },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: user.userId,
            action: 'E14_OFFLINE_CAPTURE_GRANT_PROVISIONED',
            resourceType: 'OfflineE14CaptureGrant',
            resourceId: grant.id,
            metadata: {
              captureContext,
              issuedStage: profile.stage,
              issuedAt: now.toISOString(),
              expiresAt: expiresAt.toISOString(),
              electionWindowSha256,
              votingStartDate: toStoredDateOnlyKey(profile.votingStartDate),
              votingEndDate: toStoredDateOnlyKey(profile.votingEndDate),
              pollingPlaceCount: places.length,
            },
          },
        });

        return {
          schemaVersion: 3 as const,
          captureGrant: token,
          captureContext,
          issuedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          electionDate: toStoredDateOnlyKey(profile.electionDate),
          votingStartDate: toStoredDateOnlyKey(profile.votingStartDate),
          votingEndDate: toStoredDateOnlyKey(profile.votingEndDate),
          electionWindowSha256,
          places: places.map((place) => ({
            id: place.id,
            code: place.code,
            name: place.name,
            expectedTables: place.expectedTables!,
            sourceLocationCode: place.sourceLocationCode,
            votingDate: place.votingDate
              ? toStoredDateOnlyKey(place.votingDate)
              : null,
            timeZone: place.timeZone,
            address: place.address,
            commune: place.commune,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return response;
  }

  async revoke(user: AuthenticatedUser): Promise<{ revoked: number }> {
    const now = new Date();
    return this.prisma.$transaction(
      async (transaction) => {
        await resolveTerritorialAccess({
          client: transaction,
          tenantId: user.tenantId,
          userId: user.userId,
          allowedRoles: GRANT_ROLES,
          territoriallyScopedRoles: TERRITORIALLY_SCOPED_GRANT_ROLES,
        });
        const revoked = await transaction.offlineE14CaptureGrant.updateMany({
          where: {
            tenantId: user.tenantId,
            actorUserId: user.userId,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { revokedAt: now },
        });
        return { revoked: revoked.count };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async resolveForSync(
    transaction: GrantTransaction,
    input: {
      tenantId: string;
      actorUserId: string;
      captureGrant: string;
    },
  ): Promise<ResolvedOfflineE14Grant> {
    if (!TOKEN_PATTERN.test(input.captureGrant)) {
      throw this.invalidGrant();
    }
    const tokenHmac = this.digestToken(input.captureGrant);
    const rows = await transaction.$queryRaw<LockedGrantRow[]>(
      Prisma.sql`
        SELECT
          "id", "tenantId", "actorUserId", "operationProfileId",
          "tokenHmac", "userAuthVersion", "roleAtIssue", "captureContext",
          "issuedStage", "electionDate", "votingStartDate", "votingEndDate",
          "electionWindowSha256", "issuedAt", "expiresAt", "revokedAt"
        FROM "OfflineE14CaptureGrant"
        WHERE "tenantId" = ${input.tenantId}
          AND "tokenHmac" = ${tokenHmac}
        FOR UPDATE
      `,
    );
    const grant = rows[0];
    if (
      !grant ||
      grant.actorUserId !== input.actorUserId ||
      !this.safeHmacEquals(grant.tokenHmac, tokenHmac)
    ) {
      throw this.invalidGrant();
    }
    if (
      grant.captureContext !== WitnessCaptureContext.SIMULATION &&
      grant.captureContext !== WitnessCaptureContext.REAL
    ) {
      throw this.invalidGrant();
    }
    return {
      grantId: grant.id,
      tokenHmac: grant.tokenHmac,
      captureContext: grant.captureContext,
      actorUserId: grant.actorUserId,
      operationProfileId: grant.operationProfileId,
      userAuthVersion: grant.userAuthVersion,
      roleAtIssue: grant.roleAtIssue,
      electionDate: grant.electionDate,
      votingStartDate: grant.votingStartDate,
      votingEndDate: grant.votingEndDate,
      electionWindowSha256: grant.electionWindowSha256,
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
      revokedAt: grant.revokedAt,
    };
  }

  async assertUsableForMutation(
    transaction: GrantTransaction,
    grant: ResolvedOfflineE14Grant,
    input: {
      tenantId: string;
      actorUserId: string;
      capturedAt: Date;
      receivedAt: Date;
      puestoId: string;
      mesa: number;
    },
  ): Promise<void> {
    if (!Number.isFinite(input.capturedAt.getTime())) {
      throw new ConflictException({
        code: 'E14_OFFLINE_CAPTURE_TIME_INVALID',
        message: 'La hora declarada de captura no es valida',
      });
    }
    if (
      grant.actorUserId !== input.actorUserId ||
      !grant.operationProfileId ||
      !grant.tokenHmac
    ) {
      throw this.invalidGrant();
    }
    if (grant.revokedAt) {
      throw new ConflictException({
        code: 'E14_OFFLINE_GRANT_REVOKED',
        message: 'La capacidad offline fue revocada; la evidencia sigue local',
      });
    }
    if (grant.expiresAt.getTime() <= input.receivedAt.getTime()) {
      throw new ConflictException({
        code: 'E14_OFFLINE_GRANT_EXPIRED',
        message: 'La capacidad offline vencio; la evidencia sigue local',
      });
    }
    if (
      input.capturedAt.getTime() <
        grant.issuedAt.getTime() - CAPTURE_CLOCK_SKEW_MS ||
      input.capturedAt.getTime() > grant.expiresAt.getTime() ||
      input.capturedAt.getTime() >
        input.receivedAt.getTime() + CAPTURE_CLOCK_SKEW_MS
    ) {
      throw new ConflictException({
        code: 'E14_OFFLINE_CAPTURE_TIME_OUTSIDE_GRANT',
        message:
          'La hora declarada de captura no esta dentro de la vigencia autorizada',
      });
    }

    const profiles = await transaction.$queryRaw<LockedProfileRow[]>(
      Prisma.sql`
        SELECT
          "id", "stage", "electionDate", "votingStartDate",
          "votingEndDate", "votingWindowSourceUrl",
          "votingWindowReference"
        FROM "OperationProfile"
        WHERE "tenantId" = ${input.tenantId}
        FOR SHARE
      `,
    );
    const profile = profiles[0];
    if (
      !profile ||
      profile.id !== grant.operationProfileId ||
      toStoredDateOnlyKey(profile.electionDate) !==
        toStoredDateOnlyKey(grant.electionDate) ||
      toStoredDateOnlyKey(profile.votingStartDate) !==
        toStoredDateOnlyKey(grant.votingStartDate) ||
      toStoredDateOnlyKey(profile.votingEndDate) !==
        toStoredDateOnlyKey(grant.votingEndDate) ||
      !this.safeHmacEquals(
        electionOperatingWindowSha256({
          tenantId: input.tenantId,
          operationProfileId: profile.id,
          electionDate: profile.electionDate,
          votingStartDate: profile.votingStartDate,
          votingEndDate: profile.votingEndDate,
          votingWindowSourceUrl: profile.votingWindowSourceUrl,
          votingWindowReference: profile.votingWindowReference,
        }),
        grant.electionWindowSha256,
      )
    ) {
      throw new ConflictException({
        code: 'E14_OFFLINE_ELECTION_CHANGED',
        message:
          'El perfil o la ventana electoral cambiaron; la evidencia sigue local',
      });
    }
    this.assertStageStillAcceptsGrant(grant.captureContext, profile.stage);
    if (
      grant.captureContext === WitnessCaptureContext.REAL &&
      (!isWithinElectionOperatingWindow(
        input.receivedAt,
        grant.votingStartDate,
        grant.votingEndDate,
      ) ||
        !isWithinElectionOperatingWindow(
          input.capturedAt,
          grant.votingStartDate,
          grant.votingEndDate,
        ))
    ) {
      throw new ConflictException({
        code: 'E14_OFFLINE_REAL_OUTSIDE_VOTING_WINDOW',
        message:
          'La captura REAL y su recepcion deben ocurrir dentro de la ventana electoral documentada; la evidencia sigue local',
      });
    }

    const actor = await transaction.user.findFirst({
      where: {
        id: input.actorUserId,
        tenantId: input.tenantId,
        isActive: true,
      },
      select: { authVersion: true, role: true },
    });
    if (
      !actor ||
      actor.authVersion !== grant.userAuthVersion ||
      actor.role !== grant.roleAtIssue ||
      !GRANT_ROLES.includes(actor.role as (typeof GRANT_ROLES)[number])
    ) {
      throw new ForbiddenException(
        'La identidad o el rol vigente ya no corresponden a la capacidad offline',
      );
    }
    const access = await resolveTerritorialAccess({
      client: transaction,
      tenantId: input.tenantId,
      userId: input.actorUserId,
      allowedRoles: GRANT_ROLES,
      territoriallyScopedRoles: TERRITORIALLY_SCOPED_GRANT_ROLES,
    });
    if (
      access.divisionIds !== null &&
      !access.divisionIds.includes(input.puestoId)
    ) {
      throw new ConflictException({
        code: 'E14_OFFLINE_TERRITORY_CHANGED',
        message:
          'El puesto ya no pertenece al alcance territorial vigente; la evidencia sigue local',
      });
    }
    const [grantedPlace, currentPlace] = await Promise.all([
      transaction.offlineE14CaptureGrantPlace.findUnique({
        where: {
          tenantId_grantId_puestoId: {
            tenantId: input.tenantId,
            grantId: grant.grantId,
            puestoId: input.puestoId,
          },
        },
        select: {
          expectedTables: true,
          sourceReleaseIdAtIssue: true,
          sourceLocationCodeAtIssue: true,
          votingDateAtIssue: true,
          timeZoneAtIssue: true,
        },
      }),
      transaction.politicalDivision.findFirst({
        where: {
          id: input.puestoId,
          tenantId: input.tenantId,
          type: DivisionType.PUESTO,
          isActive: true,
          expectedTables: { gt: 0 },
        },
        select: {
          expectedTables: true,
          sourceReleaseId: true,
          sourceLocationCode: true,
          votingDate: true,
          timeZone: true,
        },
      }),
    ]);
    if (!grantedPlace || !currentPlace?.expectedTables) {
      throw new ConflictException({
        code: 'E14_OFFLINE_POLLING_PLACE_NOT_AUTHORIZED',
        message:
          'El puesto no esta disponible en la capacidad y el alcance vigentes',
      });
    }
    if (
      grantedPlace.sourceReleaseIdAtIssue !== currentPlace.sourceReleaseId ||
      grantedPlace.sourceLocationCodeAtIssue !==
        currentPlace.sourceLocationCode ||
      (grantedPlace.votingDateAtIssue
        ? toStoredDateOnlyKey(grantedPlace.votingDateAtIssue)
        : null) !==
        (currentPlace.votingDate
          ? toStoredDateOnlyKey(currentPlace.votingDate)
          : null) ||
      grantedPlace.timeZoneAtIssue !== currentPlace.timeZone
    ) {
      throw new ConflictException({
        code: 'E14_OFFLINE_POLLING_PLACE_CHANGED',
        message:
          'La fuente, jornada o zona horaria del puesto cambio desde el provisionamiento; la evidencia sigue local',
      });
    }
    if (grant.captureContext === WitnessCaptureContext.REAL) {
      const capturedStatus = pollingPlaceOperationalStatus(
        {
          votingDate: grantedPlace.votingDateAtIssue,
          timeZone: grantedPlace.timeZoneAtIssue,
        },
        input.capturedAt,
      );
      if (!capturedStatus.operationalNow) {
        throw new ConflictException({
          code:
            capturedStatus.code === 'TIME_ZONE_NOT_VERIFIED'
              ? 'E14_OFFLINE_POLLING_PLACE_TIME_ZONE_NOT_VERIFIED'
              : capturedStatus.code === 'VOTING_DATE_NOT_DOCUMENTED'
                ? 'E14_OFFLINE_POLLING_PLACE_DATE_NOT_DOCUMENTED'
                : 'E14_OFFLINE_CAPTURE_OUTSIDE_POLLING_PLACE_DAY',
          message:
            'La captura REAL no coincide con la fecha local documentada del puesto; la evidencia sigue local',
        });
      }
    }
    if (
      input.mesa > grantedPlace.expectedTables ||
      input.mesa > currentPlace.expectedTables
    ) {
      throw new ConflictException({
        code: 'E14_OFFLINE_TABLE_NOT_AUTHORIZED',
        message:
          'La mesa supera el limite autorizado al provisionar o el limite vigente',
      });
    }
  }

  async markUsed(
    transaction: GrantTransaction,
    tenantId: string,
    grantId: string,
    usedAt: Date,
  ): Promise<void> {
    const updated = await transaction.offlineE14CaptureGrant.updateMany({
      where: { id: grantId, tenantId, revokedAt: null },
      data: { lastUsedAt: usedAt },
    });
    if (updated.count !== 1) throw this.invalidGrant();
  }

  private captureContextForProvision(
    profile: LockedProfileRow,
    now: Date,
  ): Extract<WitnessCaptureContext, 'SIMULATION' | 'REAL'> {
    if (profile.stage === PoliticalOperationStage.SIMULATION) {
      return WitnessCaptureContext.SIMULATION;
    }
    if (profile.stage === PoliticalOperationStage.ELECTION_DAY) {
      if (
        !isWithinElectionOperatingWindow(
          now,
          profile.votingStartDate,
          profile.votingEndDate,
        )
      ) {
        throw new ConflictException({
          code: 'E14_OFFLINE_VOTING_WINDOW_NOT_ACTIVE',
          message:
            'La capacidad real solo puede provisionarse dentro de la ventana electoral civil de Bogota',
        });
      }
      return WitnessCaptureContext.REAL;
    }
    throw new ConflictException({
      code: 'E14_OFFLINE_GRANT_STAGE_NOT_ALLOWED',
      message: `La captura E-14 offline no puede provisionarse durante ${profile.stage}`,
    });
  }

  private assertStageStillAcceptsGrant(
    captureContext: WitnessCaptureContext,
    currentStage: PoliticalOperationStage,
  ): void {
    if (currentStage === PoliticalOperationStage.CLOSED) {
      throw new ConflictException({
        code: 'OPERATION_CLOSED',
        message: 'La operacion cerrada no admite sincronizaciones E-14',
      });
    }
    const accepted: readonly PoliticalOperationStage[] =
      captureContext === WitnessCaptureContext.SIMULATION
        ? [
            PoliticalOperationStage.SIMULATION,
            PoliticalOperationStage.ELECTION_DAY,
            PoliticalOperationStage.POST_ELECTION,
          ]
        : captureContext === WitnessCaptureContext.REAL
          ? [
              PoliticalOperationStage.ELECTION_DAY,
              PoliticalOperationStage.POST_ELECTION,
            ]
          : [];
    if (!accepted.includes(currentStage)) {
      throw new ConflictException({
        code: 'E14_OFFLINE_STAGE_TRANSITION_REJECTED',
        message:
          'La etapa vigente no admite esta capacidad; la evidencia sigue local',
      });
    }
  }

  private digestToken(token: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update('offline-e14-capture-grant\0', 'utf8')
      .update(token, 'utf8')
      .digest('hex');
  }

  private safeHmacEquals(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left, 'hex');
    const rightBytes = Buffer.from(right, 'hex');
    return (
      leftBytes.length === 32 &&
      rightBytes.length === 32 &&
      timingSafeEqual(leftBytes, rightBytes)
    );
  }

  private invalidGrant(): ConflictException {
    return new ConflictException({
      code: 'E14_OFFLINE_GRANT_INVALID',
      message: 'La capacidad offline no es valida o no pertenece a la sesion',
    });
  }
}
