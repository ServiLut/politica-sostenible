import { apiRequest } from "@/lib/api-client";
import type {
  BackendUserRole,
  PoliticalOperationStage,
} from "@/types/saas-schema";
import type {
  OperationClosureType,
  OperationTerminationCause,
} from "@/lib/operation-termination-api";

export type PoliticalOperationType =
  | "PRE_CANDIDACY"
  | "SINGLE_CANDIDACY"
  | "CORPORATION_CANDIDACY"
  | "PARTY_MOVEMENT"
  | "SIGNATURE_COMMITTEE"
  | "TERRITORIAL_TEAM";

export type ElectoralContestType =
  | "PRESIDENCY"
  | "GOVERNORSHIP"
  | "MAYORALTY"
  | "SENATE"
  | "HOUSE_OF_REPRESENTATIVES"
  | "DEPARTMENTAL_ASSEMBLY"
  | "MUNICIPAL_COUNCIL"
  | "LOCAL_ADMINISTRATIVE_BOARD"
  | "INTERNAL_ELECTION"
  | "OTHER";

export type ElectoralCircumscriptionType =
  | "NATIONAL"
  | "DEPARTMENTAL"
  | "MUNICIPAL"
  | "LOCAL"
  | "SPECIAL"
  | "INTERNAL";

export type CandidateListType = "CLOSED" | "OPEN_PREFERENTIAL";

export interface OperationProfile {
  id: string;
  tenantId: string;
  operationType: PoliticalOperationType;
  stage: PoliticalOperationStage;
  /** Etapa actual (no-op) y únicos avances autorizados por el backend. */
  allowedNextStages: PoliticalOperationStage[];
  electionType: ElectoralContestType;
  circumscriptionType: ElectoralCircumscriptionType;
  circumscriptionName: string;
  circumscriptionCode: string | null;
  listType: CandidateListType | null;
  electionDate: string;
  votingStartDate: string;
  votingEndDate: string;
  votingWindowSourceUrl: string | null;
  votingWindowReference: string | null;
  expectedTeamSize: number;
  candidateCount: number;
  dataControllerName: string;
  responsibleDataUserId: string;
  retentionPeriodDays: number;
  revocationProcedure: string;
  closureType: OperationClosureType | null;
  terminatedAt: string | null;
  terminationCause: OperationTerminationCause | null;
  terminationRequestId: string | null;
  responsibleDataUser: {
    id: string;
    name: string;
    role: BackendUserRole;
  };
  budget: {
    maxTotalBudget: number;
    maxPublicityLimit: number;
  };
  derived: {
    workspace: "ELECTION_DAY" | "SIMULATION" | "DAILY_OPERATION";
    scale: "SMALL" | "MEDIUM" | "LARGE";
    dayDEnabled: boolean;
    warRoomEnabled: boolean;
    signatureCollectionEnabled: boolean;
    candidateListEnabled: boolean;
    preferentialVoteEnabled: boolean;
    territoryScope:
      | "NATIONAL"
      | "DEPARTMENT"
      | "MUNICIPALITY"
      | "LOCALITY"
      | "SPECIAL"
      | "INTERNAL";
  };
  createdAt: string;
  updatedAt: string;
}

export type OperationProfileContext =
  | { configured: false; profile: null }
  | { configured: true; profile: OperationProfile };

export type ConfiguredOperationProfileContext = Extract<
  OperationProfileContext,
  { configured: true }
>;

export type OperationReadinessOverall = "READY" | "ATTENTION" | "BLOCKED";
export type OperationReadinessCheckStatus = "PASS" | "WARN" | "BLOCK";
export type OperationReadinessSectionKey =
  | "BEFORE_CAMPAIGN"
  | "CAMPAIGN"
  | "ELECTION_DAY"
  | "POST_ELECTION";

export interface OperationReadinessCheck {
  code: string;
  label: string;
  status: OperationReadinessCheckStatus;
  detail: string;
  href: string;
}

