import { apiRequest } from "@/lib/api-client";
import type {
  BackendUserRole,
  PoliticalOperationStage,
} from "@/types/saas-schema";

export type SignaturePlanStatus =
  | "READY"
  | "COLLECTING"
  | "SUBMITTED"
  | "AUTHORITY_RESULT_RECORDED";
export type SignatureBatchStatus =
  | "PLANNED"
  | "ISSUED"
  | "PARTIALLY_RETURNED"
  | "RETURNED"
  | "INTERNAL_REVIEWED"
  | "DELIVERED_TO_COMMITTEE"
  | "SUBMITTED_TO_AUTHORITY"
  | "AUTHORITY_RESULT_RECORDED"
  | "QUARANTINED";
export type SignatureAuthorityOutcome =
  | "THRESHOLD_MET"
  | "THRESHOLD_NOT_MET"
  | "REGISTRATION_DENIED"
  | "WITHDRAWN";
export type SignatureAuthorityReviewDecision = "APPROVE" | "REJECT";
export type SignatureCommandType =
  | "PLAN_CREATE"
  | "BATCH_CREATE"
  | "BATCH_ISSUE"
  | "BATCH_RETURN"
  | "BATCH_INTERNAL_REVIEW"
  | "BATCH_DELIVER_TO_COMMITTEE"
  | "BATCH_SUBMIT_TO_AUTHORITY"
  | "BATCH_QUARANTINE"
  | "BATCH_RELEASE_QUARANTINE"
  | "AUTHORITY_RESULT_RECORD"
  | "AUTHORITY_RESULT_REVIEW";

export interface SignaturePerson {
  id: string;
  name: string;
  role: BackendUserRole;
  isActive: boolean;
}

export interface SignatureCollectionPlan {
  id: string;
  status: SignaturePlanStatus;
  committeeMemberCount: 3;
  committeeEvidenceReference: string;
  committeeEvidenceSha256: string;
  committeeRegisteredAt: string;
  collectionStartsAt: string;
  collectionClosesAt: string;
  candidateRegistrationClosesAt: string;
  requiredThreshold: number;
  internalTarget: number;
  thresholdSourceUrl: string;
  thresholdSourceReference: string;
  thresholdSourceSha256: string;
  fileOwnerUserId: string;
  custodyOwnerUserId: string;
  formHandlingRules: string;
  deliveryPlan: string;
  contingencyPlan: string;
  submissionDueAt: string;
  version: number;
  fileOwner: SignaturePerson;
  custodyOwner: SignaturePerson;
  createdAt: string;
  updatedAt: string;
}

export interface SignatureCustodyEvent {
  id: string;
  type: string;
  previousStatus: SignatureBatchStatus;
  nextStatus: SignatureBatchStatus;
  observation: string;
  evidenceReference: string | null;
  evidenceSha256: string | null;
  createdAt: string;
  actor: SignaturePerson;
  receiver: SignaturePerson | null;
}

export interface SignatureCollectionBatch {
  id: string;
  code: string;
  physicalSealReference: string | null;
  territoryReference: string;
  expectedReturnAt: string;
  status: SignatureBatchStatus;
  statusBeforeQuarantine: SignatureBatchStatus | null;
  plannedForms: number;
  issuedForms: number;
  returnedForms: number;
  annulledForms: number;
  missingForms: number;
  inCustodyForms: number;
  reportedSupports: number;
  internalAcceptedSupports: number;
  internalRejectedSupports: number;
  possibleDuplicateSupports: number;
  currentCustodianUserId: string | null;
  currentCustodian: SignaturePerson | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  custodyEvents: SignatureCustodyEvent[];
}

export interface SignatureAuthorityResult {
  id: string;
  authorityName: string;
  authorityActReference: string;
  authorityActIssuedAt: string;
  evidenceReference: string;
  evidenceSha256: string;
  submittedSupports: number;
  validSupports: number;
  invalidSupports: number;
  outcome: SignatureAuthorityOutcome;
  createdAt: string;
  recordedBy: SignaturePerson;
  review: {
    id: string;
    decision: SignatureAuthorityReviewDecision;
    reason: string | null;
    reviewedAt: string;
    reviewedBy: SignaturePerson;
  } | null;
}

