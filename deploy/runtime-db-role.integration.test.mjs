import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { dirname, basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { EXPECTED_SCHEMA_VERSION, prismaMigrationConnectionString } from "./migrate.mjs";
import { prepareRuntimeRolePlan, prismaRoleInventory } from "./prepare-runtime-db-role.mjs";

const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const source = await readFile(new URL("../apps/api/prisma/schema.prisma", import.meta.url), "utf8");
const databaseUrl = process.env.RUNTIME_ROLE_TEST_DATABASE_URL?.trim();
const options = { skip: !databaseUrl, timeout: 30_000 };
const quote = (value) => `"${value}"`;

async function fixture(run) {
  const url = new URL(databaseUrl);
  assert.match(url.pathname, /(?:test|audit|ci)/iu);
  const { Client } = apiRequire("pg");
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5_000 });
  const suffix = randomBytes(8).toString("hex");
  const schema = `audit_role_${suffix}`;
  const other = `audit_other_${suffix}`;
  const runtimeRole = `ps_runtime_${suffix}`;
  const created = [];
  let roleWasAbsent = false;
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const context = (await client.query("SELECT current_database() AS db, current_user AS role")).rows[0];
    assert.match((await client.query("SHOW server_version")).rows[0].server_version, /^16\./u);
    assert.equal((await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [runtimeRole])).rowCount, 0);
    roleWasAbsent = true;
    for (const name of [schema, other]) { await client.query(`CREATE SCHEMA ${quote(name)}`); created.push(name); }
    for (const table of prismaRoleInventory(source).tables) {
      await client.query(`CREATE TABLE ${quote(schema)}.${quote(table)} ${table === "SystemDatabaseIdentity"
        ? '("id" TEXT PRIMARY KEY, "fingerprint" TEXT, "schemaVersion" TEXT)'
        : '("id" TEXT PRIMARY KEY, "value" TEXT)'}`);
    }
    await client.query(`INSERT INTO ${quote(schema)}."SystemDatabaseIdentity" VALUES ('primary', $1, $2)`, ["a".repeat(64), EXPECTED_SCHEMA_VERSION]);
    await client.query(`CREATE TABLE ${quote(other)}.canary (id INTEGER)`);
    const manifest = { database: context.db, schema, fingerprint: "a".repeat(64), schemaVersion: EXPECTED_SCHEMA_VERSION, runtimeRole, migrationRole: context.role };
    await run({ client, manifest, schema, other, runtimeRole });
  } finally {
    if (connected) {
    await client.query("ROLLBACK").catch(() => {});
    await client.query("RESET ROLE").catch(() => {});
    if (roleWasAbsent && (await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [runtimeRole])).rowCount) {
      assert.match(runtimeRole, /^ps_runtime_[a-f0-9]{16}$/u);
      await client.query(`DROP OWNED BY ${quote(runtimeRole)}`);
      await client.query(`DROP ROLE ${quote(runtimeRole)}`);
    }
    for (const name of created.reverse()) {
      assert.match(name, /^audit_(?:role|other)_[a-f0-9]{16}$/u);
      await client.query(`DROP SCHEMA ${quote(name)} CASCADE`);
    }
    }
    await client.end();
  }
}

test("PostgreSQL: runtime NOLOGIN permite CRUD previsto y deniega identidad, DDL y otros programas", options, async () => {
  await fixture(async ({ client, manifest, schema, other, runtimeRole }) => {
    await client.query(prepareRuntimeRolePlan(manifest, source).sql);
    const attributes = (await client.query("SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=$1", [runtimeRole])).rows[0];
    assert.deepEqual(Object.values(attributes), [false, false, false, false, false, false, false]);
    await client.query(`SET ROLE ${quote(runtimeRole)}`);
    await client.query(`INSERT INTO ${quote(schema)}."Voter" VALUES ('audit', 'one')`);
    await client.query(`UPDATE ${quote(schema)}."Voter" SET value='two' WHERE id='audit'`);
    assert.equal((await client.query(`SELECT value FROM ${quote(schema)}."Voter" WHERE id='audit'`)).rows[0].value, "two");
    await client.query(`DELETE FROM ${quote(schema)}."Voter" WHERE id='audit'`);
    assert.equal((await client.query(`SELECT * FROM ${quote(schema)}."SystemDatabaseIdentity"`)).rowCount, 1);
    for (const sql of [
      `UPDATE ${quote(schema)}."SystemDatabaseIdentity" SET "fingerprint"='changed'`,
      `TRUNCATE ${quote(schema)}."Voter"`,
      `CREATE TABLE ${quote(schema)}.unexpected (id INTEGER)`,
      `SELECT * FROM ${quote(other)}.canary`,
    ]) await assert.rejects(client.query(sql), { code: "42501" });
    await client.query("RESET ROLE");
    await assert.rejects(client.query(prepareRuntimeRolePlan(manifest, source).sql), { code: "23514" });
    await client.query("ROLLBACK");
    assert.deepEqual((await client.query("SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=$1", [runtimeRole])).rows[0], attributes);
  });
});

