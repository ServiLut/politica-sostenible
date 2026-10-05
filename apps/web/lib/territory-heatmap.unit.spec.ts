import { expect, test } from "@playwright/test";
import { ApiError } from "./api-client";
import {
  buildTerritoryHeatmapPath,
  describeTerritoryHeatmapLocation,
  hasReportableLowActivity,
  projectTerritoryHeatmapItems,
  resolveTerritoryHeatmapView,
  territoryHeatmapSnapshotKey,
  validateTerritoryHeatmapResponse,
  validateTerritoryHeatmapSnapshot,
  type TerritoryHeatmapQuery,
  type TerritoryHeatmapResponse,
  type TerritoryHeatmapSnapshot,
} from "./territory-heatmap";

const QUERY: TerritoryHeatmapQuery = {
  level: "DEPARTAMENTO",
  metric: "E14_COVERAGE",
  parentId: null,
};

const RESPONSE: TerritoryHeatmapResponse = {
  generatedAt: "2026-09-09T15:00:00.000Z",
  level: "DEPARTAMENTO",
  metric: {
    code: "E14_COVERAGE",
    label: "Cobertura E-14",
    unit: "PERCENT",
  },
  parent: null,
  breadcrumbs: [],
  privacy: {
    minimumReportableCount: null,
    rule: "La métrica no contiene conteos personales.",
  },
  items: [
    {
      id: "departamento-05",
      code: "05",
      name: "Antioquia",
      type: "DEPARTAMENTO",
      parentId: null,
      hasChildren: true,
      nextLevel: "MUNICIPIO",
      value: 65,
      displayValue: "65 %",
      suppressed: false,
      intensity: 65,
      bucket: 4,
      operationalContext: { expectedTables: 200, acceptedTables: 130 },
      geo: {
        latitude: 6.25184,
        longitude: -75.56359,
        basis: "CENTROID",
        locatedPollingPlaces: 180,
        totalPollingPlaces: 200,
      },
    },
  ],
};

const SNAPSHOT: TerritoryHeatmapSnapshot = {
  schemaVersion: 1,
  query: QUERY,
  savedAt: "2026-09-09T15:05:00.000Z",
  response: RESPONSE,
};

test("valida profundamente y devuelve una copia separada del mapa agregado", () => {
  const input = structuredClone(RESPONSE);
  const validated = validateTerritoryHeatmapResponse(input, QUERY);

  expect(validated).toEqual(RESPONSE);
  expect(validated).not.toBe(input);
  expect(validated.items[0]).not.toBe(input.items[0]);
  input.items[0].name = "Mutado";
  expect(validated.items[0].name).toBe("Antioquia");
  expect(buildTerritoryHeatmapPath(QUERY)).toBe(
    "campaigns/territory-heatmap?level=DEPARTAMENTO&metric=E14_COVERAGE",
  );
});

test("rechaza campos extra con PII o actores antes de persistir o mostrar", () => {
  const topLevelPii = { ...structuredClone(RESPONSE), voterCount: 1 };
  const itemPii = structuredClone(RESPONSE) as unknown as Record<
    string,
    unknown
  >;
  (itemPii.items as Array<Record<string, unknown>>)[0].responsibleUserName =
    "Persona no autorizada";
  const operationalPii = structuredClone(RESPONSE) as unknown as Record<
    string,
    unknown
  >;
  (
    (operationalPii.items as Array<Record<string, unknown>>)[0]
      .operationalContext as Record<string, unknown>
  ).actorId = "user-123";

  for (const candidate of [topLevelPii, itemPii, operationalPii]) {
    expect(() => validateTerritoryHeatmapResponse(candidate, QUERY)).toThrow(
      /validación/,
    );
  }
});

