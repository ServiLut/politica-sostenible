import { ApiError } from "./api-client";

export const TERRITORY_HEATMAP_LEVELS = [
  "DEPARTAMENTO",
  "MUNICIPIO",
  "ZONA",
  "PUESTO",
] as const;

export const TERRITORY_HEATMAP_METRICS = [
  "VOTER_ACTIVITY",
  "E14_COVERAGE",
  "OPEN_CASES",
  "TEAM_COVERAGE",
] as const;

export const TERRITORY_HEATMAP_MAX_ITEMS = 500;

export type HeatmapLevel = (typeof TERRITORY_HEATMAP_LEVELS)[number];
export type HeatmapMetric = (typeof TERRITORY_HEATMAP_METRICS)[number];

export interface TerritoryHeatmapQuery {
  level: HeatmapLevel;
  metric: HeatmapMetric;
  parentId: string | null;
}

export interface TerritoryHeatmapItem {
  id: string;
  code: string;
  name: string;
  type: HeatmapLevel;
  parentId: string | null;
  hasChildren: boolean;
  nextLevel: HeatmapLevel | null;
  value: number | null;
  displayValue: string;
  suppressed: boolean;
  intensity: number;
  bucket: number;
  operationalContext: {
    expectedTables: number;
    acceptedTables: number;
  };
  geo: {
    latitude: number | null;
    longitude: number | null;
    basis: "POLLING_PLACE" | "CENTROID" | null;
    locatedPollingPlaces: number;
    totalPollingPlaces: number;
  };
  leaders?: {
    id: string;
    name: string;
    phone: string | null;
    socialNetworkUrl: string | null;
    roleDescription: string;
  }[];
}

export interface TerritoryHeatmapProjectionPoint {
  item: TerritoryHeatmapItem;
  x: number;
  y: number;
}

export interface TerritoryHeatmapProjection {
  scope: "COLOMBIA" | "RELATIVE" | "EMPTY";
  points: TerritoryHeatmapProjectionPoint[];
  missingCoordinates: number;
  excludedOutsideScope: number;
}

export interface TerritoryHeatmapResponse {
  generatedAt: string;
  level: HeatmapLevel;
  metric: {
    code: HeatmapMetric;
    label: string;
    unit: "COUNT" | "PERCENT";
  };
  parent: {
    id: string;
    code: string;
    name: string;
    type: HeatmapLevel;
  } | null;
  breadcrumbs: Array<{
    id: string;
    code: string;
    name: string;
    type: HeatmapLevel;
  }>;
  privacy: {
    minimumReportableCount: number | null;
    rule: string;
  };
  items: TerritoryHeatmapItem[];
}

export interface TerritoryHeatmapSnapshot {
  schemaVersion: 1;
  query: TerritoryHeatmapQuery;
  savedAt: string;
  response: TerritoryHeatmapResponse;
}

export type TerritoryHeatmapView =
  | {
      source: "ONLINE";
      response: TerritoryHeatmapResponse;
      savedAt: null;
    }
  | {
      source: "OFFLINE";
      response: TerritoryHeatmapResponse;
      savedAt: string;
    };

const IDENTIFIER_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function requiredText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength
  );
}

function isLevel(value: unknown): value is HeatmapLevel {
  return TERRITORY_HEATMAP_LEVELS.includes(value as HeatmapLevel);
}

function isMetric(value: unknown): value is HeatmapMetric {
  return TERRITORY_HEATMAP_METRICS.includes(value as HeatmapMetric);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isHeatmapBucket(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 5
  );
}

function isFiniteCoordinate(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validateHeatmapGeo(
  value: unknown,
  itemType: HeatmapLevel,
): TerritoryHeatmapItem["geo"] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "latitude",
      "longitude",
      "basis",
      "locatedPollingPlaces",
      "totalPollingPlaces",
    ]) ||
    !isNonNegativeInteger(value.locatedPollingPlaces) ||
    !isNonNegativeInteger(value.totalPollingPlaces) ||
    value.locatedPollingPlaces > value.totalPollingPlaces
  ) {
    throw new Error("La georreferencia territorial no supera la validación.");
  }

  const hasNoCoordinates =
    value.latitude === null &&
    value.longitude === null &&
    value.basis === null &&
    value.locatedPollingPlaces === 0;
  const hasCoordinates =
    isFiniteCoordinate(value.latitude, -90, 90) &&
    isFiniteCoordinate(value.longitude, -180, 180) &&
    ["POLLING_PLACE", "CENTROID"].includes(String(value.basis)) &&
    value.locatedPollingPlaces > 0 &&
    value.totalPollingPlaces > 0 &&
    (value.basis !== "POLLING_PLACE" ||
      (itemType === "PUESTO" &&
        value.locatedPollingPlaces === 1 &&
        value.totalPollingPlaces === 1)) &&
    (value.basis !== "CENTROID" || itemType !== "PUESTO");

  if (!hasNoCoordinates && !hasCoordinates) {
    throw new Error("La georreferencia territorial no supera la validación.");
  }

  return {
    latitude: value.latitude as number | null,
    longitude: value.longitude as number | null,
    basis: value.basis as "POLLING_PLACE" | "CENTROID" | null,
    locatedPollingPlaces: value.locatedPollingPlaces,
    totalPollingPlaces: value.totalPollingPlaces,
  };
}

