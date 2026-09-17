import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  ElectoralCatalogStatus,
  ElectoralCatalogType,
  OperationStageAdoptionStatus,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  WitnessAssignmentStatus,
  WitnessCaptureContext,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADOPTABLE_OPERATION_STAGES,
  CreateOperationStageAdoptionDto,
  OperationAdoptionDecision,
  ReviewOperationStageAdoptionDto,
} from './dto/operation-stage-adoption.dto';
import { getOperationProfileCoherenceError } from './dto/upsert-operation-profile.dto';
import {
  electionOperatingWindowSha256,
  normalizeElectionOperatingWindow,
  toStoredDateOnlyKey,
} from './election-operating-window';
import {
  getElectionDayReadinessBlockers,
  hasExactActiveElectoralProjection,
  toBogotaDateKey,
  type ReadinessDivision,
} from './operation-readiness';

const ADOPTION_TTL_MS = 72 * 60 * 60 * 1_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADOPTION_REVIEW_ROLES: readonly Role[] = [
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
const ADOPTION_READ_ROLES: readonly Role[] = [
  Role.ADMIN,
  ...ADOPTION_REVIEW_ROLES,
];
const DATA_RESPONSIBLE_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
];
const ADOPTABLE_STAGE_SET = new Set<PoliticalOperationStage>(
  ADOPTABLE_OPERATION_STAGES,
);

const ADOPTION_SELECT = {
  id: true,
  tenantId: true,
  clientRequestId: true,
  payloadSha256: true,
  status: true,
  operationType: true,
  targetStage: true,
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
  maxTotalBudget: true,
  maxPublicityLimit: true,
  dataControllerName: true,
  responsibleDataUserId: true,
  retentionPeriodDays: true,
  revocationProcedure: true,
  effectiveAt: true,
  justification: true,
  evidenceReference: true,
  evidenceSha256: true,
  incompleteHistoryAcknowledged: true,
  expiresAt: true,
  expiredAt: true,
  requestedById: true,
  reviewedById: true,
  reviewedAt: true,
  reviewClientRequestId: true,
  reviewPayloadSha256: true,
  rejectionReason: true,
  operationProfileId: true,
  createdAt: true,
  updatedAt: true,
  requestedBy: { select: { id: true, name: true, role: true } },
  reviewedBy: { select: { id: true, name: true, role: true } },
  responsibleDataUser: { select: { id: true, name: true, role: true } },
} satisfies Prisma.OperationStageAdoptionRequestSelect;

