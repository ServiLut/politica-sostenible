import { apiRequest } from "./api-client";

export type ScrutinyEvidenceState =
  | "INTERNAL"
  | "FILED"
  | "DECIDED"
  | "OFFICIAL";
export type ScrutinyDocumentReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ScrutinyCommandName =
  | "COMMISSION_CREATE"
  | "REQUIREMENT_CONFIGURE"
  | "SESSION_EVENT_RECORD"
  | "COVERAGE_CREATE"
  | "DOCUMENT_CREATE"
  | "DOCUMENT_REVIEW"
  | "CUSTODY_EVENT_RECORD"
  | "DISCREPANCY_CREATE"
  | "DISCREPANCY_RESOLVE"
  | "ACTION_CREATE"
  | "ACTION_VERSION_ADD"
  | "ACTION_APPROVE"
  | "ACTION_FILE"
  | "DECISION_RECORD"
  | "DECISION_REVIEW"
  | "DECLARATION_CREATE"
  | "DECLARATION_REVIEW";

export const SCRUTINY_EVIDENCE_LABELS: Record<ScrutinyEvidenceState, string> = {
  INTERNAL: "Interno · no oficial",
  FILED: "Radicado externamente",
  DECIDED: "Decidido externamente",
  OFFICIAL: "Oficial documentado",
};

export const SCRUTINY_DOCUMENT_TYPES = [
  "E14_CLAVEROS",
  "E16_CREDENTIAL",
  "E23",
  "E24",
  "E25",
  "E26",
  "GENERAL_ACT",
  "RESOLUTION",
  "APPEAL",
  "NOTICE",
  "DECLARATION_CREDENTIAL",
  "OTHER",
] as const;
export type ScrutinyDocumentType = (typeof SCRUTINY_DOCUMENT_TYPES)[number];

export interface ScrutinyRequirement {
  id: string;
  documentType: ScrutinyDocumentType;
  applicability: "PENDING" | "REQUIRED" | "NOT_APPLICABLE";
  rationale: string;
  version: number;
}

export interface ScrutinyCoverage {
  id: string;
  witnessId: string;
  credentialDocumentId: string;
  credentialReference: string;
  validFrom: string;
  validUntil: string;
  shiftStartsAt: string;
  shiftEndsAt: string;
  status: "PLANNED" | "CONFIRMED" | "CANCELLED";
  witness?: { id: string; name: string; isActive: boolean };
}

export interface ScrutinyCommission {
  id: string;
  code: string;
  level: string;
  name: string;
  scopeCode: string;
  scopeName: string;
  venue: string;
  timeZone: string;
  scheduledStartsAt: string;
  scheduledEndsAt: string;
  status: "PLANNED" | "ACTIVE" | "SUSPENDED" | "CLOSED" | "CANCELLED";
  version: number;
  legalLeadUserId: string;
  requirements: ScrutinyRequirement[];
  coverage: ScrutinyCoverage[];
  events: Array<{
    id: string;
    type: string;
    occurredAt: string;
    notes: string;
  }>;
  temporalCoverage?: {
    complete: boolean;
    coveredMilliseconds: number;
    requiredMilliseconds: number;
    gaps: Array<{ startsAt: string; endsAt: string }>;
  };
}

export interface ScrutinyDocument {
  id: string;
  commissionId: string;
  type: ScrutinyDocumentType;
  evidenceState: ScrutinyEvidenceState;
  storagePath: string;
  sha256: string;
  size: number;
  contentType: string;
  declaredIssuer: string;
  authorityInstance: string;
  versionLabel: string;
  cutoffAt: string;
  externalReference?: string | null;
  reviewStatus: ScrutinyDocumentReviewStatus;
  reviewReason?: string | null;
  version: number;
  createdById: string;
  custodyEvents: Array<{
    id: string;
    type: string;
    occurredAt: string;
    fromCustodian?: string | null;
    toCustodian: string;
    notes: string;
  }>;
}

export interface ScrutinyDiscrepancy {
  id: string;
  commissionId: string;
  scopeReference: string;
  candidacyReference: string;
  sourceValue: number;
  comparisonValue: number;
  classification: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "UNDER_REVIEW" | "EXPLAINED" | "DISMISSED";
  responsibleUserId: string;
  dueAt: string;
  resolution?: string | null;
  version: number;
}

export interface ScrutinyDecision {
  id: string;
  actionId: string;
  outcome: string;
  authority: string;
  decidedAt: string;
  reasoning: string;
  reviewStatus: ScrutinyDocumentReviewStatus;
  recordedById: string;
  version: number;
}

