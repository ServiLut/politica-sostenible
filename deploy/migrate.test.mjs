import assert from "node:assert/strict";
import test from "node:test";

import {
  BASELINE_MIGRATION,
  HISTORICAL_MIGRATIONS,
  assertSameDatabaseTarget,
  classifyDatabaseState,
  databaseInspectionsMatch,
  databaseInvariantIssues,
  findMigrationChecksumMismatches,
  normalizeDirectUrl,
  planCatalogMatches,
  proveSameDatabase,
  resolveDirectUrl,
  resolveMigrationTimeouts,
  resolvedBaselinePreflight,
  resolveTargetSchema,
} from "./migrate.mjs";

const direct =
  "postgresql://user:password@database.internal:5432/politica?schema=campaign";
const pooled =
  "postgresql://user:password@pool.internal:6543/politica?pgbouncer=true&schema=campaign";

function completed(migrationName) {
  return {
    migration_name: migrationName,
    finished_at: new Date("2026-08-31T00:00:00.000Z"),
    rolled_back_at: null,
    applied_steps_count: 1,
  };
}

function completedWithChecksum(migrationName, checksum) {
  return {
    ...completed(migrationName),
    checksum,
  };
}

function rolledBack(migrationName) {
  return {
    migration_name: migrationName,
    finished_at: null,
    rolled_back_at: new Date("2026-08-31T01:00:00.000Z"),
    applied_steps_count: 0,
  };
}

test("las migraciones tienen timeouts fail-fast acotados", () => {
  assert.deepEqual(resolveMigrationTimeouts({}), {
    lockTimeoutMs: 10_000,
    statementTimeoutMs: 900_000,
    pgOptions: "-c lock_timeout=10000ms -c statement_timeout=900000ms",
  });
  assert.deepEqual(
    resolveMigrationTimeouts({
      MIGRATION_LOCK_TIMEOUT_MS: "2500",
      MIGRATION_STATEMENT_TIMEOUT_MS: "120000",
    }),
    {
      lockTimeoutMs: 2_500,
      statementTimeoutMs: 120_000,
      pgOptions: "-c lock_timeout=2500ms -c statement_timeout=120000ms",
    },
  );
  assert.throws(
    () => resolveMigrationTimeouts({ MIGRATION_LOCK_TIMEOUT_MS: "0" }),
    /entero positivo/,
  );
  assert.throws(
    () =>
      resolveMigrationTimeouts({
        MIGRATION_STATEMENT_TIMEOUT_MS: "3600001",
      }),
    /maximo permitido/,
  );
});

test("resolveDirectUrl prioriza DIRECT_URL directa", () => {
  const result = resolveDirectUrl({
    DIRECT_URL: direct,
    POSTGRES_URL_NON_POOLING:
      "postgresql://other:password@other.internal:5432/politica",
    DATABASE_URL: pooled,
  });

  assert.equal(result.source, "DIRECT_URL");
  assert.equal(result.directUrl, direct);
});

test("resolveDirectUrl acepta el alias no-pooling", () => {
  const result = resolveDirectUrl({
    POSTGRES_URL_NON_POOLING: direct,
    DATABASE_URL: pooled,
  });

  assert.equal(result.source, "POSTGRES_URL_NON_POOLING");
});

test("resolveDirectUrl usa DATABASE_URL solo cuando es directa", () => {
  assert.equal(
    resolveDirectUrl({ DATABASE_URL: direct }).source,
    "DATABASE_URL",
  );
  assert.throws(
    () => resolveDirectUrl({ DATABASE_URL: pooled }),
    /DIRECT_URL es obligatoria/,
  );
});

test("resolveDirectUrl rechaza una DIRECT_URL conectada al pooler", () => {
  assert.throws(
    () => resolveDirectUrl({ DIRECT_URL: pooled }),
    /apunta a un pooler/,
  );
  assert.throws(
    () =>
      resolveDirectUrl({
        DIRECT_URL:
          "postgresql://user:password@pool.internal:5432/politica?pool_mode=transaction",
      }),
    /apunta a un pooler/,
  );
});