export interface OperationReadiness {
  stage: PoliticalOperationStage | null;
  electionDate: string | null;
  votingStartDate: string | null;
  votingEndDate: string | null;
  votingWindowSourceUrl: string | null;
  votingWindowReference: string | null;
  generatedAt: string;
  overall: OperationReadinessOverall;
  sections: Record<OperationReadinessSectionKey, OperationReadinessCheck[]>;
  closure: {
    type: OperationClosureType;
    terminatedAt: string | null;
    cause: OperationTerminationCause | null;
    complianceCertified: false;
    authorityFilingCertified: false;
  } | null;
}

export interface UpsertOperationProfileInput {
  operationType: PoliticalOperationType;
  stage: PoliticalOperationStage;
  electionType: ElectoralContestType;
  circumscriptionType: ElectoralCircumscriptionType;
  circumscriptionName: string;
  circumscriptionCode?: string;
  listType?: CandidateListType;
  electionDate: string;
  votingStartDate: string;
  votingEndDate: string;
  votingWindowSourceUrl?: string;
  votingWindowReference?: string;
  expectedTeamSize: number;
  candidateCount: number;
  maxTotalBudget: number;
  maxPublicityLimit: number;
  dataControllerName: string;
  responsibleDataUserId: string;
  retentionPeriodDays: number;
  revocationProcedure: string;
  expectedUpdatedAt?: string;
}

export const ADOPTABLE_OPERATION_STAGES = [
  "SIGNATURE_COLLECTION",
  "CAMPAIGN",
  "ELECTION_PREPARATION",
  "SIMULATION",
  "ELECTION_DAY",
  "POST_ELECTION",
] as const satisfies readonly PoliticalOperationStage[];

export type AdoptableOperationStage =
  (typeof ADOPTABLE_OPERATION_STAGES)[number];
export type OperationAdoptionStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";
export type OperationAdoptionDecision = "APPROVE" | "REJECT";

export interface OperationAdoptionActor {
  id: string;
  name: string;
  role: BackendUserRole;
}

export interface OperationStageAdoptionRequest {
  id: string;
  tenantId: string;
  clientRequestId: string;
  payloadSha256: string;
  status: OperationAdoptionStatus;
  operationType: PoliticalOperationType;
  targetStage: AdoptableOperationStage;
  electionType: ElectoralContestType;
  circumscriptionType: ElectoralCircumscriptionType;
  circumscriptionName: string;
  circumscriptionCode: string | null;
  listType: CandidateListType | null;
  electionDate: string;
  votingStartDate: string;
  votingEndDate: string;
  votingWindowSourceUrl: string | null;
  votingWindowReference: string | null;
  expectedTeamSize: number;
  candidateCount: number;
  maxTotalBudget: number;
  maxPublicityLimit: number;
  dataControllerName: string;
  responsibleDataUserId: string;
  retentionPeriodDays: number;
  revocationProcedure: string;
  effectiveAt: string;
  justification: string;
  evidenceReference: string;
  evidenceSha256: string;
  incompleteHistoryAcknowledged: boolean;
  expiresAt: string;
  expiredAt: string | null;
  requestedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewClientRequestId: string | null;
  reviewPayloadSha256: string | null;
  rejectionReason: string | null;
  operationProfileId: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: OperationAdoptionActor;
  reviewedBy: OperationAdoptionActor | null;
  responsibleDataUser: OperationAdoptionActor;
}

export interface OperationAdoptionContext {
  configured: boolean;
  profile: { id: string; stage: PoliticalOperationStage } | null;
  request: OperationStageAdoptionRequest | null;
}

export interface CreateOperationStageAdoptionInput extends Omit<
  UpsertOperationProfileInput,
  "stage" | "expectedUpdatedAt"
> {
  clientRequestId: string;
  payloadSha256: string;
  targetStage: AdoptableOperationStage;
  effectiveAt: string;
  justification: string;
  evidenceReference: string;
  evidenceSha256: string;
  incompleteHistoryAcknowledged: true;
}

export type OperationAdoptionHashInput = Omit<
  CreateOperationStageAdoptionInput,
  "payloadSha256"
>;

export interface ReviewOperationStageAdoptionInput {
  clientReviewId: string;
  expectedPayloadSha256: string;
  decision: OperationAdoptionDecision;
  reviewPayloadSha256: string;
  rejectionReason?: string;
}

