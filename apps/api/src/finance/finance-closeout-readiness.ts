import {
  FinanceApprovalControl,
  FinanceApprovalDecision,
  FinanceBankMatchStatus,
  FinanceExternalReviewDecision,
  FinanceStatus,
  Prisma,
} from '../../prisma/generated/prisma';
import {
  FINANCE_COMPLIANCE_SELECT,
  getFinanceComplianceReadiness,
} from './finance-compliance';
import {
  toBogotaDateKey,
  toStoredDateOnlyKey,
} from '../operation-profile/election-operating-window';

export const FINANCE_CLOSEOUT_READINESS_BASIS =
  'FINANCE_COMPLIANCE_REPORT_DEADLINE_IMMUTABLE_LEDGER_CUT_BANK_RECONCILIATION_IN_KIND_PAIR_PAYABLE_BALANCE_THREE_INDEPENDENT_APPROVALS_REVIEWED_EXTERNAL_EVIDENCE';

export const FINANCE_CLOSEOUT_READINESS_BLOCKER = {
  FINANCE_COMPLIANCE_NOT_READY: 'FINANCE_COMPLIANCE_NOT_READY',
  UNREPORTED_FINANCIAL_ENTRIES: 'UNREPORTED_FINANCIAL_ENTRIES',
  POST_ELECTION_REPORT_DEADLINE_NOT_CONFIGURED:
    'POST_ELECTION_REPORT_DEADLINE_NOT_CONFIGURED',
  POST_ELECTION_REPORT_OVERDUE: 'POST_ELECTION_REPORT_OVERDUE',
  NO_REPORT_DOSSIER: 'NO_REPORT_DOSSIER',
  REPORT_VERSION_MISSING: 'REPORT_VERSION_MISSING',
  NO_BANK_STATEMENTS: 'NO_BANK_STATEMENTS',
  UNMATCHED_BANK_LINES: 'UNMATCHED_BANK_LINES',
  OPEN_PAYABLES: 'OPEN_PAYABLES',
  REPORT_APPROVALS_INCOMPLETE: 'REPORT_APPROVALS_INCOMPLETE',
  EXTERNAL_EVIDENCE_NOT_APPROVED: 'EXTERNAL_EVIDENCE_NOT_APPROVED',
} as const;

export type FinanceCloseoutReadinessBlockerCode =
  (typeof FINANCE_CLOSEOUT_READINESS_BLOCKER)[keyof typeof FINANCE_CLOSEOUT_READINESS_BLOCKER];

export interface FinanceCloseoutReadinessFacts {
  financeComplianceReady: boolean;
  reportDeadline: Date | null;
  dossierCount: number;
  dossierWithoutVersionCount: number;
  latestVersionNotApprovedCount: number;
  latestVersionWithoutApprovedExternalEvidenceCount: number;
  bankStatementCount: number;
  unmatchedBankLineCount: number;
  outstandingPayables: Prisma.Decimal;
  pendingEntryCount: number;
  approvedUnreportedEntryCount: number;
}

export interface FinanceCloseoutReadinessBlocker {
  code: FinanceCloseoutReadinessBlockerCode;
  detail: string;
}

export interface FinanceCloseoutReadiness {
  readyForCloseout: boolean;
  evaluatedAt: string;
  basis: typeof FINANCE_CLOSEOUT_READINESS_BASIS;
  blockers: FinanceCloseoutReadinessBlocker[];
  summary: FinanceCloseoutReadinessFacts & {
    unreportedEntryCount: number;
  };
}

const REQUIRED_APPROVAL_CONTROLS = [
  FinanceApprovalControl.CAMPAIGN_MANAGER,
  FinanceApprovalControl.ACCOUNTANT,
  FinanceApprovalControl.COMPLIANCE,
] as const;