export interface SignatureCollectionOverview {
  operation: {
    id: string;
    stage: PoliticalOperationStage;
    operationType: string;
  };
  readOnly: boolean;
  plan: SignatureCollectionPlan | null;
  batches: SignatureCollectionBatch[];
  authorityResults: SignatureAuthorityResult[];
  operators: SignaturePerson[];
  readiness: {
    entryReady: boolean;
    exitReady: boolean;
    custodyReconciled: boolean;
    certifiedValidSupports: number | null;
    requiredThreshold: number | null;
    entryBlockers: string[];
    exitBlockers: string[];
  };
  summary: {
    batchCount: number;
    plannedForms: number;
    issuedForms: number;
    returnedForms: number;
    annulledForms: number;
    missingForms: number;
    inCustodyForms: number;
    reportedSupports: number;
    internalAcceptedSupports: number;
    internalRejectedSupports: number;
    possibleDuplicateSupports: number;
    overdueBatches: number;
    quarantinedBatches: number;
    pendingCountCorrections: number;
    remainingToTarget: number | null;
    daysRemaining: number | null;
    requiredDailyPace: number | null;
  };
  evaluatedAt: string;
  authorityDisclaimer: string;
  privacyBoundary: string;
}

export interface SignatureCommandReceipt {
  id: string;
  clientRequestId: string;
  payloadSha256: string;
  type: SignatureCommandType;
  resourceType: string;
  resourceId: string;
  createdAt: string;
}

export type SignatureCommandResponse<T> = {
  resource: T;
  command: SignatureCommandReceipt;
  noOp: boolean;
};

type CommandIdentity = { clientRequestId: string };
type Evidence = { evidenceReference: string; evidenceSha256: string };
type BatchMutation = CommandIdentity &
  Evidence & {
    expectedVersion: number;
    observation: string;
  };

export type CreateSignaturePlanInput = CommandIdentity & {
  committeeMemberCount: 3;
  committeeEvidenceReference: string;
  committeeEvidenceSha256: string;
  committeeRegisteredAt: string;
  collectionStartsAt: string;
  collectionClosesAt: string;
  candidateRegistrationClosesAt: string;
  requiredThreshold: number;
  internalTarget: number;
  thresholdSourceUrl: string;
  thresholdSourceReference: string;
  thresholdSourceSha256: string;
  fileOwnerUserId: string;
  custodyOwnerUserId: string;
  formHandlingRules: string;
  deliveryPlan: string;
  contingencyPlan: string;
  submissionDueAt: string;
};

export type CreateSignatureBatchInput = CommandIdentity & {
  code: string;
  physicalSealReference?: string;
  territoryReference: string;
  plannedForms: number;
  expectedReturnAt: string;
};

export type IssueSignatureBatchInput = BatchMutation & {
  issuedForms: number;
  receiverUserId: string;
  physicalSealReference?: string;
};
export type ReturnSignatureBatchInput = BatchMutation & {
  returnedForms: number;
  annulledForms: number;
  missingForms: number;
  finalReturn: boolean;
  receiverUserId: string;
};
export type ReviewSignatureBatchInput = BatchMutation & {
  reportedSupports: number;
  internalAcceptedSupports: number;
  internalRejectedSupports: number;
  possibleDuplicateSupports: number;
};
export type AdvanceSignatureBatchInput = BatchMutation & {
  action: "DELIVER_TO_COMMITTEE" | "SUBMIT_TO_AUTHORITY";
  receiverUserId?: string;
};
export type QuarantineSignatureBatchInput = BatchMutation;
export type ReleaseSignatureBatchInput = BatchMutation & {
  receiverUserId?: string;
};
export type RecordSignatureAuthorityResultInput = CommandIdentity &
  Evidence & {
    authorityName: string;
    authorityActReference: string;
    authorityActIssuedAt: string;
    submittedSupports: number;
    validSupports: number;
    invalidSupports: number;
    outcome: SignatureAuthorityOutcome;
  };
export type ReviewSignatureAuthorityResultInput = CommandIdentity & {
  decision: SignatureAuthorityReviewDecision;
  reason?: string;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, nested]) => key !== "payloadSha256" && nested !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalSignatureCommandPayload(
  type: SignatureCommandType,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export async function computeSignatureCommandSha256(
  type: SignatureCommandType,
  input: object,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonicalSignatureCommandPayload(type, input),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function trimRecord<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value,
    ]),
  ) as T;
}

