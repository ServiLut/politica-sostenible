import {
  SignatureAuthorityOutcome,
  SignatureAuthorityReviewDecision,
  SignatureCollectionBatchStatus,
  SignatureCollectionPlanStatus,
} from '../../prisma/generated/prisma';

export const SIGNATURE_COLLECTION_BLOCKER = {
  PLAN_REQUIRED: 'SIGNATURE_PLAN_REQUIRED',
  PLAN_NOT_READY: 'SIGNATURE_PLAN_NOT_READY',
  RESPONSIBLE_USERS_INACTIVE: 'SIGNATURE_RESPONSIBLE_USERS_INACTIVE',
  NO_BATCHES: 'SIGNATURE_NO_BATCHES',
  CUSTODY_NOT_RECONCILED: 'SIGNATURE_CUSTODY_NOT_RECONCILED',
  BATCHES_NOT_SUBMITTED: 'SIGNATURE_BATCHES_NOT_SUBMITTED',
  AUTHORITY_RESULT_NOT_APPROVED: 'SIGNATURE_AUTHORITY_RESULT_NOT_APPROVED',
  AUTHORITY_THRESHOLD_NOT_MET: 'SIGNATURE_AUTHORITY_THRESHOLD_NOT_MET',
  COUNT_CORRECTION_PENDING: 'SIGNATURE_COUNT_CORRECTION_PENDING',
} as const;

export type SignatureCollectionBlocker =
  (typeof SIGNATURE_COLLECTION_BLOCKER)[keyof typeof SIGNATURE_COLLECTION_BLOCKER];

export interface SignatureCollectionReadinessPlan {
  status: SignatureCollectionPlanStatus;
  requiredThreshold: number;
  fileOwnerActive: boolean;
  custodyOwnerActive: boolean;
}

export interface SignatureCollectionReadinessBatch {
  status: SignatureCollectionBatchStatus;
  issuedForms: number;
  returnedForms: number;
  annulledForms: number;
  missingForms: number;
  inCustodyForms: number;
}

export interface SignatureCollectionReadinessResult {
  validSupports: number;
  outcome: SignatureAuthorityOutcome;
  decision: SignatureAuthorityReviewDecision | null;
}

export interface SignatureCollectionReadinessFacts {
  plan: SignatureCollectionReadinessPlan | null;
  batches: SignatureCollectionReadinessBatch[];
  authorityResults: SignatureCollectionReadinessResult[];
  pendingCountCorrections?: number;
}

export interface SignatureCollectionReadiness {
  entryReady: boolean;
  exitReady: boolean;
  custodyReconciled: boolean;
  certifiedValidSupports: number | null;
  requiredThreshold: number | null;
  entryBlockers: SignatureCollectionBlocker[];
  exitBlockers: SignatureCollectionBlocker[];
}

export function evaluateSignatureCollectionReadiness(
  facts: SignatureCollectionReadinessFacts,
): SignatureCollectionReadiness {
  const entryBlockers: SignatureCollectionBlocker[] = [];
  const exitBlockers: SignatureCollectionBlocker[] = [];
  const plan = facts.plan;

  if (!plan) {
    entryBlockers.push(SIGNATURE_COLLECTION_BLOCKER.PLAN_REQUIRED);
    exitBlockers.push(SIGNATURE_COLLECTION_BLOCKER.PLAN_REQUIRED);
    return {
      entryReady: false,
      exitReady: false,
      custodyReconciled: false,
      certifiedValidSupports: null,
      requiredThreshold: null,
      entryBlockers,
      exitBlockers,
    };
  }

  if (
    ![
      SignatureCollectionPlanStatus.READY,
      SignatureCollectionPlanStatus.COLLECTING,
      SignatureCollectionPlanStatus.SUBMITTED,
      SignatureCollectionPlanStatus.AUTHORITY_RESULT_RECORDED,
    ].includes(plan.status)
  ) {
    entryBlockers.push(SIGNATURE_COLLECTION_BLOCKER.PLAN_NOT_READY);
  }
  if (!plan.fileOwnerActive || !plan.custodyOwnerActive) {
    entryBlockers.push(SIGNATURE_COLLECTION_BLOCKER.RESPONSIBLE_USERS_INACTIVE);
    exitBlockers.push(SIGNATURE_COLLECTION_BLOCKER.RESPONSIBLE_USERS_INACTIVE);
  }

  if (facts.batches.length === 0) {
    exitBlockers.push(SIGNATURE_COLLECTION_BLOCKER.NO_BATCHES);
  }
  const custodyReconciled =
    facts.batches.length > 0 &&
    facts.batches.every(
      (batch) =>
        batch.issuedForms > 0 &&
        batch.returnedForms +
          batch.annulledForms +
          batch.missingForms +
          batch.inCustodyForms ===
          batch.issuedForms &&
        batch.inCustodyForms === 0 &&
        batch.missingForms === 0 &&
        batch.status !== SignatureCollectionBatchStatus.QUARANTINED,
    );
  if (facts.batches.length > 0 && !custodyReconciled) {
    exitBlockers.push(SIGNATURE_COLLECTION_BLOCKER.CUSTODY_NOT_RECONCILED);
  }

  const terminalStatuses = new Set<SignatureCollectionBatchStatus>([
    SignatureCollectionBatchStatus.SUBMITTED_TO_AUTHORITY,
    SignatureCollectionBatchStatus.AUTHORITY_RESULT_RECORDED,
  ]);
  if (
    facts.batches.length > 0 &&
    facts.batches.some((batch) => !terminalStatuses.has(batch.status))
  ) {
    exitBlockers.push(SIGNATURE_COLLECTION_BLOCKER.BATCHES_NOT_SUBMITTED);
  }

  if ((facts.pendingCountCorrections ?? 0) > 0) {
    exitBlockers.push(SIGNATURE_COLLECTION_BLOCKER.COUNT_CORRECTION_PENDING);
  }

  const approved = facts.authorityResults.find(
    (result) => result.decision === SignatureAuthorityReviewDecision.APPROVE,
  );
  if (!approved) {
    exitBlockers.push(
      SIGNATURE_COLLECTION_BLOCKER.AUTHORITY_RESULT_NOT_APPROVED,
    );
  } else if (
    approved.outcome !== SignatureAuthorityOutcome.THRESHOLD_MET ||
    approved.validSupports < plan.requiredThreshold
  ) {
    exitBlockers.push(SIGNATURE_COLLECTION_BLOCKER.AUTHORITY_THRESHOLD_NOT_MET);
  }

  return {
    entryReady: entryBlockers.length === 0,
    exitReady: exitBlockers.length === 0,
    custodyReconciled,
    certifiedValidSupports: approved?.validSupports ?? null,
    requiredThreshold: plan.requiredThreshold,
    entryBlockers,
    exitBlockers,
  };
}
