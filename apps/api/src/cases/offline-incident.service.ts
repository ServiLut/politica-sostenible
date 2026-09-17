import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AuditActorType,
  CommunicationChannel,
  OfflineSyncOperationType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { OfflineSyncService } from '../common/services/offline-sync.service';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  OfflineIncidentCategory,
  SyncOfflineIncidentDto,
} from './dto/sync-offline-incident.dto';
import { offlineIncidentSha256 } from './offline-incident.hash';

const INCIDENT_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
  Role.WITNESS,
] as const;
const SCOPED_ROLES = [
  Role.ZONE_COORDINATOR,
  Role.VOLUNTEER,
  Role.WITNESS,
] as const;
const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 15_000,
} as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

type IncidentContext = Awaited<ReturnType<typeof resolveTerritorialAccess>> & {
  stage: PoliticalOperationStage;
};

@Injectable()
export class OfflineIncidentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offlineSync: OfflineSyncService,
  ) {}

  async getCaptureContext(user: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const access = await this.requireContext(transaction, user, false);
      const where: Prisma.PoliticalDivisionWhereInput = {
        tenantId: user.tenantId,
        isActive: true,
        ...(access.divisionIds ? { id: { in: access.divisionIds } } : {}),
      };
      const territories = await transaction.politicalDivision.findMany({
        where,
        select: { id: true, code: true, name: true, type: true },
        orderBy: [{ type: 'asc' }, { code: 'asc' }, { name: 'asc' }],
        take: 2_000,
      });
      return {
        schemaVersion: 1 as const,
        provisionedAt: new Date().toISOString(),
        stage: access.stage,
        requiresTerritory: access.divisionIds !== null,
        categories: Object.values(OfflineIncidentCategory),
        priorities: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const,
        territories,
      };
    });
  }

  sync(user: AuthenticatedUser, dto: SyncOfflineIncidentDto) {
    const normalized = this.normalize(dto);
    const calculatedSha256 = offlineIncidentSha256(normalized);
    if (!this.hashMatches(dto.payloadSha256, calculatedSha256)) {
      throw new BadRequestException({
        code: 'OFFLINE_INCIDENT_HASH_MISMATCH',
        message: 'El contenido no coincide con su huella SHA-256',
      });
    }
    const descriptor = this.offlineSync.prepare(
      OfflineSyncOperationType.INCIDENT_REPORT,
      normalized.clientOperationId,
      normalized.capturedAt,
      {
        category: normalized.category,
        priority: normalized.priority,
        title: normalized.title,
        description: normalized.description,
        occurredOn: normalized.occurredOn,
        divisionId: normalized.divisionId ?? null,
        payloadSha256: calculatedSha256,
      },
    );

    const execute = () =>
      this.prisma.$transaction(async (transaction) => {
        const context = await this.requireContext(transaction, user, true);
        await this.assertTerritory(
          transaction,
          user.tenantId,
          normalized.divisionId,
          context,
        );

        const duplicate = await this.offlineSync.lockAndFindDuplicate(
          transaction,
          user.tenantId,
          user.userId,
          descriptor,
        );
        if (duplicate) {
          return {
            ...this.offlineSync.present(duplicate, 'DUPLICATE'),
            payloadSha256: calculatedSha256,
          };
        }

        const now = new Date();
        const issueCaseId = randomUUID();
        const reference = this.reference(now);
        await transaction.issueCase.create({
          data: {
            id: issueCaseId,
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            reference,
            title: normalized.title,
            description: normalized.description,
            category: `INCIDENT_${normalized.category}`,
            sourceChannel: CommunicationChannel.INTERNAL,
            priority: normalized.priority,
            divisionId: normalized.divisionId,
            createdById: user.userId,
            confidential: true,
            occurredOn: this.civilDate(normalized.occurredOn),
          },
          select: { id: true },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: user.userId,
            action: 'OFFLINE_INCIDENT_REPORTED',
            resourceType: 'IssueCase',
            resourceId: issueCaseId,
            metadata: {
              clientOperationId: normalized.clientOperationId,
              payloadSha256: calculatedSha256,
              category: normalized.category,
              priority: normalized.priority,
              occurredOn: normalized.occurredOn,
              divisionId: normalized.divisionId ?? null,
            },
          },
        });
        const receipt = await this.offlineSync.createReceipt(
          transaction,
          user.tenantId,
          user.userId,
          descriptor,
          'IssueCase',
          issueCaseId,
          now,
          calculatedSha256,
        );
        return {
          ...this.offlineSync.present(receipt, 'APPLIED'),
          payloadSha256: calculatedSha256,
        };
      }, SERIALIZABLE);

    return execute().catch(async (error: unknown) => {
      if (this.isPrismaError(error, 'P2002')) return execute();
      if (this.isPrismaError(error, 'P2034')) {
        try {
          return await execute();
        } catch (retryError) {
          if (this.isPrismaError(retryError, 'P2034')) {
            throw new ConflictException({
              code: 'OFFLINE_INCIDENT_CONCURRENT_CHANGE',
              message:
                'La operacion cambio durante la sincronizacion; reintente',
            });
          }
          throw retryError;
        }
      }
      throw error;
    });
  }

  private async requireContext(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    lockProfile: boolean,
  ): Promise<IncidentContext> {
    if (lockProfile) {
      await transaction.$queryRaw<Array<{ locked: boolean }>>(
        Prisma.sql`
          WITH offline_incident_lifecycle_lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`operation-profile-lifecycle:${user.tenantId}`}, 0)
            )
          )
          SELECT TRUE AS "locked" FROM offline_incident_lifecycle_lock
        `,
      );
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "OperationProfile" WHERE "tenantId" = ${user.tenantId} FOR UPDATE`,
      );
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Tenant" WHERE "id" = ${user.tenantId} FOR UPDATE`,
      );
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${user.userId} AND "tenantId" = ${user.tenantId} FOR UPDATE`,
      );
    }
    const [tenant, profile] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: { stage: true },
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!profile) {
      throw new ConflictException(
        'Configure el perfil operativo antes de reportar incidentes',
      );
    }
    if (profile.stage === PoliticalOperationStage.CLOSED) {
      throw new ConflictException({
        code: 'OPERATION_CLOSED',
        message: 'La operacion cerrada conserva los pendientes sin enviarlos',
      });
    }
    const access = await resolveTerritorialAccess({
      client: transaction,
      tenantId: user.tenantId,
      userId: user.userId,
      allowedRoles: INCIDENT_ROLES,
      territoriallyScopedRoles: SCOPED_ROLES,
    });
    return { ...access, stage: profile.stage };
  }

  private async assertTerritory(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    divisionId: string | undefined,
    context: IncidentContext,
  ) {
    if (context.divisionIds && !divisionId) {
      throw new ForbiddenException(
        'El rol territorial debe seleccionar un territorio autorizado',
      );
    }
    if (!divisionId) return;
    if (context.divisionIds && !context.divisionIds.includes(divisionId)) {
      throw new ForbiddenException(
        'El territorio no pertenece al alcance vigente del usuario',
      );
    }
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "PoliticalDivision" WHERE "id" = ${divisionId} AND "tenantId" = ${tenantId} FOR UPDATE`,
    );
    const division = await transaction.politicalDivision.findFirst({
      where: { id: divisionId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!division) {
      throw new ForbiddenException(
        'El territorio no existe o ya no esta vigente en la organizacion',
      );
    }
  }

  private normalize(dto: SyncOfflineIncidentDto): SyncOfflineIncidentDto {
    const capturedAt = new Date(dto.capturedAt);
    if (Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException('capturedAt no es una fecha valida');
    }
    this.civilDate(dto.occurredOn);
    return {
      ...dto,
      clientOperationId: dto.clientOperationId.toLowerCase(),
      capturedAt: capturedAt.toISOString(),
      title: dto.title.trim(),
      description: dto.description.trim(),
      divisionId: dto.divisionId?.trim() || undefined,
      payloadSha256: dto.payloadSha256.toLowerCase(),
    };
  }

  private civilDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('occurredOn no es una fecha civil valida');
    }
    const today = this.bogotaCivilDate(new Date());
    if (value > today) {
      throw new BadRequestException(
        'occurredOn no puede ser posterior a la fecha civil actual',
      );
    }
    return date;
  }

  private bogotaCivilDate(value: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: 'year' | 'month' | 'day') =>
      parts.find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private reference(now: Date): string {
    return `INC-CAM-${now.getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  }

  private hashMatches(left: string, right: string): boolean {
    if (!SHA256_PATTERN.test(left) || !SHA256_PATTERN.test(right)) return false;
    return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
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
