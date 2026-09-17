import { apiRequest } from "@/lib/api-client";
import type {
  BackendUserRole,
  PoliticalOperationStage,
} from "@/types/saas-schema";

export const RETENTION_DATA_SCOPES = [
  "DATA_SUBJECT_RECORDS",
  "COMMUNICATION_INTERACTIONS",
  "STORED_OBJECTS",
  "FINANCIAL_RECORDS",
  "ELECTORAL_EVIDENCE",
  "AUDIT_TRAIL",
  "ALL_TENANT_RECORDS",
] as const;

export type RetentionDataScope = (typeof RETENTION_DATA_SCOPES)[number];
export type RetentionDispositionStatus =
  | "PENDING"
  | "APPROVED_NOT_EXECUTED"
  | "REJECTED"
  | "CANCELLED";
export type RetentionDispositionDecision = "APPROVE" | "REJECT";

export interface RetentionActor {
  id: string;
  role: BackendUserRole;
}

export interface RetentionExecutionCapability {
  status: "NOT_IMPLEMENTED";
  canExecute: false;
  destructiveActionsAvailable: false;
  blockers: Array<{ code: string; message: string }>;
}

export interface RetentionRecordCounts {
  voters: number | null;
  consentRecords: number | null;
  interactions: number | null;
  storedObjects: number | null;
  financialEntries: number | null;
  witnessReports: number | null;
  auditEvents: number | null;
  total: number;
}

export interface RetentionPreview {
  kind: "RETENTION_GOVERNANCE_PREVIEW";
  evaluatedAt: string;
  tenantId: string | null;
  operationProfileId: string | null;
  profileUpdatedAt: string | null;
  stage: PoliticalOperationStage | null;
  closureType: "CLOSED_NORMAL" | "CLOSED_EXCEPTIONAL" | null;
  scope: RetentionDataScope;
  cutoffAt: string;
  electionDate: string | null;
  retentionPeriodDays: number | null;
  retentionDueAt: string | null;
  counts: RetentionRecordCounts;
  applicableHolds: Array<{
    id: string;
    scope: RetentionDataScope;
    effectiveAt: string;
    payloadSha256: string;
  }>;
  previewSha256: string;
  canRequest: boolean;
  governanceBlockers: Array<{ code: string; message: string }>;
  executionCapability: RetentionExecutionCapability;
  disclaimer: string;
}

export interface RetentionDispositionRequest {
  id: string;
  operationProfileId: string;
  clientRequestId: string;
  payloadSha256: string;
  previewSha256: string;
  profileSnapshotSha256: string;
  expectedProfileUpdatedAt: string;
  status: RetentionDispositionStatus;
  scope: RetentionDataScope;
  cutoffAt: string;
  retentionDueAt: string;
  previewSnapshot: unknown;
  justification: string;
  legalReference: string;
  evidenceReference: string;
  evidenceSha256: string;
  requestedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewClientRequestId: string | null;
  reviewPayloadSha256: string | null;
  rejectionReason: string | null;
  cancelledById: string | null;
  cancelledAt: string | null;
  cancellationClientRequestId: string | null;
  cancellationPayloadSha256: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: RetentionActor;
  reviewedBy: RetentionActor | null;
  cancelledBy: RetentionActor | null;
}

export interface RetentionLegalHoldRevocation {
  id: string;
  clientRequestId: string;
  payloadSha256: string;
  reason: string;
  legalAuthority: string;
  legalReference: string;
  evidenceReference: string;
  evidenceSha256: string;
  revokedById: string;
  revokedAt: string;
  revokedBy: RetentionActor;
}

export interface RetentionLegalHold {
  id: string;
  operationProfileId: string;
  clientRequestId: string;
  payloadSha256: string;
  scope: RetentionDataScope;
  reason: string;
  legalAuthority: string;
  legalReference: string;
  evidenceReference: string;
  evidenceSha256: string;
  effectiveAt: string;
  createdById: string;
  createdAt: string;
  createdBy: RetentionActor;
  active: boolean;
  revocation: RetentionLegalHoldRevocation | null;
}

