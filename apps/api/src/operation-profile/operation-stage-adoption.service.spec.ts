import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ElectoralCircumscriptionType,
  ElectoralCodeNamespace,
  ElectoralContestType,
  OperationStageAdoptionStatus,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOperationStageAdoptionDto,
  OperationAdoptionDecision,
  ReviewOperationStageAdoptionDto,
} from './dto/operation-stage-adoption.dto';
import {
  computeOperationAdoptionPayloadSha256,
  computeOperationAdoptionReviewSha256,
  OperationStageAdoptionService,
} from './operation-stage-adoption.service';

const NOW = new Date('2026-09-09T15:00:00.000Z');
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

function requestDto(
  overrides: Partial<CreateOperationStageAdoptionDto> = {},
): CreateOperationStageAdoptionDto {
  const suppliedHash = overrides.payloadSha256;
  const dto = {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    payloadSha256: '',
    operationType: PoliticalOperationType.SINGLE_CANDIDACY,
    targetStage: PoliticalOperationStage.CAMPAIGN,
    electionType: ElectoralContestType.MAYORALTY,
    circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
    circumscriptionName: 'Municipio sintetico',
    circumscriptionCode: '05001',
    listType: undefined,
    electionDate: '2026-10-25',
    votingStartDate: '2026-10-25',
    votingEndDate: '2026-10-25',
    expectedTeamSize: 20,
    candidateCount: 1,
    maxTotalBudget: 100_000_000,
    maxPublicityLimit: 20_000_000,
    dataControllerName: 'Comite responsable sintetico',
    responsibleDataUserId: 'responsible-a',
    retentionPeriodDays: 730,
    revocationProcedure:
      'Solicitud escrita al responsable con validacion de identidad.',
    effectiveAt: '2026-09-01T12:00:00.000Z',
    justification:
      'La operacion inicio antes de habilitar la plataforma y se aporta evidencia verificable suficiente para reconstruir responsablemente su estado actual.',
    evidenceReference: 'tenant-a/adoption/evidence-001.json',
    evidenceSha256: 'b'.repeat(64),
    incompleteHistoryAcknowledged: true as const,
    ...overrides,
  } as CreateOperationStageAdoptionDto;
  dto.payloadSha256 =
    suppliedHash ?? computeOperationAdoptionPayloadSha256(dto);
  return dto;
}

function reviewDto(
  requestId = 'adoption-a',
  overrides: Partial<ReviewOperationStageAdoptionDto> = {},
): ReviewOperationStageAdoptionDto {
  const suppliedHash = overrides.reviewPayloadSha256;
  const dto = {
    clientReviewId: '22222222-2222-4222-8222-222222222222',
    expectedPayloadSha256: requestDto().payloadSha256,
    decision: OperationAdoptionDecision.APPROVE,
    reviewPayloadSha256: '',
    ...overrides,
  } as ReviewOperationStageAdoptionDto;
  dto.reviewPayloadSha256 =
    suppliedHash ?? computeOperationAdoptionReviewSha256(requestId, dto);
  return dto;
}