export interface ScrutinyAction {
  id: string;
  commissionId: string;
  parentActionId?: string | null;
  type: "REQUEST" | "CLAIM" | "APPEAL" | "NULLITY_REQUEST";
  standingType: string;
  standingBasis: string;
  legalGroundCode: string;
  legalGroundVersion: string;
  facts: string;
  legalBasis: string;
  affectedReferences: string[];
  authority: string;
  deadlineAt: string;
  deadlineRule: string;
  timeZone: string;
  status:
    | "DRAFT"
    | "APPROVED_INTERNAL"
    | "FILED_EXTERNAL"
    | "DECIDED_EXTERNAL"
    | "APPEALED_EXTERNAL"
    | "CLOSED"
    | "WITHDRAWN";
  currentVersion: number;
  draftedById: string;
  approvedById?: string | null;
  filedById?: string | null;
  filingReference?: string | null;
  version: number;
  decision?: ScrutinyDecision | null;
  appeals: Array<{
    id: string;
    status: string;
    filingReference?: string | null;
  }>;
}

export interface ScrutinyDeclaration {
  id: string;
  commissionId?: string | null;
  scopeReference: string;
  authority: string;
  authorityReference: string;
  declaredAt: string;
  officialDocumentId: string;
  status: "DRAFT_INTERNAL" | "OFFICIAL" | "REJECTED_INTERNAL";
  reviewStatus: ScrutinyDocumentReviewStatus;
  recordedById: string;
  version: number;
  lines: Array<{
    id: string;
    optionCode: string;
    optionLabel: string;
    votes?: number | null;
    seats?: number | null;
    declaredStatus: string;
  }>;
}

export interface ScrutinyReadinessBlocker {
  code: string;
  count: number;
  detail: string;
  href: string;
}

export interface ScrutinyOverview {
  operationStage: string;
  readOnly: boolean;
  stateContract: Record<ScrutinyEvidenceState, string>;
  readiness: {
    ready: boolean;
    evaluatedAt: string;
    basis: string;
    summary: {
      commissionCount: number;
      documentCount: number;
      officialDeclarationCount: number;
      blockerCount: number;
    };
    blockers: ScrutinyReadinessBlocker[];
  };
  commissions: ScrutinyCommission[];
  documents: ScrutinyDocument[];
  discrepancies: ScrutinyDiscrepancy[];
  actions: ScrutinyAction[];
  declarations: ScrutinyDeclaration[];
  participants: Array<{ id: string; name: string; role: string }>;
}

