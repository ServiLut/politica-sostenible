import { ForbiddenException } from '@nestjs/common';
import {
  CommunicationApprovalStatus,
  DivisionType,
  ElectoralCodeNamespace,
  FinanceReportScope,
  FinanceStatus,
  IssueCaseStatus,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  TaskStatus,
  TenantType,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { OperationReadinessResponseDto } from './dto/operation-readiness.dto';
import type { OperationReadinessCheckDto } from './dto/operation-readiness.dto';
import { OPERATION_PROFILE_READ_ROLES } from './operation-readiness';
import { OperationProfileService } from './operation-profile.service';

const jwtUser: AuthenticatedUser = {
  userId: 'actor-from-jwt',
  tenantId: 'tenant-from-jwt',
  role: Role.ADMIN,
};

const fixedNow = new Date('2026-09-09T15:00:00.000Z');

function completeFinanceSettings() {
  return {
    id: 'finance-settings-private-id',
    maxTotalBudget: new Prisma.Decimal('987654321.12'),
    maxPublicityLimit: new Prisma.Decimal('123456789.12'),
    electionName: 'Eleccion privada de prueba',
    electionDate: new Date('2027-10-31T00:00:00.000Z'),
    reportScope: FinanceReportScope.CANDIDATE,
    officialLimitsReference: 'Referencia reservada 99',
    officialLimitsUrl: 'https://example.test/limits',
    reportDeadline: new Date('2027-11-30T00:00:00.000Z'),
    financialManagerName: 'Nombre Financiero Secreto',
    financialManagerDocument: '1020304050',
    accountantName: 'Nombre Contable Secreto',
    accountantDocument: '9080706050',
    uniqueAccountBank: 'Banco privado',
    uniqueAccountLastFour: '9911',
    cuentasClarasCode: 'CC-PRIVATE-42',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

function buildReadinessTransaction() {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        type: TenantType.CANDIDACY,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'current-db-actor-id',
        role: Role.WITNESS,
      }),
      count: jest.fn().mockResolvedValue(5),
    },
    operationProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'profile-from-tenant',
        stage: PoliticalOperationStage.PRE_CAMPAIGN,
        electionDate: new Date('2027-10-31T00:00:00.000Z'),
        votingStartDate: new Date('2027-10-31T00:00:00.000Z'),
        votingEndDate: new Date('2027-10-31T00:00:00.000Z'),
        votingWindowSourceUrl: null,
        votingWindowReference: null,
        closureType: null,
        terminatedAt: null,
        terminationCause: null,
      }),
    },
    consentNotice: { count: jest.fn().mockResolvedValue(1) },
    campaignSettings: {
      findUnique: jest.fn().mockResolvedValue(completeFinanceSettings()),
    },
    politicalDivision: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'department-a',
          parentId: null,
          type: DivisionType.DEPARTAMENTO,
          expectedTables: null,
          sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
          sourceReleaseId: 'release-active',
        },
        {
          id: 'municipality-a',
          parentId: 'department-a',
          type: DivisionType.MUNICIPIO,
          expectedTables: null,
          sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
          sourceReleaseId: 'release-active',
        },
        {
          id: 'zone-a',
          parentId: 'municipality-a',
          type: DivisionType.ZONA,
          expectedTables: null,
          sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
          sourceReleaseId: 'release-active',
        },
        {
          id: 'place-a',
          parentId: 'zone-a',
          type: DivisionType.PUESTO,
          expectedTables: 12,
          sourceNamespace: ElectoralCodeNamespace.RNEC_DIVIPOLE,
          sourceReleaseId: 'release-active',
        },
      ]),
    },
    electoralCatalogRelease: {
      findMany: jest.fn().mockResolvedValue([{ id: 'release-active' }]),
    },
    witnessCoverageWindow: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'window-a',
          puestoId: 'place-a',
          localDate: new Date('2027-10-31T00:00:00.000Z'),
          startsAt: new Date('2027-10-31T12:00:00.000Z'),
          endsAt: new Date('2027-10-31T22:00:00.000Z'),
          timeZone: 'America/Bogota',
          utcOffsetMinutes: -300,
        },
      ]),
    },
    witnessAssignment: {
      findMany: jest.fn().mockResolvedValue(
        (['PRIMARY', 'BACKUP'] as const).map((assignmentType) => ({
          coverageWindowId: 'window-a',
          puestoId: 'place-a',
          tableStart: 1,
          tableEnd: 12,
          shiftStartsAt: new Date('2027-10-31T12:00:00.000Z'),
          shiftEndsAt: new Date('2027-10-31T22:00:00.000Z'),
          assignmentType,
          status: 'CONFIRMED',
          witness: { role: Role.WITNESS, isActive: true },
        })),
      ),
    },
    witnessReport: {
      groupBy: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
    },
    voter: { count: jest.fn().mockResolvedValue(731) },
    issueCase: { groupBy: jest.fn().mockResolvedValue([]) },
    task: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    communicationApproval: { groupBy: jest.fn().mockResolvedValue([]) },
    financialEntry: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
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
    auditEvent: {
      groupBy: jest
        .fn()
        .mockResolvedValue([
          { action: 'OPERATION_PROFILE_CREATED', _count: { _all: 1 } },
        ]),
      create: jest.fn(),
    },
  };
}

