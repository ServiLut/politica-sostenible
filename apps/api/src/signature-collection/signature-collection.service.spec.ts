import { ConflictException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Role,
  SignatureAuthorityReviewDecision,
  SignatureCollectionCommandType,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateSignatureBatchDto } from './dto/signature-collection.dto';
import { computeSignatureCommandSha256 } from './signature-collection.hash';
import { SignatureCollectionService } from './signature-collection.service';

const user: AuthenticatedUser = {
  tenantId: 'tenant-a',
  userId: 'actor-a',
  role: Role.ADMIN,
};

function batchDto(): CreateSignatureBatchDto {
  const dto = Object.assign(new CreateSignatureBatchDto(), {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    payloadSha256: '',
    code: 'LOTE-001',
    territoryReference: 'Zona norte',
    plannedForms: 25,
    expectedReturnAt: '2099-10-01T18:00:00.000Z',
  });
  dto.payloadSha256 = computeSignatureCommandSha256('BATCH_CREATE', dto);
  return dto;
}

function transactionFor(options?: {
  stage?: PoliticalOperationStage;
  actor?: { id: string; role: Role } | null;
}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.CANDIDACY,
      }),
    },
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options?.actor === undefined
            ? { id: user.userId, role: Role.ADMIN }
            : options.actor,
        ),
      findMany: jest.fn(),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'profile-a',
        stage: options?.stage ?? PoliticalOperationStage.SIGNATURE_COLLECTION,
        operationType: PoliticalOperationType.SIGNATURE_COMMITTEE,
      }),
    },
    signatureCollectionCommand: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    signatureCollectionPlan: {
      findFirst: jest.fn(),
    },
    signatureCollectionBatch: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    signatureCountCorrectionProposal: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    signatureAuthorityResult: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    signatureCustodyEvent: { create: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
}

function serviceWith(transaction: ReturnType<typeof transactionFor>) {
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback(transaction),
    ),
  };
  return {
    service: new SignatureCollectionService(prisma as never),
    prisma,
  };
}

