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
}

export interface VotingPlacePage {
  items: VotingPlace[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WitnessReport {
  id: string;
  puestoId: string;
  mesa: number;
  candidateVotes: number;
  totalTableVotes: number;
  observations: string | null;
  createdAt: string;
  puesto: VotingPlace;
  witness: { name: string };
}

export interface CreateWitnessReportInput {
  puestoId: string;
  mesa: number;
  candidateVotes: number;
  totalTableVotes: number;
  observations?: string;
  e14ImageUrl: string;
}

export function listVotingPlaces(
  signal?: AbortSignal,
): Promise<VotingPlacePage> {
  return apiRequest("campaigns/divisions?type=PUESTO&limit=100", { signal });
}

export function listWitnessReports(
  signal?: AbortSignal,
): Promise<WitnessReport[]> {
  return apiRequest("witnesses", { signal });
}

export function createWitnessReport(
  input: CreateWitnessReportInput,
): Promise<WitnessReport> {
  return apiRequest("witnesses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