for (const fault of ["fingerprint", "schema", "missing-table", "public-canary", "public-column", "identity-column", "public-sequence", "security-definer"]) {
  test(`PostgreSQL: preparación rechaza ${fault} sin crear rol ni cambiar permisos existentes`, options, async () => {
    await fixture(async ({ client, manifest, schema, other, runtimeRole }) => {
      if (fault === "fingerprint") manifest.fingerprint = "b".repeat(64);
      if (fault === "schema") manifest.schema = other;
      if (fault === "missing-table") await client.query(`DROP TABLE ${quote(schema)}."Voter"`);
      if (fault === "public-canary") await client.query(`GRANT SELECT ON ${quote(other)}.canary TO PUBLIC`);
      if (fault === "public-column") {
        await client.query(`GRANT USAGE ON SCHEMA ${quote(other)} TO PUBLIC`);
        await client.query(`GRANT SELECT(id) ON ${quote(other)}.canary TO PUBLIC`);
      }
      if (fault === "identity-column") await client.query(`GRANT UPDATE("fingerprint") ON ${quote(schema)}."SystemDatabaseIdentity" TO PUBLIC`);
      if (fault === "public-sequence") {
        await client.query(`CREATE SEQUENCE ${quote(other)}.public_sequence`);
        await client.query(`GRANT USAGE ON SEQUENCE ${quote(other)}.public_sequence TO PUBLIC`);
      }
      if (fault === "security-definer") await client.query(`CREATE FUNCTION ${quote(other)}.dangerous() RETURNS INTEGER
        LANGUAGE SQL SECURITY DEFINER AS 'SELECT 1'`);
      const before = (await client.query("SELECT relacl::text FROM pg_class WHERE oid=$1::regclass", [`${quote(other)}.canary`])).rows;
      await assert.rejects(client.query(prepareRuntimeRolePlan(manifest, source).sql), { code: "23514" });
      await client.query("ROLLBACK");
      assert.equal((await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [runtimeRole])).rowCount, 0);
      assert.deepEqual((await client.query("SELECT relacl::text FROM pg_class WHERE oid=$1::regclass", [`${quote(other)}.canary`])).rows, before);
    });
  });
}

test("PostgreSQL: sólo concede secuencia perteneciente a columna autoincrement inventariada", options, async () => {
  await fixture(async ({ client, manifest, schema, other, runtimeRole }) => {
    await client.query(`ALTER TABLE ${quote(schema)}."Voter" ADD COLUMN "auditSequence" BIGSERIAL`);
    await client.query(`CREATE SEQUENCE ${quote(other)}.unrelated_sequence`);
    const changedSource = source.replace("model Voter {", "model Voter {\n auditSequence Int @default(autoincrement())");
    await client.query(prepareRuntimeRolePlan(manifest, changedSource).sql);
    const own = (await client.query("SELECT pg_get_serial_sequence($1, $2) AS name", [`${quote(schema)}."Voter"`, "auditSequence"])).rows[0].name;
    assert.equal((await client.query("SELECT has_sequence_privilege($1, $2, 'USAGE') AS allowed", [runtimeRole, own])).rows[0].allowed, true);
    assert.equal((await client.query("SELECT has_sequence_privilege($1, $2, 'USAGE') AS allowed", [runtimeRole, `${quote(other)}.unrelated_sequence`])).rows[0].allowed, false);
  });
});

