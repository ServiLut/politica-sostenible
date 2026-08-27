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
  mesa?: number;
  consentAccepted: true;
  termsVersion: string;
}

export interface ConsentRevocationResult {
  voterId: string;
  consentAccepted: false;
  status: "REVOKED";
  revokedAt: string;
}

function voterListPath(page: number, limit: number, search?: string) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search) query.set("search", search);
  return `voters?${query.toString()}`;
}

export function listVoters(
  page: number,
  limit: number,
  search?: string,
  signal?: AbortSignal,
): Promise<VoterPage> {
  return apiRequest(voterListPath(page, limit, search), { signal });
}

export function createVoter(input: CreateVoterInput): Promise<{ id: string }> {
  return apiRequest("voters", {
    method: "POST",
    body: JSON.stringify(input),
  });
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