function validateTerritoryReference(value: unknown) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "code", "name", "type"]) ||
    !isIdentifier(value.id) ||
    !requiredText(value.code, 128) ||
    !requiredText(value.name, 256) ||
    !isLevel(value.type)
  ) {
    throw new Error("El mapa territorial recibido no supera la validación.");
  }
  return {
    id: value.id,
    code: value.code,
    name: value.name,
    type: value.type,
  };
}

export function validateTerritoryHeatmapQuery(
  value: unknown,
): TerritoryHeatmapQuery {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["level", "metric", "parentId"]) ||
    !isLevel(value.level) ||
    !isMetric(value.metric) ||
    !(value.parentId === null || isIdentifier(value.parentId)) ||
    (value.level === "DEPARTAMENTO" && value.parentId !== null) ||
    (value.level !== "DEPARTAMENTO" && value.parentId === null)
  ) {
    throw new Error("La consulta del mapa territorial no es válida.");
  }
  return {
    level: value.level,
    metric: value.metric,
    parentId: value.parentId,
  };
}

function validateHeatmapItem(
  value: unknown,
  query: TerritoryHeatmapQuery,
): TerritoryHeatmapItem {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "code",
      "name",
      "type",
      "parentId",
      "hasChildren",
      "nextLevel",
      "value",
      "displayValue",
      "suppressed",
      "intensity",
      "bucket",
      "operationalContext",
      "geo",
      "leaders",
    ]) ||
    !isIdentifier(value.id) ||
    !requiredText(value.code, 128) ||
    !requiredText(value.name, 256) ||
    !isLevel(value.type) ||
    value.type !== query.level ||
    !(value.parentId === null || isIdentifier(value.parentId)) ||
    (query.parentId !== null && value.parentId !== query.parentId) ||
    typeof value.hasChildren !== "boolean" ||
    !(value.nextLevel === null || isLevel(value.nextLevel)) ||
    (value.hasChildren && value.nextLevel === null) ||
    (!value.hasChildren && value.nextLevel !== null) ||
    !(
      value.value === null ||
      (typeof value.value === "number" && Number.isFinite(value.value))
    ) ||
    (typeof value.value === "number" && value.value < 0) ||
    (query.metric === "E14_COVERAGE" &&
      typeof value.value === "number" &&
      value.value > 100) ||
    (query.metric !== "E14_COVERAGE" &&
      typeof value.value === "number" &&
      !Number.isSafeInteger(value.value)) ||
    !requiredText(value.displayValue, 100) ||
    typeof value.suppressed !== "boolean" ||
    (value.suppressed && value.value !== null) ||
    typeof value.intensity !== "number" ||
    !Number.isFinite(value.intensity) ||
    value.intensity < 0 ||
    value.intensity > 100 ||
    !isHeatmapBucket(value.bucket) ||
    !isRecord(value.operationalContext) ||
    !hasExactKeys(value.operationalContext, [
      "expectedTables",
      "acceptedTables",
    ]) ||
    !isNonNegativeInteger(value.operationalContext.expectedTables) ||
    !isNonNegativeInteger(value.operationalContext.acceptedTables)
  ) {
    throw new Error("El mapa territorial recibido no supera la validación.");
  }

  const geo = validateHeatmapGeo(value.geo, value.type);

  const leaders: TerritoryHeatmapItem["leaders"] = Array.isArray(value.leaders)
    ? (value.leaders as unknown[]).flatMap((leader) => {
        if (
          !isRecord(leader) ||
          typeof leader.id !== "string" ||
          typeof leader.name !== "string" ||
          typeof leader.roleDescription !== "string"
        ) {
          return [];
        }
        return [
          {
            id: leader.id,
            name: leader.name,
            phone:
              typeof leader.phone === "string" ? leader.phone : null,
            socialNetworkUrl:
              typeof leader.socialNetworkUrl === "string"
                ? leader.socialNetworkUrl
                : null,
            roleDescription: leader.roleDescription,
          },
        ];
      })
    : [];

  return {
    id: value.id,
    code: value.code,
    name: value.name,
    type: value.type,
    parentId: value.parentId,
    hasChildren: value.hasChildren,
    nextLevel: value.nextLevel,
    value: value.value,
    displayValue: value.displayValue,
    suppressed: value.suppressed,
    intensity: value.intensity,
    bucket: value.bucket,
    operationalContext: {
      expectedTables: value.operationalContext.expectedTables,
      acceptedTables: value.operationalContext.acceptedTables,
    },
    geo,
    leaders,
  };
}