test("descarta los contactos de líderes de respuestas y copias offline heredadas", () => {
  const legacyResponse = {
    ...structuredClone(RESPONSE),
    items: RESPONSE.items.map((item) => ({
      ...item,
      leaders: [
        { id: "legacy-person", name: "Persona de prueba", phone: "3000000000" },
      ],
    })),
  };
  const online = validateTerritoryHeatmapResponse(legacyResponse, QUERY);
  const offline = validateTerritoryHeatmapSnapshot({
    ...SNAPSHOT,
    response: legacyResponse,
  });
  expect(online).toEqual(RESPONSE);
  expect(offline.response).toEqual(RESPONSE);
  for (const value of [online, offline]) {
    expect(JSON.stringify(value)).not.toContain("legacy-person");
    expect(JSON.stringify(value)).not.toContain("3000000000");
    expect(value).not.toHaveProperty("items.0.leaders");
  }
});

test("valida georreferencias completas y rechaza coordenadas parciales o inventadas", () => {
  const missingLongitude = structuredClone(RESPONSE);
  missingLongitude.items[0].geo.longitude = null;
  const impossibleLatitude = structuredClone(RESPONSE);
  impossibleLatitude.items[0].geo.latitude = 91;
  const impossibleCoverage = structuredClone(RESPONSE);
  impossibleCoverage.items[0].geo.locatedPollingPlaces = 201;
  const wrongBasis = structuredClone(RESPONSE);
  wrongBasis.items[0].geo.basis = "POLLING_PLACE";

  for (const candidate of [
    missingLongitude,
    impossibleLatitude,
    impossibleCoverage,
    wrongBasis,
  ]) {
    expect(() => validateTerritoryHeatmapResponse(candidate, QUERY)).toThrow(
      /georreferencia/,
    );
  }
});

test("proyecta Colombia sin mezclar el exterior y declara faltantes", () => {
  const exterior = structuredClone(RESPONSE.items[0]);
  exterior.id = "exterior";
  exterior.code = "EX";
  exterior.name = "Exterior";
  exterior.geo = {
    latitude: 40.7128,
    longitude: -74.006,
    basis: "CENTROID",
    locatedPollingPlaces: 1,
    totalPollingPlaces: 1,
  };
  const missing = structuredClone(RESPONSE.items[0]);
  missing.id = "sin-coordenadas";
  missing.code = "SC";
  missing.name = "Sin coordenadas";
  missing.geo = {
    latitude: null,
    longitude: null,
    basis: null,
    locatedPollingPlaces: 0,
    totalPollingPlaces: 2,
  };

  const projection = projectTerritoryHeatmapItems([
    RESPONSE.items[0],
    exterior,
    missing,
  ]);
  expect(projection.scope).toBe("COLOMBIA");
  expect(projection.points.map(({ item }) => item.id)).toEqual([
    "departamento-05",
  ]);
  expect(projection.excludedOutsideScope).toBe(1);
  expect(projection.missingCoordinates).toBe(1);
  expect(projection.points[0].x).toBeGreaterThanOrEqual(4);
  expect(projection.points[0].x).toBeLessThanOrEqual(96);
  expect(projection.points[0].y).toBeGreaterThanOrEqual(4);
  expect(projection.points[0].y).toBeLessThanOrEqual(96);
});

test("usa escala relativa al consultar exclusivamente el exterior", () => {
  const exterior = structuredClone(RESPONSE.items[0]);
  exterior.id = "exterior";
  exterior.geo = {
    latitude: 40.7128,
    longitude: -74.006,
    basis: "CENTROID",
    locatedPollingPlaces: 1,
    totalPollingPlaces: 1,
  };
  const projection = projectTerritoryHeatmapItems([exterior]);
  expect(projection).toMatchObject({
    scope: "RELATIVE",
    missingCoordinates: 0,
    excludedOutsideScope: 0,
  });
  expect(projection.points[0]).toMatchObject({ x: 50, y: 50 });
});

test("acepta ubicación administrativa sin atribuirle puestos electorales", () => {
  const response = structuredClone(RESPONSE);
  response.items[0].geo = {
    latitude: 6.922837661599162,
    longitude: -75.5650154399505,
    basis: "ADMINISTRATIVE_CENTROID",
    locatedPollingPlaces: 0,
    totalPollingPlaces: 8,
  };
  const item = validateTerritoryHeatmapResponse(response, QUERY).items[0];
  expect(item.geo.totalPollingPlaces).toBe(8);
  expect(item.geo.locatedPollingPlaces).toBe(0);
  expect(describeTerritoryHeatmapLocation(item.geo)).toMatch(/DANE; no corresponde a un puesto/);
  expect(validateTerritoryHeatmapSnapshot({ ...SNAPSHOT, response }).response).toEqual(response);
});