test("resolveDirectUrl rechaza protocolos y placeholders invalidos", () => {
  assert.throws(
    () => resolveDirectUrl({ DIRECT_URL: "https://database.internal/test" }),
    /no es una URL PostgreSQL/,
  );
  assert.throws(
    () =>
      resolveDirectUrl({
        DIRECT_URL:
          "postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=politica-sostenible",
      }),
    /placeholder sin resolver/,
  );
  assert.equal(
    resolveDirectUrl({
      DIRECT_URL:
        "postgresql://postgres.your-tenant-id:password@database.internal:5432/politica",
    }).source,
    "DIRECT_URL",
  );
});

test("resolveTargetSchema respeta configuracion, URL y public", () => {
  const parsed = new URL(direct);
  assert.equal(resolveTargetSchema(parsed, "configured"), "configured");
  assert.equal(resolveTargetSchema(parsed), "campaign");
  assert.equal(
    resolveTargetSchema(
      new URL("postgresql://user:password@database.internal:5432/politica"),
    ),
    "public",
  );
});

test("resolveTargetSchema rechaza identificadores inseguros", () => {
  assert.throws(
    () => resolveTargetSchema(new URL(direct), "public; DROP SCHEMA public"),
    /identificador PostgreSQL valido/,
  );
});

test("normalizeDirectUrl fija el schema efectivo si falta o es distinto", () => {
  const withoutSchema = new URL(
    "postgresql://user:password@database.internal:5432/politica",
  );
  assert.equal(
    normalizeDirectUrl(withoutSchema, "politica-sostenible").searchParams.get(
      "schema",
    ),
    "politica-sostenible",
  );

  const mismatched = new URL(direct);
  assert.equal(mismatched.searchParams.get("schema"), "campaign");
  assert.equal(
    normalizeDirectUrl(mismatched, "configured-schema").searchParams.get(
      "schema",
    ),
    "configured-schema",
  );
  assert.equal(mismatched.searchParams.get("schema"), "campaign");
});

test("DATABASE_SCHEMA normaliza ambas conexiones al mismo schema efectivo", () => {
  const normalizedDirect = normalizeDirectUrl(
    new URL(
      "postgresql://user:password@database.internal:5432/politica?schema=wrong-direct",
    ),
    "configured-schema",
  );
  assert.doesNotThrow(() =>
    assertSameDatabaseTarget(
      normalizedDirect,
      "postgresql://pool-user:password@pool.internal:6543/politica",
      "configured-schema",
    ),
  );
});

test("DIRECT_URL y DATABASE_URL deben seleccionar la misma base y schema", () => {
  const directParsed = new URL(direct);
  assert.doesNotThrow(() =>
    assertSameDatabaseTarget(
      directParsed,
      "postgresql://pool-user:password@pool.internal:6543/politica?pgbouncer=true&schema=campaign",
    ),
  );
  assert.throws(
    () =>
      assertSameDatabaseTarget(
        directParsed,
        "postgresql://pool-user:password@pool.internal:6543/otra?pgbouncer=true&schema=campaign",
      ),
    /bases de datos diferentes/,
  );
  assert.throws(
    () =>
      assertSameDatabaseTarget(
        directParsed,
        "postgresql://pool-user:password@pool.internal:6543/politica?pgbouncer=true&schema=public",
      ),
    /schemas diferentes/,
  );
});

test("las conexiones de migración y ejecución deben observar el mismo historial", () => {
  const directInspection = {
    applicationObjectCount: 30,
    rows: [
      completedWithChecksum(BASELINE_MIGRATION, "a".repeat(64)),
    ],
  };

  assert.equal(
    databaseInspectionsMatch(directInspection, {
      applicationObjectCount: 30,
      rows: [
        completedWithChecksum(BASELINE_MIGRATION, "a".repeat(64)),
      ],
    }),
    true,
  );
  assert.equal(
    databaseInspectionsMatch(directInspection, {
      applicationObjectCount: 30,
      rows: [
        completedWithChecksum(BASELINE_MIGRATION, "b".repeat(64)),
      ],
    }),
    false,
  );
  assert.equal(
    databaseInspectionsMatch(directInspection, {
      applicationObjectCount: 29,
      rows: directInspection.rows,
    }),
    false,
  );
});