export interface OperationAdoptionMutationResult {
  request: OperationStageAdoptionRequest;
  created?: boolean;
  reviewed?: boolean;
  approved?: boolean;
  expired?: boolean;
  noOp: boolean;
  profile?: { id: string; tenantId: string; stage: PoliticalOperationStage };
}

const textEncoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function canonicalIsoDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("La solicitud contiene una fecha inválida.");
  }
  return date.toISOString();
}

function canonicalCivilDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error('La solicitud contiene una fecha civil invalida.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('La solicitud contiene una fecha civil inexistente.');
  }
  return value;
}

/** Debe permanecer byte por byte alineado con Nest. */
export function canonicalOperationAdoptionPayload(
  input: OperationAdoptionHashInput,
): string {
  return JSON.stringify({
    clientRequestId: input.clientRequestId.toLowerCase(),
    operationType: input.operationType,
    targetStage: input.targetStage,
    electionType: input.electionType,
    circumscriptionType: input.circumscriptionType,
    circumscriptionName: input.circumscriptionName.trim(),
    circumscriptionCode: input.circumscriptionCode?.trim() || null,
    listType: input.listType ?? null,
    electionDate: canonicalIsoDate(input.electionDate),
    votingStartDate: canonicalCivilDate(input.votingStartDate),
    votingEndDate: canonicalCivilDate(input.votingEndDate),
    votingWindowSourceUrl: input.votingWindowSourceUrl?.trim() || null,
    votingWindowReference: input.votingWindowReference?.trim() || null,
    expectedTeamSize: input.expectedTeamSize,
    candidateCount: input.candidateCount,
    maxTotalBudget: String(input.maxTotalBudget),
    maxPublicityLimit: String(input.maxPublicityLimit),
    dataControllerName: input.dataControllerName.trim(),
    responsibleDataUserId: input.responsibleDataUserId.trim(),
    retentionPeriodDays: input.retentionPeriodDays,
    revocationProcedure: input.revocationProcedure.trim(),
    effectiveAt: canonicalIsoDate(input.effectiveAt),
    justification: input.justification.trim(),
    evidenceReference: input.evidenceReference.trim(),
    evidenceSha256: input.evidenceSha256,
    incompleteHistoryAcknowledged: input.incompleteHistoryAcknowledged,
  });
}

export function computeOperationAdoptionPayloadSha256(
  input: OperationAdoptionHashInput,
): Promise<string> {
  return sha256Hex(canonicalOperationAdoptionPayload(input));
}

export function canonicalOperationAdoptionReviewPayload(
  requestId: string,
  input: Omit<ReviewOperationStageAdoptionInput, "reviewPayloadSha256">,
): string {
  return JSON.stringify({
    requestId,
    clientReviewId: input.clientReviewId.toLowerCase(),
    expectedPayloadSha256: input.expectedPayloadSha256,
    decision: input.decision,
    rejectionReason: input.rejectionReason?.trim() || null,
  });
}

export function computeOperationAdoptionReviewSha256(
  requestId: string,
  input: Omit<ReviewOperationStageAdoptionInput, "reviewPayloadSha256">,
): Promise<string> {
  return sha256Hex(canonicalOperationAdoptionReviewPayload(requestId, input));
}

export function getOperationProfile(
  signal?: AbortSignal,
): Promise<OperationProfileContext> {
  return apiRequest("operation-profile", { signal });
}

export function getOperationReadiness(
  signal?: AbortSignal,
): Promise<OperationReadiness> {
  return apiRequest("operation-profile/readiness", { signal });
}

export function saveOperationProfile(
  input: UpsertOperationProfileInput,
): Promise<ConfiguredOperationProfileContext> {
  return apiRequest("operation-profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getOperationAdoption(
  signal?: AbortSignal,
): Promise<OperationAdoptionContext> {
  return apiRequest("operation-profile/adoption", { signal });
}

export function requestOperationAdoption(
  input: CreateOperationStageAdoptionInput,
): Promise<OperationAdoptionMutationResult> {
  return apiRequest("operation-profile/adoption", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function reviewOperationAdoption(
  requestId: string,
  input: ReviewOperationStageAdoptionInput,
): Promise<OperationAdoptionMutationResult> {
  return apiRequest(
    `operation-profile/adoption/${encodeURIComponent(requestId)}/review`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