function savedRequest(overrides: Record<string, unknown> = {}) {
  const dto = requestDto();
  return {
    id: 'adoption-a',
    tenantId: REQUESTER.tenantId,
    clientRequestId: dto.clientRequestId,
    payloadSha256: dto.payloadSha256,
    status: OperationStageAdoptionStatus.PENDING,
    operationType: dto.operationType,
    targetStage: dto.targetStage,
    electionType: dto.electionType,
    circumscriptionType: dto.circumscriptionType,
    circumscriptionName: dto.circumscriptionName,
    circumscriptionCode: dto.circumscriptionCode ?? null,
    listType: dto.listType ?? null,
    electionDate: new Date(dto.electionDate),
    votingStartDate: new Date(`${dto.votingStartDate}T00:00:00.000Z`),
    votingEndDate: new Date(`${dto.votingEndDate}T00:00:00.000Z`),
    votingWindowSourceUrl: dto.votingWindowSourceUrl ?? null,
    votingWindowReference: dto.votingWindowReference ?? null,
    expectedTeamSize: dto.expectedTeamSize,
    candidateCount: dto.candidateCount,
    maxTotalBudget: new Prisma.Decimal(String(dto.maxTotalBudget)),
    maxPublicityLimit: new Prisma.Decimal(String(dto.maxPublicityLimit)),
    dataControllerName: dto.dataControllerName,
    responsibleDataUserId: dto.responsibleDataUserId,
    retentionPeriodDays: dto.retentionPeriodDays,
    revocationProcedure: dto.revocationProcedure,
    effectiveAt: new Date(dto.effectiveAt),
    justification: dto.justification,
    evidenceReference: dto.evidenceReference,
    evidenceSha256: dto.evidenceSha256,
    incompleteHistoryAcknowledged: true,
    expiresAt: new Date(NOW.getTime() + 72 * 60 * 60 * 1_000),
    expiredAt: null,
    requestedById: REQUESTER.userId,
    reviewedById: null,
    reviewedAt: null,
    reviewClientRequestId: null,
    reviewPayloadSha256: null,
    rejectionReason: null,
    operationProfileId: null,
    createdAt: NOW,
    updatedAt: NOW,
    requestedBy: {
      id: REQUESTER.userId,
      name: 'Solicitante',
      role: Role.ADMIN,
    },
    reviewedBy: null,
    responsibleDataUser: {
      id: 'responsible-a',
      name: 'Responsable',
      role: Role.COMPLIANCE_OFFICER,
    },
    ...overrides,
  };
}

interface FindFirstArgs {
  where?: Record<string, unknown>;
}

function buildTransaction() {
  const transaction = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        type: TenantType.CANDIDACY,
        defaultMode: 'CAMPAIGN',
      }),
    },
    user: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          const roles = where as { role?: Role | { in?: Role[] } };
          if (where.id === REQUESTER.userId) {
            return Promise.resolve({ id: REQUESTER.userId, role: Role.ADMIN });
          }
          if (where.id === REVIEWER.userId) {
            return Promise.resolve({ id: REVIEWER.userId, role: Role.AUDITOR });
          }
          if (where.id === 'responsible-a') {
            return Promise.resolve({
              id: 'responsible-a',
              role: Role.COMPLIANCE_OFFICER,
            });
          }
          return Promise.resolve(
            roles.role && typeof roles.role === 'object' ? null : null,
          );
        }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    operationStageAdoptionRequest: {
      findFirst: jest.fn().mockImplementation(({ where }: FindFirstArgs) => {
        if (where && 'id' in where) return Promise.resolve(savedRequest());
        return Promise.resolve(null);
      }),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(savedRequest(data)),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(
            savedRequest({
              ...data,
              reviewedBy:
                data.reviewedById === REVIEWER.userId
                  ? {
                      id: REVIEWER.userId,
                      name: 'Auditora',
                      role: Role.AUDITOR,
                    }
                  : null,
              updatedAt: NOW,
            }),
          ),
        ),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'profile-adopted',
        tenantId: REQUESTER.tenantId,
        stage: PoliticalOperationStage.CAMPAIGN,
      }),
    },
    campaignSettings: {
      upsert: jest.fn().mockResolvedValue({
        maxTotalBudget: new Prisma.Decimal('100000000'),
        maxPublicityLimit: new Prisma.Decimal('20000000'),
      }),
    },
    politicalDivision: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    witnessAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    witnessCoverageWindow: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    electoralCatalogRelease: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({ id: 'audit-a' }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
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
    service: new OperationStageAdoptionService({
      $transaction: runTransaction,
    } as unknown as PrismaService),
  };
}