export interface RetentionGovernanceOverview {
  profile: {
    id: string;
    stage: PoliticalOperationStage;
    closureType: "CLOSED_NORMAL" | "CLOSED_EXCEPTIONAL" | null;
    electionDate: string;
    retentionPeriodDays: number;
    retentionDueAt: string;
    updatedAt: string;
  } | null;
  requests: RetentionDispositionRequest[];
  legalHolds: RetentionLegalHold[];
  executionCapability: RetentionExecutionCapability;
}

export interface CreateRetentionDispositionInput {
  clientRequestId: string;
  payloadSha256: string;
  expectedPreviewSha256: string;
  expectedProfileUpdatedAt: string;
  scope: RetentionDataScope;
  cutoffAt: string;
  justification: string;
  legalReference: string;
  evidenceReference: string;
  evidenceSha256: string;
  legalPolicyRequiredAcknowledged: true;
  backupRestoreRequiredAcknowledged: true;
  executorUnavailableAcknowledged: true;
}

export type RetentionDispositionHashInput = Omit<
  CreateRetentionDispositionInput,
  "payloadSha256"
>;

export interface ReviewRetentionDispositionInput {
  clientReviewId: string;
  expectedPayloadSha256: string;
  decision: RetentionDispositionDecision;
  reviewPayloadSha256: string;
  approvedNotExecutedAcknowledged?: true;
  rejectionReason?: string;
}

export interface CancelRetentionDispositionInput {
  clientCancellationId: string;
  expectedPayloadSha256: string;
  cancellationPayloadSha256: string;
  reason: string;
}

export interface CreateRetentionLegalHoldInput {
  clientRequestId: string;
  payloadSha256: string;
  scope: RetentionDataScope;
  reason: string;
  legalAuthority: string;
  legalReference: string;
  evidenceReference: string;
  evidenceSha256: string;
  effectiveAt: string;
}

export type RetentionLegalHoldHashInput = Omit<
  CreateRetentionLegalHoldInput,
  "payloadSha256"
>;

export interface RevokeRetentionLegalHoldInput {
  clientRequestId: string;
  expectedHoldPayloadSha256: string;
  payloadSha256: string;
  reason: string;
  legalAuthority: string;
  legalReference: string;
  evidenceReference: string;
  evidenceSha256: string;
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
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("La solicitud contiene una fecha inválida.");
  }
  return date.toISOString();
}

export function canonicalRetentionDispositionPayload(
  input: RetentionDispositionHashInput,
): string {
  return JSON.stringify({
    clientRequestId: input.clientRequestId.toLowerCase(),
    expectedPreviewSha256: input.expectedPreviewSha256.toLowerCase(),
    expectedProfileUpdatedAt: canonicalIso(input.expectedProfileUpdatedAt),
    scope: input.scope,
    cutoffAt: canonicalIso(input.cutoffAt),
    justification: input.justification.trim(),
    legalReference: input.legalReference.trim(),
    evidenceReference: input.evidenceReference.trim(),
    evidenceSha256: input.evidenceSha256.toLowerCase(),
    legalPolicyRequiredAcknowledged:
      input.legalPolicyRequiredAcknowledged,
    backupRestoreRequiredAcknowledged:
      input.backupRestoreRequiredAcknowledged,
    executorUnavailableAcknowledged: input.executorUnavailableAcknowledged,
  });
}

export function computeRetentionDispositionPayloadSha256(
  input: RetentionDispositionHashInput,
): Promise<string> {
  return sha256Hex(canonicalRetentionDispositionPayload(input));
}

export function canonicalRetentionDispositionReviewPayload(
  requestId: string,
  input: Omit<ReviewRetentionDispositionInput, "reviewPayloadSha256">,
): string {
  return JSON.stringify({
    requestId,
    clientReviewId: input.clientReviewId.toLowerCase(),
    expectedPayloadSha256: input.expectedPayloadSha256.toLowerCase(),
    decision: input.decision,
    approvedNotExecutedAcknowledged:
      input.approvedNotExecutedAcknowledged ?? false,
    rejectionReason: input.rejectionReason?.trim() || null,
  });
}

export function computeRetentionDispositionReviewSha256(
  requestId: string,
  input: Omit<ReviewRetentionDispositionInput, "reviewPayloadSha256">,
): Promise<string> {
  return sha256Hex(canonicalRetentionDispositionReviewPayload(requestId, input));
}

