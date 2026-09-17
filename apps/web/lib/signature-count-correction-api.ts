import { apiRequest } from "@/lib/api-client";
import type { BackendUserRole, PoliticalOperationStage } from "@/types/saas-schema";
import type { SignatureBatchStatus } from "@/lib/signature-collection-api";

export type SignatureCountCorrectionCommandType = "PROPOSE" | "DECIDE";
export type SignatureCountCorrectionDecision = "APPROVE" | "REJECT";
export type SignatureCountCorrectionReviewControl =
  | "CUSTODY_COUNTS"
  | "SUPPORT_CLASSIFICATION";
export type SignatureCountField =
  | "plannedForms"
  | "issuedForms"
  | "returnedForms"
  | "annulledForms"
  | "missingForms"
  | "inCustodyForms"
  | "reportedSupports"
  | "internalAcceptedSupports"
  | "internalRejectedSupports"
  | "possibleDuplicateSupports";

export interface SignatureCountCorrectionProposal {
  id: string;
  batchId: string;
  batchCode: string;
  snapshotBatchVersion: number;
  snapshotStatus: "QUARANTINED";
  snapshotStatusBeforeQuarantine: SignatureBatchStatus;
  requiredReviewControl: SignatureCountCorrectionReviewControl;
  requiredReviewerRole: "COMPLIANCE_OFFICER" | "AUDITOR";
  reason: string;
  evidence: {
    id: string;
    contentType: string;
    actualSize: number | null;
    confirmedAt: string | null;
    status: "CONSUMED";
  };
  evidenceSha256: string;
  requestedBy: {
    id: string;
    name: string;
    role: BackendUserRole;
    isActive: boolean;
  };
  createdAt: string;
  differences: Array<{
    field: SignatureCountField;
    label: string;
    before: number;
    proposed: number;
    change: number;
  }>;
  decision: null | {
    id: string;
    decision: SignatureCountCorrectionDecision;
    reviewReason: string;
    reviewerRole: BackendUserRole;
    expectedBatchVersion: number;
    batchVersionBefore: number;
    batchVersionAfter: number;
    createdAt: string;
    reviewedBy: {
      id: string;
      name: string;
      role: BackendUserRole;
      isActive: boolean;
    };
  };
  currentBatch: Record<SignatureCountField, number> & {
    id: string;
    code: string;
    status: SignatureBatchStatus;
    statusBeforeQuarantine: SignatureBatchStatus | null;
    version: number;
  };
  snapshotStillCurrent: boolean;
  pending: boolean;
  canReview: boolean;
  batchRemainsQuarantined: boolean;
}

export interface SignatureCountCorrectionOverview {
  stage: PoliticalOperationStage;
  readOnly: boolean;
  controls: {
    absoluteValuesOnly: true;
    independentDecisionRequired: true;
    releaseIsSeparate: true;
    batchRemainsQuarantinedAfterApproval: true;
    supporterPersonalDataAccepted: false;
    custodyReviewerRole: "COMPLIANCE_OFFICER";
    supportReviewerRole: "AUDITOR";
  };
  readiness: {
    pendingCount: number;
    readyForQuarantineRelease: boolean;
    blockers: string[];
  };
  proposals: SignatureCountCorrectionProposal[];
  totalCount: number;
  isTruncated: boolean;
}

export interface SignatureProposedAbsoluteCounts {
  proposedPlannedForms: number;
  proposedIssuedForms: number;
  proposedReturnedForms: number;
  proposedAnnulledForms: number;
  proposedMissingForms: number;
  proposedInCustodyForms: number;
  proposedReportedSupports: number;
  proposedInternalAcceptedSupports: number;
  proposedInternalRejectedSupports: number;
  proposedPossibleDuplicateSupports: number;
}

export type ProposeSignatureCountCorrectionInput =
  SignatureProposedAbsoluteCounts & {
  clientRequestId: string;
  expectedVersion: number;
  reason: string;
  evidenceStoragePath: string;
  evidenceSha256: string;
  };

export type DecideSignatureCountCorrectionInput = {
  clientRequestId: string;
  expectedVersion: number;
  decision: SignatureCountCorrectionDecision;
  reviewReason: string;
};

export interface SignatureCountCorrectionResponse {
  resource: SignatureCountCorrectionProposal;
  command: {
    id: string;
    clientRequestId: string;
    payloadSha256: string;
    type: SignatureCountCorrectionCommandType;
    resourceType: string;
    resourceId: string;
    createdAt: string;
  };
  noOp: boolean;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, nested]) => key !== "payloadSha256" && nested !== undefined,
        )
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalSignatureCountCorrectionPayload(
  type: SignatureCountCorrectionCommandType,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export async function computeSignatureCountCorrectionSha256(
  type: SignatureCountCorrectionCommandType,
  input: object,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonicalSignatureCountCorrectionPayload(type, input),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function normalize<T extends object>(input: T): T {
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value,
    ]),
  ) as T;
}

export function getSignatureCountCorrections(signal?: AbortSignal) {
  return apiRequest<SignatureCountCorrectionOverview>(
    "signature-collection/count-corrections",
    { signal },
  );
}

export async function proposeSignatureCountCorrection(
  batchId: string,
  input: ProposeSignatureCountCorrectionInput,
) {
  const normalized = normalize(input);
  const payloadSha256 = await computeSignatureCountCorrectionSha256(
    "PROPOSE",
    { batchId, ...normalized },
  );
  return apiRequest<SignatureCountCorrectionResponse>(
    `signature-collection/batches/${batchId}/count-corrections`,
    {
      method: "POST",
      body: JSON.stringify({ ...normalized, payloadSha256 }),
    },
  );
}

export async function decideSignatureCountCorrection(
  proposalId: string,
  input: DecideSignatureCountCorrectionInput,
) {
  const normalized = normalize(input);
  const payloadSha256 = await computeSignatureCountCorrectionSha256("DECIDE", {
    proposalId,
    ...normalized,
  });
  return apiRequest<SignatureCountCorrectionResponse>(
    `signature-collection/count-corrections/${proposalId}/decision`,
    {
      method: "POST",
      body: JSON.stringify({ ...normalized, payloadSha256 }),
    },
  );
}
