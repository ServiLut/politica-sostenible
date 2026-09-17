import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ElectoralCircumscriptionType,
  ElectoralContestType,
  OperationClosureType,
  OperationTerminationCause,
  OperationTerminationStatus,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  CancelOperationTerminationDto,
  CreateOperationTerminationDto,
  OperationTerminationDecision,
  ReviewOperationTerminationDto,
} from './dto/operation-termination.dto';
import {
  computeOperationTerminationCancellationSha256,
  computeOperationTerminationPayloadSha256,
  computeOperationTerminationReviewSha256,
  OperationTerminationService,
} from './operation-termination.service';

const NOW = new Date('2026-09-09T15:00:00.000Z');
const PROFILE_UPDATED_AT = new Date('2026-09-09T14:00:00.000Z');
const REQUESTER: AuthenticatedUser = {
  userId: 'admin-requester',
  tenantId: 'tenant-a',
  role: Role.ADMIN,
};
const REVIEWER: AuthenticatedUser = {
  userId: 'auditor-reviewer',
  tenantId: 'tenant-a',
  role: Role.AUDITOR,
};

interface DataArgs {
  data: Record<string, unknown>;
}

interface ActorFixture {
  id: string;
  role: Role;
}

function requestDto(
  overrides: Partial<CreateOperationTerminationDto> = {},
): CreateOperationTerminationDto {
  const suppliedHash = overrides.payloadSha256;
  const dto = {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    payloadSha256: '',
    expectedProfileUpdatedAt: PROFILE_UPDATED_AT.toISOString(),
    cause: OperationTerminationCause.REGISTRATION_REVOKED,
    effectiveAt: '2026-09-09T12:00:00.000Z',
    explanation:
      'La autoridad electoral competente revoco formalmente la inscripcion mediante acto definitivo verificable y la campana no puede continuar sin falsear la etapa real del ciclo.',
    authorityName: 'Consejo Nacional Electoral',
    officialActType: 'Resolucion',
    officialActReference: 'CNE-2026-991',
    officialActIssuedAt: '2026-09-09T11:00:00.000Z',
    evidenceReference: 'https://www.cne.gov.co/actos/CNE-2026-991.pdf',
    evidenceSha256: 'b'.repeat(64),
    consequencesAcknowledged: true as const,
    ...overrides,
  } as CreateOperationTerminationDto;
  dto.payloadSha256 =
    suppliedHash ?? computeOperationTerminationPayloadSha256(dto);
  return dto;
}

function reviewDto(
  requestId = 'termination-a',
  overrides: Partial<ReviewOperationTerminationDto> = {},
): ReviewOperationTerminationDto {
  const suppliedHash = overrides.reviewPayloadSha256;
  const dto = {
    clientReviewId: '22222222-2222-4222-8222-222222222222',
    expectedPayloadSha256: requestDto().payloadSha256,
    decision: OperationTerminationDecision.APPROVE,
    reviewPayloadSha256: '',
    ...overrides,
  } as ReviewOperationTerminationDto;
  dto.reviewPayloadSha256 =
    suppliedHash ?? computeOperationTerminationReviewSha256(requestId, dto);
  return dto;
}

function cancelDto(
  requestId = 'termination-a',
  overrides: Partial<CancelOperationTerminationDto> = {},
): CancelOperationTerminationDto {
  const suppliedHash = overrides.cancellationPayloadSha256;
  const dto = {
    clientCancellationId: '33333333-3333-4333-8333-333333333333',
    expectedPayloadSha256: requestDto().payloadSha256,
    cancellationPayloadSha256: '',
    reason:
      'El acto aportado fue sustituido y debe crearse un expediente nuevo.',
    ...overrides,
  } as CancelOperationTerminationDto;
  dto.cancellationPayloadSha256 =
    suppliedHash ??
    computeOperationTerminationCancellationSha256(requestId, dto);
  return dto;
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-a',
    tenantId: 'tenant-a',
    operationType: PoliticalOperationType.SINGLE_CANDIDACY,
    stage: PoliticalOperationStage.CAMPAIGN,
    electionType: ElectoralContestType.MAYORALTY,
    circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
    circumscriptionName: 'Municipio sintetico',
    circumscriptionCode: '05001',
    listType: null,
    electionDate: new Date('2026-10-25T00:00:00.000Z'),
    votingStartDate: new Date('2026-10-25T00:00:00.000Z'),
    votingEndDate: new Date('2026-10-25T00:00:00.000Z'),
    votingWindowSourceUrl: null,
    votingWindowReference: null,
    expectedTeamSize: 20,
    candidateCount: 1,
    dataControllerName: 'Campana sintetica',
    responsibleDataUserId: 'responsible-a',
    retentionPeriodDays: 730,
    closureType: null,
    terminatedAt: null,
    terminationCause: null,
    terminationRequestId: null,
    createdAt: new Date('2026-01-01T12:00:00.000Z'),
    updatedAt: PROFILE_UPDATED_AT,
    ...overrides,
  };
}

