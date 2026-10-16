import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_SCHEMA_VERSION } from "./migrate.mjs";

const SOURCE = new URL("../apps/api/prisma/schema.prisma", import.meta.url);
const TABLE_COUNT = 120;
const manifestFields = ["database", "schema", "fingerprint", "schemaVersion", "runtimeRole", "migrationRole"];
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const fail = (code) => { throw new Error(code); };

export function prismaRoleInventory(source) {
  const tables = [];
  const sequenceColumns = [];
  for (const model of source.matchAll(/^model ([A-Za-z][A-Za-z0-9_]*) \{\r?\n([\s\S]*?)^\}/gmu)) {
    if (/@@schema\s*\(/u.test(model[2])) fail("MULTIPLE_SCHEMA_INVENTORY_UNSUPPORTED");
    if (/@@ignore\b/u.test(model[2]) || (/@@map\b/u.test(model[2]) && !/@@map\("([A-Za-z][A-Za-z0-9_]*)"\)/u.test(model[2]))) fail("REVIEW_REQUIRED_MODEL_MAPPING");
    const table = model[2].match(/@@map\("([A-Za-z][A-Za-z0-9_]*)"\)/u)?.[1] ?? model[1];
    if (!/^[A-Za-z][A-Za-z0-9_]{0,62}$/u.test(table)) fail("INVALID_TABLE_INVENTORY");
    tables.push(table);
    for (const line of model[2].split(/\r?\n/u)) {
      if (!/@default\(autoincrement\(\)\)/u.test(line)) continue;
      const field = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s+/u)?.[1];
      const column = line.match(/@map\("([A-Za-z][A-Za-z0-9_]*)"\)/u)?.[1] ?? field;
      if (!column) fail("INVALID_SEQUENCE_INVENTORY");
      sequenceColumns.push({ table, column });
    }
  }
  if (tables.length !== TABLE_COUNT || new Set(tables).size !== TABLE_COUNT || !tables.includes("SystemDatabaseIdentity"))
    fail("REVIEW_REQUIRED_PRISMA_TABLE_INVENTORY_CHANGED");
  return {
    tables: tables.sort(), sequenceColumns,
    sourceSha256: createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex"),
  };
}

