import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { EXPECTED_SCHEMA_VERSION } from "./migrate.mjs";
import { prepareRuntimeRoleFiles, prepareRuntimeRolePlan, prismaRoleInventory } from "./prepare-runtime-db-role.mjs";

const source = await readFile(new URL("../apps/api/prisma/schema.prisma", import.meta.url), "utf8");
const manifest = () => ({ database: "politica_audit_test", schema: "audit_politica", fingerprint: "a".repeat(64),
  schemaVersion: EXPECTED_SCHEMA_VERSION, runtimeRole: "ps_runtime_test", migrationRole: "migration_test" });

test("preparación enumera las 120 tablas, sin acceso broad, LOGIN ni contraseñas", () => {
  const plan = prepareRuntimeRolePlan(manifest(), source);
  assert.equal(plan.inventory.tables.length, 120);
  assert.deepEqual(plan.inventory.sequenceColumns, []);
  assert.equal([...plan.sql.matchAll(/^GRANT .* ON TABLE /gmu)].length, 120);
  assert.equal([...plan.sql.matchAll(/^GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE /gmu)].length, 119);
  assert.match(plan.sql, /GRANT SELECT ON TABLE "audit_politica"\."SystemDatabaseIdentity" TO "ps_runtime_test";/u);
  assert.match(plan.sql, /CREATE ROLE "ps_runtime_test" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;/u);
  assert.doesNotMatch(plan.sql, /GRANT ALL|ON ALL TABLES|ALTER DEFAULT PRIVILEGES|REVOKE |\bPASSWORD\s+['"]|\bLOGIN;/u);
  assert.match(plan.sql, /current_database\(\).*current_user/u);
  assert.match(plan.sql, /LOCK TABLE /u);
  assert.equal(plan.status.roleProvisioned, false);
  assert.equal(plan.status.credentialsCreated, false);
  assert.equal(plan.status.tlsStatus, "TLS_REQUIRED_PENDING");
  assert.match(plan.rollbackSql, /DROP ROLE "ps_runtime_test";/u);
  assert.match(plan.rollbackSql, /NOT rolcanlogin/u);
  assert.doesNotMatch(plan.rollbackSql, /DROP OWNED|FROM PUBLIC|ALTER ROLE "migration_test"|DROP ROLE "migration_test"/u);
});

test("preparación rechaza identidad ambigua, inyección, credenciales e inventario cambiado", () => {
  for (const change of [
    { schema: undefined }, { schema: "pg_catalog" }, { schema: "information_schema" },
    { database: "other'; DROP ROLE postgres;--" }, { fingerprint: "a".repeat(32) },
    { schemaVersion: "20260921182000_schema_contract_marker" },
    { runtimeRole: "migration_test" }, { runtimeRole: "postgres" }, { password: "not-a-credential" },
    { connectionUrl: "not-a-connection" },
  ]) assert.throws(() => prepareRuntimeRolePlan({ ...manifest(), ...change }, source));
  assert.throws(() => prismaRoleInventory(source.replace("model Voter {", "model LostInventory {\n@@schema(\"other\")")), /MULTIPLE_SCHEMA/u);
  assert.throws(() => prismaRoleInventory(source + "\nmodel AddedTable {\n id String @id\n}\n"), /INVENTORY_CHANGED/u);
});

test("secuencias sólo se resuelven por dependencia de columnas Prisma autoincrement", () => {
  const plan = prepareRuntimeRolePlan(manifest(), source.replace("model Voter {", "model Voter {\n auditSequence Int @default(autoincrement())"));
  assert.deepEqual(plan.inventory.sequenceColumns, [{ table: "Voter", column: "auditSequence" }]);
  assert.match(plan.sql, /tbl\.relname = 'Voter' AND a\.attname = 'auditSequence'/u);
  assert.match(plan.sql, /d\.deptype IN \('a', 'i'\)/u);
  assert.doesNotMatch(plan.sql, /ALL SEQUENCES/u);
});

test("CLI prepara únicamente archivos nuevos y mantiene estado pendiente", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "politica-role-preparation-"));
  try {
    const input = join(temporary, "manifest.json");
    const output = join(temporary, "review");
    await writeFile(input, JSON.stringify(manifest()));
    await prepareRuntimeRoleFiles(["--manifest", input, "--output-dir", output]);
    const status = JSON.parse(await readFile(join(output, "status.json"), "utf8"));
    assert.equal(status.status, "PREPARED_NOT_EXECUTED");
    assert.equal(status.loginEnabled, false);
    await assert.rejects(prepareRuntimeRoleFiles(["--manifest", input, "--output-dir", output]), { code: "EEXIST" });
  } finally {
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(resolve(temporary).startsWith(join(resolve(tmpdir()), "politica-role-preparation-")));
    await rm(temporary, { recursive: true, force: true });
  }
});
