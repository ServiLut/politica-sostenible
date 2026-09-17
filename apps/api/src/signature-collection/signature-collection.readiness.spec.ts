import {
  SignatureAuthorityOutcome,
  SignatureAuthorityReviewDecision,
  SignatureCollectionBatchStatus,
  SignatureCollectionPlanStatus,
} from '../../prisma/generated/prisma';
import {
  evaluateSignatureCollectionReadiness,
  SIGNATURE_COLLECTION_BLOCKER,
} from './signature-collection.readiness';

const plan = {
  status: SignatureCollectionPlanStatus.READY,
  requiredThreshold: 100,
  fileOwnerActive: true,
  custodyOwnerActive: true,
};

describe('signature collection lifecycle readiness', () => {
  it('blocks entry without the minimum durable plan', () => {
    const result = evaluateSignatureCollectionReadiness({
      plan: null,
      batches: [],
      authorityResults: [],
    });
    expect(result.entryReady).toBe(false);
    expect(result.entryBlockers).toContain(
      SIGNATURE_COLLECTION_BLOCKER.PLAN_REQUIRED,
    );
  });

  it('does not call internal totals certified and blocks exit without approval', () => {
    const result = evaluateSignatureCollectionReadiness({
      plan,
      batches: [
        {
          status: SignatureCollectionBatchStatus.SUBMITTED_TO_AUTHORITY,
          issuedForms: 10,
          returnedForms: 10,
          annulledForms: 0,
          missingForms: 0,
          inCustodyForms: 0,
        },
      ],
      authorityResults: [
        {
          validSupports: 150,
          outcome: SignatureAuthorityOutcome.THRESHOLD_MET,
          decision: null,
        },
      ],
    });
    expect(result.certifiedValidSupports).toBeNull();
    expect(result.exitBlockers).toContain(
      SIGNATURE_COLLECTION_BLOCKER.AUTHORITY_RESULT_NOT_APPROVED,
    );
  });

  it('allows exit only with exact custody and a four-eyes approved authority result', () => {
    const result = evaluateSignatureCollectionReadiness({
      plan,
      batches: [
        {
          status: SignatureCollectionBatchStatus.AUTHORITY_RESULT_RECORDED,
          issuedForms: 10,
          returnedForms: 9,
          annulledForms: 1,
          missingForms: 0,
          inCustodyForms: 0,
        },
      ],
      authorityResults: [
        {
          validSupports: 101,
          outcome: SignatureAuthorityOutcome.THRESHOLD_MET,
          decision: SignatureAuthorityReviewDecision.APPROVE,
        },
      ],
    });
    expect(result).toMatchObject({
      entryReady: true,
      exitReady: true,
      custodyReconciled: true,
      certifiedValidSupports: 101,
      requiredThreshold: 100,
    });
  });

  it('keeps lifecycle exit blocked while a count correction lacks a decision', () => {
    const result = evaluateSignatureCollectionReadiness({
      plan,
      batches: [
        {
          status: SignatureCollectionBatchStatus.AUTHORITY_RESULT_RECORDED,
          issuedForms: 10,
          returnedForms: 10,
          annulledForms: 0,
          missingForms: 0,
          inCustodyForms: 0,
        },
      ],
      authorityResults: [
        {
          validSupports: 101,
          outcome: SignatureAuthorityOutcome.THRESHOLD_MET,
          decision: SignatureAuthorityReviewDecision.APPROVE,
        },
      ],
      pendingCountCorrections: 1,
    });

    expect(result.exitReady).toBe(false);
    expect(result.exitBlockers).toContain(
      SIGNATURE_COLLECTION_BLOCKER.COUNT_CORRECTION_PENDING,
    );
  });

  it('blocks missing physical forms even when the authority threshold was met', () => {
    const result = evaluateSignatureCollectionReadiness({
      plan,
      batches: [
        {
          status: SignatureCollectionBatchStatus.AUTHORITY_RESULT_RECORDED,
          issuedForms: 10,
          returnedForms: 9,
          annulledForms: 0,
          missingForms: 1,
          inCustodyForms: 0,
        },
      ],
      authorityResults: [
        {
          validSupports: 101,
          outcome: SignatureAuthorityOutcome.THRESHOLD_MET,
          decision: SignatureAuthorityReviewDecision.APPROVE,
        },
      ],
    });
    expect(result.exitReady).toBe(false);
    expect(result.exitBlockers).toContain(
      SIGNATURE_COLLECTION_BLOCKER.CUSTODY_NOT_RECONCILED,
    );
  });

  it('records an independently approved negative result without opening campaign', () => {
    const result = evaluateSignatureCollectionReadiness({
      plan,
      batches: [
        {
          status: SignatureCollectionBatchStatus.AUTHORITY_RESULT_RECORDED,
          issuedForms: 10,
          returnedForms: 10,
          annulledForms: 0,
          missingForms: 0,
          inCustodyForms: 0,
        },
      ],
      authorityResults: [
        {
          validSupports: 99,
          outcome: SignatureAuthorityOutcome.THRESHOLD_NOT_MET,
          decision: SignatureAuthorityReviewDecision.APPROVE,
        },
      ],
    });

    expect(result.certifiedValidSupports).toBe(99);
    expect(result.exitReady).toBe(false);
    expect(result.exitBlockers).toContain(
      SIGNATURE_COLLECTION_BLOCKER.AUTHORITY_THRESHOLD_NOT_MET,
    );
  });
});
