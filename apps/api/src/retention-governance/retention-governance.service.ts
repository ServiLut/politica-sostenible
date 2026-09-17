import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  OperationClosureType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  RetentionDataScope,
  RetentionDispositionStatus,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  CancelRetentionDispositionDto,
  CreateRetentionDispositionDto,
  CreateRetentionLegalHoldDto,
  RetentionDispositionDecision,
  RevokeRetentionLegalHoldDto,
  ReviewRetentionDispositionDto,
} from './dto/retention-governance.dto';

const GOVERNANCE_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
const HOLD_CREATE_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

const PROFILE_SELECT = {
  id: true,
  tenantId: true,
  stage: true,
  closureType: true,
  electionDate: true,
  retentionPeriodDays: true,
  updatedAt: true,
} satisfies Prisma.OperationProfileSelect;

const DISPOSITION_SELECT = {
  id: true,
  tenantId: true,
  operationProfileId: true,
  clientRequestId: true,
  payloadSha256: true,
  previewSha256: true,
  profileSnapshotSha256: true,
  expectedProfileUpdatedAt: true,
  status: true,
  scope: true,
  cutoffAt: true,
  retentionDueAt: true,
  previewSnapshot: true,
  justification: true,
  legalReference: true,
  evidenceReference: true,
  evidenceSha256: true,
  legalPolicyRequiredAcknowledged: true,
  backupRestoreRequiredAcknowledged: true,
  executorUnavailableAcknowledged: true,
  requestedById: true,
  reviewedById: true,
  reviewedAt: true,
  reviewClientRequestId: true,
  reviewPayloadSha256: true,
  rejectionReason: true,
  cancelledById: true,
  cancelledAt: true,
  cancellationClientRequestId: true,
  cancellationPayloadSha256: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  requestedBy: { select: { id: true, role: true } },
  reviewedBy: { select: { id: true, role: true } },
  cancelledBy: { select: { id: true, role: true } },
} satisfies Prisma.RetentionDispositionRequestSelect;

const LEGAL_HOLD_SELECT = {
  id: true,
  tenantId: true,
  operationProfileId: true,
  clientRequestId: true,
  payloadSha256: true,
  scope: true,
  reason: true,
  legalAuthority: true,
  legalReference: true,
  evidenceReference: true,
  evidenceSha256: true,
  effectiveAt: true,
  createdById: true,
  createdAt: true,
  createdBy: { select: { id: true, role: true } },
  revocation: {
    select: {
      id: true,
      clientRequestId: true,
      payloadSha256: true,
      reason: true,
      legalAuthority: true,
      legalReference: true,
      evidenceReference: true,
      evidenceSha256: true,
      revokedById: true,
      revokedAt: true,
      revokedBy: { select: { id: true, role: true } },
    },
  },
} satisfies Prisma.RetentionLegalHoldSelect;

type SelectedProfile = Prisma.OperationProfileGetPayload<{
  select: typeof PROFILE_SELECT;
}>;
type SelectedDisposition = Prisma.RetentionDispositionRequestGetPayload<{
  select: typeof DISPOSITION_SELECT;
}>;
type SelectedLegalHold = Prisma.RetentionLegalHoldGetPayload<{
  select: typeof LEGAL_HOLD_SELECT;
}>;

type RecordCounts = Readonly<{
  voters: number | null;
  consentRecords: number | null;
  interactions: number | null;
  storedObjects: number | null;
  financialEntries: number | null;
  witnessReports: number | null;
  auditEvents: number | null;
  total: number;
}>;

export type RetentionGovernanceBlocker = Readonly<{
  code: string;
  message: string;
}>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new BadRequestException('La solicitud contiene una fecha invalida');
  }
  return date.toISOString();
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function computeRetentionDispositionPayloadSha256(
  dto: CreateRetentionDispositionDto,
): string {
  return sha256(
    JSON.stringify({
      clientRequestId: dto.clientRequestId.toLowerCase(),
      expectedPreviewSha256: dto.expectedPreviewSha256.toLowerCase(),
      expectedProfileUpdatedAt: canonicalIso(dto.expectedProfileUpdatedAt),
      scope: dto.scope,
      cutoffAt: canonicalIso(dto.cutoffAt),
      justification: dto.justification.trim(),
      legalReference: dto.legalReference.trim(),
      evidenceReference: dto.evidenceReference.trim(),
      evidenceSha256: dto.evidenceSha256.toLowerCase(),
      legalPolicyRequiredAcknowledged: dto.legalPolicyRequiredAcknowledged,
      backupRestoreRequiredAcknowledged: dto.backupRestoreRequiredAcknowledged,
      executorUnavailableAcknowledged: dto.executorUnavailableAcknowledged,
    }),
  );
}

export function computeRetentionDispositionReviewSha256(
  requestId: string,
  dto: ReviewRetentionDispositionDto,
): string {
  return sha256(
    JSON.stringify({
      requestId,
      clientReviewId: dto.clientReviewId.toLowerCase(),
      expectedPayloadSha256: dto.expectedPayloadSha256.toLowerCase(),
      decision: dto.decision,
      approvedNotExecutedAcknowledged:
        dto.approvedNotExecutedAcknowledged ?? false,
      rejectionReason: dto.rejectionReason?.trim() || null,
    }),
  );
}

export function computeRetentionDispositionCancellationSha256(
  requestId: string,
  dto: CancelRetentionDispositionDto,
): string {
  return sha256(
    JSON.stringify({
      requestId,
      clientCancellationId: dto.clientCancellationId.toLowerCase(),
      expectedPayloadSha256: dto.expectedPayloadSha256.toLowerCase(),
      reason: dto.reason.trim(),
    }),
  );
}

export function computeRetentionLegalHoldPayloadSha256(
  dto: CreateRetentionLegalHoldDto,
): string {
  return sha256(
    JSON.stringify({
      clientRequestId: dto.clientRequestId.toLowerCase(),
      scope: dto.scope,
      reason: dto.reason.trim(),
      legalAuthority: dto.legalAuthority.trim(),
      legalReference: dto.legalReference.trim(),
      evidenceReference: dto.evidenceReference.trim(),
      evidenceSha256: dto.evidenceSha256.toLowerCase(),
      effectiveAt: canonicalIso(dto.effectiveAt),
    }),
  );
}