export function canonicalRetentionDispositionCancellationPayload(
  requestId: string,
  input: Omit<CancelRetentionDispositionInput, "cancellationPayloadSha256">,
): string {
  return JSON.stringify({
    requestId,
    clientCancellationId: input.clientCancellationId.toLowerCase(),
    expectedPayloadSha256: input.expectedPayloadSha256.toLowerCase(),
    reason: input.reason.trim(),
  });
}

export function computeRetentionDispositionCancellationSha256(
  requestId: string,
  input: Omit<CancelRetentionDispositionInput, "cancellationPayloadSha256">,
): Promise<string> {
  return sha256Hex(
    canonicalRetentionDispositionCancellationPayload(requestId, input),
  );
}

export function canonicalRetentionLegalHoldPayload(
  input: RetentionLegalHoldHashInput,
): string {
  return JSON.stringify({
    clientRequestId: input.clientRequestId.toLowerCase(),
    scope: input.scope,
    reason: input.reason.trim(),
    legalAuthority: input.legalAuthority.trim(),
    legalReference: input.legalReference.trim(),
    evidenceReference: input.evidenceReference.trim(),
    evidenceSha256: input.evidenceSha256.toLowerCase(),
    effectiveAt: canonicalIso(input.effectiveAt),
  });
}

export function computeRetentionLegalHoldPayloadSha256(
  input: RetentionLegalHoldHashInput,
): Promise<string> {
  return sha256Hex(canonicalRetentionLegalHoldPayload(input));
}

export function canonicalRetentionLegalHoldRevocationPayload(
  holdId: string,
  input: Omit<RevokeRetentionLegalHoldInput, "payloadSha256">,
): string {
  return JSON.stringify({
    holdId,
    clientRequestId: input.clientRequestId.toLowerCase(),
    expectedHoldPayloadSha256: input.expectedHoldPayloadSha256.toLowerCase(),
    reason: input.reason.trim(),
    legalAuthority: input.legalAuthority.trim(),
    legalReference: input.legalReference.trim(),
    evidenceReference: input.evidenceReference.trim(),
    evidenceSha256: input.evidenceSha256.toLowerCase(),
  });
}

export function computeRetentionLegalHoldRevocationSha256(
  holdId: string,
  input: Omit<RevokeRetentionLegalHoldInput, "payloadSha256">,
): Promise<string> {
  return sha256Hex(
    canonicalRetentionLegalHoldRevocationPayload(holdId, input),
  );
}

export function getRetentionGovernance(
  signal?: AbortSignal,
): Promise<RetentionGovernanceOverview> {
  return apiRequest("retention-governance", { signal });
}

export function previewRetention(
  scope: RetentionDataScope,
  cutoffAt: string,
  signal?: AbortSignal,
): Promise<RetentionPreview> {
  const query = new URLSearchParams({ scope, cutoffAt });
  return apiRequest(`retention-governance/preview?${query.toString()}`, {
    signal,
  });
}

export function requestRetentionDisposition(
  input: CreateRetentionDispositionInput,
): Promise<{ request: RetentionDispositionRequest; created: boolean; noOp: boolean }> {
  return apiRequest("retention-governance/dispositions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function reviewRetentionDisposition(
  requestId: string,
  input: ReviewRetentionDispositionInput,
): Promise<{
  request: RetentionDispositionRequest;
  reviewed: boolean;
  approved: boolean;
  noOp: boolean;
  executionCapability?: RetentionExecutionCapability;
}> {
  return apiRequest(
    `retention-governance/dispositions/${encodeURIComponent(requestId)}/review`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function cancelRetentionDisposition(
  requestId: string,
  input: CancelRetentionDispositionInput,
): Promise<{
  request: RetentionDispositionRequest;
  cancelled: boolean;
  noOp: boolean;
}> {
  return apiRequest(
    `retention-governance/dispositions/${encodeURIComponent(requestId)}/cancel`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function createRetentionLegalHold(
  input: CreateRetentionLegalHoldInput,
): Promise<{ legalHold: RetentionLegalHold; created: boolean; noOp: boolean }> {
  return apiRequest("retention-governance/legal-holds", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeRetentionLegalHold(
  holdId: string,
  input: RevokeRetentionLegalHoldInput,
): Promise<{ legalHold: RetentionLegalHold; revoked: boolean; noOp: boolean }> {
  return apiRequest(
    `retention-governance/legal-holds/${encodeURIComponent(holdId)}/revoke`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