test("rechaza un centroide DANE con cobertura electoral inventada o coordenadas parciales", () => {
  for (const patch of [
    { locatedPollingPlaces: 1 },
    { latitude: null },
    { longitude: Number.NaN },
  ]) {
    const response = structuredClone(RESPONSE);
    response.items[0].geo = {
      latitude: 6.9, longitude: -75.5, basis: "ADMINISTRATIVE_CENTROID",
      locatedPollingPlaces: 0, totalPollingPlaces: 8, ...patch,
    };
    expect(() => validateTerritoryHeatmapResponse(response, QUERY)).toThrow(/georreferencia/);
  }
});

for (const level of ["MUNICIPIO", "ZONA", "PUESTO"] as const) {
  test(`centroide administrativo sólo válido en municipio, nunca en zona o puesto: ${level}`, () => {
    const parent = { id: "parent-05", code: "05", name: "Territorio padre QA", type: "DEPARTAMENTO" as const };
    const query = { ...QUERY, level, parentId: parent.id };
    const response = structuredClone(RESPONSE);
    response.level = level;
    response.parent = parent;
    response.breadcrumbs = [parent];
    Object.assign(response.items[0], { type: level, parentId: parent.id, hasChildren: false, nextLevel: null });
    response.items[0].geo = { latitude: 6.25, longitude: -75.61, basis: "ADMINISTRATIVE_CENTROID", locatedPollingPlaces: 0, totalPollingPlaces: 0 };
    if (level === "MUNICIPIO") expect(validateTerritoryHeatmapResponse(response, query)).toEqual(response);
    else expect(() => validateTerritoryHeatmapResponse(response, query)).toThrow(/georreferencia/);
  });
}

test("amplía municipios cercanos en lugar de comprimirlos en la escala nacional", () => {
  const municipalities = [6.25, 6.26].map((latitude, index) => ({
    ...structuredClone(RESPONSE.items[0]), id: `municipio-${index}`, type: "MUNICIPIO" as const,
    geo: { latitude, longitude: -75.6 + index * 0.01, basis: "ADMINISTRATIVE_CENTROID" as const, locatedPollingPlaces: 0, totalPollingPlaces: 0 },
  }));
  const projection = projectTerritoryHeatmapItems(municipalities);
  expect(projection.scope).toBe("RELATIVE");
  expect(projection.points.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 4, y: 96 }, { x: 96, y: 4 }]);
  const identical = projectTerritoryHeatmapItems([municipalities[0], { ...municipalities[0], id: "same-coordinates" }]);
  expect(identical.points).toHaveLength(2);
  expect(identical.points.every(({ x, y }) => x === 50 && y === 50)).toBe(true);
});

test("nunca interpreta una cifra protegida como baja actividad o cero", () => {
  const item = { ...structuredClone(RESPONSE.items[0]), value: null, suppressed: true, bucket: 0 };
  expect(hasReportableLowActivity(item, "VOTER_ACTIVITY")).toBe(false);
  expect(hasReportableLowActivity({ ...item, suppressed: false }, "VOTER_ACTIVITY")).toBe(false);
  const reportable = { ...item, suppressed: false, value: 0 };
  expect(hasReportableLowActivity(reportable, "VOTER_ACTIVITY")).toBe(true);
  expect(hasReportableLowActivity(reportable, "TEAM_COVERAGE")).toBe(false);
  expect(hasReportableLowActivity({ ...reportable, value: 100, bucket: 5 }, "VOTER_ACTIVITY")).toBe(false);
});

