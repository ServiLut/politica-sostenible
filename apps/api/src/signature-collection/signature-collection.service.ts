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
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  Role,
  SignatureAuthorityOutcome,
  SignatureAuthorityReviewDecision,
  SignatureCollectionBatchStatus,
  SignatureCollectionCommandType,
  SignatureCollectionPlanStatus,
  SignatureCustodyEventType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdvanceSignatureBatchDto,
  CreateSignatureBatchDto,
  CreateSignatureCollectionPlanDto,
  IssueSignatureBatchDto,
  QuarantineSignatureBatchDto,
  RecordSignatureAuthorityResultDto,
  ReleaseSignatureBatchDto,
  ReturnSignatureBatchDto,
  ReviewSignatureAuthorityResultDto,
  ReviewSignatureBatchDto,
  SignatureBatchAdvanceAction,
} from './dto/signature-collection.dto';
import {
  computeSignatureCommandSha256,
  type SignatureCommandName,
} from './signature-collection.hash';
import { evaluateSignatureCollectionReadiness } from './signature-collection.readiness';

const READ_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
const MANAGEMENT_ROLES: readonly Role[] = [Role.ADMIN, Role.CAMPAIGN_MANAGER];
const FIELD_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
];
const INTERNAL_REVIEW_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
];
const AUTHORITY_REVIEW_ROLES: readonly Role[] = [
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
const RESPONSIBLE_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.ZONE_COORDINATOR,
];
const PLAN_STAGES: readonly PoliticalOperationStage[] = [
  PoliticalOperationStage.PRE_CAMPAIGN,
  PoliticalOperationStage.SIGNATURE_COLLECTION,
];
const COLLECTION_STAGES: readonly PoliticalOperationStage[] = [
  PoliticalOperationStage.SIGNATURE_COLLECTION,
];
const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const BATCH_CODE = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;