const COLOMBIA_EXTENT = {
  minimumLatitude: -4.5,
  maximumLatitude: 13.8,
  minimumLongitude: -82.3,
  maximumLongitude: -66.7,
} as const;

function isInsideColombiaExtent(item: TerritoryHeatmapItem): boolean {
  const { latitude, longitude } = item.geo;
  return (
    latitude !== null &&
    longitude !== null &&
    latitude >= COLOMBIA_EXTENT.minimumLatitude &&
    latitude <= COLOMBIA_EXTENT.maximumLatitude &&
    longitude >= COLOMBIA_EXTENT.minimumLongitude &&
    longitude <= COLOMBIA_EXTENT.maximumLongitude
  );
}

function projectCoordinate(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (maximum === minimum) return 50;
  return Math.min(
    96,
    Math.max(4, ((value - minimum) / (maximum - minimum)) * 100),
  );
}

/**
 * Proyecta únicamente coordenadas oficiales disponibles. No interpola puestos
 * faltantes ni dibuja límites administrativos que el catálogo no suministra.
 */
export function projectTerritoryHeatmapItems(
  items: TerritoryHeatmapItem[],
): TerritoryHeatmapProjection {
  const located = items.filter(
    (item) => item.geo.latitude !== null && item.geo.longitude !== null,
  );
  const missingCoordinates = items.length - located.length;
  if (located.length === 0) {
    return {
      scope: "EMPTY",
      points: [],
      missingCoordinates,
      excludedOutsideScope: 0,
    };
  }

  const colombia = located.filter(isInsideColombiaExtent);
  const useColombiaExtent = colombia.length * 2 >= located.length;
  const visible = useColombiaExtent ? colombia : located;
  const latitudes = visible.map((item) => item.geo.latitude as number);
  const longitudes = visible.map((item) => item.geo.longitude as number);
  const latitudeRange = useColombiaExtent
    ? [COLOMBIA_EXTENT.minimumLatitude, COLOMBIA_EXTENT.maximumLatitude]
    : [Math.min(...latitudes), Math.max(...latitudes)];
  const longitudeRange = useColombiaExtent
    ? [COLOMBIA_EXTENT.minimumLongitude, COLOMBIA_EXTENT.maximumLongitude]
    : [Math.min(...longitudes), Math.max(...longitudes)];

  return {
    scope: useColombiaExtent ? "COLOMBIA" : "RELATIVE",
    points: visible.map((item) => ({
      item,
      x: projectCoordinate(
        item.geo.longitude as number,
        longitudeRange[0],
        longitudeRange[1],
      ),
      y:
        100 -
        projectCoordinate(
          item.geo.latitude as number,
          latitudeRange[0],
          latitudeRange[1],
        ),
    })),
    missingCoordinates,
    excludedOutsideScope: useColombiaExtent
      ? located.length - visible.length
      : 0,
  };
}

