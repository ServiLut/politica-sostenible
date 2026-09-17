import { ForbiddenException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Role,
  SignatureCollectionBatchStatus,
  SignatureCountCorrectionCommandType,
  SignatureCountCorrectionReviewControl,
  StoredObjectStatus,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  DecideSignatureCountCorrectionDto,
  ProposeSignatureCountCorrectionDto,
  SignatureCountCorrectionDecisionInput,
} from './dto/signature-count-correction.dto';
import { computeSignatureCountCorrectionSha256 } from './signature-count-correction.hash';
import { SignatureCountCorrectionService } from './signature-count-correction.service';

const proposer: AuthenticatedUser = {
  tenantId: 'tenant-a',
  userId: 'manager-a',
  role: Role.CAMPAIGN_MANAGER,
};
const evidencePath =
  'tenant-a/signature-collection/11111111-1111-4111-8111-111111111111.pdf';

const beforeBatch = {
  id: 'batch-a',
  tenantId: proposer.tenantId,
  operationProfileId: 'profile-a',
  planId: 'plan-a',
  initialCommandId: 'old-command',
  code: 'LOTE-A',
  physicalSealReference: null,
  territoryReference: 'Zona norte',
  expectedReturnAt: new Date('2026-09-20T17:00:00.000Z'),
  status: SignatureCollectionBatchStatus.QUARANTINED,
  statusBeforeQuarantine: SignatureCollectionBatchStatus.RETURNED,
  plannedForms: 10,
  issuedForms: 10,
  returnedForms: 8,
  annulledForms: 1,
  missingForms: 1,
  inCustodyForms: 0,
  reportedSupports: 7,
  internalAcceptedSupports: 6,
  internalRejectedSupports: 1,
  possibleDuplicateSupports: 0,
  currentCustodianUserId: null,
  issuedAt: new Date(),
  returnedAt: new Date(),
  internallyReviewedAt: null,
  deliveredToCommitteeAt: null,
  submittedToAuthorityAt: null,
  authorityResultRecordedAt: null,
  version: 4,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function proposalDto(): ProposeSignatureCountCorrectionDto {
  const dto = Object.assign(new ProposeSignatureCountCorrectionDto(), {
    clientRequestId: '22222222-2222-4222-8222-222222222222',
    payloadSha256: '',
    expectedVersion: 4,
    reason: 'Recuento fisico documentado por custodia independiente.',
    evidenceStoragePath: evidencePath,
    evidenceSha256: 'a'.repeat(64),
    proposedPlannedForms: 10,
    proposedIssuedForms: 10,
    proposedReturnedForms: 9,
    proposedAnnulledForms: 1,
    proposedMissingForms: 0,
    proposedInCustodyForms: 0,
    proposedReportedSupports: 7,
    proposedInternalAcceptedSupports: 6,
    proposedInternalRejectedSupports: 1,
    proposedPossibleDuplicateSupports: 0,
  });
  dto.payloadSha256 = computeSignatureCountCorrectionSha256('PROPOSE', {
    batchId: beforeBatch.id,
    ...dto,
  });
  return dto;
}

function publicProposal(
  data: Record<string, unknown>,
  options?: {
    supportChange?: boolean;
    requesterId?: string;
    decided?: boolean;
  },
) {
  const supportChange = options?.supportChange ?? false;
  const proposedReportedSupports = supportChange ? 8 : 7;
  const proposedAccepted = supportChange ? 7 : 6;
  const decision = options?.decided
    ? {
        id: '44444444-4444-4444-8444-444444444444',
        decision: 'APPROVE',
        reviewReason: 'Evidencia contrastada por la auditoria independiente.',
        reviewerRole: Role.AUDITOR,
        expectedBatchVersion: 4,
        batchVersionBefore: 4,
        batchVersionAfter: 5,
        createdAt: new Date(),
        reviewedBy: {
          id: 'auditor-a',
          name: 'Auditor',
          role: Role.AUDITOR,
          isActive: true,
        },
      }
    : null;
  return {
    id: data.id,
    tenantId: proposer.tenantId,
    operationProfileId: 'profile-a',
    batchId: beforeBatch.id,
    snapshotBatchVersion: 4,
    snapshotStatus: SignatureCollectionBatchStatus.QUARANTINED,
    snapshotStatusBeforeQuarantine: SignatureCollectionBatchStatus.RETURNED,
    snapshotPlannedForms: 10,
    snapshotIssuedForms: 10,
    snapshotReturnedForms: 8,
    snapshotAnnulledForms: 1,
    snapshotMissingForms: 1,
    snapshotInCustodyForms: 0,
    snapshotReportedSupports: 7,
    snapshotInternalAcceptedSupports: 6,
    snapshotInternalRejectedSupports: 1,
    snapshotPossibleDuplicateSupports: 0,
    proposedPlannedForms: 10,
    proposedIssuedForms: 10,
    proposedReturnedForms: supportChange ? 8 : 9,
    proposedAnnulledForms: 1,
    proposedMissingForms: supportChange ? 1 : 0,
    proposedInCustodyForms: 0,
    proposedReportedSupports,
    proposedInternalAcceptedSupports: proposedAccepted,
    proposedInternalRejectedSupports: 1,
    proposedPossibleDuplicateSupports: 0,
    requiredReviewControl: supportChange
      ? SignatureCountCorrectionReviewControl.SUPPORT_CLASSIFICATION
      : SignatureCountCorrectionReviewControl.CUSTODY_COUNTS,
    reason: 'Recuento fisico documentado por custodia independiente.',
    evidenceSha256: 'a'.repeat(64),
    createdAt: new Date(),
    requestedBy: {
      id: options?.requesterId ?? proposer.userId,
      name: 'Gerencia',
      role: Role.CAMPAIGN_MANAGER,
      isActive: true,
    },
    evidenceStorageObject: {
      id: 'stored-a',
      contentType: 'application/pdf',
      actualSize: 100,
      confirmedAt: new Date(),
      status: StoredObjectStatus.CONSUMED,
    },
    decision,
    batch: {
      id: beforeBatch.id,
      code: beforeBatch.code,
      status: SignatureCollectionBatchStatus.QUARANTINED,
      statusBeforeQuarantine: SignatureCollectionBatchStatus.RETURNED,
      version: decision ? 5 : 4,
      plannedForms: 10,
      issuedForms: 10,
      returnedForms: decision
        ? supportChange
          ? 8
          : 9
        : beforeBatch.returnedForms,
      annulledForms: 1,
      missingForms: decision
        ? supportChange
          ? 1
          : 0
        : beforeBatch.missingForms,
      inCustodyForms: 0,
      reportedSupports: decision
        ? proposedReportedSupports
        : beforeBatch.reportedSupports,
      internalAcceptedSupports: decision
        ? proposedAccepted
        : beforeBatch.internalAcceptedSupports,
      internalRejectedSupports: 1,
      possibleDuplicateSupports: 0,
    },
  };
}

function baseTransaction(actor: { id: string; role: Role }) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.GSC,
      }),
    },
    user: { findFirst: jest.fn().mockResolvedValue(actor) },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'profile-a',
        stage: PoliticalOperationStage.SIGNATURE_COLLECTION,
        operationType: PoliticalOperationType.SIGNATURE_COMMITTEE,
      }),
    },
    signatureCollectionBatch: { findFirst: jest.fn() },
    signatureCountCorrectionCommand: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    signatureCountCorrectionProposal: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    signatureCountCorrectionDecision: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    storedObject: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
}

