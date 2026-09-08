import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SUPERVISOR_SHUTDOWN_GRACE_MS } from "./start.mjs";

const PROJECT_ROOT = new URL("../", import.meta.url);

test("no conserva el bootstrap legado de Storage público", async () => {
  for (const relativePath of [
    "apps/api/setup-storage.ts",
    "apps/api/prisma/migrations/storage_setup.sql",
  ]) {
    await assert.rejects(
      readFile(new URL(relativePath, PROJECT_ROOT), "utf8"),
      {
        code: "ENOENT",
      },
    );
  }
});

test("Docker raiz incluye el contrato baseline para una adopcion segura", async () => {
  const [dockerfile, migrator, baselineSchema, publicBuildGuard] =
    await Promise.all([
      readFile(new URL("Dockerfile", PROJECT_ROOT), "utf8"),
      readFile(new URL("deploy/migrate.mjs", PROJECT_ROOT), "utf8"),
      readFile(
        new URL("apps/api/prisma/baseline.schema.prisma", PROJECT_ROOT),
        "utf8",
      ),
      readFile(
        new URL("deploy/public-build-environment.mjs", PROJECT_ROOT),
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
    assert.match(
      dockerfile,
      new RegExp(`^ENV ${buildArgument}=\\$${buildArgument}$`, "m"),
    );
  }
  assert.doesNotMatch(
    dockerfile,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  );
  assert.match(dockerfile, /API_PROCESS_UID=1001/);
  assert.match(dockerfile, /WEB_PROCESS_UID=1002/);
  assert.match(dockerfile, /SUPERVISOR_SHUTDOWN_GRACE_MS=30000/);
  assert.match(
    dockerfile,
    /COPY --from=builder .*schema-engine-linux-musl-openssl-3\.0\.x/,
  );
  assert.doesNotMatch(dockerfile, /^USER politica$/m);
  assert.match(dockerfile, /^STOPSIGNAL SIGTERM$/m);
  assert.match(dockerfile, /node deploy\/public-build-environment\.mjs/);
  assert.match(publicBuildGuard, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(migrator, /baseline\.schema\.prisma/);
  assert.match(migrator, /--to-schema/);
  assert.match(baselineSchema, /IMMUTABLE DEPLOYMENT CONTRACT/);
  assert.doesNotMatch(baselineSchema, /mustChangePassword/);
  assert.doesNotMatch(baselineSchema, /WitnessReportStatus/);
});

test("todas las imagenes publican revision y origen OCI verificables", async () => {
  const [rootDockerfile, apiDockerfile, webDockerfile, compose, workflow, env] =
    await Promise.all([
      readFile(new URL("Dockerfile", PROJECT_ROOT), "utf8"),
      readFile(new URL("apps/api/Dockerfile", PROJECT_ROOT), "utf8"),
      readFile(new URL("apps/web/Dockerfile", PROJECT_ROOT), "utf8"),
      readFile(new URL("compose.production.yml", PROJECT_ROOT), "utf8"),
      readFile(new URL(".github/workflows/ci.yml", PROJECT_ROOT), "utf8"),
      readFile(new URL(".env.example", PROJECT_ROOT), "utf8"),
    ]);

  for (const [dockerfile, expectedLabels] of [
    [rootDockerfile, 1],
    [apiDockerfile, 2],
    [webDockerfile, 1],
  ]) {
    assert.match(dockerfile, /^ARG APP_REVISION=unknown$/m);
    assert.match(
      dockerfile,
      /^ARG APP_SOURCE=https:\/\/github\.com\/ServiLut\/politica-sostenible$/m,
    );
    assert.match(dockerfile, /^ARG DEPLOYMENT_PROFILE=production$/m);
    assert.match(dockerfile, /RUN node deploy\/artifact-metadata\.mjs/);
    assert.equal(
      [...dockerfile.matchAll(/org\.opencontainers\.image\.revision=/g)].length,
      expectedLabels,
    );
    assert.equal(
      [...dockerfile.matchAll(/org\.opencontainers\.image\.source=/g)].length,
      expectedLabels,
    );
  }

  assert.equal(
    [...compose.matchAll(/APP_REVISION: \$\{APP_REVISION:-unknown\}/g)].length,
    3,
  );
  assert.match(env, /^APP_REVISION=replace-with-full-40-character-git-sha$/m);
  assert.match(workflow, /--build-arg APP_REVISION="\$GITHUB_SHA"/);
  assert.match(workflow, /APP_REVISION: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /branches: \[main, "release\/\*\*"\]/);
  assert.match(workflow, /org\.opencontainers\.image\.revision/);
});

test("compose ejecuta migraciones con normalizacion y guard TLS", async () => {
  const [
    compose,
    dockerfile,
    webDockerfile,
    entrypoint,
    apiEntrypoint,
    environmentExample,
  ] = await Promise.all([
    readFile(new URL("compose.production.yml", PROJECT_ROOT), "utf8"),
    readFile(new URL("apps/api/Dockerfile", PROJECT_ROOT), "utf8"),
    readFile(new URL("apps/web/Dockerfile", PROJECT_ROOT), "utf8"),
    readFile(new URL("deploy/migrate-entrypoint.mjs", PROJECT_ROOT), "utf8"),
    readFile(new URL("deploy/api-entrypoint.mjs", PROJECT_ROOT), "utf8"),
    readFile(new URL(".env.example", PROJECT_ROOT), "utf8"),
  ]);

  const migrateService = compose.split(/^  api:/m)[0];
  const apiService = compose.split(/^  api:/m)[1].split(/^  web:/m)[0];
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
  assert.match(apiService, /DATABASE_SCHEMA: \$\{DATABASE_SCHEMA:-\}/);
  assert.match(
    apiService,
    /SAAS_ADMIN_USER_IDS: \$\{SAAS_ADMIN_USER_IDS:\?SAAS_ADMIN_USER_IDS is required\}/,
  );
  assert.match(apiService, /SAAS_ADMIN_EMAILS: \$\{SAAS_ADMIN_EMAILS:-\}/);
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
  for (const service of [
    migrateService,
    apiService,
    compose.split(/^  web:/m)[1],
  ]) {
    assert.match(service, /pids_limit:/);
    assert.match(service, /mem_limit:/);
    assert.match(service, /cpus:/);
    assert.match(service, /max-size:/);
    assert.match(service, /max-file:/);
  }
  assert.match(apiService, /stop_grace_period: 40s/);
  assert.match(compose.split(/^  web:/m)[1], /stop_grace_period: 40s/);
  const stopGracePeriods = [
    ...compose.matchAll(/stop_grace_period: ([0-9]+)s/g),
  ].map((match) => Number(match[1]) * 1_000);
  assert.equal(stopGracePeriods.length, 2);
  assert.ok(
    stopGracePeriods.every(
      (gracePeriod) => gracePeriod > SUPERVISOR_SHUTDOWN_GRACE_MS,
    ),
  );

  assert.match(
    dockerfile,
    /COPY --chown=node:node deploy\/runtime-environment\.mjs \.\/deploy\/runtime-environment\.mjs/,
  );
  assert.match(dockerfile, /CMD \["node", "deploy\/migrate-entrypoint\.mjs"\]/);
  assert.match(entrypoint, /runSafeMigrations\(\)/);
  assert.match(entrypoint, /la base de datos puede haber cambiado/i);
  assert.doesNotMatch(entrypoint, /antes de modificar la base de datos/i);
  assert.match(dockerfile, /deploy\/api-entrypoint\.mjs/);
  assert.match(
    dockerfile,
    /CMD \["node", "\.\.\/\.\.\/deploy\/api-entrypoint\.mjs"\]/,
  );
  assert.match(apiEntrypoint, /requireRuntimeEnvironment\(environment\)/);
  assert.match(webDockerfile, /node deploy\/public-build-environment\.mjs/);
  assert.match(
    dockerfile,
    /HEALTHCHECK[\s\S]*127\.0\.0\.1:4000\/health\/ready/,
  );
  assert.match(dockerfile, /^STOPSIGNAL SIGTERM$/m);
  assert.match(
    webDockerfile,
    /HEALTHCHECK[\s\S]*127\.0\.0\.1:3000\/api\/health\/ready/,
  );
  assert.match(webDockerfile, /^STOPSIGNAL SIGTERM$/m);
  assert.match(
    environmentExample,
    /POSTGRES_URL_NON_POOLING=.*sslmode=verify-full/,
  );
  assert.match(environmentExample, /DEPLOYMENT_PROFILE=production/);
  assert.match(environmentExample, /^SUPERVISOR_SHUTDOWN_GRACE_MS=30000$/m);
  assert.match(
    environmentExample,
    /^SAAS_ADMIN_USER_IDS=replace-with-existing-user-uuid$/m,
  );
  assert.doesNotMatch(environmentExample, /^SAAS_ADMIN_EMAILS=/m);
  assert.match(environmentExample, /ALLOW_INSECURE_DATABASE_CONNECTION=false/);
});

test("CI construye y arranca físicamente la topología primaria separada", async () => {
  const [workflow, composeOverride] = await Promise.all([
    readFile(new URL(".github/workflows/ci.yml", PROJECT_ROOT), "utf8"),
    readFile(new URL("deploy/compose.ci.yml", PROJECT_ROOT), "utf8"),
  ]);

  assert.match(workflow, /^  compose-runtime-smoke:$/m);
  assert.match(workflow, /-f compose\.production\.yml/);
  assert.match(workflow, /-f deploy\/compose\.ci\.yml/);
  assert.match(workflow, /build\s*$/m);
  assert.match(workflow, /up -d\s*$/m);
  assert.match(workflow, /health\/ready/);
  assert.match(workflow, /ReadonlyRootfs/);
  assert.match(workflow, /DATABASE_URL\|DIRECT_URL\|JWT_SECRET/);
  assert.match(workflow, /stop --timeout 40 api web/);
  assert.match(workflow, /State\.ExitCode[^\n]+web_id[^\n]+\)" = "143"/);
  assert.match(workflow, /down --volumes --remove-orphans/);
  assert.match(composeOverride, /host\.docker\.internal:host-gateway/);
});
