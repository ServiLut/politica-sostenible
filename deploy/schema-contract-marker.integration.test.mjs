import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { EXPECTED_SCHEMA_VERSION } from "./migrate.mjs";

const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const databaseUrl = process.env.MIGRATION_TEST_DATABASE_URL?.trim();
const pgTestOptions = { skip: !databaseUrl, timeout: 30_000 };
const previousMarker = "20260921182000_schema_contract_marker";
const markerSql = await readFile(new URL(
  `../apps/api/prisma/migrations/${EXPECTED_SCHEMA_VERSION}/migration.sql`,
  import.meta.url,
), "utf8");

test("CI ejecuta el marcador contra PostgreSQL real", async () => {
  const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(ci, /node --test[^\n]*deploy\/schema-contract-marker\.integration\.test\.mjs/);
});

async function fixture(run) {
  const url = new URL(databaseUrl);
  assert.match(url.pathname, /(?:test|audit|ci)/i, "Requiere una base de integración explícita");
  const { Client } = apiRequire("pg");
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5_000 });
  const appSchema = `audit_marker_${randomBytes(10).toString("hex")}`;
  const otherSchema = `audit_marker_${randomBytes(10).toString("hex")}`;
  const created = [];
  try {
    await client.connect();
    assert.match((await client.query("SHOW server_version")).rows[0].server_version, /^16\./);
    for (const schema of [appSchema, otherSchema]) {
      await client.query(`CREATE SCHEMA "${schema}"`);
      created.push(schema);
      await client.query(`CREATE FUNCTION "${schema}".marker_fixture() RETURNS INTEGER
        LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END; $$`);
    }
    await client.query(`SET search_path TO "${appSchema}", pg_catalog`);
    assert.equal((await client.query("SELECT current_schema() AS name")).rows[0].name, appSchema);
    await client.query(`CREATE TABLE "SystemDatabaseIdentity" (
      "id" TEXT PRIMARY KEY, "fingerprint" TEXT NOT NULL, "schemaVersion" TEXT NOT NULL
    )`);
    await client.query(`INSERT INTO "SystemDatabaseIdentity" VALUES ($1, $2, $3)`,
      ["primary", "a".repeat(64), previousMarker]);
    const state = async () => ({
      identity: (await client.query(`SELECT * FROM "SystemDatabaseIdentity" ORDER BY "id"`)).rows,
      functions: (await client.query(`SELECT n.nspname, p.proname, p.proconfig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY($1::text[]) ORDER BY n.nspname, p.proname`,
      [[appSchema, otherSchema]])).rows,
    });
    await run({ client, appSchema, otherSchema, state });
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    for (const schema of created.reverse()) {
      assert.match(schema, /^audit_marker_[a-f0-9]{20}$/);
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await client.end();
  }
}

test("PostgreSQL: marcador avanza y restringe search_path sólo en su esquema", pgTestOptions, async () => {
  await fixture(async ({ client, appSchema, otherSchema, state }) => {
    const before = await state();
    await client.query(markerSql);
    const after = await state();
    assert.deepEqual(after.identity, [{ ...before.identity[0], schemaVersion: EXPECTED_SCHEMA_VERSION }]);
    assert.deepEqual(after.functions.find((row) => row.nspname === appSchema).proconfig,
      [`search_path=${appSchema}, pg_catalog`]);
    assert.deepEqual(after.functions.find((row) => row.nspname === otherSchema),
      before.functions.find((row) => row.nspname === otherSchema));
  });
});

for (const invalid of ["predecessor", "fingerprint", "missing-identity"]) {
  test(`PostgreSQL: marcador rechaza ${invalid} sin cambios parciales`, pgTestOptions, async () => {
    await fixture(async ({ client, state }) => {
      if (invalid === "predecessor")
        await client.query(`UPDATE "SystemDatabaseIdentity" SET "schemaVersion" = $1`, ["unknown-marker"]);
      else if (invalid === "fingerprint")
        await client.query(`UPDATE "SystemDatabaseIdentity" SET "fingerprint" = $1`, ["invalid"]);
      else await client.query(`DELETE FROM "SystemDatabaseIdentity"`);
      const before = await state();
      await assert.rejects(client.query(markerSql), { code: "23514" });
      await client.query("ROLLBACK");
      assert.deepEqual(await state(), before);
    });
  });
}

test("PostgreSQL: un fallo posterior al marcador y los ALTER FUNCTION revierte todo", pgTestOptions, async () => {
  await fixture(async ({ client, state }) => {
    const before = await state();
    const injectedSql = markerSql.replace(/COMMIT;\s*$/u, "SELECT 1 / 0;\nCOMMIT;");
    assert.notEqual(injectedSql, markerSql);
    await assert.rejects(client.query(injectedSql), { code: "22012" });
    await client.query("ROLLBACK");
    assert.deepEqual(await state(), before);
    await client.query(markerSql);
    assert.equal((await state()).identity[0].schemaVersion, EXPECTED_SCHEMA_VERSION);
  });
});
