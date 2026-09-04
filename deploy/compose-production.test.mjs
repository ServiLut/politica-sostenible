import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PROJECT_ROOT = new URL("../", import.meta.url);

test("Docker raiz incluye el contrato baseline para una adopcion segura", async () => {
  const [dockerfile, migrator, baselineSchema] = await Promise.all([
    readFile(new URL("Dockerfile", PROJECT_ROOT), "utf8"),
    readFile(new URL("deploy/migrate.mjs", PROJECT_ROOT), "utf8"),
    readFile(
      new URL("apps/api/prisma/baseline.schema.prisma", PROJECT_ROOT),
      "utf8",
    ),
  ]);

  assert.match(
    dockerfile,
    /COPY --from=builder .*\/prisma\/baseline\.schema\.prisma \.\/apps\/api\/prisma\/baseline\.schema\.prisma/,
  );
  for (const buildArgument of [
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]) {
    assert.match(dockerfile, new RegExp(`^ARG ${buildArgument}$`, "m"));
    assert.match(dockerfile, new RegExp(`test -n "\\$${buildArgument}"`));
  }
  assert.doesNotMatch(
    dockerfile,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  );
  assert.match(migrator, /baseline\.schema\.prisma/);
  assert.match(migrator, /--to-schema/);
  assert.match(baselineSchema, /IMMUTABLE DEPLOYMENT CONTRACT/);
  assert.doesNotMatch(baselineSchema, /mustChangePassword/);
  assert.doesNotMatch(baselineSchema, /WitnessReportStatus/);
});

test("compose ejecuta migraciones con normalizacion y guard TLS", async () => {
  const [compose, dockerfile, entrypoint, environmentExample] =
    await Promise.all([
      readFile(new URL("compose.production.yml", PROJECT_ROOT), "utf8"),
      readFile(new URL("apps/api/Dockerfile", PROJECT_ROOT), "utf8"),
      readFile(new URL("deploy/migrate-entrypoint.mjs", PROJECT_ROOT), "utf8"),
      readFile(new URL(".env.example", PROJECT_ROOT), "utf8"),
    ]);

  const migrateService = compose.split(/^  api:/m)[0];
  assert.match(migrateService, /target: migrator/);
  assert.match(migrateService, /NODE_ENV: production/);
  assert.match(
    migrateService,
    /DEPLOYMENT_PROFILE: \$\{DEPLOYMENT_PROFILE:-production\}/,
  );
  assert.match(
    migrateService,
    /ALLOW_INSECURE_DATABASE_CONNECTION: \$\{ALLOW_INSECURE_DATABASE_CONNECTION:-false\}/,
  );
  assert.match(migrateService, /DATABASE_URL: \$\{DATABASE_URL:-\}/);
  assert.match(migrateService, /DIRECT_URL: \$\{DIRECT_URL:-\}/);
  assert.match(
    migrateService,
    /POSTGRES_URL_NON_POOLING: \$\{POSTGRES_URL_NON_POOLING:-\}/,
  );
  assert.match(migrateService, /DATABASE_SSL: \$\{DATABASE_SSL:-true\}/);
  assert.match(
    migrateService,
    /DATABASE_SSL_REJECT_UNAUTHORIZED: \$\{DATABASE_SSL_REJECT_UNAUTHORIZED:-true\}/,
  );

  assert.match(
    dockerfile,
    /COPY --chown=node:node deploy\/runtime-environment\.mjs \.\/deploy\/runtime-environment\.mjs/,
  );
  assert.match(
    dockerfile,
    /CMD \["node", "deploy\/migrate-entrypoint\.mjs"\]/,
  );
  assert.match(entrypoint, /runSafeMigrations\(\)/);
  assert.match(
    environmentExample,
    /POSTGRES_URL_NON_POOLING=.*sslmode=verify-full/,
  );
  assert.match(environmentExample, /DEPLOYMENT_PROFILE=production/);
  assert.match(
    environmentExample,
    /ALLOW_INSECURE_DATABASE_CONNECTION=false/,
  );
});
