import { apiRequest } from "@/lib/api-client";
import type {
  BackendUserRole,
  PoliticalOperationStage,
} from "@/types/saas-schema";

export const OPERATION_TERMINATION_CAUSES = [
  "CANDIDACY_WITHDRAWAL",
  "REGISTRATION_DENIED",
  "REGISTRATION_REVOKED",
  "DISQUALIFICATION",
  "SIGNATURE_THRESHOLD_NOT_MET",
  "ENDORSEMENT_WITHDRAWN",
  "ELECTION_CANCELLED",
  "OTHER",
] as const;

export type OperationTerminationCause =
  (typeof OPERATION_TERMINATION_CAUSES)[number];
export type OperationTerminationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";
export type OperationClosureType = "CLOSED_NORMAL" | "CLOSED_EXCEPTIONAL";
export type OperationTerminationDecision = "APPROVE" | "REJECT";

export interface OperationTerminationActor {
  id: string;
  name: string;
  role: BackendUserRole;
}

export interface OperationTerminationRequest {
  id: string;
  tenantId: string;
  operationProfileId: string;
  clientRequestId: string;
  payloadSha256: string;
  profileSnapshotSha256: string;
  operationCycleSha256: string;
  expectedProfileUpdatedAt: string;
  status: OperationTerminationStatus;
  cause: OperationTerminationCause;
  otherCause: string | null;
  effectiveAt: string;
  explanation: string;
  authorityName: string;
  officialActType: string;
  officialActReference: string;
  officialActIssuedAt: string;
  evidenceReference: string;
  evidenceSha256: string;
  consequencesAcknowledged: boolean;
  expiresAt: string;
  expiredAt: string | null;
  requestedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewClientRequestId: string | null;
  reviewPayloadSha256: string | null;
  rejectionReason: string | null;
  communicationsCancelledCount: number | null;
  cancelledById: string | null;
  cancelledAt: string | null;
  cancellationClientRequestId: string | null;
  cancellationPayloadSha256: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: OperationTerminationActor;
  reviewedBy: OperationTerminationActor | null;
  cancelledBy: OperationTerminationActor | null;
}

export interface SurvivingObligation {
  code: string;
  category:
    | "FINANCE"
    | "DATA_RIGHTS"
    | "COMMUNICATIONS"
    | "EVIDENCE"
    | "URGENT_WORK";
  status: "ACTION_REQUIRED" | "PRESERVE" | "VERIFY";
  count: number | null;
  label: string;
  detail: string;
  href: string;
}

export interface OperationTerminationDossier {
  kind: "EXCEPTIONAL_TERMINATION_SURVIVING_DUTIES";
  generatedAt: string;
  complianceCertified: false;
  authorityFilingCertified: false;
  communicationsCancelledOnApproval: number;
  obligations: SurvivingObligation[];
  disclaimer: string;
}

export interface OperationTerminationContext {
  profile: {
    id: string;
    stage: PoliticalOperationStage;
    updatedAt: string;
    votingStartDate: string;
    votingEndDate: string;
    votingWindowSourceUrl: string | null;
    votingWindowReference: string | null;
    closureType: OperationClosureType | null;
    terminatedAt: string | null;
    terminationCause: OperationTerminationCause | null;
  } | null;
  request: OperationTerminationRequest | null;
  dossier: OperationTerminationDossier | null;
}

export interface CreateOperationTerminationInput {
  clientRequestId: string;
  payloadSha256: string;
  expectedProfileUpdatedAt: string;
  cause: OperationTerminationCause;
  otherCause?: string;
  effectiveAt: string;
  explanation: string;
  authorityName: string;
  officialActType: string;
  officialActReference: string;
  officialActIssuedAt: string;
  evidenceReference: string;
  evidenceSha256: string;
  consequencesAcknowledged: true;
}

export type OperationTerminationHashInput = Omit<
  CreateOperationTerminationInput,
  "payloadSha256"
>;

export interface ReviewOperationTerminationInput {
  clientReviewId: string;
  expectedPayloadSha256: string;
  decision: OperationTerminationDecision;
  reviewPayloadSha256: string;
  rejectionReason?: string;
}

