import { apiRequest } from "./api-client";

/** A choice comes from the authenticated campaign catalogue, never free text. */
export interface IncidentMunicipality {
  id: string;
  name: string;
  code?: string;
  parent?: { id: string; name: string; code: string } | null;
}

export interface IncidentMunicipalityPage {
  items: IncidentMunicipality[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function listIncidentMunicipalities(
  search: string,
  page: number,
  signal: AbortSignal,
): Promise<IncidentMunicipalityPage> {
  const query = new URLSearchParams({
    type: "MUNICIPIO",
    page: String(page),
    limit: "25",
  });
  if (search.trim()) query.set("search", search.trim().slice(0, 100));
  return apiRequest(`campaigns/divisions?${query}`, { signal });
}

export function municipalityLabel(municipality: IncidentMunicipality) {
  return [municipality.name, municipality.parent?.name, municipality.code]
    .filter(Boolean)
    .join(" · ");
}

export interface MunicipalityQuery {
  search: string;
  page: number;
  revision: number;
}

export function municipalityQueryReducer(
  query: MunicipalityQuery,
  action:
    | { type: "search"; value: string }
    | { type: "page"; value: number }
    | { type: "retry" },
): MunicipalityQuery {
  if (action.type === "search")
    return { ...query, search: action.value.slice(0, 100), page: 1 };
  if (action.type === "retry")
    return { ...query, revision: query.revision + 1 };
  if (!Number.isSafeInteger(action.value) || action.value < 1) return query;
  return { ...query, page: action.value };
}
