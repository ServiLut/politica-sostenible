import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATIONS_DIRECTORY = new URL(
  "../apps/api/prisma/migrations/",
  import.meta.url,
);

const HISTORY_SENSITIVE_CHECKSUMS = Object.freeze({
  "20260905130000_subscription_plans":
    "3c0eab259d299491ca612c6ae011d9b51f826800ed7d6f8b45a1ca0bceb17338",
  "20260905140000_colombia_pmf_features":
    "4b69078f4848c7da9819758323cf85f7563df3bd97364dd2f9d81976c3bb088f",
});

const TRANSACTIONAL_MULTI_STATEMENT_MIGRATIONS = Object.freeze([
  "20260907160000_finance_compliance_file",
  "20260907170000_witness_report_traceability",
  "20260907180000_auth_session_replay",
  "20260907190000_database_identity",
  "20260907200000_proposal_status_lifecycle",
]);

async function migrationFiles() {
  const entries = await readdir(MIGRATIONS_DIRECTORY, {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      url: new URL(`${entry.name}/migration.sql`, MIGRATIONS_DIRECTORY),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function assertPlainUtf8(name, contents) {
  const hasUtf8Bom =
    contents[0] === 0xef && contents[1] === 0xbb && contents[2] === 0xbf;
  const hasUtf16Bom =
    (contents[0] === 0xff && contents[1] === 0xfe) ||
    (contents[0] === 0xfe && contents[1] === 0xff);

  assert.equal(hasUtf8Bom, false, `${name} no debe contener BOM UTF-8`);
  assert.equal(hasUtf16Bom, false, `${name} no debe usar UTF-16`);
  assert.equal(
    contents.includes(0x0d),
    false,
    `${name} debe usar exclusivamente saltos de línea LF`,
  );
  assert.doesNotThrow(
    () => new TextDecoder("utf-8", { fatal: true }).decode(contents),
    `${name} debe ser UTF-8 valido`,
  );
}

function schemaEvents(sql) {
  const found = [];
  const createPatterns = [
    ["type", /CREATE\s+TYPE\s+"([^"]+)"/giu],
    ["table", /CREATE\s+TABLE\s+"([^"]+)"/giu],
    ["index", /CREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"/giu],
  ];

  for (const [kind, pattern] of createPatterns) {
    for (const match of sql.matchAll(pattern)) {
      found.push({
        action: "create",
        index: match.index,
        key: `${kind}:${match[1]}`,
        label: `${kind} ${match[1]}`,
      });
    }
  }

  for (const match of sql.matchAll(
    /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"/giu,
  )) {
    found.push({
      action: "create",
      index: match.index,
      key: `constraint:${match[1]}:${match[2]}`,
      label: `constraint ${match[1]}.${match[2]}`,
    });
  }

  const dropPatterns = [
    ["type", /DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/giu],
    ["table", /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/giu],
    ["index", /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/giu],
  ];

  for (const [kind, pattern] of dropPatterns) {
    for (const match of sql.matchAll(pattern)) {
      found.push({
        action: "drop",
        index: match.index,
        key: `${kind}:${match[1]}`,
        label: `${kind} ${match[1]}`,
      });
    }
  }

  for (const match of sql.matchAll(
    /ALTER\s+TABLE\s+"([^"]+)"\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/giu,
  )) {
    found.push({
      action: "drop",
      index: match.index,
      key: `constraint:${match[1]}:${match[2]}`,
      label: `constraint ${match[1]}.${match[2]}`,
    });
  }

  return found.sort((left, right) => left.index - right.index);
}

test("las migraciones SQL usan UTF-8 sin BOM", async () => {
  for (const migration of await migrationFiles()) {
    assertPlainUtf8(migration.name, await readFile(migration.url));
  }
});

test("las migraciones con historial ambiguo conservan su blob canónico", async () => {
  const files = new Map(
    (await migrationFiles()).map((migration) => [migration.name, migration]),
  );

  for (const [name, expectedChecksum] of Object.entries(
    HISTORY_SENSITIVE_CHECKSUMS,
  )) {
    const migration = files.get(name);
    assert.ok(migration, `${name} debe existir`);
    const checksum = createHash("sha256")
      .update(await readFile(migration.url))
      .digest("hex");
    assert.equal(
      checksum,
      expectedChecksum,
      `${name} cambió; no reescribas migraciones publicadas`,
    );
  }
});

test("las migraciones nuevas de varias sentencias son atómicas", async () => {
  const files = new Map(
    (await migrationFiles()).map((migration) => [migration.name, migration]),
  );

  for (const name of TRANSACTIONAL_MULTI_STATEMENT_MIGRATIONS) {
    const migration = files.get(name);
    assert.ok(migration, `${name} debe existir`);
    const sql = (await readFile(migration.url, "utf8")).trim();
    const executableSql = sql.replace(
      /^(?:(?:[ \t]*--[^\n]*(?:\n|$))|\s)*/u,
      "",
    );
    assert.match(
      executableSql,
      /^BEGIN;\s/iu,
      `${name} debe abrir una transacción antes de ejecutar DDL o DML`,
    );
    assert.match(sql, /\sCOMMIT;$/iu, `${name} debe cerrar la transacción`);
  }
});

test("la cadena de migraciones no vuelve a crear objetos ya declarados", async () => {
  const firstDeclaration = new Map();

  for (const migration of await migrationFiles()) {
    const sql = await readFile(migration.url, "utf8");
    for (const event of schemaEvents(sql)) {
      if (event.action === "drop") {
        firstDeclaration.delete(event.key);
        continue;
      }

      const previousMigration = firstDeclaration.get(event.key);
      assert.equal(
        previousMigration,
        undefined,
        `${event.label} se declara en ${previousMigration} y nuevamente en ${migration.name}`,
      );
      firstDeclaration.set(event.key, migration.name);
    }
  }
});
