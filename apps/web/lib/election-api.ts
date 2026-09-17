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
  sourceNamespace: "RNEC_DIVIPOLE" | "DANE_DIVIPOLA" | null;
  sourceReleaseId: string | null;
  sourceLocationCode: string | null;
  votingDate: string | null;
  address: string | null;
  commune: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  timeZone: string | null;
  operationalStatus: PollingPlaceOperationalStatus;
}

export interface PollingPlaceOperationalStatus {
  code:
    | "OPEN_FOR_LOGICAL_VOTING_DATE"
    | "VOTING_DATE_NOT_DOCUMENTED"
    | "TIME_ZONE_NOT_VERIFIED"
    | "OUTSIDE_LOGICAL_VOTING_DATE";
  operationalNow: boolean;
  votingDate: string | null;
  evaluatedLocalDate: string | null;
  timeZone: string | null;
}

export interface VotingPlacePage {
  items: VotingPlace[];
  evaluatedAt: string;
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

export type WitnessCaptureContext =
  | "SIMULATION"
  | "REAL"
  | "LEGACY_UNCLASSIFIED";

export type ActiveWitnessCaptureContext = Exclude<
  WitnessCaptureContext,
  "LEGACY_UNCLASSIFIED"
>;

export type WitnessCredentialType = "E15" | "E16";
export type E14FormType = "DELEGADOS" | "CLAVEROS" | "TRANSMISION";
export type WitnessReclamationGround =
  | "VOTERS_EXCEED_AUTHORIZED"
  | "ARITHMETIC_ERROR"
  | "CANDIDATE_IDENTIFICATION_ERROR"
  | "INSUFFICIENT_JUROR_SIGNATURES"
  | "RECOUNT_REQUEST"
  | "UNAUTHORIZED_POLLING_PLACE"
  | "ELECTION_ON_UNAUTHORIZED_DATE"
  | "BALLOTS_DESTROYED_OR_LOST"
  | "OTHER_STATUTORY_GROUND";

export const WITNESS_CREDENTIAL_LABELS: Record<WitnessCredentialType, string> =
  {
    E15: "E-15 · Testigo ante mesa",
    E16: "E-16 · Testigo ante comisión escrutadora",
  };

export const E14_FORM_LABELS: Record<E14FormType, string> = {
  DELEGADOS: "E-14 Delegados",
  CLAVEROS: "E-14 Claveros",
  TRANSMISION: "E-14 Transmisión",
};

export const WITNESS_RECLAMATION_GROUND_LABELS: Record<
  WitnessReclamationGround,
  string
> = {
  VOTERS_EXCEED_AUTHORIZED: "Sufragantes exceden las personas habilitadas",
  ARITHMETIC_ERROR: "Error aritmético en el cómputo",
  CANDIDATE_IDENTIFICATION_ERROR:
    "Error inequívoco en la identificación de candidatura",
  INSUFFICIENT_JUROR_SIGNATURES: "Firmas insuficientes de jurados",
  RECOUNT_REQUEST: "Solicitud razonada de recuento",
  UNAUTHORIZED_POLLING_PLACE: "Mesa operó en lugar no autorizado",
  ELECTION_ON_UNAUTHORIZED_DATE: "Votación en fecha no autorizada",
  BALLOTS_DESTROYED_OR_LOST: "Votos destruidos o perdidos sin acta",
  OTHER_STATUTORY_GROUND:
    "Otra causal taxativa (indica norma y numeral en la descripción)",
};

export interface WitnessReport {
  id: string;
  captureContext: WitnessCaptureContext;
  witnessId: string;
  puestoId: string;
  mesa: number;
  credentialType: WitnessCredentialType | null;
  credentialReference: string | null;
  checkedInAt: string | null;
  e14FormType: E14FormType | null;
  candidateVotes: number;
  blankVotes: number | null;
  nullVotes: number | null;
  unmarkedVotes: number | null;
  totalTableVotes: number;
  hasWrittenClaim: boolean | null;
  reclamationGround: WitnessReclamationGround | null;
  reclamationDescription: string | null;
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
  captureContext: ActiveWitnessCaptureContext;
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

export const MIN_WITNESS_REPORT_MESA = 1;
export const MAX_WITNESS_REPORT_MESA = 99_999;
export const MAX_WITNESS_REPORT_VOTES = 99_999;
export const WITNESS_CHECK_IN_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const WITNESS_REPORT_MESA_FILTER_ERROR =
  "La mesa debe ser un número entero entre 1 y 99.999.";
export const WITNESS_REPORT_VOTE_RANGE_ERROR =
  "Todos los conteos deben ser números enteros entre 0 y 99.999.";
export const WITNESS_REPORT_VOTE_TOTAL_ERROR =
  "La suma de votos del candidato, en blanco, nulos y no marcados no puede superar el total de la mesa.";

export type WitnessReportMesaFilterValidation =
  | { valid: true; mesa?: number }
  | { valid: false; message: string };

export function validateWitnessReportMesaFilter(
  rawValue: string,
): WitnessReportMesaFilterValidation {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) return { valid: true };

