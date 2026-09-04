import assert from "node:assert/strict";
import test from "node:test";

import {
  migrationEnvironmentIssues,
  prepareRuntimeEnvironment,
  requireMigrationEnvironment,
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
    SUPABASE_URL: "https://storage.internal",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-generated-by-the-storage-service",
    SUPABASE_STORAGE_BUCKET: "politica-sostenible",
  };
}

test("acepta una configuracion de produccion completa", () => {
  const environment = {
    ...validEnvironment(),
    NODE_ENV: "production",
    DATABASE_URL:
      "postgresql://user:password@database.internal:5432/politica?sslmode=verify-full&schema=politica-sostenible",
    DIRECT_URL:
      "postgresql://user:password@database.internal:5432/politica?sslmode=verify-full&schema=politica-sostenible",
    DATABASE_SSL: "true",
    DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
  };

  assert.deepEqual(runtimeEnvironmentIssues(environment), []);
  assert.doesNotThrow(() => requireRuntimeEnvironment(environment));
});

test("produccion rechaza PostgreSQL sin TLS estricto", () => {
  const environment = {
    ...validEnvironment(),
    NODE_ENV: "production",
    DATABASE_URL:
      "postgresql://user:password@database.internal:5432/politica?sslmode=disable&schema=politica-sostenible",
    DIRECT_URL:
      "postgresql://user:password@database.internal:5432/politica?schema=politica-sostenible",
    DATABASE_SSL: "false",
    DATABASE_SSL_REJECT_UNAUTHORIZED: "false",
  };

  const issues = runtimeEnvironmentIssues(environment);
  assert.ok(
    issues.some((issue) => issue.startsWith("DATABASE_URL debe declarar")),
  );
  assert.ok(issues.some((issue) => issue.startsWith("DIRECT_URL debe declarar")));
  assert.ok(issues.includes("DATABASE_SSL debe ser true en produccion"));
  assert.ok(
    issues.includes(
      "DATABASE_SSL_REJECT_UNAUTHORIZED debe ser true en produccion",
    ),
  );
  assert.throws(
    () => requireRuntimeEnvironment(environment),
    /DATABASE_URL debe declarar sslmode/,
  );
});

test("el migrador normaliza aliases PostgreSQL y exige TLS antes de ejecutar", () => {
  const environment = {
    NODE_ENV: "production",
    DATABASE_URL:
      "postgresql://application:strong-password@pool.internal:6543/politica?pgbouncer=true&sslmode=verify-full&schema=politica-sostenible",
    POSTGRES_URL_NON_POOLING:
      "postgresql://application:strong-password@database.internal:5432/politica?sslmode=verify-full&schema=politica-sostenible",
    DATABASE_SSL: "true",
    DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
  };

  assert.doesNotThrow(() => requireMigrationEnvironment(environment));
  assert.equal(
    environment.DIRECT_URL,
    environment.POSTGRES_URL_NON_POOLING,
  );
  assert.deepEqual(migrationEnvironmentIssues(environment), []);
});

