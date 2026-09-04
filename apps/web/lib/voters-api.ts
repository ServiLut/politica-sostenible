import { apiRequest } from "./api-client";

export interface VoterListItem {
  id: string;
  firstName: string;
  lastName: string;
  documentIdMasked: string;
  phoneMasked: string | null;
  mesa: number | null;
  isSignatureValid: boolean;
  consentAccepted: boolean;
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
}

export interface VoterCapturePuesto {
  id: string;
  code: string;
  name: string;
}

export interface VoterCaptureContext {
  puestos: VoterCapturePuesto[];
}

export interface ConsentRevocationResult {
  voterId: string;
  consentAccepted: false;
  status: "REVOKED";
  revokedAt: string;
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

function voterListPath(page: number, limit: number) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return `voters?${query.toString()}`;
}

export function listVoters(
  page: number,
  limit: number,
  search?: string,
  signal?: AbortSignal,
): Promise<VoterPage> {
  const normalizedSearch = search?.trim();
  if (normalizedSearch) {
    return apiRequest("voters/search", {
      method: "POST",
      body: JSON.stringify({ page, limit, search: normalizedSearch }),
      signal,
    });
  }

  return apiRequest(voterListPath(page, limit), { signal });
}

export function createVoter(
  input: CreateVoterInput,
): Promise<{ received: true }> {
  return apiRequest("voters", {
    method: "POST",
    body: JSON.stringify(input),
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