export function computeRetentionLegalHoldRevocationSha256(
  holdId: string,
  dto: RevokeRetentionLegalHoldDto,
): string {
  return sha256(
    JSON.stringify({
      holdId,
      clientRequestId: dto.clientRequestId.toLowerCase(),
      expectedHoldPayloadSha256: dto.expectedHoldPayloadSha256.toLowerCase(),
      reason: dto.reason.trim(),
      legalAuthority: dto.legalAuthority.trim(),
      legalReference: dto.legalReference.trim(),
      evidenceReference: dto.evidenceReference.trim(),
      evidenceSha256: dto.evidenceSha256.toLowerCase(),
    }),
  );
}

@Injectable()
export class RetentionGovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(user: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      await this.requireActor(transaction, user, GOVERNANCE_ROLES);
      const [profile, requests, legalHolds] = await Promise.all([
        transaction.operationProfile.findUnique({
          where: { tenantId: user.tenantId },
          select: PROFILE_SELECT,
        }),
        transaction.retentionDispositionRequest.findMany({
          where: { tenantId: user.tenantId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: DISPOSITION_SELECT,
        }),
        transaction.retentionLegalHold.findMany({
          where: { tenantId: user.tenantId },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: LEGAL_HOLD_SELECT,
        }),
      ]);

      return {
        profile: profile ? this.profileResponse(profile) : null,
        requests: requests.map((request) => this.dispositionResponse(request)),
        legalHolds: legalHolds.map((hold) => this.legalHoldResponse(hold)),
        executionCapability: this.executionCapability(),
      };
    }, SERIALIZABLE_OPTIONS);
  }

  async preview(
    user: AuthenticatedUser,
    scope: RetentionDataScope,
    cutoffAtInput?: string,
    evaluatedAt = new Date(),
  ) {
    const cutoffAt = cutoffAtInput ? new Date(cutoffAtInput) : evaluatedAt;
    this.assertValidDate(cutoffAt, 'La fecha de corte no es valida');
    this.assertValidDate(evaluatedAt, 'La fecha de evaluacion no es valida');

    return this.prisma.$transaction(async (transaction) => {
      await this.requireActor(transaction, user, GOVERNANCE_ROLES);
      const profile = await transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: PROFILE_SELECT,
      });
      const [counts, legalHolds] = await Promise.all([
        this.countRecords(transaction, user.tenantId, scope, cutoffAt),
        this.getActiveLegalHolds(transaction, user.tenantId),
      ]);
      return this.buildPreview(
        profile,
        scope,
        cutoffAt,
        evaluatedAt,
        counts,
        legalHolds,
      );
    }, SERIALIZABLE_OPTIONS);
  }

  async requestDisposition(
    user: AuthenticatedUser,
    dto: CreateRetentionDispositionDto,
    requestedAt = new Date(),
  ) {
    this.assertDispositionInput(dto, requestedAt);
    const calculatedHash = computeRetentionDispositionPayloadSha256(dto);
    this.assertHashMatches(dto.payloadSha256, calculatedHash, 'payloadSha256');

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const actor = await this.requireActor(
          transaction,
          user,
          HOLD_CREATE_ROLES,
        );
        await this.lockGovernance(transaction, user.tenantId);

        const existing =
          await transaction.retentionDispositionRequest.findFirst({
            where: {
              tenantId: user.tenantId,
              clientRequestId: dto.clientRequestId,
            },
            select: DISPOSITION_SELECT,
          });
        if (existing) {
          this.assertIdempotentHash(existing.payloadSha256, calculatedHash);
          return {
            request: this.dispositionResponse(existing),
            created: false,
            noOp: true,
          };
        }

        const profile = await this.getLockedProfile(transaction, user.tenantId);
        this.assertOrdinaryClosedProfile(profile);
        this.assertExpectedProfileVersion(
          profile,
          dto.expectedProfileUpdatedAt,
        );

        const cutoffAt = new Date(dto.cutoffAt);
        const [counts, legalHolds] = await Promise.all([
          this.countRecords(transaction, user.tenantId, dto.scope, cutoffAt),
          this.getActiveLegalHolds(transaction, user.tenantId),
        ]);
        const preview = this.buildPreview(
          profile,
          dto.scope,
          cutoffAt,
          requestedAt,
          counts,
          legalHolds,
        );
        if (preview.previewSha256 !== dto.expectedPreviewSha256) {
          throw new ConflictException({
            code: 'RETENTION_PREVIEW_CHANGED',
            message:
              'El corte o sus bloqueos cambiaron; genere una vista previa nueva antes de solicitar',
            currentPreviewSha256: preview.previewSha256,
          });
        }
        if (!preview.canRequest) {
          throw new ConflictException({
            code: 'RETENTION_DISPOSITION_BLOCKED',
            message:
              'La solicitud ordinaria esta bloqueada por el estado actual',
            blockers: preview.governanceBlockers,
          });
        }

        const pending = await transaction.retentionDispositionRequest.findFirst(
          {
            where: {
              tenantId: user.tenantId,
              operationProfileId: profile.id,
              scope: dto.scope,
              status: RetentionDispositionStatus.PENDING,
            },
            select: { id: true },
          },
        );
        if (pending) {
          throw new ConflictException(
            `Ya existe una solicitud pendiente para este alcance (${pending.id})`,
          );
        }

        const request = await transaction.retentionDispositionRequest.create({
          data: {
            tenantId: user.tenantId,
            operationProfileId: profile.id,
            clientRequestId: dto.clientRequestId,
            payloadSha256: calculatedHash,
            previewSha256: preview.previewSha256,
            profileSnapshotSha256: this.profileSnapshotSha256(profile),
            expectedProfileUpdatedAt: profile.updatedAt,
            status: RetentionDispositionStatus.PENDING,
            scope: dto.scope,
            cutoffAt,
            retentionDueAt: addUtcDays(
              profile.electionDate,
              profile.retentionPeriodDays,
            ),
            previewSnapshot: this.previewForStorage(preview),
            justification: dto.justification.trim(),
            legalReference: dto.legalReference.trim(),
            evidenceReference: dto.evidenceReference.trim(),
            evidenceSha256: dto.evidenceSha256.toLowerCase(),
            legalPolicyRequiredAcknowledged: true,
            backupRestoreRequiredAcknowledged: true,
            executorUnavailableAcknowledged: true,
            requestedById: actor.id,
          },
          select: DISPOSITION_SELECT,
        });
        await this.audit(transaction, {
          tenantId: user.tenantId,
          actorUserId: actor.id,
          action: 'RETENTION_DISPOSITION_REQUESTED',
          resourceType: 'RetentionDispositionRequest',
          resourceId: request.id,
          after: this.dispositionAuditSnapshot(request),
        });
        return {
          request: this.dispositionResponse(request),
          created: true,
          noOp: false,
        };
      }, SERIALIZABLE_OPTIONS);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        return this.resolveConcurrentDisposition(user, dto, calculatedHash);
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'El gobierno de retencion cambio concurrentemente; recargue e intente nuevamente',
        );
      }
      throw error;
    }
  }

  async reviewDisposition(
    user: AuthenticatedUser,
    requestId: string,
    dto: ReviewRetentionDispositionDto,
    reviewedAt = new Date(),
  ) {
    this.assertIdentifier(requestId);
    this.assertReviewInput(dto, reviewedAt);
    const calculatedHash = computeRetentionDispositionReviewSha256(
      requestId,
      dto,
    );
    this.assertHashMatches(
      dto.reviewPayloadSha256,
      calculatedHash,
      'reviewPayloadSha256',
    );

    return this.prisma.$transaction(async (transaction) => {
      const reviewer = await this.requireActor(
        transaction,
        user,
        GOVERNANCE_ROLES,
      );
      await this.lockGovernance(transaction, user.tenantId);
      const request = await transaction.retentionDispositionRequest.findFirst({
        where: { id: requestId, tenantId: user.tenantId },
        select: DISPOSITION_SELECT,
      });
      if (!request) {
        throw new NotFoundException(
          'Solicitud de disposicion poselectoral no encontrada',
        );
      }
      if (request.payloadSha256 !== dto.expectedPayloadSha256) {
        throw new ConflictException(
          'El hash revisado no corresponde a la solicitud almacenada',
        );
      }
      if (request.status !== RetentionDispositionStatus.PENDING) {
        this.assertIdempotentReview(request, dto, calculatedHash);
        return {
          request: this.dispositionResponse(request),
          reviewed: true,
          approved:
            request.status === RetentionDispositionStatus.APPROVED_NOT_EXECUTED,
          noOp: true,
        };
      }
      if (request.requestedById === reviewer.id) {
        throw new ForbiddenException(
          'La persona solicitante no puede revisar su propia disposicion',
        );
      }

      const profile = await this.getLockedProfile(transaction, user.tenantId);
      this.assertStoredProfileBinding(profile, request);

      if (dto.decision === RetentionDispositionDecision.APPROVE) {
        const holds = await this.getActiveLegalHolds(
          transaction,
          user.tenantId,
        );
        const blockers = this.governanceBlockers(
          profile,
          request.scope,
          request.cutoffAt,
          reviewedAt,
          holds,
        );
        if (blockers.length > 0) {
          throw new ConflictException({
            code: 'RETENTION_DISPOSITION_BLOCKED',
            message:
              'La aprobacion no puede continuar porque aparecieron bloqueos',
            blockers,
          });
        }
      }

      const nextStatus =
        dto.decision === RetentionDispositionDecision.APPROVE
          ? RetentionDispositionStatus.APPROVED_NOT_EXECUTED
          : RetentionDispositionStatus.REJECTED;
      const updated = await transaction.retentionDispositionRequest.update({
        where: {
          id_tenantId: { id: request.id, tenantId: user.tenantId },
        },
        data: {
          status: nextStatus,
          reviewedById: reviewer.id,
          reviewedAt,
          reviewClientRequestId: dto.clientReviewId,
          reviewPayloadSha256: calculatedHash,
          rejectionReason: dto.rejectionReason?.trim() || null,
        },
        select: DISPOSITION_SELECT,
      });
      await this.audit(transaction, {
        tenantId: user.tenantId,
        actorUserId: reviewer.id,
        action:
          nextStatus === RetentionDispositionStatus.APPROVED_NOT_EXECUTED
            ? 'RETENTION_DISPOSITION_APPROVED_NOT_EXECUTED'
            : 'RETENTION_DISPOSITION_REJECTED',
        resourceType: 'RetentionDispositionRequest',
        resourceId: request.id,
        before: this.dispositionAuditSnapshot(request),
        after: this.dispositionAuditSnapshot(updated),
      });
      return {
        request: this.dispositionResponse(updated),
        reviewed: true,
        approved:
          nextStatus === RetentionDispositionStatus.APPROVED_NOT_EXECUTED,
        noOp: false,
        executionCapability: this.executionCapability(),
      };
    }, SERIALIZABLE_OPTIONS);
  }

  async cancelDisposition(
    user: AuthenticatedUser,
    requestId: string,
    dto: CancelRetentionDispositionDto,
    cancelledAt = new Date(),
  ) {
    this.assertIdentifier(requestId);
    this.assertCancellationInput(dto, cancelledAt);
    const calculatedHash = computeRetentionDispositionCancellationSha256(
      requestId,
      dto,
    );
    this.assertHashMatches(
      dto.cancellationPayloadSha256,
      calculatedHash,
      'cancellationPayloadSha256',
    );

    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireActor(
        transaction,
        user,
        HOLD_CREATE_ROLES,
      );
      await this.lockGovernance(transaction, user.tenantId);
      const request = await transaction.retentionDispositionRequest.findFirst({
        where: { id: requestId, tenantId: user.tenantId },
        select: DISPOSITION_SELECT,
      });
      if (!request) {
        throw new NotFoundException(
          'Solicitud de disposicion poselectoral no encontrada',
        );
      }
      if (request.payloadSha256 !== dto.expectedPayloadSha256) {
        throw new ConflictException(
          'El hash no corresponde a la solicitud almacenada',
        );
      }
      if (request.status !== RetentionDispositionStatus.PENDING) {
        this.assertIdempotentCancellation(request, dto, calculatedHash);
        return {
          request: this.dispositionResponse(request),
          cancelled: true,
          noOp: true,
        };
      }
      if (request.requestedById !== actor.id) {
        throw new ForbiddenException(
          'Solo la persona solicitante puede cancelar su solicitud pendiente',
        );
      }
      const updated = await transaction.retentionDispositionRequest.update({
        where: {
          id_tenantId: { id: request.id, tenantId: user.tenantId },
        },
        data: {
          status: RetentionDispositionStatus.CANCELLED,
          cancelledById: actor.id,
          cancelledAt,
          cancellationClientRequestId: dto.clientCancellationId,
          cancellationPayloadSha256: calculatedHash,
          cancellationReason: dto.reason.trim(),
        },
        select: DISPOSITION_SELECT,
      });
      await this.audit(transaction, {
        tenantId: user.tenantId,
        actorUserId: actor.id,
        action: 'RETENTION_DISPOSITION_CANCELLED',
        resourceType: 'RetentionDispositionRequest',
        resourceId: request.id,
        before: this.dispositionAuditSnapshot(request),
        after: this.dispositionAuditSnapshot(updated),
      });
      return {
        request: this.dispositionResponse(updated),
        cancelled: true,
        noOp: false,
      };
    }, SERIALIZABLE_OPTIONS);
  }

  async createLegalHold(
    user: AuthenticatedUser,
    dto: CreateRetentionLegalHoldDto,
    createdAt = new Date(),
  ) {
    this.assertLegalHoldInput(dto, createdAt);
    const calculatedHash = computeRetentionLegalHoldPayloadSha256(dto);
    this.assertHashMatches(dto.payloadSha256, calculatedHash, 'payloadSha256');

    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireActor(
        transaction,
        user,
        HOLD_CREATE_ROLES,
      );
      await this.lockGovernance(transaction, user.tenantId);
      const existing = await transaction.retentionLegalHold.findFirst({
        where: {
          tenantId: user.tenantId,
          clientRequestId: dto.clientRequestId,
        },
        select: LEGAL_HOLD_SELECT,
      });
      if (existing) {
        this.assertIdempotentHash(existing.payloadSha256, calculatedHash);
        return {
          legalHold: this.legalHoldResponse(existing),
          created: false,
          noOp: true,
        };
      }
      const profile = await this.getLockedProfile(transaction, user.tenantId);
      if (!profile) {
        throw new ConflictException(
          'Configura el perfil operativo antes de registrar una retencion legal',
        );
      }
      const legalHold = await transaction.retentionLegalHold.create({
        data: {
          tenantId: user.tenantId,
          operationProfileId: profile.id,
          clientRequestId: dto.clientRequestId,
          payloadSha256: calculatedHash,
          scope: dto.scope,
          reason: dto.reason.trim(),
          legalAuthority: dto.legalAuthority.trim(),
          legalReference: dto.legalReference.trim(),
          evidenceReference: dto.evidenceReference.trim(),
          evidenceSha256: dto.evidenceSha256.toLowerCase(),
          effectiveAt: new Date(dto.effectiveAt),
          createdById: actor.id,
        },
        select: LEGAL_HOLD_SELECT,
      });
      await this.audit(transaction, {
        tenantId: user.tenantId,
        actorUserId: actor.id,
        action: 'RETENTION_LEGAL_HOLD_CREATED',
        resourceType: 'RetentionLegalHold',
        resourceId: legalHold.id,
        after: this.legalHoldAuditSnapshot(legalHold),
      });
      return {
        legalHold: this.legalHoldResponse(legalHold),
        created: true,
        noOp: false,
      };
    }, SERIALIZABLE_OPTIONS);
  }

  async revokeLegalHold(
    user: AuthenticatedUser,
    holdId: string,
    dto: RevokeRetentionLegalHoldDto,
    revokedAt = new Date(),
  ) {
    this.assertIdentifier(holdId);
    this.assertLegalHoldRevocationInput(dto, revokedAt);
    const calculatedHash = computeRetentionLegalHoldRevocationSha256(
      holdId,
      dto,
    );
    this.assertHashMatches(dto.payloadSha256, calculatedHash, 'payloadSha256');

    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireActor(
        transaction,
        user,
        GOVERNANCE_ROLES,
      );
      await this.lockGovernance(transaction, user.tenantId);
      const hold = await transaction.retentionLegalHold.findFirst({
        where: { id: holdId, tenantId: user.tenantId },
        select: LEGAL_HOLD_SELECT,
      });
      if (!hold) {
        throw new NotFoundException('Retencion legal no encontrada');
      }
      if (hold.payloadSha256 !== dto.expectedHoldPayloadSha256) {
        throw new ConflictException(
          'El hash revisado no corresponde a la retencion legal almacenada',
        );
      }
      if (hold.revocation) {
        this.assertIdempotentHash(
          hold.revocation.payloadSha256,
          calculatedHash,
        );
        return {
          legalHold: this.legalHoldResponse(hold),
          revoked: true,
          noOp: true,
        };
      }
      if (hold.createdById === actor.id) {
        throw new ForbiddenException(
          'La persona que creo la retencion legal no puede revocarla',
        );
      }
      await transaction.retentionLegalHoldRevocation.create({
        data: {
          tenantId: user.tenantId,
          legalHoldId: hold.id,
          clientRequestId: dto.clientRequestId,
          payloadSha256: calculatedHash,
          reason: dto.reason.trim(),
          legalAuthority: dto.legalAuthority.trim(),
          legalReference: dto.legalReference.trim(),
          evidenceReference: dto.evidenceReference.trim(),
          evidenceSha256: dto.evidenceSha256.toLowerCase(),
          revokedById: actor.id,
          revokedAt,
        },
      });
      const updated = await transaction.retentionLegalHold.findFirst({
        where: { id: hold.id, tenantId: user.tenantId },
        select: LEGAL_HOLD_SELECT,
      });
      if (!updated?.revocation) {
        throw new ConflictException(
          'No fue posible verificar el recibo durable de revocacion',
        );
      }
      await this.audit(transaction, {
        tenantId: user.tenantId,
        actorUserId: actor.id,
        action: 'RETENTION_LEGAL_HOLD_REVOKED',
        resourceType: 'RetentionLegalHold',
        resourceId: hold.id,
        before: this.legalHoldAuditSnapshot(hold),
        after: this.legalHoldAuditSnapshot(updated),
      });
      return {
        legalHold: this.legalHoldResponse(updated),
        revoked: true,
        noOp: false,
      };
    }, SERIALIZABLE_OPTIONS);
  }

  private async requireActor(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    roles: readonly Role[],
  ): Promise<{ id: string; role: Role }> {
    const tenant = await transaction.tenant.findUnique({
      where: { id: user.tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    if (!tenant) throw new NotFoundException('Organizacion no encontrada');
    assertCampaignTenant(tenant);
    const actors = await transaction.$queryRaw<
      Array<{ id: string; role: Role }>
    >(
      Prisma.sql`
        SELECT "id", "role"
        FROM "User"
        WHERE "id" = ${user.userId}
          AND "tenantId" = ${user.tenantId}
          AND "isActive" = true
          AND "role"::text IN (${Prisma.join(roles.map((role) => role))})
        FOR KEY SHARE
      `,
    );
    const actor = actors[0];
    if (!actor) {
      throw new ForbiddenException(
        'Se requiere un rol vigente de administracion, cumplimiento o auditoria',
      );
    }
    return actor;
  }

  private async lockGovernance(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      WITH retention_governance_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`retention-governance:${tenantId}`}, 0)
        )
      )
      SELECT TRUE AS "locked" FROM retention_governance_lock
    `);
  }

  private async getLockedProfile(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<SelectedProfile | null> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "OperationProfile" WHERE "tenantId" = ${tenantId} FOR KEY SHARE`,
    );
    return transaction.operationProfile.findUnique({
      where: { tenantId },
      select: PROFILE_SELECT,
    });
  }

  private async getActiveLegalHolds(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<SelectedLegalHold[]> {
    return transaction.retentionLegalHold.findMany({
      where: { tenantId, revocation: null },
      orderBy: { createdAt: 'asc' },
      select: LEGAL_HOLD_SELECT,
    });
  }

  private async countRecords(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    scope: RetentionDataScope,
    cutoffAt: Date,
  ): Promise<RecordCounts> {
    const all = scope === RetentionDataScope.ALL_TENANT_RECORDS;
    const includeSubjects =
      all || scope === RetentionDataScope.DATA_SUBJECT_RECORDS;
    const includeInteractions =
      all || scope === RetentionDataScope.COMMUNICATION_INTERACTIONS;
    const includeStored = all || scope === RetentionDataScope.STORED_OBJECTS;
    const includeFinance =
      all || scope === RetentionDataScope.FINANCIAL_RECORDS;
    const includeEvidence =
      all || scope === RetentionDataScope.ELECTORAL_EVIDENCE;
    const includeAudit = all || scope === RetentionDataScope.AUDIT_TRAIL;

    const [
      voters,
      consentRecords,
      interactions,
      storedObjects,
      financialEntries,
      witnessReports,
      auditEvents,
    ] = await Promise.all([
      includeSubjects
        ? transaction.voter.count({
            where: { tenantId, createdAt: { lte: cutoffAt } },
          })
        : null,
      includeSubjects
        ? transaction.consentRecord.count({
            where: { tenantId, createdAt: { lte: cutoffAt } },
          })
        : null,
      includeInteractions
        ? transaction.interaction.count({
            where: { tenantId, occurredAt: { lte: cutoffAt } },
          })
        : null,
      includeStored
        ? transaction.storedObject.count({
            where: { tenantId, createdAt: { lte: cutoffAt } },
          })
        : null,
      includeFinance
        ? transaction.financialEntry.count({
            where: { tenantId, createdAt: { lte: cutoffAt } },
          })
        : null,
      includeEvidence
        ? transaction.witnessReport.count({
            where: { tenantId, createdAt: { lte: cutoffAt } },
          })
        : null,
      includeAudit
        ? transaction.auditEvent.count({
            where: { tenantId, occurredAt: { lte: cutoffAt } },
          })
        : null,
    ]);
    const values = [
      voters,
      consentRecords,
      interactions,
      storedObjects,
      financialEntries,
      witnessReports,
      auditEvents,
    ];
    return {
      voters,
      consentRecords,
      interactions,
      storedObjects,
      financialEntries,
      witnessReports,
      auditEvents,
      total: values.reduce<number>(
        (sum, value) => sum + (typeof value === 'number' ? value : 0),
        0,
      ),
    };
  }

  private buildPreview(
    profile: SelectedProfile | null,
    scope: RetentionDataScope,
    cutoffAt: Date,
    evaluatedAt: Date,
    counts: RecordCounts,
    legalHolds: SelectedLegalHold[],
  ) {
    const retentionDueAt = profile
      ? addUtcDays(profile.electionDate, profile.retentionPeriodDays)
      : null;
    const governanceBlockers = this.governanceBlockers(
      profile,
      scope,
      cutoffAt,
      evaluatedAt,
      legalHolds,
    );
    const applicableHolds = legalHolds
      .filter((hold) => this.holdApplies(hold.scope, scope))
      .map((hold) => ({
        id: hold.id,
        scope: hold.scope,
        effectiveAt: hold.effectiveAt.toISOString(),
        payloadSha256: hold.payloadSha256,
      }));
    const canonical = {
      tenantId: profile?.tenantId ?? null,
      operationProfileId: profile?.id ?? null,
      profileUpdatedAt: profile?.updatedAt.toISOString() ?? null,
      stage: profile?.stage ?? null,
      closureType: profile?.closureType ?? null,
      scope,
      cutoffAt: cutoffAt.toISOString(),
      electionDate: profile?.electionDate.toISOString() ?? null,
      retentionPeriodDays: profile?.retentionPeriodDays ?? null,
      retentionDueAt: retentionDueAt?.toISOString() ?? null,
      counts,
      applicableHolds,
      governanceBlockers: governanceBlockers.map(({ code }) => code),
    };
    return {
      kind: 'RETENTION_GOVERNANCE_PREVIEW' as const,
      evaluatedAt: evaluatedAt.toISOString(),
      ...canonical,
      previewSha256: sha256(JSON.stringify(canonical)),
      canRequest: governanceBlockers.length === 0,
      governanceBlockers,
      executionCapability: this.executionCapability(),
      disclaimer:
        'Esta vista solo cuenta registros y bloqueos. No elimina, anonimiza, mueve ni modifica datos o archivos.',
    };
  }

  private governanceBlockers(
    profile: SelectedProfile | null,
    scope: RetentionDataScope,
    cutoffAt: Date,
    evaluatedAt: Date,
    legalHolds: SelectedLegalHold[],
  ): RetentionGovernanceBlocker[] {
    const blockers: RetentionGovernanceBlocker[] = [];
    if (!profile) {
      blockers.push({
        code: 'OPERATION_PROFILE_REQUIRED',
        message: 'No existe un perfil operativo que determine el ciclo.',
      });
      return blockers;
    }
    if (profile.stage !== PoliticalOperationStage.CLOSED) {
      blockers.push({
        code: 'OPERATION_NOT_CLOSED',
        message:
          'La disposicion ordinaria solo se puede solicitar despues del cierre formal.',
      });
    }
    if (profile.closureType === OperationClosureType.CLOSED_EXCEPTIONAL) {
      blockers.push({
        code: 'EXCEPTIONAL_CLOSURE_SURVIVING_DUTIES',
        message:
          'El cierre excepcional conserva obligaciones y no puede usar la via ordinaria de disposicion.',
      });
    } else if (
      profile.stage === PoliticalOperationStage.CLOSED &&
      profile.closureType !== OperationClosureType.CLOSED_NORMAL
    ) {
      blockers.push({
        code: 'CLOSURE_CLASSIFICATION_REQUIRED',
        message: 'El cierre debe estar clasificado como ordinario.',
      });
    }
    const dueAt = addUtcDays(profile.electionDate, profile.retentionPeriodDays);
    if (cutoffAt.getTime() < dueAt.getTime()) {
      blockers.push({
        code: 'RETENTION_PERIOD_NOT_DUE',
        message: `El periodo configurado vence el ${dueAt.toISOString()}.`,
      });
    }
    if (cutoffAt.getTime() > evaluatedAt.getTime()) {
      blockers.push({
        code: 'FUTURE_CUTOFF_NOT_REQUESTABLE',
        message: 'Una solicitud no puede basarse en un corte futuro.',
      });
    }
    if (legalHolds.some((hold) => this.holdApplies(hold.scope, scope))) {
      blockers.push({
        code: 'ACTIVE_LEGAL_HOLD',
        message:
          'Existe una orden de conservacion activa aplicable a este alcance.',
      });
    }
    return blockers;
  }

  private executionCapability() {
    return {
      status: 'NOT_IMPLEMENTED' as const,
      canExecute: false as const,
      destructiveActionsAvailable: false as const,
      blockers: [
        {
          code: 'VALIDATED_LEGAL_POLICY_REQUIRED',
          message:
            'Falta una politica juridica validada y aprobada para cada categoria.',
        },
        {
          code: 'BACKUP_RESTORE_DRILL_REQUIRED',
          message:
            'Falta evidencia vigente de backup y restauracion verificada.',
        },
        {
          code: 'BULLMQ_EXECUTOR_NOT_IMPLEMENTED',
          message:
            'No existe un ejecutor BullMQ de disposicion revisado y probado.',
        },
        {
          code: 'STORAGE_DISPOSITION_NOT_IMPLEMENTED',
          message:
            'No existe eliminacion coordinada y probada para Supabase Storage.',
        },
      ],
    };
  }

  private holdApplies(
    holdScope: RetentionDataScope,
    requestedScope: RetentionDataScope,
  ): boolean {
    return (
      holdScope === RetentionDataScope.ALL_TENANT_RECORDS ||
      requestedScope === RetentionDataScope.ALL_TENANT_RECORDS ||
      holdScope === requestedScope
    );
  }

  private assertOrdinaryClosedProfile(
    profile: SelectedProfile | null,
  ): asserts profile is SelectedProfile {
    if (!profile) {
      throw new ConflictException(
        'Configura el perfil operativo antes de solicitar disposicion',
      );
    }
    if (
      profile.stage !== PoliticalOperationStage.CLOSED ||
      profile.closureType !== OperationClosureType.CLOSED_NORMAL
    ) {
      throw new ConflictException({
        code:
          profile.closureType === OperationClosureType.CLOSED_EXCEPTIONAL
            ? 'EXCEPTIONAL_CLOSURE_SURVIVING_DUTIES'
            : 'ORDINARY_CLOSED_PROFILE_REQUIRED',
        message:
          profile.closureType === OperationClosureType.CLOSED_EXCEPTIONAL
            ? 'El cierre excepcional conserva obligaciones y no admite disposicion ordinaria'
            : 'La disposicion ordinaria exige un perfil formalmente cerrado de manera normal',
      });
    }
  }

  private assertStoredProfileBinding(
    profile: SelectedProfile | null,
    request: SelectedDisposition,
  ): asserts profile is SelectedProfile {
    this.assertOrdinaryClosedProfile(profile);
    if (
      profile.id !== request.operationProfileId ||
      profile.updatedAt.getTime() !==
        request.expectedProfileUpdatedAt.getTime() ||
      this.profileSnapshotSha256(profile) !== request.profileSnapshotSha256
    ) {
      throw new ConflictException({
        code: 'RETENTION_PROFILE_CHANGED',
        message:
          'El perfil ligado a la solicitud no coincide con su expediente inmutable',
      });
    }
  }

  private assertExpectedProfileVersion(
    profile: SelectedProfile,
    expectedUpdatedAt: string,
  ): void {
    if (profile.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new ConflictException(
        'El perfil cambio desde la vista previa; recargue antes de solicitar',
      );
    }
  }

  private profileSnapshotSha256(profile: SelectedProfile): string {
    return sha256(
      JSON.stringify({
        id: profile.id,
        tenantId: profile.tenantId,
        stage: profile.stage,
        closureType: profile.closureType,
        electionDate: profile.electionDate.toISOString(),
        retentionPeriodDays: profile.retentionPeriodDays,
        updatedAt: profile.updatedAt.toISOString(),
      }),
    );
  }

  private previewForStorage(
    preview: ReturnType<RetentionGovernanceService['buildPreview']>,
  ): Prisma.InputJsonObject {
    return {
      kind: preview.kind,
      evaluatedAt: preview.evaluatedAt,
      scope: preview.scope,
      cutoffAt: preview.cutoffAt,
      retentionDueAt: preview.retentionDueAt,
      counts: preview.counts,
      applicableHolds: preview.applicableHolds,
      governanceBlockers: preview.governanceBlockers.map((blocker) => ({
        code: blocker.code,
      })),
      previewSha256: preview.previewSha256,
    } as Prisma.InputJsonObject;
  }

  private dispositionAuditSnapshot(
    request: SelectedDisposition,
  ): Prisma.InputJsonObject {
    return {
      requestId: request.id,
      operationProfileId: request.operationProfileId,
      clientRequestId: request.clientRequestId,
      payloadSha256: request.payloadSha256,
      previewSha256: request.previewSha256,
      profileSnapshotSha256: request.profileSnapshotSha256,
      status: request.status,
      scope: request.scope,
      cutoffAt: request.cutoffAt.toISOString(),
      retentionDueAt: request.retentionDueAt.toISOString(),
      justificationSha256: sha256(request.justification),
      legalReferenceSha256: sha256(request.legalReference),
      evidenceReferenceSha256: sha256(request.evidenceReference),
      evidenceSha256: request.evidenceSha256,
      requestedById: request.requestedById,
      reviewedById: request.reviewedById,
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      reviewClientRequestId: request.reviewClientRequestId,
      reviewPayloadSha256: request.reviewPayloadSha256,
      rejectionReasonSha256: request.rejectionReason
        ? sha256(request.rejectionReason)
        : null,
      cancelledById: request.cancelledById,
      cancelledAt: request.cancelledAt?.toISOString() ?? null,
      cancellationClientRequestId: request.cancellationClientRequestId,
      cancellationPayloadSha256: request.cancellationPayloadSha256,
      cancellationReasonSha256: request.cancellationReason
        ? sha256(request.cancellationReason)
        : null,
    };
  }

  private legalHoldAuditSnapshot(
    hold: SelectedLegalHold,
  ): Prisma.InputJsonObject {
    return {
      legalHoldId: hold.id,
      operationProfileId: hold.operationProfileId,
      clientRequestId: hold.clientRequestId,
      payloadSha256: hold.payloadSha256,
      scope: hold.scope,
      reasonSha256: sha256(hold.reason),
      legalAuthoritySha256: sha256(hold.legalAuthority),
      legalReferenceSha256: sha256(hold.legalReference),
      evidenceReferenceSha256: sha256(hold.evidenceReference),
      evidenceSha256: hold.evidenceSha256,
      effectiveAt: hold.effectiveAt.toISOString(),
      createdById: hold.createdById,
      revoked: Boolean(hold.revocation),
      revocationPayloadSha256: hold.revocation?.payloadSha256 ?? null,
      revokedById: hold.revocation?.revokedById ?? null,
      revokedAt: hold.revocation?.revokedAt.toISOString() ?? null,
    };
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    input: {
      tenantId: string;
      actorUserId: string;
      action: string;
      resourceType: string;
      resourceId: string;
      before?: Prisma.InputJsonObject;
      after?: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await transaction.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        before: input.before,
        after: input.after,
      },
    });
  }

  private dispositionResponse(request: SelectedDisposition) {
    return {
      ...request,
      expectedProfileUpdatedAt: request.expectedProfileUpdatedAt.toISOString(),
      cutoffAt: request.cutoffAt.toISOString(),
      retentionDueAt: request.retentionDueAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      cancelledAt: request.cancelledAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  private legalHoldResponse(hold: SelectedLegalHold) {
    return {
      ...hold,
      effectiveAt: hold.effectiveAt.toISOString(),
      createdAt: hold.createdAt.toISOString(),
      active: !hold.revocation,
      revocation: hold.revocation
        ? {
            ...hold.revocation,
            revokedAt: hold.revocation.revokedAt.toISOString(),
          }
        : null,
    };
  }

  private profileResponse(profile: SelectedProfile) {
    return {
      id: profile.id,
      stage: profile.stage,
      closureType: profile.closureType,
      electionDate: profile.electionDate.toISOString(),
      retentionPeriodDays: profile.retentionPeriodDays,
      retentionDueAt: addUtcDays(
        profile.electionDate,
        profile.retentionPeriodDays,
      ).toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private assertDispositionInput(
    dto: CreateRetentionDispositionDto,
    requestedAt: Date,
  ): void {
    this.assertUuid(dto.clientRequestId, 'clientRequestId');
    this.assertHashes([
      dto.payloadSha256,
      dto.expectedPreviewSha256,
      dto.evidenceSha256,
    ]);
    this.assertValidDate(requestedAt, 'La fecha de solicitud no es valida');
    const cutoffAt = new Date(dto.cutoffAt);
    this.assertValidDate(cutoffAt, 'La fecha de corte no es valida');
    if (cutoffAt.getTime() > requestedAt.getTime()) {
      throw new BadRequestException(
        'La fecha de corte no puede estar en el futuro',
      );
    }
    if (dto.justification.trim().length < 100) {
      throw new BadRequestException(
        'La justificacion debe tener al menos 100 caracteres',
      );
    }
    this.assertEvidenceReference(dto.evidenceReference);
    if (
      !dto.legalPolicyRequiredAcknowledged ||
      !dto.backupRestoreRequiredAcknowledged ||
      !dto.executorUnavailableAcknowledged
    ) {
      throw new BadRequestException(
        'Debe reconocer los tres bloqueos de ejecucion antes de solicitar',
      );
    }
  }

  private assertReviewInput(
    dto: ReviewRetentionDispositionDto,
    reviewedAt: Date,
  ): void {
    this.assertUuid(dto.clientReviewId, 'clientReviewId');
    this.assertHashes([dto.expectedPayloadSha256, dto.reviewPayloadSha256]);
    this.assertValidDate(reviewedAt, 'La fecha de revision no es valida');
    const reason = dto.rejectionReason?.trim();
    if (
      dto.decision === RetentionDispositionDecision.APPROVE &&
      (dto.approvedNotExecutedAcknowledged !== true || reason)
    ) {
      throw new BadRequestException(
        'Aprobar exige reconocer expresamente que no se ejecutara ninguna disposicion',
      );
    }
    if (
      dto.decision === RetentionDispositionDecision.REJECT &&
      (!reason || reason.length < 20 || dto.approvedNotExecutedAcknowledged)
    ) {
      throw new BadRequestException(
        'El rechazo exige una razon de al menos 20 caracteres',
      );
    }
  }

  private assertCancellationInput(
    dto: CancelRetentionDispositionDto,
    cancelledAt: Date,
  ): void {
    this.assertUuid(dto.clientCancellationId, 'clientCancellationId');
    this.assertHashes([
      dto.expectedPayloadSha256,
      dto.cancellationPayloadSha256,
    ]);
    this.assertValidDate(cancelledAt, 'La fecha de cancelacion no es valida');
    if (dto.reason.trim().length < 20) {
      throw new BadRequestException(
        'La cancelacion exige una razon de al menos 20 caracteres',
      );
    }
  }

  private assertLegalHoldInput(
    dto: CreateRetentionLegalHoldDto,
    createdAt: Date,
  ): void {
    this.assertUuid(dto.clientRequestId, 'clientRequestId');
    this.assertHashes([dto.payloadSha256, dto.evidenceSha256]);
    this.assertValidDate(createdAt, 'La fecha de registro no es valida');
    const effectiveAt = new Date(dto.effectiveAt);
    this.assertValidDate(effectiveAt, 'La fecha efectiva no es valida');
    if (effectiveAt.getTime() > createdAt.getTime()) {
      throw new BadRequestException(
        'La retencion legal debe tener vigencia inmediata o anterior',
      );
    }
    this.assertEvidenceReference(dto.evidenceReference);
  }

  private assertLegalHoldRevocationInput(
    dto: RevokeRetentionLegalHoldDto,
    revokedAt: Date,
  ): void {
    this.assertUuid(dto.clientRequestId, 'clientRequestId');
    this.assertHashes([
      dto.expectedHoldPayloadSha256,
      dto.payloadSha256,
      dto.evidenceSha256,
    ]);
    this.assertValidDate(revokedAt, 'La fecha de revocacion no es valida');
    this.assertEvidenceReference(dto.evidenceReference);
  }

  private assertIdentifier(value: string): void {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
      throw new BadRequestException('El identificador no es valido');
    }
  }

  private assertUuid(value: string, field: string): void {
    if (!UUID_V4_PATTERN.test(value)) {
      throw new BadRequestException(`${field} debe ser un UUID v4`);
    }
  }

  private assertHashes(values: string[]): void {
    if (values.some((value) => !SHA256_PATTERN.test(value))) {
      throw new BadRequestException(
        'Los hashes deben ser SHA-256 hexadecimales en minuscula',
      );
    }
  }

  private assertHashMatches(
    received: string,
    calculated: string,
    field: string,
  ): void {
    if (received !== calculated) {
      throw new BadRequestException(
        `${field} no corresponde al contenido canonico`,
      );
    }
  }

  private assertEvidenceReference(value: string): void {
    try {
      const url = new URL(value.trim());
      if (
        url.protocol !== 'https:' ||
        !url.hostname ||
        url.username ||
        url.password ||
        /\s/u.test(value) ||
        value.length > 2_048
      ) {
        throw new Error('unsafe');
      }
    } catch {
      throw new BadRequestException(
        'La evidencia debe usar HTTPS y no contener credenciales embebidas',
      );
    }
  }

  private assertValidDate(value: Date, message: string): void {
    if (!Number.isFinite(value.getTime())) {
      throw new BadRequestException(message);
    }
  }

  private assertIdempotentHash(stored: string, calculated: string): void {
    if (stored !== calculated) {
      throw new ConflictException(
        'El identificador idempotente ya fue usado con otro contenido',
      );
    }
  }

  private assertIdempotentReview(
    request: SelectedDisposition,
    dto: ReviewRetentionDispositionDto,
    calculatedHash: string,
  ): void {
    if (
      request.reviewClientRequestId?.toLowerCase() !==
        dto.clientReviewId.toLowerCase() ||
      request.reviewPayloadSha256 !== calculatedHash
    ) {
      throw new ConflictException(
        `La solicitud ya termino en estado ${request.status} mediante otra revision`,
      );
    }
  }

  private assertIdempotentCancellation(
    request: SelectedDisposition,
    dto: CancelRetentionDispositionDto,
    calculatedHash: string,
  ): void {
    if (
      request.cancellationClientRequestId?.toLowerCase() !==
        dto.clientCancellationId.toLowerCase() ||
      request.cancellationPayloadSha256 !== calculatedHash
    ) {
      throw new ConflictException(
        `La solicitud ya termino en estado ${request.status} mediante otra operacion`,
      );
    }
  }

  private async resolveConcurrentDisposition(
    user: AuthenticatedUser,
    dto: CreateRetentionDispositionDto,
    calculatedHash: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.requireActor(transaction, user, HOLD_CREATE_ROLES);
      const existing = await transaction.retentionDispositionRequest.findFirst({
        where: {
          tenantId: user.tenantId,
          clientRequestId: dto.clientRequestId,
        },
        select: DISPOSITION_SELECT,
      });
      if (!existing) {
        throw new ConflictException(
          'Otra solicitud fue creada concurrentemente; recargue el estado',
        );
      }
      this.assertIdempotentHash(existing.payloadSha256, calculatedHash);
      return {
        request: this.dispositionResponse(existing),
        created: false,
        noOp: true,
      };
    }, SERIALIZABLE_OPTIONS);
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
