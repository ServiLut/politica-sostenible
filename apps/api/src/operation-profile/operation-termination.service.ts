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
  CommunicationApprovalStatus,
  ConsentPurpose,
  FinanceStatus,
  IssueCaseStatus,
  OperationClosureType,
  OperationTerminationCause,
  OperationTerminationStatus,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  StoredObjectStatus,
  TaskStatus,
  WorkPriority,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { PrismaService } from '../prisma/prisma.service';
import { toStoredDateOnlyKey } from './election-operating-window';
import {
  CancelOperationTerminationDto,
  CreateOperationTerminationDto,
  OperationTerminationDecision,
  ReviewOperationTerminationDto,
} from './dto/operation-termination.dto';

const TERMINATION_TTL_MS = 72 * 60 * 60 * 1_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_ROLES: readonly Role[] = [Role.COMPLIANCE_OFFICER, Role.AUDITOR];
const READ_ROLES: readonly Role[] = [Role.ADMIN, ...REVIEW_ROLES];
const OPEN_COMMUNICATION_STATUSES = [
  CommunicationApprovalStatus.DRAFT,
  CommunicationApprovalStatus.PENDING,
  CommunicationApprovalStatus.APPROVED,
  CommunicationApprovalStatus.SCHEDULED,
] as const;
const OPEN_CASE_STATUSES = [
  IssueCaseStatus.OPEN,
  IssueCaseStatus.TRIAGED,
  IssueCaseStatus.IN_PROGRESS,
  IssueCaseStatus.WAITING_ON_CITIZEN,
  IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY,
] as const;
const OPEN_TASK_STATUSES = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
] as const;

const TERMINATION_SELECT = {
  id: true,
  tenantId: true,
  operationProfileId: true,
  clientRequestId: true,
  payloadSha256: true,
  profileSnapshotSha256: true,
  operationCycleSha256: true,
  expectedProfileUpdatedAt: true,
  status: true,
  cause: true,
  otherCause: true,
  effectiveAt: true,
  explanation: true,
  authorityName: true,
  officialActType: true,
  officialActReference: true,
  officialActIssuedAt: true,
  evidenceReference: true,
  evidenceSha256: true,
  consequencesAcknowledged: true,
  expiresAt: true,
  expiredAt: true,
  requestedById: true,
  reviewedById: true,
  reviewedAt: true,
  reviewClientRequestId: true,
  reviewPayloadSha256: true,
  rejectionReason: true,
  communicationsCancelledCount: true,
  cancelledById: true,
  cancelledAt: true,
  cancellationClientRequestId: true,
  cancellationPayloadSha256: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  requestedBy: { select: { id: true, name: true, role: true } },
  reviewedBy: { select: { id: true, name: true, role: true } },
  cancelledBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.OperationTerminationRequestSelect;

const PROFILE_TERMINATION_SELECT = {
  id: true,
  tenantId: true,
  operationType: true,
  stage: true,
  electionType: true,
  circumscriptionType: true,
  circumscriptionName: true,
  circumscriptionCode: true,
  listType: true,
  electionDate: true,
  votingStartDate: true,
  votingEndDate: true,
  votingWindowSourceUrl: true,
  votingWindowReference: true,
  expectedTeamSize: true,
  candidateCount: true,
  dataControllerName: true,
  responsibleDataUserId: true,
  retentionPeriodDays: true,
  closureType: true,
  terminatedAt: true,
  terminationCause: true,
  terminationRequestId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OperationProfileSelect;

type SelectedTermination = Prisma.OperationTerminationRequestGetPayload<{
  select: typeof TERMINATION_SELECT;
}>;
type SelectedTerminationProfile = Prisma.OperationProfileGetPayload<{
  select: typeof PROFILE_TERMINATION_SELECT;
}>;

const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isoDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new BadRequestException('La solicitud contiene una fecha invalida');
  }
  return date.toISOString();
}

/** Canonical request hash contract mirrored by the web client. */
export function computeOperationTerminationPayloadSha256(
  dto: CreateOperationTerminationDto,
): string {
  return sha256(
    JSON.stringify({
      clientRequestId: dto.clientRequestId.toLowerCase(),
      expectedProfileUpdatedAt: isoDate(dto.expectedProfileUpdatedAt),
      cause: dto.cause,
      otherCause: dto.otherCause?.trim() || null,
      effectiveAt: isoDate(dto.effectiveAt),
      explanation: dto.explanation.trim(),
      authorityName: dto.authorityName.trim(),
      officialActType: dto.officialActType.trim(),
      officialActReference: dto.officialActReference.trim(),
      officialActIssuedAt: isoDate(dto.officialActIssuedAt),
      evidenceReference: dto.evidenceReference.trim(),
      evidenceSha256: dto.evidenceSha256.toLowerCase(),
      consequencesAcknowledged: dto.consequencesAcknowledged,
    }),
  );
}

export function computeOperationTerminationReviewSha256(
  requestId: string,
  dto: ReviewOperationTerminationDto,
): string {
  return sha256(
    JSON.stringify({
      requestId,
      clientReviewId: dto.clientReviewId.toLowerCase(),
      expectedPayloadSha256: dto.expectedPayloadSha256,
      decision: dto.decision,
      rejectionReason: dto.rejectionReason?.trim() || null,
    }),
  );
}