test("PostgreSQL: rollback elimina sólo el nuevo NOLOGIN y se niega si fue activado", options, async () => {
  await fixture(async ({ client, manifest, runtimeRole }) => {
    const plan = prepareRuntimeRolePlan(manifest, source);
    const originalRole = (await client.query("SELECT * FROM pg_roles WHERE rolname=current_user")).rows[0];
    await client.query(plan.sql);
    await client.query(`ALTER ROLE ${quote(runtimeRole)} LOGIN`);
    await assert.rejects(client.query(plan.rollbackSql), { code: "23514" });
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT rolcanlogin FROM pg_roles WHERE rolname=$1", [runtimeRole])).rows[0].rolcanlogin, true);
    await client.query(`ALTER ROLE ${quote(runtimeRole)} NOLOGIN`);
    await client.query(plan.rollbackSql);
    assert.equal((await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [runtimeRole])).rowCount, 0);
    assert.deepEqual((await client.query("SELECT * FROM pg_roles WHERE rolname=current_user")).rows[0], originalRole);
  });
});

test("PostgreSQL: secuencia propia con UPDATE heredado de PUBLIC aborta sin alterar el grant", options, async () => {
  await fixture(async ({ client, manifest, schema, runtimeRole }) => {
    await client.query(`ALTER TABLE ${quote(schema)}."Voter" ADD COLUMN "auditSequence" BIGSERIAL`);
    const own = (await client.query("SELECT pg_get_serial_sequence($1, $2) AS name", [`${quote(schema)}."Voter"`, "auditSequence"])).rows[0].name;
    await client.query(`GRANT UPDATE ON SEQUENCE ${own} TO PUBLIC`);
    const before = (await client.query("SELECT relacl::text FROM pg_class WHERE oid=$1::regclass", [own])).rows;
    const changedSource = source.replace("model Voter {", "model Voter {\n auditSequence Int @default(autoincrement())");
    await assert.rejects(client.query(prepareRuntimeRolePlan(manifest, changedSource).sql), { code: "23514" });
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [runtimeRole])).rowCount, 0);
    assert.deepEqual((await client.query("SELECT relacl::text FROM pg_class WHERE oid=$1::regclass", [own])).rows, before);
  });
});

test("Prisma nativo: el hijo comercial rechaza un servidor QA que no ofrece TLS", options, async () => {
  const url = new URL(databaseUrl);
  assert.match(url.pathname, /(?:test|audit|ci)/iu);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Sólo QA loopback");
  const { Client } = apiRequire("pg");
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5_000 });
  let temporary;
  try {
    await client.connect();
    assert.equal((await client.query("SHOW ssl")).rows[0].ssl, "off", "La regresión necesita una QA explícitamente sin TLS");
    temporary = await mkdtemp(join(tmpdir(), "ps-prisma-tls-"));
    const config = join(temporary, "prisma.config.mjs");
    await writeFile(config, 'export default { datasource: { url: process.env.PS_AUDIT_DBURL } };\n', { flag: "wx" });
    const execute = (connectionString) => spawnSync(process.execPath, [
      resolve("apps/api/node_modules/prisma/build/index.js"), "db", "execute", "--stdin", "--config", config,
    ], { cwd: resolve("."), env: { ...process.env, PS_AUDIT_DBURL: connectionString },
      input: "SELECT 1;", encoding: "utf8", timeout: 20_000, windowsHide: true, maxBuffer: 2_000_000 });
    url.searchParams.set("sslmode", "disable");
    const control = execute(url.toString());
    assert.equal(control.status, 0, "Control QA: el motor nativo debe alcanzar SELECT 1 sin TLS");
    url.searchParams.set("sslmode", "verify-full");
    const required = execute(prismaMigrationConnectionString(url, { NODE_ENV: "production" }));
    assert.equal(required.status, 1, "El hijo comercial debe fallar ante transporte sin TLS");
    assert.ok(/\bP1011\b/u.test(`${required.stdout}\n${required.stderr}`), "El rechazo debe ser de transporte TLS, no de SQL o configuración");
  } finally {
    await client.end();
    if (temporary) {
      assert.equal(dirname(temporary), resolve(tmpdir()));
      assert.match(basename(temporary), /^ps-prisma-tls-[A-Za-z0-9]+$/u);
      await rm(temporary, { recursive: true, force: true });
    }
  }
});
