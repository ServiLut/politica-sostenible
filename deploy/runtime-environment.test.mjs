import assert from "node:assert/strict";
import test from "node:test";

import {
  requireRuntimeEnvironment,
  runtimeEnvironmentIssues,
} from "./runtime-environment.mjs";

function validEnvironment() {
  return {
    DATABASE_URL:
      "postgresql://user:password@database.internal:5432/politica?schema=politica-sostenible",
    JWT_SECRET: "jwt-secret-with-more-than-thirty-two-random-bytes-2026",
    CONSENT_IP_SALT: "consent-salt-with-more-than-thirty-two-random-bytes",
    CORS_ORIGINS: "https://politica.example.com",
    NEXT_PUBLIC_APP_URL: "https://politica.example.com",
    SUPABASE_URL: "https://storage.example.com",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-generated-by-the-storage-service",
    SUPABASE_STORAGE_BUCKET: "politica-sostenible",
  };
}

test("acepta una configuracion de produccion completa", () => {
  assert.deepEqual(runtimeEnvironmentIssues(validEnvironment()), []);
  assert.doesNotThrow(() => requireRuntimeEnvironment(validEnvironment()));
});

test("rechaza los secretos publicos del archivo de ejemplo", () => {
  const environment = {
    ...validEnvironment(),
    JWT_SECRET:
      "generate-a-different-unique-secret-with-openssl-rand-base64-32",
    CONSENT_IP_SALT: "generate-an-independent-random-secret",
    SUPABASE_SERVICE_ROLE_KEY: "replace-me",
  };
  const issues = runtimeEnvironmentIssues(environment);

  assert.ok(issues.some((issue) => issue.startsWith("JWT_SECRET contiene")));
  assert.ok(
    issues.some((issue) => issue.startsWith("CONSENT_IP_SALT contiene")),
  );
  assert.ok(
    issues.some((issue) =>
      issue.startsWith("SUPABASE_SERVICE_ROLE_KEY contiene"),
    ),
  );
});

test("rechaza secretos cortos, variables faltantes y URLs inseguras", () => {
  const environment = {
    ...validEnvironment(),
    JWT_SECRET: "short",
    CONSENT_IP_SALT: "also-short",
    SUPABASE_STORAGE_BUCKET: "",
    SUPABASE_URL: "http://storage.example.com",
    NEXT_PUBLIC_APP_URL: "http://politica.example.com",
    CORS_ORIGINS: "https://one.example.com,http://two.example.com",
  };
  const issues = runtimeEnvironmentIssues(environment);

  assert.ok(issues.some((issue) => issue.includes("SUPABASE_STORAGE_BUCKET")));
  assert.ok(issues.some((issue) => issue.startsWith("JWT_SECRET debe")));
  assert.ok(issues.some((issue) => issue.startsWith("CONSENT_IP_SALT debe")));
  assert.ok(issues.some((issue) => issue.startsWith("SUPABASE_URL debe")));
  assert.ok(
    issues.some((issue) => issue.startsWith("NEXT_PUBLIC_APP_URL debe")),
  );
  assert.ok(issues.some((issue) => issue.startsWith("CORS_ORIGINS debe")));
});