describe('OperationStageAdoptionService', () => {
  it('defines deterministic canonical hashes that change with relevant payload', () => {
    const dto = requestDto();
    const changed = requestDto({
      targetStage: PoliticalOperationStage.SIMULATION,
    });

    expect(computeOperationAdoptionPayloadSha256(dto)).toBe(dto.payloadSha256);
    expect(computeOperationAdoptionPayloadSha256(changed)).not.toBe(
      dto.payloadSha256,
    );
  });

  it('creates a tenant-scoped durable request under an advisory lock', async () => {
    const dto = requestDto();
    const { service, transaction, runTransaction } = buildService();

    await expect(
      service.requestAdoption(REQUESTER, dto, NOW),
    ).resolves.toMatchObject({
      created: true,
      noOp: false,
      request: {
        tenantId: REQUESTER.tenantId,
        status: OperationStageAdoptionStatus.PENDING,
        targetStage: PoliticalOperationStage.CAMPAIGN,
        payloadSha256: dto.payloadSha256,
      },
    });
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      transaction.operationStageAdoptionRequest.create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: REQUESTER.tenantId,
          requestedById: REQUESTER.userId,
          responsibleDataUserId: 'responsible-a',
          incompleteHistoryAcknowledged: true,
        }),
      }),
    );
    const auditCall = transaction.auditEvent.create.mock.calls[0]?.[0] as
      | { data: { after?: unknown } }
      | undefined;
    const auditJson = JSON.stringify(auditCall?.data.after);
    expect(auditJson).toContain(dto.evidenceSha256);
    expect(auditJson).not.toContain(dto.justification);
    expect(auditJson).not.toContain(dto.evidenceReference);
    expect(auditJson).not.toContain(dto.revocationProcedure);
  });

  it('rejects a mismatched payload hash before opening a transaction', async () => {
    const dto = requestDto({ payloadSha256: '0'.repeat(64) });
    const { service, runTransaction } = buildService();

    await expect(
      service.requestAdoption(REQUESTER, dto, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('rejects a requester who is not an active ADMIN in the JWT tenant', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst.mockResolvedValue(null);
    const { service } = buildService(transaction);

    await expect(
      service.requestAdoption(REQUESTER, requestDto(), NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: REQUESTER.userId,
        tenantId: REQUESTER.tenantId,
        isActive: true,
        role: { in: [Role.ADMIN] },
      },
      select: { id: true, role: true },
    });
    expect(
      transaction.operationStageAdoptionRequest.create,
    ).not.toHaveBeenCalled();
  });

  it('returns the original request for an exact client UUID retry', async () => {
    const dto = requestDto();
    const transaction = buildTransaction();
    transaction.operationStageAdoptionRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(savedRequest());
    const { service } = buildService(transaction);

    await expect(
      service.requestAdoption(REQUESTER, dto, NOW),
    ).resolves.toMatchObject({ created: false, noOp: true });
    expect(
      transaction.operationStageAdoptionRequest.create,
    ).not.toHaveBeenCalled();
  });

  it('rejects reuse of a client UUID with a different canonical payload', async () => {
    const dto = requestDto({ targetStage: PoliticalOperationStage.SIMULATION });
    const transaction = buildTransaction();
    transaction.operationStageAdoptionRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(savedRequest());
    const { service } = buildService(transaction);

    await expect(service.requestAdoption(REQUESTER, dto, NOW)).rejects.toThrow(
      'payload diferente',
    );
  });

  it('does not create an adoption when an operation profile already exists', async () => {
    const transaction = buildTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue({
      id: 'profile-existing',
      stage: PoliticalOperationStage.PRE_CAMPAIGN,
    });
    const { service } = buildService(transaction);

    await expect(
      service.requestAdoption(REQUESTER, requestDto(), NOW),
    ).rejects.toThrow('Ya existe un perfil operativo');
    expect(
      transaction.operationStageAdoptionRequest.create,
    ).not.toHaveBeenCalled();
  });

  it('enforces one unexpired pending request per tenant', async () => {
    const transaction = buildTransaction();
    transaction.operationStageAdoptionRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pending-other',
        expiresAt: new Date(NOW.getTime() + 60_000),
      });
    const { service } = buildService(transaction);

    await expect(
      service.requestAdoption(REQUESTER, requestDto(), NOW),
    ).rejects.toThrow('solicitud de adopcion pendiente');
  });

  it('rejects future effective dates and premature post-election adoption', async () => {
    const { service } = buildService();
    const futureEffective = requestDto({
      effectiveAt: '2026-09-10T15:00:00.000Z',
    });
    const prematurePostElection = requestDto({
      targetStage: PoliticalOperationStage.POST_ELECTION,
      electionDate: '2026-09-09',
      votingStartDate: '2026-09-09',
      votingEndDate: '2026-09-09',
    });

    await expect(
      service.requestAdoption(REQUESTER, futureEffective, NOW),
    ).rejects.toThrow('no puede estar en el futuro');
    await expect(
      service.requestAdoption(REQUESTER, prematurePostElection, NOW),
    ).rejects.toThrow('ventana electoral ya termino en Bogota');
  });

  it('expires a pending request durably when its state is read', async () => {
    const transaction = buildTransaction();
    const expiredPending = savedRequest({
      expiresAt: new Date(NOW.getTime() - 1),
    });
    const expired = savedRequest({
      status: OperationStageAdoptionStatus.EXPIRED,
      expiresAt: new Date(NOW.getTime() - 1),
      expiredAt: NOW,
    });
    transaction.operationStageAdoptionRequest.findFirst
      .mockResolvedValueOnce(expiredPending)
      .mockResolvedValueOnce(expired);
    const { service } = buildService(transaction);

    await expect(service.getStatus(REVIEWER, NOW)).resolves.toMatchObject({
      request: { status: OperationStageAdoptionStatus.EXPIRED },
    });
    expect(
      transaction.operationStageAdoptionRequest.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: {
            id: 'adoption-a',
            tenantId: REQUESTER.tenantId,
          },
        },
        data: {
          status: OperationStageAdoptionStatus.EXPIRED,
          expiredAt: NOW,
        },
      }),
    );
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'OPERATION_STAGE_ADOPTION_EXPIRED',
      }),
    });
  });

  it('rejects review by an inactive or unauthorized actor', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst.mockResolvedValue(null);
    const { service } = buildService(transaction);

    await expect(
      service.reviewAdoption(REVIEWER, 'adoption-a', reviewDto(), NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects self-review even when the stored actors are inconsistent', async () => {
    const transaction = buildTransaction();
    transaction.operationStageAdoptionRequest.findFirst.mockImplementation(
      ({ where }: FindFirstArgs) =>
        Promise.resolve(
          where && 'id' in where
            ? savedRequest({ requestedById: REVIEWER.userId })
            : null,
        ),
    );
    const { service } = buildService(transaction);

    await expect(
      service.reviewAdoption(REVIEWER, 'adoption-a', reviewDto(), NOW),
    ).rejects.toThrow('no puede revisar su propia');
  });

  it('rejects a cross-tenant or absent adoption request', async () => {
    const transaction = buildTransaction();
    transaction.operationStageAdoptionRequest.findFirst.mockResolvedValue(null);
    const { service } = buildService(transaction);
    const absentId = 'tenant-b-request';

    await expect(
      service.reviewAdoption(REVIEWER, absentId, reviewDto(absentId), NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      transaction.operationStageAdoptionRequest.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: absentId,
          tenantId: REQUESTER.tenantId,
        },
      }),
    );
  });

  it('rejects incoherent approval and rejection payloads at the service boundary', async () => {
    const { service } = buildService();
    const approvalWithReason = reviewDto('adoption-a', {
      rejectionReason: 'Esta razon no corresponde a una aprobacion valida.',
    });
    await expect(
      service.reviewAdoption(REVIEWER, 'adoption-a', approvalWithReason, NOW),
    ).rejects.toThrow('aprobacion no puede incluir');

    const rejectionWithoutReason = reviewDto('adoption-a', {
      decision: OperationAdoptionDecision.REJECT,
      rejectionReason: undefined,
    });
    await expect(
      service.reviewAdoption(
        REVIEWER,
        'adoption-a',
        rejectionWithoutReason,
        NOW,
      ),
    ).rejects.toThrow('rechazo exige');
  });

  it('rejects a review hash or expected request hash mismatch', async () => {
    const { service } = buildService();
    await expect(
      service.reviewAdoption(
        REVIEWER,
        'adoption-a',
        reviewDto('adoption-a', { reviewPayloadSha256: '0'.repeat(64) }),
        NOW,
      ),
    ).rejects.toThrow('reviewPayloadSha256');

    const wrongExpected = reviewDto('adoption-a', {
      expectedPayloadSha256: '0'.repeat(64),
    });
    await expect(
      service.reviewAdoption(REVIEWER, 'adoption-a', wrongExpected, NOW),
    ).rejects.toThrow('hash revisado');
  });

  it('rejects durably without creating profile or settings', async () => {
    const transaction = buildTransaction();
    const dto = reviewDto('adoption-a', {
      decision: OperationAdoptionDecision.REJECT,
      rejectionReason:
        'La evidencia no demuestra suficientemente la fecha efectiva.',
    });
    transaction.operationStageAdoptionRequest.update.mockResolvedValue(
      savedRequest({
        status: OperationStageAdoptionStatus.REJECTED,
        reviewedById: REVIEWER.userId,
        reviewedAt: NOW,
        reviewClientRequestId: dto.clientReviewId,
        reviewPayloadSha256: dto.reviewPayloadSha256,
        rejectionReason: dto.rejectionReason,
      }),
    );
    const { service } = buildService(transaction);

    await expect(
      service.reviewAdoption(REVIEWER, 'adoption-a', dto, NOW),
    ).resolves.toMatchObject({
      reviewed: true,
      approved: false,
      noOp: false,
      request: { status: OperationStageAdoptionStatus.REJECTED },
    });
    expect(transaction.operationProfile.create).not.toHaveBeenCalled();
    expect(transaction.campaignSettings.upsert).not.toHaveBeenCalled();
    const auditJson = JSON.stringify(
      transaction.auditEvent.create.mock.calls[0]?.[0],
    );
    expect(auditJson).not.toContain(dto.rejectionReason);
    expect(auditJson).not.toContain(savedRequest().justification);
  });

  it.each([
    OperationStageAdoptionStatus.APPROVED,
    OperationStageAdoptionStatus.REJECTED,
  ])('makes an exact retry of a %s review a no-op', async (status) => {
    const rejectionReason =
      status === OperationStageAdoptionStatus.REJECTED
        ? 'La evidencia no permite verificar la adopcion solicitada.'
        : undefined;
    const decision =
      status === OperationStageAdoptionStatus.APPROVED
        ? OperationAdoptionDecision.APPROVE
        : OperationAdoptionDecision.REJECT;
    const dto = reviewDto('adoption-a', { decision, rejectionReason });
    const transaction = buildTransaction();
    transaction.operationStageAdoptionRequest.findFirst.mockImplementation(
      ({ where }: FindFirstArgs) =>
        Promise.resolve(
          where && 'id' in where
            ? savedRequest({
                status,
                reviewedById: REVIEWER.userId,
                reviewedAt: NOW,
                reviewClientRequestId: dto.clientReviewId,
                reviewPayloadSha256: dto.reviewPayloadSha256,
                rejectionReason: rejectionReason ?? null,
                operationProfileId:
                  status === OperationStageAdoptionStatus.APPROVED
                    ? 'profile-adopted'
                    : null,
              })
            : null,
        ),
    );
    const { service } = buildService(transaction);

    await expect(
      service.reviewAdoption(REVIEWER, 'adoption-a', dto, NOW),
    ).resolves.toMatchObject({ reviewed: true, noOp: true });
    expect(
      transaction.operationStageAdoptionRequest.update,
    ).not.toHaveBeenCalled();
    expect(transaction.operationProfile.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('approves atomically, links the request/profile and emits only the explicit adoption stage event', async () => {
    const transaction = buildTransaction();
    const dto = reviewDto();
    transaction.operationStageAdoptionRequest.update.mockResolvedValue(
      savedRequest({
        status: OperationStageAdoptionStatus.APPROVED,
        reviewedById: REVIEWER.userId,
        reviewedAt: NOW,
        reviewClientRequestId: dto.clientReviewId,
        reviewPayloadSha256: dto.reviewPayloadSha256,
        operationProfileId: 'profile-adopted',
      }),
    );
    const { service, transaction: tx } = buildService(transaction);

    await expect(
      service.reviewAdoption(REVIEWER, 'adoption-a', dto, NOW),
    ).resolves.toMatchObject({
      reviewed: true,
      approved: true,
      noOp: false,
      profile: { stage: PoliticalOperationStage.CAMPAIGN },
    });
    expect(
      tx.operationStageAdoptionRequest.update.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.operationProfile.create.mock.invocationCallOrder[0]);
    expect(tx.operationStageAdoptionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OperationStageAdoptionStatus.APPROVED,
          reviewedById: REVIEWER.userId,
          reviewClientRequestId: dto.clientReviewId,
          operationProfileId: expect.any(String),
        }),
      }),
    );
    expect(tx.operationProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: REQUESTER.tenantId,
          stage: PoliticalOperationStage.CAMPAIGN,
          createdById: REQUESTER.userId,
          updatedById: REVIEWER.userId,
        }),
      }),
    );
    const actions = tx.auditEvent.create.mock.calls.map(
      ([call]) => (call as { data: { action: string } }).data.action,
    );
    expect(actions).toContain('OPERATION_STAGE_ADOPTION_APPROVED');
    expect(actions).toContain('OPERATION_STAGE_ADOPTED');
    expect(actions).not.toContain('OPERATION_PROFILE_CREATED');
    expect(actions).not.toContain('OPERATION_PROFILE_UPDATED');
  });

  it('revalidates profile absence and the responsible user on approval', async () => {
    const profileTransaction = buildTransaction();
    profileTransaction.operationProfile.findUnique.mockResolvedValue({
      id: 'profile-concurrent',
      stage: PoliticalOperationStage.PRE_CAMPAIGN,
    });
    const missingResponsibleTransaction = buildTransaction();
    missingResponsibleTransaction.user.findFirst.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'responsible-a'
            ? null
            : { id: REVIEWER.userId, role: Role.AUDITOR },
        ),
    );

    await expect(
      buildService(profileTransaction).service.reviewAdoption(
        REVIEWER,
        'adoption-a',
        reviewDto(),
        NOW,
      ),
    ).rejects.toThrow('no puede sobrescribirlo');
    await expect(
      buildService(missingResponsibleTransaction).service.reviewAdoption(
        REVIEWER,
        'adoption-a',
        reviewDto(),
        NOW,
      ),
    ).rejects.toThrow('responsable de datos');
  });

  it('blocks ELECTION_DAY adoption unless Bogota date and exact active territorial projection are ready', async () => {
    const dayRequest = savedRequest({
      targetStage: PoliticalOperationStage.ELECTION_DAY,
      electionDate: new Date('2026-09-09T00:00:00.000Z'),
      votingStartDate: new Date('2026-09-09T00:00:00.000Z'),
      votingEndDate: new Date('2026-09-09T00:00:00.000Z'),
    });
    const transaction = buildTransaction();
    transaction.operationStageAdoptionRequest.findFirst.mockImplementation(
      ({ where }: FindFirstArgs) =>
        Promise.resolve(where && 'id' in where ? dayRequest : null),
    );
    transaction.politicalDivision.findMany.mockResolvedValue([
      {
        id: 'place-a',
        parentId: null,
        type: 'PUESTO',
        expectedTables: 10,
        sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
        sourceReleaseId: 'release-active',
      },
    ]);
    transaction.witnessAssignment.findMany.mockResolvedValue(
      (['PRIMARY', 'BACKUP'] as const).map((assignmentType) => ({
        coverageWindowId: 'window-a',
        puestoId: 'place-a',
        tableStart: 1,
        tableEnd: 10,
        shiftStartsAt: new Date('2026-09-09T12:00:00.000Z'),
        shiftEndsAt: new Date('2026-09-09T22:00:00.000Z'),
        assignmentType,
        status: 'CONFIRMED',
        witness: { role: Role.WITNESS, isActive: true },
      })),
    );
    transaction.witnessCoverageWindow.findMany.mockResolvedValue([
      {
        id: 'window-a',
        puestoId: 'place-a',
        localDate: new Date('2026-09-09T00:00:00.000Z'),
        startsAt: new Date('2026-09-09T12:00:00.000Z'),
        endsAt: new Date('2026-09-09T22:00:00.000Z'),
        timeZone: 'America/Bogota',
        utcOffsetMinutes: -300,
      },
    ]);
    transaction.electoralCatalogRelease.findMany.mockResolvedValue([]);
    const dto = reviewDto();
    const { service } = buildService(transaction);

    await expect(
      service.reviewAdoption(REVIEWER, 'adoption-a', dto, NOW),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ELECTION_DAY_ADOPTION_READINESS_BLOCKED',
        blockers: expect.arrayContaining([
          'ELECTORAL_CATALOG_PROJECTION_NOT_READY',
        ]),
      }),
    });
    expect(
      transaction.operationStageAdoptionRequest.update,
    ).not.toHaveBeenCalled();
  });

  it('maps serialization conflicts to a fail-closed response', async () => {
    const service = new OperationStageAdoptionService({
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    } as unknown as PrismaService);

    await expect(
      service.requestAdoption(REQUESTER, requestDto(), NOW),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
