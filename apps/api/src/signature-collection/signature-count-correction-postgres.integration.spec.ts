import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  PrismaClient,
  Role,
  SignatureCollectionBatchStatus,
  SignatureCountCorrectionCommandType,
  SignatureCountCorrectionDecisionType,
  SignatureCountCorrectionReviewControl,
  StorageObjectModule,
  StoredObjectStatus,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  PrismaService,
  resolveDatabaseSchema,
  resolveDatabaseSearchPathOptions,
} from '../prisma/prisma.service';
import type {
  CreateSignatureBatchDto,
  CreateSignatureCollectionPlanDto,
  IssueSignatureBatchDto,
  QuarantineSignatureBatchDto,
  ReleaseSignatureBatchDto,
  ReturnSignatureBatchDto,
} from './dto/signature-collection.dto';
import {
  DecideSignatureCountCorrectionDto,
  ProposeSignatureCountCorrectionDto,
  SignatureCountCorrectionDecisionInput,
} from './dto/signature-count-correction.dto';
import {
  computeSignatureCommandSha256,
  type SignatureCommandName,
} from './signature-collection.hash';
import {
  computeSignatureCountCorrectionSha256,
  type SignatureCountCorrectionCommandName,
} from './signature-count-correction.hash';
import { SignatureCollectionService } from './signature-collection.service';
import { SignatureCountCorrectionService } from './signature-count-correction.service';

const databaseUrl =
  process.env.SIGNATURE_COUNT_CORRECTION_INTEGRATION_DATABASE_URL?.trim() ??
  process.env.TEST_DATABASE_URL?.trim();
const databaseSchema = resolveDatabaseSchema(databaseUrl) ?? 'public';
const physicalDescribe = databaseUrl ? describe : describe.skip;

function oldCommand<T extends object>(
  type: SignatureCommandName,
  input: T,
  binding: object = {},
): T & { payloadSha256: string } {
  return {
    ...input,
    payloadSha256: computeSignatureCommandSha256(type, {
      ...binding,
      ...input,
    }),
  };
}

function correctionCommand<T extends object>(
  type: SignatureCountCorrectionCommandName,
  input: T,
  binding: object,
): T & { payloadSha256: string } {
  return {
    ...input,
    payloadSha256: computeSignatureCountCorrectionSha256(type, {
      ...binding,
      ...input,
    }),
  };
}