export function evaluateFinanceCloseoutReadiness(
  facts: FinanceCloseoutReadinessFacts,
  evaluatedAt: Date,
): FinanceCloseoutReadiness {
  const blockers: FinanceCloseoutReadinessBlocker[] = [];
  const unreportedEntryCount =
    facts.pendingEntryCount + facts.approvedUnreportedEntryCount;
  const reportingObligationsIncomplete =
    !facts.financeComplianceReady ||
    unreportedEntryCount > 0 ||
    facts.dossierCount === 0 ||
    facts.dossierWithoutVersionCount > 0 ||
    facts.latestVersionNotApprovedCount > 0 ||
    facts.latestVersionWithoutApprovedExternalEvidenceCount > 0 ||
    facts.bankStatementCount === 0 ||
    facts.unmatchedBankLineCount > 0 ||
    facts.outstandingPayables.greaterThan(0);

  if (!facts.financeComplianceReady) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.FINANCE_COMPLIANCE_NOT_READY,
      detail:
        'La configuracion financiera obligatoria esta incompleta o es incoherente.',
    });
  }
  if (unreportedEntryCount > 0) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.UNREPORTED_FINANCIAL_ENTRIES,
      detail: `${facts.pendingEntryCount} movimientos esperan revision y ${facts.approvedUnreportedEntryCount} estan aprobados sin constancia externa revisada.`,
    });
  }
  if (!facts.reportDeadline) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.POST_ELECTION_REPORT_DEADLINE_NOT_CONFIGURED,
      detail: 'No esta configurada la fecha limite del informe poselectoral.',
    });
  } else if (
    reportingObligationsIncomplete &&
    toStoredDateOnlyKey(facts.reportDeadline) < toBogotaDateKey(evaluatedAt)
  ) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.POST_ELECTION_REPORT_OVERDUE,
      detail:
        'La fecha limite configurada ya paso y el expediente financiero aun no acredita cierre verificable.',
    });
  }
  if (facts.dossierCount === 0) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.NO_REPORT_DOSSIER,
      detail:
        'No existe expediente interno de informe de candidatura o consolidado.',
    });
  }
  if (facts.dossierWithoutVersionCount > 0) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.REPORT_VERSION_MISSING,
      detail: `${facts.dossierWithoutVersionCount} expedientes no tienen una version inmutable del informe.`,
    });
  }
  if (facts.bankStatementCount === 0) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.NO_BANK_STATEMENTS,
      detail: 'No hay extractos confirmados para conciliar la cuenta unica.',
    });
  }
  if (facts.unmatchedBankLineCount > 0) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.UNMATCHED_BANK_LINES,
      detail: `${facts.unmatchedBankLineCount} lineas bancarias no estan conciliadas ni justificadas.`,
    });
  }
  if (facts.outstandingPayables.greaterThan(0)) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.OPEN_PAYABLES,
      detail: `Existen cuentas por pagar con saldo pendiente por ${facts.outstandingPayables.toFixed(2)} COP.`,
    });
  }
  if (facts.latestVersionNotApprovedCount > 0) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.REPORT_APPROVALS_INCOMPLETE,
      detail: `${facts.latestVersionNotApprovedCount} versiones vigentes no tienen los tres controles independientes.`,
    });
  }
  if (facts.latestVersionWithoutApprovedExternalEvidenceCount > 0) {
    blockers.push({
      code: FINANCE_CLOSEOUT_READINESS_BLOCKER.EXTERNAL_EVIDENCE_NOT_APPROVED,
      detail: `${facts.latestVersionWithoutApprovedExternalEvidenceCount} versiones vigentes no tienen evidencia externa aprobada por auditor independiente.`,
    });
  }

  return {
    readyForCloseout: blockers.length === 0,
    evaluatedAt: evaluatedAt.toISOString(),
    basis: FINANCE_CLOSEOUT_READINESS_BASIS,
    blockers,
    summary: { ...facts, unreportedEntryCount },
  };
}

