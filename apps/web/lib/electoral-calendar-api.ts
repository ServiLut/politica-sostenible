import { apiRequest } from "./api-client";
import type {
  BackendUserRole,
  PoliticalOperationStage,
} from "@/types/saas-schema";

export const CALENDAR_CATEGORIES = [
  "REGISTRATION",
  "SIGNATURES",
  "CAMPAIGN",
  "ELECTION_PREPARATION",
  "ELECTION_DAY",
  "SCRUTINY",
  "FINANCE",
  "DATA_GOVERNANCE",
  "INTERNAL",
] as const;
export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];
export type CalendarSemantics =
  | "INFORMATIONAL"
  | "INTERNAL_TARGET"
  | "EXTERNAL_DEADLINE";
export type CalendarReleaseStatus =
  | "STAGED"
  | "VALIDATED"
  | "ACTIVE"
  | "SUPERSEDED";
export type CalendarResultOutcome =
  | "COMPLETED"
  | "NOT_APPLICABLE"
  | "MISSED"
  | "CANCELLED";
export type CalendarReviewDecision = "APPROVE" | "REJECT";
export type CalendarCommandType =
  | "RELEASE_STAGE"
  | "RELEASE_VALIDATE"
  | "RELEASE_ACTIVATE"
  | "MILESTONE_RESULT_RECORD"
  | "MILESTONE_RESULT_REVIEW";

export interface CalendarPerson {
  id: string;
  name: string;
  role: BackendUserRole;
  isActive: boolean;
}

export interface CalendarResult {
  id: string;
  outcome: CalendarResultOutcome;
  explanation: string;
  evidencePath: string | null;
  evidenceSha256: string | null;
  recordedAt: string;
  recordedBy: CalendarPerson;
  review: {
    id: string;
    decision: CalendarReviewDecision;
    rationale: string;
    reviewedAt: string;
    reviewer: CalendarPerson;
  } | null;
}

export interface CalendarResolution {
  requiresSecondControl: boolean;
  resolved: boolean;
  status: CalendarResultOutcome | "PENDING_REVIEW" | "OPEN";
  effectiveResult: CalendarResult | null;
  pendingResult: CalendarResult | null;
}

export interface CalendarMilestone {
  id: string;
  stableKey: string;
  category: CalendarCategory;
  semantics: CalendarSemantics;
  title: string;
  applicabilityRule: string;
  originalTextSummary: string;
  localDate: string;
  localTime: string | null;
  timeZone: string;
  occursAtUtc: string | null;
  responsibleUserId: string | null;
  backupUserId: string | null;
  alertOffsetsDays: number[];
  stageGateRequired: boolean;
  resultEvidenceRequired: boolean;
  linkedTaskId: string | null;
  linkedEventId: string | null;
  responsible: CalendarPerson | null;
  backup: CalendarPerson | null;
  results: CalendarResult[];
  resolution: CalendarResolution;
  daysRemaining?: number;
}

export interface CalendarDiffPoint {
  stableKey: string;
  title: string;
  localDate: string;
  localTime: string | null;
  timeZone: string;
}

export interface CalendarRelease {
  id: string;
  basedOnReleaseId: string | null;
  electionType: string;
  electionDate: string;
  circumscriptionType: string;
  circumscriptionName: string;
  circumscriptionCode: string | null;
  roundCode: string;
  versionLabel: string;
  status: CalendarReleaseStatus;
  sourceAuthority: string;
  sourceUrl: string;
  sourceReference: string;
  sourcePublishedAt: string;
  sourceCutoffAt: string;
  sourceSha256: string;
  version: number;
  createdBy: CalendarPerson;
  validatedBy: CalendarPerson | null;
  activatedBy: CalendarPerson | null;
  validatedAt: string | null;
  activatedAt: string | null;
  supersededAt: string | null;
  milestones: CalendarMilestone[];
  diff: {
    baselineReleaseId: string | null;
    added: CalendarDiffPoint[];
    removed: CalendarDiffPoint[];
    moved: Array<{
      stableKey: string;
      title: string;
      from: CalendarDiffPoint;
      to: CalendarDiffPoint;
    }>;
    changed: Array<{ stableKey: string; title: string; note: string }>;
    hasChanges: boolean;
  };
}

export interface ElectoralCalendarOverview {
  disclaimer: string;
  evaluatedAt: string;
  readOnly: boolean;
  profile: {
    id: string;
    stage: PoliticalOperationStage;
    electionType: string;
    electionDate: string;
    circumscriptionType: string;
    circumscriptionName: string;
    circumscriptionCode: string | null;
  };
  releases: CalendarRelease[];
  operators: CalendarPerson[];
  activeSummary: {
    activeReleaseId: string | null;
    versionLabel?: string;
    sourceCutoffAt?: string;
    upcoming30Days: CalendarMilestone[];
    overdue: CalendarMilestone[];
    alertsDue: CalendarMilestone[];
    potentialAssignmentConflicts: Array<{
      responsible: CalendarPerson;
      localDate: string;
      milestoneIds: string[];
      note: string;
    }>;
    unresolvedRequiredGates: CalendarMilestone[];
    notificationDeliveryClaimed?: false;
  };
}