function buildService(transaction = buildReadinessTransaction()) {
  const runTransaction = jest.fn(
    async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  return {
    transaction,
    runTransaction,
    service: new OperationProfileService({
      $transaction: runTransaction,
    } as never),
  };
}

function readinessCheck(
  result: OperationReadinessResponseDto,
  code: string,
): OperationReadinessCheckDto {
  const checks: OperationReadinessCheckDto[] = [
    ...result.sections.BEFORE_CAMPAIGN,
    ...result.sections.CAMPAIGN,
    ...result.sections.ELECTION_DAY,
    ...result.sections.POST_ELECTION,
  ];
  const selected = checks.find((item) => item.code === code);
  if (!selected) throw new Error(`No existe el check ${code}`);
  return selected;
}

describe('OperationProfileService.getReadiness', () => {
  it('queries every source tenant-scoped in one repeatable-read snapshot', async () => {
    const { transaction, runTransaction, service } = buildService();

    await service.getReadiness(jwtUser, fixedNow);

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(transaction.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: jwtUser.tenantId } }),
    );
    const tenantScopedCalls = [
      transaction.user.findFirst.mock.calls[0][0],
      transaction.operationProfile.findUnique.mock.calls[0][0],
      transaction.consentNotice.count.mock.calls[0][0],
      transaction.campaignSettings.findUnique.mock.calls[0][0],
      transaction.user.count.mock.calls[0][0],
      transaction.politicalDivision.findMany.mock.calls[0][0],
      transaction.electoralCatalogRelease.findMany.mock.calls[0][0],
      transaction.witnessAssignment.findMany.mock.calls[0][0],
      transaction.witnessReport.groupBy.mock.calls[0][0],
      transaction.witnessReport.groupBy.mock.calls[1][0],
      transaction.voter.count.mock.calls[0][0],
      transaction.issueCase.groupBy.mock.calls[0][0],
      transaction.task.groupBy.mock.calls[0][0],
      transaction.task.count.mock.calls[0][0],
      transaction.communicationApproval.groupBy.mock.calls[0][0],
      transaction.financialEntry.groupBy.mock.calls[0][0],
      transaction.auditEvent.groupBy.mock.calls[0][0],
    ] as Array<{ where: Record<string, unknown> }>;
    for (const call of tenantScopedCalls) {
      expect(call.where).toEqual(
        expect.objectContaining({ tenantId: jwtUser.tenantId }),
      );
    }
    expect(transaction.politicalDivision.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.witnessAssignment.findMany).toHaveBeenCalledTimes(1);
  });

  it('uses the current database role rather than the stale JWT role', async () => {
    const { transaction, service } = buildService();

    await expect(
      service.getReadiness(jwtUser, fixedNow),
    ).resolves.toMatchObject({
      stage: PoliticalOperationStage.PRE_CAMPAIGN,
    });
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: jwtUser.userId,
        tenantId: jwtUser.tenantId,
        isActive: true,
        role: { in: [...OPERATION_PROFILE_READ_ROLES] },
      },
      select: { id: true, role: true },
    });
  });

  it('rejects a deleted, deactivated, foreign-tenant, or no-longer-readable actor', async () => {
    const transaction = buildReadinessTransaction();
    transaction.user.findFirst.mockResolvedValue(null);
    const { service } = buildService(transaction);

    await expect(
      service.getReadiness(jwtUser, fixedNow),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.operationProfile.findUnique).not.toHaveBeenCalled();
    expect(transaction.electoralCatalogRelease.findMany).not.toHaveBeenCalled();
    expect(transaction.witnessReport.groupBy).not.toHaveBeenCalled();
    expect(transaction.voter.count).not.toHaveBeenCalled();
  });

  it('returns no PII, voter counts, actor identifiers, or monetary amounts and writes no audit payload', async () => {
    const { transaction, service } = buildService();

    const result = await service.getReadiness(jwtUser, fixedNow);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('voterCount');
    expect(serialized).not.toContain('731');
    expect(serialized).not.toContain('current-db-actor-id');
    expect(serialized).not.toContain('actor-from-jwt');
    expect(serialized).not.toContain('tenant-from-jwt');
    expect(serialized).not.toContain('Nombre Financiero Secreto');
    expect(serialized).not.toContain('Nombre Contable Secreto');
    expect(serialized).not.toContain('1020304050');
    expect(serialized).not.toContain('9080706050');
    expect(serialized).not.toContain('987654321.12');
    expect(serialized).not.toContain('123456789.12');
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['action'],
        _count: { _all: true },
      }),
    );
  });

  it('returns an honest lifecycle warning and null stage/date when activity predates a profile', async () => {
    const transaction = buildReadinessTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue(null);
    transaction.auditEvent.groupBy.mockResolvedValue([]);
    const { service } = buildService(transaction);

    const result = await service.getReadiness(jwtUser, fixedNow);

    expect(result).toMatchObject({
      stage: null,
      electionDate: null,
      overall: 'BLOCKED',
    });
    expect(
      readinessCheck(result, 'LIFECYCLE_HISTORY_NOT_ESTABLISHED'),
    ).toMatchObject({ status: 'WARN' });
  });

  it('maps status aggregates and E-14 fingerprints without querying record PII', async () => {
    const transaction = buildReadinessTransaction();
    transaction.witnessReport.groupBy
      .mockReset()
      .mockResolvedValueOnce([
        { status: WitnessReportStatus.PENDING, _count: { _all: 2 } },
        { status: WitnessReportStatus.REJECTED, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        {
          puestoId: 'place-a',
          mesa: 1,
          candidateVotes: 10,
          blankVotes: 1,
          nullVotes: 0,
          unmarkedVotes: 0,
          totalTableVotes: 11,
          status: WitnessReportStatus.PENDING,
        },
        {
          puestoId: 'place-a',
          mesa: 1,
          candidateVotes: 9,
          blankVotes: 1,
          nullVotes: 0,
          unmarkedVotes: 0,
          totalTableVotes: 10,
          status: WitnessReportStatus.ACCEPTED,
        },
      ]);
    transaction.issueCase.groupBy.mockResolvedValue([
      { status: IssueCaseStatus.OPEN, _count: { _all: 3 } },
      { status: IssueCaseStatus.CLOSED, _count: { _all: 20 } },
    ]);
    transaction.task.groupBy.mockResolvedValue([
      { status: TaskStatus.TODO, _count: { _all: 4 } },
      { status: TaskStatus.DONE, _count: { _all: 30 } },
    ]);
    transaction.task.count.mockResolvedValue(1);
    transaction.communicationApproval.groupBy.mockResolvedValue([
      {
        status: CommunicationApprovalStatus.PENDING,
        _count: { _all: 5 },
      },
      {
        status: CommunicationApprovalStatus.PUBLISHED,
        _count: { _all: 40 },
      },
    ]);
    transaction.financialEntry.groupBy.mockResolvedValue([
      { status: FinanceStatus.PENDING, _count: { _all: 6 } },
      { status: FinanceStatus.APPROVED, _count: { _all: 7 } },
      { status: FinanceStatus.REPORTED_CNE, _count: { _all: 50 } },
      { status: FinanceStatus.REJECTED, _count: { _all: 60 } },
    ]);
    const { service } = buildService(transaction);

    const result = await service.getReadiness(jwtUser, fixedNow);

    expect(readinessCheck(result, 'OPEN_INCIDENTS_CASES')).toMatchObject({
      status: 'WARN',
      detail: expect.stringContaining('3'),
    });
    expect(readinessCheck(result, 'OPEN_TASKS').detail).toContain('4');
    expect(readinessCheck(result, 'OVERDUE_TASKS')).toMatchObject({
      status: 'BLOCK',
      detail: expect.stringContaining('1'),
    });
    expect(readinessCheck(result, 'PENDING_COMMUNICATIONS').detail).toContain(
      '5',
    );
    expect(readinessCheck(result, 'PENDING_FINANCES').detail).toContain('6');
    expect(readinessCheck(result, 'E14_PENDING').detail).toContain('2');
    expect(readinessCheck(result, 'E14_REJECTED').detail).toContain('1');
    expect(readinessCheck(result, 'E14_DIVERGENT')).toMatchObject({
      status: 'BLOCK',
      detail: expect.stringContaining('1'),
    });
    expect(
      readinessCheck(result, 'POST_ELECTION_FINANCE_OBLIGATIONS').detail,
    ).toContain('13');
    expect(transaction.witnessReport.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: jwtUser.tenantId }),
        by: expect.arrayContaining([
          'puestoId',
          'mesa',
          'candidateVotes',
          'status',
        ]),
      }),
    );
  });

  it('uses the shared profile-scoped financial closeout blockers after election day', async () => {
    const transaction = buildReadinessTransaction();
    transaction.operationProfile.findUnique.mockResolvedValue({
      id: 'profile-from-tenant',
      stage: PoliticalOperationStage.POST_ELECTION,
      electionDate: new Date('2026-09-01T00:00:00.000Z'),
      votingStartDate: new Date('2026-09-01T00:00:00.000Z'),
      votingEndDate: new Date('2026-09-01T00:00:00.000Z'),
      votingWindowSourceUrl: null,
      votingWindowReference: null,
      closureType: null,
      terminatedAt: null,
      terminationCause: null,
    });
    transaction.financeReportDossier.findMany.mockResolvedValue([
      { id: 'dossier-without-version', versions: [] },
    ]);
    transaction.financialEntry.count.mockImplementation(
      ({ where }: { where: { status: FinanceStatus } }) =>
        Promise.resolve(where.status === FinanceStatus.APPROVED ? 2 : 0),
    );
    const { service } = buildService(transaction);

    const result = await service.getReadiness(jwtUser, fixedNow);

    expect(
      readinessCheck(result, 'POST_ELECTION_FINANCE_OBLIGATIONS'),
    ).toMatchObject({
      status: 'BLOCK',
      detail: expect.stringMatching(
        /UNREPORTED_FINANCIAL_ENTRIES.*REPORT_VERSION_MISSING/u,
      ),
    });
    expect(transaction.financeReportDossier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: jwtUser.tenantId,
          operationProfileId: 'profile-from-tenant',
        },
      }),
    );
  });
});
