import { createHash } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import {
  OperationClosureType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  RetentionDataScope,
  RetentionDispositionStatus,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  CancelRetentionDispositionDto,
  CreateRetentionDispositionDto,
  CreateRetentionLegalHoldDto,
  RevokeRetentionLegalHoldDto,
  ReviewRetentionDispositionDto,
} from './dto/retention-governance.dto';
import { RetentionDispositionDecision } from './dto/retention-governance.dto';
import {
  computeRetentionDispositionCancellationSha256,
  computeRetentionDispositionPayloadSha256,
  computeRetentionDispositionReviewSha256,
  computeRetentionLegalHoldPayloadSha256,
  computeRetentionLegalHoldRevocationSha256,
  RetentionGovernanceService,
} from './retention-governance.service';

const NOW = new Date('2026-09-09T15:00:00.000Z');
const PROFILE = {
  id: 'profile-1',
  tenantId: 'tenant-1',
  stage: PoliticalOperationStage.CLOSED,
  closureType: OperationClosureType.CLOSED_NORMAL,
  electionDate: new Date('2026-05-31T00:00:00.000Z'),
  retentionPeriodDays: 30,
  updatedAt: new Date('2026-07-15T12:00:00.000Z'),
};
const USER: AuthenticatedUser = {
  userId: 'actor-1',
  tenantId: 'tenant-1',
  role: Role.ADMIN,
};
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function profileSnapshotSha256(): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: PROFILE.id,
        tenantId: PROFILE.tenantId,
        stage: PROFILE.stage,
        closureType: PROFILE.closureType,
        electionDate: PROFILE.electionDate.toISOString(),
        retentionPeriodDays: PROFILE.retentionPeriodDays,
        updatedAt: PROFILE.updatedAt.toISOString(),
      }),
      'utf8',
    )
    .digest('hex');
}

function makeDisposition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'disposition-1',
    tenantId: 'tenant-1',
    operationProfileId: PROFILE.id,
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    payloadSha256: HASH_A,
    previewSha256: HASH_B,
    profileSnapshotSha256: profileSnapshotSha256(),
    expectedProfileUpdatedAt: PROFILE.updatedAt,
    status: RetentionDispositionStatus.PENDING,
    scope: RetentionDataScope.DATA_SUBJECT_RECORDS,
    cutoffAt: NOW,
    retentionDueAt: new Date('2026-06-30T00:00:00.000Z'),
    previewSnapshot: {},
    justification: 'J'.repeat(120),
    legalReference: 'Politica juridica interna 2026-01',
    evidenceReference: 'https://evidence.example.test/retention/1',
    evidenceSha256: HASH_B,
    legalPolicyRequiredAcknowledged: true,
    backupRestoreRequiredAcknowledged: true,
    executorUnavailableAcknowledged: true,
    requestedById: 'requester-1',
    reviewedById: null,
    reviewedAt: null,
    reviewClientRequestId: null,
    reviewPayloadSha256: null,
    rejectionReason: null,
    cancelledById: null,
    cancelledAt: null,
    cancellationClientRequestId: null,
    cancellationPayloadSha256: null,
    cancellationReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    requestedBy: { id: 'requester-1', role: Role.ADMIN },
    reviewedBy: null,
    cancelledBy: null,
    ...overrides,
  };
}

function makeLegalHold(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hold-1',
    tenantId: 'tenant-1',
    operationProfileId: PROFILE.id,
    clientRequestId: '22222222-2222-4222-8222-222222222222',
    payloadSha256: HASH_A,
    scope: RetentionDataScope.DATA_SUBJECT_RECORDS,
    reason: 'R'.repeat(80),
    legalAuthority: 'Oficina juridica',
    legalReference: 'Proceso administrativo 2026-01',
    evidenceReference: 'https://evidence.example.test/holds/1',
    evidenceSha256: HASH_B,
    effectiveAt: NOW,
    createdById: 'creator-1',
    createdAt: NOW,
    createdBy: { id: 'creator-1', role: Role.COMPLIANCE_OFFICER },
    revocation: null,
    ...overrides,
  };
}