function serviceWith(transaction: ReturnType<typeof baseTransaction>) {
  const prisma = {
    $transaction: jest.fn((callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  return new SignatureCountCorrectionService(prisma as never);
}

describe('SignatureCountCorrectionService', () => {
  it('replays an identical clientRequestId without duplicating proposal or evidence consumption', async () => {
    const dto = proposalDto();
    const proposalId = '88888888-8888-4888-8888-888888888888';
    const transaction = baseTransaction({
      id: proposer.userId,
      role: Role.CAMPAIGN_MANAGER,
    });
    transaction.signatureCountCorrectionCommand.findFirst.mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      clientRequestId: dto.clientRequestId,
      payloadSha256: dto.payloadSha256,
      type: SignatureCountCorrectionCommandType.PROPOSE,
      actorUserId: proposer.userId,
      resourceType: 'SignatureCountCorrectionProposal',
      resourceId: proposalId,
      createdAt: new Date(),
    });
    transaction.signatureCountCorrectionProposal.findFirst.mockResolvedValue(
      publicProposal({ id: proposalId }),
    );
    const service = serviceWith(transaction);

    await expect(
      service.propose(proposer, beforeBatch.id, dto),
    ).resolves.toMatchObject({
      noOp: true,
      resource: { id: proposalId },
      command: { clientRequestId: dto.clientRequestId },
    });
    expect(
      transaction.signatureCollectionBatch.findFirst,
    ).not.toHaveBeenCalled();
    expect(
      transaction.signatureCountCorrectionCommand.create,
    ).not.toHaveBeenCalled();
    expect(
      transaction.signatureCountCorrectionProposal.create,
    ).not.toHaveBeenCalled();
    expect(transaction.storedObject.updateMany).not.toHaveBeenCalled();
  });

  it('snapshots every count, derives the custody reviewer and consumes confirmed evidence', async () => {
    const dto = proposalDto();
    const transaction = baseTransaction({
      id: proposer.userId,
      role: Role.CAMPAIGN_MANAGER,
    });
    let created: Record<string, unknown> = {};
    transaction.signatureCollectionBatch.findFirst.mockResolvedValue(
      beforeBatch,
    );
    transaction.storedObject.findFirst.mockResolvedValue({ id: 'stored-a' });
    transaction.signatureCountCorrectionCommand.create.mockImplementation(
      ({ data }) => Promise.resolve({ ...data, createdAt: new Date() }),
    );
    transaction.signatureCountCorrectionProposal.create.mockImplementation(
      ({ data }) => {
        created = data;
        return Promise.resolve(data);
      },
    );
    transaction.signatureCountCorrectionProposal.findFirst.mockImplementation(
      ({ where }) =>
        Promise.resolve('decision' in where ? null : publicProposal(created)),
    );
    const service = serviceWith(transaction);

    await expect(
      service.propose(proposer, beforeBatch.id, dto),
    ).resolves.toMatchObject({
      noOp: false,
      resource: {
        requiredReviewControl: 'CUSTODY_COUNTS',
        requiredReviewerRole: Role.COMPLIANCE_OFFICER,
        pending: true,
      },
    });
    expect(created).toMatchObject({
      tenantId: proposer.tenantId,
      batchId: beforeBatch.id,
      snapshotBatchVersion: 4,
      snapshotReturnedForms: 8,
      snapshotMissingForms: 1,
      proposedReturnedForms: 9,
      proposedMissingForms: 0,
      requiredReviewControl:
        SignatureCountCorrectionReviewControl.CUSTODY_COUNTS,
      requestedById: proposer.userId,
    });
    expect(transaction.storedObject.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: proposer.tenantId,
        path: evidencePath,
        expectedSha256: dto.evidenceSha256,
        reportedSha256: dto.evidenceSha256,
        consumedAt: null,
      }),
      data: expect.objectContaining({
        consumedByType: 'SignatureCountCorrectionProposal',
      }),
    });
  });

  it('requires a distinct exact-matrix auditor for support classification', async () => {
    const auditor: AuthenticatedUser = {
      tenantId: proposer.tenantId,
      userId: 'auditor-a',
      role: Role.AUDITOR,
    };
    const dto = Object.assign(new DecideSignatureCountCorrectionDto(), {
      clientRequestId: '33333333-3333-4333-8333-333333333333',
      payloadSha256: '',
      expectedVersion: 4,
      decision: SignatureCountCorrectionDecisionInput.APPROVE,
      reviewReason: 'Evidencia contrastada por la auditoria independiente.',
    });
    const proposalId = '55555555-5555-4555-8555-555555555555';
    dto.payloadSha256 = computeSignatureCountCorrectionSha256('DECIDE', {
      proposalId,
      ...dto,
    });
    const transaction = baseTransaction({
      id: auditor.userId,
      role: Role.AUDITOR,
    });
    let decided = false;
    transaction.signatureCountCorrectionProposal.findFirst.mockImplementation(
      () =>
        Promise.resolve(
          publicProposal({ id: proposalId }, { supportChange: true, decided }),
        ),
    );
    transaction.signatureCountCorrectionCommand.create.mockImplementation(
      ({ data }) => Promise.resolve({ ...data, createdAt: new Date() }),
    );
    transaction.signatureCountCorrectionDecision.create.mockImplementation(
      ({ data }) => {
        decided = true;
        return Promise.resolve(data);
      },
    );
    const service = serviceWith(transaction);

    await expect(
      service.decide(auditor, proposalId, dto),
    ).resolves.toMatchObject({
      resource: {
        decision: { decision: 'APPROVE', reviewerRole: Role.AUDITOR },
        currentBatch: {
          status: SignatureCollectionBatchStatus.QUARANTINED,
          version: 5,
        },
      },
    });
    expect(
      transaction.signatureCountCorrectionDecision.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proposalId,
        reviewedById: auditor.userId,
        reviewerRole: Role.AUDITOR,
        expectedBatchVersion: 4,
        batchVersionBefore: 4,
        batchVersionAfter: 5,
      }),
    });
  });

  it('rejects self-review before creating a terminal decision', async () => {
    const compliance: AuthenticatedUser = {
      tenantId: proposer.tenantId,
      userId: 'compliance-a',
      role: Role.COMPLIANCE_OFFICER,
    };
    const dto = Object.assign(new DecideSignatureCountCorrectionDto(), {
      clientRequestId: '66666666-6666-4666-8666-666666666666',
      payloadSha256: '',
      expectedVersion: 4,
      decision: SignatureCountCorrectionDecisionInput.REJECT,
      reviewReason: 'La misma persona no puede revisar su propia solicitud.',
    });
    const proposalId = '77777777-7777-4777-8777-777777777777';
    dto.payloadSha256 = computeSignatureCountCorrectionSha256('DECIDE', {
      proposalId,
      ...dto,
    });
    const transaction = baseTransaction({
      id: compliance.userId,
      role: Role.COMPLIANCE_OFFICER,
    });
    transaction.signatureCountCorrectionProposal.findFirst.mockResolvedValue(
      publicProposal({ id: proposalId }, { requesterId: compliance.userId }),
    );
    const service = serviceWith(transaction);

    await expect(
      service.decide(compliance, proposalId, dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      transaction.signatureCountCorrectionDecision.create,
    ).not.toHaveBeenCalled();
  });
});