export interface CancelOperationTerminationInput {
  clientCancellationId: string;
  expectedPayloadSha256: string;
  cancellationPayloadSha256: string;
  reason: string;
}

export interface OperationTerminationMutationResult {
  request: OperationTerminationRequest;
  dossier: OperationTerminationDossier | null;
  created?: boolean;
  reviewed?: boolean;
  approved?: boolean;
  cancelled?: boolean;
  expired?: boolean;
  noOp: boolean;
  profile?: OperationTerminationContext["profile"];
}

const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function canonicalIso(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("La solicitud contiene una fecha inválida.");
  }
  return parsed.toISOString();
}

/** Debe permanecer byte por byte alineado con Nest. */
export function canonicalOperationTerminationPayload(
  input: OperationTerminationHashInput,
): string {
  return JSON.stringify({
    clientRequestId: input.clientRequestId.toLowerCase(),
    expectedProfileUpdatedAt: canonicalIso(input.expectedProfileUpdatedAt),
    cause: input.cause,
    otherCause: input.otherCause?.trim() || null,
    effectiveAt: canonicalIso(input.effectiveAt),
    explanation: input.explanation.trim(),
    authorityName: input.authorityName.trim(),
    officialActType: input.officialActType.trim(),
    officialActReference: input.officialActReference.trim(),
    officialActIssuedAt: canonicalIso(input.officialActIssuedAt),
    evidenceReference: input.evidenceReference.trim(),
    evidenceSha256: input.evidenceSha256.toLowerCase(),
    consequencesAcknowledged: input.consequencesAcknowledged,
  });
}

export function computeOperationTerminationPayloadSha256(
  input: OperationTerminationHashInput,
): Promise<string> {
  return sha256Hex(canonicalOperationTerminationPayload(input));
}

export function canonicalOperationTerminationReviewPayload(
  requestId: string,
  input: Omit<ReviewOperationTerminationInput, "reviewPayloadSha256">,
): string {
  return JSON.stringify({
    requestId,
    clientReviewId: input.clientReviewId.toLowerCase(),
    expectedPayloadSha256: input.expectedPayloadSha256,
    decision: input.decision,
    rejectionReason: input.rejectionReason?.trim() || null,
  });
}

export function computeOperationTerminationReviewSha256(
  requestId: string,
  input: Omit<ReviewOperationTerminationInput, "reviewPayloadSha256">,
): Promise<string> {
  return sha256Hex(
    canonicalOperationTerminationReviewPayload(requestId, input),
  );
}

export function canonicalOperationTerminationCancellationPayload(
  requestId: string,
  input: Omit<CancelOperationTerminationInput, "cancellationPayloadSha256">,
): string {
  return JSON.stringify({
    requestId,
    clientCancellationId: input.clientCancellationId.toLowerCase(),
    expectedPayloadSha256: input.expectedPayloadSha256,
    reason: input.reason.trim(),
  });
}

export function computeOperationTerminationCancellationSha256(
  requestId: string,
  input: Omit<CancelOperationTerminationInput, "cancellationPayloadSha256">,
): Promise<string> {
  return sha256Hex(
    canonicalOperationTerminationCancellationPayload(requestId, input),
  );
}

export function getOperationTermination(
  signal?: AbortSignal,
): Promise<OperationTerminationContext> {
  return apiRequest("operation-profile/termination", { signal });
}

export function requestOperationTermination(
  input: CreateOperationTerminationInput,
): Promise<OperationTerminationMutationResult> {
  return apiRequest("operation-profile/termination", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function reviewOperationTermination(
  requestId: string,
  input: ReviewOperationTerminationInput,
): Promise<OperationTerminationMutationResult> {
  return apiRequest(
    `operation-profile/termination/${encodeURIComponent(requestId)}/review`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function cancelOperationTermination(
  requestId: string,
  input: CancelOperationTerminationInput,
): Promise<OperationTerminationMutationResult> {
  return apiRequest(
    `operation-profile/termination/${encodeURIComponent(requestId)}/cancel`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
