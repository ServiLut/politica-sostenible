import assert from "node:assert/strict";
import test from "node:test";

import {
  BASELINE_MIGRATION,
  HISTORICAL_MIGRATIONS,
  assertSameDatabaseTarget,
  classifyDatabaseState,
  normalizeDirectUrl,
  resolveDirectUrl,
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

function rolledBack(migrationName) {
  return {
    migration_name: migrationName,
    finished_at: null,
    rolled_back_at: new Date("2026-08-31T01:00:00.000Z"),
    applied_steps_count: 0,
  };
}

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
