import { ApiError } from "./api-client";
import {
  buildTerritoryHeatmapPath,
  territoryHeatmapSnapshotKey,
  validateTerritoryHeatmapResponse,
  validateTerritoryHeatmapSnapshot,
  type TerritoryHeatmapItem,
  type TerritoryHeatmapQuery,
  type TerritoryHeatmapResponse,
  type TerritoryHeatmapSnapshot,
} from "./territory-heatmap";

export interface TerritoryOverviewQuery extends TerritoryHeatmapQuery {
  search: string;
  activity: "ACTIVE" | "ALL";
  page: number;
  limit: number;
}

export interface TerritoryOverviewResponse extends TerritoryHeatmapResponse {
  pageInfo: { page: number; limit: number; totalPages: number; totalItems: number };
  summary: {
    totalTerritories: number;
    reportedTerritories: number;
    zeroTerritories: number;
    protectedTerritories: number;
    unavailableTerritories: number;
  };
}

export interface TerritoryOverviewView {
  response: TerritoryOverviewResponse;
  source: "ONLINE" | "OFFLINE";
  savedAt: string | null;
}

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO").replaceAll("/", "");
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function heatmapQuery(query: TerritoryOverviewQuery): TerritoryHeatmapQuery {
  return { level: query.level, metric: query.metric, parentId: query.parentId };
}

export function buildTerritoryOverviewPath(query: TerritoryOverviewQuery): string {
  const original = buildTerritoryHeatmapPath(heatmapQuery(query));
  if (!Number.isSafeInteger(query.page) || query.page < 1 || !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 50 || query.search.length > 80 || !["ACTIVE", "ALL"].includes(query.activity)) {
    throw new Error("La consulta de territorios no es válida.");
  }
  const params = new URLSearchParams(original.split("?")[1]);
  params.set("page", String(query.page));
  params.set("limit", String(query.limit));
  params.set("activity", query.activity);
  if (query.search.trim()) params.set("search", query.search.trim());
  return `campaigns/territory-overview?${params}`;
}

export function validateTerritoryOverview(value: unknown, query: TerritoryOverviewQuery): TerritoryOverviewResponse {
  buildTerritoryOverviewPath(query);
  if (!record(value) || !exact(value, ["generatedAt", "level", "metric", "parent", "breadcrumbs", "privacy", "items", "pageInfo", "summary"])) throw new Error("No se pudo comprobar la lista de territorios.");
  const { pageInfo, summary, ...response } = value;
  const base = validateTerritoryHeatmapResponse(response, heatmapQuery(query));
  if (!record(pageInfo) || !exact(pageInfo, ["page", "limit", "totalPages", "totalItems"]) || !Object.values(pageInfo).every(integer)
    || pageInfo.page !== query.page || pageInfo.limit !== query.limit || pageInfo.totalPages !== Math.ceil(Number(pageInfo.totalItems) / query.limit)) throw new Error("La paginación de territorios no es válida.");
  if (!record(summary) || !exact(summary, ["totalTerritories", "reportedTerritories", "zeroTerritories", "protectedTerritories", "unavailableTerritories"]) || !Object.values(summary).every(integer)) throw new Error("El resumen de territorios no es válido.");
  if (Number(summary.totalTerritories) !== Number(summary.reportedTerritories) + Number(summary.zeroTerritories) + Number(summary.protectedTerritories) + Number(summary.unavailableTerritories)
    || Number(pageInfo.totalItems) > Number(summary.totalTerritories)
    || base.items.length !== Math.max(0, Math.min(query.limit, Number(pageInfo.totalItems) - (query.page - 1) * query.limit))) throw new Error("El resumen no coincide con la página recibida.");
  return { ...base, pageInfo: pageInfo as unknown as TerritoryOverviewResponse["pageInfo"], summary: summary as unknown as TerritoryOverviewResponse["summary"] };
}

/** Paginate an already protected, validated offline snapshot for presentation.
 * Never sum hidden counts or replace the server's displayed value. */
export function presentOfflineTerritories(response: TerritoryHeatmapResponse, query: TerritoryOverviewQuery): TerritoryOverviewResponse {
  const summary = { totalTerritories: response.items.length, reportedTerritories: 0, zeroTerritories: 0, protectedTerritories: 0, unavailableTerritories: 0 };
  for (const item of response.items) {
    if (item.suppressed) summary.protectedTerritories++;
    else if (item.value === null) summary.unavailableTerritories++;
    else if (item.value === 0) summary.zeroTerritories++;
    else summary.reportedTerritories++;
  }
  const isActive = (item: TerritoryHeatmapItem) => item.suppressed || (item.value !== null && (query.metric === "E14_COVERAGE" ? item.operationalContext.expectedTables > 0 : item.value > 0));
  const rank = (item: TerritoryHeatmapItem) => item.suppressed ? 1 : item.value === null ? 3 : query.metric === "TEAM_COVERAGE" ? item.value === 0 ? 0 : 2 : item.value === 0 && ["OPEN_CASES", "VOTER_ACTIVITY"].includes(query.metric) ? 2 : 0;
  const search = normalize(query.search.trim());
  const sorted = response.items.filter(item => (query.activity === "ALL" || isActive(item)) && normalize(`${item.name} ${item.code}`).includes(search)).sort((a, b) => {
    const group = rank(a) - rank(b);
    if (group) return group;
    if (!a.suppressed && !b.suppressed && a.value !== null && b.value !== null && a.value !== b.value) return ["OPEN_CASES", "VOTER_ACTIVITY"].includes(query.metric) ? b.value - a.value : a.value - b.value;
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id);
  });
  return { ...response, items: sorted.slice((query.page - 1) * query.limit, query.page * query.limit), summary, pageInfo: { page: query.page, limit: query.limit, totalItems: sorted.length, totalPages: Math.ceil(sorted.length / query.limit) } };
}

export async function resolveTerritoryOverview(query: TerritoryOverviewQuery, dependencies: {
  loadOnline(query: TerritoryOverviewQuery): Promise<unknown>;
  readOffline?: (query: TerritoryHeatmapQuery) => Promise<TerritoryHeatmapSnapshot | null>;
}): Promise<TerritoryOverviewView> {
  try {
    return { source: "ONLINE", response: validateTerritoryOverview(await dependencies.loadOnline(query), query), savedAt: null };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 0 || !dependencies.readOffline) throw error;
    const stored = await dependencies.readOffline(heatmapQuery(query));
    if (!stored) throw error;
    const snapshot = validateTerritoryHeatmapSnapshot(stored);
    if (territoryHeatmapSnapshotKey(snapshot.query) !== territoryHeatmapSnapshotKey(heatmapQuery(query))) throw error;
    return { source: "OFFLINE", response: presentOfflineTerritories(snapshot.response, query), savedAt: snapshot.savedAt };
  }
}