async function postCommand<T>(
  path: string,
  type: SignatureCommandType,
  input: Record<string, unknown>,
  binding?: Record<string, unknown>,
): Promise<SignatureCommandResponse<T>> {
  const normalized = trimRecord(input);
  const payloadSha256 = await computeSignatureCommandSha256(type, {
    ...(binding ?? {}),
    ...normalized,
  });
  return apiRequest(path, {
    method: "POST",
    body: JSON.stringify({ ...normalized, payloadSha256 }),
  });
}

export function getSignatureCollectionOverview(signal?: AbortSignal) {
  return apiRequest<SignatureCollectionOverview>("signature-collection", {
    signal,
  });
}

export function createSignatureCollectionPlan(
  input: CreateSignaturePlanInput,
) {
  return postCommand<SignatureCollectionPlan>(
    "signature-collection/plans",
    "PLAN_CREATE",
    input,
  );
}

export function createSignatureBatch(input: CreateSignatureBatchInput) {
  const normalized = {
    ...input,
    code: input.code.trim().toUpperCase(),
    ...(input.physicalSealReference?.trim()
      ? { physicalSealReference: input.physicalSealReference.trim() }
      : {}),
  };
  return postCommand<SignatureCollectionBatch>(
    "signature-collection/batches",
    "BATCH_CREATE",
    normalized,
  );
}

export function issueSignatureBatch(
  batchId: string,
  input: IssueSignatureBatchInput,
) {
  const normalized = {
    ...input,
    ...(input.physicalSealReference?.trim()
      ? { physicalSealReference: input.physicalSealReference.trim() }
      : {}),
  };
  return postCommand<SignatureCollectionBatch>(
    `signature-collection/batches/${batchId}/issue`,
    "BATCH_ISSUE",
    normalized,
    { batchId },
  );
}

export function returnSignatureBatch(
  batchId: string,
  input: ReturnSignatureBatchInput,
) {
  return postCommand<SignatureCollectionBatch>(
    `signature-collection/batches/${batchId}/return`,
    "BATCH_RETURN",
    input,
    { batchId },
  );
}

export function reviewSignatureBatch(
  batchId: string,
  input: ReviewSignatureBatchInput,
) {
  return postCommand<SignatureCollectionBatch>(
    `signature-collection/batches/${batchId}/internal-review`,
    "BATCH_INTERNAL_REVIEW",
    input,
    { batchId },
  );
}

export function advanceSignatureBatch(
  batchId: string,
  input: AdvanceSignatureBatchInput,
) {
  const type =
    input.action === "DELIVER_TO_COMMITTEE"
      ? "BATCH_DELIVER_TO_COMMITTEE"
      : "BATCH_SUBMIT_TO_AUTHORITY";
  return postCommand<SignatureCollectionBatch>(
    `signature-collection/batches/${batchId}/advance`,
    type,
    input,
    { batchId },
  );
}

export function quarantineSignatureBatch(
  batchId: string,
  input: QuarantineSignatureBatchInput,
) {
  return postCommand<SignatureCollectionBatch>(
    `signature-collection/batches/${batchId}/quarantine`,
    "BATCH_QUARANTINE",
    input,
    { batchId },
  );
}

export function releaseSignatureBatch(
  batchId: string,
  input: ReleaseSignatureBatchInput,
) {
  return postCommand<SignatureCollectionBatch>(
    `signature-collection/batches/${batchId}/release-quarantine`,
    "BATCH_RELEASE_QUARANTINE",
    input,
    { batchId },
  );
}

export function recordSignatureAuthorityResult(
  input: RecordSignatureAuthorityResultInput,
) {
  return postCommand<SignatureAuthorityResult>(
    "signature-collection/authority-results",
    "AUTHORITY_RESULT_RECORD",
    input,
  );
}

export function reviewSignatureAuthorityResult(
  resultId: string,
  input: ReviewSignatureAuthorityResultInput,
) {
  return postCommand<SignatureAuthorityResult>(
    `signature-collection/authority-results/${resultId}/review`,
    "AUTHORITY_RESULT_REVIEW",
    input,
    { resultId },
  );
}