test("el lock transaccional demuestra que ambas URLs alcanzan la misma base", async () => {
  const directQueries = [];
  const runtimeQueries = [];
  const directClient = {
    query: async (sql, values) => {
      directQueries.push({ sql, values });
      return { rows: [] };
    },
  };
  const runtimeClient = {
    query: async (sql, values) => {
      runtimeQueries.push({ sql, values });
      return sql.includes("pg_try_advisory_xact_lock")
        ? { rows: [{ acquired: false }] }
        : { rows: [] };
    },
  };

  await assert.doesNotReject(
    proveSameDatabase(directClient, runtimeClient, [123, 456]),
  );
  assert.deepEqual(directQueries.at(-1), {
    sql: "ROLLBACK",
    values: undefined,
  });
  assert.deepEqual(runtimeQueries.at(-1), {
    sql: "ROLLBACK",
    values: undefined,
  });
});

test("el lock transaccional bloquea dos bases indistinguibles por nombre e historial", async () => {
  const client = (acquired) => ({
    query: async (sql) =>
      sql.includes("pg_try_advisory_xact_lock")
        ? { rows: [{ acquired }] }
        : { rows: [] },
  });

  await assert.rejects(
    proveSameDatabase(client(false), client(true), [123, 456]),
    /bases fisicas diferentes/,
  );
});

test("el catálogo de planes permite bootstrap parcial pero exige cierre exacto", () => {
  const free = {
    code: "FREE",
    maxUsers: 3,
    maxVoters: 100,
    maxStorageMb: 50,
    includesExport: false,
    includesImport: false,
    includesMfa: false,
    includesApi: false,
    monthlyPriceCop: "0.00",
    yearlyPriceCop: "0.00",
    isActive: true,
    sortOrder: 1,
  };
  const starter = {
    code: "STARTER",
    maxUsers: 10,
    maxVoters: 1_000,
    maxStorageMb: 500,
    includesExport: true,
    includesImport: false,
    includesMfa: false,
    includesApi: false,
    monthlyPriceCop: "99000.00",
    yearlyPriceCop: "1188000.00",
    isActive: true,
    sortOrder: 2,
  };
  const professional = {
    code: "PROFESSIONAL",
    maxUsers: 50,
    maxVoters: 10_000,
    maxStorageMb: 2_048,
    includesExport: true,
    includesImport: true,
    includesMfa: true,
    includesApi: false,
    monthlyPriceCop: "299000.00",
    yearlyPriceCop: "3588000.00",
    isActive: true,
    sortOrder: 3,
  };
  const enterprise = {
    code: "ENTERPRISE",
    maxUsers: 999_999,
    maxVoters: 999_999,
    maxStorageMb: 999_999,
    includesExport: true,
    includesImport: true,
    includesMfa: true,
    includesApi: false,
    monthlyPriceCop: "799000.00",
    yearlyPriceCop: "9588000.00",
    isActive: true,
    sortOrder: 4,
  };

  assert.equal(planCatalogMatches([], { requireAll: false }), true);
  assert.equal(planCatalogMatches([free], { requireAll: false }), true);
  assert.equal(
    planCatalogMatches([free, starter, professional, enterprise]),
    true,
  );
  assert.equal(planCatalogMatches([free]), false);
  assert.equal(
    planCatalogMatches([{ ...free, isActive: false }], {
      requireAll: false,
    }),
    false,
  );
});

test("las invariantes PostgreSQL fallan cerradas si falta o cambia una protección", () => {
  const constraints = [
    {
      name: "CampaignSettings_report_deadline_check",
      tableName: "CampaignSettings",
      type: "c",
      validated: true,
      definition:
        'CHECK ("electionDate" IS NULL OR "reportDeadline" IS NULL OR "reportDeadline" > "electionDate")',
    },
  ];

  const issues = databaseInvariantIssues({
    constraints,
    triggers: [],
    indexes: [],
  });
  assert.equal(
    issues.includes("CampaignSettings_report_deadline_check"),
    false,
  );
  assert.equal(issues.includes("User_authVersion_non_negative_check"), true);

  const changed = databaseInvariantIssues({
    constraints: [{ ...constraints[0], validated: false }],
    triggers: [],
    indexes: [],
  });
  assert.equal(
    changed.includes("CampaignSettings_report_deadline_check"),
    true,
  );

  const unsafeFunctions = databaseInvariantIssues({
    constraints,
    triggers: [],
    indexes: [],
    unsafeFunctionSearchPaths: [{ name: "unsafe_trigger_function" }],
  });
  assert.equal(
    unsafeFunctions.includes("ApplicationFunctions_search_path"),
    true,
  );
});