  const mesa = Number(normalizedValue);
  if (
    !Number.isInteger(mesa) ||
    mesa < MIN_WITNESS_REPORT_MESA ||
    mesa > MAX_WITNESS_REPORT_MESA
  ) {
    return { valid: false, message: WITNESS_REPORT_MESA_FILTER_ERROR };
  }

  return { valid: true, mesa };
}

export type WitnessVoteBreakdown = {
  candidateVotes: number;
  blankVotes: number;
  nullVotes: number;
  unmarkedVotes: number;
  totalTableVotes: number;
};

export type WitnessVoteBreakdownValidation =
  | { valid: true }
  | { valid: false; message: string };

export function validateWitnessVoteBreakdown(
  breakdown: WitnessVoteBreakdown,
): WitnessVoteBreakdownValidation {
  const counts = Object.values(breakdown);
  if (
    counts.some(
      (count) =>
        !Number.isInteger(count) ||
        count < 0 ||
        count > MAX_WITNESS_REPORT_VOTES,
    )
  ) {
    return { valid: false, message: WITNESS_REPORT_VOTE_RANGE_ERROR };
  }

  const classifiedVotes =
    breakdown.candidateVotes +
    breakdown.blankVotes +
    breakdown.nullVotes +
    breakdown.unmarkedVotes;
  if (classifiedVotes > breakdown.totalTableVotes) {
    return { valid: false, message: WITNESS_REPORT_VOTE_TOTAL_ERROR };
  }

  return { valid: true };
}

export type WitnessTraceability = Pick<
  WitnessReport,
  | "credentialType"
  | "credentialReference"
  | "checkedInAt"
  | "e14FormType"
  | "candidateVotes"
  | "blankVotes"
  | "nullVotes"
  | "unmarkedVotes"
  | "totalTableVotes"
  | "hasWrittenClaim"
  | "reclamationGround"
  | "reclamationDescription"
>;

export function hasCompleteWitnessTraceability(
  report: WitnessTraceability,
  now = Date.now(),
): boolean {
  if (
    !report.credentialType ||
    !report.credentialReference?.trim() ||
    !report.checkedInAt ||
    !report.e14FormType ||
    report.blankVotes === null ||
    report.nullVotes === null ||
    report.unmarkedVotes === null ||
    report.hasWrittenClaim === null
  ) {
    return false;
  }

  const checkedInAt = new Date(report.checkedInAt).getTime();
  if (
    Number.isNaN(checkedInAt) ||
    checkedInAt > now + WITNESS_CHECK_IN_CLOCK_SKEW_MS
  ) {
    return false;
  }

  if (
    !validateWitnessVoteBreakdown({
      candidateVotes: report.candidateVotes,
      blankVotes: report.blankVotes,
      nullVotes: report.nullVotes,
      unmarkedVotes: report.unmarkedVotes,
      totalTableVotes: report.totalTableVotes,
    }).valid
  ) {
    return false;
  }

  if (!report.hasWrittenClaim) {
    return (
      report.reclamationGround === null &&
      report.reclamationDescription === null
    );
  }

  const description = report.reclamationDescription?.trim() ?? "";
  if (!report.reclamationGround || description.length < 20) return false;
  return (
    report.reclamationGround !== "OTHER_STATUTORY_GROUND" ||
    /(art(?:[íi]culo)?\.?|ley|decreto|numeral)\s+/i.test(description)
  );
}

export interface CreateWitnessReportInput {
  puestoId: string;
  mesa: number;
  credentialType: WitnessCredentialType;
  credentialReference: string;
  checkedInAt: string;
  e14FormType: E14FormType;
  candidateVotes: number;
  blankVotes: number;
  nullVotes: number;
  unmarkedVotes: number;
  totalTableVotes: number;
  hasWrittenClaim: boolean;
  reclamationGround?: WitnessReclamationGround;
  reclamationDescription?: string;
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
  if (query.mesa !== undefined) {
    const mesaValidation = validateWitnessReportMesaFilter(String(query.mesa));
    if (!mesaValidation.valid || mesaValidation.mesa === undefined) {
      throw new RangeError(WITNESS_REPORT_MESA_FILTER_ERROR);
    }
    search.set("mesa", String(mesaValidation.mesa));
  }
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