describe('SignatureCollectionService', () => {
  it('returns active responsible users before a plan exists so setup is actionable', async () => {
    const transaction = transactionFor({
      stage: PoliticalOperationStage.PRE_CAMPAIGN,
    });
    const operators = [
      { id: 'owner-a', name: 'Expediente', role: Role.ADMIN, isActive: true },
      {
        id: 'owner-b',
        name: 'Custodia',
        role: Role.ZONE_COORDINATOR,
        isActive: true,
      },
    ];
    transaction.user.findMany.mockResolvedValue(operators);
    transaction.signatureCollectionPlan.findFirst.mockResolvedValue(null);
    const { service } = serviceWith(transaction);

    await expect(service.getOverview(user)).resolves.toMatchObject({
      plan: null,
      batches: [],
      authorityResults: [],
      operators,
      readiness: { entryReady: false, exitReady: false },
    });
    expect(transaction.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: user.tenantId }),
      }),
    );
  });

  it('rejects a forged canonical payload before opening a transaction', async () => {
    const transaction = transactionFor();
    const { service, prisma } = serviceWith(transaction);
    const dto = batchDto();
    dto.payloadSha256 = '0'.repeat(64);

    await expect(service.createBatch(user, dto)).rejects.toMatchObject({
      response: { code: 'SIGNATURE_PAYLOAD_HASH_MISMATCH' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('revalidates CLOSED under the lifecycle lock before command creation', async () => {
    const transaction = transactionFor({
      stage: PoliticalOperationStage.CLOSED,
    });
    const { service, prisma } = serviceWith(transaction);

    await expect(service.createBatch(user, batchDto())).rejects.toMatchObject({
      response: { code: 'OPERATION_CLOSED' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(
      transaction.signatureCollectionCommand.findFirst,
    ).not.toHaveBeenCalled();
    expect(
      transaction.signatureCollectionCommand.create,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when the current actor no longer has an authorized role', async () => {
    const transaction = transactionFor({ actor: null });
    const { service } = serviceWith(transaction);

    await expect(service.createBatch(user, batchDto())).rejects.toMatchObject({
      status: 403,
    });
    expect(
      transaction.signatureCollectionCommand.findFirst,
    ).not.toHaveBeenCalled();
  });

  it('returns the original resource for an exact idempotent replay', async () => {
    const transaction = transactionFor();
    const dto = batchDto();
    const command = {
      id: 'command-existing',
      clientRequestId: dto.clientRequestId,
      payloadSha256: dto.payloadSha256,
      type: SignatureCollectionCommandType.BATCH_CREATE,
      actorUserId: user.userId,
      resourceType: 'SignatureCollectionBatch',
      resourceId: 'batch-existing',
      createdAt: new Date('2026-09-09T12:00:00.000Z'),
    };
    transaction.signatureCollectionCommand.findFirst.mockResolvedValue(command);
    transaction.signatureCollectionBatch.findFirst.mockResolvedValue({
      id: command.resourceId,
      tenantId: user.tenantId,
    });
    const { service } = serviceWith(transaction);

    await expect(service.createBatch(user, dto)).resolves.toMatchObject({
      noOp: true,
      command: { id: command.id },
      resource: { id: command.resourceId, tenantId: user.tenantId },
    });
    expect(
      transaction.signatureCollectionCommand.create,
    ).not.toHaveBeenCalled();
    expect(
      transaction.signatureCollectionPlan.findFirst,
    ).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of a request id with a different canonical hash', async () => {
    const transaction = transactionFor();
    const dto = batchDto();
    transaction.signatureCollectionCommand.findFirst.mockResolvedValue({
      id: 'command-existing',
      clientRequestId: dto.clientRequestId,
      payloadSha256: 'f'.repeat(64),
      type: SignatureCollectionCommandType.BATCH_CREATE,
      actorUserId: user.userId,
      resourceType: 'SignatureCollectionBatch',
      resourceId: 'batch-existing',
      createdAt: new Date('2026-09-09T12:00:00.000Z'),
    });
    const { service } = serviceWith(transaction);

    await expect(service.createBatch(user, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      transaction.signatureCollectionBatch.findFirst,
    ).not.toHaveBeenCalled();
    expect(
      transaction.signatureCollectionCommand.create,
    ).not.toHaveBeenCalled();
  });

  it('rejects a reviewer who recorded the same authority result', async () => {
    const reviewer: AuthenticatedUser = {
      ...user,
      userId: 'reviewer-a',
      role: Role.COMPLIANCE_OFFICER,
    };
    const transaction = transactionFor({
      actor: { id: reviewer.userId, role: Role.COMPLIANCE_OFFICER },
    });
    const resultId = 'result-a';
    const dto = {
      clientRequestId: '22222222-2222-4222-8222-222222222222',
      payloadSha256: '',
      decision: SignatureAuthorityReviewDecision.APPROVE,
    };
    dto.payloadSha256 = computeSignatureCommandSha256(
      'AUTHORITY_RESULT_REVIEW',
      { resultId, ...dto },
    );
    transaction.signatureCollectionCommand.findFirst.mockResolvedValue(null);
    transaction.signatureCollectionCommand.create.mockResolvedValue({
      id: 'command-review',
      clientRequestId: dto.clientRequestId,
      payloadSha256: dto.payloadSha256,
      type: SignatureCollectionCommandType.AUTHORITY_RESULT_REVIEW,
      actorUserId: reviewer.userId,
      resourceType: 'SignatureAuthorityResult',
      resourceId: resultId,
      createdAt: new Date('2026-09-09T12:00:00.000Z'),
    });
    transaction.signatureAuthorityResult.findFirst.mockResolvedValue({
      id: resultId,
      planId: 'plan-a',
      recordedById: reviewer.userId,
      validSupports: 101,
      outcome: 'THRESHOLD_MET',
      review: null,
    });
    const { service } = serviceWith(transaction);

    await expect(
      service.reviewAuthorityResult(reviewer, resultId, dto),
    ).rejects.toMatchObject({
      response: { code: 'FOUR_EYES_REQUIRED' },
    });
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });
});