const PERSON_SELECT = {
  id: true,
  name: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

const COMMAND_SELECT = {
  id: true,
  clientRequestId: true,
  payloadSha256: true,
  type: true,
  actorUserId: true,
  resourceType: true,
  resourceId: true,
  createdAt: true,
} satisfies Prisma.SignatureCollectionCommandSelect;

const EVENT_SELECT = {
  id: true,
  type: true,
  previousStatus: true,
  nextStatus: true,
  territoryReference: true,
  physicalSealReference: true,
  observation: true,
  evidenceReference: true,
  evidenceSha256: true,
  plannedForms: true,
  issuedForms: true,
  returnedForms: true,
  annulledForms: true,
  missingForms: true,
  inCustodyForms: true,
  reportedSupports: true,
  internalAcceptedSupports: true,
  internalRejectedSupports: true,
  possibleDuplicateSupports: true,
  createdAt: true,
  actor: { select: PERSON_SELECT },
  receiver: { select: PERSON_SELECT },
} satisfies Prisma.SignatureCustodyEventSelect;

const BATCH_SELECT = {
  id: true,
  tenantId: true,
  operationProfileId: true,
  planId: true,
  code: true,
  physicalSealReference: true,
  territoryReference: true,
  expectedReturnAt: true,
  status: true,
  statusBeforeQuarantine: true,
  plannedForms: true,
  issuedForms: true,
  returnedForms: true,
  annulledForms: true,
  missingForms: true,
  inCustodyForms: true,
  reportedSupports: true,
  internalAcceptedSupports: true,
  internalRejectedSupports: true,
  possibleDuplicateSupports: true,
  currentCustodianUserId: true,
  issuedAt: true,
  returnedAt: true,
  internallyReviewedAt: true,
  deliveredToCommitteeAt: true,
  submittedToAuthorityAt: true,
  authorityResultRecordedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  currentCustodian: { select: PERSON_SELECT },
  custodyEvents: { select: EVENT_SELECT, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.SignatureCollectionBatchSelect;

const RESULT_SELECT = {
  id: true,
  tenantId: true,
  planId: true,
  authorityName: true,
  authorityActReference: true,
  authorityActIssuedAt: true,
  evidenceReference: true,
  evidenceSha256: true,
  submittedSupports: true,
  validSupports: true,
  invalidSupports: true,
  outcome: true,
  createdAt: true,
  recordedBy: { select: PERSON_SELECT },
  review: {
    select: {
      id: true,
      decision: true,
      reason: true,
      reviewedAt: true,
      reviewedBy: { select: PERSON_SELECT },
    },
  },
} satisfies Prisma.SignatureAuthorityResultSelect;

const PLAN_SELECT = {
  id: true,
  tenantId: true,
  operationProfileId: true,
  status: true,
  committeeMemberCount: true,
  committeeEvidenceReference: true,
  committeeEvidenceSha256: true,
  committeeRegisteredAt: true,
  collectionStartsAt: true,
  collectionClosesAt: true,
  candidateRegistrationClosesAt: true,
  requiredThreshold: true,
  internalTarget: true,
  thresholdSourceUrl: true,
  thresholdSourceReference: true,
  thresholdSourceSha256: true,
  fileOwnerUserId: true,
  custodyOwnerUserId: true,
  formHandlingRules: true,
  deliveryPlan: true,
  contingencyPlan: true,
  submissionDueAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  fileOwner: { select: PERSON_SELECT },
  custodyOwner: { select: PERSON_SELECT },
} satisfies Prisma.SignatureCollectionPlanSelect;

type SelectedCommand = Prisma.SignatureCollectionCommandGetPayload<{
  select: typeof COMMAND_SELECT;
}>;
type SelectedBatch = Prisma.SignatureCollectionBatchGetPayload<{
  select: typeof BATCH_SELECT;
}>;
type SelectedPlan = Prisma.SignatureCollectionPlanGetPayload<{
  select: typeof PLAN_SELECT;
}>;
type SelectedResult = Prisma.SignatureAuthorityResultGetPayload<{
  select: typeof RESULT_SELECT;
}>;
type MutationContext = Readonly<{
  actor: { id: string; role: Role };
  profile: {
    id: string;
    stage: PoliticalOperationStage;
    operationType: PoliticalOperationType;
  };
}>;

type CommandResponse<T> = Readonly<{
  resource: T;
  command: SelectedCommand;
  noOp: boolean;
}>;

@Injectable()
export class SignatureCollectionService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(user: AuthenticatedUser, evaluatedAt = new Date()) {
    return this.prisma.$transaction(
      async (transaction) => {
        const context = await this.requireReadContext(transaction, user);
        const plan = await transaction.signatureCollectionPlan.findFirst({
          where: {
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
          select: PLAN_SELECT,
        });
        const operatorsPromise = transaction.user.findMany({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            role: { in: [...RESPONSIBLE_ROLES] },
          },
          select: PERSON_SELECT,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });
        const [batches, authorityResults, operators] = plan
          ? await Promise.all([
              transaction.signatureCollectionBatch.findMany({
                where: { tenantId: user.tenantId, planId: plan.id },
                select: BATCH_SELECT,
                orderBy: [{ expectedReturnAt: 'asc' }, { code: 'asc' }],
              }),
              transaction.signatureAuthorityResult.findMany({
                where: { tenantId: user.tenantId, planId: plan.id },
                select: RESULT_SELECT,
                orderBy: { createdAt: 'desc' },
              }),
              operatorsPromise,
            ])
          : [[], [], await operatorsPromise];
        const pendingCountCorrections =
          await transaction.signatureCountCorrectionProposal.count({
            where: {
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
              decision: null,
            },
          });
        const readiness = evaluateSignatureCollectionReadiness({
          plan: plan
            ? {
                status: plan.status,
                requiredThreshold: plan.requiredThreshold,
                fileOwnerActive: plan.fileOwner.isActive,
                custodyOwnerActive: plan.custodyOwner.isActive,
              }
            : null,
          batches,
          authorityResults: authorityResults.map((result) => ({
            validSupports: result.validSupports,
            outcome: result.outcome,
            decision: result.review?.decision ?? null,
          })),
          pendingCountCorrections,
        });
        const totals = this.aggregateBatches(batches);
        const collectionClose = plan?.collectionClosesAt ?? null;
        const daysRemaining = collectionClose
          ? Math.max(
              0,
              Math.ceil(
                (this.endOfUtcDate(collectionClose).getTime() -
                  evaluatedAt.getTime()) /
                  86_400_000,
              ),
            )
          : null;
        const remainingToTarget = plan
          ? Math.max(0, plan.internalTarget - totals.internalAcceptedSupports)
          : null;
        const pacePerDay =
          remainingToTarget === null || daysRemaining === null
            ? null
            : daysRemaining > 0
              ? Math.ceil(remainingToTarget / daysRemaining)
              : remainingToTarget;
        const overdueBatches = batches.filter(
          (batch) =>
            batch.expectedReturnAt.getTime() < evaluatedAt.getTime() &&
            new Set<SignatureCollectionBatchStatus>([
              SignatureCollectionBatchStatus.ISSUED,
              SignatureCollectionBatchStatus.PARTIALLY_RETURNED,
              SignatureCollectionBatchStatus.QUARANTINED,
            ]).has(batch.status),
        ).length;

        return {
          operation: {
            id: context.profile.id,
            stage: context.profile.stage,
            operationType: context.profile.operationType,
          },
          readOnly:
            context.profile.stage === PoliticalOperationStage.CLOSED ||
            !COLLECTION_STAGES.includes(context.profile.stage),
          plan,
          batches,
          authorityResults,
          operators,
          readiness,
          summary: {
            ...totals,
            batchCount: batches.length,
            overdueBatches,
            quarantinedBatches: batches.filter(
              ({ status }) =>
                status === SignatureCollectionBatchStatus.QUARANTINED,
            ).length,
            pendingCountCorrections,
            remainingToTarget,
            daysRemaining,
            requiredDailyPace: pacePerDay,
          },
          evaluatedAt: evaluatedAt.toISOString(),
          authorityDisclaimer:
            'Los conteos internos no son oficiales. Solo una constancia de autoridad aprobada por una segunda persona y que certifique el umbral habilita la puerta a campaña.',
          privacyBoundary:
            'Este expediente no almacena nombres, documentos, direcciones, firmas ni imágenes de quienes brindan apoyo.',
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  createPlan(
    user: AuthenticatedUser,
    dto: CreateSignatureCollectionPlanDto,
  ): Promise<CommandResponse<SelectedPlan>> {
    this.assertPlanInput(dto);
    return this.runCommand({
      user,
      type: 'PLAN_CREATE',
      dto,
      roles: MANAGEMENT_ROLES,
      stages: PLAN_STAGES,
      resourceType: 'SignatureCollectionPlan',
      load: (transaction, resourceId) =>
        this.loadPlan(transaction, user.tenantId, resourceId),
      mutate: async (transaction, context, commandId, resourceId) => {
        const existing = await transaction.signatureCollectionPlan.findFirst({
          where: {
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException({
            code: 'SIGNATURE_PLAN_ALREADY_EXISTS',
            message:
              'El ciclo ya tiene un expediente de firmas; no se reemplaza ni duplica.',
          });
        }
        const [fileOwner, custodyOwner] = await Promise.all([
          this.requireActiveUser(
            transaction,
            user.tenantId,
            dto.fileOwnerUserId,
            RESPONSIBLE_ROLES,
          ),
          this.requireActiveUser(
            transaction,
            user.tenantId,
            dto.custodyOwnerUserId,
            RESPONSIBLE_ROLES,
          ),
        ]);
        if (fileOwner.id === custodyOwner.id) {
          throw new BadRequestException(
            'El responsable del expediente y el responsable de custodia deben ser personas distintas',
          );
        }
        await transaction.signatureCollectionPlan.create({
          data: {
            id: resourceId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            initialCommandId: commandId,
            committeeMemberCount: dto.committeeMemberCount,
            committeeEvidenceReference: dto.committeeEvidenceReference,
            committeeEvidenceSha256: dto.committeeEvidenceSha256,
            committeeRegisteredAt: this.dateOnly(dto.committeeRegisteredAt),
            collectionStartsAt: this.dateOnly(dto.collectionStartsAt),
            collectionClosesAt: this.dateOnly(dto.collectionClosesAt),
            candidateRegistrationClosesAt: this.dateOnly(
              dto.candidateRegistrationClosesAt,
            ),
            requiredThreshold: dto.requiredThreshold,
            internalTarget: dto.internalTarget,
            thresholdSourceUrl: dto.thresholdSourceUrl,
            thresholdSourceReference: dto.thresholdSourceReference,
            thresholdSourceSha256: dto.thresholdSourceSha256,
            fileOwnerUserId: fileOwner.id,
            custodyOwnerUserId: custodyOwner.id,
            formHandlingRules: dto.formHandlingRules,
            deliveryPlan: dto.deliveryPlan,
            contingencyPlan: dto.contingencyPlan,
            submissionDueAt: this.dateOnly(dto.submissionDueAt),
            createdById: context.actor.id,
          },
        });
      },
    });
  }

  createBatch(
    user: AuthenticatedUser,
    dto: CreateSignatureBatchDto,
  ): Promise<CommandResponse<SelectedBatch>> {
    this.assertBatchCreateInput(dto);
    return this.runCommand({
      user,
      type: 'BATCH_CREATE',
      dto,
      roles: MANAGEMENT_ROLES,
      stages: COLLECTION_STAGES,
      resourceType: 'SignatureCollectionBatch',
      load: (transaction, resourceId) =>
        this.loadBatch(transaction, user.tenantId, resourceId),
      mutate: async (transaction, context, commandId, resourceId) => {
        const plan = await this.requirePlan(transaction, user.tenantId);
        const createdAt = new Date();
        const expectedReturnAt = new Date(dto.expectedReturnAt);
        if (expectedReturnAt.getTime() < createdAt.getTime()) {
          throw new BadRequestException(
            'La fecha esperada de retorno debe ser posterior al registro del lote',
          );
        }
        const batch = await transaction.signatureCollectionBatch.create({
          data: {
            id: resourceId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            planId: plan.id,
            initialCommandId: commandId,
            code: dto.code.toUpperCase(),
            physicalSealReference: dto.physicalSealReference ?? null,
            territoryReference: dto.territoryReference,
            plannedForms: dto.plannedForms,
            expectedReturnAt,
            createdAt,
          },
        });
        await this.createCustodyEvent(transaction, {
          tenantId: user.tenantId,
          batch,
          commandId,
          type: SignatureCustodyEventType.PLANNED,
          previousStatus: SignatureCollectionBatchStatus.PLANNED,
          actorUserId: context.actor.id,
          receiverUserId: null,
          observation:
            'Lote fisico planificado sin afirmar entrega ni apoyos recolectados.',
          evidenceReference: null,
          evidenceSha256: null,
        });
      },
    });
  }

  issueBatch(
    user: AuthenticatedUser,
    batchId: string,
    dto: IssueSignatureBatchDto,
  ): Promise<CommandResponse<SelectedBatch>> {
    this.assertBatchId(batchId);
    this.assertBatchMutationInput(dto);
    if (!Number.isInteger(dto.issuedForms) || dto.issuedForms < 1) {
      throw new BadRequestException('La entrega debe incluir formularios');
    }
    return this.runBatchCommand(
      user,
      batchId,
      'BATCH_ISSUE',
      dto,
      FIELD_ROLES,
      async (transaction, context, commandId, batch) => {
        this.assertBatchVersion(batch, dto.expectedVersion);
        if (batch.status !== SignatureCollectionBatchStatus.PLANNED) {
          throw this.invalidBatchTransition(batch, 'entregar');
        }
        if (dto.issuedForms > batch.plannedForms) {
          throw new ConflictException(
            'No se pueden entregar mas formularios que los planificados',
          );
        }
        const receiver = await this.requireActiveUser(
          transaction,
          user.tenantId,
          dto.receiverUserId,
          RESPONSIBLE_ROLES,
        );
        const issuedAt = new Date();
        const updated = await transaction.signatureCollectionBatch.update({
          where: { id_tenantId: { id: batch.id, tenantId: user.tenantId } },
          data: {
            status: SignatureCollectionBatchStatus.ISSUED,
            issuedForms: dto.issuedForms,
            inCustodyForms: dto.issuedForms,
            currentCustodianUserId: receiver.id,
            physicalSealReference:
              dto.physicalSealReference ?? batch.physicalSealReference,
            issuedAt,
            version: { increment: 1 },
          },
        });
        await transaction.signatureCollectionPlan.update({
          where: { id_tenantId: { id: batch.planId, tenantId: user.tenantId } },
          data: { status: SignatureCollectionPlanStatus.COLLECTING },
        });
        await this.createCustodyEvent(transaction, {
          tenantId: user.tenantId,
          batch: updated,
          commandId,
          type: SignatureCustodyEventType.ISSUED,
          previousStatus: batch.status,
          actorUserId: context.actor.id,
          receiverUserId: receiver.id,
          observation: dto.observation,
          evidenceReference: dto.evidenceReference,
          evidenceSha256: dto.evidenceSha256,
        });
      },
    );
  }

  returnBatch(
    user: AuthenticatedUser,
    batchId: string,
    dto: ReturnSignatureBatchDto,
  ): Promise<CommandResponse<SelectedBatch>> {
    this.assertBatchId(batchId);
    this.assertBatchMutationInput(dto);
    for (const count of [
      dto.returnedForms,
      dto.annulledForms,
      dto.missingForms,
    ]) {
      if (!Number.isInteger(count) || count < 0) {
        throw new BadRequestException('Los conteos de retorno no son validos');
      }
    }
    return this.runBatchCommand(
      user,
      batchId,
      'BATCH_RETURN',
      dto,
      FIELD_ROLES,
      async (transaction, context, commandId, batch) => {
        this.assertBatchVersion(batch, dto.expectedVersion);
        if (
          !new Set<SignatureCollectionBatchStatus>([
            SignatureCollectionBatchStatus.ISSUED,
            SignatureCollectionBatchStatus.PARTIALLY_RETURNED,
          ]).has(batch.status)
        ) {
          throw this.invalidBatchTransition(batch, 'recibir');
        }
        if (
          dto.returnedForms < batch.returnedForms ||
          dto.annulledForms < batch.annulledForms ||
          dto.missingForms < batch.missingForms
        ) {
          throw new ConflictException({
            code: 'SIGNATURE_COUNTS_CANNOT_DECREASE',
            message:
              'Los conteos acumulados no se reducen por edicion; ponga el lote en cuarentena para investigar una correccion.',
          });
        }
        const accounted =
          dto.returnedForms + dto.annulledForms + dto.missingForms;
        if (accounted > batch.issuedForms) {
          throw new ConflictException(
            'Devueltos, anulados y faltantes superan los formularios entregados',
          );
        }
        const inCustodyForms = batch.issuedForms - accounted;
        if (dto.finalReturn !== (inCustodyForms === 0)) {
          throw new BadRequestException(
            dto.finalReturn
              ? 'Un retorno final debe conciliar todos los formularios entregados'
              : 'Marque retorno final cuando ya no queden formularios en custodia',
          );
        }
        if (!dto.finalReturn && accounted === 0) {
          throw new BadRequestException(
            'Un retorno parcial debe registrar al menos un formulario devuelto, anulado o faltante',
          );
        }
        const receiver = await this.requireActiveUser(
          transaction,
          user.tenantId,
          dto.receiverUserId,
          RESPONSIBLE_ROLES,
        );
        const status = dto.finalReturn
          ? SignatureCollectionBatchStatus.RETURNED
          : SignatureCollectionBatchStatus.PARTIALLY_RETURNED;
        const updated = await transaction.signatureCollectionBatch.update({
          where: { id_tenantId: { id: batch.id, tenantId: user.tenantId } },
          data: {
            status,
            returnedForms: dto.returnedForms,
            annulledForms: dto.annulledForms,
            missingForms: dto.missingForms,
            inCustodyForms,
            currentCustodianUserId: dto.finalReturn
              ? null
              : batch.currentCustodianUserId,
            returnedAt: dto.finalReturn ? new Date() : null,
            version: { increment: 1 },
          },
        });
        await this.createCustodyEvent(transaction, {
          tenantId: user.tenantId,
          batch: updated,
          commandId,
          type: dto.finalReturn
            ? SignatureCustodyEventType.FINAL_RETURN
            : SignatureCustodyEventType.PARTIAL_RETURN,
          previousStatus: batch.status,
          actorUserId: context.actor.id,
          receiverUserId: receiver.id,
          observation: dto.observation,
          evidenceReference: dto.evidenceReference,
          evidenceSha256: dto.evidenceSha256,
        });
      },
    );
  }

  reviewBatch(
    user: AuthenticatedUser,
    batchId: string,
    dto: ReviewSignatureBatchDto,
  ): Promise<CommandResponse<SelectedBatch>> {
    this.assertBatchId(batchId);
    this.assertBatchMutationInput(dto);
    return this.runBatchCommand(
      user,
      batchId,
      'BATCH_INTERNAL_REVIEW',
      dto,
      INTERNAL_REVIEW_ROLES,
      async (transaction, context, commandId, batch) => {
        this.assertBatchVersion(batch, dto.expectedVersion);
        if (batch.status !== SignatureCollectionBatchStatus.RETURNED) {
          throw this.invalidBatchTransition(batch, 'revisar internamente');
        }
        if (
          ![
            dto.reportedSupports,
            dto.internalAcceptedSupports,
            dto.internalRejectedSupports,
            dto.possibleDuplicateSupports,
          ].every((value) => Number.isInteger(value) && value >= 0)
        ) {
          throw new BadRequestException(
            'Los conteos de revision no son validos',
          );
        }
        if (
          dto.internalAcceptedSupports + dto.internalRejectedSupports !==
          dto.reportedSupports
        ) {
          throw new BadRequestException(
            'Aceptados internos mas rechazados internos deben ser iguales a los apoyos revisados',
          );
        }
        if (dto.possibleDuplicateSupports > dto.internalRejectedSupports) {
          throw new BadRequestException(
            'Los posibles duplicados no pueden superar los rechazos internos',
          );
        }
        const updated = await transaction.signatureCollectionBatch.update({
          where: { id_tenantId: { id: batch.id, tenantId: user.tenantId } },
          data: {
            status: SignatureCollectionBatchStatus.INTERNAL_REVIEWED,
            reportedSupports: dto.reportedSupports,
            internalAcceptedSupports: dto.internalAcceptedSupports,
            internalRejectedSupports: dto.internalRejectedSupports,
            possibleDuplicateSupports: dto.possibleDuplicateSupports,
            internallyReviewedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.createCustodyEvent(transaction, {
          tenantId: user.tenantId,
          batch: updated,
          commandId,
          type: SignatureCustodyEventType.INTERNAL_REVIEW,
          previousStatus: batch.status,
          actorUserId: context.actor.id,
          receiverUserId: null,
          observation: dto.observation,
          evidenceReference: dto.evidenceReference,
          evidenceSha256: dto.evidenceSha256,
        });
      },
    );
  }

  advanceBatch(
    user: AuthenticatedUser,
    batchId: string,
    dto: AdvanceSignatureBatchDto,
  ): Promise<CommandResponse<SelectedBatch>> {
    this.assertBatchId(batchId);
    this.assertBatchMutationInput(dto);
    const type: SignatureCommandName =
      dto.action === SignatureBatchAdvanceAction.DELIVER_TO_COMMITTEE
        ? 'BATCH_DELIVER_TO_COMMITTEE'
        : 'BATCH_SUBMIT_TO_AUTHORITY';
    return this.runBatchCommand(
      user,
      batchId,
      type,
      dto,
      MANAGEMENT_ROLES,
      async (transaction, context, commandId, batch) => {
        this.assertBatchVersion(batch, dto.expectedVersion);
        const delivering =
          dto.action === SignatureBatchAdvanceAction.DELIVER_TO_COMMITTEE;
        const expected = delivering
          ? SignatureCollectionBatchStatus.INTERNAL_REVIEWED
          : SignatureCollectionBatchStatus.DELIVERED_TO_COMMITTEE;
        if (batch.status !== expected) {
          throw this.invalidBatchTransition(
            batch,
            delivering ? 'entregar al comite' : 'radicar ante la autoridad',
          );
        }
        const receiver = dto.receiverUserId
          ? await this.requireActiveUser(
              transaction,
              user.tenantId,
              dto.receiverUserId,
              RESPONSIBLE_ROLES,
            )
          : null;
        const status = delivering
          ? SignatureCollectionBatchStatus.DELIVERED_TO_COMMITTEE
          : SignatureCollectionBatchStatus.SUBMITTED_TO_AUTHORITY;
        const updated = await transaction.signatureCollectionBatch.update({
          where: { id_tenantId: { id: batch.id, tenantId: user.tenantId } },
          data: {
            status,
            deliveredToCommitteeAt: delivering ? new Date() : undefined,
            submittedToAuthorityAt: delivering ? undefined : new Date(),
            version: { increment: 1 },
          },
        });
        await this.createCustodyEvent(transaction, {
          tenantId: user.tenantId,
          batch: updated,
          commandId,
          type: delivering
            ? SignatureCustodyEventType.DELIVERED_TO_COMMITTEE
            : SignatureCustodyEventType.SUBMITTED_TO_AUTHORITY,
          previousStatus: batch.status,
          actorUserId: context.actor.id,
          receiverUserId: receiver?.id ?? null,
          observation: dto.observation,
          evidenceReference: dto.evidenceReference,
          evidenceSha256: dto.evidenceSha256,
        });
        if (!delivering) {
          const remaining = await transaction.signatureCollectionBatch.count({
            where: {
              tenantId: user.tenantId,
              planId: batch.planId,
              id: { not: batch.id },
              status: {
                notIn: [
                  SignatureCollectionBatchStatus.SUBMITTED_TO_AUTHORITY,
                  SignatureCollectionBatchStatus.AUTHORITY_RESULT_RECORDED,
                ],
              },
            },
          });
          if (remaining === 0) {
            await transaction.signatureCollectionPlan.update({
              where: {
                id_tenantId: {
                  id: batch.planId,
                  tenantId: user.tenantId,
                },
              },
              data: { status: SignatureCollectionPlanStatus.SUBMITTED },
            });
          }
        }
      },
    );
  }

  quarantineBatch(
    user: AuthenticatedUser,
    batchId: string,
    dto: QuarantineSignatureBatchDto,
  ): Promise<CommandResponse<SelectedBatch>> {
    this.assertBatchId(batchId);
    this.assertBatchMutationInput(dto);
    return this.runBatchCommand(
      user,
      batchId,
      'BATCH_QUARANTINE',
      dto,
      FIELD_ROLES,
      async (transaction, context, commandId, batch) => {
        this.assertBatchVersion(batch, dto.expectedVersion);
        if (
          new Set<SignatureCollectionBatchStatus>([
            SignatureCollectionBatchStatus.QUARANTINED,
            SignatureCollectionBatchStatus.AUTHORITY_RESULT_RECORDED,
          ]).has(batch.status)
        ) {
          throw this.invalidBatchTransition(batch, 'poner en cuarentena');
        }
        const updated = await transaction.signatureCollectionBatch.update({
          where: { id_tenantId: { id: batch.id, tenantId: user.tenantId } },
          data: {
            statusBeforeQuarantine: batch.status,
            status: SignatureCollectionBatchStatus.QUARANTINED,
            version: { increment: 1 },
          },
        });
        await this.createCustodyEvent(transaction, {
          tenantId: user.tenantId,
          batch: updated,
          commandId,
          type: SignatureCustodyEventType.QUARANTINED,
          previousStatus: batch.status,
          actorUserId: context.actor.id,
          receiverUserId: null,
          observation: dto.observation,
          evidenceReference: dto.evidenceReference,
          evidenceSha256: dto.evidenceSha256,
        });
      },
    );
  }

  releaseBatch(
    user: AuthenticatedUser,
    batchId: string,
    dto: ReleaseSignatureBatchDto,
  ): Promise<CommandResponse<SelectedBatch>> {
    this.assertBatchId(batchId);
    this.assertBatchMutationInput(dto);
    return this.runBatchCommand(
      user,
      batchId,
      'BATCH_RELEASE_QUARANTINE',
      dto,
      INTERNAL_REVIEW_ROLES,
      async (transaction, context, commandId, batch) => {
        this.assertBatchVersion(batch, dto.expectedVersion);
        if (
          batch.status !== SignatureCollectionBatchStatus.QUARANTINED ||
          !batch.statusBeforeQuarantine
        ) {
          throw this.invalidBatchTransition(batch, 'cerrar la cuarentena');
        }
        const pendingCorrection =
          await transaction.signatureCountCorrectionProposal.findFirst({
            where: {
              tenantId: user.tenantId,
              batchId: batch.id,
              decision: null,
            },
            select: { id: true },
          });
        if (pendingCorrection) {
          throw new ConflictException({
            code: 'SIGNATURE_COUNT_CORRECTION_PENDING',
            message:
              'La cuarentena no puede liberarse mientras exista una propuesta de correccion sin decision independiente.',
          });
        }
        const receiver = dto.receiverUserId
          ? await this.requireActiveUser(
              transaction,
              user.tenantId,
              dto.receiverUserId,
              RESPONSIBLE_ROLES,
            )
          : null;
        const restoredStatus = batch.statusBeforeQuarantine;
        const updated = await transaction.signatureCollectionBatch.update({
          where: { id_tenantId: { id: batch.id, tenantId: user.tenantId } },
          data: {
            status: restoredStatus,
            statusBeforeQuarantine: null,
            currentCustodianUserId:
              receiver?.id ?? batch.currentCustodianUserId,
            version: { increment: 1 },
          },
        });
        await this.createCustodyEvent(transaction, {
          tenantId: user.tenantId,
          batch: updated,
          commandId,
          type: SignatureCustodyEventType.QUARANTINE_RELEASED,
          previousStatus: batch.status,
          actorUserId: context.actor.id,
          receiverUserId: receiver?.id ?? null,
          observation: dto.observation,
          evidenceReference: dto.evidenceReference,
          evidenceSha256: dto.evidenceSha256,
        });
      },
    );
  }

  recordAuthorityResult(
    user: AuthenticatedUser,
    dto: RecordSignatureAuthorityResultDto,
  ): Promise<CommandResponse<SelectedResult>> {
    this.assertAuthorityResultInput(dto);
    return this.runCommand({
      user,
      type: 'AUTHORITY_RESULT_RECORD',
      dto,
      roles: MANAGEMENT_ROLES,
      stages: COLLECTION_STAGES,
      resourceType: 'SignatureAuthorityResult',
      load: (transaction, resourceId) =>
        this.loadResult(transaction, user.tenantId, resourceId),
      mutate: async (transaction, context, commandId, resourceId) => {
        const plan = await this.requirePlan(transaction, user.tenantId);
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "SignatureCollectionPlan" WHERE "id" = ${plan.id} AND "tenantId" = ${user.tenantId} FOR UPDATE`,
        );
        const batches = await transaction.signatureCollectionBatch.findMany({
          where: { tenantId: user.tenantId, planId: plan.id },
          select: {
            id: true,
            status: true,
            reportedSupports: true,
          },
        });
        if (
          batches.length === 0 ||
          batches.some(
            ({ status }) =>
              status !==
                SignatureCollectionBatchStatus.SUBMITTED_TO_AUTHORITY &&
              status !==
                SignatureCollectionBatchStatus.AUTHORITY_RESULT_RECORDED,
          )
        ) {
          throw new ConflictException({
            code: 'SIGNATURE_BATCHES_NOT_SUBMITTED',
            message:
              'La constancia de autoridad solo se registra cuando todos los lotes llegaron a radicacion.',
          });
        }
        const internallySubmitted = batches.reduce(
          (sum, batch) => sum + batch.reportedSupports,
          0,
        );
        if (dto.submittedSupports !== internallySubmitted) {
          throw new ConflictException({
            code: 'SIGNATURE_SUBMISSION_TOTAL_DIVERGES',
            message: `La constancia declara ${dto.submittedSupports} apoyos, pero los lotes radicados conservan ${internallySubmitted}. Primero concilie la diferencia.`,
          });
        }
        this.assertAuthorityOutcome(plan.requiredThreshold, dto);
        await transaction.signatureAuthorityResult.create({
          data: {
            id: resourceId,
            tenantId: user.tenantId,
            planId: plan.id,
            commandId,
            authorityName: dto.authorityName,
            authorityActReference: dto.authorityActReference,
            authorityActIssuedAt: this.dateOnly(dto.authorityActIssuedAt),
            evidenceReference: dto.evidenceReference,
            evidenceSha256: dto.evidenceSha256,
            submittedSupports: dto.submittedSupports,
            validSupports: dto.validSupports,
            invalidSupports: dto.invalidSupports,
            outcome: dto.outcome,
            recordedById: context.actor.id,
          },
        });
      },
    });
  }

  reviewAuthorityResult(
    user: AuthenticatedUser,
    resultId: string,
    dto: ReviewSignatureAuthorityResultDto,
  ): Promise<CommandResponse<SelectedResult>> {
    this.assertBatchId(resultId);
    this.assertAuthorityReviewInput(dto);
    return this.runCommand({
      user,
      type: 'AUTHORITY_RESULT_REVIEW',
      dto,
      hashInput: { resultId, ...dto },
      roles: AUTHORITY_REVIEW_ROLES,
      stages: COLLECTION_STAGES,
      resourceType: 'SignatureAuthorityResult',
      resourceId: resultId,
      load: (transaction, resourceId) =>
        this.loadResult(transaction, user.tenantId, resourceId),
      mutate: async (transaction, context, commandId) => {
        const result = await transaction.signatureAuthorityResult.findFirst({
          where: { id: resultId, tenantId: user.tenantId },
          select: {
            id: true,
            planId: true,
            recordedById: true,
            validSupports: true,
            outcome: true,
            review: { select: { id: true } },
          },
        });
        if (!result) throw new NotFoundException('Constancia no encontrada');
        if (result.review) {
          throw new ConflictException(
            'La constancia ya tiene una revision inmutable',
          );
        }
        if (result.recordedById === context.actor.id) {
          throw new ForbiddenException({
            code: 'FOUR_EYES_REQUIRED',
            message:
              'La persona que registro la constancia no puede revisar su propio registro.',
          });
        }
        if (dto.decision === SignatureAuthorityReviewDecision.APPROVE) {
          const otherApproved =
            await transaction.signatureAuthorityResult.findFirst({
              where: {
                tenantId: user.tenantId,
                planId: result.planId,
                id: { not: result.id },
                review: {
                  is: {
                    decision: SignatureAuthorityReviewDecision.APPROVE,
                  },
                },
              },
              select: { id: true },
            });
          if (otherApproved) {
            throw new ConflictException(
              'El expediente ya tiene otra constancia aprobada; no se inventa una segunda verdad vigente.',
            );
          }
        }
        await transaction.signatureAuthorityResultReview.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            resultId: result.id,
            commandId,
            decision: dto.decision,
            reason: dto.reason ?? null,
            reviewedById: context.actor.id,
          },
        });
        if (dto.decision === SignatureAuthorityReviewDecision.APPROVE) {
          const batches = await transaction.signatureCollectionBatch.findMany({
            where: {
              tenantId: user.tenantId,
              planId: result.planId,
              status: SignatureCollectionBatchStatus.SUBMITTED_TO_AUTHORITY,
            },
          });
          const linkedAt = new Date();
          for (const batch of batches) {
            const linkCommandId = randomUUID();
            const linkClientRequestId = randomUUID();
            const linkHash = computeSignatureCommandSha256(
              'AUTHORITY_RESULT_LINK',
              { resultId: result.id, batchId: batch.id },
            );
            await transaction.signatureCollectionCommand.create({
              data: {
                id: linkCommandId,
                tenantId: user.tenantId,
                clientRequestId: linkClientRequestId,
                payloadSha256: linkHash,
                type: SignatureCollectionCommandType.AUTHORITY_RESULT_LINK,
                actorUserId: context.actor.id,
                resourceType: 'SignatureCollectionBatch',
                resourceId: batch.id,
                resultSnapshot: {
                  resourceId: batch.id,
                  authorityResultId: result.id,
                },
              },
            });
            const updated = await transaction.signatureCollectionBatch.update({
              where: {
                id_tenantId: {
                  id: batch.id,
                  tenantId: user.tenantId,
                },
              },
              data: {
                status:
                  SignatureCollectionBatchStatus.AUTHORITY_RESULT_RECORDED,
                authorityResultRecordedAt: linkedAt,
                version: { increment: 1 },
              },
            });
            await this.createCustodyEvent(transaction, {
              tenantId: user.tenantId,
              batch: updated,
              commandId: linkCommandId,
              type: SignatureCustodyEventType.AUTHORITY_RESULT_LINKED,
              previousStatus: batch.status,
              actorUserId: context.actor.id,
              receiverUserId: null,
              observation:
                'Constancia de autoridad aprobada por control de cuatro ojos y vinculada al lote.',
              evidenceReference: null,
              evidenceSha256: null,
            });
          }
          await transaction.signatureCollectionPlan.update({
            where: {
              id_tenantId: {
                id: result.planId,
                tenantId: user.tenantId,
              },
            },
            data: {
              status: SignatureCollectionPlanStatus.AUTHORITY_RESULT_RECORDED,
              version: { increment: 1 },
            },
          });
        }
      },
    });
  }

  private runBatchCommand<
    TDto extends { clientRequestId: string; payloadSha256: string },
  >(
    user: AuthenticatedUser,
    batchId: string,
    type: SignatureCommandName,
    dto: TDto,
    roles: readonly Role[],
    mutate: (
      transaction: Prisma.TransactionClient,
      context: MutationContext,
      commandId: string,
      batch: SelectedBatch,
    ) => Promise<void>,
  ): Promise<CommandResponse<SelectedBatch>> {
    return this.runCommand({
      user,
      type,
      dto,
      hashInput: { batchId, ...dto },
      roles,
      stages: COLLECTION_STAGES,
      resourceType: 'SignatureCollectionBatch',
      resourceId: batchId,
      load: (transaction, resourceId) =>
        this.loadBatch(transaction, user.tenantId, resourceId),
      mutate: async (transaction, context, commandId) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "SignatureCollectionBatch" WHERE "id" = ${batchId} AND "tenantId" = ${user.tenantId} FOR UPDATE`,
        );
        const batch = await this.loadBatch(transaction, user.tenantId, batchId);
        await mutate(transaction, context, commandId, batch);
      },
    });
  }

  private async runCommand<T>(input: {
    user: AuthenticatedUser;
    type: SignatureCommandName;
    dto: object & { payloadSha256: string; clientRequestId: string };
    hashInput?: object;
    roles: readonly Role[];
    stages: readonly PoliticalOperationStage[];
    resourceType: string;
    resourceId?: string;
    load: (
      transaction: Prisma.TransactionClient,
      resourceId: string,
    ) => Promise<T>;
    mutate: (
      transaction: Prisma.TransactionClient,
      context: MutationContext,
      commandId: string,
      resourceId: string,
    ) => Promise<void>;
  }): Promise<CommandResponse<T>> {
    this.assertCommandIdentity(input.dto);
    const calculatedHash = computeSignatureCommandSha256(
      input.type,
      input.hashInput ?? input.dto,
    );
    if (calculatedHash !== input.dto.payloadSha256) {
      throw new BadRequestException({
        code: 'SIGNATURE_PAYLOAD_HASH_MISMATCH',
        message: 'payloadSha256 no corresponde al contenido canonico',
      });
    }
    const resourceId = input.resourceId ?? randomUUID();

    const execute = () =>
      this.prisma.$transaction(async (transaction) => {
        const context = await this.requireMutationContext(
          transaction,
          input.user,
          input.roles,
          input.stages,
        );
        const existing = await transaction.signatureCollectionCommand.findFirst(
          {
            where: {
              tenantId: input.user.tenantId,
              clientRequestId: input.dto.clientRequestId,
            },
            select: COMMAND_SELECT,
          },
        );
        if (existing) {
          this.assertIdempotentCommand(
            existing,
            input.type,
            calculatedHash,
            context.actor.id,
          );
          return {
            resource: await input.load(transaction, existing.resourceId),
            command: existing,
            noOp: true,
          };
        }

        const commandId = randomUUID();
        const command = await transaction.signatureCollectionCommand.create({
          data: {
            id: commandId,
            tenantId: input.user.tenantId,
            clientRequestId: input.dto.clientRequestId,
            payloadSha256: calculatedHash,
            type: input.type as SignatureCollectionCommandType,
            actorUserId: context.actor.id,
            resourceType: input.resourceType,
            resourceId,
            resultSnapshot: { resourceType: input.resourceType, resourceId },
          },
          select: COMMAND_SELECT,
        });
        await input.mutate(transaction, context, commandId, resourceId);
        const resource = await input.load(transaction, resourceId);
        await transaction.auditEvent.create({
          data: {
            tenantId: input.user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: context.actor.id,
            action: `SIGNATURE_COLLECTION_${input.type}`,
            resourceType: input.resourceType,
            resourceId,
            after: {
              commandId,
              clientRequestId: input.dto.clientRequestId,
              payloadSha256: calculatedHash,
            },
          },
        });
        return { resource, command, noOp: false };
      }, SERIALIZABLE_OPTIONS);

    return execute().catch(async (error: unknown) => {
      if (this.isPrismaError(error, 'P2002')) {
        return execute().catch((replayError: unknown) => {
          if (this.isPrismaError(replayError, 'P2034')) {
            throw new ConflictException(
              'El expediente cambio concurrentemente; recargue e intente de nuevo',
            );
          }
          throw replayError;
        });
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'El expediente cambio concurrentemente; recargue e intente de nuevo',
        );
      }
      throw error;
    });
  }

  private async requireMutationContext(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    roles: readonly Role[],
    stages: readonly PoliticalOperationStage[],
  ): Promise<MutationContext> {
    await transaction.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`
        WITH signature_lifecycle_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtextextended(${`operation-profile-lifecycle:${user.tenantId}`}, 0))
        )
        SELECT TRUE AS "locked" FROM signature_lifecycle_lock
      `,
    );
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "OperationProfile" WHERE "tenantId" = ${user.tenantId} FOR UPDATE`,
    );
    const [tenant, actor, profile] = await Promise.all([
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
      transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: { id: true, stage: true, operationType: true },
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!actor) {
      throw new ForbiddenException(
        'El usuario vigente no tiene el rol requerido para esta accion',
      );
    }
    if (!profile) {
      throw new ConflictException(
        'Configure el perfil operativo antes de gestionar apoyos ciudadanos',
      );
    }
    if (profile.stage === PoliticalOperationStage.CLOSED) {
      throw new ConflictException({
        code: 'OPERATION_CLOSED',
        message: 'La operacion cerrada conserva el expediente en solo lectura',
      });
    }
    if (!stages.includes(profile.stage)) {
      throw new ConflictException({
        code: 'SIGNATURE_COLLECTION_STAGE_BLOCKED',
        message: `La accion no esta permitida durante la etapa ${profile.stage}`,
      });
    }
    if (profile.operationType !== PoliticalOperationType.SIGNATURE_COMMITTEE) {
      throw new ConflictException({
        code: 'SIGNATURE_COMMITTEE_REQUIRED',
        message:
          'El modulo exige que el perfil se declare como comite de recoleccion de firmas',
      });
    }
    return { actor, profile };
  }

  private async requireReadContext(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
  ): Promise<MutationContext> {
    const [tenant, actor, profile] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      transaction.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          isActive: true,
          role: { in: [...READ_ROLES] },
        },
        select: { id: true, role: true },
      }),
      transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: { id: true, stage: true, operationType: true },
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!actor) {
      throw new ForbiddenException(
        'El usuario vigente no puede consultar este expediente',
      );
    }
    if (!profile) {
      throw new ConflictException(
        'Configure el perfil operativo antes de consultar el expediente',
      );
    }
    return { actor, profile };
  }

  private async requireActiveUser(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    roles: readonly Role[],
  ) {
    const result = await transaction.user.findFirst({
      where: { id: userId, tenantId, isActive: true, role: { in: [...roles] } },
      select: { id: true, role: true },
    });
    if (!result) {
      throw new BadRequestException(
        'El responsable debe ser un usuario activo habilitado de esta organizacion',
      );
    }
    return result;
  }

  private async requirePlan(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const plan = await transaction.signatureCollectionPlan.findFirst({
      where: { tenantId },
      select: { id: true, requiredThreshold: true },
    });
    if (!plan) {
      throw new ConflictException({
        code: 'SIGNATURE_PLAN_REQUIRED',
        message: 'Debe completar el expediente minimo antes de crear lotes',
      });
    }
    return plan;
  }

  private async loadPlan(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ): Promise<SelectedPlan> {
    const plan = await transaction.signatureCollectionPlan.findFirst({
      where: { id, tenantId },
      select: PLAN_SELECT,
    });
    if (!plan)
      throw new NotFoundException('Expediente de firmas no encontrado');
    return plan;
  }

  private async loadBatch(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ): Promise<SelectedBatch> {
    const batch = await transaction.signatureCollectionBatch.findFirst({
      where: { id, tenantId },
      select: BATCH_SELECT,
    });
    if (!batch)
      throw new NotFoundException('Lote de formularios no encontrado');
    return batch;
  }

  private async loadResult(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ): Promise<SelectedResult> {
    const result = await transaction.signatureAuthorityResult.findFirst({
      where: { id, tenantId },
      select: RESULT_SELECT,
    });
    if (!result)
      throw new NotFoundException('Constancia de autoridad no encontrada');
    return result;
  }

  private async createCustodyEvent(
    transaction: Prisma.TransactionClient,
    input: {
      tenantId: string;
      batch: {
        id: string;
        territoryReference: string;
        physicalSealReference: string | null;
        status: SignatureCollectionBatchStatus;
        plannedForms: number;
        issuedForms: number;
        returnedForms: number;
        annulledForms: number;
        missingForms: number;
        inCustodyForms: number;
        reportedSupports: number;
        internalAcceptedSupports: number;
        internalRejectedSupports: number;
        possibleDuplicateSupports: number;
      };
      commandId: string;
      type: SignatureCustodyEventType;
      previousStatus: SignatureCollectionBatchStatus;
      actorUserId: string;
      receiverUserId: string | null;
      observation: string;
      evidenceReference: string | null;
      evidenceSha256: string | null;
    },
  ): Promise<void> {
    await transaction.signatureCustodyEvent.create({
      data: {
        id: randomUUID(),
        tenantId: input.tenantId,
        batchId: input.batch.id,
        commandId: input.commandId,
        type: input.type,
        previousStatus: input.previousStatus,
        nextStatus: input.batch.status,
        actorUserId: input.actorUserId,
        receiverUserId: input.receiverUserId,
        territoryReference: input.batch.territoryReference,
        physicalSealReference: input.batch.physicalSealReference,
        observation: input.observation,
        evidenceReference: input.evidenceReference,
        evidenceSha256: input.evidenceSha256,
        plannedForms: input.batch.plannedForms,
        issuedForms: input.batch.issuedForms,
        returnedForms: input.batch.returnedForms,
        annulledForms: input.batch.annulledForms,
        missingForms: input.batch.missingForms,
        inCustodyForms: input.batch.inCustodyForms,
        reportedSupports: input.batch.reportedSupports,
        internalAcceptedSupports: input.batch.internalAcceptedSupports,
        internalRejectedSupports: input.batch.internalRejectedSupports,
        possibleDuplicateSupports: input.batch.possibleDuplicateSupports,
      },
    });
  }

  private aggregateBatches(batches: SelectedBatch[]) {
    return batches.reduce(
      (totals, batch) => ({
        plannedForms: totals.plannedForms + batch.plannedForms,
        issuedForms: totals.issuedForms + batch.issuedForms,
        returnedForms: totals.returnedForms + batch.returnedForms,
        annulledForms: totals.annulledForms + batch.annulledForms,
        missingForms: totals.missingForms + batch.missingForms,
        inCustodyForms: totals.inCustodyForms + batch.inCustodyForms,
        reportedSupports: totals.reportedSupports + batch.reportedSupports,
        internalAcceptedSupports:
          totals.internalAcceptedSupports + batch.internalAcceptedSupports,
        internalRejectedSupports:
          totals.internalRejectedSupports + batch.internalRejectedSupports,
        possibleDuplicateSupports:
          totals.possibleDuplicateSupports + batch.possibleDuplicateSupports,
      }),
      {
        plannedForms: 0,
        issuedForms: 0,
        returnedForms: 0,
        annulledForms: 0,
        missingForms: 0,
        inCustodyForms: 0,
        reportedSupports: 0,
        internalAcceptedSupports: 0,
        internalRejectedSupports: 0,
        possibleDuplicateSupports: 0,
      },
    );
  }

  private assertPlanInput(dto: CreateSignatureCollectionPlanDto): void {
    this.assertCommandIdentity(dto);
    this.assertHttps(dto.committeeEvidenceReference);
    this.assertHttps(dto.thresholdSourceUrl);
    this.assertHashes([dto.committeeEvidenceSha256, dto.thresholdSourceSha256]);
    if (dto.committeeMemberCount !== 3) {
      throw new BadRequestException(
        'El expediente debe acreditar exactamente tres integrantes del comite',
      );
    }
    if (
      !Number.isInteger(dto.requiredThreshold) ||
      dto.requiredThreshold < 1 ||
      !Number.isInteger(dto.internalTarget) ||
      dto.internalTarget < dto.requiredThreshold
    ) {
      throw new BadRequestException(
        'La meta interna debe ser igual o superior al umbral aplicable',
      );
    }
    if (
      !SAFE_ID.test(dto.fileOwnerUserId) ||
      !SAFE_ID.test(dto.custodyOwnerUserId)
    ) {
      throw new BadRequestException(
        'Los responsables indicados no son validos',
      );
    }
    if (
      dto.formHandlingRules.trim().length < 100 ||
      dto.deliveryPlan.trim().length < 50 ||
      dto.contingencyPlan.trim().length < 50
    ) {
      throw new BadRequestException(
        'Las reglas, el plan de entrega y la contingencia deben ser explicitos',
      );
    }
    const registered = this.dateOnly(dto.committeeRegisteredAt);
    const starts = this.dateOnly(dto.collectionStartsAt);
    const closes = this.dateOnly(dto.collectionClosesAt);
    const due = this.dateOnly(dto.submissionDueAt);
    const registrationCloses = this.dateOnly(dto.candidateRegistrationClosesAt);
    if (
      !(registered < starts) ||
      starts > closes ||
      closes > due ||
      due > registrationCloses
    ) {
      throw new BadRequestException(
        'Las fechas deben conservar registro previo, recoleccion, entrega y cierre de inscripciones en ese orden',
      );
    }
  }

  private assertBatchCreateInput(dto: CreateSignatureBatchDto): void {
    this.assertCommandIdentity(dto);
    if (!BATCH_CODE.test(dto.code.toUpperCase())) {
      throw new BadRequestException('El codigo interno del lote no es valido');
    }
    if (!Number.isInteger(dto.plannedForms) || dto.plannedForms < 1) {
      throw new BadRequestException(
        'El lote debe planificar formularios fisicos',
      );
    }
    if (dto.territoryReference.trim().length < 2) {
      throw new BadRequestException('El territorio operativo es obligatorio');
    }
    this.assertValidDate(
      new Date(dto.expectedReturnAt),
      'Fecha de retorno invalida',
    );
  }

  private assertBatchMutationInput(dto: {
    clientRequestId: string;
    payloadSha256: string;
    expectedVersion: number;
    observation: string;
    evidenceReference: string;
    evidenceSha256: string;
  }): void {
    this.assertCommandIdentity(dto);
    if (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 1) {
      throw new BadRequestException('La version esperada no es valida');
    }
    if (dto.observation.trim().length < 20) {
      throw new BadRequestException(
        'La declaracion de custodia debe tener al menos 20 caracteres',
      );
    }
    this.assertHttps(dto.evidenceReference);
    this.assertHashes([dto.evidenceSha256]);
  }

  private assertAuthorityResultInput(
    dto: RecordSignatureAuthorityResultDto,
  ): void {
    this.assertCommandIdentity(dto);
    this.assertHttps(dto.evidenceReference);
    this.assertHashes([dto.evidenceSha256]);
    this.dateOnly(dto.authorityActIssuedAt);
    if (
      dto.authorityName.trim().length < 3 ||
      dto.authorityActReference.trim().length < 3
    ) {
      throw new BadRequestException(
        'La autoridad y la referencia del acto son obligatorias',
      );
    }
    if (
      ![dto.submittedSupports, dto.validSupports, dto.invalidSupports].every(
        (value) => Number.isInteger(value) && value >= 0,
      ) ||
      dto.validSupports + dto.invalidSupports !== dto.submittedSupports
    ) {
      throw new BadRequestException(
        'Validos mas invalidos deben ser iguales a los apoyos evaluados por la autoridad',
      );
    }
  }

  private assertAuthorityReviewInput(
    dto: ReviewSignatureAuthorityResultDto,
  ): void {
    this.assertCommandIdentity(dto);
    const reason = dto.reason?.trim();
    if (dto.decision === SignatureAuthorityReviewDecision.APPROVE && reason) {
      throw new BadRequestException(
        'Una aprobacion no admite una razon de rechazo',
      );
    }
    if (
      dto.decision === SignatureAuthorityReviewDecision.REJECT &&
      (!reason || reason.length < 20)
    ) {
      throw new BadRequestException(
        'El rechazo debe explicar la inconsistencia en al menos 20 caracteres',
      );
    }
  }

  private assertAuthorityOutcome(
    threshold: number,
    dto: RecordSignatureAuthorityResultDto,
  ): void {
    if (
      dto.outcome === SignatureAuthorityOutcome.THRESHOLD_MET &&
      dto.validSupports < threshold
    ) {
      throw new BadRequestException(
        'El resultado no puede indicar umbral cumplido con menos apoyos validos que el umbral configurado',
      );
    }
    if (
      dto.outcome === SignatureAuthorityOutcome.THRESHOLD_NOT_MET &&
      dto.validSupports >= threshold
    ) {
      throw new BadRequestException(
        'El resultado umbral no cumplido contradice el total valido registrado',
      );
    }
  }

  private assertCommandIdentity(dto: {
    clientRequestId: string;
    payloadSha256: string;
  }): void {
    if (!UUID_V4.test(dto.clientRequestId)) {
      throw new BadRequestException('clientRequestId debe ser un UUID v4');
    }
    this.assertHashes([dto.payloadSha256]);
  }

  private assertBatchId(id: string): void {
    if (!SAFE_ID.test(id)) {
      throw new BadRequestException(
        'El identificador del recurso no es valido',
      );
    }
  }

  private assertBatchVersion(
    batch: SelectedBatch,
    expectedVersion: number,
  ): void {
    if (batch.version !== expectedVersion) {
      throw new ConflictException({
        code: 'SIGNATURE_BATCH_VERSION_CONFLICT',
        message:
          'El lote cambio desde que lo abrio; recargue para no sobrescribir custodia ajena.',
      });
    }
  }

  private invalidBatchTransition(batch: SelectedBatch, action: string) {
    return new ConflictException({
      code: 'SIGNATURE_BATCH_TRANSITION_BLOCKED',
      message: `No se puede ${action} un lote en estado ${batch.status}`,
    });
  }

  private assertIdempotentCommand(
    command: SelectedCommand,
    expectedType: SignatureCommandName,
    expectedHash: string,
    actorUserId: string,
  ): void {
    if (
      command.type !== expectedType ||
      command.payloadSha256 !== expectedHash ||
      command.actorUserId !== actorUserId
    ) {
      throw new ConflictException({
        code: 'SIGNATURE_IDEMPOTENCY_CONFLICT',
        message:
          'El identificador idempotente ya fue usado por otra accion, contenido o persona',
      });
    }
  }

  private assertHttps(value: string): void {
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
        'La referencia debe usar HTTPS y no incluir credenciales',
      );
    }
  }

  private assertHashes(values: string[]): void {
    if (values.some((value) => !SHA256.test(value))) {
      throw new BadRequestException(
        'Los hashes deben ser SHA-256 hexadecimales en minuscula',
      );
    }
  }

  private dateOnly(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      throw new BadRequestException('La fecha debe usar el formato AAAA-MM-DD');
    }
    const result = new Date(`${value}T00:00:00.000Z`);
    if (
      !Number.isFinite(result.getTime()) ||
      result.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('La fecha indicada no existe');
    }
    return result;
  }

  private assertValidDate(value: Date, message: string): void {
    if (!Number.isFinite(value.getTime()))
      throw new BadRequestException(message);
  }

  private endOfUtcDate(value: Date): Date {
    return new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate() + 1,
      ) - 1,
    );
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