test("classifyDatabaseState distingue base vacia y schema sin historial", () => {
  assert.equal(
    classifyDatabaseState({ rows: null, applicationObjectCount: 0 }),
    "EMPTY",
  );
  assert.equal(
    classifyDatabaseState({ rows: [], applicationObjectCount: 4 }),
    "EXISTING_WITHOUT_HISTORY",
  );
});

test("classifyDatabaseState acepta la baseline registrada", () => {
  assert.equal(
    classifyDatabaseState({
      rows: [completed(BASELINE_MIGRATION)],
      applicationObjectCount: 30,
    }),
    "TRACKED",
  );
});

test("classifyDatabaseState acepta una baseline adoptada por migrate resolve", () => {
  assert.equal(
    classifyDatabaseState({
      rows: [
        {
          ...completed(BASELINE_MIGRATION),
          applied_steps_count: 0,
        },
      ],
      applicationObjectCount: 30,
    }),
    "TRACKED",
  );
});

test("una baseline resuelta exige prueba de procedencia antes de recibir deltas", () => {
  const resolvedBaseline = {
    ...completedWithChecksum(BASELINE_MIGRATION, "a".repeat(64)),
    applied_steps_count: 0,
  };

  assert.equal(
    resolvedBaselinePreflight({
      rows: [resolvedBaseline],
      databaseIdentity: null,
    }),
    "VERIFY_BASELINE_SCHEMA",
  );
  assert.equal(
    resolvedBaselinePreflight({
      rows: [resolvedBaseline, completed("20260901000000_delta")],
      databaseIdentity: null,
    }),
    "UNSUPPORTED_RESOLVED_BASELINE",
  );
  assert.equal(
    resolvedBaselinePreflight({
      rows: [resolvedBaseline, ...HISTORICAL_MIGRATIONS.map(completed)],
      databaseIdentity: null,
    }),
    "HISTORICAL_PROVENANCE",
  );
  assert.equal(
    resolvedBaselinePreflight({
      rows: [resolvedBaseline, completed("20260901000000_delta")],
      databaseIdentity: "a".repeat(32),
    }),
    "ESTABLISHED_IDENTITY",
  );
});

test("classifyDatabaseState bloquea historia desconocida o duplicada", () => {
  assert.equal(
    classifyDatabaseState({
      rows: [
        completed(BASELINE_MIGRATION),
        completed("20260831999999_unknown"),
      ],
      applicationObjectCount: 30,
    }),
    "UNSUPPORTED_HISTORY",
  );
  assert.equal(
    classifyDatabaseState({
      rows: [
        completed(BASELINE_MIGRATION),
        completed(BASELINE_MIGRATION),
      ],
      applicationObjectCount: 30,
    }),
    "UNSUPPORTED_HISTORY",
  );
  assert.equal(
    classifyDatabaseState({
      rows: [
        completed(BASELINE_MIGRATION),
        rolledBack("20260831999999_unknown"),
      ],
      applicationObjectCount: 30,
    }),
    "UNSUPPORTED_HISTORY",
  );
});

test("classifyDatabaseState acepta migraciones locales conocidas", () => {
  const nextMigration = "20260901000000_next";
  assert.equal(
    classifyDatabaseState({
      rows: [completed(BASELINE_MIGRATION), completed(nextMigration)],
      applicationObjectCount: 31,
      localMigrationNames: [BASELINE_MIGRATION, nextMigration],
    }),
    "TRACKED",
  );
  assert.equal(
    classifyDatabaseState({
      rows: [
        completed(BASELINE_MIGRATION),
        rolledBack(nextMigration),
        completed(nextMigration),
      ],
      applicationObjectCount: 31,
      localMigrationNames: [BASELINE_MIGRATION, nextMigration],
    }),
    "TRACKED",
  );
});