export function prepareRuntimeRolePlan(manifest, source) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) ||
      Object.keys(manifest).sort().join() !== [...manifestFields].sort().join()) fail("INVALID_MANIFEST_FIELDS");
  for (const field of ["database", "schema", "migrationRole"]) {
    if (typeof manifest[field] !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,62}$/u.test(manifest[field])) fail("INVALID_TARGET_IDENTIFIER");
  }
  if (/^(?:pg_|information_schema$)/iu.test(manifest.schema)) fail("SYSTEM_SCHEMA_FORBIDDEN");
  if (typeof manifest.runtimeRole !== "string" || !/^ps_runtime_[a-z0-9_]{3,40}$/u.test(manifest.runtimeRole) ||
      manifest.runtimeRole === manifest.migrationRole) fail("DISTINCT_NEW_RUNTIME_ROLE_REQUIRED");
  if (typeof manifest.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(manifest.fingerprint)) fail("EXACT_DATABASE_FINGERPRINT_REQUIRED");
  if (manifest.schemaVersion !== EXPECTED_SCHEMA_VERSION) fail("CURRENT_SCHEMA_CONTRACT_REQUIRED");
  const inventory = prismaRoleInventory(source);
  const { database, schema, runtimeRole, migrationRole, fingerprint, schemaVersion } = manifest;
  const role = identifier(runtimeRole);
  const tableName = (name) => `${identifier(schema)}.${identifier(name)}`;
  const allowed = `ARRAY[${inventory.tables.map(literal).join(", ")}]::text[]`;
  const grants = inventory.tables.map((table) =>
    `GRANT ${table === "SystemDatabaseIdentity" ? "SELECT" : "SELECT, INSERT, UPDATE, DELETE"} ON TABLE ${tableName(table)} TO ${role};`,
  ).join("\n");
  // Only Prisma autoincrement columns can request a sequence. Each sequence is
  // resolved through its ownership dependency, never by a broad schema grant.
  const sequences = inventory.sequenceColumns.map(({ table, column }) => `
    SELECT seq.oid, seq.relname INTO STRICT sequence_row
      FROM pg_class seq JOIN pg_namespace ns ON ns.oid = seq.relnamespace
      JOIN pg_depend d ON d.objid = seq.oid AND d.classid = 'pg_class'::regclass
      JOIN pg_class tbl ON tbl.oid = d.refobjid AND d.refclassid = 'pg_class'::regclass
      JOIN pg_namespace tn ON tn.oid = tbl.relnamespace
      JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = d.refobjsubid
      WHERE ns.nspname = ${literal(schema)} AND tn.nspname = ${literal(schema)}
        AND tbl.relname = ${literal(table)} AND a.attname = ${literal(column)}
        AND seq.relkind = 'S' AND d.deptype IN ('a', 'i');
    IF NOT FOUND THEN RAISE EXCEPTION 'Expected owned sequence missing' USING ERRCODE = '23514'; END IF;
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO %I', ${literal(schema)}, sequence_row.relname, ${literal(runtimeRole)});`).join("\n");
  const sql = `-- PREPARATION ONLY. Review and authorize before executing with the separate migration identity.
-- Source Prisma SHA-256: ${inventory.sourceSha256}; explicit tables: ${inventory.tables.length}.
-- No password, LOGIN, existing-role changes, default privileges or broad table grants.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $ps_role_preflight$
DECLARE expected_table TEXT;
BEGIN
  IF current_database() <> ${literal(database)} OR current_user <> ${literal(migrationRole)} THEN
    RAISE EXCEPTION 'Wrong database or migration identity' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(runtimeRole)}) THEN
    RAISE EXCEPTION 'Runtime role already exists; no existing role may be changed' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ${literal(schema)}) THEN
    RAISE EXCEPTION 'Exact target schema missing' USING ERRCODE = '23514';
  END IF;
  FOREACH expected_table IN ARRAY ${allowed} LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${literal(schema)} AND c.relname = expected_table AND c.relkind IN ('r', 'p')) THEN
      RAISE EXCEPTION 'Prisma table inventory mismatch' USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$ps_role_preflight$;
LOCK TABLE ${inventory.tables.map(tableName).join(", ")} IN ACCESS SHARE MODE;
DO $ps_role_identity$
BEGIN
  IF (SELECT count(*) FROM ${tableName("SystemDatabaseIdentity")}) <> 1 OR
    (SELECT count(*) FROM ${tableName("SystemDatabaseIdentity")} WHERE "id" = 'primary'
      AND "fingerprint" = ${literal(fingerprint)} AND "schemaVersion" = ${literal(schemaVersion)}) <> 1 THEN
    RAISE EXCEPTION 'Exact database identity or schema contract mismatch' USING ERRCODE = '23514';
  END IF;
END;
$ps_role_identity$;
CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE ${identifier(database)} TO ${role};
GRANT USAGE ON SCHEMA ${identifier(schema)} TO ${role};
ALTER ROLE ${role} IN DATABASE ${identifier(database)} SET search_path TO ${identifier(schema)}, pg_catalog;
${grants}
${sequences ? `DO $ps_role_sequences$ DECLARE sequence_row RECORD; BEGIN${sequences}\nEND; $ps_role_sequences$;` : "-- No Prisma autoincrement columns: no sequence privileges are required or granted."}
DO $ps_role_effective_access$
BEGIN
  -- NOINHERIT does not remove PUBLIC privileges. Fail instead of revoking
  -- cluster/shared-database rights that may belong to the other applications.
  IF has_database_privilege(${literal(runtimeRole)}, current_database(), 'CREATE') OR EXISTS (
    SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND has_schema_privilege(${literal(runtimeRole)}, n.oid, 'CREATE')
  ) THEN RAISE EXCEPTION 'Inherited schema creation privileges require separate review' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND NOT (n.nspname = ${literal(schema)} AND c.relname = ANY(${allowed}))
      AND (has_table_privilege(${literal(runtimeRole)}, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR CASE WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f') THEN has_any_column_privilege(${literal(runtimeRole)}, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') ELSE FALSE END)
  ) THEN RAISE EXCEPTION 'Inherited access outside explicit Prisma inventory requires review' USING ERRCODE = '23514'; END IF;
  IF has_table_privilege(${literal(runtimeRole)}, ${literal(tableName("SystemDatabaseIdentity"))}, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege(${literal(runtimeRole)}, ${literal(tableName("SystemDatabaseIdentity"))}, 'INSERT,UPDATE,REFERENCES') OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${literal(schema)} AND c.relname = ANY(${allowed})
      AND (has_table_privilege(${literal(runtimeRole)}, c.oid, 'TRUNCATE,REFERENCES,TRIGGER')
        OR CASE WHEN c.relkind IN ('r', 'p') THEN has_any_column_privilege(${literal(runtimeRole)}, c.oid, 'REFERENCES') ELSE FALSE END)
  ) THEN RAISE EXCEPTION 'Inherited privileges exceed runtime table rights' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class seq JOIN pg_namespace ns ON ns.oid = seq.relnamespace
    WHERE ns.nspname !~ '^pg_' AND ns.nspname <> 'information_schema' AND seq.relkind = 'S'
      AND CASE WHEN seq.relkind = 'S' THEN has_sequence_privilege(${literal(runtimeRole)}, seq.oid, 'USAGE,SELECT,UPDATE') ELSE FALSE END
      AND (CASE WHEN seq.relkind = 'S' THEN has_sequence_privilege(${literal(runtimeRole)}, seq.oid, 'UPDATE') ELSE FALSE END
        OR NOT (${inventory.sequenceColumns.length ? inventory.sequenceColumns.map(({ table, column }) => `EXISTS (
        SELECT 1 FROM pg_depend d JOIN pg_class tbl ON tbl.oid = d.refobjid
        JOIN pg_namespace tn ON tn.oid = tbl.relnamespace
        JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = d.refobjsubid
        WHERE d.objid = seq.oid AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
          AND d.deptype IN ('a', 'i') AND ns.nspname = ${literal(schema)} AND tn.nspname = ${literal(schema)}
          AND tbl.relname = ${literal(table)} AND a.attname = ${literal(column)})`).join(" OR ") : "FALSE"}))
  ) THEN RAISE EXCEPTION 'Inherited sequence access exceeds runtime inventory rights' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype AND has_function_privilege(${literal(runtimeRole)}, p.oid, 'EXECUTE')
  ) THEN RAISE EXCEPTION 'Executable SECURITY DEFINER functions require separate review' USING ERRCODE = '23514'; END IF;
END;
$ps_role_effective_access$;
COMMIT;
-- STOP: role remains NOLOGIN. Password provisioning, TLS and the runtime
-- connection switch are separate authorized operator actions, never automated here.
`;
  const rollbackSql = `-- PREPARATION ONLY: rollback is limited to the new, still-unused NOLOGIN role.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $ps_role_rollback_guard$
DECLARE target_oid OID;
BEGIN
  IF current_database() <> ${literal(database)} OR current_user <> ${literal(migrationRole)} THEN
    RAISE EXCEPTION 'Wrong rollback database or migration identity' USING ERRCODE = '23514'; END IF;
  IF (SELECT count(*) FROM ${tableName("SystemDatabaseIdentity")}) <> 1 OR
     (SELECT count(*) FROM ${tableName("SystemDatabaseIdentity")} WHERE "id" = 'primary'
      AND "fingerprint" = ${literal(fingerprint)} AND "schemaVersion" = ${literal(schemaVersion)}) <> 1 THEN
    RAISE EXCEPTION 'Wrong rollback database identity' USING ERRCODE = '23514'; END IF;
  SELECT oid INTO target_oid FROM pg_roles WHERE rolname = ${literal(runtimeRole)}
    AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
    AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM pg_stat_activity WHERE usename = ${literal(runtimeRole)}) OR
    EXISTS (SELECT 1 FROM pg_auth_members WHERE roleid = target_oid OR member = target_oid) OR
    EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid = 'pg_authid'::regclass AND refobjid = target_oid AND deptype = 'o') THEN
    RAISE EXCEPTION 'Runtime role is active, changed, owns objects or has memberships; manual review required' USING ERRCODE = '23514'; END IF;
END;
$ps_role_rollback_guard$;
${inventory.tables.map((table) => `REVOKE ${table === "SystemDatabaseIdentity" ? "SELECT" : "SELECT, INSERT, UPDATE, DELETE"} ON TABLE ${tableName(table)} FROM ${role};`).join("\n")}
${sequences ? `DO $ps_role_sequences$ DECLARE sequence_row RECORD; BEGIN${sequences.replaceAll("GRANT USAGE, SELECT ON SEQUENCE %I.%I TO %I", "REVOKE USAGE, SELECT ON SEQUENCE %I.%I FROM %I")}\nEND; $ps_role_sequences$;` : ""}
REVOKE USAGE ON SCHEMA ${identifier(schema)} FROM ${role};
REVOKE CONNECT ON DATABASE ${identifier(database)} FROM ${role};
DROP ROLE ${role};
COMMIT;
`;
  return {
    sql,
    rollbackSql,
    inventory,
    status: {
      kind: "politica-runtime-role-preparation", status: "PREPARED_NOT_EXECUTED",
      tlsStatus: "TLS_REQUIRED_PENDING", roleProvisioned: false, loginEnabled: false,
      credentialsCreated: false, sourceSha256: inventory.sourceSha256,
      tableCount: inventory.tables.length, sequenceColumnCount: inventory.sequenceColumns.length,
      schemaVersion,
    },
  };
}