test("rechaza inconsistencias de consulta, jerarquía, métricas y duplicados", () => {
  const wrongMetric = structuredClone(RESPONSE);
  wrongMetric.metric.code = "OPEN_CASES";
  const wrongUnit = structuredClone(RESPONSE);
  wrongUnit.metric.unit = "COUNT";
  const orphanChild = structuredClone(RESPONSE);
  orphanChild.items[0].hasChildren = false;
  const duplicated = structuredClone(RESPONSE);
  duplicated.items.push(structuredClone(duplicated.items[0]));
  const wrongParentQuery = {
    ...QUERY,
    level: "MUNICIPIO" as const,
    parentId: null,
  };

  for (const candidate of [wrongMetric, wrongUnit, orphanChild, duplicated]) {
    expect(() => validateTerritoryHeatmapResponse(candidate, QUERY)).toThrow();
  }
  expect(() =>
    validateTerritoryHeatmapResponse(RESPONSE, wrongParentQuery),
  ).toThrow(/consulta/);
});

test("el snapshot exige esquema, fecha y query exactos sin campos encubiertos", () => {
  expect(validateTerritoryHeatmapSnapshot(SNAPSHOT)).toEqual(SNAPSHOT);
  expect(territoryHeatmapSnapshotKey(QUERY)).toBe(
    '["E14_COVERAGE","DEPARTAMENTO",null]',
  );
  expect(() =>
    validateTerritoryHeatmapSnapshot({
      ...SNAPSHOT,
      personIds: ["person-1"],
    }),
  ).toThrow(/snapshot/);
  expect(() =>
    validateTerritoryHeatmapSnapshot({
      ...SNAPSHOT,
      savedAt: "ayer",
    }),
  ).toThrow(/snapshot/);
});

test("usa el snapshot exacto solo ante fallo de red", async () => {
  let offlineReads = 0;
  const view = await resolveTerritoryHeatmapView(QUERY, {
    loadOnline: async () => {
      throw new ApiError("Sin red", 0);
    },
    readOffline: async (query) => {
      offlineReads += 1;
      expect(query).toEqual(QUERY);
      return SNAPSHOT;
    },
  });

  expect(offlineReads).toBe(1);
  expect(view).toEqual({
    source: "OFFLINE",
    response: RESPONSE,
    savedAt: SNAPSHOT.savedAt,
  });
});

test("no degrada a copia local ante auth, servidor, contrato inválido o snapshot ausente", async () => {
  for (const status of [401, 403, 500]) {
    let offlineReads = 0;
    const failure = new ApiError(`HTTP ${status}`, status);
    await expect(
      resolveTerritoryHeatmapView(QUERY, {
        loadOnline: async () => {
          throw failure;
        },
        readOffline: async () => {
          offlineReads += 1;
          return SNAPSHOT;
        },
      }),
    ).rejects.toBe(failure);
    expect(offlineReads).toBe(0);
  }

  await expect(
    resolveTerritoryHeatmapView(QUERY, {
      loadOnline: async () => ({ ...RESPONSE, actorIds: ["actor-1"] }),
      readOffline: async () => SNAPSHOT,
    }),
  ).rejects.toThrow(/validación/);

  const networkFailure = new ApiError("Sin red", 0);
  await expect(
    resolveTerritoryHeatmapView(QUERY, {
      loadOnline: async () => {
        throw networkFailure;
      },
      readOffline: async () => null,
    }),
  ).rejects.toBe(networkFailure);
  await expect(
    resolveTerritoryHeatmapView(QUERY, {
      loadOnline: async () => {
        throw networkFailure;
      },
    }),
  ).rejects.toBe(networkFailure);
});

test("rechaza reutilizar un snapshot de otra métrica o jerarquía", async () => {
  const networkFailure = new ApiError("Sin red", 0);
  const otherQuery: TerritoryHeatmapQuery = {
    level: "DEPARTAMENTO",
    metric: "OPEN_CASES",
    parentId: null,
  };
  await expect(
    resolveTerritoryHeatmapView(otherQuery, {
      loadOnline: async () => {
        throw networkFailure;
      },
      readOffline: async () => SNAPSHOT,
    }),
  ).rejects.toBe(networkFailure);
});