physicalDescribe(
  'SignatureCountCorrectionService on migrated PostgreSQL 16',
  () => {
    let prisma: PrismaClient;
    let signatures: SignatureCollectionService;
    let corrections: SignatureCountCorrectionService;

    beforeAll(async () => {
      const adapter = new PrismaPg(
        {
          connectionString: databaseUrl,
          options: resolveDatabaseSearchPathOptions(databaseSchema),
        },
        { schema: databaseSchema },
      );
      prisma = new PrismaClient({ adapter });
      await prisma.$connect();
      signatures = new SignatureCollectionService(
        prisma as unknown as PrismaService,
      );
      corrections = new SignatureCountCorrectionService(
        prisma as unknown as PrismaService,
      );
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function createUser(tenantId: string, role: Role, label: string) {
      const userId = `${label}-${randomUUID()}`;
      await prisma.user.create({
        data: {
          id: userId,
          tenantId,
          email: `${label}-${randomUUID()}@signature-correction.invalid`,
          password: 'not-a-real-credential',
          name: `Control ${label}`,
          role,
          isActive: true,
        },
      });
      return { tenantId, userId, role } satisfies AuthenticatedUser;
    }

    async function createContext() {
      const suffix = randomUUID();
      const tenantId = `tenant-signature-correction-${suffix}`;
      await prisma.tenant.create({
        data: {
          id: tenantId,
          slug: `signature-correction-${suffix}`,
          name: 'Comite ciudadano de prueba fisica',
          type: TenantType.GSC,
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        },
      });
      const manager = await createUser(
        tenantId,
        Role.CAMPAIGN_MANAGER,
        'manager',
      );
      const custodian = await createUser(
        tenantId,
        Role.ZONE_COORDINATOR,
        'custodian',
      );
      const complianceA = await createUser(
        tenantId,
        Role.COMPLIANCE_OFFICER,
        'compliance-a',
      );
      const complianceB = await createUser(
        tenantId,
        Role.COMPLIANCE_OFFICER,
        'compliance-b',
      );
      const auditor = await createUser(tenantId, Role.AUDITOR, 'auditor');
      const profile = await prisma.operationProfile.create({
        data: {
          tenantId,
          operationType: PoliticalOperationType.SIGNATURE_COMMITTEE,
          stage: PoliticalOperationStage.SIGNATURE_COLLECTION,
          electionType: ElectoralContestType.MAYORALTY,
          circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
          circumscriptionName: 'Municipio de prueba',
          electionDate: new Date('2099-06-01T00:00:00.000Z'),
          votingStartDate: new Date('2099-06-01T00:00:00.000Z'),
          votingEndDate: new Date('2099-06-01T00:00:00.000Z'),
          expectedTeamSize: 5,
          candidateCount: 1,
          dataControllerName: 'Comite responsable de integracion',
          responsibleDataUserId: manager.userId,
          retentionPeriodDays: 365,
          revocationProcedure:
            'Solicitud verificable dirigida al responsable del tratamiento.',
          createdById: manager.userId,
          updatedById: manager.userId,
        },
      });
      await signatures.createPlan(
        manager,
        oldCommand('PLAN_CREATE', {
          clientRequestId: randomUUID(),
          committeeMemberCount: 3 as const,
          committeeEvidenceReference:
            'https://evidence.integration.invalid/committee.pdf',
          committeeEvidenceSha256: '1'.repeat(64),
          committeeRegisteredAt: '2099-01-01',
          collectionStartsAt: '2099-02-01',
          collectionClosesAt: '2099-03-01',
          candidateRegistrationClosesAt: '2099-05-01',
          requiredThreshold: 100,
          internalTarget: 130,
          thresholdSourceUrl: 'https://authority.integration.invalid/threshold',
          thresholdSourceReference: 'Acto de umbral para prueba fisica',
          thresholdSourceSha256: '2'.repeat(64),
          fileOwnerUserId: manager.userId,
          custodyOwnerUserId: custodian.userId,
          formHandlingRules:
            'Contar todos los formularios, separar anulados, documentar faltantes y poner cualquier diferencia bajo cuarentena.',
          deliveryPlan:
            'Entrega fisica con conteo, sello, recibo y verificacion independiente antes de cualquier traslado.',
          contingencyPlan:
            'Aislar el lote, preservar folios, documentar el incidente y detener traslados hasta resolverlo.',
          submissionDueAt: '2099-04-01',
        }) as CreateSignatureCollectionPlanDto,
      );
      return {
        tenantId,
        profile,
        manager,
        custodian,
        complianceA,
        complianceB,
        auditor,
      };
    }

    async function quarantinedBatch(
      context: Awaited<ReturnType<typeof createContext>>,
    ) {
      const created = await signatures.createBatch(
        context.manager,
        oldCommand('BATCH_CREATE', {
          clientRequestId: randomUUID(),
          code: `LOTE-${randomUUID().slice(0, 8).toUpperCase()}`,
          territoryReference: 'Zona fisica de integracion',
          plannedForms: 20,
          expectedReturnAt: '2099-02-20T18:00:00.000Z',
        }) as CreateSignatureBatchDto,
      );
      const batchId = created.resource.id;
      await signatures.issueBatch(
        context.manager,
        batchId,
        oldCommand(
          'BATCH_ISSUE',
          {
            clientRequestId: randomUUID(),
            expectedVersion: 1,
            issuedForms: 20,
            receiverUserId: context.custodian.userId,
            observation:
              'Se entregan veinte formularios contados con recibo de custodia verificable.',
            evidenceReference:
              'https://evidence.integration.invalid/issue/receipt',
            evidenceSha256: '3'.repeat(64),
          },
          { batchId },
        ) as IssueSignatureBatchDto,
      );
      await signatures.returnBatch(
        context.manager,
        batchId,
        oldCommand(
          'BATCH_RETURN',
          {
            clientRequestId: randomUUID(),
            expectedVersion: 2,
            returnedForms: 18,
            annulledForms: 1,
            missingForms: 1,
            finalReturn: true,
            receiverUserId: context.manager.userId,
            observation:
              'Retorno final con dieciocho formularios, uno anulado y uno faltante documentado.',
            evidenceReference:
              'https://evidence.integration.invalid/return/receipt',
            evidenceSha256: '4'.repeat(64),
          },
          { batchId },
        ) as ReturnSignatureBatchDto,
      );
      await signatures.quarantineBatch(
        context.manager,
        batchId,
        oldCommand(
          'BATCH_QUARANTINE',
          {
            clientRequestId: randomUUID(),
            expectedVersion: 3,
            observation:
              'El faltante exige inmovilizar el lote y verificar el recuento antes de liberarlo.',
            evidenceReference:
              'https://evidence.integration.invalid/quarantine/record',
            evidenceSha256: '5'.repeat(64),
          },
          { batchId },
        ) as QuarantineSignatureBatchDto,
      );
      return prisma.signatureCollectionBatch.findUniqueOrThrow({
        where: { id_tenantId: { id: batchId, tenantId: context.tenantId } },
      });
    }

    async function evidence(user: AuthenticatedUser, digest = 'a'.repeat(64)) {
      const path = `${user.tenantId}/signature-collection/${randomUUID()}.pdf`;
      const stored = await prisma.storedObject.create({
        data: {
          tenantId: user.tenantId,
          uploaderId: user.userId,
          path,
          module: StorageObjectModule.SIGNATURE_COLLECTION,
          contentType: 'application/pdf',
          expectedSize: 256,
          actualSize: 256,
          etag: `etag-${randomUUID()}`,
          expectedSha256: digest,
          reportedSha256: digest,
          status: StoredObjectStatus.CONFIRMED,
          expiresAt: new Date(Date.now() + 3_600_000),
          confirmedAt: new Date(),
        },
      });
      return { ...stored, digest };
    }

    function proposalInput(
      batch: Awaited<ReturnType<typeof quarantinedBatch>>,
      stored: Awaited<ReturnType<typeof evidence>>,
      supportChange = false,
    ) {
      return correctionCommand(
        'PROPOSE',
        {
          clientRequestId: randomUUID(),
          expectedVersion: batch.version,
          reason:
            'Recuento fisico independiente sustentado en el acta privada confirmada.',
          evidenceStoragePath: stored.path,
          evidenceSha256: stored.digest,
          proposedPlannedForms: 20,
          proposedIssuedForms: 20,
          proposedReturnedForms: 19,
          proposedAnnulledForms: 1,
          proposedMissingForms: 0,
          proposedInCustodyForms: 0,
          proposedReportedSupports: supportChange ? 5 : 0,
          proposedInternalAcceptedSupports: supportChange ? 4 : 0,
          proposedInternalRejectedSupports: supportChange ? 1 : 0,
          proposedPossibleDuplicateSupports: supportChange ? 1 : 0,
        },
        { batchId: batch.id },
      ) as ProposeSignatureCountCorrectionDto;
    }

    function decisionInput(
      proposalId: string,
      decision: SignatureCountCorrectionDecisionInput,
      expectedVersion: number,
    ) {
      return correctionCommand(
        'DECIDE',
        {
          clientRequestId: randomUUID(),
          expectedVersion,
          decision,
          reviewReason:
            'La evidencia y las ecuaciones fueron verificadas de forma independiente.',
        },
        { proposalId },
      ) as DecideSignatureCountCorrectionDto;
    }

    it('serializes independent approvals, applies all values and preserves quarantine', async () => {
      const context = await createContext();
      const batch = await quarantinedBatch(context);
      const stored = await evidence(context.manager);
      const proposal = await corrections.propose(
        context.manager,
        batch.id,
        proposalInput(batch, stored),
      );

      await expect(
        prisma.signatureCollectionBatch.update({
          where: {
            id_tenantId: { id: batch.id, tenantId: context.tenantId },
          },
          data: {
            status: SignatureCollectionBatchStatus.RETURNED,
            statusBeforeQuarantine: null,
            version: { increment: 1 },
          },
        }),
      ).rejects.toThrow(/unresolved count correction/i);
      await expect(
        prisma.signatureCollectionBatch.findUniqueOrThrow({
          where: {
            id_tenantId: { id: batch.id, tenantId: context.tenantId },
          },
        }),
      ).resolves.toMatchObject({
        status: SignatureCollectionBatchStatus.QUARANTINED,
        statusBeforeQuarantine: SignatureCollectionBatchStatus.RETURNED,
        version: 4,
      });

      await prisma.user.update({
        where: {
          id_tenantId: {
            id: context.manager.userId,
            tenantId: context.tenantId,
          },
        },
        data: { role: Role.COMPLIANCE_OFFICER },
      });
      const selfReviewCommandId = randomUUID();
      await expect(
        prisma.$transaction(async (transaction) => {
          await transaction.signatureCountCorrectionCommand.create({
            data: {
              id: selfReviewCommandId,
              tenantId: context.tenantId,
              clientRequestId: randomUUID(),
              payloadSha256: '9'.repeat(64),
              type: SignatureCountCorrectionCommandType.DECIDE,
              actorUserId: context.manager.userId,
              resourceType: 'SignatureCountCorrectionDecision',
              resourceId: randomUUID(),
              resultSnapshot: { attemptedSelfReview: true },
            },
          });
          await transaction.signatureCountCorrectionDecision.create({
            data: {
              id: randomUUID(),
              tenantId: context.tenantId,
              proposalId: proposal.resource.id,
              commandId: selfReviewCommandId,
              decision: SignatureCountCorrectionDecisionType.APPROVE,
              reviewReason:
                'Intento fisico de auto revision que debe revertirse por completo.',
              reviewedById: context.manager.userId,
              reviewerRole: Role.COMPLIANCE_OFFICER,
              expectedBatchVersion: 4,
              batchVersionBefore: 4,
              batchVersionAfter: 5,
            },
          });
        }),
      ).rejects.toThrow(/distinct active reviewer/i);
      await expect(
        prisma.signatureCountCorrectionCommand.count({
          where: { id: selfReviewCommandId, tenantId: context.tenantId },
        }),
      ).resolves.toBe(0);
      await prisma.user.update({
        where: {
          id_tenantId: {
            id: context.manager.userId,
            tenantId: context.tenantId,
          },
        },
        data: { role: Role.CAMPAIGN_MANAGER },
      });

      await expect(
        signatures.releaseBatch(
          context.manager,
          batch.id,
          oldCommand(
            'BATCH_RELEASE_QUARANTINE',
            {
              clientRequestId: randomUUID(),
              expectedVersion: 4,
              observation:
                'Intento de liberar antes de que exista decision independiente.',
              evidenceReference:
                'https://evidence.integration.invalid/release/premature',
              evidenceSha256: '6'.repeat(64),
            },
            { batchId: batch.id },
          ) as ReleaseSignatureBatchDto,
        ),
      ).rejects.toMatchObject({
        response: { code: 'SIGNATURE_COUNT_CORRECTION_PENDING' },
      });

      const decide = (reviewer: AuthenticatedUser) =>
        corrections.decide(
          reviewer,
          proposal.resource.id,
          decisionInput(
            proposal.resource.id,
            SignatureCountCorrectionDecisionInput.APPROVE,
            4,
          ),
        );
      const outcomes = await Promise.allSettled([
        decide(context.complianceA),
        decide(context.complianceB),
      ]);
      expect(
        outcomes.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(1);
      await expect(
        prisma.signatureCountCorrectionDecision.count({
          where: {
            tenantId: context.tenantId,
            proposalId: proposal.resource.id,
          },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.signatureCollectionBatch.findUniqueOrThrow({
          where: {
            id_tenantId: { id: batch.id, tenantId: context.tenantId },
          },
        }),
      ).resolves.toMatchObject({
        status: SignatureCollectionBatchStatus.QUARANTINED,
        statusBeforeQuarantine: SignatureCollectionBatchStatus.RETURNED,
        plannedForms: 20,
        issuedForms: 20,
        returnedForms: 19,
        annulledForms: 1,
        missingForms: 0,
        inCustodyForms: 0,
        reportedSupports: 0,
        internalAcceptedSupports: 0,
        internalRejectedSupports: 0,
        possibleDuplicateSupports: 0,
        version: 5,
      });

      const physicalProposal =
        await prisma.signatureCountCorrectionProposal.findUniqueOrThrow({
          where: { id: proposal.resource.id },
        });
      await expect(
        prisma.signatureCountCorrectionProposal.update({
          where: { id: physicalProposal.id },
          data: { reason: 'Intento de reescritura prohibido del expediente.' },
        }),
      ).rejects.toThrow(/append-only/i);
      const physicalDecision =
        await prisma.signatureCountCorrectionDecision.findFirstOrThrow({
          where: {
            tenantId: context.tenantId,
            proposalId: physicalProposal.id,
          },
        });
      await expect(
        prisma.signatureCountCorrectionDecision.delete({
          where: { id: physicalDecision.id },
        }),
      ).rejects.toThrow(/append-only/i);
      await expect(
        prisma.$executeRawUnsafe(
          'TRUNCATE TABLE "SignatureCountCorrectionDecision", "SignatureCountCorrectionProposal", "SignatureCountCorrectionCommand"',
        ),
      ).rejects.toThrow(/append-only/i);
    });

    it('routes support corrections to AUDITOR and rejection changes no count', async () => {
      const context = await createContext();
      const batch = await quarantinedBatch(context);
      const stored = await evidence(context.manager, 'b'.repeat(64));
      const proposal = await corrections.propose(
        context.manager,
        batch.id,
        proposalInput(batch, stored, true),
      );
      expect(proposal.resource).toMatchObject({
        requiredReviewControl:
          SignatureCountCorrectionReviewControl.SUPPORT_CLASSIFICATION,
        requiredReviewerRole: Role.AUDITOR,
      });

      await expect(
        corrections.decide(
          context.complianceA,
          proposal.resource.id,
          decisionInput(
            proposal.resource.id,
            SignatureCountCorrectionDecisionInput.REJECT,
            4,
          ),
        ),
      ).rejects.toMatchObject({ status: 403 });
      await corrections.decide(
        context.auditor,
        proposal.resource.id,
        decisionInput(
          proposal.resource.id,
          SignatureCountCorrectionDecisionInput.REJECT,
          4,
        ),
      );
      await expect(
        prisma.signatureCollectionBatch.findUniqueOrThrow({
          where: {
            id_tenantId: { id: batch.id, tenantId: context.tenantId },
          },
        }),
      ).resolves.toMatchObject({
        status: SignatureCollectionBatchStatus.QUARANTINED,
        version: 4,
        returnedForms: 18,
        missingForms: 1,
        reportedSupports: 0,
        internalAcceptedSupports: 0,
        internalRejectedSupports: 0,
        possibleDuplicateSupports: 0,
      });

      const rollbackCommandId = randomUUID();
      const rollbackProposalId = randomUUID();
      const rollbackClientRequestId = randomUUID();
      const rollbackEvidence = await evidence(context.manager, 'c'.repeat(64));
      await expect(
        prisma.$transaction(async (transaction) => {
          await transaction.signatureCountCorrectionCommand.create({
            data: {
              id: rollbackCommandId,
              tenantId: context.tenantId,
              clientRequestId: rollbackClientRequestId,
              payloadSha256: 'd'.repeat(64),
              type: SignatureCountCorrectionCommandType.PROPOSE,
              actorUserId: context.manager.userId,
              resourceType: 'SignatureCountCorrectionProposal',
              resourceId: rollbackProposalId,
              resultSnapshot: { rollback: true },
            },
          });
          await transaction.signatureCountCorrectionProposal.create({
            data: {
              id: rollbackProposalId,
              tenantId: context.tenantId,
              operationProfileId: context.profile.id,
              batchId: batch.id,
              commandId: rollbackCommandId,
              snapshotBatchVersion: 4,
              snapshotStatus: SignatureCollectionBatchStatus.QUARANTINED,
              snapshotStatusBeforeQuarantine:
                SignatureCollectionBatchStatus.RETURNED,
              snapshotPlannedForms: 20,
              snapshotIssuedForms: 20,
              snapshotReturnedForms: 18,
              snapshotAnnulledForms: 1,
              snapshotMissingForms: 1,
              snapshotInCustodyForms: 0,
              snapshotReportedSupports: 0,
              snapshotInternalAcceptedSupports: 0,
              snapshotInternalRejectedSupports: 0,
              snapshotPossibleDuplicateSupports: 0,
              proposedPlannedForms: 20,
              proposedIssuedForms: 20,
              proposedReturnedForms: 18,
              proposedAnnulledForms: 1,
              proposedMissingForms: 1,
              proposedInCustodyForms: 0,
              proposedReportedSupports: 0,
              proposedInternalAcceptedSupports: 0,
              proposedInternalRejectedSupports: 0,
              proposedPossibleDuplicateSupports: 0,
              requiredReviewControl:
                SignatureCountCorrectionReviewControl.CUSTODY_COUNTS,
              reason:
                'Esta propuesta identica debe fallar y revertir el comando previo.',
              evidenceStorageObjectId: rollbackEvidence.id,
              evidenceSha256: rollbackEvidence.digest,
              requestedById: context.manager.userId,
            },
          });
        }),
      ).rejects.toThrow();
      await expect(
        prisma.signatureCountCorrectionCommand.count({
          where: { id: rollbackCommandId, tenantId: context.tenantId },
        }),
      ).resolves.toBe(0);
      await expect(
        prisma.storedObject.findUniqueOrThrow({
          where: { id: rollbackEvidence.id },
        }),
      ).resolves.toMatchObject({ status: StoredObjectStatus.CONFIRMED });

      await prisma.operationProfile.update({
        where: { tenantId: context.tenantId },
        data: { stage: PoliticalOperationStage.CLOSED },
      });
      const closedCommandId = randomUUID();
      await expect(
        prisma.signatureCountCorrectionCommand.create({
          data: {
            id: closedCommandId,
            tenantId: context.tenantId,
            clientRequestId: randomUUID(),
            payloadSha256: 'e'.repeat(64),
            type: SignatureCountCorrectionCommandType.PROPOSE,
            actorUserId: context.manager.userId,
            resourceType: 'SignatureCountCorrectionProposal',
            resourceId: randomUUID(),
            resultSnapshot: { closed: true },
          },
        }),
      ).rejects.toThrow(/CLOSED/i);
    });

    it('keeps correction reads physically isolated by JWT tenant', async () => {
      const left = await createContext();
      const right = await createContext();
      const batch = await quarantinedBatch(left);
      const stored = await evidence(left.manager, 'f'.repeat(64));
      await corrections.propose(
        left.manager,
        batch.id,
        proposalInput(batch, stored),
      );

      await expect(
        corrections.getOverview(left.auditor),
      ).resolves.toMatchObject({
        totalCount: 1,
      });
      await expect(
        corrections.getOverview(right.auditor),
      ).resolves.toMatchObject({
        totalCount: 0,
        proposals: [],
      });
    });
  },
);