test("el migrador bloquea conexiones sin TLS estricto", () => {
  const environment = {
    NODE_ENV: "production",
    DATABASE_URL:
      "postgresql://application:strong-password@pool.internal:6543/politica?pgbouncer=true&sslmode=disable&schema=politica-sostenible",
    DIRECT_URL:
      "postgresql://application:strong-password@database.internal:5432/politica?sslmode=disable&schema=politica-sostenible",
    DATABASE_SSL: "false",
    DATABASE_SSL_REJECT_UNAUTHORIZED: "false",
  };

  const issues = migrationEnvironmentIssues(environment);
  assert.ok(
    issues.some((issue) => issue.startsWith("DATABASE_URL debe declarar")),
  );
  assert.ok(issues.some((issue) => issue.startsWith("DIRECT_URL debe declarar")));
  assert.throws(
    () => requireMigrationEnvironment(environment),
    /Configuracion de migracion invalida[\s\S]*sslmode/,
  );
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

test("rechaza las URLs plantilla literales del archivo de ejemplo", () => {
  const environment = {
    ...validEnvironment(),
    DATABASE_URL:
      "postgresql://USER:PASSWORD@HOST:6543/DATABASE?pgbouncer=true&schema=politica-sostenible",
    DIRECT_URL:
      "postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=politica-sostenible",
    SUPABASE_URL: "https://storage.example.com",
  };

  const issues = runtimeEnvironmentIssues(environment);

  assert.ok(
    issues.some((issue) => issue.startsWith("DATABASE_URL contiene")),
  );
  assert.ok(issues.some((issue) => issue.startsWith("DIRECT_URL contiene")));
  assert.ok(
    issues.some((issue) => issue.startsWith("SUPABASE_URL contiene")),
  );
  assert.throws(
    () => requireRuntimeEnvironment(environment),
    /DATABASE_URL contiene un placeholder/,
  );
});

test("rechaza hosts example.com reservados en conexiones de datos", () => {
  const environment = {
    ...validEnvironment(),
    DATABASE_URL:
      "postgresql://application:strong-secret@primary.example.com:5432/politica",
    DIRECT_URL:
      "postgresql://application:strong-secret@direct.example.com:5432/politica",
    SUPABASE_URL: "https://example.com",
  };

  const issues = runtimeEnvironmentIssues(environment);

  assert.ok(
    issues.some((issue) => issue.startsWith("DATABASE_URL contiene")),
  );
  assert.ok(issues.some((issue) => issue.startsWith("DIRECT_URL contiene")));
  assert.ok(
    issues.some((issue) => issue.startsWith("SUPABASE_URL contiene")),
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

test("recupera URLs placeholder usando componentes PostgreSQL completos", () => {
  const environment = {
    ...validEnvironment(),
    DATABASE_URL:
      "postgresql://postgres.your-tenant-id:replace-me@database.internal:6543/postgres?pgbouncer=true&sslmode=disable&schema=politica-sostenible",
    POSTGRES_URL_NON_POOLING:
      "postgresql://postgres.your-tenant-id:replace-me@database.internal:5432/postgres?sslmode=disable&schema=politica-sostenible",
    POSTGRES_HOST: "database.internal",
    POSTGRES_PORT: "5432",
    POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: "p@ss:/word with spaces",
    POSTGRES_DATABASE: "postgres",
  };

  prepareRuntimeEnvironment(environment);

  const runtimeUrl = new URL(environment.DATABASE_URL);
  assert.equal(runtimeUrl.hostname, "database.internal");
  assert.equal(runtimeUrl.port, "5432");
  assert.equal(runtimeUrl.username, "postgres");
  assert.equal(runtimeUrl.password, "p%40ss%3A%2Fword%20with%20spaces");
  assert.equal(runtimeUrl.searchParams.get("schema"), "politica-sostenible");
  assert.equal(runtimeUrl.searchParams.get("sslmode"), "disable");
  assert.equal(environment.DIRECT_URL, environment.DATABASE_URL);
  assert.deepEqual(runtimeEnvironmentIssues(environment), []);
});

test("acepta el tenant literal por defecto de Supavisor y normaliza el schema", () => {
  const environment = {
    ...validEnvironment(),
    DATABASE_SCHEMA: "politica-sostenible-v2",
    DATABASE_URL:
      "postgresql://postgres.your-tenant-id:strong-password@database.internal:6543/postgres?pgbouncer=true&schema=legacy",
    POSTGRES_URL_NON_POOLING:
      "postgresql://postgres.your-tenant-id:strong-password@database.internal:5432/postgres?schema=legacy",
  };

  prepareRuntimeEnvironment(environment);

  assert.equal(
    new URL(environment.DATABASE_URL).username,
    "postgres.your-tenant-id",
  );
  assert.equal(
    new URL(environment.DIRECT_URL).username,
    "postgres.your-tenant-id",
  );
  assert.equal(
    new URL(environment.DATABASE_URL).searchParams.get("schema"),
    "politica-sostenible-v2",
  );
  assert.equal(
    new URL(environment.DIRECT_URL).searchParams.get("schema"),
    "politica-sostenible-v2",
  );
  assert.deepEqual(runtimeEnvironmentIssues(environment), []);
});

test("recupera la plantilla DATABASE_URL del archivo de ejemplo", () => {
  const environment = {
    ...validEnvironment(),
    DATABASE_URL:
      "postgresql://USER:PASSWORD@HOST:6543/DATABASE?pgbouncer=true&schema=politica-sostenible",
    DIRECT_URL:
      "postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=politica-sostenible",
    POSTGRES_HOST: "database.internal",
    POSTGRES_PORT: "5432",
    POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: "strong-database-password",
    POSTGRES_DATABASE: "politica",
  };

  prepareRuntimeEnvironment(environment);

  const runtimeUrl = new URL(environment.DATABASE_URL);
  assert.equal(runtimeUrl.hostname, "database.internal");
  assert.equal(runtimeUrl.username, "postgres");
  assert.equal(runtimeUrl.pathname, "/politica");
  assert.equal(runtimeUrl.searchParams.get("schema"), "politica-sostenible");
  assert.equal(environment.DIRECT_URL, environment.DATABASE_URL);
  assert.deepEqual(runtimeEnvironmentIssues(environment), []);
});

test("no reemplaza una URL valida configurada por el operador", () => {
  const environment = {
    ...validEnvironment(),
    DIRECT_URL:
      "postgresql://operator:chosen@database.internal:5432/politica?schema=politica-sostenible",
    POSTGRES_HOST: "other.internal",
    POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: "other-password",
    POSTGRES_DATABASE: "postgres",
  };

  const expectedRuntime = environment.DATABASE_URL;
  const expectedDirect = environment.DIRECT_URL;
  prepareRuntimeEnvironment(environment);

  assert.equal(environment.DATABASE_URL, expectedRuntime);
  assert.equal(environment.DIRECT_URL, expectedDirect);
});

test("mantiene el error de placeholder si faltan componentes PostgreSQL", () => {
  const environment = {
    ...validEnvironment(),
    DATABASE_URL:
      "postgresql://postgres.your-tenant-id:replace-me@database.internal:6543/postgres",
  };

  assert.throws(
    () => requireRuntimeEnvironment(environment),
    /DATABASE_URL contiene un placeholder/,
  );
});