export async function getFinanceCloseoutReadiness(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  operationProfileId: string,
  evaluatedAt: Date,
): Promise<FinanceCloseoutReadiness> {
  const [
    settings,
    dossiers,
    bankStatementCount,
    unmatchedBankLineCount,
    payables,
    pendingEntryCount,
    approvedUnreportedEntryCount,
  ] = await Promise.all([
    transaction.campaignSettings.findUnique({
      where: { tenantId },
      select: FINANCE_COMPLIANCE_SELECT,
    }),
    transaction.financeReportDossier.findMany({
      where: { tenantId, operationProfileId },
      select: {
        id: true,
        versions: {
          where: { tenantId, operationProfileId },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            approvals: {
              where: { tenantId },
              select: {
                control: true,
                decision: true,
                actorUserId: true,
              },
            },
            externalEvidence: {
              select: {
                review: { select: { decision: true } },
              },
            },
          },
        },
      },
    }),
    transaction.financeBankStatement.count({
      where: { tenantId, operationProfileId },
    }),
    transaction.financeBankStatementLine.count({
      where: {
        tenantId,
        matchStatus: FinanceBankMatchStatus.UNMATCHED,
        bankStatement: { is: { tenantId, operationProfileId } },
      },
    }),
    transaction.financePayable.findMany({
      where: { tenantId, operationProfileId },
      select: {
        originalAmount: true,
        settlements: {
          where: { tenantId },
          select: { amount: true },
        },
      },
    }),
    transaction.financialEntry.count({
      where: { tenantId, status: FinanceStatus.PENDING },
    }),
    transaction.financialEntry.count({
      where: { tenantId, status: FinanceStatus.APPROVED },
    }),
  ]);

  let dossierWithoutVersionCount = 0;
  let latestVersionNotApprovedCount = 0;
  let latestVersionWithoutApprovedExternalEvidenceCount = 0;
  for (const dossier of dossiers) {
    const latestVersion = dossier.versions[0];
    if (!latestVersion) {
      dossierWithoutVersionCount += 1;
      continue;
    }
    const approved = latestVersion.approvals.filter(
      ({ decision }) => decision === FinanceApprovalDecision.APPROVE,
    );
    const approvedControls = new Set(approved.map(({ control }) => control));
    const approvedActors = new Set(
      approved.map(({ actorUserId }) => actorUserId),
    );
    const internallyApproved =
      !latestVersion.approvals.some(
        ({ decision }) =>
          decision === FinanceApprovalDecision.RETURN_FOR_CORRECTION,
      ) &&
      REQUIRED_APPROVAL_CONTROLS.every((control) =>
        approvedControls.has(control),
      ) &&
      approvedActors.size === REQUIRED_APPROVAL_CONTROLS.length;
    if (!internallyApproved) latestVersionNotApprovedCount += 1;
    if (
      latestVersion.externalEvidence?.review?.decision !==
      FinanceExternalReviewDecision.APPROVE
    ) {
      latestVersionWithoutApprovedExternalEvidenceCount += 1;
    }
  }

  const outstandingPayables = payables.reduce((total, payable) => {
    const paid = payable.settlements.reduce(
      (sum, settlement) => sum.plus(settlement.amount),
      new Prisma.Decimal(0),
    );
    return total.plus(
      Prisma.Decimal.max(payable.originalAmount.minus(paid), 0),
    );
  }, new Prisma.Decimal(0));

  return evaluateFinanceCloseoutReadiness(
    {
      financeComplianceReady: getFinanceComplianceReadiness(settings).ready,
      reportDeadline: settings?.reportDeadline ?? null,
      dossierCount: dossiers.length,
      dossierWithoutVersionCount,
      latestVersionNotApprovedCount,
      latestVersionWithoutApprovedExternalEvidenceCount,
      bankStatementCount,
      unmatchedBankLineCount,
      outstandingPayables,
      pendingEntryCount,
      approvedUnreportedEntryCount,
    },
    evaluatedAt,
  );
}
