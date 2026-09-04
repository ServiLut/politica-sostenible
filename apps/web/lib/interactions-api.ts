import { apiRequest } from "./api-client";
import type { CommunicationChannel } from "./cases-api";
import type { ConsentNotice } from "./consent-notices-api";

export type InteractionDirection = "INBOUND" | "OUTBOUND" | "INTERNAL";
export type InteractionSentiment =
  | "POSITIVE"
  | "NEUTRAL"
  | "NEGATIVE"
  | "MIXED"
  | "UNKNOWN";

export interface InteractionActor {
  name: string;
  role: string;
}

export interface Interaction {
  id: string;
  channel: CommunicationChannel;
  direction: InteractionDirection;
  summary: string;
  outcome: string | null;
  sentiment: InteractionSentiment | null;
  occurredAt: string;
  createdAt: string;
  actor: InteractionActor | null;
}

export type ConsentStatus = "GRANTED" | "REVOKED" | "EXPIRED" | "DENIED";
export type ConsentPurpose = "POLITICAL_COMMUNICATION" | "SERVICE_FOLLOW_UP";
export type ConsentSubjectType = "VOTER" | "CITIZEN" | "OTHER";
export type ConsentCollectionChannel =
  | "WEB_FORM"
  | "PAPER"
  | "PHONE"
  | "IN_PERSON"
  | "IMPORT";
export type CapturableConsentCollectionChannel = Exclude<
  ConsentCollectionChannel,
  "IMPORT"
>;

export interface CaseConsentStatus {
  issueCaseId: string;
  purpose: ConsentPurpose;
  subjectType: ConsentSubjectType;
  status: ConsentStatus | null;
  active: boolean;
  requiresReconsent: boolean;
  currentNotice: ConsentNotice | null;
  consentRecordId: string | null;
  collectionChannel: ConsentCollectionChannel | null;
  noticeVersion: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  recordedAt: string | null;
}

export interface InteractionPage {
  items: Interaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListInteractionsParams {
  issueCaseId?: string;
  voterId?: string;
  page?: number;
  limit?: number;
}

export interface CreateInteractionInput {
  issueCaseId?: string;
  voterId?: string;
  externalContactRef?: string;
  channel: CommunicationChannel;
  direction: InteractionDirection;
  summary: string;
  outcome?: string;
  sentiment?: InteractionSentiment;
  occurredAt?: string;
}

export interface GrantCaseConsentInput {
  issueCaseId: string;
  collectionChannel: CapturableConsentCollectionChannel;
  noticeVersion: string;
}

export interface RevokeCaseConsentInput {
  issueCaseId: string;
  reason: string;
}

function withQuery(path: string, params: ListInteractionsParams): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function listInteractions(
  params: ListInteractionsParams,
  signal?: AbortSignal,
): Promise<InteractionPage> {
  return apiRequest(withQuery("interactions", params), { signal });
}

export function createInteraction(
  input: CreateInteractionInput,
): Promise<Interaction> {
  return apiRequest("interactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCaseConsentStatus(
  issueCaseId: string,
  signal?: AbortSignal,
): Promise<CaseConsentStatus> {
  return apiRequest(
    withQuery("interactions/consents/status", { issueCaseId }),
    { signal },
  );
}

export function grantCaseConsent(
  input: GrantCaseConsentInput,
): Promise<CaseConsentStatus> {
  return apiRequest("interactions/consents/grants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeCaseConsent(
  input: RevokeCaseConsentInput,
): Promise<CaseConsentStatus> {
  return apiRequest("interactions/consents/revocations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
