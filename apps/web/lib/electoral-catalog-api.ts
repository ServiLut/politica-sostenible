import { ApiError, apiRequest } from "@/lib/api-client";

export type ElectoralCatalogType = "ELECTORAL_RNEC" | "ADMINISTRATIVE_DANE";
export type ElectoralCatalogStatus =
  | "STAGED"
  | "VALIDATED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "REJECTED";

export type ElectoralCatalogEntryType =
  | "DEPARTMENT"
  | "MUNICIPALITY"
  | "NON_MUNICIPALIZED_AREA"
  | "ISLAND"
  | "ZONE"
  | "POLLING_PLACE";

export interface ElectoralCatalogRelease {
  id: string;
  tenantId: string;
  catalogKey: string;
  type: ElectoralCatalogType;
  status: ElectoralCatalogStatus;
  sourceUrl: string;
  sourceOrganization: string;
  sourceDataset: string;
  sourceCutoffAt: string | null;
  electionDate: string;
  contentSha256: string;
  parserVersion: string;
  authorizationReference: string | null;
  licenseDeclaration: string | null;
  sourceArtifactPath: string | null;
  recordCount: number;
  departmentCount: number;
  municipalityCount: number;
  zoneCount: number;
  pollingPlaceCount: number;
  physicalPollingPlaceCount: number | null;
  expectedTableCount: number;
  validationSummary: CatalogIntegrityReport | null;
  rejectionReason: string | null;
  createdById: string;
  validatedById: string | null;
  activatedById: string | null;
  approvedById: string | null;
  supersededByReleaseId: string | null;
  createdAt: string;
  validatedAt: string | null;
  activatedAt: string | null;
  supersededAt: string | null;
}

export interface ElectoralCatalogEntry {
  id: string;
  tenantId: string;
  releaseId: string;
  namespace: "RNEC_DIVIPOLE" | "DANE_DIVIPOLA";
  type: ElectoralCatalogEntryType;
  canonicalCode: string;
  departmentCode: string | null;
  municipalityCode: string | null;
  zoneCode: string | null;
  pollingPlaceCode: string | null;
  sourceLocationCode: string | null;
  votingDate: string | null;
  parentId: string | null;
  name: string;
  nameIsDerived: boolean;
  address: string | null;
  commune: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  timeZone: string | null;
  expectedTables: number | null;
}

export interface CatalogIntegrityReport {
  valid: boolean;
  blockingIssues: string[];
  counts: {
    records: number;
    departments: number;
    municipalities: number;
    zones: number;
    pollingPlaces: number;
    physicalPollingPlaces: number | null;
    additionalVotingDayRepresentations: number | null;
    expectedTables: number;
  };
  gaps: {
    departmentsWithoutMunicipalities: number;
    municipalitiesWithoutZones: number;
    zonesWithoutPollingPlaces: number;
    pollingPlacesWithoutCoordinates: number;
    pollingPlacesWithoutCommune: number;
    pollingPlaceRecordsWithoutAddress: number;
    physicalPollingPlacesWithoutAddress: number | null;
    physicalPollingPlacesWithoutTimeZone: number | null;
  };
}

export interface CatalogReleaseDetail {
  release: ElectoralCatalogRelease;
  entries: ElectoralCatalogEntry[];
  pagination: {
    hasMore: boolean;
    nextCursorId: string | null;
  };
}

export interface CatalogReleaseGaps {
  releaseId: string;
  contentSha256: string;
  integrity: CatalogIntegrityReport;
}

export interface CatalogReleaseDiff {
  target: {
    id: string;
    sha256: string;
    status: ElectoralCatalogStatus;
  };
  base: {
    id: string;
    sha256: string;
    status: ElectoralCatalogStatus;
  } | null;
  summary: {
    added: number;
    removed: number;
    changed: number;
  };
  sample: {
    limit: number;
    truncated: boolean;
    added: string[];
    removed: string[];
    changed: Array<{ code: string; fields: string[] }>;
  };
}

export interface CatalogReviewResult {
  release: ElectoralCatalogRelease;
  validated?: boolean;
  activated?: boolean;
  noOp: boolean;
  integrity?: CatalogIntegrityReport;
  superseded?: number;
  retiredLegacy?: number;
  retiredRnec?: number;
}

export interface ListCatalogReleasesFilters {
  type?: ElectoralCatalogType;
  status?: ElectoralCatalogStatus;
  limit?: number;
}

export function listCatalogReleases(
  filters: ListCatalogReleasesFilters = {},
  signal?: AbortSignal,
): Promise<ElectoralCatalogRelease[]> {
  const query = new URLSearchParams();
  if (filters.type) query.set("type", filters.type);
  if (filters.status) query.set("status", filters.status);
  query.set("limit", String(filters.limit ?? 50));
  return apiRequest(`electoral-catalog/releases?${query}`, { signal });
}

export function getCatalogRelease(
  releaseId: string,
  options: { entryLimit?: number; entryCursorId?: string } = {},
  signal?: AbortSignal,
): Promise<CatalogReleaseDetail> {
  const query = new URLSearchParams({
    entryLimit: String(options.entryLimit ?? 100),
  });
  if (options.entryCursorId) {
    query.set("entryCursorId", options.entryCursorId);
  }
  return apiRequest(
    `electoral-catalog/releases/${encodeURIComponent(releaseId)}?${query}`,
    { signal },
  );
}

export function getCatalogReleaseGaps(
  releaseId: string,
  signal?: AbortSignal,
): Promise<CatalogReleaseGaps> {
  return apiRequest(
    `electoral-catalog/releases/${encodeURIComponent(releaseId)}/gaps`,
    { signal },
  );
}

export function diffCatalogRelease(
  releaseId: string,
  againstReleaseId?: string,
  signal?: AbortSignal,
): Promise<CatalogReleaseDiff> {
  const query = new URLSearchParams();
  if (againstReleaseId) query.set("againstReleaseId", againstReleaseId);
  const suffix = query.size ? `?${query}` : "";
  return apiRequest(
    `electoral-catalog/releases/${encodeURIComponent(releaseId)}/diff${suffix}`,
    { signal },
  );
}

function reviewCatalogRelease(
  releaseId: string,
  action: "validate" | "activate",
  expectedContentSha256: string,
): Promise<CatalogReviewResult> {
  return apiRequest(
    `electoral-catalog/releases/${encodeURIComponent(releaseId)}/${action}`,
    {
      method: "POST",
      body: JSON.stringify({ expectedContentSha256 }),
    },
  );
}

export function validateCatalogRelease(
  releaseId: string,
  expectedContentSha256: string,
): Promise<CatalogReviewResult> {
  return reviewCatalogRelease(releaseId, "validate", expectedContentSha256);
}

export function activateCatalogRelease(
  releaseId: string,
  expectedContentSha256: string,
): Promise<CatalogReviewResult> {
  return reviewCatalogRelease(releaseId, "activate", expectedContentSha256);
}

export function catalogErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Ocurrió un error inesperado al consultar el catálogo electoral.";
  }

  const prefix =
    error.status === 0
      ? "Sin conexión."
      : error.status === 400
        ? "Solicitud inválida."
        : error.status === 403
          ? "Acceso denegado."
          : error.status === 409
            ? "El catálogo cambió o no cumple los controles."
            : error.status === 429
              ? "Demasiados intentos de revisión."
              : "No fue posible completar la operación.";
  return `${prefix} ${error.message}`;
}
