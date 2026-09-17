import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CommunicationApprovalStatus,
  EntryType,
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
  TenantType,
  TransitionHandoverPackageKind,
  TransitionHandoverReportStatus,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { PrismaService } from '../prisma/prisma.service';
import {
  computeTransitionHandoverSha256,
  TransitionHandoverService,
} from './transition-handover.service';

const USER: AuthenticatedUser = {
  tenantId: 'tenant-a',
  userId: 'auditor-a',
  role: Role.AUDITOR,
};

function createHarness(
  stage: PoliticalOperationStage = PoliticalOperationStage.POST_ELECTION,
) {
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        name: 'Campana local',
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: USER.userId,
        role: Role.AUDITOR,
      }),
      groupBy: jest.fn().mockResolvedValue([
        { role: Role.ADMIN, _count: { _all: 1 } },
        { role: Role.AUDITOR, _count: { _all: 1 } },
      ]),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'profile-a',
        stage,
        electionType: 'MAYORALTY',
        electionDate: new Date('2026-08-30T05:00:00.000Z'),
        circumscriptionType: 'MUNICIPAL',
        circumscriptionName: 'Municipio de prueba',
        retentionPeriodDays: 730,
        closureType: null,
        terminatedAt: null,
        terminationCause: null,
        terminationRequest: null,
      }),
    },
    campaignSettings: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'settings-a',
        maxTotalBudget: new Prisma.Decimal('1000000'),
        maxPublicityLimit: new Prisma.Decimal('100000'),
        electionName: 'Eleccion de prueba',
        electionDate: new Date('2026-08-30T05:00:00.000Z'),
        reportDeadline: new Date('2026-10-01T05:00:00.000Z'),
        reportScope: 'CANDIDATE',
        officialLimitsReference: 'Resolucion verificable',
        officialLimitsUrl: 'https://example.test/topes',
        financialManagerName: 'Gerente de campana',
        financialManagerDocument: '111111111',
        accountantName: 'Contador de campana',
        accountantDocument: '222222222',
        uniqueAccountBank: 'Banco de prueba',
        uniqueAccountLastFour: '1234',
        cuentasClarasCode: 'CODIGO-CONFIGURADO',
        createdAt: new Date('2026-08-01T05:00:00.000Z'),
        updatedAt: new Date('2026-08-01T05:00:00.000Z'),
      }),
    },
    financialEntry: {
      count: jest
        .fn()
        .mockImplementation(({ where }: { where: { status: FinanceStatus } }) =>
          Promise.resolve(where.status === FinanceStatus.APPROVED ? 2 : 0),
        ),
      groupBy: jest.fn().mockResolvedValue([
        {
          type: EntryType.INCOME,
          status: FinanceStatus.REPORTED_CNE,
          _sum: { amount: new Prisma.Decimal('100000') },
          _count: { _all: 1 },
        },
        {
          type: EntryType.EXPENSE,
          status: FinanceStatus.APPROVED,
          _sum: { amount: new Prisma.Decimal('25000') },
          _count: { _all: 2 },
        },
      ]),
    },
    financeReportDossier: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'dossier-a',
          versions: [
            {
              approvals: [
                {
                  control: 'CAMPAIGN_MANAGER',
                  decision: 'APPROVE',
                  actorUserId: 'manager-a',
                },
                {
                  control: 'ACCOUNTANT',
                  decision: 'APPROVE',
                  actorUserId: 'accountant-a',
                },
                {
                  control: 'COMPLIANCE',
                  decision: 'APPROVE',
                  actorUserId: 'compliance-a',
                },
              ],
              externalEvidence: { review: { decision: 'APPROVE' } },
            },
          ],
        },
      ]),
    },
    financeBankStatement: { count: jest.fn().mockResolvedValue(1) },
    financeBankStatementLine: { count: jest.fn().mockResolvedValue(0) },
    financePayable: { findMany: jest.fn().mockResolvedValue([]) },
    task: {
      groupBy: jest
        .fn()
        .mockResolvedValue([{ status: TaskStatus.TODO, _count: { _all: 3 } }]),
    },
    issueCase: {
      groupBy: jest
        .fn()
        .mockResolvedValue([
          { status: IssueCaseStatus.IN_PROGRESS, _count: { _all: 1 } },
        ]),
    },
    communicationApproval: {
      groupBy: jest.fn().mockResolvedValue([
        {
          status: CommunicationApprovalStatus.PENDING,
          _count: { _all: 1 },
        },
      ]),
    },
    witnessReport: {
      groupBy: jest.fn().mockResolvedValue([
        { status: WitnessReportStatus.PENDING, _count: { _all: 1 } },
        { status: WitnessReportStatus.REJECTED, _count: { _all: 2 } },
      ]),
    },
    storedObject: {
      groupBy: jest.fn().mockResolvedValue([
        { status: StoredObjectStatus.CONFIRMED, _count: { _all: 1 } },
        { status: StoredObjectStatus.CONSUMED, _count: { _all: 4 } },
      ]),
    },
    consentNotice: { count: jest.fn().mockResolvedValue(1) },
    transitionHandoverReport: {
      create: jest.fn().mockImplementation(
        ({
          data,
        }: {
          data: {
            id: string;
            generatedAt: Date;
            status: TransitionHandoverReportStatus;
            packageKind: TransitionHandoverPackageKind;
            payload: Prisma.JsonValue;
            sha256: string;
          };
        }) =>
          Promise.resolve({
            id: data.id,
            generatedAt: data.generatedAt,
            status: data.status,
            packageKind: data.packageKind,
            payload: data.payload,
            sha256: data.sha256,
          }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  return {
    transaction,
    prisma,
    service: new TransitionHandoverService(prisma as unknown as PrismaService),
  };
}

describe('TransitionHandoverService', () => {
  it('creates a tenant-scoped, integrity-stamped closeout draft without voter or identity data', async () => {
    const { service, transaction } = createHarness();

    const result = await service.generateHandoverReport(USER);

    expect(result).toMatchObject({
      packageKind: 'INTERNAL_CAMPAIGN_CLOSEOUT_DRAFT',
      status: 'BLOCKED',
      organization: { name: 'Campana local', type: TenantType.CANDIDACY },
      lifecycle: { stage: PoliticalOperationStage.POST_ELECTION },
      finance: {
        entries: 3,
        pendingReview: 0,
        approvedNotReported: 2,
        reported: 1,
        income: 100000,
        expenses: 25000,
        balance: 75000,
        closeoutReady: false,
        closeoutBlockerCodes: ['UNREPORTED_FINANCIAL_ENTRIES'],
      },
      operation: {
        openTasks: 3,
        openCases: 1,
        pendingCommunications: 1,
        e14PendingReview: 1,
        e14Rejected: 2,
      },
      transitionPolicy: {
        automaticTransferAllowed: false,
        campaignDataReusedAutomatically: false,
        requiredDestinationType: 'PUBLIC_OFFICE',
      },
      integrity: { algorithm: 'SHA-256' },
    });

    const { integrity, ...body } = result;
    expect(integrity.sha256).toBe(computeTransitionHandoverSha256(body));
    expect(result.reportId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('tenant-a');
    expect(serialized).not.toContain('auditor-a');
    expect(serialized).not.toContain('profile-a');
    expect(serialized).not.toContain('voter');
    expect(serialized).not.toContain('documentId');

    for (const repository of [
      transaction.financialEntry,
      transaction.task,
      transaction.issueCase,
      transaction.communicationApproval,
      transaction.witnessReport,
      transaction.storedObject,
      transaction.user,
    ]) {
      const calls = repository.groupBy.mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: USER.tenantId }),
        }),
      );
    }
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: USER.tenantId,
        actorUserId: USER.userId,
        action: 'POST_ELECTION_HANDOVER_REPORT_GENERATED',
        resourceType: 'TransitionHandoverReport',
        resourceId: result.reportId,
        metadata: expect.objectContaining({ sha256: integrity.sha256 }),
      }),
    });
    expect(transaction.transitionHandoverReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: result.reportId,
        tenantId: USER.tenantId,
        operationProfileId: 'profile-a',
        generatedById: USER.userId,
        payload: result,
        sha256: result.integrity.sha256,
      }),
      select: expect.objectContaining({ payload: true, sha256: true }),
    });
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.tenant.findUnique.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('uses the same dossier readiness for the handover finance blocker', async () => {
    const { service, transaction } = createHarness();
    transaction.financeReportDossier.findMany.mockResolvedValue([]);
    transaction.financialEntry.count.mockResolvedValue(0);

    const result = await service.generateHandoverReport(USER);

    expect(result.finance).toMatchObject({
      closeoutReady: false,
      closeoutBlockerCodes: ['NO_REPORT_DOSSIER'],
    });
    expect(result.actions).toContainEqual(
      expect.objectContaining({
        code: 'FINANCE_NOT_CLOSED',
        severity: 'BLOCK',
        detail: expect.stringContaining('NO_REPORT_DOSSIER'),
      }),
    );
    expect(transaction.financeReportDossier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: USER.tenantId, operationProfileId: 'profile-a' },
      }),
    );
  });

  it('does not aggregate or audit before the post-election stage', async () => {
    const { service, transaction } = createHarness(
      PoliticalOperationStage.ELECTION_DAY,
    );

    await expect(service.generateHandoverReport(USER)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.financialEntry.groupBy).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('distinguishes exceptional closure and never presents it as compliance or filing', async () => {
    const { service, transaction } = createHarness(
      PoliticalOperationStage.CLOSED,
    );
    transaction.operationProfile.findUnique.mockResolvedValueOnce({
      id: 'profile-a',
      stage: PoliticalOperationStage.CLOSED,
      electionType: 'MAYORALTY',
      electionDate: new Date('2026-10-25T05:00:00.000Z'),
      circumscriptionType: 'MUNICIPAL',
      circumscriptionName: 'Municipio de prueba',
      retentionPeriodDays: 730,
      closureType: OperationClosureType.CLOSED_EXCEPTIONAL,
      terminatedAt: new Date('2026-09-09T12:00:00.000Z'),
      terminationCause: OperationTerminationCause.REGISTRATION_REVOKED,
      terminationRequest: {
        id: 'termination-a',
        status: OperationTerminationStatus.APPROVED,
        effectiveAt: new Date('2026-09-09T12:00:00.000Z'),
        reviewedAt: new Date('2026-09-09T15:00:00.000Z'),
        reviewedBy: {
          id: 'reviewer-a',
          name: 'Revision independiente',
          role: Role.AUDITOR,
        },
      },
    });

    const result = await service.generateHandoverReport(USER);

    expect(result).toMatchObject({
      packageKind: 'EXCEPTIONAL_TERMINATION_DUTIES_DOSSIER',
      lifecycle: {
        closureType: OperationClosureType.CLOSED_EXCEPTIONAL,
        terminationCause: OperationTerminationCause.REGISTRATION_REVOKED,
        complianceCertified: false,
        authorityFilingCertified: false,
      },
      termination: {
        requestId: 'termination-a',
        status: OperationTerminationStatus.APPROVED,
        reviewer: { role: Role.AUDITOR },
      },
    });
    expect(result.actions[0]?.code).toBe(
      'EXCEPTIONAL_TERMINATION_SURVIVING_DUTIES',
    );
    expect(result.disclaimer).toMatch(/No acredita radicacion/);
  });

  it('revalidates the actor in the tenant instead of trusting the JWT role', async () => {
    const { service, transaction } = createHarness();
    transaction.user.findFirst.mockResolvedValueOnce(null);

    await expect(service.generateHandoverReport(USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: USER.userId,
        tenantId: USER.tenantId,
        isActive: true,
        role: { in: [...HANDOVER_ROLES_FOR_TEST] },
      },
      select: { id: true, role: true },
    });
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects public-office tenants even when the token carries an allowed role', async () => {
    const { service, transaction } = createHarness();
    transaction.tenant.findUnique.mockResolvedValueOnce({
      name: 'Despacho',
      type: TenantType.PUBLIC_OFFICE,
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await expect(service.generateHandoverReport(USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('lists only minimized metadata scoped to the JWT tenant', async () => {
    const { service, transaction } = createHarness();
    const generatedAt = new Date('2026-09-10T13:00:00.000Z');
    transaction.transitionHandoverReport.findMany.mockResolvedValueOnce([
      {
        id: '0199308f-b156-7ad2-a55f-6446bd659c21',
        operationProfileId: 'profile-a',
        generatedAt,
        status: TransitionHandoverReportStatus.BLOCKED,
        packageKind:
          TransitionHandoverPackageKind.INTERNAL_CAMPAIGN_CLOSEOUT_DRAFT,
        sha256: 'a'.repeat(64),
        generatedBy: {
          id: USER.userId,
          name: 'Auditora principal',
          role: Role.AUDITOR,
        },
      },
    ]);
    transaction.transitionHandoverReport.count.mockResolvedValueOnce(1);

    const result = await service.listHandoverReports(USER, 2, 10);

    expect(transaction.transitionHandoverReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: USER.tenantId },
        skip: 10,
        take: 10,
        select: expect.not.objectContaining({ payload: true }),
      }),
    );
    expect(transaction.transitionHandoverReport.count).toHaveBeenCalledWith({
      where: { tenantId: USER.tenantId },
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          reportId: '0199308f-b156-7ad2-a55f-6446bd659c21',
          generatedAt: generatedAt.toISOString(),
          sha256: 'a'.repeat(64),
        }),
      ],
      pagination: { page: 2, limit: 10, total: 1, totalPages: 1 },
    });
    expect(JSON.stringify(result)).not.toContain('payload');
  });

  it('recovers the stored payload by ID without regenerating it', async () => {
    const { service, transaction } = createHarness();
    const generated = await service.generateHandoverReport(USER);
    transaction.transitionHandoverReport.findFirst.mockResolvedValueOnce({
      id: generated.reportId,
      generatedAt: new Date(generated.generatedAt),
      status: generated.status,
      packageKind: generated.packageKind,
      payload: generated,
      sha256: generated.integrity.sha256,
    });
    transaction.transitionHandoverReport.create.mockClear();

    await expect(
      service.getHandoverReport(USER, generated.reportId),
    ).resolves.toEqual(generated);
    expect(transaction.transitionHandoverReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: generated.reportId, tenantId: USER.tenantId },
      }),
    );
    expect(transaction.transitionHandoverReport.create).not.toHaveBeenCalled();
  });

  it('returns tenant-blind not found for an ID outside the JWT tenant', async () => {
    const { service, transaction } = createHarness();
    const reportId = '0199308f-b156-7ad2-a55f-6446bd659c21';

    await expect(
      service.getHandoverReport(USER, reportId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.transitionHandoverReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reportId, tenantId: USER.tenantId },
      }),
    );
  });

  it('refuses to return a stored payload whose immutable hash no longer matches', async () => {
    const { service, transaction } = createHarness();
    const generated = await service.generateHandoverReport(USER);
    transaction.transitionHandoverReport.findFirst.mockResolvedValueOnce({
      id: generated.reportId,
      generatedAt: new Date(generated.generatedAt),
      status: generated.status,
      packageKind: generated.packageKind,
      payload: { ...generated, disclaimer: 'contenido alterado' },
      sha256: generated.integrity.sha256,
    });

    await expect(
      service.getHandoverReport(USER, generated.reportId),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

const HANDOVER_ROLES_FOR_TEST = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;
