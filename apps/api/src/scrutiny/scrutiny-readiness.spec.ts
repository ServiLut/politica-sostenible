import {
  CLOSURE_READINESS_BLOCKER,
  type ClosureReadinessFacts,
  getClosureReadinessBlockers,
} from '../operation-profile/operation-readiness';

const evaluatedAt = new Date('2026-11-01T15:00:00.000Z');

function closureFacts(
  overrides: Partial<ClosureReadinessFacts> = {},
): ClosureReadinessFacts {
  return {
    financeComplianceReady: true,
    financeReportDeadline: new Date('2026-12-31T00:00:00.000Z'),
    unreportedFinanceCount: 0,
    e14PendingCount: 0,
    e14DivergentTableCount: 0,
    openUrgentCaseCount: 0,
    openUrgentTaskCount: 0,
    scrutinyCommissionCount: 1,
    scrutinyOpenCommissionCount: 0,
    scrutinyPendingApplicabilityCount: 0,
    scrutinyRequiredDocumentMissingCount: 0,
    scrutinyRequiredCustodyMissingCount: 0,
    scrutinyOpenDiscrepancyCount: 0,
    scrutinyOpenActionCount: 0,
    scrutinyPendingDecisionReviewCount: 0,
    scrutinyOfficialDeclarationRequired: false,
    scrutinyOfficialDeclarationCount: 0,
    ...overrides,
  };
}

describe('scrutiny ordinary-closure readiness', () => {
  it('blocks every unresolved scrutiny obligation independently', () => {
    const blockers = getClosureReadinessBlockers(
      closureFacts({
        scrutinyOpenCommissionCount: 1,
        scrutinyPendingApplicabilityCount: 2,
        scrutinyRequiredDocumentMissingCount: 3,
        scrutinyRequiredCustodyMissingCount: 4,
        scrutinyOpenDiscrepancyCount: 5,
        scrutinyOpenActionCount: 6,
        scrutinyPendingDecisionReviewCount: 7,
        scrutinyOfficialDeclarationRequired: true,
      }),
      evaluatedAt,
    );

    expect(blockers).toEqual([
      CLOSURE_READINESS_BLOCKER.SCRUTINY_COMMISSION_NOT_CLOSED,
      CLOSURE_READINESS_BLOCKER.SCRUTINY_APPLICABILITY_UNDECIDED,
      CLOSURE_READINESS_BLOCKER.SCRUTINY_REQUIRED_DOCUMENTS_MISSING,
      CLOSURE_READINESS_BLOCKER.SCRUTINY_REQUIRED_DOCUMENT_CUSTODY_MISSING,
      CLOSURE_READINESS_BLOCKER.SCRUTINY_DISCREPANCIES_OPEN,
      CLOSURE_READINESS_BLOCKER.SCRUTINY_ACTIONS_OPEN,
      CLOSURE_READINESS_BLOCKER.SCRUTINY_DECISIONS_PENDING_REVIEW,
      CLOSURE_READINESS_BLOCKER.SCRUTINY_OFFICIAL_DECLARATION_MISSING,
    ]);
  });

  it('does not invent a required document or declaration after an explicit not-applicable decision', () => {
    expect(getClosureReadinessBlockers(closureFacts(), evaluatedAt)).toEqual(
      [],
    );
  });
});