export function computeOperationTerminationCancellationSha256(
  requestId: string,
  dto: CancelOperationTerminationDto,
): string {
  return sha256(
    JSON.stringify({
      requestId,
      clientCancellationId: dto.clientCancellationId.toLowerCase(),
      expectedPayloadSha256: dto.expectedPayloadSha256,
      reason: dto.reason.trim(),
    }),
  );
}

@Injectable()
export class OperationTerminationService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(user: AuthenticatedUser, evaluatedAt = new Date()) {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireActor(
        transaction,
        user,
        READ_ROLES,
        'No tiene permisos vigentes para consultar cierres excepcionales',
      );
      await this.lockLifecycle(transaction, user.tenantId);
      const profile = await this.getLockedProfile(transaction, user.tenantId);
      await this.expirePendingRequest(
        transaction,
        user.tenantId,
        actor.id,
        evaluatedAt,
      );
      const request = await transaction.operationTerminationRequest.findFirst({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        select: TERMINATION_SELECT,
      });
      return {
        profile: profile ? this.toProfileResponse(profile) : null,
        request: request ? this.toResponse(request) : null,
        dossier:
          request?.status === OperationTerminationStatus.APPROVED
            ? await this.buildDossier(transaction, request)
            : null,
      };
    }, SERIALIZABLE_OPTIONS);
  }

  async requestTermination(
    user: AuthenticatedUser,
    dto: CreateOperationTerminationDto,
    requestedAt = new Date(),
  ) {
    this.assertRequestInput(dto, requestedAt);
    const calculatedHash = computeOperationTerminationPayloadSha256(dto);
    if (calculatedHash !== dto.payloadSha256) {
      throw new BadRequestException(
        'payloadSha256 no corresponde al contenido canonico de la solicitud',
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const actor = await this.requireActor(
          transaction,
          user,
          [Role.ADMIN],
          'Solo una persona administradora activa puede solicitar el cierre excepcional',
        );
        await this.lockLifecycle(transaction, user.tenantId);
        const profile = await this.getLockedProfile(transaction, user.tenantId);
        await this.expirePendingRequest(
          transaction,
          user.tenantId,
          actor.id,
          requestedAt,
        );

        const existing =
          await transaction.operationTerminationRequest.findFirst({
            where: {
              tenantId: user.tenantId,
              clientRequestId: dto.clientRequestId,
            },
            select: TERMINATION_SELECT,
          });
        if (existing) {
          this.assertIdempotentRequest(existing, calculatedHash);
          return {
            request: this.toResponse(existing),
            dossier:
              existing.status === OperationTerminationStatus.APPROVED
                ? await this.buildDossier(transaction, existing)
                : null,
            created: false,
            noOp: true,
          };
        }
        if (!profile) {
          throw new ConflictException(
            'Configura el perfil operativo antes de solicitar su terminacion',
          );
        }
        if (profile.stage === PoliticalOperationStage.CLOSED) {
          throw new ConflictException({
            code: 'OPERATION_ALREADY_CLOSED',
            message:
              'Una operacion cerrada nunca puede reabrirse ni reclasificarse',
            closureType: profile.closureType,
          });
        }
        this.assertExpectedProfileVersion(
          profile,
          dto.expectedProfileUpdatedAt,
        );

        const pending = await transaction.operationTerminationRequest.findFirst(
          {
            where: {
              tenantId: user.tenantId,
              operationProfileId: profile.id,
              status: OperationTerminationStatus.PENDING,
            },
            select: { id: true, expiresAt: true },
          },
        );
        if (pending) {
          throw new ConflictException(
            `Ya existe una solicitud de terminacion pendiente (${pending.id}) hasta ${pending.expiresAt.toISOString()}`,
          );
        }

        const expiresAt = new Date(requestedAt.getTime() + TERMINATION_TTL_MS);
        const request = await transaction.operationTerminationRequest.create({
          data: {
            tenantId: user.tenantId,
            operationProfileId: profile.id,
            clientRequestId: dto.clientRequestId,
            payloadSha256: calculatedHash,
            profileSnapshotSha256: this.profileSnapshotSha256(profile),
            operationCycleSha256: this.operationCycleSha256(profile),
            expectedProfileUpdatedAt: new Date(dto.expectedProfileUpdatedAt),
            status: OperationTerminationStatus.PENDING,
            cause: dto.cause,
            otherCause: dto.otherCause?.trim() || null,
            effectiveAt: new Date(dto.effectiveAt),
            explanation: dto.explanation.trim(),
            authorityName: dto.authorityName.trim(),
            officialActType: dto.officialActType.trim(),
            officialActReference: dto.officialActReference.trim(),
            officialActIssuedAt: new Date(dto.officialActIssuedAt),
            evidenceReference: dto.evidenceReference.trim(),
            evidenceSha256: dto.evidenceSha256.toLowerCase(),
            consequencesAcknowledged: true,
            expiresAt,
            requestedById: actor.id,
          },
          select: TERMINATION_SELECT,
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: actor.id,
            action: 'OPERATION_TERMINATION_REQUESTED',
            resourceType: 'OperationTerminationRequest',
            resourceId: request.id,
            after: this.auditSnapshot(request),
          },
        });
        return {
          request: this.toResponse(request),
          dossier: null,
          created: true,
          noOp: false,
        };
      }, SERIALIZABLE_OPTIONS);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        return this.resolveConcurrentRequest(user, dto, calculatedHash);
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'El perfil o la solicitud cambio concurrentemente; recargue e intente nuevamente',
        );
      }
      throw error;
    }
  }

  async reviewTermination(
    user: AuthenticatedUser,
    requestId: string,
    dto: ReviewOperationTerminationDto,
    reviewedAt = new Date(),
  ) {
    this.assertReviewInput(requestId, dto, reviewedAt);
    const calculatedHash = computeOperationTerminationReviewSha256(
      requestId,
      dto,
    );
    if (calculatedHash !== dto.reviewPayloadSha256) {
      throw new BadRequestException(
        'reviewPayloadSha256 no corresponde al contenido canonico de la revision',
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const reviewer = await this.requireActor(
          transaction,
          user,
          REVIEW_ROLES,
          'La revision exige una persona activa con rol de cumplimiento o auditoria',
        );
        await this.lockLifecycle(transaction, user.tenantId);
        const profile = await this.getLockedProfile(transaction, user.tenantId);
        await this.expirePendingRequest(
          transaction,
          user.tenantId,
          reviewer.id,
          reviewedAt,
        );
        const request = await transaction.operationTerminationRequest.findFirst(
          {
            where: { id: requestId, tenantId: user.tenantId },
            select: TERMINATION_SELECT,
          },
        );
        if (!request) {
          throw new NotFoundException(
            'Solicitud de terminacion excepcional no encontrada',
          );
        }
        if (request.payloadSha256 !== dto.expectedPayloadSha256) {
          throw new ConflictException(
            'El hash revisado no corresponde a la solicitud almacenada',
          );
        }
        if (request.status === OperationTerminationStatus.EXPIRED) {
          return {
            request: this.toResponse(request),
            dossier: null,
            reviewed: false,
            expired: true,
            noOp: true,
          };
        }
        if (request.status !== OperationTerminationStatus.PENDING) {
          this.assertIdempotentReview(
            request,
            dto.clientReviewId,
            calculatedHash,
          );
          return {
            request: this.toResponse(request),
            dossier:
              request.status === OperationTerminationStatus.APPROVED
                ? await this.buildDossier(transaction, request)
                : null,
            reviewed: true,
            approved: request.status === OperationTerminationStatus.APPROVED,
            noOp: true,
            profile: profile ? this.toProfileResponse(profile) : undefined,
          };
        }
        if (request.requestedById === reviewer.id) {
          throw new ForbiddenException(
            'La persona solicitante no puede revisar su propio cierre excepcional',
          );
        }
        if (dto.decision === OperationTerminationDecision.REJECT) {
          return this.rejectRequest(
            transaction,
            request,
            reviewer.id,
            dto,
            calculatedHash,
            reviewedAt,
          );
        }
        if (!profile || profile.id !== request.operationProfileId) {
          throw new ConflictException(
            'El perfil ligado a la solicitud ya no existe en esta organizacion',
          );
        }
        return this.approveRequest(
          transaction,
          profile,
          request,
          reviewer.id,
          dto,
          calculatedHash,
          reviewedAt,
        );
      }, SERIALIZABLE_OPTIONS);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'La terminacion o revision ya fue decidida concurrentemente; recargue el estado',
        );
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'La solicitud o el perfil cambio durante la revision; recargue e intente nuevamente',
        );
      }
      throw error;
    }
  }

  async cancelTermination(
    user: AuthenticatedUser,
    requestId: string,
    dto: CancelOperationTerminationDto,
    cancelledAt = new Date(),
  ) {
    this.assertCancellationInput(requestId, dto, cancelledAt);
    const calculatedHash = computeOperationTerminationCancellationSha256(
      requestId,
      dto,
    );
    if (calculatedHash !== dto.cancellationPayloadSha256) {
      throw new BadRequestException(
        'cancellationPayloadSha256 no corresponde al contenido canonico de la cancelacion',
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const actor = await this.requireActor(
          transaction,
          user,
          [Role.ADMIN],
          'Solo una persona administradora activa puede cancelar su solicitud pendiente',
        );
        await this.lockLifecycle(transaction, user.tenantId);
        await this.getLockedProfile(transaction, user.tenantId);
        await this.expirePendingRequest(
          transaction,
          user.tenantId,
          actor.id,
          cancelledAt,
        );
        const request = await transaction.operationTerminationRequest.findFirst(
          {
            where: { id: requestId, tenantId: user.tenantId },
            select: TERMINATION_SELECT,
          },
        );
        if (!request) {
          throw new NotFoundException(
            'Solicitud de terminacion excepcional no encontrada',
          );
        }
        if (request.payloadSha256 !== dto.expectedPayloadSha256) {
          throw new ConflictException(
            'El hash esperado no corresponde a la solicitud almacenada',
          );
        }
        if (request.status === OperationTerminationStatus.CANCELLED) {
          this.assertIdempotentCancellation(
            request,
            dto.clientCancellationId,
            calculatedHash,
          );
          return {
            request: this.toResponse(request),
            dossier: null,
            cancelled: true,
            noOp: true,
          };
        }
        if (request.status !== OperationTerminationStatus.PENDING) {
          throw new ConflictException(
            `Solo se puede cancelar una solicitud pendiente; el estado actual es ${request.status}`,
          );
        }
        if (request.requestedById !== actor.id) {
          throw new ForbiddenException(
            'Solo la persona administradora que solicito el cierre puede cancelarlo',
          );
        }
        const cancelled = await transaction.operationTerminationRequest.update({
          where: {
            id_tenantId: { id: request.id, tenantId: request.tenantId },
          },
          data: {
            status: OperationTerminationStatus.CANCELLED,
            cancelledById: actor.id,
            cancelledAt,
            cancellationClientRequestId: dto.clientCancellationId,
            cancellationPayloadSha256: calculatedHash,
            cancellationReason: dto.reason.trim(),
          },
          select: TERMINATION_SELECT,
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: actor.id,
            action: 'OPERATION_TERMINATION_CANCELLED',
            resourceType: 'OperationTerminationRequest',
            resourceId: request.id,
            before: this.auditSnapshot(request),
            after: this.auditSnapshot(cancelled),
          },
        });
        return {
          request: this.toResponse(cancelled),
          dossier: null,
          cancelled: true,
          noOp: false,
        };
      }, SERIALIZABLE_OPTIONS);
    } catch (error: unknown) {
      if (
        this.isPrismaError(error, 'P2002') ||
        this.isPrismaError(error, 'P2034')
      ) {
        throw new ConflictException(
          'La solicitud cambio durante la cancelacion; recargue e intente nuevamente',
        );
      }
      throw error;
    }
  }

  private async approveRequest(
    transaction: Prisma.TransactionClient,
    profile: SelectedTerminationProfile,
    request: SelectedTermination,
    reviewerId: string,
    dto: ReviewOperationTerminationDto,
    reviewPayloadSha256: string,
    reviewedAt: Date,
  ) {
    if (profile.stage === PoliticalOperationStage.CLOSED) {
      throw new ConflictException({
        code: 'OPERATION_ALREADY_CLOSED',
        message: 'La operacion ya fue cerrada y no puede reclasificarse',
        closureType: profile.closureType,
      });
    }
    this.assertStoredProfileBinding(profile, request);

    const communications = await transaction.communicationApproval.findMany({
      where: {
        tenantId: request.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        status: { in: [...OPEN_COMMUNICATION_STATUSES] },
      },
      select: { id: true, status: true, scheduledAt: true },
      orderBy: { id: 'asc' },
    });
    if (communications.length > 0) {
      await transaction.communicationApproval.updateMany({
        where: {
          tenantId: request.tenantId,
          id: { in: communications.map(({ id }) => id) },
          status: { in: [...OPEN_COMMUNICATION_STATUSES] },
        },
        data: { status: CommunicationApprovalStatus.CANCELLED },
      });
    }

    const approved = await transaction.operationTerminationRequest.update({
      where: { id_tenantId: { id: request.id, tenantId: request.tenantId } },
      data: {
        status: OperationTerminationStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt,
        reviewClientRequestId: dto.clientReviewId,
        reviewPayloadSha256,
        communicationsCancelledCount: communications.length,
      },
      select: TERMINATION_SELECT,
    });
    const closedProfile = await transaction.operationProfile.update({
      where: { id_tenantId: { id: profile.id, tenantId: profile.tenantId } },
      data: {
        stage: PoliticalOperationStage.CLOSED,
        closureType: OperationClosureType.CLOSED_EXCEPTIONAL,
        terminatedAt: request.effectiveAt,
        terminationCause: request.cause,
        terminationRequestId: request.id,
        updatedById: reviewerId,
      },
      select: PROFILE_TERMINATION_SELECT,
    });

    if (communications.length > 0) {
      await transaction.auditEvent.create({
        data: {
          tenantId: request.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          actorType: AuditActorType.USER,
          actorUserId: reviewerId,
          action: 'OPERATION_TERMINATION_COMMUNICATIONS_CANCELLED',
          resourceType: 'OperationTerminationRequest',
          resourceId: request.id,
          metadata: {
            count: communications.length,
            approvalIdsSha256: sha256(
              communications
                .map(({ id }) => id)
                .sort()
                .join('\n'),
            ),
            scheduledCount: communications.filter(({ scheduledAt }) =>
              Boolean(scheduledAt),
            ).length,
          },
        },
      });
    }
    await transaction.auditEvent.create({
      data: {
        tenantId: request.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: reviewerId,
        action: 'OPERATION_TERMINATION_APPROVED',
        resourceType: 'OperationTerminationRequest',
        resourceId: request.id,
        before: this.auditSnapshot(request),
        after: this.auditSnapshot(approved),
        metadata: {
          operationProfileId: profile.id,
          previousStage: profile.stage,
          resultingStage: PoliticalOperationStage.CLOSED,
          closureType: OperationClosureType.CLOSED_EXCEPTIONAL,
          profileSnapshotSha256: request.profileSnapshotSha256,
          operationCycleSha256: request.operationCycleSha256,
        },
      },
    });
    const dossier = await this.buildDossier(transaction, approved);
    return {
      request: this.toResponse(approved),
      dossier,
      profile: this.toProfileResponse(closedProfile),
      reviewed: true,
      approved: true,
      noOp: false,
    };
  }

  private async rejectRequest(
    transaction: Prisma.TransactionClient,
    request: SelectedTermination,
    reviewerId: string,
    dto: ReviewOperationTerminationDto,
    reviewPayloadSha256: string,
    reviewedAt: Date,
  ) {
    const reason = dto.rejectionReason?.trim();
    if (!reason || reason.length < 20) {
      throw new BadRequestException(
        'El rechazo exige una razon de al menos 20 caracteres',
      );
    }
    const rejected = await transaction.operationTerminationRequest.update({
      where: { id_tenantId: { id: request.id, tenantId: request.tenantId } },
      data: {
        status: OperationTerminationStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt,
        reviewClientRequestId: dto.clientReviewId,
        reviewPayloadSha256,
        rejectionReason: reason,
      },
      select: TERMINATION_SELECT,
    });
    await transaction.auditEvent.create({
      data: {
        tenantId: request.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: reviewerId,
        action: 'OPERATION_TERMINATION_REJECTED',
        resourceType: 'OperationTerminationRequest',
        resourceId: request.id,
        before: this.auditSnapshot(request),
        after: this.auditSnapshot(rejected),
      },
    });
    return {
      request: this.toResponse(rejected),
      dossier: null,
      reviewed: true,
      approved: false,
      noOp: false,
    };
  }

  private async expirePendingRequest(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    evaluatedAt: Date,
  ): Promise<void> {
    const pending = await transaction.operationTerminationRequest.findFirst({
      where: {
        tenantId,
        status: OperationTerminationStatus.PENDING,
        expiresAt: { lte: evaluatedAt },
      },
      select: TERMINATION_SELECT,
    });
    if (!pending) return;
    const expired = await transaction.operationTerminationRequest.update({
      where: { id_tenantId: { id: pending.id, tenantId } },
      data: {
        status: OperationTerminationStatus.EXPIRED,
        expiredAt: evaluatedAt,
      },
      select: TERMINATION_SELECT,
    });
    await transaction.auditEvent.create({
      data: {
        tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId,
        action: 'OPERATION_TERMINATION_EXPIRED',
        resourceType: 'OperationTerminationRequest',
        resourceId: pending.id,
        before: this.auditSnapshot(pending),
        after: this.auditSnapshot(expired),
      },
    });
  }

  private async buildDossier(
    transaction: Prisma.TransactionClient,
    request: SelectedTermination,
  ) {
    const [
      finance,
      activeNotices,
      communications,
      evidence,
      urgentCases,
      urgentTasks,
    ] = await Promise.all([
      transaction.financialEntry.count({
        where: {
          tenantId: request.tenantId,
          status: { in: [FinanceStatus.PENDING, FinanceStatus.APPROVED] },
        },
      }),
      transaction.consentNotice.count({
        where: {
          tenantId: request.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
          isActive: true,
          retiredAt: null,
        },
      }),
      transaction.communicationApproval.count({
        where: {
          tenantId: request.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          status: { in: [...OPEN_COMMUNICATION_STATUSES] },
        },
      }),
      transaction.storedObject.count({
        where: {
          tenantId: request.tenantId,
          status: StoredObjectStatus.CONFIRMED,
        },
      }),
      transaction.issueCase.count({
        where: {
          tenantId: request.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          priority: WorkPriority.URGENT,
          status: { in: [...OPEN_CASE_STATUSES] },
        },
      }),
      transaction.task.count({
        where: {
          tenantId: request.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          priority: WorkPriority.URGENT,
          status: { in: [...OPEN_TASK_STATUSES] },
        },
      }),
    ]);
    const urgent = urgentCases + urgentTasks;
    return {
      kind: 'EXCEPTIONAL_TERMINATION_SURVIVING_DUTIES' as const,
      generatedAt: new Date().toISOString(),
      complianceCertified: false as const,
      authorityFilingCertified: false as const,
      communicationsCancelledOnApproval:
        request.communicationsCancelledCount ?? 0,
      obligations: [
        {
          code: 'SURVIVING_FINANCE',
          category: 'FINANCE',
          status: finance > 0 ? 'ACTION_REQUIRED' : 'VERIFY',
          count: finance,
          label: 'Finanzas, libros y reportes',
          detail:
            finance > 0
              ? `${finance} movimientos siguen pendientes de revision o constancia de reporte.`
              : 'No se detectan movimientos pendientes, pero el cierre no certifica conciliacion ni radicacion ante autoridad.',
          href: '/dashboard/finance',
        },
        {
          code: 'SURVIVING_DATA_RIGHTS',
          category: 'DATA_RIGHTS',
          status: activeNotices > 0 ? 'PRESERVE' : 'ACTION_REQUIRED',
          count: activeNotices,
          label: 'Retencion y derechos de titulares',
          detail:
            activeNotices > 0
              ? 'Debe conservarse el canal de acceso, correccion, revocacion y supresion durante toda la retencion aplicable.'
              : 'No hay aviso activo verificable; debe habilitarse un canal de derechos sin reactivar la operacion politica.',
          href: '/dashboard/settings',
        },
        {
          code: 'SURVIVING_COMMUNICATIONS',
          category: 'COMMUNICATIONS',
          status: communications > 0 ? 'ACTION_REQUIRED' : 'VERIFY',
          count: communications,
          label: 'Comunicaciones futuras',
          detail:
            communications > 0
              ? `${communications} comunicaciones no publicadas aun requieren bloqueo o conciliacion.`
              : `${request.communicationsCancelledCount ?? 0} comunicaciones quedaron canceladas al aprobar; verifique canales externos y proveedores.`,
          href: '/dashboard/communications',
        },
        {
          code: 'SURVIVING_EVIDENCE',
          category: 'EVIDENCE',
          status: 'PRESERVE',
          count: evidence + 1,
          label: 'Evidencia y expediente',
          detail: `Preserve la referencia y SHA-256 causal junto con ${evidence} objetos confirmados; no elimine evidencia por efecto del cierre.`,
          href: '/dashboard/audit',
        },
        {
          code: 'SURVIVING_URGENT_WORK',
          category: 'URGENT_WORK',
          status: urgent > 0 ? 'ACTION_REQUIRED' : 'VERIFY',
          count: urgent,
          label: 'Casos y tareas urgentes',
          detail:
            urgent > 0
              ? `${urgentCases} casos y ${urgentTasks} tareas urgentes siguen abiertos y deben resolverse por una ruta autorizada.`
              : 'No se detectan asuntos urgentes abiertos; esta observacion no equivale a cierre material de expedientes.',
          href: '/dashboard/incidents',
        },
      ],
      disclaimer:
        'El cierre excepcional detiene la operacion politica, pero no acredita cumplimiento financiero, escrutinio, radicacion ante autoridad ni extincion de deberes legales, contractuales o de proteccion de datos.',
    };
  }

  private async requireActor(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    roles: readonly Role[],
    forbiddenMessage: string,
  ) {
    const tenant = await transaction.tenant.findUnique({
      where: { id: user.tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    if (!tenant) throw new NotFoundException('Organizacion no encontrada');
    assertCampaignTenant(tenant);
    const locked = await transaction.$queryRaw<
      Array<{ id: string; role: Role }>
    >(Prisma.sql`
      SELECT "id", "role"
      FROM "User"
      WHERE "id" = ${user.userId}
        AND "tenantId" = ${user.tenantId}
        AND "isActive" = true
        AND "role"::text IN (${Prisma.join(roles.map((role) => role))})
      FOR KEY SHARE
    `);
    const actor = locked[0];
    if (!actor) throw new ForbiddenException(forbiddenMessage);
    return actor;
  }

  private async lockLifecycle(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      WITH operation_termination_lifecycle_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`operation-profile-lifecycle:${tenantId}`}, 0)
        )
      )
      SELECT TRUE AS "locked" FROM operation_termination_lifecycle_lock
    `);
  }

  private async getLockedProfile(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<SelectedTerminationProfile | null> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "OperationProfile" WHERE "tenantId" = ${tenantId} FOR UPDATE`,
    );
    return transaction.operationProfile.findUnique({
      where: { tenantId },
      select: PROFILE_TERMINATION_SELECT,
    });
  }

  private assertRequestInput(
    dto: CreateOperationTerminationDto,
    requestedAt: Date,
  ): void {
    if (!UUID_V4_PATTERN.test(dto.clientRequestId)) {
      throw new BadRequestException('clientRequestId debe ser un UUID v4');
    }
    if (
      !SHA256_PATTERN.test(dto.payloadSha256) ||
      !SHA256_PATTERN.test(dto.evidenceSha256)
    ) {
      throw new BadRequestException(
        'payloadSha256 y evidenceSha256 deben ser SHA-256 hexadecimales en minuscula',
      );
    }
    if (!dto.consequencesAcknowledged) {
      throw new BadRequestException(
        'Debe reconocer expresamente las obligaciones que sobreviven al cierre',
      );
    }
    const explanation = dto.explanation.trim();
    if (explanation.length < 120 || explanation.length > 6_000) {
      throw new BadRequestException(
        'La explicacion debe tener entre 120 y 6000 caracteres',
      );
    }
    const otherCause = dto.otherCause?.trim();
    if (
      (dto.cause === OperationTerminationCause.OTHER &&
        (!otherCause || otherCause.length < 50)) ||
      (dto.cause !== OperationTerminationCause.OTHER && Boolean(otherCause))
    ) {
      throw new BadRequestException(
        'OTHER exige una causal detallada; una causal explicita no puede reclasificarse con texto libre',
      );
    }
    this.assertEvidenceReference(dto.evidenceReference);
    const effectiveAt = new Date(dto.effectiveAt);
    const officialActIssuedAt = new Date(dto.officialActIssuedAt);
    const expectedUpdatedAt = new Date(dto.expectedProfileUpdatedAt);
    for (const value of [
      requestedAt,
      effectiveAt,
      officialActIssuedAt,
      expectedUpdatedAt,
    ]) {
      if (!Number.isFinite(value.getTime())) {
        throw new BadRequestException(
          'La solicitud contiene una fecha invalida',
        );
      }
    }
    if (
      effectiveAt.getTime() > requestedAt.getTime() ||
      officialActIssuedAt.getTime() > requestedAt.getTime()
    ) {
      throw new BadRequestException(
        'La fecha efectiva y la expedicion del acto no pueden estar en el futuro',
      );
    }
  }

  private assertReviewInput(
    requestId: string,
    dto: ReviewOperationTerminationDto,
    reviewedAt: Date,
  ): void {
    this.assertRequestId(requestId);
    if (!UUID_V4_PATTERN.test(dto.clientReviewId)) {
      throw new BadRequestException('clientReviewId debe ser un UUID v4');
    }
    if (
      !SHA256_PATTERN.test(dto.expectedPayloadSha256) ||
      !SHA256_PATTERN.test(dto.reviewPayloadSha256)
    ) {
      throw new BadRequestException('Los hashes de revision no son validos');
    }
    if (!Number.isFinite(reviewedAt.getTime())) {
      throw new BadRequestException('La fecha de revision no es valida');
    }
    const reason = dto.rejectionReason?.trim();
    if (
      (dto.decision === OperationTerminationDecision.REJECT &&
        (!reason || reason.length < 20)) ||
      (dto.decision === OperationTerminationDecision.APPROVE && Boolean(reason))
    ) {
      throw new BadRequestException(
        'El rechazo exige una razon concreta y la aprobacion no admite razon de rechazo',
      );
    }
  }

  private assertCancellationInput(
    requestId: string,
    dto: CancelOperationTerminationDto,
    cancelledAt: Date,
  ): void {
    this.assertRequestId(requestId);
    if (!UUID_V4_PATTERN.test(dto.clientCancellationId)) {
      throw new BadRequestException('clientCancellationId debe ser un UUID v4');
    }
    if (
      !SHA256_PATTERN.test(dto.expectedPayloadSha256) ||
      !SHA256_PATTERN.test(dto.cancellationPayloadSha256)
    ) {
      throw new BadRequestException('Los hashes de cancelacion no son validos');
    }
    if (dto.reason.trim().length < 20) {
      throw new BadRequestException(
        'La cancelacion exige una razon de al menos 20 caracteres',
      );
    }
    if (!Number.isFinite(cancelledAt.getTime())) {
      throw new BadRequestException('La fecha de cancelacion no es valida');
    }
  }

  private assertRequestId(requestId: string): void {
    if (!requestId.trim() || requestId.length > 128) {
      throw new BadRequestException(
        'El identificador de solicitud no es valido',
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
        'La evidencia debe usar una referencia HTTPS durable, sin credenciales embebidas',
      );
    }
  }

  private assertExpectedProfileVersion(
    profile: SelectedTerminationProfile,
    expectedUpdatedAt: string,
  ): void {
    if (profile.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new ConflictException(
        'El perfil cambio desde que se abrio; recargue antes de solicitar el cierre',
      );
    }
  }

  private assertStoredProfileBinding(
    profile: SelectedTerminationProfile,
    request: SelectedTermination,
  ): void {
    if (
      profile.updatedAt.getTime() !==
        request.expectedProfileUpdatedAt.getTime() ||
      this.profileSnapshotSha256(profile) !== request.profileSnapshotSha256 ||
      this.operationCycleSha256(profile) !== request.operationCycleSha256
    ) {
      throw new ConflictException({
        code: 'TERMINATION_PROFILE_CHANGED',
        message:
          'El perfil o ciclo electoral cambio despues de solicitar la terminacion; cancele o rechace esta solicitud y cree una nueva',
      });
    }
  }

  private profileSnapshotSha256(profile: SelectedTerminationProfile): string {
    return sha256(
      JSON.stringify({
        id: profile.id,
        tenantId: profile.tenantId,
        operationType: profile.operationType,
        stage: profile.stage,
        electionType: profile.electionType,
        circumscriptionType: profile.circumscriptionType,
        circumscriptionName: profile.circumscriptionName,
        circumscriptionCode: profile.circumscriptionCode,
        listType: profile.listType,
        electionDate: profile.electionDate.toISOString(),
        votingStartDate: toStoredDateOnlyKey(profile.votingStartDate),
        votingEndDate: toStoredDateOnlyKey(profile.votingEndDate),
        votingWindowSourceUrl: profile.votingWindowSourceUrl,
        votingWindowReference: profile.votingWindowReference,
        expectedTeamSize: profile.expectedTeamSize,
        candidateCount: profile.candidateCount,
        dataControllerName: profile.dataControllerName,
        responsibleDataUserId: profile.responsibleDataUserId,
        retentionPeriodDays: profile.retentionPeriodDays,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      }),
    );
  }

  private operationCycleSha256(profile: SelectedTerminationProfile): string {
    return sha256(
      JSON.stringify({
        id: profile.id,
        tenantId: profile.tenantId,
        operationType: profile.operationType,
        electionType: profile.electionType,
        circumscriptionType: profile.circumscriptionType,
        circumscriptionName: profile.circumscriptionName,
        circumscriptionCode: profile.circumscriptionCode,
        electionDate: profile.electionDate.toISOString(),
        votingStartDate: toStoredDateOnlyKey(profile.votingStartDate),
        votingEndDate: toStoredDateOnlyKey(profile.votingEndDate),
        votingWindowSourceUrl: profile.votingWindowSourceUrl,
        votingWindowReference: profile.votingWindowReference,
      }),
    );
  }

  private assertIdempotentRequest(
    request: SelectedTermination,
    payloadSha256: string,
  ): void {
    if (request.payloadSha256 !== payloadSha256) {
      throw new ConflictException(
        'clientRequestId ya fue utilizado con un payload diferente',
      );
    }
  }

  private assertIdempotentReview(
    request: SelectedTermination,
    clientReviewId: string,
    reviewPayloadSha256: string,
  ): void {
    if (
      request.reviewClientRequestId?.toLowerCase() !==
        clientReviewId.toLowerCase() ||
      request.reviewPayloadSha256 !== reviewPayloadSha256
    ) {
      throw new ConflictException(
        `La solicitud ya termino en estado ${request.status} mediante otra revision`,
      );
    }
  }

  private assertIdempotentCancellation(
    request: SelectedTermination,
    clientCancellationId: string,
    cancellationPayloadSha256: string,
  ): void {
    if (
      request.cancellationClientRequestId?.toLowerCase() !==
        clientCancellationId.toLowerCase() ||
      request.cancellationPayloadSha256 !== cancellationPayloadSha256
    ) {
      throw new ConflictException(
        'La solicitud fue cancelada mediante otra operacion idempotente',
      );
    }
  }

  private async resolveConcurrentRequest(
    user: AuthenticatedUser,
    dto: CreateOperationTerminationDto,
    payloadSha256: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.requireActor(
        transaction,
        user,
        [Role.ADMIN],
        'Solo una persona administradora activa puede solicitar el cierre excepcional',
      );
      const existing = await transaction.operationTerminationRequest.findFirst({
        where: {
          tenantId: user.tenantId,
          clientRequestId: dto.clientRequestId,
        },
        select: TERMINATION_SELECT,
      });
      if (!existing) {
        throw new ConflictException(
          'Otra solicitud pendiente fue creada concurrentemente; recargue el estado',
        );
      }
      this.assertIdempotentRequest(existing, payloadSha256);
      return {
        request: this.toResponse(existing),
        dossier:
          existing.status === OperationTerminationStatus.APPROVED
            ? await this.buildDossier(transaction, existing)
            : null,
        created: false,
        noOp: true,
      };
    }, SERIALIZABLE_OPTIONS);
  }

  private auditSnapshot(request: SelectedTermination): Prisma.InputJsonObject {
    return {
      requestId: request.id,
      clientRequestId: request.clientRequestId,
      operationProfileId: request.operationProfileId,
      payloadSha256: request.payloadSha256,
      profileSnapshotSha256: request.profileSnapshotSha256,
      operationCycleSha256: request.operationCycleSha256,
      status: request.status,
      cause: request.cause,
      otherCauseSha256: request.otherCause ? sha256(request.otherCause) : null,
      effectiveAt: request.effectiveAt.toISOString(),
      explanationSha256: sha256(request.explanation),
      authorityNameSha256: sha256(request.authorityName),
      officialActTypeSha256: sha256(request.officialActType),
      officialActReferenceSha256: sha256(request.officialActReference),
      officialActIssuedAt: request.officialActIssuedAt.toISOString(),
      evidenceReferenceSha256: sha256(request.evidenceReference),
      evidenceSha256: request.evidenceSha256,
      consequencesAcknowledged: request.consequencesAcknowledged,
      expiresAt: request.expiresAt.toISOString(),
      expiredAt: request.expiredAt?.toISOString() ?? null,
      requestedById: request.requestedById,
      reviewedById: request.reviewedById,
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      reviewClientRequestId: request.reviewClientRequestId,
      reviewPayloadSha256: request.reviewPayloadSha256,
      rejectionReasonSha256: request.rejectionReason
        ? sha256(request.rejectionReason)
        : null,
      communicationsCancelledCount: request.communicationsCancelledCount,
      cancelledById: request.cancelledById,
      cancelledAt: request.cancelledAt?.toISOString() ?? null,
      cancellationClientRequestId: request.cancellationClientRequestId,
      cancellationPayloadSha256: request.cancellationPayloadSha256,
      cancellationReasonSha256: request.cancellationReason
        ? sha256(request.cancellationReason)
        : null,
    };
  }

  private toResponse(request: SelectedTermination) {
    return {
      ...request,
      expectedProfileUpdatedAt: request.expectedProfileUpdatedAt.toISOString(),
      effectiveAt: request.effectiveAt.toISOString(),
      officialActIssuedAt: request.officialActIssuedAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
      expiredAt: request.expiredAt?.toISOString() ?? null,
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      cancelledAt: request.cancelledAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  private toProfileResponse(profile: SelectedTerminationProfile) {
    return {
      id: profile.id,
      stage: profile.stage,
      updatedAt: profile.updatedAt.toISOString(),
      votingStartDate: toStoredDateOnlyKey(profile.votingStartDate),
      votingEndDate: toStoredDateOnlyKey(profile.votingEndDate),
      votingWindowSourceUrl: profile.votingWindowSourceUrl,
      votingWindowReference: profile.votingWindowReference,
      closureType: profile.closureType,
      terminatedAt: profile.terminatedAt?.toISOString() ?? null,
      terminationCause: profile.terminationCause,
    };
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