type CommandInput = Record<string, unknown> & { clientRequestId?: string };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => key !== "payloadSha256" && entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function canonicalScrutinyCommand(
  type: ScrutinyCommandName,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export async function computeScrutinyCommandSha256(
  type: ScrutinyCommandName,
  input: object,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalScrutinyCommand(type, input));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256File(file: File): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function mutate<T>(
  path: string,
  type: ScrutinyCommandName,
  input: CommandInput,
  routeIdentity: Record<string, string> = {},
  method: "POST" | "PUT" = "POST",
): Promise<T> {
  const clientRequestId =
    input.clientRequestId ?? globalThis.crypto.randomUUID();
  const command = { ...input, clientRequestId };
  const payloadSha256 = await computeScrutinyCommandSha256(type, {
    ...command,
    ...routeIdentity,
  });
  return apiRequest<T>(path, {
    method,
    body: JSON.stringify({ ...command, payloadSha256 }),
  });
}

export function getScrutinyOverview(signal?: AbortSignal) {
  return apiRequest<ScrutinyOverview>("scrutiny?limit=200", { signal });
}

export function getScrutinyDocumentDownload(resourceId: string) {
  return apiRequest<{ url: string; expiresAt: string }>(
    "storage/download-url",
    {
      method: "POST",
      body: JSON.stringify({ module: "scrutiny", resourceId }),
    },
  );
}

export const createScrutinyCommission = (input: CommandInput) =>
  mutate<ScrutinyCommission>(
    "scrutiny/commissions",
    "COMMISSION_CREATE",
    input,
  );

export const configureScrutinyRequirement = (
  commissionId: string,
  input: CommandInput,
) =>
  mutate<ScrutinyRequirement>(
    `scrutiny/commissions/${encodeURIComponent(commissionId)}/requirements`,
    "REQUIREMENT_CONFIGURE",
    input,
    { commissionId },
    "PUT",
  );

export const recordScrutinySessionEvent = (
  commissionId: string,
  input: CommandInput,
) =>
  mutate<{
    id: string;
    type: string;
    occurredAt: string;
    notes: string;
  }>(
    `scrutiny/commissions/${encodeURIComponent(commissionId)}/events`,
    "SESSION_EVENT_RECORD",
    input,
    { commissionId },
  );

export const createScrutinyCoverage = (
  commissionId: string,
  input: CommandInput,
) =>
  mutate(
    `scrutiny/commissions/${encodeURIComponent(commissionId)}/coverage`,
    "COVERAGE_CREATE",
    input,
    { commissionId },
  );

export const createScrutinyDocument = (input: CommandInput) =>
  mutate<ScrutinyDocument>("scrutiny/documents", "DOCUMENT_CREATE", input);

export const reviewScrutinyDocument = (
  documentId: string,
  input: CommandInput,
) =>
  mutate<ScrutinyDocument>(
    `scrutiny/documents/${encodeURIComponent(documentId)}/review`,
    "DOCUMENT_REVIEW",
    input,
    { documentId },
  );

export const recordScrutinyCustody = (
  documentId: string,
  input: CommandInput,
) =>
  mutate(
    `scrutiny/documents/${encodeURIComponent(documentId)}/custody-events`,
    "CUSTODY_EVENT_RECORD",
    input,
    { documentId },
  );

export const createScrutinyDiscrepancy = (input: CommandInput) =>
  mutate<ScrutinyDiscrepancy>(
    "scrutiny/discrepancies",
    "DISCREPANCY_CREATE",
    input,
  );

export const resolveScrutinyDiscrepancy = (
  discrepancyId: string,
  input: CommandInput,
) =>
  mutate<ScrutinyDiscrepancy>(
    `scrutiny/discrepancies/${encodeURIComponent(discrepancyId)}/resolve`,
    "DISCREPANCY_RESOLVE",
    input,
    { discrepancyId },
  );

export const createScrutinyAction = (input: CommandInput) =>
  mutate<ScrutinyAction>("scrutiny/actions", "ACTION_CREATE", input);

export const addScrutinyActionVersion = (
  actionId: string,
  input: CommandInput,
) =>
  mutate(
    `scrutiny/actions/${encodeURIComponent(actionId)}/versions`,
    "ACTION_VERSION_ADD",
    input,
    { actionId },
  );

export const approveScrutinyAction = (actionId: string, input: CommandInput) =>
  mutate<ScrutinyAction>(
    `scrutiny/actions/${encodeURIComponent(actionId)}/approve`,
    "ACTION_APPROVE",
    input,
    { actionId },
  );

export const fileScrutinyAction = (actionId: string, input: CommandInput) =>
  mutate<ScrutinyAction>(
    `scrutiny/actions/${encodeURIComponent(actionId)}/file`,
    "ACTION_FILE",
    input,
    { actionId },
  );

export const recordScrutinyDecision = (actionId: string, input: CommandInput) =>
  mutate<ScrutinyDecision>(
    `scrutiny/actions/${encodeURIComponent(actionId)}/decisions`,
    "DECISION_RECORD",
    input,
    { actionId },
  );

export const reviewScrutinyDecision = (
  decisionId: string,
  input: CommandInput,
) =>
  mutate<ScrutinyDecision>(
    `scrutiny/decisions/${encodeURIComponent(decisionId)}/review`,
    "DECISION_REVIEW",
    input,
    { decisionId },
  );

export const createScrutinyDeclaration = (input: CommandInput) =>
  mutate<ScrutinyDeclaration>(
    "scrutiny/declarations",
    "DECLARATION_CREATE",
    input,
  );

export const reviewScrutinyDeclaration = (
  declarationId: string,
  input: CommandInput,
) =>
  mutate<ScrutinyDeclaration>(
    `scrutiny/declarations/${encodeURIComponent(declarationId)}/review`,
    "DECLARATION_REVIEW",
    input,
    { declarationId },
  );

export interface ScrutinyParticipantsPage {
  items: Array<{ id: string; name: string; role: string }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function listScrutinyParticipants(
  query: { search?: string; page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<ScrutinyParticipantsPage> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.page) params.set("page", query.page.toString());
  if (query.limit) params.set("limit", query.limit.toString());
  const queryString = params.toString();
  return apiRequest<ScrutinyParticipantsPage>(`/scrutiny/participants${queryString ? "?" + queryString : ""}`, { signal });
}