function savedRequest(overrides: Record<string, unknown> = {}) {
  const dto = requestDto();
  return {
    id: 'termination-a',
    tenantId: 'tenant-a',
    operationProfileId: 'profile-a',
    clientRequestId: dto.clientRequestId,
    payloadSha256: dto.payloadSha256,
    profileSnapshotSha256: '',
    operationCycleSha256: '',
    expectedProfileUpdatedAt: PROFILE_UPDATED_AT,
    status: OperationTerminationStatus.PENDING,
    cause: dto.cause,
    otherCause: null,
    effectiveAt: new Date(dto.effectiveAt),
    explanation: dto.explanation,
    authorityName: dto.authorityName,
    officialActType: dto.officialActType,
    officialActReference: dto.officialActReference,
    officialActIssuedAt: new Date(dto.officialActIssuedAt),
    evidenceReference: dto.evidenceReference,
    evidenceSha256: dto.evidenceSha256,
    consequencesAcknowledged: true,
    expiresAt: new Date(NOW.getTime() + 72 * 60 * 60 * 1_000),
    expiredAt: null,
    requestedById: REQUESTER.userId,
    reviewedById: null,
    reviewedAt: null,
    reviewClientRequestId: null,
    reviewPayloadSha256: null,
    rejectionReason: null,
    communicationsCancelledCount: null,
    cancelledById: null,
    cancelledAt: null,
    cancellationClientRequestId: null,
    cancellationPayloadSha256: null,
    cancellationReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    requestedBy: {
      id: REQUESTER.userId,
      name: 'Solicitante',
      role: Role.ADMIN,
    },
    reviewedBy: null,
    cancelledBy: null,
    ...overrides,
  };
}

function buildTransaction(
  actor: ActorFixture = { id: REQUESTER.userId, role: Role.ADMIN },
) {
  const currentProfile = profile();
  const transaction = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      }),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue(currentProfile),
      update: jest.fn().mockImplementation(({ data }: DataArgs) =>
        Promise.resolve(
          profile({
            ...data,
            updatedAt: NOW,
            closureType: OperationClosureType.CLOSED_EXCEPTIONAL,
          }),
        ),
      ),
    },
    operationTerminationRequest: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where?.id) return Promise.resolve(savedRequest());
        return Promise.resolve(null);
      }),
      create: jest
        .fn()
        .mockImplementation(({ data }: DataArgs) =>
          Promise.resolve(
            savedRequest({ ...data, createdAt: NOW, updatedAt: NOW }),
          ),
        ),
      update: jest.fn().mockImplementation(({ data }: DataArgs) =>
        Promise.resolve(
          savedRequest({
            ...data,
            reviewedBy:
              data.reviewedById === REVIEWER.userId
                ? { id: REVIEWER.userId, name: 'Auditora', role: Role.AUDITOR }
                : null,
            cancelledBy:
              data.cancelledById === REQUESTER.userId
                ? {
                    id: REQUESTER.userId,
                    name: 'Solicitante',
                    role: Role.ADMIN,
                  }
                : null,
          }),
        ),
      ),
    },
    communicationApproval: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    financialEntry: { count: jest.fn().mockResolvedValue(0) },
    consentNotice: { count: jest.fn().mockResolvedValue(1) },
    storedObject: { count: jest.fn().mockResolvedValue(0) },
    issueCase: { count: jest.fn().mockResolvedValue(0) },
    task: { count: jest.fn().mockResolvedValue(0) },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    $queryRaw: jest.fn().mockImplementation(() => Promise.resolve([actor])),
  };
  return transaction;
}

