import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_WORKER_MAX_HEARTBEAT_AGE_MS,
  catalogWorkerHealthIssues,
  requireCatalogWorkerHealth,
} from "./catalog-worker-healthcheck.mjs";

const NOW = Date.parse("2026-09-09T18:00:00.000Z");

function healthyOptions(overrides = {}) {
  const heartbeat = new Date(NOW - 10_000).toISOString();
  return {
    now: NOW,
    readHeartbeat: () => heartbeat,
    statHeartbeat: () => ({
      isFile: () => true,
      mtimeMs: NOW - 10_000,
      size: Buffer.byteLength(heartbeat),
    }),
    ...overrides,
  };
}

test("acepta un heartbeat reciente y regular", () => {
  assert.deepEqual(catalogWorkerHealthIssues(healthyOptions()), []);
  assert.doesNotThrow(() => requireCatalogWorkerHealth(healthyOptions()));
});

test("falla cerrado cuando el heartbeat no existe", () => {
  const options = healthyOptions({
    statHeartbeat: () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
  });

  assert.deepEqual(catalogWorkerHealthIssues(options), [
    "heartbeat ausente o ilegible",
  ]);
  assert.throws(() => requireCatalogWorkerHealth(options), /no saludable/);
});

test("rechaza heartbeat vencido, futuro, invalido o no regular", () => {
  assert.ok(
    catalogWorkerHealthIssues(
      healthyOptions({
        readHeartbeat: () =>
          new Date(NOW - CATALOG_WORKER_MAX_HEARTBEAT_AGE_MS - 1).toISOString(),
      }),
    ).includes("heartbeat vencido"),
  );
  assert.ok(
    catalogWorkerHealthIssues(
      healthyOptions({
        readHeartbeat: () => new Date(NOW + 5_001).toISOString(),
      }),
    ).includes("heartbeat esta fechado en el futuro"),
  );
  assert.ok(
    catalogWorkerHealthIssues(
      healthyOptions({ readHeartbeat: () => "not-a-date" }),
    ).includes("heartbeat no contiene una fecha ISO valida"),
  );
  assert.ok(
    catalogWorkerHealthIssues(
      healthyOptions({
        statHeartbeat: () => ({
          isFile: () => false,
          mtimeMs: NOW,
          size: 20,
        }),
      }),
    ).includes("heartbeat no es un archivo regular"),
  );
});

test("rechaza archivos anormalmente grandes y mtime vencido", () => {
  const issues = catalogWorkerHealthIssues(
    healthyOptions({
      statHeartbeat: () => ({
        isFile: () => true,
        mtimeMs: NOW - CATALOG_WORKER_MAX_HEARTBEAT_AGE_MS - 1,
        size: 65,
      }),
    }),
  );

  assert.ok(issues.includes("heartbeat excede el tamano esperado"));
  assert.ok(issues.includes("heartbeat vencido"));
});
