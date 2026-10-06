import { expect, test } from "@playwright/test";
import { ApiError } from "./api-client";
import { buildTerritoryOverviewPath, presentOfflineTerritories, resolveTerritoryOverview, validateTerritoryOverview, type TerritoryOverviewQuery } from "./territory-overview";
import type { TerritoryHeatmapItem, TerritoryHeatmapResponse, TerritoryHeatmapSnapshot } from "./territory-heatmap";

const query: TerritoryOverviewQuery = { level: "DEPARTAMENTO", metric: "OPEN_CASES", parentId: null, page: 1, limit: 2, activity: "ACTIVE", search: "" };
const item = (id: string, value: number | null, fields: Partial<TerritoryHeatmapItem> = {}): TerritoryHeatmapItem => ({
  id, code: id, name: id, type: "DEPARTAMENTO", parentId: null, hasChildren: false, nextLevel: null,
  value, displayValue: value === null ? "Sin datos" : String(value), suppressed: false, intensity: 0, bucket: 0,
  operationalContext: { expectedTables: 0, acceptedTables: 0 },
  geo: { latitude: null, longitude: null, basis: null, locatedPollingPlaces: 0, totalPollingPlaces: 0 }, ...fields,
});
const source: TerritoryHeatmapResponse = {
  generatedAt: "2026-10-06T14:00:00.000Z", level: "DEPARTAMENTO", metric: { code: "OPEN_CASES", label: "Casos abiertos", unit: "COUNT" },
  parent: null, breadcrumbs: [], privacy: { minimumReportableCount: 3, rule: "Conteos pequeños reservados." },
  items: [item("Cero", 0), item("Protegido", null, { suppressed: true, displayValue: "Menos de 3" }), item("Visible", 7), item("Desconocido", null)],
};

test("consulta acotada sin enviar tenant ni datos personales", () => {
  const url = buildTerritoryOverviewPath({ ...query, search: "Antioquia" });
  expect(url).toBe("campaigns/territory-overview?level=DEPARTAMENTO&metric=OPEN_CASES&page=1&limit=2&activity=ACTIVE&search=Antioquia");
  for (const invalid of [{ page: 0 }, { page: 1.1 }, { limit: 51 }, { search: "a".repeat(81) }]) expect(() => buildTerritoryOverviewPath({ ...query, ...invalid })).toThrow();
});

test("la vista inicial conserva reserva y oculta ceros sin atribuirles actividad", () => {
  const result = presentOfflineTerritories(source, query);
  expect(result.items.map(row => row.id)).toEqual(["Visible", "Protegido"]);
  expect(result.items[1].value).toBeNull();
  expect(result.summary).toEqual({ totalTerritories: 4, reportedTerritories: 1, zeroTerritories: 1, protectedTerritories: 1, unavailableTerritories: 1 });
  expect(validateTerritoryOverview(result, query)).toEqual(result);
});

test("buscar no cambia resumen de la región y acepta tildes y código DIVIPOLA", () => {
  const response = { ...source, items: [item("Medellin", 7, { name: "Medellín", code: "05/001" }), item("Otro", 4)] };
  for (const search of ["medellin", "05001"]) {
    const result = presentOfflineTerritories(response, { ...query, search });
    expect(result.items.map(row => row.id)).toEqual(["Medellin"]);
    expect(result.summary.totalTerritories).toBe(2);
    expect(result.pageInfo.totalItems).toBe(1);
  }
});

test("paginar no duplica ni esconde los ceros solicitados", () => {
  const first = presentOfflineTerritories(source, { ...query, activity: "ALL" });
  const second = presentOfflineTerritories(source, { ...query, activity: "ALL", page: 2 });
  expect([...first.items, ...second.items].map(row => row.id)).toEqual(["Visible", "Protegido", "Cero", "Desconocido"]);
  expect(first.pageInfo.totalPages).toBe(2);
  expect(source.items[0].id).toBe("Cero");
});

test("equipo prioriza lugares sin equipo y no ordena por conteos reservados", () => {
  const result = presentOfflineTerritories(source, { ...query, metric: "TEAM_COVERAGE", activity: "ALL", limit: 20 });
  expect(result.items.map(row => row.id)).toEqual(["Cero", "Protegido", "Visible", "Desconocido"]);
});

test("actas con cero y mesas configuradas sí aparecen como pendientes", () => {
  const response = { ...source, items: [item("Sin mesas", null), item("Pendiente", 0, { displayValue: "0 %", operationalContext: { expectedTables: 4, acceptedTables: 0 } }), item("Completo", 100, { displayValue: "100 %", operationalContext: { expectedTables: 4, acceptedTables: 4 } })] };
  expect(presentOfflineTerritories(response, { ...query, metric: "E14_COVERAGE" }).items.map(row => row.id)).toEqual(["Pendiente", "Completo"]);
});

test("página vacía válida tiene cero páginas, sin fabricar un resultado", () => {
  const empty = presentOfflineTerritories({ ...source, items: [] }, query);
  expect(empty.pageInfo).toEqual({ page: 1, limit: 2, totalItems: 0, totalPages: 0 });
  expect(validateTerritoryOverview(empty, query).items).toEqual([]);
});

test("rechaza paginación inconsistente o resumen con datos inesperados", () => {
  const response = presentOfflineTerritories(source, query);
  for (const invalid of [
    { ...response, pageInfo: { ...response.pageInfo, totalItems: 5 } },
    { ...response, pageInfo: { ...response.pageInfo, page: 2 } },
    { ...response, summary: { ...response.summary, protectedTerritories: 9 } },
    { ...response, summary: { ...response.summary, responsiblePhone: "no permitido" } },
  ]) expect(() => validateTerritoryOverview(invalid, query)).toThrow();
});

test("copia offline sólo tras fallo de red y para la región exacta", async () => {
  const snapshot: TerritoryHeatmapSnapshot = { schemaVersion: 1, savedAt: source.generatedAt, query: { level: query.level, metric: query.metric, parentId: null }, response: source };
  const offline = await resolveTerritoryOverview(query, { loadOnline: async () => { throw new ApiError("Sin red", 0); }, readOffline: async () => snapshot });
  expect(offline.source).toBe("OFFLINE");
  expect(offline.response.items).toHaveLength(2);
  let reads = 0;
  for (const status of [401, 403, 500]) await expect(resolveTerritoryOverview(query, { loadOnline: async () => { throw new ApiError("Rechazado", status); }, readOffline: async () => { reads++; return snapshot; } })).rejects.toBeInstanceOf(ApiError);
  expect(reads).toBe(0);
});

test("una respuesta inválida no se maquilla con una copia anterior", async () => {
  let reads = 0;
  await expect(resolveTerritoryOverview(query, { loadOnline: async () => ({ invalid: true }), readOffline: async () => { reads++; return null; } })).rejects.toThrow();
  expect(reads).toBe(0);
});
