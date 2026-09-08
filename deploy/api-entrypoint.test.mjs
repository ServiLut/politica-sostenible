import assert from "node:assert/strict";
import test from "node:test";

import { startApi } from "./api-entrypoint.mjs";

const validEnvironment = {
  NODE_ENV: "production",
  DEPLOYMENT_PROFILE: "evaluation",
  ALLOW_INSECURE_DATABASE_CONNECTION: "false",
  DATABASE_URL:
    "postgresql://runtime:secret@pool.invalid.co:5432/politica?sslmode=verify-full&schema=politica",
  DIRECT_URL:
    "postgresql://migration:secret@db.invalid.co:5432/politica?sslmode=verify-full&schema=politica",
  DATABASE_SSL: "true",
  DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
  JWT_SECRET: "0123456789abcdefghijklmnopqrstuvwxyz-API",
  CONSENT_IP_SALT: "abcdefghijklmnopqrstuvwxyz0123456789-SALT",
  SAAS_ADMIN_USER_IDS: "00000000-0000-4000-8000-000000000001",
  MFA_TOTP_ACTIVE_KEY_ID: "key-2026-09",
  MFA_TOTP_ENCRYPTION_KEY:
    "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  MFA_TOTP_LEGACY_PLAINTEXT_MODE: "reject",
  SUPABASE_URL: "https://storage.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "evaluation-only-storage-service-role-fixture",
  SUPABASE_STORAGE_BUCKET: "politica-private",
  CORS_ORIGINS: "https://politica.invalid.co",
};

test("el entrypoint separado valida antes de cargar NestJS", async () => {
  let loads = 0;
  await startApi({ ...validEnvironment }, async () => {
    loads += 1;
  });
  assert.equal(loads, 1);

  await assert.rejects(
    startApi(
      { ...validEnvironment, JWT_SECRET: "replace-with-a-long-public-secret" },
      async () => {
        loads += 1;
      },
    ),
    /placeholder publico/,
  );
  assert.equal(loads, 1);
});
