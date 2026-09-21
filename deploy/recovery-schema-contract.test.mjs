import assert from "node:assert/strict";
import test from "node:test";
import { EXPECTED_SCHEMA_VERSION, validateDatabaseIdentity } from "./migrate.mjs";

test("known prior schema markers may migrate but cannot pass final readiness", () => {
  for (const schemaVersion of ["20260909310000_schema_contract_marker", "20260909340000_schema_contract_marker"]) {
    const rows = [{ fingerprint: "a".repeat(64), schemaVersion }];
    assert.deepEqual(validateDatabaseIdentity(rows), rows[0]);
    assert.throws(() => validateDatabaseIdentity(rows, { requireCurrent: true }), /invalida/);
  }
});

test("only the repaired current marker passes the final migration contract", () => {
  const rows = [{ fingerprint: "b".repeat(64), schemaVersion: EXPECTED_SCHEMA_VERSION }];
  assert.deepEqual(validateDatabaseIdentity(rows, { requireCurrent: true }), rows[0]);
});

test("unknown, malformed and duplicate database identities remain rejected", () => {
  for (const rows of [[], [{ fingerprint: "c".repeat(64), schemaVersion: "20990101000000_schema_contract_marker" }], [{ fingerprint: "invalid", schemaVersion: EXPECTED_SCHEMA_VERSION }], [{ fingerprint: "d".repeat(64), schemaVersion: EXPECTED_SCHEMA_VERSION }, { fingerprint: "d".repeat(64), schemaVersion: EXPECTED_SCHEMA_VERSION }]]) {
    assert.throws(() => validateDatabaseIdentity(rows), /invalida/);
  }
});