export interface CalendarMilestoneInput {
  stableKey: string;
  category: CalendarCategory;
  semantics: CalendarSemantics;
  title: string;
  applicabilityRule: string;
  originalTextSummary: string;
  localDate: string;
  localTime?: string;
  timeZone: string;
  responsibleUserId?: string;
  backupUserId?: string;
  alertOffsetsDays: number[];
  stageGateRequired: boolean;
  resultEvidenceRequired: boolean;
  linkedTaskId?: string;
  linkedEventId?: string;
}

type CommandIdentity = { clientRequestId: string };
export type CreateCalendarReleaseInput = CommandIdentity & {
  basedOnReleaseId?: string;
  roundCode: string;
  versionLabel: string;
  sourceAuthority: string;
  sourceUrl: string;
  sourceReference: string;
  sourcePublishedAt: string;
  sourceCutoffAt: string;
  sourceSha256: string;
  milestones: CalendarMilestoneInput[];
};
export type ValidateCalendarReleaseInput = CommandIdentity & {
  expectedVersion: number;
  sourceReviewedAcknowledged: boolean;
  rationale: string;
};
export type ActivateCalendarReleaseInput = CommandIdentity & {
  expectedVersion: number;
  sourceReviewedAcknowledged: boolean;
  diffReviewedAcknowledged: boolean;
  affectedTasksResolvedAcknowledged: boolean;
  rationale: string;
};
export type RecordCalendarResultInput = CommandIdentity & {
  outcome: CalendarResultOutcome;
  explanation: string;
  evidenceStoragePath?: string;
  evidenceSha256?: string;
};
export type ReviewCalendarResultInput = CommandIdentity & {
  decision: CalendarReviewDecision;
  rationale: string;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, nested]) => key !== "payloadSha256" && nested !== undefined,
        )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalCalendarCommandPayload(
  type: CalendarCommandType,
  input: object,
) {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export async function computeCalendarCommandSha256(
  type: CalendarCommandType,
  input: object,
) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalCalendarCommandPayload(type, input)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function normalize<T>(value: T): T {
  if (Array.isArray(value)) return value.map(normalize) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .map(([key, nested]) => [
          key,
          typeof nested === "string" ? nested.trim() : normalize(nested),
        ]),
    ) as T;
  }
  return value;
}

async function postCommand<T>(
  path: string,
  type: CalendarCommandType,
  input: Record<string, unknown>,
  binding?: Record<string, unknown>,
) {
  const normalized = normalize(input);
  const payloadSha256 = await computeCalendarCommandSha256(type, {
    ...(binding ?? {}),
    ...normalized,
  });
  return apiRequest<{
    resource: T;
    command: { id: string; clientRequestId: string; payloadSha256: string };
    noOp: boolean;
  }>(path, {
    method: "POST",
    body: JSON.stringify({ ...normalized, payloadSha256 }),
  });
}

export function getElectoralCalendarOverview(signal?: AbortSignal) {
  return apiRequest<ElectoralCalendarOverview>("electoral-calendar", {
    signal,
  });
}

export function createCalendarRelease(input: CreateCalendarReleaseInput) {
  const normalized = {
    ...input,
    roundCode: input.roundCode.trim().toUpperCase(),
    milestones: input.milestones.map((milestone) => ({
      ...milestone,
      stableKey: milestone.stableKey.trim().toUpperCase(),
      alertOffsetsDays: [...milestone.alertOffsetsDays].sort(
        (left, right) => right - left,
      ),
    })),
  };
  return postCommand<CalendarRelease>(
    "electoral-calendar/releases",
    "RELEASE_STAGE",
    normalized,
  );
}

export function validateCalendarRelease(
  releaseId: string,
  input: ValidateCalendarReleaseInput,
) {
  return postCommand<CalendarRelease>(
    `electoral-calendar/releases/${releaseId}/validate`,
    "RELEASE_VALIDATE",
    input,
    { releaseId },
  );
}

export function activateCalendarRelease(
  releaseId: string,
  input: ActivateCalendarReleaseInput,
) {
  return postCommand<CalendarRelease>(
    `electoral-calendar/releases/${releaseId}/activate`,
    "RELEASE_ACTIVATE",
    input,
    { releaseId },
  );
}

export function recordCalendarResult(
  milestoneId: string,
  input: RecordCalendarResultInput,
) {
  return postCommand<CalendarResult>(
    `electoral-calendar/milestones/${milestoneId}/results`,
    "MILESTONE_RESULT_RECORD",
    input,
    { milestoneId },
  );
}

export function reviewCalendarResult(
  resultId: string,
  input: ReviewCalendarResultInput,
) {
  return postCommand<CalendarResult>(
    `electoral-calendar/results/${resultId}/review`,
    "MILESTONE_RESULT_REVIEW",
    input,
    { resultId },
  );
}

export async function sha256File(file: File) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function getCalendarEvidenceDownload(resultId: string) {
  return apiRequest<{ url: string; expiresAt: string }>("storage/download-url", {
    method: "POST",
    body: JSON.stringify({
      module: "electoral-calendar",
      resourceId: resultId,
    }),
  });
}

