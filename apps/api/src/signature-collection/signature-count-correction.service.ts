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
  SignatureCollectionBatchStatus,
  SignatureCountCorrectionCommandType,
  SignatureCountCorrectionDecisionType,
  SignatureCountCorrectionReviewControl,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  DecideSignatureCountCorrectionDto,
  ProposeSignatureCountCorrectionDto,
  SignatureCountCorrectionDecisionInput,
} from './dto/signature-count-correction.dto';
import {
  computeSignatureCountCorrectionSha256,
  type SignatureCountCorrectionCommandName,
} from './signature-count-correction.hash';

const READ_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
const PROPOSER_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
];
const REVIEWER_ROLES: readonly Role[] = [Role.COMPLIANCE_OFFICER, Role.AUDITOR];
const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_COUNT = 1_000_000_000;

const PERSON_SELECT = {
  id: true,
  name: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

const CORRECTION_COMMAND_SELECT = {
  id: true,
  clientRequestId: true,
  payloadSha256: true,
  type: true,
  actorUserId: true,
  resourceType: true,
  resourceId: true,
  createdAt: true,
} satisfies Prisma.SignatureCountCorrectionCommandSelect;

const CORRECTION_PROPOSAL_SELECT = {
  id: true,
  tenantId: true,
  operationProfileId: true,
  batchId: true,
  snapshotBatchVersion: true,
  snapshotStatus: true,
  snapshotStatusBeforeQuarantine: true,
  snapshotPlannedForms: true,
  snapshotIssuedForms: true,
  snapshotReturnedForms: true,
  snapshotAnnulledForms: true,
  snapshotMissingForms: true,
  snapshotInCustodyForms: true,
  snapshotReportedSupports: true,
  snapshotInternalAcceptedSupports: true,
  snapshotInternalRejectedSupports: true,
  snapshotPossibleDuplicateSupports: true,
  proposedPlannedForms: true,
  proposedIssuedForms: true,
  proposedReturnedForms: true,
  proposedAnnulledForms: true,
  proposedMissingForms: true,
  proposedInCustodyForms: true,
  proposedReportedSupports: true,
  proposedInternalAcceptedSupports: true,
  proposedInternalRejectedSupports: true,
  proposedPossibleDuplicateSupports: true,
  requiredReviewControl: true,
  reason: true,
  evidenceSha256: true,
  createdAt: true,
  requestedBy: { select: PERSON_SELECT },
  evidenceStorageObject: {
    select: {
      id: true,
      contentType: true,
      actualSize: true,
      confirmedAt: true,
      status: true,
    },
  },
  decision: {
    select: {
      id: true,
      decision: true,
      reviewReason: true,
      reviewerRole: true,
      expectedBatchVersion: true,
      batchVersionBefore: true,
      batchVersionAfter: true,
      createdAt: true,
      reviewedBy: { select: PERSON_SELECT },
    },
  },
  batch: {
    select: {
      id: true,
      code: true,
      status: true,
      statusBeforeQuarantine: true,
      version: true,
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
    },
  },
} satisfies Prisma.SignatureCountCorrectionProposalSelect;

type SelectedCommand = Prisma.SignatureCountCorrectionCommandGetPayload<{
  select: typeof CORRECTION_COMMAND_SELECT;
}>;
type SelectedProposal = Prisma.SignatureCountCorrectionProposalGetPayload<{
  select: typeof CORRECTION_PROPOSAL_SELECT;
}>;
type MutationContext = Readonly<{
  actor: { id: string; role: Role };
  profile: {
    id: string;
    stage: PoliticalOperationStage;
    operationType: PoliticalOperationType;
  };
}>;

const COUNT_FIELDS = [
  {
    field: 'plannedForms',
    label: 'Formularios planificados',
    snapshot: 'snapshotPlannedForms',
    proposed: 'proposedPlannedForms',
  },
  {
    field: 'issuedForms',
    label: 'Formularios entregados',
    snapshot: 'snapshotIssuedForms',
    proposed: 'proposedIssuedForms',
  },
  {
    field: 'returnedForms',
    label: 'Formularios devueltos',
    snapshot: 'snapshotReturnedForms',
    proposed: 'proposedReturnedForms',
  },
  {
    field: 'annulledForms',
    label: 'Formularios anulados',
    snapshot: 'snapshotAnnulledForms',
    proposed: 'proposedAnnulledForms',
  },
  {
    field: 'missingForms',
    label: 'Formularios faltantes',
    snapshot: 'snapshotMissingForms',
    proposed: 'proposedMissingForms',
  },
  {
    field: 'inCustodyForms',
    label: 'Formularios en custodia',
    snapshot: 'snapshotInCustodyForms',
    proposed: 'proposedInCustodyForms',
  },
  {
    field: 'reportedSupports',
    label: 'Apoyos reportados',
    snapshot: 'snapshotReportedSupports',
    proposed: 'proposedReportedSupports',
  },
  {
    field: 'internalAcceptedSupports',
    label: 'Apoyos aceptados internamente',
    snapshot: 'snapshotInternalAcceptedSupports',
    proposed: 'proposedInternalAcceptedSupports',
  },
  {
    field: 'internalRejectedSupports',
    label: 'Apoyos rechazados internamente',
    snapshot: 'snapshotInternalRejectedSupports',
    proposed: 'proposedInternalRejectedSupports',
  },
  {
    field: 'possibleDuplicateSupports',
    label: 'Posibles duplicados',
    snapshot: 'snapshotPossibleDuplicateSupports',
    proposed: 'proposedPossibleDuplicateSupports',
  },
] as const;

@Injectable()
export class SignatureCountCorrectionService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(user: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const context = await this.requireReadContext(transaction, user);
      const where = {
        tenantId: user.tenantId,
        operationProfileId: context.profile.id,
      } satisfies Prisma.SignatureCountCorrectionProposalWhereInput;
      const [proposals, totalCount, pendingCount] = await Promise.all([
        transaction.signatureCountCorrectionProposal.findMany({
          where,
          select: CORRECTION_PROPOSAL_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 200,
        }),
        transaction.signatureCountCorrectionProposal.count({ where }),
        transaction.signatureCountCorrectionProposal.count({
          where: {
            ...where,
            decision: null,
          },
        }),
      ]);
      const resources = proposals.map((proposal) =>
        this.toPublicProposal(proposal, context.actor),
      );
      return {
        stage: context.profile.stage,
        readOnly: context.profile.stage === PoliticalOperationStage.CLOSED,
        controls: {
          absoluteValuesOnly: true,
          independentDecisionRequired: true,
          releaseIsSeparate: true,
          batchRemainsQuarantinedAfterApproval: true,
          supporterPersonalDataAccepted: false,
          custodyReviewerRole: Role.COMPLIANCE_OFFICER,
          supportReviewerRole: Role.AUDITOR,
        },
        readiness: {
          pendingCount,
          readyForQuarantineRelease: pendingCount === 0,
          blockers:
            pendingCount === 0 ? [] : ['SIGNATURE_COUNT_CORRECTION_PENDING'],
        },
        proposals: resources,
        totalCount,
        isTruncated: totalCount > proposals.length,
      };
    });
  }

  propose(
    user: AuthenticatedUser,
    batchId: string,
    dto: ProposeSignatureCountCorrectionDto,
  ) {
    this.assertBatchId(batchId);
    this.assertProposalInput(dto);
    const calculatedHash = computeSignatureCountCorrectionSha256('PROPOSE', {
      batchId,
      ...dto,
    });
    this.assertPayloadHash(dto.payloadSha256, calculatedHash);
    const proposalId = randomUUID();

    const execute = () =>
      this.prisma.$transaction(async (transaction) => {
        const context = await this.requireMutationContext(
          transaction,
          user,
          PROPOSER_ROLES,
        );
        await this.lockResource(transaction, user.tenantId, `batch:${batchId}`);
        const existing = await this.findCommand(
          transaction,
          user.tenantId,
          dto.clientRequestId,
        );
        if (existing) {
          this.assertIdempotentCommand(
            existing,
            'PROPOSE',
            calculatedHash,
            context.actor.id,
            'SignatureCountCorrectionProposal',
          );
          return this.commandResponse(
            await this.loadProposal(
              transaction,
              user.tenantId,
              existing.resourceId,
            ),
            existing,
            true,
            context.actor,
          );
        }

        await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "SignatureCollectionBatch" WHERE "id" = ${batchId} AND "tenantId" = ${user.tenantId} FOR UPDATE`,
        );
        const batch = await transaction.signatureCollectionBatch.findFirst({
          where: {
            id: batchId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
        });
        if (!batch) {
          throw new NotFoundException('Lote de firmas no encontrado');
        }
        if (
          batch.status !== SignatureCollectionBatchStatus.QUARANTINED ||
          !batch.statusBeforeQuarantine
        ) {
          throw new ConflictException({
            code: 'SIGNATURE_BATCH_NOT_QUARANTINED',
            message:
              'La correccion compensatoria solo se propone sobre un lote en cuarentena.',
          });
        }
        if (batch.version !== dto.expectedVersion) {
          throw this.versionConflict(batch.version, dto.expectedVersion);
        }
        const pending =
          await transaction.signatureCountCorrectionProposal.findFirst({
            where: {
              tenantId: user.tenantId,
              batchId,
              decision: null,
            },
            select: { id: true },
          });
        if (pending) {
          throw new ConflictException({
            code: 'SIGNATURE_COUNT_CORRECTION_PENDING',
            message:
              'El lote ya tiene una propuesta pendiente de decision independiente.',
          });
        }

        this.assertProposedCounts(dto);
        this.assertStatusCompatibility(batch.statusBeforeQuarantine, dto);
        const supportChanged =
          batch.reportedSupports !== dto.proposedReportedSupports ||
          batch.internalAcceptedSupports !==
            dto.proposedInternalAcceptedSupports ||
          batch.internalRejectedSupports !==
            dto.proposedInternalRejectedSupports ||
          batch.possibleDuplicateSupports !==
            dto.proposedPossibleDuplicateSupports;
        const changed =
          supportChanged ||
          batch.plannedForms !== dto.proposedPlannedForms ||
          batch.issuedForms !== dto.proposedIssuedForms ||
          batch.returnedForms !== dto.proposedReturnedForms ||
          batch.annulledForms !== dto.proposedAnnulledForms ||
          batch.missingForms !== dto.proposedMissingForms ||
          batch.inCustodyForms !== dto.proposedInCustodyForms;
        if (!changed) {
          throw new BadRequestException({
            code: 'SIGNATURE_COUNT_CORRECTION_NO_CHANGE',
            message:
              'La propuesta debe cambiar al menos un valor absoluto del lote.',
          });
        }
        const requiredReviewControl = supportChanged
          ? SignatureCountCorrectionReviewControl.SUPPORT_CLASSIFICATION
          : SignatureCountCorrectionReviewControl.CUSTODY_COUNTS;

        this.assertCanonicalStoragePath(user.tenantId, dto.evidenceStoragePath);
        const evidence = await transaction.storedObject.findFirst({
          where: {
            tenantId: user.tenantId,
            uploaderId: context.actor.id,
            path: dto.evidenceStoragePath,
            module: StorageObjectModule.SIGNATURE_COLLECTION,
            status: StoredObjectStatus.CONFIRMED,
            consumedAt: null,
            expectedSha256: dto.evidenceSha256,
            reportedSha256: dto.evidenceSha256,
          },
          select: { id: true },
        });
        if (!evidence) {
          throw new BadRequestException({
            code: 'SIGNATURE_CORRECTION_EVIDENCE_NOT_CONFIRMED',
            message:
              'La evidencia debe estar confirmada, sin consumir, conservar el SHA declarado y haber sido subida por quien propone.',
          });
        }

        const commandId = randomUUID();
        const command =
          await transaction.signatureCountCorrectionCommand.create({
            data: {
              id: commandId,
              tenantId: user.tenantId,
              clientRequestId: dto.clientRequestId,
              payloadSha256: calculatedHash,
              type: SignatureCountCorrectionCommandType.PROPOSE,
              actorUserId: context.actor.id,
              resourceType: 'SignatureCountCorrectionProposal',
              resourceId: proposalId,
              resultSnapshot: {
                resourceType: 'SignatureCountCorrectionProposal',
                resourceId: proposalId,
                batchId,
              },
            },
            select: CORRECTION_COMMAND_SELECT,
          });
        await transaction.signatureCountCorrectionProposal.create({
          data: {
            id: proposalId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            batchId,
            commandId,
            snapshotBatchVersion: batch.version,
            snapshotStatus: batch.status,
            snapshotStatusBeforeQuarantine: batch.statusBeforeQuarantine,
            snapshotPlannedForms: batch.plannedForms,
            snapshotIssuedForms: batch.issuedForms,
            snapshotReturnedForms: batch.returnedForms,
            snapshotAnnulledForms: batch.annulledForms,
            snapshotMissingForms: batch.missingForms,
            snapshotInCustodyForms: batch.inCustodyForms,
            snapshotReportedSupports: batch.reportedSupports,
            snapshotInternalAcceptedSupports: batch.internalAcceptedSupports,
            snapshotInternalRejectedSupports: batch.internalRejectedSupports,
            snapshotPossibleDuplicateSupports: batch.possibleDuplicateSupports,
            proposedPlannedForms: dto.proposedPlannedForms,
            proposedIssuedForms: dto.proposedIssuedForms,
            proposedReturnedForms: dto.proposedReturnedForms,
            proposedAnnulledForms: dto.proposedAnnulledForms,
            proposedMissingForms: dto.proposedMissingForms,
            proposedInCustodyForms: dto.proposedInCustodyForms,
            proposedReportedSupports: dto.proposedReportedSupports,
            proposedInternalAcceptedSupports:
              dto.proposedInternalAcceptedSupports,
            proposedInternalRejectedSupports:
              dto.proposedInternalRejectedSupports,
            proposedPossibleDuplicateSupports:
              dto.proposedPossibleDuplicateSupports,
            requiredReviewControl,
            reason: dto.reason,
            evidenceStorageObjectId: evidence.id,
            evidenceSha256: dto.evidenceSha256,
            requestedById: context.actor.id,
          },
        });
        await consumeConfirmedStorageUpload(
          transaction,
          user.tenantId,
          dto.evidenceStoragePath,
          StorageObjectModule.SIGNATURE_COLLECTION,
          'SignatureCountCorrectionProposal',
          proposalId,
          context.actor.id,
          { expectedSha256: dto.evidenceSha256 },
        );
        await this.audit(transaction, {
          tenantId: user.tenantId,
          actorUserId: context.actor.id,
          action: 'SIGNATURE_COUNT_CORRECTION_PROPOSED',
          resourceType: 'SignatureCountCorrectionProposal',
          resourceId: proposalId,
          after: {
            commandId,
            batchId,
            snapshotBatchVersion: batch.version,
            requiredReviewControl,
          },
        });
        return this.commandResponse(
          await this.loadProposal(transaction, user.tenantId, proposalId),
          command,
          false,
          context.actor,
        );
      }, SERIALIZABLE_OPTIONS);

    return this.runWithConcurrencyReplay(execute);
  }

  decide(
    user: AuthenticatedUser,
    proposalId: string,
    dto: DecideSignatureCountCorrectionDto,
  ) {
    this.assertProposalId(proposalId);
    this.assertDecisionInput(dto);
    const calculatedHash = computeSignatureCountCorrectionSha256('DECIDE', {
      proposalId,
      ...dto,
    });
    this.assertPayloadHash(dto.payloadSha256, calculatedHash);
    const decisionId = randomUUID();

    const execute = () =>
      this.prisma.$transaction(async (transaction) => {
        const context = await this.requireMutationContext(
          transaction,
          user,
          REVIEWER_ROLES,
        );
        await this.lockResource(
          transaction,
          user.tenantId,
          `proposal:${proposalId}`,
        );
        const existing = await this.findCommand(
          transaction,
          user.tenantId,
          dto.clientRequestId,
        );
        if (existing) {
          this.assertIdempotentCommand(
            existing,
            'DECIDE',
            calculatedHash,
            context.actor.id,
            'SignatureCountCorrectionDecision',
          );
          const decision =
            await transaction.signatureCountCorrectionDecision.findFirst({
              where: {
                id: existing.resourceId,
                tenantId: user.tenantId,
              },
              select: { proposalId: true },
            });
          if (!decision) {
            throw new ConflictException(
              'El recibo idempotente no conserva una decision recuperable.',
            );
          }
          return this.commandResponse(
            await this.loadProposal(
              transaction,
              user.tenantId,
              decision.proposalId,
            ),
            existing,
            true,
            context.actor,
          );
        }

        await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "SignatureCountCorrectionProposal" WHERE "id" = ${proposalId}::uuid AND "tenantId" = ${user.tenantId} FOR UPDATE`,
        );
        const proposal = await this.loadProposal(
          transaction,
          user.tenantId,
          proposalId,
        );
        if (proposal.decision) {
          throw new ConflictException({
            code: 'SIGNATURE_COUNT_CORRECTION_ALREADY_DECIDED',
            message: 'La propuesta ya tiene una decision terminal inmutable.',
          });
        }
        if (proposal.requestedBy.id === context.actor.id) {
          throw new ForbiddenException({
            code: 'SIGNATURE_COUNT_CORRECTION_SELF_REVIEW',
            message: 'Quien propuso la correccion no puede decidirla.',
          });
        }
        const requiredRole =
          proposal.requiredReviewControl ===
          SignatureCountCorrectionReviewControl.SUPPORT_CLASSIFICATION
            ? Role.AUDITOR
            : Role.COMPLIANCE_OFFICER;
        if (context.actor.role !== requiredRole) {
          throw new ForbiddenException({
            code: 'SIGNATURE_COUNT_CORRECTION_REVIEW_ROLE_MISMATCH',
            message: `La matriz de control exige un revisor ${requiredRole}.`,
          });
        }
        if (dto.expectedVersion !== proposal.snapshotBatchVersion) {
          throw this.versionConflict(
            proposal.snapshotBatchVersion,
            dto.expectedVersion,
          );
        }
        if (
          proposal.batch.version !== dto.expectedVersion ||
          !this.batchStillMatchesSnapshot(proposal)
        ) {
          throw new ConflictException({
            code: 'SIGNATURE_COUNT_CORRECTION_STALE_SNAPSHOT',
            message:
              'El lote cambio despues de la propuesta; debe rechazarse y crear una nueva fotografia completa.',
          });
        }

        const decision =
          dto.decision === SignatureCountCorrectionDecisionInput.APPROVE
            ? SignatureCountCorrectionDecisionType.APPROVE
            : SignatureCountCorrectionDecisionType.REJECT;
        const commandId = randomUUID();
        const command =
          await transaction.signatureCountCorrectionCommand.create({
            data: {
              id: commandId,
              tenantId: user.tenantId,
              clientRequestId: dto.clientRequestId,
              payloadSha256: calculatedHash,
              type: SignatureCountCorrectionCommandType.DECIDE,
              actorUserId: context.actor.id,
              resourceType: 'SignatureCountCorrectionDecision',
              resourceId: decisionId,
              resultSnapshot: {
                resourceType: 'SignatureCountCorrectionDecision',
                resourceId: decisionId,
                proposalId,
                decision,
              },
            },
            select: CORRECTION_COMMAND_SELECT,
          });
        await transaction.signatureCountCorrectionDecision.create({
          data: {
            id: decisionId,
            tenantId: user.tenantId,
            proposalId,
            commandId,
            decision,
            reviewReason: dto.reviewReason,
            reviewedById: context.actor.id,
            reviewerRole: context.actor.role,
            expectedBatchVersion: dto.expectedVersion,
            batchVersionBefore: dto.expectedVersion,
            batchVersionAfter:
              decision === SignatureCountCorrectionDecisionType.APPROVE
                ? dto.expectedVersion + 1
                : dto.expectedVersion,
          },
        });
        await this.audit(transaction, {
          tenantId: user.tenantId,
          actorUserId: context.actor.id,
          action:
            decision === SignatureCountCorrectionDecisionType.APPROVE
              ? 'SIGNATURE_COUNT_CORRECTION_APPROVED'
              : 'SIGNATURE_COUNT_CORRECTION_REJECTED',
          resourceType: 'SignatureCountCorrectionDecision',
          resourceId: decisionId,
          after: {
            commandId,
            proposalId,
            decision,
            batchStatusRemains: SignatureCollectionBatchStatus.QUARANTINED,
          },
        });
        return this.commandResponse(
          await this.loadProposal(transaction, user.tenantId, proposalId),
          command,
          false,
          context.actor,
        );
      }, SERIALIZABLE_OPTIONS);

    return this.runWithConcurrencyReplay(execute);
  }

  private async requireMutationContext(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    roles: readonly Role[],
  ): Promise<MutationContext> {
    await transaction.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`
        WITH signature_correction_lifecycle_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtextextended(${`operation-profile-lifecycle:${user.tenantId}`}, 0))
        )
        SELECT TRUE AS "locked" FROM signature_correction_lifecycle_lock
      `,
    );
    await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "OperationProfile" WHERE "tenantId" = ${user.tenantId} FOR UPDATE`,
    );
    const context = await this.loadContext(transaction, user, roles);
    if (context.profile.stage === PoliticalOperationStage.CLOSED) {
      throw new ConflictException({
        code: 'OPERATION_CLOSED',
        message: 'La operacion cerrada conserva el expediente en solo lectura.',
      });
    }
    if (
      context.profile.stage !== PoliticalOperationStage.SIGNATURE_COLLECTION
    ) {
      throw new ConflictException({
        code: 'SIGNATURE_COUNT_CORRECTION_STAGE_BLOCKED',
        message:
          'Las correcciones compensatorias solo se gestionan durante la recoleccion de firmas.',
      });
    }
    return context;
  }

  private requireReadContext(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
  ): Promise<MutationContext> {
    return this.loadContext(transaction, user, READ_ROLES);
  }

  private async loadContext(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    roles: readonly Role[],
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
        'El usuario vigente no tiene el rol requerido para este control.',
      );
    }
    if (!profile) {
      throw new ConflictException(
        'Configure el perfil operativo antes de corregir conteos de firmas.',
      );
    }
    if (profile.operationType !== PoliticalOperationType.SIGNATURE_COMMITTEE) {
      throw new ConflictException({
        code: 'SIGNATURE_COMMITTEE_REQUIRED',
        message:
          'Este control exige un perfil de comite de recoleccion de firmas.',
      });
    }
    return { actor, profile };
  }

  private async lockResource(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    resource: string,
  ) {
    await transaction.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`
        WITH signature_correction_resource_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtextextended(${`signature-count-correction:${tenantId}:${resource}`}, 0))
        )
        SELECT TRUE AS "locked" FROM signature_correction_resource_lock
      `,
    );
  }

  private findCommand(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    clientRequestId: string,
  ) {
    return transaction.signatureCountCorrectionCommand.findFirst({
      where: { tenantId, clientRequestId },
      select: CORRECTION_COMMAND_SELECT,
    });
  }

  private async loadProposal(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    proposalId: string,
  ): Promise<SelectedProposal> {
    const proposal =
      await transaction.signatureCountCorrectionProposal.findFirst({
        where: { id: proposalId, tenantId },
        select: CORRECTION_PROPOSAL_SELECT,
      });
    if (!proposal) {
      throw new NotFoundException('Propuesta de correccion no encontrada');
    }
    return proposal;
  }

  private commandResponse(
    proposal: SelectedProposal,
    command: SelectedCommand,
    noOp: boolean,
    actor: { id: string; role: Role },
  ) {
    return {
      resource: this.toPublicProposal(proposal, actor),
      command,
      noOp,
    };
  }

  private toPublicProposal(
    proposal: SelectedProposal,
    actor: { id: string; role: Role },
  ) {
    const differences = COUNT_FIELDS.map((definition) => {
      const before = proposal[definition.snapshot];
      const proposed = proposal[definition.proposed];
      return {
        field: definition.field,
        label: definition.label,
        before,
        proposed,
        change: proposed - before,
      };
    });
    const requiredRole =
      proposal.requiredReviewControl ===
      SignatureCountCorrectionReviewControl.SUPPORT_CLASSIFICATION
        ? Role.AUDITOR
        : Role.COMPLIANCE_OFFICER;
    return {
      id: proposal.id,
      batchId: proposal.batchId,
      batchCode: proposal.batch.code,
      snapshotBatchVersion: proposal.snapshotBatchVersion,
      snapshotStatus: proposal.snapshotStatus,
      snapshotStatusBeforeQuarantine: proposal.snapshotStatusBeforeQuarantine,
      requiredReviewControl: proposal.requiredReviewControl,
      requiredReviewerRole: requiredRole,
      reason: proposal.reason,
      evidence: proposal.evidenceStorageObject,
      evidenceSha256: proposal.evidenceSha256,
      requestedBy: proposal.requestedBy,
      createdAt: proposal.createdAt,
      differences,
      decision: proposal.decision,
      currentBatch: proposal.batch,
      snapshotStillCurrent: this.batchStillMatchesSnapshot(proposal),
      pending: !proposal.decision,
      canReview:
        !proposal.decision &&
        actor.id !== proposal.requestedBy.id &&
        actor.role === requiredRole,
      batchRemainsQuarantined:
        proposal.batch.status === SignatureCollectionBatchStatus.QUARANTINED,
    };
  }

  private batchStillMatchesSnapshot(proposal: SelectedProposal): boolean {
    return (
      proposal.batch.status === SignatureCollectionBatchStatus.QUARANTINED &&
      proposal.batch.statusBeforeQuarantine ===
        proposal.snapshotStatusBeforeQuarantine &&
      proposal.batch.version === proposal.snapshotBatchVersion &&
      proposal.batch.plannedForms === proposal.snapshotPlannedForms &&
      proposal.batch.issuedForms === proposal.snapshotIssuedForms &&
      proposal.batch.returnedForms === proposal.snapshotReturnedForms &&
      proposal.batch.annulledForms === proposal.snapshotAnnulledForms &&
      proposal.batch.missingForms === proposal.snapshotMissingForms &&
      proposal.batch.inCustodyForms === proposal.snapshotInCustodyForms &&
      proposal.batch.reportedSupports === proposal.snapshotReportedSupports &&
      proposal.batch.internalAcceptedSupports ===
        proposal.snapshotInternalAcceptedSupports &&
      proposal.batch.internalRejectedSupports ===
        proposal.snapshotInternalRejectedSupports &&
      proposal.batch.possibleDuplicateSupports ===
        proposal.snapshotPossibleDuplicateSupports
    );
  }

  private assertIdempotentCommand(
    command: SelectedCommand,
    type: SignatureCountCorrectionCommandName,
    payloadSha256: string,
    actorUserId: string,
    resourceType: string,
  ) {
    if (
      command.type !== (type as SignatureCountCorrectionCommandType) ||
      command.payloadSha256 !== payloadSha256 ||
      command.actorUserId !== actorUserId ||
      command.resourceType !== resourceType
    ) {
      throw new ConflictException({
        code: 'SIGNATURE_COUNT_CORRECTION_IDEMPOTENCY_CONFLICT',
        message:
          'clientRequestId ya fue utilizado con otro contenido, actor o recurso.',
      });
    }
  }

  private assertProposalInput(dto: ProposeSignatureCountCorrectionDto) {
    this.assertCommandInput(dto.clientRequestId, dto.payloadSha256);
    if (
      typeof dto.reason !== 'string' ||
      dto.reason !== dto.reason.trim() ||
      dto.reason.length < 20 ||
      dto.reason.length > 2_000
    ) {
      throw new BadRequestException(
        'La razon debe tener entre 20 y 2000 caracteres.',
      );
    }
    if (!SHA256.test(dto.evidenceSha256)) {
      throw new BadRequestException('evidenceSha256 no es una huella valida.');
    }
    if (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 1) {
      throw new BadRequestException(
        'expectedVersion debe ser un entero positivo.',
      );
    }
    this.assertProposedCounts(dto);
  }

  private assertDecisionInput(dto: DecideSignatureCountCorrectionDto) {
    this.assertCommandInput(dto.clientRequestId, dto.payloadSha256);
    if (!Number.isInteger(dto.expectedVersion) || dto.expectedVersion < 1) {
      throw new BadRequestException(
        'expectedVersion debe ser un entero positivo.',
      );
    }
    if (
      !Object.values(SignatureCountCorrectionDecisionInput).includes(
        dto.decision,
      )
    ) {
      throw new BadRequestException('La decision debe ser APPROVE o REJECT.');
    }
    if (
      typeof dto.reviewReason !== 'string' ||
      dto.reviewReason !== dto.reviewReason.trim() ||
      dto.reviewReason.length < 20 ||
      dto.reviewReason.length > 2_000
    ) {
      throw new BadRequestException(
        'La motivacion de revision debe tener entre 20 y 2000 caracteres.',
      );
    }
  }

  private assertCommandInput(clientRequestId: string, payloadSha256: string) {
    if (!UUID_V4.test(clientRequestId) || !SHA256.test(payloadSha256)) {
      throw new BadRequestException(
        'El comando exige clientRequestId UUID v4 y payloadSha256 canonico.',
      );
    }
  }

  private assertPayloadHash(provided: string, calculated: string) {
    if (provided !== calculated) {
      throw new BadRequestException({
        code: 'SIGNATURE_COUNT_CORRECTION_HASH_MISMATCH',
        message:
          'payloadSha256 no corresponde al contenido canonico y la ruta.',
      });
    }
  }

  private assertProposedCounts(dto: ProposeSignatureCountCorrectionDto) {
    const counts = COUNT_FIELDS.map((definition) => dto[definition.proposed]);
    if (
      !counts.every(
        (count) => Number.isInteger(count) && count >= 0 && count <= MAX_COUNT,
      ) ||
      dto.proposedPlannedForms < 1 ||
      dto.proposedIssuedForms > dto.proposedPlannedForms ||
      dto.proposedReturnedForms +
        dto.proposedAnnulledForms +
        dto.proposedMissingForms +
        dto.proposedInCustodyForms !==
        dto.proposedIssuedForms ||
      dto.proposedInternalAcceptedSupports +
        dto.proposedInternalRejectedSupports !==
        dto.proposedReportedSupports ||
      dto.proposedPossibleDuplicateSupports >
        dto.proposedInternalRejectedSupports
    ) {
      throw new BadRequestException({
        code: 'SIGNATURE_COUNT_CORRECTION_ARITHMETIC_INVALID',
        message:
          'Los valores absolutos propuestos incumplen las ecuaciones exactas de formularios o apoyos.',
      });
    }
  }

  private assertStatusCompatibility(
    status: SignatureCollectionBatchStatus,
    dto: ProposeSignatureCountCorrectionDto,
  ) {
    const invalid =
      (status === SignatureCollectionBatchStatus.PLANNED &&
        dto.proposedIssuedForms !== 0) ||
      (status === SignatureCollectionBatchStatus.ISSUED &&
        (dto.proposedIssuedForms === 0 ||
          dto.proposedInCustodyForms !== dto.proposedIssuedForms)) ||
      (status === SignatureCollectionBatchStatus.PARTIALLY_RETURNED &&
        (dto.proposedIssuedForms === 0 ||
          dto.proposedInCustodyForms === 0 ||
          dto.proposedInCustodyForms >= dto.proposedIssuedForms)) ||
      ((
        [
          SignatureCollectionBatchStatus.RETURNED,
          SignatureCollectionBatchStatus.INTERNAL_REVIEWED,
          SignatureCollectionBatchStatus.DELIVERED_TO_COMMITTEE,
          SignatureCollectionBatchStatus.SUBMITTED_TO_AUTHORITY,
          SignatureCollectionBatchStatus.AUTHORITY_RESULT_RECORDED,
        ] as SignatureCollectionBatchStatus[]
      ).includes(status) &&
        dto.proposedInCustodyForms !== 0);
    if (invalid) {
      throw new BadRequestException({
        code: 'SIGNATURE_COUNT_CORRECTION_STATUS_INCOMPATIBLE',
        message:
          'Los valores propuestos son incompatibles con el estado anterior a la cuarentena.',
      });
    }
  }

  private assertCanonicalStoragePath(tenantId: string, path: string) {
    const prefix = `${tenantId}/signature-collection/`;
    const objectName = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    if (
      path.length > 512 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|webp)$/i.test(
        objectName,
      )
    ) {
      throw new BadRequestException({
        code: 'SIGNATURE_CORRECTION_STORAGE_PATH_INVALID',
        message:
          'La evidencia debe usar la ruta privada firmada del tenant y del modulo de firmas.',
      });
    }
  }

  private assertBatchId(batchId: string) {
    if (!SAFE_ID.test(batchId)) {
      throw new BadRequestException('Identificador de lote invalido.');
    }
  }

  private assertProposalId(proposalId: string) {
    if (!UUID_V4.test(proposalId)) {
      throw new BadRequestException('Identificador de propuesta invalido.');
    }
  }

  private versionConflict(current: number, expected: number) {
    return new ConflictException({
      code: 'SIGNATURE_COUNT_CORRECTION_VERSION_CONFLICT',
      message: `El lote esta en version ${current}; se esperaba ${expected}.`,
    });
  }

  private audit(
    transaction: Prisma.TransactionClient,
    input: {
      tenantId: string;
      actorUserId: string;
      action: string;
      resourceType: string;
      resourceId: string;
      after: Prisma.InputJsonObject;
    },
  ) {
    return transaction.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        after: input.after,
      },
    });
  }

  private async runWithConcurrencyReplay<T>(execute: () => Promise<T>) {
    try {
      return await execute();
    } catch (error: unknown) {
      if (!this.isPrismaError(error, 'P2002', 'P2034')) throw error;
      try {
        return await execute();
      } catch (retryError: unknown) {
        if (this.isPrismaError(retryError, 'P2034')) {
          throw new ConflictException({
            code: 'SIGNATURE_COUNT_CORRECTION_CONCURRENT_CHANGE',
            message:
              'El lote cambio concurrentemente; recargue la fotografia antes de intentar de nuevo.',
          });
        }
        throw retryError;
      }
    }
  }

  private isPrismaError(error: unknown, ...codes: string[]): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string' &&
      codes.includes((error as { code: string }).code)
    );
  }
}
