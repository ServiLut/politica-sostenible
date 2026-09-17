import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { startCatalogWorker } from "./catalog-worker-entrypoint.mjs";

const PROJECT_ROOT = new URL("../", import.meta.url);

function validWorkerEnvironment() {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_PROFILE: "production",
    ALLOW_INSECURE_DATABASE_CONNECTION: "false",
    DATABASE_URL:
      "postgresql://worker:strong-password@database.internal:5432/politica?sslmode=verify-full&schema=politica-sostenible",
    DATABASE_SSL: "true",
    DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
    REDIS_URL:
      "rediss://default:redis-password-with-32-random-bytes@cache.internal:6380/0",
    REDIS_ALLOW_PLAINTEXT_INTERNAL: "false",
    SUPABASE_URL: "https://storage.internal",
    SUPABASE_SERVICE_ROLE_KEY:
      "storage-worker-service-role-with-more-than-32-bytes",
    SUPABASE_STORAGE_BUCKET: "politica-private",
  };
}

test("valida el entorno antes de cargar el proceso NestJS", async () => {
  let loads = 0;
  await startCatalogWorker(validWorkerEnvironment(), async () => {
    loads += 1;
  });
  assert.equal(loads, 1);

  await assert.rejects(
    startCatalogWorker(
      { ...validWorkerEnvironment(), REDIS_URL: "redis://public.co:6379" },
      async () => {
        loads += 1;
      },
    ),
    /REDIS_URL debe usar rediss/,
  );
  assert.equal(loads, 1);
});

test("el entorno minimo no necesita secretos de autenticacion de la API", async () => {
  const environment = validWorkerEnvironment();
  delete environment.JWT_SECRET;
  delete environment.MFA_TOTP_ENCRYPTION_KEY;
  delete environment.OFFLINE_SYNC_HMAC_SECRET;

  await assert.doesNotReject(
    startCatalogWorker(environment, async () => undefined),
  );
});

test("el entrypoint carga exclusivamente el artefacto compilado del worker", async () => {
  const source = await readFile(
    new URL("deploy/catalog-worker-entrypoint.mjs", PROJECT_ROOT),
    "utf8",
  );

  assert.match(
    source,
    /import\("\.\.\/apps\/api\/dist\/electoral-catalog-worker\.main\.js"\)/,
  );
  assert.doesNotMatch(source, /dist\/main\.js/);
  assert.match(source, /requireCatalogWorkerEnvironment\(environment\)/);
});