export function validateTerritoryHeatmapResponse(
  value: unknown,
  queryInput: TerritoryHeatmapQuery,
): TerritoryHeatmapResponse {
  const query = validateTerritoryHeatmapQuery(queryInput);
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "generatedAt",
      "level",
      "metric",
      "parent",
      "breadcrumbs",
      "privacy",
      "items",
    ]) ||
    !isTimestamp(value.generatedAt) ||
    value.level !== query.level ||
    !isRecord(value.metric) ||
    !hasExactKeys(value.metric, ["code", "label", "unit"]) ||
    value.metric.code !== query.metric ||
    !requiredText(value.metric.label, 128) ||
    !["COUNT", "PERCENT"].includes(String(value.metric.unit)) ||
    (query.metric === "E14_COVERAGE") !== (value.metric.unit === "PERCENT") ||
    !Array.isArray(value.breadcrumbs) ||
    value.breadcrumbs.length > TERRITORY_HEATMAP_LEVELS.length ||
    !isRecord(value.privacy) ||
    !hasExactKeys(value.privacy, ["minimumReportableCount", "rule"]) ||
    !(
      value.privacy.minimumReportableCount === null ||
      (Number.isSafeInteger(value.privacy.minimumReportableCount) &&
        Number(value.privacy.minimumReportableCount) > 0 &&
        Number(value.privacy.minimumReportableCount) <= 1_000)
    ) ||
    !requiredText(value.privacy.rule, 2_000) ||
    !Array.isArray(value.items) ||
    value.items.length > TERRITORY_HEATMAP_MAX_ITEMS
  ) {
    throw new Error("El mapa territorial recibido no supera la validación.");
  }

  const parent =
    value.parent === null ? null : validateTerritoryReference(value.parent);
  if (
    (query.parentId === null && parent !== null) ||
    (query.parentId !== null && parent?.id !== query.parentId)
  ) {
    throw new Error(
      "El mapa territorial recibido no corresponde al alcance solicitado.",
    );
  }

  const breadcrumbs = value.breadcrumbs.map(validateTerritoryReference);
  if (
    new Set(breadcrumbs.map((item) => item.id)).size !== breadcrumbs.length ||
    (parent !== null && breadcrumbs.at(-1)?.id !== parent.id) ||
    (parent === null && breadcrumbs.length !== 0)
  ) {
    throw new Error("La ruta del mapa territorial no es válida.");
  }

  const items = value.items.map((item) => validateHeatmapItem(item, query));
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("El mapa territorial contiene territorios repetidos.");
  }

  const normalized = {
    generatedAt: value.generatedAt,
    level: query.level,
    metric: {
      code: query.metric,
      label: value.metric.label,
      unit: value.metric.unit as "COUNT" | "PERCENT",
    },
    parent,
    breadcrumbs,
    privacy: {
      minimumReportableCount: value.privacy.minimumReportableCount as
        | number
        | null,
      rule: value.privacy.rule,
    },
    items,
  } satisfies TerritoryHeatmapResponse;
  return structuredClone(normalized);
}

export function validateTerritoryHeatmapSnapshot(
  value: unknown,
): TerritoryHeatmapSnapshot {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schemaVersion", "query", "savedAt", "response"]) ||
    value.schemaVersion !== 1 ||
    !isTimestamp(value.savedAt)
  ) {
    throw new Error("El snapshot territorial cifrado no es válido.");
  }
  const query = validateTerritoryHeatmapQuery(value.query);
  return {
    schemaVersion: 1,
    query,
    savedAt: value.savedAt,
    response: validateTerritoryHeatmapResponse(value.response, query),
  };
}

export function territoryHeatmapSnapshotKey(
  queryInput: TerritoryHeatmapQuery,
): string {
  const query = validateTerritoryHeatmapQuery(queryInput);
  return JSON.stringify([query.metric, query.level, query.parentId]);
}

export function buildTerritoryHeatmapPath(
  queryInput: TerritoryHeatmapQuery,
): string {
  const query = validateTerritoryHeatmapQuery(queryInput);
  const params = new URLSearchParams({
    level: query.level,
    metric: query.metric,
  });
  if (query.parentId) params.set("parentId", query.parentId);
  return `campaigns/territory-heatmap?${params}`;
}

export async function resolveTerritoryHeatmapView(
  queryInput: TerritoryHeatmapQuery,
  dependencies: {
    loadOnline(query: TerritoryHeatmapQuery): Promise<unknown>;
    readOffline?: (
      query: TerritoryHeatmapQuery,
    ) => Promise<TerritoryHeatmapSnapshot | null>;
  },
): Promise<TerritoryHeatmapView> {
  const query = validateTerritoryHeatmapQuery(queryInput);
  try {
    const online = await dependencies.loadOnline(query);
    return {
      source: "ONLINE",
      response: validateTerritoryHeatmapResponse(online, query),
      savedAt: null,
    };
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 0 ||
      !dependencies.readOffline
    ) {
      throw error;
    }
    const snapshot = await dependencies.readOffline(query);
    if (!snapshot) throw error;
    const validated = validateTerritoryHeatmapSnapshot(snapshot);
    if (
      territoryHeatmapSnapshotKey(validated.query) !==
      territoryHeatmapSnapshotKey(query)
    ) {
      throw error;
    }
    return {
      source: "OFFLINE",
      response: validated.response,
      savedAt: validated.savedAt,
    };
  }
}