function makeHarness(actorId = USER.userId, actorRole: Role = Role.ADMIN) {
  const tx = {
    $queryRaw: jest.fn((query: { strings?: string[] }) => {
      const sql = query?.strings?.join('?') ?? '';
      return Promise.resolve(
        sql.includes('FROM "User"') ? [{ id: actorId, role: actorRole }] : [],
      );
    }),
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.CANDIDACY,
      }),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue(PROFILE),
    },
    retentionDispositionRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    retentionLegalHold: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    retentionLegalHoldRevocation: {
      create: jest.fn(),
    },
    voter: { count: jest.fn().mockResolvedValue(3) },
    consentRecord: { count: jest.fn().mockResolvedValue(4) },
    interaction: { count: jest.fn().mockResolvedValue(5) },
    storedObject: { count: jest.fn().mockResolvedValue(6) },
    financialEntry: { count: jest.fn().mockResolvedValue(7) },
    witnessReport: { count: jest.fn().mockResolvedValue(8) },
    auditEvent: {
      count: jest.fn().mockResolvedValue(9),
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  return {
    tx,
    prisma,
    service: new RetentionGovernanceService(prisma as unknown as PrismaService),
  };
}

function dispositionDto(
  overrides: Partial<CreateRetentionDispositionDto> = {},
): CreateRetentionDispositionDto {
  return {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    payloadSha256: HASH_A,
    expectedPreviewSha256: HASH_B,
    expectedProfileUpdatedAt: PROFILE.updatedAt.toISOString(),
    scope: RetentionDataScope.DATA_SUBJECT_RECORDS,
    cutoffAt: NOW.toISOString(),
    justification: 'J'.repeat(120),
    legalReference: 'Politica juridica interna 2026-01',
    evidenceReference: 'https://evidence.example.test/retention/1',
    evidenceSha256: HASH_B,
    legalPolicyRequiredAcknowledged: true,
    backupRestoreRequiredAcknowledged: true,
    executorUnavailableAcknowledged: true,
    ...overrides,
  };
}