type SelectedAdoption = Prisma.OperationStageAdoptionRequestGetPayload<{
  select: typeof ADOPTION_SELECT;
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

/** Canonical hash contract shared with a future client implementation. */
export function computeOperationAdoptionPayloadSha256(
  dto: CreateOperationStageAdoptionDto,
): string {
  const electionWindow = normalizeElectionOperatingWindow(dto);
  return sha256(
    JSON.stringify({
      clientRequestId: dto.clientRequestId.toLowerCase(),
      operationType: dto.operationType,
      targetStage: dto.targetStage,
      electionType: dto.electionType,
      circumscriptionType: dto.circumscriptionType,
      circumscriptionName: dto.circumscriptionName.trim(),
      circumscriptionCode: dto.circumscriptionCode?.trim() || null,
      listType: dto.listType ?? null,
      electionDate: isoDate(dto.electionDate),
      votingStartDate: electionWindow.votingStartDateKey,
      votingEndDate: electionWindow.votingEndDateKey,
      votingWindowSourceUrl: electionWindow.votingWindowSourceUrl,
      votingWindowReference: electionWindow.votingWindowReference,
      expectedTeamSize: dto.expectedTeamSize,
      candidateCount: dto.candidateCount,
      maxTotalBudget: String(dto.maxTotalBudget),
      maxPublicityLimit: String(dto.maxPublicityLimit),
      dataControllerName: dto.dataControllerName.trim(),
      responsibleDataUserId: dto.responsibleDataUserId.trim(),
      retentionPeriodDays: dto.retentionPeriodDays,
      revocationProcedure: dto.revocationProcedure.trim(),
      effectiveAt: isoDate(dto.effectiveAt),
      justification: dto.justification.trim(),
      evidenceReference: dto.evidenceReference.trim(),
      evidenceSha256: dto.evidenceSha256,
      incompleteHistoryAcknowledged: dto.incompleteHistoryAcknowledged,
    }),
  );
}

export function computeOperationAdoptionReviewSha256(
  requestId: string,
  dto: ReviewOperationStageAdoptionDto,
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

@Injectable()
export class OperationStageAdoptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(user: AuthenticatedUser, evaluatedAt = new Date()) {
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireActor(
        transaction,
        user,
        ADOPTION_READ_ROLES,
        'No tiene permisos vigentes para consultar adopciones de etapa',
      );
      await this.lockTenant(transaction, user.tenantId);
      await this.expirePendingRequest(
        transaction,
        user.tenantId,
        actor.id,
        evaluatedAt,
      );
      const [request, profile] = await Promise.all([
        transaction.operationStageAdoptionRequest.findFirst({
          where: { tenantId: user.tenantId },
          orderBy: { createdAt: 'desc' },
          select: ADOPTION_SELECT,
        }),
        transaction.operationProfile.findUnique({
          where: { tenantId: user.tenantId },
          select: { id: true, stage: true },
        }),
      ]);
      return {
        configured: Boolean(profile),
        profile,
        request: request ? this.toResponse(request) : null,
      };
    }, SERIALIZABLE_OPTIONS);
  }

  async requestAdoption(
    user: AuthenticatedUser,
    dto: CreateOperationStageAdoptionDto,
    requestedAt = new Date(),
  ) {
    this.assertRequestInput(dto, requestedAt);
    const electionWindow = normalizeElectionOperatingWindow(dto);
    const calculatedHash = computeOperationAdoptionPayloadSha256(dto);
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
          'Solo una persona administradora activa puede solicitar la adopcion de una etapa',
        );
        await this.lockTenant(transaction, user.tenantId);
        await this.expirePendingRequest(
          transaction,
          user.tenantId,
          actor.id,
          requestedAt,
        );

        const existing =
          await transaction.operationStageAdoptionRequest.findFirst({
            where: {
              tenantId: user.tenantId,
              clientRequestId: dto.clientRequestId,
            },
            select: ADOPTION_SELECT,
          });
        if (existing) {
          this.assertIdempotentRequest(existing, calculatedHash);
          return {
            request: this.toResponse(existing),
            created: false,
            noOp: true,
          };
        }

        const [profile, pending, responsible] = await Promise.all([
          transaction.operationProfile.findUnique({
            where: { tenantId: user.tenantId },
            select: { id: true, stage: true },
          }),
          transaction.operationStageAdoptionRequest.findFirst({
            where: {
              tenantId: user.tenantId,
              status: OperationStageAdoptionStatus.PENDING,
            },
            select: { id: true, expiresAt: true },
          }),
          this.findResponsible(
            transaction,
            user.tenantId,
            dto.responsibleDataUserId,
          ),
        ]);
        if (profile) {
          throw new ConflictException(
            'Ya existe un perfil operativo; use exclusivamente el flujo ordinario de actualizacion',
          );
        }
        if (pending) {
          throw new ConflictException(
            `Ya existe una solicitud de adopcion pendiente (${pending.id}) hasta ${pending.expiresAt.toISOString()}`,
          );
        }
        if (!responsible) {
          throw new BadRequestException(
            'El responsable de datos debe seguir activo, pertenecer al tenant y tener rol autorizado',
          );
        }

        await this.assertTargetReadiness(
          transaction,
          user.tenantId,
          dto.targetStage,
          electionWindow.votingStartDate,
          electionWindow.votingEndDate,
          requestedAt,
        );

        const expiresAt = new Date(requestedAt.getTime() + ADOPTION_TTL_MS);
        const request = await transaction.operationStageAdoptionRequest.create({
          data: {
            tenantId: user.tenantId,
            clientRequestId: dto.clientRequestId,
            payloadSha256: calculatedHash,
            operationType: dto.operationType,
            targetStage: dto.targetStage,
            electionType: dto.electionType,
            circumscriptionType: dto.circumscriptionType,
            circumscriptionName: dto.circumscriptionName.trim(),
            circumscriptionCode: dto.circumscriptionCode?.trim() || null,
            listType: dto.listType ?? null,
            electionDate: electionWindow.electionDate,
            votingStartDate: electionWindow.votingStartDate,
            votingEndDate: electionWindow.votingEndDate,
            votingWindowSourceUrl: electionWindow.votingWindowSourceUrl,
            votingWindowReference: electionWindow.votingWindowReference,
            expectedTeamSize: dto.expectedTeamSize,
            candidateCount: dto.candidateCount,
            maxTotalBudget: new Prisma.Decimal(String(dto.maxTotalBudget)),
            maxPublicityLimit: new Prisma.Decimal(
              String(dto.maxPublicityLimit),
            ),
            dataControllerName: dto.dataControllerName.trim(),
            responsibleDataUserId: responsible.id,
            retentionPeriodDays: dto.retentionPeriodDays,
            revocationProcedure: dto.revocationProcedure.trim(),
            effectiveAt: new Date(dto.effectiveAt),
            justification: dto.justification.trim(),
            evidenceReference: dto.evidenceReference.trim(),
            evidenceSha256: dto.evidenceSha256,
            incompleteHistoryAcknowledged: true,
            expiresAt,
            requestedById: actor.id,
          },
          select: ADOPTION_SELECT,
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: actor.id,
            action: 'OPERATION_STAGE_ADOPTION_REQUESTED',
            resourceType: 'OperationStageAdoptionRequest',
            resourceId: request.id,
            after: this.auditSnapshot(request),
          },
        });
        return {
          request: this.toResponse(request),
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
          'La configuracion o solicitud cambio concurrentemente; recargue e intente nuevamente',
        );
      }
      throw error;
    }
  }

  async reviewAdoption(
    user: AuthenticatedUser,
    requestId: string,
    dto: ReviewOperationStageAdoptionDto,
    reviewedAt = new Date(),
  ) {
    this.assertReviewInput(requestId, dto, reviewedAt);
    const calculatedReviewHash = computeOperationAdoptionReviewSha256(
      requestId,
      dto,
    );
    if (calculatedReviewHash !== dto.reviewPayloadSha256) {
      throw new BadRequestException(
        'reviewPayloadSha256 no corresponde al contenido canonico de la revision',
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const reviewer = await this.requireActor(
          transaction,
          user,
          ADOPTION_REVIEW_ROLES,
          'La revision exige una persona activa con rol de cumplimiento o auditoria',
        );
        await this.lockTenant(transaction, user.tenantId);
        await this.expirePendingRequest(
          transaction,
          user.tenantId,
          reviewer.id,
          reviewedAt,
        );
        const request =
          await transaction.operationStageAdoptionRequest.findFirst({
            where: { id: requestId, tenantId: user.tenantId },
            select: ADOPTION_SELECT,
          });
        if (!request) {
          throw new NotFoundException('Solicitud de adopcion no encontrada');
        }
        if (request.payloadSha256 !== dto.expectedPayloadSha256) {
          throw new ConflictException(
            'El hash revisado no corresponde a la solicitud almacenada',
          );
        }
        if (request.status === OperationStageAdoptionStatus.EXPIRED) {
          return {
            request: this.toResponse(request),
            reviewed: false,
            expired: true,
            noOp: true,
          };
        }
        if (request.status !== OperationStageAdoptionStatus.PENDING) {
          this.assertIdempotentReview(
            request,
            dto.clientReviewId,
            calculatedReviewHash,
          );
          return {
            request: this.toResponse(request),
            reviewed: true,
            approved: request.status === OperationStageAdoptionStatus.APPROVED,
            noOp: true,
          };
        }
        if (request.requestedById === reviewer.id) {
          throw new ForbiddenException(
            'La persona solicitante no puede revisar su propia adopcion',
          );
        }

        if (dto.decision === OperationAdoptionDecision.REJECT) {
          return this.rejectRequest(
            transaction,
            request,
            reviewer.id,
            dto,
            calculatedReviewHash,
            reviewedAt,
          );
        }
        return this.approveRequest(
          transaction,
          request,
          reviewer.id,
          dto,
          calculatedReviewHash,
          reviewedAt,
        );
      }, SERIALIZABLE_OPTIONS);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'El perfil o la revision ya fue creado concurrentemente; recargue el estado',
        );
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'La solicitud cambio durante la revision; recargue e intente nuevamente',
        );
      }
      throw error;
    }
  }

  private async approveRequest(
    transaction: Prisma.TransactionClient,
    request: SelectedAdoption,
    reviewerId: string,
    dto: ReviewOperationStageAdoptionDto,
    reviewPayloadSha256: string,
    reviewedAt: Date,
  ) {
    this.assertStoredProfileCoherence(request);
    const [profile, responsible] = await Promise.all([
      transaction.operationProfile.findUnique({
        where: { tenantId: request.tenantId },
        select: { id: true, stage: true },
      }),
      this.findResponsible(
        transaction,
        request.tenantId,
        request.responsibleDataUserId,
      ),
    ]);
    if (profile) {
      throw new ConflictException(
        'Ya existe un perfil operativo; la adopcion no puede sobrescribirlo',
      );
    }
    if (!responsible) {
      throw new ConflictException(
        'El responsable de datos ya no esta activo o autorizado en este tenant',
      );
    }
    await this.assertTargetReadiness(
      transaction,
      request.tenantId,
      request.targetStage,
      request.votingStartDate,
      request.votingEndDate,
      reviewedAt,
    );

    const operationProfileId = randomUUID();
    const approved = await transaction.operationStageAdoptionRequest.update({
      where: {
        id_tenantId: { id: request.id, tenantId: request.tenantId },
      },
      data: {
        status: OperationStageAdoptionStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt,
        reviewClientRequestId: dto.clientReviewId,
        reviewPayloadSha256,
        operationProfileId,
      },
      select: ADOPTION_SELECT,
    });
    const settings = await transaction.campaignSettings.upsert({
      where: { tenantId: request.tenantId },
      create: {
        tenantId: request.tenantId,
        maxTotalBudget: request.maxTotalBudget,
        maxPublicityLimit: request.maxPublicityLimit,
      },
      update: {
        maxTotalBudget: request.maxTotalBudget,
        maxPublicityLimit: request.maxPublicityLimit,
      },
      select: { maxTotalBudget: true, maxPublicityLimit: true },
    });
    const profileCreated = await transaction.operationProfile.create({
      data: {
        id: operationProfileId,
        tenantId: request.tenantId,
        operationType: request.operationType,
        stage: request.targetStage,
        electionType: request.electionType,
        circumscriptionType: request.circumscriptionType,
        circumscriptionName: request.circumscriptionName,
        circumscriptionCode: request.circumscriptionCode,
        listType: request.listType,
        electionDate: request.electionDate,
        votingStartDate: request.votingStartDate,
        votingEndDate: request.votingEndDate,
        votingWindowSourceUrl: request.votingWindowSourceUrl,
        votingWindowReference: request.votingWindowReference,
        expectedTeamSize: request.expectedTeamSize,
        candidateCount: request.candidateCount,
        dataControllerName: request.dataControllerName,
        responsibleDataUserId: responsible.id,
        retentionPeriodDays: request.retentionPeriodDays,
        revocationProcedure: request.revocationProcedure,
        createdById: request.requestedById,
        updatedById: reviewerId,
      },
      select: { id: true, tenantId: true, stage: true },
    });

    await transaction.auditEvent.create({
      data: {
        tenantId: request.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: reviewerId,
        action: 'OPERATION_STAGE_ADOPTION_APPROVED',
        resourceType: 'OperationStageAdoptionRequest',
        resourceId: request.id,
        before: this.auditSnapshot(request),
        after: this.auditSnapshot(approved),
      },
    });
    await transaction.auditEvent.create({
      data: {
        tenantId: request.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: reviewerId,
        action: 'OPERATION_STAGE_ADOPTED',
        resourceType: 'OperationProfile',
        resourceId: profileCreated.id,
        after: this.profileAuditSnapshot(request, settings),
        metadata: {
          adoptionRequestId: request.id,
          payloadSha256: request.payloadSha256,
          evidenceSha256: request.evidenceSha256,
          effectiveAt: request.effectiveAt.toISOString(),
          requestedById: request.requestedById,
          reviewedById: reviewerId,
        },
      },
    });
    return {
      request: this.toResponse(approved),
      profile: profileCreated,
      reviewed: true,
      approved: true,
      noOp: false,
    };
  }

  private async rejectRequest(
    transaction: Prisma.TransactionClient,
    request: SelectedAdoption,
    reviewerId: string,
    dto: ReviewOperationStageAdoptionDto,
    reviewPayloadSha256: string,
    reviewedAt: Date,
  ) {
    const reason = dto.rejectionReason?.trim();
    if (!reason || reason.length < 20) {
      throw new BadRequestException(
        'El rechazo exige una razon de al menos 20 caracteres',
      );
    }
    const rejected = await transaction.operationStageAdoptionRequest.update({
      where: {
        id_tenantId: { id: request.id, tenantId: request.tenantId },
      },
      data: {
        status: OperationStageAdoptionStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt,
        reviewClientRequestId: dto.clientReviewId,
        reviewPayloadSha256,
        rejectionReason: reason,
      },
      select: ADOPTION_SELECT,
    });
    await transaction.auditEvent.create({
      data: {
        tenantId: request.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: reviewerId,
        action: 'OPERATION_STAGE_ADOPTION_REJECTED',
        resourceType: 'OperationStageAdoptionRequest',
        resourceId: request.id,
        before: this.auditSnapshot(request),
        after: this.auditSnapshot(rejected),
      },
    });
    return {
      request: this.toResponse(rejected),
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
  ): Promise<SelectedAdoption | null> {
    const pending = await transaction.operationStageAdoptionRequest.findFirst({
      where: {
        tenantId,
        status: OperationStageAdoptionStatus.PENDING,
        expiresAt: { lte: evaluatedAt },
      },
      select: ADOPTION_SELECT,
    });
    if (!pending) return null;
    const expired = await transaction.operationStageAdoptionRequest.update({
      where: { id_tenantId: { id: pending.id, tenantId } },
      data: {
        status: OperationStageAdoptionStatus.EXPIRED,
        expiredAt: evaluatedAt,
      },
      select: ADOPTION_SELECT,
    });
    await transaction.auditEvent.create({
      data: {
        tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId,
        action: 'OPERATION_STAGE_ADOPTION_EXPIRED',
        resourceType: 'OperationStageAdoptionRequest',
        resourceId: pending.id,
        before: this.auditSnapshot(pending),
        after: this.auditSnapshot(expired),
      },
    });
    return expired;
  }

  private async assertTargetReadiness(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    stage: PoliticalOperationStage,
    votingStartDate: Date,
    votingEndDate: Date,
    evaluatedAt: Date,
  ): Promise<void> {
    this.assertTemporalStage(stage, votingEndDate, evaluatedAt);
    if (stage !== PoliticalOperationStage.ELECTION_DAY) return;
    const [divisions, coverageWindows, assignments, activeCatalogReleases] =
      await Promise.all([
        transaction.politicalDivision.findMany({
          where: { tenantId, isActive: true },
          select: {
            id: true,
            code: true,
            name: true,
            parentId: true,
            type: true,
            expectedTables: true,
            sourceNamespace: true,
            sourceReleaseId: true,
          },
        }),
        transaction.witnessCoverageWindow.findMany({
          where: {
            tenantId,
            captureContext: WitnessCaptureContext.REAL,
          },
          select: {
            id: true,
            puestoId: true,
            localDate: true,
            startsAt: true,
            endsAt: true,
            timeZone: true,
            utcOffsetMinutes: true,
          },
        }),
        transaction.witnessAssignment.findMany({
          where: {
            tenantId,
            captureContext: WitnessCaptureContext.REAL,
            status: WitnessAssignmentStatus.CONFIRMED,
          },
          select: {
            coverageWindowId: true,
            puestoId: true,
            tableStart: true,
            tableEnd: true,
            shiftStartsAt: true,
            shiftEndsAt: true,
            assignmentType: true,
            status: true,
            witness: { select: { role: true, isActive: true } },
          },
        }),
        transaction.electoralCatalogRelease.findMany({
          where: {
            tenantId,
            type: ElectoralCatalogType.ELECTORAL_RNEC,
            status: ElectoralCatalogStatus.ACTIVE,
          },
          select: { id: true },
        }),
      ]);
    const blockers = getElectionDayReadinessBlockers(
      divisions as ReadinessDivision[],
      coverageWindows,
      assignments.map((assignment) => ({
        coverageWindowId: assignment.coverageWindowId,
        puestoId: assignment.puestoId,
        tableStart: assignment.tableStart,
        tableEnd: assignment.tableEnd,
        shiftStartsAt: assignment.shiftStartsAt,
        shiftEndsAt: assignment.shiftEndsAt,
        assignmentType: assignment.assignmentType,
        status: assignment.status,
        witnessEligible:
          assignment.witness.isActive &&
          assignment.witness.role === Role.WITNESS,
      })),
      votingStartDate,
      votingEndDate,
      evaluatedAt,
      hasExactActiveElectoralProjection(
        divisions as ReadinessDivision[],
        activeCatalogReleases.map((release) => release.id),
      ),
    );
    if (blockers.length) {
      throw new ConflictException({
        code: 'ELECTION_DAY_ADOPTION_READINESS_BLOCKED',
        message:
          'No se puede adoptar Dia D sin fecha civil de Bogota, territorio y testigos listos',
        blockers,
      });
    }
  }

  private assertRequestInput(
    dto: CreateOperationStageAdoptionDto,
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
    if (!ADOPTABLE_STAGE_SET.has(dto.targetStage)) {
      throw new BadRequestException(
        `La etapa ${dto.targetStage} no puede adoptarse por este flujo`,
      );
    }
    if (!dto.incompleteHistoryAcknowledged) {
      throw new BadRequestException(
        'Debe reconocer expresamente que el historial previo es incompleto',
      );
    }
    if (dto.justification.trim().length < 80) {
      throw new BadRequestException(
        'La justificacion de adopcion debe tener al menos 80 caracteres',
      );
    }
    if (!dto.evidenceReference.trim() || !dto.evidenceSha256) {
      throw new BadRequestException(
        'La referencia y el SHA-256 de la evidencia son obligatorios',
      );
    }
    const coherenceError = getOperationProfileCoherenceError(dto);
    if (coherenceError) throw new BadRequestException(coherenceError);
    const effectiveAt = new Date(dto.effectiveAt);
    if (
      !Number.isFinite(requestedAt.getTime()) ||
      !Number.isFinite(effectiveAt.getTime()) ||
      effectiveAt.getTime() > requestedAt.getTime()
    ) {
      throw new BadRequestException(
        'effectiveAt debe ser un instante valido y no puede estar en el futuro',
      );
    }
    this.assertTemporalStage(
      dto.targetStage,
      normalizeElectionOperatingWindow(dto).votingEndDate,
      requestedAt,
    );
  }

  private assertReviewInput(
    requestId: string,
    dto: ReviewOperationStageAdoptionDto,
    reviewedAt: Date,
  ): void {
    if (!requestId.trim() || requestId.length > 128) {
      throw new BadRequestException(
        'El identificador de adopcion no es valido',
      );
    }
    if (!UUID_V4_PATTERN.test(dto.clientReviewId)) {
      throw new BadRequestException('clientReviewId debe ser un UUID v4');
    }
    if (
      !SHA256_PATTERN.test(dto.expectedPayloadSha256) ||
      !SHA256_PATTERN.test(dto.reviewPayloadSha256)
    ) {
      throw new BadRequestException(
        'Los hashes de revision deben ser SHA-256 hexadecimales en minuscula',
      );
    }
    if (!Number.isFinite(reviewedAt.getTime())) {
      throw new BadRequestException('La fecha de revision no es valida');
    }
    const reason = dto.rejectionReason?.trim();
    if (dto.decision === OperationAdoptionDecision.REJECT) {
      if (!reason || reason.length < 20) {
        throw new BadRequestException(
          'El rechazo exige una razon de al menos 20 caracteres',
        );
      }
      return;
    }
    if (dto.decision !== OperationAdoptionDecision.APPROVE) {
      throw new BadRequestException('La decision de revision no es valida');
    }
    if (reason) {
      throw new BadRequestException(
        'Una aprobacion no puede incluir una razon de rechazo',
      );
    }
  }

  private assertTemporalStage(
    stage: PoliticalOperationStage,
    votingEndDate: Date,
    evaluatedAt: Date,
  ): void {
    if (
      !Number.isFinite(votingEndDate.getTime()) ||
      !Number.isFinite(evaluatedAt.getTime())
    ) {
      throw new BadRequestException('La fecha electoral no es valida');
    }
    if (
      stage === PoliticalOperationStage.POST_ELECTION &&
      toStoredDateOnlyKey(votingEndDate) >= toBogotaDateKey(evaluatedAt)
    ) {
      throw new BadRequestException(
        'POST_ELECTION solo puede adoptarse cuando la ventana electoral ya termino en Bogota',
      );
    }
  }

  private assertStoredProfileCoherence(request: SelectedAdoption): void {
    const error = getOperationProfileCoherenceError({
      operationType: request.operationType,
      electionType: request.electionType,
      listType: request.listType ?? undefined,
      candidateCount: request.candidateCount,
      maxTotalBudget: request.maxTotalBudget.toNumber(),
      maxPublicityLimit: request.maxPublicityLimit.toNumber(),
      electionDate: request.electionDate.toISOString(),
      votingStartDate: toStoredDateOnlyKey(request.votingStartDate),
      votingEndDate: toStoredDateOnlyKey(request.votingEndDate),
      votingWindowSourceUrl: request.votingWindowSourceUrl ?? undefined,
      votingWindowReference: request.votingWindowReference ?? undefined,
    });
    if (error) {
      throw new ConflictException(
        `La solicitud almacenada ya no satisface la coherencia del perfil: ${error}`,
      );
    }
  }

  private async requireActor(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    roles: readonly Role[],
    forbiddenMessage: string,
  ) {
    const [tenant, actor] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      transaction.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          isActive: true,
          role: { in: [...roles] },
        },
        select: { id: true, role: true },
      }),
    ]);
    if (!tenant) throw new NotFoundException('Organizacion no encontrada');
    assertCampaignTenant(tenant);
    if (!actor) throw new ForbiddenException(forbiddenMessage);
    return actor;
  }

  private findResponsible(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    responsibleDataUserId: string,
  ) {
    return transaction.user.findFirst({
      where: {
        id: responsibleDataUserId,
        tenantId,
        isActive: true,
        role: { in: [...DATA_RESPONSIBLE_ROLES] },
      },
      select: { id: true, role: true },
    });
  }

  private lockTenant(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<unknown> {
    return transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      WITH operation_stage_adoption_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`operation-stage-adoption:${tenantId}`}, 0)
        )
      )
      SELECT TRUE AS "locked" FROM operation_stage_adoption_lock
    `);
  }

  private assertIdempotentRequest(
    request: SelectedAdoption,
    payloadSha256: string,
  ): void {
    if (request.payloadSha256 !== payloadSha256) {
      throw new ConflictException(
        'clientRequestId ya fue utilizado con un payload diferente',
      );
    }
  }

  private assertIdempotentReview(
    request: SelectedAdoption,
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

  private async resolveConcurrentRequest(
    user: AuthenticatedUser,
    dto: CreateOperationStageAdoptionDto,
    payloadSha256: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.requireActor(
        transaction,
        user,
        [Role.ADMIN],
        'Solo una persona administradora activa puede solicitar la adopcion de una etapa',
      );
      const existing =
        await transaction.operationStageAdoptionRequest.findFirst({
          where: {
            tenantId: user.tenantId,
            clientRequestId: dto.clientRequestId,
          },
          select: ADOPTION_SELECT,
        });
      if (!existing) {
        throw new ConflictException(
          'Otra solicitud pendiente fue creada concurrentemente; recargue el estado',
        );
      }
      this.assertIdempotentRequest(existing, payloadSha256);
      return {
        request: this.toResponse(existing),
        created: false,
        noOp: true,
      };
    }, SERIALIZABLE_OPTIONS);
  }

  private toResponse(request: SelectedAdoption) {
    return {
      ...request,
      electionDate: request.electionDate.toISOString(),
      votingStartDate: toStoredDateOnlyKey(request.votingStartDate),
      votingEndDate: toStoredDateOnlyKey(request.votingEndDate),
      effectiveAt: request.effectiveAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
      expiredAt: request.expiredAt?.toISOString() ?? null,
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      maxTotalBudget: request.maxTotalBudget.toNumber(),
      maxPublicityLimit: request.maxPublicityLimit.toNumber(),
    };
  }

  private auditSnapshot(request: SelectedAdoption): Prisma.InputJsonObject {
    return {
      requestId: request.id,
      clientRequestId: request.clientRequestId,
      payloadSha256: request.payloadSha256,
      status: request.status,
      targetStage: request.targetStage,
      effectiveAt: request.effectiveAt.toISOString(),
      electionDate: request.electionDate.toISOString(),
      votingStartDate: toStoredDateOnlyKey(request.votingStartDate),
      votingEndDate: toStoredDateOnlyKey(request.votingEndDate),
      electionWindowSha256: electionOperatingWindowSha256({
        tenantId: request.tenantId,
        operationProfileId: request.id,
        electionDate: request.electionDate,
        votingStartDate: request.votingStartDate,
        votingEndDate: request.votingEndDate,
        votingWindowSourceUrl: request.votingWindowSourceUrl,
        votingWindowReference: request.votingWindowReference,
      }),
      votingWindowSourceUrlSha256: request.votingWindowSourceUrl
        ? sha256(request.votingWindowSourceUrl)
        : null,
      votingWindowReferenceSha256: request.votingWindowReference
        ? sha256(request.votingWindowReference)
        : null,
      evidenceSha256: request.evidenceSha256,
      evidenceReferenceSha256: sha256(request.evidenceReference),
      justificationSha256: sha256(request.justification),
      revocationProcedureSha256: sha256(request.revocationProcedure),
      incompleteHistoryAcknowledged: request.incompleteHistoryAcknowledged,
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
      operationProfileId: request.operationProfileId,
    };
  }

  private profileAuditSnapshot(
    request: SelectedAdoption,
    settings: {
      maxTotalBudget: Prisma.Decimal;
      maxPublicityLimit: Prisma.Decimal;
    },
  ): Prisma.InputJsonObject {
    return {
      operationType: request.operationType,
      stage: request.targetStage,
      electionType: request.electionType,
      circumscriptionType: request.circumscriptionType,
      circumscriptionName: request.circumscriptionName,
      circumscriptionCode: request.circumscriptionCode,
      listType: request.listType,
      electionDate: request.electionDate.toISOString(),
      votingStartDate: toStoredDateOnlyKey(request.votingStartDate),
      votingEndDate: toStoredDateOnlyKey(request.votingEndDate),
      electionWindowSha256: electionOperatingWindowSha256({
        tenantId: request.tenantId,
        operationProfileId: request.operationProfileId ?? request.id,
        electionDate: request.electionDate,
        votingStartDate: request.votingStartDate,
        votingEndDate: request.votingEndDate,
        votingWindowSourceUrl: request.votingWindowSourceUrl,
        votingWindowReference: request.votingWindowReference,
      }),
      expectedTeamSize: request.expectedTeamSize,
      candidateCount: request.candidateCount,
      maxTotalBudget: settings.maxTotalBudget.toString(),
      maxPublicityLimit: settings.maxPublicityLimit.toString(),
      dataControllerName: request.dataControllerName,
      responsibleDataUserId: request.responsibleDataUserId,
      retentionPeriodDays: request.retentionPeriodDays,
      revocationProcedureSha256: sha256(request.revocationProcedure),
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