function buildService(transaction = buildTransaction()) {
  const runTransaction = jest.fn(
    async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  return {
    transaction,
    runTransaction,
    service: new OperationTerminationService({
      $transaction: runTransaction,
    } as unknown as PrismaService),
  };
}

describe('OperationTerminationService', () => {
  it('hashes every relevant request/review/cancellation field deterministically', () => {
    expect(computeOperationTerminationPayloadSha256(requestDto())).toBe(
      requestDto().payloadSha256,
    );
    expect(
      computeOperationTerminationPayloadSha256(
        requestDto({ cause: OperationTerminationCause.DISQUALIFICATION }),
      ),
    ).not.toBe(requestDto().payloadSha256);
    expect(
      computeOperationTerminationReviewSha256('termination-a', reviewDto()),
    ).toBe(reviewDto().reviewPayloadSha256);
    expect(
      computeOperationTerminationCancellationSha256(
        'termination-a',
        cancelDto(),
      ),
    ).toBe(cancelDto().cancellationPayloadSha256);
  });

  it('rejects payload tampering before opening a transaction', async () => {
    const { service, runTransaction } = buildService();
    await expect(
      service.requestTermination(
        REQUESTER,
        requestDto({ payloadSha256: '0'.repeat(64) }),
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('creates a tenant/profile-bound pending request under a serializable lifecycle lock', async () => {
    const { service, transaction, runTransaction } = buildService();
    const result = await service.requestTermination(
      REQUESTER,
      requestDto(),
      NOW,
    );

    expect(result).toMatchObject({ created: true, noOp: false });
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(3);
    expect(transaction.operationTerminationRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: REQUESTER.tenantId,
          operationProfileId: 'profile-a',
          requestedById: REQUESTER.userId,
          status: OperationTerminationStatus.PENDING,
          consequencesAcknowledged: true,
        }),
      }),
    );
    const auditJson = JSON.stringify(
      transaction.auditEvent.create.mock.calls[0]?.[0]?.data?.after,
    );
    expect(auditJson).toContain(requestDto().evidenceSha256);
    expect(auditJson).not.toContain(requestDto().explanation);
    expect(auditJson).not.toContain(requestDto().evidenceReference);
    expect(auditJson).not.toContain(requestDto().authorityName);
  });

  it('rejects inactive/wrong-role actors and never trusts a DTO tenant', async () => {
    const transaction = buildTransaction(undefined as never);
    transaction.$queryRaw.mockResolvedValue([]);
    const { service } = buildService(transaction);
    await expect(
      service.requestTermination(REQUESTER, requestDto(), NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      transaction.operationTerminationRequest.create,
    ).not.toHaveBeenCalled();
    expect(requestDto()).not.toHaveProperty('tenantId');
  });

  it('returns an exact client UUID replay and rejects changed reuse', async () => {
    const exactTransaction = buildTransaction();
    exactTransaction.operationTerminationRequest.findFirst.mockImplementation(
      ({ where }) => {
        if (where?.clientRequestId) return Promise.resolve(savedRequest());
        return Promise.resolve(null);
      },
    );
    await expect(
      buildService(exactTransaction).service.requestTermination(
        REQUESTER,
        requestDto(),
        NOW,
      ),
    ).resolves.toMatchObject({ created: false, noOp: true });

    const changed = requestDto({
      cause: OperationTerminationCause.DISQUALIFICATION,
    });
    const conflictTransaction = buildTransaction();
    conflictTransaction.operationTerminationRequest.findFirst.mockImplementation(
      ({ where }) =>
        Promise.resolve(where?.clientRequestId ? savedRequest() : null),
    );
    await expect(
      buildService(conflictTransaction).service.requestTermination(
        REQUESTER,
        changed,
        NOW,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('approves with four eyes, closes exceptionally and cancels unpublished communications atomically', async () => {
    const transaction = buildTransaction({
      id: REVIEWER.userId,
      role: Role.AUDITOR,
    });
    const serviceForHashes = buildService(transaction).service as unknown as {
      profileSnapshotSha256: (value: ReturnType<typeof profile>) => string;
      operationCycleSha256: (value: ReturnType<typeof profile>) => string;
    };
    const current = profile();
    const bound = savedRequest({
      profileSnapshotSha256: serviceForHashes.profileSnapshotSha256(current),
      operationCycleSha256: serviceForHashes.operationCycleSha256(current),
    });
    transaction.operationTerminationRequest.findFirst.mockImplementation(
      ({ where }) => Promise.resolve(where?.id ? bound : null),
    );
    transaction.communicationApproval.findMany.mockResolvedValue([
      { id: 'communication-a', status: 'SCHEDULED', scheduledAt: NOW },
      { id: 'communication-b', status: 'PENDING', scheduledAt: null },
    ]);
    transaction.operationTerminationRequest.update.mockImplementation(
      ({ data }: DataArgs) =>
        Promise.resolve(
          savedRequest({
            ...bound,
            ...data,
            status: OperationTerminationStatus.APPROVED,
            reviewedBy: {
              id: REVIEWER.userId,
              name: 'Auditora',
              role: Role.AUDITOR,
            },
          }),
        ),
    );
    const { service } = buildService(transaction);
    const result = await service.reviewTermination(
      REVIEWER,
      'termination-a',
      reviewDto(),
      NOW,
    );

    expect(result).toMatchObject({
      approved: true,
      noOp: false,
      profile: {
        stage: PoliticalOperationStage.CLOSED,
        closureType: OperationClosureType.CLOSED_EXCEPTIONAL,
      },
      dossier: {
        complianceCertified: false,
        authorityFilingCertified: false,
        communicationsCancelledOnApproval: 2,
      },
    });
    expect(transaction.communicationApproval.updateMany).toHaveBeenCalled();
    expect(transaction.operationProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stage: PoliticalOperationStage.CLOSED,
          closureType: OperationClosureType.CLOSED_EXCEPTIONAL,
          terminationRequestId: 'termination-a',
        }),
      }),
    );
  });

  it('forbids same-actor review and rejects approval after profile drift', async () => {
    const sameActor = buildTransaction({
      id: REQUESTER.userId,
      role: Role.AUDITOR,
    });
    await expect(
      buildService(sameActor).service.reviewTermination(
        { ...REQUESTER, role: Role.AUDITOR },
        'termination-a',
        reviewDto(),
        NOW,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const drifted = buildTransaction({
      id: REVIEWER.userId,
      role: Role.AUDITOR,
    });
    drifted.operationProfile.findUnique.mockResolvedValue(
      profile({ updatedAt: new Date('2026-09-09T14:30:00.000Z') }),
    );
    await expect(
      buildService(drifted).service.reviewTermination(
        REVIEWER,
        'termination-a',
        reviewDto(),
        NOW,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'TERMINATION_PROFILE_CHANGED',
      }),
    });
  });

  it('expires before review and only lets the original active ADMIN cancel pending', async () => {
    const expiredAt = new Date(NOW.getTime() + 73 * 60 * 60 * 1_000);
    const expiredRequest = savedRequest({
      expiresAt: new Date(NOW.getTime() + 72 * 60 * 60 * 1_000),
    });
    const expiryTx = buildTransaction({
      id: REVIEWER.userId,
      role: Role.AUDITOR,
    });
    let expired = false;
    expiryTx.operationTerminationRequest.findFirst.mockImplementation(
      ({ where }) => {
        if (where?.expiresAt && !expired)
          return Promise.resolve(expiredRequest);
        if (where?.id) {
          return Promise.resolve(
            expired
              ? savedRequest({
                  status: OperationTerminationStatus.EXPIRED,
                  expiredAt,
                })
              : expiredRequest,
          );
        }
        return Promise.resolve(null);
      },
    );
    expiryTx.operationTerminationRequest.update.mockImplementation(
      ({ data }: DataArgs) => {
        expired = data.status === OperationTerminationStatus.EXPIRED;
        return Promise.resolve(savedRequest({ ...data }));
      },
    );
    await expect(
      buildService(expiryTx).service.reviewTermination(
        REVIEWER,
        'termination-a',
        reviewDto(),
        expiredAt,
      ),
    ).resolves.toMatchObject({ expired: true, noOp: true });
    expect(expiryTx.operationProfile.update).not.toHaveBeenCalled();

    const cancellationTx = buildTransaction();
    const cancellationResult = await buildService(
      cancellationTx,
    ).service.cancelTermination(REQUESTER, 'termination-a', cancelDto(), NOW);
    expect(cancellationResult).toMatchObject({ cancelled: true, noOp: false });
    expect(cancellationTx.operationProfile.update).not.toHaveBeenCalled();
  });

  it.each(['P2002', 'P2034'])(
    'fails cancellation closed when PostgreSQL reports concurrent lifecycle conflict %s',
    async (code) => {
      const service = new OperationTerminationService({
        $transaction: jest.fn().mockRejectedValue({ code }),
      } as unknown as PrismaService);

      await expect(
        service.cancelTermination(REQUESTER, 'termination-a', cancelDto(), NOW),
      ).rejects.toMatchObject({
        response: {
          statusCode: 409,
          message:
            'La solicitud cambio durante la cancelacion; recargue e intente nuevamente',
        },
      });
    },
  );
});
