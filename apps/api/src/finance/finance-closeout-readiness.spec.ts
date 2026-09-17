import {
  FinanceApprovalControl,
  FinanceApprovalDecision,
  FinanceExternalReviewDecision,
  FinanceReportScope,
  FinanceStatus,
  Prisma,
} from '../../prisma/generated/prisma';
import {
  evaluateFinanceCloseoutReadiness,
  FINANCE_CLOSEOUT_READINESS_BLOCKER,
  getFinanceCloseoutReadiness,
  type FinanceCloseoutReadinessFacts,
} from './finance-closeout-readiness';

const evaluatedAt = new Date('2026-11-20T15:00:00.000Z');

function readyFacts(
  overrides: Partial<FinanceCloseoutReadinessFacts> = {},
): FinanceCloseoutReadinessFacts {
  return {
    financeComplianceReady: true,
    reportDeadline: new Date('2026-11-30T00:00:00.000Z'),
    dossierCount: 1,
    dossierWithoutVersionCount: 0,
    latestVersionNotApprovedCount: 0,
    latestVersionWithoutApprovedExternalEvidenceCount: 0,
    bankStatementCount: 1,
    unmatchedBankLineCount: 0,
    outstandingPayables: new Prisma.Decimal(0),
    pendingEntryCount: 0,
    approvedUnreportedEntryCount: 0,
    ...overrides,
  };
}