export async function prepareRuntimeRoleFiles(args) {
  if (args.length !== 4 || args[0] !== "--manifest" || args[2] !== "--output-dir") fail("USAGE_MANIFEST_AND_NEW_OUTPUT_DIRECTORY_REQUIRED");
  const manifestText = await readFile(resolve(args[1]), "utf8");
  if (Buffer.byteLength(manifestText) > 4096) fail("MANIFEST_TOO_LARGE");
  const plan = prepareRuntimeRolePlan(JSON.parse(manifestText), await readFile(SOURCE, "utf8"));
  const output = resolve(args[3]);
  await mkdir(output, { mode: 0o700 }); // Refuse to overwrite an earlier review package.
  for (const [name, body] of Object.entries({
    "runtime-role.sql": plan.sql,
    "rollback-unused-role.sql": plan.rollbackSql,
    "prisma-inventory.json": JSON.stringify(plan.inventory, null, 2) + "\n",
    "status.json": JSON.stringify(plan.status, null, 2) + "\n",
  })) await writeFile(resolve(output, name), body, { flag: "wx", mode: 0o600 });
  return plan.status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareRuntimeRoleFiles(process.argv.slice(2))
    .then(() => console.info("PREPARED_NOT_EXECUTED; TLS_REQUIRED_PENDING; no credentials created"))
    .catch(() => { console.error("RUNTIME_ROLE_PREPARATION_FAILED: review inputs locally; no database operation was performed"); process.exitCode = 1; });
}
