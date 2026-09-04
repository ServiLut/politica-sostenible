import { apiRequest } from "@/lib/api-client";

export interface DivisionSummary {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface VotingPlace extends DivisionSummary {
  type: "PUESTO";
  parentId: string | null;
  parent: DivisionSummary | null;
  expectedTables: number | null;
}

export interface VotingPlacePage {
  items: VotingPlace[];
  pagination: Pagination;
}

export interface ListVotingPlacesQuery {
  search?: string;
  page?: number;
  limit?: number;
}

export type WitnessReportStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "SUPERSEDED";

export interface WitnessReport {
  id: string;
  witnessId: string;
  puestoId: string;
  mesa: number;
  candidateVotes: number;
  totalTableVotes: number;
  observations: string | null;
  isSynced: boolean;
  status: WitnessReportStatus;
  reviewerId: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
  puesto: {
    code: string;
    name: string;
    expectedTables: number | null;
  };
  witness: { id: string; name: string };
  reviewer: { id: string; name: string } | null;
  hasEvidence: boolean;
  divergent: boolean;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WitnessReportSummary {
  totalReports: number;
  pendingReports: number;
  acceptedReports: number;
  rejectedReports: number;
  supersededReports: number;
  pendingDivergences: number;
  acceptedCandidateVotes: number;
  acceptedTotalVotes: number;
  coverage: {
    configuredPlaces: number;
    totalPlaces: number;
    acceptedTables: number;
    expectedTables: number | null;
    percentage: number | null;
  };
}

export interface WitnessReportPage {
  items: WitnessReport[];
  pagination: Pagination;
  summary: WitnessReportSummary;
}

export interface ListWitnessReportsQuery {
  status?: WitnessReportStatus;
  puestoId?: string;
  mesa?: number;
  page?: number;
  limit?: number;
}

export interface CreateWitnessReportInput {
  puestoId: string;
  mesa: number;
  candidateVotes: number;
  totalTableVotes: number;
  observations?: string;
  e14ImageUrl: string;
}

export interface ReviewWitnessReportInput {
  status: "ACCEPTED" | "REJECTED";
  reviewReason: string;
}

export interface PollingPlaceProfile {
  id: string;
  code: string;
  name: string;
  expectedTables: number;
}

export function listVotingPlaces(
  query: ListVotingPlacesQuery = {},
  signal?: AbortSignal,
): Promise<VotingPlacePage> {
  const search = new URLSearchParams({
    type: "PUESTO",
    page: String(query.page ?? 1),
    limit: String(query.limit ?? 50),
  });
  if (query.search?.trim()) search.set("search", query.search.trim());
  return apiRequest(`campaigns/divisions?${search.toString()}`, { signal });
}

export function listWitnessReports(
  query: ListWitnessReportsQuery = {},
  signal?: AbortSignal,
): Promise<WitnessReportPage> {
  const search = new URLSearchParams();
  if (query.status) search.set("status", query.status);
  if (query.puestoId) search.set("puestoId", query.puestoId);
  if (query.mesa) search.set("mesa", String(query.mesa));
  search.set("page", String(query.page ?? 1));
  search.set("limit", String(query.limit ?? 25));

  return apiRequest(`witnesses?${search.toString()}`, { signal });
}

export function createWitnessReport(
  input: CreateWitnessReportInput,
): Promise<WitnessReport> {
  return apiRequest("witnesses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function reviewWitnessReport(
  reportId: string,
  input: ReviewWitnessReportInput,
): Promise<WitnessReport> {
  return apiRequest(`witnesses/${encodeURIComponent(reportId)}/review`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updatePollingPlaceProfile(
  puestoId: string,
  expectedTables: number,
): Promise<PollingPlaceProfile> {
  return apiRequest(
    `witnesses/places/${encodeURIComponent(puestoId)}/profile`,
    {
      method: "PUT",
      body: JSON.stringify({ expectedTables }),
    },
  );
}