describe('shared finance closeout readiness', () => {
  it('blocks a dossier without a version and APPROVED entries not yet externally covered', () => {
    const readiness = evaluateFinanceCloseoutReadiness(
      readyFacts({
        dossierWithoutVersionCount: 1,
        approvedUnreportedEntryCount: 2,
      }),
      evaluatedAt,
    );

    expect(readiness.readyForCloseout).toBe(false);
    expect(readiness.summary).toMatchObject({
      pendingEntryCount: 0,
      approvedUnreportedEntryCount: 2,
      unreportedEntryCount: 2,
    });
    expect(readiness.blockers.map(({ code }) => code)).toEqual([
      FINANCE_CLOSEOUT_READINESS_BLOCKER.UNREPORTED_FINANCIAL_ENTRIES,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.REPORT_VERSION_MISSING,
    ]);
    expect(readiness.blockers[0].detail).toContain('2 estan aprobados');
  });

  it('returns ready only when every shared financial closeout fact is clear', () => {
    expect(
      evaluateFinanceCloseoutReadiness(readyFacts(), evaluatedAt),
    ).toMatchObject({
      readyForCloseout: true,
      blockers: [],
      summary: { unreportedEntryCount: 0 },
    });
  });

  it('surfaces every concurrent legal, accounting and segregation blocker', () => {
    const readiness = evaluateFinanceCloseoutReadiness(
      readyFacts({
        financeComplianceReady: false,
        reportDeadline: new Date('2026-11-19T00:00:00.000Z'),
        dossierCount: 0,
        dossierWithoutVersionCount: 1,
        latestVersionNotApprovedCount: 1,
        latestVersionWithoutApprovedExternalEvidenceCount: 1,
        bankStatementCount: 0,
        unmatchedBankLineCount: 2,
        outstandingPayables: new Prisma.Decimal('350000.50'),
        pendingEntryCount: 1,
        approvedUnreportedEntryCount: 2,
      }),
      evaluatedAt,
    );

    expect(readiness.blockers.map(({ code }) => code)).toEqual([
      FINANCE_CLOSEOUT_READINESS_BLOCKER.FINANCE_COMPLIANCE_NOT_READY,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.UNREPORTED_FINANCIAL_ENTRIES,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.POST_ELECTION_REPORT_OVERDUE,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.NO_REPORT_DOSSIER,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.REPORT_VERSION_MISSING,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.NO_BANK_STATEMENTS,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.UNMATCHED_BANK_LINES,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.OPEN_PAYABLES,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.REPORT_APPROVALS_INCOMPLETE,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.EXTERNAL_EVIDENCE_NOT_APPROVED,
    ]);
  });

  it('requires the reporting deadline even when there are no financial entries', () => {
    expect(
      evaluateFinanceCloseoutReadiness(
        readyFacts({ reportDeadline: null }),
        evaluatedAt,
      ).blockers.map(({ code }) => code),
    ).toEqual([
      FINANCE_CLOSEOUT_READINESS_BLOCKER.POST_ELECTION_REPORT_DEADLINE_NOT_CONFIGURED,
    ]);
  });

  it('marks an incomplete dossier overdue even when the ledger has no entries', () => {
    const readiness = evaluateFinanceCloseoutReadiness(
      readyFacts({
        reportDeadline: new Date('2026-11-19T00:00:00.000Z'),
        dossierCount: 0,
      }),
      evaluatedAt,
    );

    expect(readiness.blockers.map(({ code }) => code)).toEqual([
      FINANCE_CLOSEOUT_READINESS_BLOCKER.POST_ELECTION_REPORT_OVERDUE,
      FINANCE_CLOSEOUT_READINESS_BLOCKER.NO_REPORT_DOSSIER,
    ]);
  });

  it('loads every dossier control with exact tenant and operation-profile filters', async () => {
    const transaction = {
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'settings-a',
          maxTotalBudget: new Prisma.Decimal(100),
          maxPublicityLimit: new Prisma.Decimal(20),
          electionName: 'Eleccion de prueba',
          electionDate: new Date('2026-10-25T00:00:00.000Z'),
          reportScope: FinanceReportScope.CANDIDATE,
          officialLimitsReference: 'Resolucion de topes',
          officialLimitsUrl: 'https://autoridad.invalid/topes',
          reportDeadline: new Date('2026-11-30T00:00:00.000Z'),
          financialManagerName: 'Gerencia financiera',
          financialManagerDocument: '123456',
          accountantName: 'Contabilidad',
          accountantDocument: '654321',
          uniqueAccountBank: 'Banco',
          uniqueAccountLastFour: '1234',
          cuentasClarasCode: 'CC-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      financeReportDossier: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dossier-a',
            versions: [
              {
                approvals: [
                  {
                    control: FinanceApprovalControl.CAMPAIGN_MANAGER,
                    decision: FinanceApprovalDecision.APPROVE,
                    actorUserId: 'manager-a',
                  },
                  {
                    control: FinanceApprovalControl.ACCOUNTANT,
                    decision: FinanceApprovalDecision.APPROVE,
                    actorUserId: 'accountant-a',
                  },
                  {
                    control: FinanceApprovalControl.COMPLIANCE,
                    decision: FinanceApprovalDecision.APPROVE,
                    actorUserId: 'compliance-a',
                  },
                ],
                externalEvidence: {
                  review: { decision: FinanceExternalReviewDecision.APPROVE },
                },
              },
            ],
          },
        ]),
      },
      financeBankStatement: { count: jest.fn().mockResolvedValue(1) },
      financeBankStatementLine: { count: jest.fn().mockResolvedValue(0) },
      financePayable: { findMany: jest.fn().mockResolvedValue([]) },
      financialEntry: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
      },
    };

    await expect(
      getFinanceCloseoutReadiness(
        transaction as never,
        'tenant-a',
        'profile-a',
        evaluatedAt,
      ),
    ).resolves.toMatchObject({ readyForCloseout: true, blockers: [] });
    expect(transaction.campaignSettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
    expect(transaction.financeReportDossier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', operationProfileId: 'profile-a' },
      }),
    );
    expect(transaction.financeBankStatement.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', operationProfileId: 'profile-a' },
    });
    expect(transaction.financeBankStatementLine.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        bankStatement: {
          is: { tenantId: 'tenant-a', operationProfileId: 'profile-a' },
        },
      }),
    });
    expect(transaction.financePayable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', operationProfileId: 'profile-a' },
      }),
    );
    const dossierQuery = transaction.financeReportDossier.findMany.mock
      .calls[0]?.[0] as {
      select: {
        versions: {
          where: { tenantId: string; operationProfileId: string };
          select: { approvals: { where: { tenantId: string } } };
        };
      };
    };
    expect(dossierQuery.select.versions.where).toEqual({
      tenantId: 'tenant-a',
      operationProfileId: 'profile-a',
    });
    expect(dossierQuery.select.versions.select.approvals.where).toEqual({
      tenantId: 'tenant-a',
    });
    const payableQuery = transaction.financePayable.findMany.mock
      .calls[0]?.[0] as {
      select: { settlements: { where: { tenantId: string } } };
    };
    expect(payableQuery.select.settlements.where).toEqual({
      tenantId: 'tenant-a',
    });
    expect(transaction.financialEntry.count.mock.calls).toEqual([
      [{ where: { tenantId: 'tenant-a', status: FinanceStatus.PENDING } }],
      [{ where: { tenantId: 'tenant-a', status: FinanceStatus.APPROVED } }],
    ]);

    transaction.financeReportDossier.findMany.mockResolvedValueOnce([
      {
        id: 'dossier-a',
        versions: [
          {
            approvals: [
              {
                control: FinanceApprovalControl.CAMPAIGN_MANAGER,
                decision: FinanceApprovalDecision.APPROVE,
                actorUserId: 'same-actor',
              },
              {
                control: FinanceApprovalControl.ACCOUNTANT,
                decision: FinanceApprovalDecision.APPROVE,
                actorUserId: 'same-actor',
              },
              {
                control: FinanceApprovalControl.COMPLIANCE,
                decision: FinanceApprovalDecision.APPROVE,
                actorUserId: 'same-actor',
              },
            ],
            externalEvidence: {
              review: { decision: FinanceExternalReviewDecision.APPROVE },
            },
          },
        ],
      },
    ]);
    transaction.financialEntry.count.mockReset().mockResolvedValue(0);

    await expect(
      getFinanceCloseoutReadiness(
        transaction as never,
        'tenant-a',
        'profile-a',
        evaluatedAt,
      ),
    ).resolves.toMatchObject({
      readyForCloseout: false,
      blockers: [
        {
          code: FINANCE_CLOSEOUT_READINESS_BLOCKER.REPORT_APPROVALS_INCOMPLETE,
        },
      ],
    });
  });
});
