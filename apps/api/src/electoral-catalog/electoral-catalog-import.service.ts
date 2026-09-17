import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AuditActorType,
  ElectoralCatalogImportStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import {
  lockAndAssertOperationOpen,
  OperationClosedForMutationException,
} from '../common/utils/operation-lifecycle-fence.util';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { PrismaService } from '../prisma/prisma.service';
import { ElectoralCatalogArtifactService } from './electoral-catalog-artifact.service';
import {
  ELECTORAL_CATALOG_QUEUE_PORT,
  type ElectoralCatalogQueuePort,
} from './electoral-catalog-queue.constants';
import { ElectoralCatalogService } from './electoral-catalog.service';
import {
  CreateElectoralCatalogImportDto,
  ListElectoralCatalogImportsQueryDto,
} from './dto/electoral-catalog-import.dto';
import { RNEC_CATALOG_MAX_CONTENT_BYTES } from './rnec-divipole-tree.parser';

const IMPORT_RESOURCE_TYPE = 'ElectoralCatalogImportJob';
const IMPORT_REVIEW_ROLES = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

const IMPORT_SELECT = {
  id: true,
  tenantId: true,
  clientRequestId: true,
  status: true,
  catalogKey: true,
  sourceUrl: true,
  sourceDataset: true,
  sourceCutoffAt: true,
  electionDate: true,
  authorizationReference: true,
  licenseDeclaration: true,
  sourceArtifactPath: true,
  expectedContentSha256: true,
  requestedById: true,
  releaseId: true,
  attempts: true,
  startedAt: true,
  completedAt: true,
  lastErrorCode: true,
  lastErrorMessage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ElectoralCatalogImportJobSelect;

const PROCESS_SELECT = {
  ...IMPORT_SELECT,
  payloadSha256: true,
} satisfies Prisma.ElectoralCatalogImportJobSelect;

type ProcessImport = Prisma.ElectoralCatalogImportJobGetPayload<{
  select: typeof PROCESS_SELECT;
}>;

@Injectable()
export class ElectoralCatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogs: ElectoralCatalogService,
    private readonly artifacts: ElectoralCatalogArtifactService,
    @Inject(ELECTORAL_CATALOG_QUEUE_PORT)
    private readonly queue: ElectoralCatalogQueuePort,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateElectoralCatalogImportDto) {
    const normalized = this.catalogs.validateRnecStageMetadata(user.tenantId, {
      ...dto,
      sourceArtifactPath: dto.sourceArtifactPath,
    });
    if (
      !normalized.sourceCutoffAt ||
      !normalized.authorizationReference ||
      !normalized.licenseDeclaration ||
      !normalized.sourceArtifactPath
    ) {
      throw new BadRequestException(
        'La ingesta exige fecha de corte, autorizacion, licencia y artefacto confirmado',
      );
    }
    const sourceCutoffAt = normalized.sourceCutoffAt;
    const authorizationReference = normalized.authorizationReference;
    const licenseDeclaration = normalized.licenseDeclaration;
    const sourceArtifactPath = normalized.sourceArtifactPath;
    const payloadSha256 = this.payloadSha256({
      clientRequestId: dto.clientRequestId,
      catalogKey: normalized.catalogKey,
      sourceUrl: normalized.sourceUrl,
      sourceDataset: normalized.sourceDataset,
      sourceCutoffAt: sourceCutoffAt.toISOString(),
      electionDate: this.storedDateKey(normalized.electionDate),
      authorizationReference,
      licenseDeclaration,
      sourceArtifactPath,
      expectedContentSha256: dto.expectedContentSha256,
    });

    let result: { job: ProcessImport; created: boolean };
    try {
      result = await this.prisma.$transaction(async (transaction) => {
        await lockAndAssertOperationOpen(transaction, user.tenantId);
        const actor = await this.requireActiveActor(transaction, user, [
          Role.ADMIN,
        ]);
        const existing = await transaction.electoralCatalogImportJob.findFirst({
          where: {
            tenantId: user.tenantId,
            clientRequestId: dto.clientRequestId,
          },
          select: PROCESS_SELECT,
        });
        if (existing) {
          this.assertIdempotentPayload(existing, payloadSha256);
          return { job: existing, created: false };
        }

        const profile = await transaction.operationProfile.findUnique({
          where: { tenantId: user.tenantId },
          select: { electionDate: true },
        });
        if (
          profile &&
          this.bogotaDateKey(profile.electionDate) !==
            this.storedDateKey(normalized.electionDate)
        ) {
          throw new ConflictException(
            'La fecha del artefacto electoral no coincide con el perfil operativo',
          );
        }

        const stored = await transaction.storedObject.findFirst({
          where: {
            tenantId: user.tenantId,
            uploaderId: actor.id,
            path: sourceArtifactPath,
            module: StorageObjectModule.ELECTORAL_CATALOG,
            status: StoredObjectStatus.CONFIRMED,
            consumedAt: null,
          },
          select: {
            id: true,
            contentType: true,
            expectedSize: true,
            actualSize: true,
          },
        });
        if (
          !stored ||
          stored.contentType !== 'application/json' ||
          stored.actualSize === null ||
          stored.actualSize !== stored.expectedSize ||
          stored.actualSize > RNEC_CATALOG_MAX_CONTENT_BYTES
        ) {
          throw new BadRequestException(
            'El artefacto debe estar confirmado como JSON, pertenecer al solicitante y respetar el limite permitido',
          );
        }

        const created = await transaction.electoralCatalogImportJob.create({
          data: {
            tenantId: user.tenantId,
            clientRequestId: dto.clientRequestId,
            payloadSha256,
            catalogKey: normalized.catalogKey,
            sourceUrl: normalized.sourceUrl,
            sourceDataset: normalized.sourceDataset,
            sourceCutoffAt,
            electionDate: normalized.electionDate,
            authorizationReference,
            licenseDeclaration,
            sourceArtifactPath,
            expectedContentSha256: dto.expectedContentSha256,
            requestedById: actor.id,
          },
          select: PROCESS_SELECT,
        });
        await consumeConfirmedStorageUpload(
          transaction,
          user.tenantId,
          sourceArtifactPath,
          StorageObjectModule.ELECTORAL_CATALOG,
          IMPORT_RESOURCE_TYPE,
          created.id,
          actor.id,
        );
        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: actor.id,
            action: 'ELECTORAL_CATALOG_IMPORT_REQUESTED',
            resourceType: IMPORT_RESOURCE_TYPE,
            resourceId: created.id,
            after: {
              status: created.status,
              catalogKey: created.catalogKey,
              electionDate: this.storedDateKey(created.electionDate),
              expectedContentSha256: created.expectedContentSha256,
            },
            metadata: { storedObjectId: stored.id },
          },
        });
        return { job: created, created: true };
      }, this.serializableTransaction());
    } catch (error: unknown) {
      if (!this.isPrismaError(error, 'P2002')) throw error;
      const existing = await this.prisma.electoralCatalogImportJob.findFirst({
        where: {
          tenantId: user.tenantId,
          clientRequestId: dto.clientRequestId,
        },
        select: PROCESS_SELECT,
      });
      if (!existing) {
        throw new ConflictException(
          'La solicitud de ingesta cambio durante su creacion; reintenta',
        );
      }
      this.assertIdempotentPayload(existing, payloadSha256);
      result = { job: existing, created: false };
    }

    const job = result.job;
    const queued = job.status !== ElectoralCatalogImportStatus.SUCCEEDED;
    if (queued) {
      await this.queue.enqueue({
        importJobId: job.id,
        tenantId: user.tenantId,
      });
    }
    return { job: this.present(job), created: result.created, queued };
  }

  async list(
    user: AuthenticatedUser,
    query: ListElectoralCatalogImportsQueryDto,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.requireActiveActor(transaction, user, IMPORT_REVIEW_ROLES);
        return transaction.electoralCatalogImportJob.findMany({
          where: {
            tenantId: user.tenantId,
            ...(query.status ? { status: query.status } : {}),
          },
          select: IMPORT_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.limit ?? 25,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async detail(user: AuthenticatedUser, importJobId: string) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.requireActiveActor(transaction, user, IMPORT_REVIEW_ROLES);
        const job = await transaction.electoralCatalogImportJob.findFirst({
          where: { id: importJobId, tenantId: user.tenantId },
          select: IMPORT_SELECT,
        });
        if (!job)
          throw new NotFoundException('Ingesta electoral no encontrada');
        return job;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async retry(user: AuthenticatedUser, importJobId: string) {
    const job = await this.prisma.$transaction(async (transaction) => {
      await lockAndAssertOperationOpen(transaction, user.tenantId);
      const actor = await this.requireActiveActor(transaction, user, [
        Role.ADMIN,
      ]);
      const current = await transaction.electoralCatalogImportJob.findFirst({
        where: { id: importJobId, tenantId: user.tenantId },
        select: PROCESS_SELECT,
      });
      if (!current)
        throw new NotFoundException('Ingesta electoral no encontrada');
      if (current.status === ElectoralCatalogImportStatus.SUCCEEDED) {
        return current;
      }
      if (current.status === ElectoralCatalogImportStatus.PROCESSING) {
        throw new ConflictException('La ingesta electoral ya esta en proceso');
      }
      if (current.status === ElectoralCatalogImportStatus.QUEUED)
        return current;

      const transition = await transaction.electoralCatalogImportJob.updateMany(
        {
          where: {
            id: current.id,
            tenantId: user.tenantId,
            status: ElectoralCatalogImportStatus.FAILED,
            attempts: current.attempts,
          },
          data: {
            status: ElectoralCatalogImportStatus.QUEUED,
            startedAt: null,
            completedAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        },
      );
      if (transition.count !== 1) {
        throw new ConflictException(
          'La ingesta cambio durante el reintento; recarga su estado',
        );
      }
      await transaction.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          actorType: AuditActorType.USER,
          actorUserId: actor.id,
          action: 'ELECTORAL_CATALOG_IMPORT_REQUEUED',
          resourceType: IMPORT_RESOURCE_TYPE,
          resourceId: current.id,
          before: { status: current.status, attempts: current.attempts },
          after: {
            status: ElectoralCatalogImportStatus.QUEUED,
            attempts: current.attempts,
          },
        },
      });
      return {
        ...current,
        status: ElectoralCatalogImportStatus.QUEUED,
        startedAt: null,
        completedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      };
    }, this.serializableTransaction());

    if (job.status !== ElectoralCatalogImportStatus.SUCCEEDED) {
      await this.queue.enqueue({
        importJobId: job.id,
        tenantId: user.tenantId,
      });
    }
    return {
      job: this.present(job as ProcessImport),
      queued: job.status !== ElectoralCatalogImportStatus.SUCCEEDED,
      noOp: job.status === ElectoralCatalogImportStatus.SUCCEEDED,
    };
  }

  async process(importJobId: string, tenantId: string) {
    const observed = await this.prisma.electoralCatalogImportJob.findFirst({
      where: { id: importJobId, tenantId },
      select: PROCESS_SELECT,
    });
    if (!observed) throw new Error('Ingesta electoral durable no encontrada');
    if (observed.status === ElectoralCatalogImportStatus.SUCCEEDED) {
      return { releaseId: observed.releaseId, noOp: true };
    }

    const claim = await this.prisma.$transaction(async (transaction) => {
      // This is deliberately the first database operation in the claim. A
      // close that wins the same tenant lock leaves the durable job untouched.
      await lockAndAssertOperationOpen(transaction, tenantId);
      const current = await transaction.electoralCatalogImportJob.findFirst({
        where: { id: importJobId, tenantId },
        select: PROCESS_SELECT,
      });
      if (!current) throw new Error('Ingesta electoral durable no encontrada');
      if (current.status === ElectoralCatalogImportStatus.SUCCEEDED) {
        return { current, attempt: null };
      }

      const attempt = current.attempts + 1;
      const claimed = await transaction.electoralCatalogImportJob.updateMany({
        where: {
          id: current.id,
          tenantId,
          status: current.status,
          attempts: current.attempts,
        },
        data: {
          status: ElectoralCatalogImportStatus.PROCESSING,
          attempts: attempt,
          startedAt: new Date(),
          completedAt: null,
          releaseId: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (claimed.count !== 1) {
        throw new Error('Otra ejecucion reclamo la ingesta electoral');
      }
      return { current, attempt };
    }, this.serializableTransaction());
    if (claim.attempt === null) {
      return { releaseId: claim.current.releaseId, noOp: true };
    }
    const { current, attempt } = claim;

    try {
      const activeRequester = await this.prisma.user.findFirst({
        where: {
          id: current.requestedById,
          tenantId,
          role: Role.ADMIN,
          isActive: true,
        },
        select: { id: true },
      });
      if (!activeRequester) {
        throw new ForbiddenException(
          'La persona solicitante ya no es administradora activa',
        );
      }
      const stored = await this.prisma.storedObject.findFirst({
        where: {
          tenantId,
          path: current.sourceArtifactPath,
          module: StorageObjectModule.ELECTORAL_CATALOG,
          status: StoredObjectStatus.CONSUMED,
          consumedByType: IMPORT_RESOURCE_TYPE,
          consumedById: current.id,
        },
        select: { actualSize: true, contentType: true },
      });
      if (
        !stored?.actualSize ||
        stored.contentType !== 'application/json' ||
        stored.actualSize > RNEC_CATALOG_MAX_CONTENT_BYTES
      ) {
        throw new BadRequestException(
          'El recibo durable del artefacto electoral no es valido',
        );
      }
      const content = await this.artifacts.loadVerifiedJson(
        current.sourceArtifactPath,
        stored.actualSize,
        current.expectedContentSha256,
      );
      const staged = await this.catalogs.stageRnecTreeContent(
        {
          userId: current.requestedById,
          tenantId,
          role: Role.ADMIN,
        },
        {
          catalogKey: current.catalogKey,
          sourceUrl: current.sourceUrl,
          sourceDataset: current.sourceDataset,
          sourceCutoffAt: current.sourceCutoffAt,
          electionDate: current.electionDate,
          authorizationReference: current.authorizationReference,
          licenseDeclaration: current.licenseDeclaration,
          sourceArtifactPath: current.sourceArtifactPath,
        },
        content,
      );

      await this.prisma.$transaction(async (transaction) => {
        const transition =
          await transaction.electoralCatalogImportJob.updateMany({
            where: {
              id: current.id,
              tenantId,
              status: ElectoralCatalogImportStatus.PROCESSING,
              attempts: attempt,
            },
            data: {
              status: ElectoralCatalogImportStatus.SUCCEEDED,
              releaseId: staged.release.id,
              completedAt: new Date(),
            },
          });
        if (transition.count !== 1) {
          throw new ConflictException(
            'La ingesta cambio antes de registrar su resultado',
          );
        }
        await transaction.auditEvent.create({
          data: {
            tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.SYSTEM,
            actorUserId: null,
            action: 'ELECTORAL_CATALOG_IMPORT_SUCCEEDED',
            resourceType: IMPORT_RESOURCE_TYPE,
            resourceId: current.id,
            before: {
              status: ElectoralCatalogImportStatus.PROCESSING,
              attempts: attempt,
            },
            after: {
              status: ElectoralCatalogImportStatus.SUCCEEDED,
              releaseId: staged.release.id,
            },
            metadata: { createdRelease: staged.created },
          },
        });
      }, this.serializableTransaction());
      return { releaseId: staged.release.id, noOp: !staged.created };
    } catch (error: unknown) {
      const failure = this.safeFailure(error);
      await this.recordFailure(current, attempt, failure);
      throw new Error(failure.message);
    }
  }

  private async recordFailure(
    current: ProcessImport,
    attempt: number,
    failure: { code: string; message: string },
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const transition =
          await transaction.electoralCatalogImportJob.updateMany({
            where: {
              id: current.id,
              tenantId: current.tenantId,
              status: ElectoralCatalogImportStatus.PROCESSING,
              attempts: attempt,
            },
            data: {
              status: ElectoralCatalogImportStatus.FAILED,
              completedAt: new Date(),
              releaseId: null,
              lastErrorCode: failure.code,
              lastErrorMessage: failure.message,
            },
          });
        if (transition.count !== 1) return;
        await transaction.auditEvent.create({
          data: {
            tenantId: current.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.SYSTEM,
            actorUserId: null,
            action: 'ELECTORAL_CATALOG_IMPORT_FAILED',
            resourceType: IMPORT_RESOURCE_TYPE,
            resourceId: current.id,
            before: {
              status: ElectoralCatalogImportStatus.PROCESSING,
              attempts: attempt,
            },
            after: {
              status: ElectoralCatalogImportStatus.FAILED,
              errorCode: failure.code,
            },
          },
        });
      }, this.serializableTransaction());
    } catch {
      // BullMQ conserva el fallo y reintentara. Nunca se reemplaza el error
      // seguro original por detalles internos de una segunda falla de escritura.
    }
  }

  private async requireActiveActor(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    roles: readonly Role[],
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
          role: { in: [...roles] },
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!actor) {
      throw new ForbiddenException(
        'La cuenta vigente no puede administrar esta ingesta electoral',
      );
    }
    return actor;
  }

  private assertIdempotentPayload(
    existing: Pick<ProcessImport, 'payloadSha256'>,
    expected: string,
  ): void {
    if (existing.payloadSha256 !== expected) {
      throw new ConflictException(
        'clientRequestId ya identifica una ingesta con un payload diferente',
      );
    }
  }

  private payloadSha256(value: Record<string, unknown>): string {
    return createHash('sha256')
      .update(JSON.stringify({ version: 1, ...value }), 'utf8')
      .digest('hex');
  }

  private present(job: ProcessImport): Omit<ProcessImport, 'payloadSha256'> {
    const presented: Partial<ProcessImport> = { ...job };
    delete presented.payloadSha256;
    return presented as Omit<ProcessImport, 'payloadSha256'>;
  }

  private safeFailure(error: unknown): { code: string; message: string } {
    if (error instanceof OperationClosedForMutationException) {
      return {
        code: 'OPERATION_CLOSED',
        message:
          'La ingesta se detuvo porque la operacion fue cerrada antes de materializar el catalogo',
      };
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const response = error.getResponse();
      const rawMessage =
        typeof response === 'string'
          ? response
          : typeof response === 'object' &&
              response !== null &&
              'message' in response &&
              typeof response.message === 'string'
            ? response.message
            : 'La ingesta electoral fue rechazada';
      return {
        code: `HTTP_${status}`,
        message: rawMessage.slice(0, 1000),
      };
    }
    return {
      code: 'CATALOG_IMPORT_INTERNAL_ERROR',
      message:
        'La ingesta electoral fallo sin exponer detalles internos; revisa la configuracion y reintenta',
    };
  }

  private serializableTransaction() {
    return {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    } as const;
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }

  private storedDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private bogotaDateKey(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${value.year}-${value.month}-${value.day}`;
  }
}