describe('RetentionGovernanceService', () => {
  it('returns a tenant-scoped count-only preview and skips unrelated stores', async () => {
    const { service, tx } = makeHarness();

    const result = await service.preview(
      USER,
      RetentionDataScope.DATA_SUBJECT_RECORDS,
      NOW.toISOString(),
      NOW,
    );

    expect(result.canRequest).toBe(true);
    expect(result.counts).toMatchObject({
      voters: 3,
      consentRecords: 4,
      interactions: null,
      total: 7,
    });
    expect(tx.voter.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', createdAt: { lte: NOW } },
    });
    expect(tx.consentRecord.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', createdAt: { lte: NOW } },
    });
    expect(tx.interaction.count).not.toHaveBeenCalled();
    expect(tx.storedObject.count).not.toHaveBeenCalled();
    expect(result.executionCapability).toMatchObject({
      status: 'NOT_IMPLEMENTED',
      canExecute: false,
      destructiveActionsAvailable: false,
    });
  });

  it('blocks ordinary disposition for exceptional closure and active legal holds', async () => {
    const exceptional = makeHarness();
    exceptional.tx.operationProfile.findUnique.mockResolvedValue({
      ...PROFILE,
      closureType: OperationClosureType.CLOSED_EXCEPTIONAL,
    });
    const exceptionalPreview = await exceptional.service.preview(
      USER,
      RetentionDataScope.DATA_SUBJECT_RECORDS,
      NOW.toISOString(),
      NOW,
    );
    expect(exceptionalPreview.governanceBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EXCEPTIONAL_CLOSURE_SURVIVING_DUTIES',
        }),
      ]),
    );

    const held = makeHarness();
    held.tx.retentionLegalHold.findMany.mockResolvedValue([makeLegalHold()]);
    const heldPreview = await held.service.preview(
      USER,
      RetentionDataScope.DATA_SUBJECT_RECORDS,
      NOW.toISOString(),
      NOW,
    );
    expect(heldPreview.canRequest).toBe(false);
    expect(heldPreview.governanceBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ACTIVE_LEGAL_HOLD' }),
      ]),
    );
  });

  it('creates an idempotent pending request from the exact current preview', async () => {
    const { service, tx } = makeHarness();
    const preview = await service.preview(
      USER,
      RetentionDataScope.DATA_SUBJECT_RECORDS,
      NOW.toISOString(),
      NOW,
    );
    const dto = dispositionDto({
      expectedPreviewSha256: preview.previewSha256,
    });
    dto.payloadSha256 = computeRetentionDispositionPayloadSha256(dto);
    tx.retentionDispositionRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    tx.retentionDispositionRequest.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          makeDisposition({
            ...data,
            requestedBy: { id: USER.userId, role: Role.ADMIN },
          }),
        ),
    );

    const result = await service.requestDisposition(USER, dto, NOW);

    expect(result).toMatchObject({ created: true, noOp: false });
    expect(result.request.status).toBe(RetentionDispositionStatus.PENDING);
    expect(tx.retentionDispositionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          requestedById: USER.userId,
          previewSha256: preview.previewSha256,
          status: RetentionDispositionStatus.PENDING,
        }),
      }),
    );
    const auditAfter = tx.auditEvent.create.mock.calls.at(-1)?.[0].data.after;
    expect(JSON.stringify(auditAfter)).not.toContain(dto.justification);
    expect(JSON.stringify(auditAfter)).not.toContain(dto.legalReference);
    expect(JSON.stringify(auditAfter)).not.toContain(dto.evidenceReference);
  });

  it('enforces four eyes and stores approval only as not executed', async () => {
    const requesterId = 'requester-1';
    const request = makeDisposition({ requestedById: requesterId });
    const self = makeHarness(requesterId, Role.ADMIN);
    self.tx.retentionDispositionRequest.findFirst.mockResolvedValue(request);
    const selfDto: ReviewRetentionDispositionDto = {
      clientReviewId: '33333333-3333-4333-8333-333333333333',
      expectedPayloadSha256: request.payloadSha256,
      decision: RetentionDispositionDecision.APPROVE,
      approvedNotExecutedAcknowledged: true,
      reviewPayloadSha256: HASH_A,
    };
    selfDto.reviewPayloadSha256 = computeRetentionDispositionReviewSha256(
      request.id,
      selfDto,
    );
    await expect(
      self.service.reviewDisposition(
        { ...USER, userId: requesterId },
        request.id,
        selfDto,
        NOW,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const reviewer = makeHarness('reviewer-1', Role.AUDITOR);
    reviewer.tx.retentionDispositionRequest.findFirst.mockResolvedValue(
      request,
    );
    reviewer.tx.retentionDispositionRequest.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          makeDisposition({
            ...request,
            ...data,
            reviewedBy: { id: 'reviewer-1', role: Role.AUDITOR },
          }),
        ),
    );
    const dto = { ...selfDto };
    dto.clientReviewId = '44444444-4444-4444-8444-444444444444';
    dto.reviewPayloadSha256 = computeRetentionDispositionReviewSha256(
      request.id,
      dto,
    );

    const approved = await reviewer.service.reviewDisposition(
      { ...USER, userId: 'reviewer-1', role: Role.AUDITOR },
      request.id,
      dto,
      NOW,
    );

    expect(approved.request.status).toBe(
      RetentionDispositionStatus.APPROVED_NOT_EXECUTED,
    );
    expect(approved.executionCapability).toMatchObject({
      canExecute: false,
      destructiveActionsAvailable: false,
    });
  });

  it('rechecks a new legal hold before approval', async () => {
    const harness = makeHarness('reviewer-1', Role.COMPLIANCE_OFFICER);
    const request = makeDisposition();
    harness.tx.retentionDispositionRequest.findFirst.mockResolvedValue(request);
    harness.tx.retentionLegalHold.findMany.mockResolvedValue([makeLegalHold()]);
    const dto: ReviewRetentionDispositionDto = {
      clientReviewId: '55555555-5555-4555-8555-555555555555',
      expectedPayloadSha256: request.payloadSha256,
      decision: RetentionDispositionDecision.APPROVE,
      approvedNotExecutedAcknowledged: true,
      reviewPayloadSha256: HASH_A,
    };
    dto.reviewPayloadSha256 = computeRetentionDispositionReviewSha256(
      request.id,
      dto,
    );

    await expect(
      harness.service.reviewDisposition(
        { ...USER, userId: 'reviewer-1' },
        request.id,
        dto,
        NOW,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'RETENTION_DISPOSITION_BLOCKED',
      }),
    });
    expect(
      harness.tx.retentionDispositionRequest.update,
    ).not.toHaveBeenCalled();
  });

  it('allows only the requester to cancel a pending disposition idempotently', async () => {
    const request = makeDisposition({ requestedById: USER.userId });
    const { service, tx } = makeHarness();
    tx.retentionDispositionRequest.findFirst.mockResolvedValue(request);
    tx.retentionDispositionRequest.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          makeDisposition({
            ...request,
            ...data,
            cancelledBy: { id: USER.userId, role: Role.ADMIN },
          }),
        ),
    );
    const dto: CancelRetentionDispositionDto = {
      clientCancellationId: '66666666-6666-4666-8666-666666666666',
      expectedPayloadSha256: request.payloadSha256,
      cancellationPayloadSha256: HASH_A,
      reason: 'La referencia juridica debe corregirse antes de continuar.',
    };
    dto.cancellationPayloadSha256 =
      computeRetentionDispositionCancellationSha256(request.id, dto);

    const result = await service.cancelDisposition(USER, request.id, dto, NOW);

    expect(result.request.status).toBe(RetentionDispositionStatus.CANCELLED);
    expect(result.cancelled).toBe(true);
  });

  it('creates a legal hold immediately and revokes it only with a different actor', async () => {
    const creator = makeHarness('creator-1', Role.COMPLIANCE_OFFICER);
    const createDto: CreateRetentionLegalHoldDto = {
      clientRequestId: '77777777-7777-4777-8777-777777777777',
      payloadSha256: HASH_A,
      scope: RetentionDataScope.ALL_TENANT_RECORDS,
      reason:
        'Existe una actuacion administrativa abierta que exige conservar integralmente el expediente.',
      legalAuthority: 'Oficina juridica',
      legalReference: 'Actuacion administrativa 2026-77',
      evidenceReference: 'https://evidence.example.test/holds/77',
      evidenceSha256: HASH_B,
      effectiveAt: NOW.toISOString(),
    };
    createDto.payloadSha256 = computeRetentionLegalHoldPayloadSha256(createDto);
    creator.tx.retentionLegalHold.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          makeLegalHold({
            ...data,
            createdBy: { id: 'creator-1', role: Role.COMPLIANCE_OFFICER },
          }),
        ),
    );

    const created = await creator.service.createLegalHold(
      { ...USER, userId: 'creator-1', role: Role.COMPLIANCE_OFFICER },
      createDto,
      NOW,
    );
    expect(created.legalHold.active).toBe(true);

    const hold = created.legalHold;
    const revoker = makeHarness('auditor-1', Role.AUDITOR);
    const revokeDto: RevokeRetentionLegalHoldDto = {
      clientRequestId: '88888888-8888-4888-8888-888888888888',
      expectedHoldPayloadSha256: hold.payloadSha256,
      payloadSha256: HASH_A,
      reason:
        'La autoridad competente certifico el cierre definitivo y autorizo levantar la conservacion.',
      legalAuthority: 'Oficina juridica',
      legalReference: 'Acta de cierre administrativo 2026-88',
      evidenceReference: 'https://evidence.example.test/holds/88',
      evidenceSha256: HASH_A,
    };
    revokeDto.payloadSha256 = computeRetentionLegalHoldRevocationSha256(
      hold.id,
      revokeDto,
    );
    const storedHold = makeLegalHold({
      ...hold,
      effectiveAt: new Date(hold.effectiveAt),
      createdAt: new Date(hold.createdAt),
    });
    const revokedHold = makeLegalHold({
      ...storedHold,
      revocation: {
        id: 'revocation-1',
        clientRequestId: revokeDto.clientRequestId,
        payloadSha256: revokeDto.payloadSha256,
        reason: revokeDto.reason,
        legalAuthority: revokeDto.legalAuthority,
        legalReference: revokeDto.legalReference,
        evidenceReference: revokeDto.evidenceReference,
        evidenceSha256: revokeDto.evidenceSha256,
        revokedById: 'auditor-1',
        revokedAt: NOW,
        revokedBy: { id: 'auditor-1', role: Role.AUDITOR },
      },
    });
    revoker.tx.retentionLegalHold.findFirst
      .mockResolvedValueOnce(storedHold)
      .mockResolvedValueOnce(revokedHold);
    revoker.tx.retentionLegalHoldRevocation.create.mockResolvedValue({
      id: 'revocation-1',
    });

    const revoked = await revoker.service.revokeLegalHold(
      { ...USER, userId: 'auditor-1', role: Role.AUDITOR },
      hold.id,
      revokeDto,
      NOW,
    );
    expect(revoked.legalHold.active).toBe(false);
    expect(revoker.tx.retentionLegalHoldRevocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant-1' }),
      }),
    );
  });
});
