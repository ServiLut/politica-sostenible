import { apiRequest } from "./api-client";
import type { ConsentNotice } from "./consent-notices-api";
import type { CapturableConsentCollectionChannel } from "./interactions-api";

export interface VoterListItem {
  id: string;
  firstName: string;
  lastName: string;
  documentIdMasked: string;
  phoneMasked: string | null;
  mesa: number | null;
  /** Last materialized decision; retained for backwards-compatible exports. */
  consentAccepted: boolean;
  /** Effective only when the latest immutable record matches the active notice. */
  consentCurrent: boolean;
  consentRequiresReconsent: boolean;
  consentState:
    | "CURRENT"
    | "NO_RECORD"
    | "NOTICE_UNAVAILABLE"
    | "OUTDATED_NOTICE"
    | "NOT_YET_EFFECTIVE"
    | "EXPIRED"
    | "REVOKED"
    | "DENIED";
  consentRecordStatus: "GRANTED" | "REVOKED" | "EXPIRED" | "DENIED" | null;
  consentNoticeVersion: string | null;
  currentConsentNoticeVersion: string | null;
  consentTimestamp: string | null;
  createdAt: string;
  puesto: { name: string } | null;
  registrar: { name: string } | null;
}

export interface VoterPage {
  items: VoterListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateVoterInput {
  documentId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  puestoId?: string;
  mesa?: number;
  consentAccepted: true;
  termsVersion: string;
  collectionChannel: CapturableConsentCollectionChannel;
}

export interface SyncVoterInput extends CreateVoterInput {
  clientOperationId: string;
  capturedAt: string;
}

export interface SyncVoterReceipt {
  received: true;
  receiptId: string;
  clientOperationId: string;
  operationType: "VOTER_CAPTURE";
  status: "APPLIED" | "DUPLICATE";
  capturedAt: string;
  receivedAt: string;
}

export interface VoterCapturePuesto {
  id: string;
  code: string;
  name: string;
}

export interface VoterCaptureContext {
  puestos: VoterCapturePuesto[];
  consentNotice: ConsentNotice | null;
}

export interface ConsentRevocationResult {
  voterId: string;
  consentAccepted: false;
  status: "REVOKED";
  revokedAt: string;
}

export interface ConsentGrantResult {
  voterId: string;
  consentAccepted: true;
  status: "GRANTED";
  grantedAt: string;
  noticeVersion: string;
}

export interface VoterDetail {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string;
  phone: string | null;
  email: string | null;
  mesa: number | null;
  consentAccepted: boolean;
  consentCurrent: boolean;
  consentRequiresReconsent: boolean;
  consentState: VoterListItem["consentState"];
  consentRecordStatus: VoterListItem["consentRecordStatus"];
  consentNoticeVersion: string | null;
  currentConsentNoticeVersion: string | null;
  consentTimestamp: string | null;
  termsVersion: string | null;
  createdAt: string;
  updatedAt: string;
  puesto: { id: string; name: string } | null;
  registrar: { name: string } | null;
}

export interface UpdateVoterInput {
  firstName?: string;
  lastName?: string;
  documentId?: string;
  phone?: string | null;
  email?: string | null;
  mesa?: number | null;
  puestoId?: string | null;
}

export interface PortableVoter {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string;
  phone: string | null;
  email: string | null;
  mesa: number | null;
  consentAccepted: boolean;
  consentTimestamp: string | null;
  termsVersion: string | null;
  createdAt: string;
  updatedAt: string;
  puesto: { name: string } | null;
}

export interface VoterExport {
  schemaVersion: "politica-sostenible.voter-export.v1";
  exportedAt: string;
  voter: PortableVoter;
}

function voterListPath(page: number, limit: number, entityId?: string) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (entityId) query.set("entityId", entityId);
  return `voters?${query.toString()}`;
}

export function listVoters(
  page: number,
  limit: number,
  search?: string,
  signal?: AbortSignal,
  entityId?: string,
): Promise<VoterPage> {
  const normalizedSearch = search?.trim();
  if (normalizedSearch) {
    return apiRequest("voters/search", {
      method: "POST",
      body: JSON.stringify({ page, limit, search: normalizedSearch }),
      signal,
    });
  }

  return apiRequest(voterListPath(page, limit, entityId), { signal });
}

export function createVoter(
  input: CreateVoterInput,
): Promise<{ received: true }> {
  return apiRequest("voters", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function syncOfflineVoter(
  input: SyncVoterInput,
  signal?: AbortSignal,
): Promise<SyncVoterReceipt> {
  return apiRequest("logistics/sync/voter", {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
}

export function getVoterCaptureContext(
  signal?: AbortSignal,
): Promise<VoterCaptureContext> {
  return apiRequest("voters/capture-context", { signal });
}

export function revokeVoterConsent(
  voterId: string,
  reason: string,
): Promise<ConsentRevocationResult> {
  return apiRequest(`voters/${encodeURIComponent(voterId)}/consents/revoke`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function grantVoterConsent(
  voterId: string,
  input: {
    noticeVersion: string;
    collectionChannel: CapturableConsentCollectionChannel;
  },
): Promise<ConsentGrantResult> {
  return apiRequest(`voters/${encodeURIComponent(voterId)}/consents/grant`, {
    method: "POST",
    body: JSON.stringify({
      consentAccepted: true,
      termsVersion: input.noticeVersion,
      collectionChannel: input.collectionChannel,
    }),
  });
}

export function getVoter(
  voterId: string,
  signal?: AbortSignal,
): Promise<VoterDetail> {
  return apiRequest(`voters/${encodeURIComponent(voterId)}`, { signal });
}

export function updateVoter(
  voterId: string,
  input: UpdateVoterInput,
): Promise<VoterDetail> {
  return apiRequest(`voters/${encodeURIComponent(voterId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function exportVoter(voterId: string): Promise<VoterExport> {
  return apiRequest(`voters/${encodeURIComponent(voterId)}/export`, {
    headers: { Accept: "application/json" },
  });
}