test("classifyDatabaseState acepta el reinicio tras adoptar las cinco historicas", () => {
  assert.equal(
    classifyDatabaseState({
      rows: [
        ...HISTORICAL_MIGRATIONS.map(completed),
        {
          ...completed(BASELINE_MIGRATION),
          applied_steps_count: 0,
        },
      ],
      applicationObjectCount: 30,
    }),
    "TRACKED",
  );
});

test("classifyDatabaseState permite adoptar solo las cinco historicas exactas", () => {
  const rows = HISTORICAL_MIGRATIONS.map(completed);
  assert.equal(
    classifyDatabaseState({ rows, applicationObjectCount: 30 }),
    "HISTORICAL_FIVE",
  );

  assert.equal(
    classifyDatabaseState({
      rows: [...rows, completed("20260821999999_extra")],
      applicationObjectCount: 30,
    }),
    "UNSUPPORTED_HISTORY",
  );

  assert.equal(
    classifyDatabaseState({
      rows: [rows[0], rows[0], ...rows.slice(2)],
      applicationObjectCount: 30,
    }),
    "UNSUPPORTED_HISTORY",
  );
});

test("classifyDatabaseState no adopta filas parciales o revertidas", () => {
  const partialRows = HISTORICAL_MIGRATIONS.map(completed);
  partialRows[2] = {
    ...partialRows[2],
    finished_at: null,
    applied_steps_count: 0,
  };
  assert.equal(
    classifyDatabaseState({ rows: partialRows, applicationObjectCount: 30 }),
    "FAILED_MIGRATION",
  );

  const rolledBackRows = HISTORICAL_MIGRATIONS.map(completed);
  rolledBackRows[1] = {
    ...rolledBackRows[1],
    finished_at: null,
    rolled_back_at: new Date("2026-08-31T01:00:00.000Z"),
  };
  assert.equal(
    classifyDatabaseState({ rows: rolledBackRows, applicationObjectCount: 30 }),
    "UNSUPPORTED_HISTORY",
  );
});

test("una migracion fallida bloquea incluso si la baseline esta presente", () => {
  assert.equal(
    classifyDatabaseState({
      rows: [
        completed(BASELINE_MIGRATION),
        {
          migration_name: "20260831999999_failed",
          finished_at: null,
          rolled_back_at: null,
          applied_steps_count: 0,
        },
      ],
      applicationObjectCount: 30,
    }),
    "FAILED_MIGRATION",
  );
});

test("los checksums aceptan solo los bytes exactos de migraciones locales aplicadas", () => {
  const localMigrations = [
    { name: BASELINE_MIGRATION, checksum: "a".repeat(64) },
    { name: "20260901000000_next", checksum: "b".repeat(64) },
  ];

  assert.deepEqual(
    findMigrationChecksumMismatches({
      rows: [
        completedWithChecksum(BASELINE_MIGRATION, "A".repeat(64)),
        completedWithChecksum("20260901000000_next", "b".repeat(64)),
      ],
      localMigrations,
    }),
    [],
  );

  assert.deepEqual(
    findMigrationChecksumMismatches({
      rows: [
        completedWithChecksum(BASELINE_MIGRATION, "c".repeat(64)),
        completedWithChecksum("20260901000000_next", "b".repeat(64)),
      ],
      localMigrations,
    }).map(({ migrationName }) => migrationName),
    [BASELINE_MIGRATION],
  );
});

test("los checksums fallan cerrados si la fila aplicada no contiene checksum", () => {
  assert.deepEqual(
    findMigrationChecksumMismatches({
      rows: [completed(BASELINE_MIGRATION)],
      localMigrations: [
        { name: BASELINE_MIGRATION, checksum: "a".repeat(64) },
      ],
    }).map(({ migrationName, observedChecksum }) => ({
      migrationName,
      observedChecksum,
    })),
    [{ migrationName: BASELINE_MIGRATION, observedChecksum: null }],
  );
});

test("los checksums ignoran solo las cinco filas historicas sin archivo local", () => {
  assert.deepEqual(
    findMigrationChecksumMismatches({
      rows: HISTORICAL_MIGRATIONS.map((name) =>
        completedWithChecksum(name, "0".repeat(64)),
      ),
      localMigrations: [
        { name: BASELINE_MIGRATION, checksum: "a".repeat(64) },
      ],
    }),
    [],
  );
});
