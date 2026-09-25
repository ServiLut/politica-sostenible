/**
 * Real, isolated HTTP -> Supabase Storage -> BullMQ -> PostgreSQL verification.
 * Run only after the local staging compose stack is healthy:
 *   RUN_LOCAL_STAGING_STORAGE_WORKFLOW=true node deploy/staging/test-storage-workflow.mjs
 * No production/environment fallback, no mocked guards, database or Storage.
 * Retains explicitly synthetic fixtures and immutable audit rows in local volumes.
 * Does not activate the synthetic catalog or erase its underlying evidence.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const api = "http://127.0.0.1:5401";
const storage = "http://127.0.0.1:5800";
const web = "http://127.0.0.1:5310";
const bucket = "politica-local-staging-private";
const project = "politica-local-staging";
const root = fileURLToPath(new URL("../../", import.meta.url));
const envFile = fileURLToPath(
  new URL("../../.artifacts/staging/.env.local", import.meta.url),
);
const fixtureFile = fileURLToPath(
  new URL(
    "../../.artifacts/staging/storage-workflow-fixture.json",
    import.meta.url,
  ),
);
const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { createClient } = require("@supabase/supabase-js");
const runId = randomUUID();
let fixturePrefix = `storage_workflow_${runId}`;
let fixture;
let checks = 0;
const sessions = [];

function pass(label) {
  checks += 1;
  console.log(`PASS ${checks}: ${label}`);
}

function docker(args) {
  // Use only this task's isolated engine; never mutate/reconfigure Docker Desktop.
  const translate = (value) =>
    process.platform === "win32"
      ? value
          .replace(
            /^([A-Za-z]):[\\/]/,
            (_match, drive) => `/mnt/${drive.toLowerCase()}/`,
          )
          .replaceAll("\\", "/")
      : value;
  const command = process.platform === "win32" ? "wsl" : "docker";
  const prefix =
    process.platform === "win32"
      ? [
          "-d",
          "CodexPoliticaAudit20260925",
          "--",
          "docker",
          "-H",
          "unix:///run/politica-audit-docker.sock",
        ]
      : ["-H", "unix:///run/politica-audit-docker.sock"];
  const result = spawnSync(command, [...prefix, ...args.map(translate)], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 20_000,
  });
  // Never relay inspect output or Docker error text: either can contain secrets.
  assert.ok(
    !result.error && result.status === 0,
    "Local Docker identity inspection failed",
  );
  return result.stdout;
}

function inspectService(service) {
  const composeFile = fileURLToPath(new URL("./compose.yml", import.meta.url));
  const id = docker([
    "compose",
    "--env-file",
    envFile,
    "-f",
    composeFile,
    "ps",
    "-q",
    service,
  ]).trim();
  assert.match(
    id,
    /^[a-f0-9]{12,64}$/,
    `Expected one local staging ${service} container`,
  );
  const [container] = JSON.parse(docker(["inspect", id]));
  assert.equal(container.Config.Labels["com.docker.compose.project"], project);
  assert.equal(container.Config.Labels["com.docker.compose.service"], service);
  assert.equal(
    container.State.Status,
    "running",
    `Local ${service} is not running`,
  );
  assert.equal(
    container.State.Health.Status,
    "healthy",
    `Local ${service} is not healthy`,
  );
  return Object.fromEntries(
    container.Config.Env.map((line) => {
      const split = line.indexOf("=");
      return [line.slice(0, split), line.slice(split + 1)];
    }),
  );
}

async function request(
  path,
  { token, method = "GET", body, expected = 200 } = {},
) {
  assert.ok(
    path.startsWith("/") && !path.startsWith("//"),
    "Only relative API paths allowed",
  );
  const response = await fetch(`${api}${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(
    response.status,
    expected,
    `${method} ${path.split("?")[0]} returned HTTP ${response.status}`,
  );
  if (expected >= 400) {
    await response.arrayBuffer();
    return;
  }
  const envelope = await response.json();
  assert.equal(
    envelope.statusCode,
    expected,
    `Successful response envelope missing for ${path}`,
  );
  assert.ok(
    Object.hasOwn(envelope, "data"),
    `Successful data envelope missing for ${path}`,
  );
  return envelope.data;
}

async function poll(path, token, terminal) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const observed = await request(path, { token });
    if (terminal.includes(observed.status)) return observed;
    await delay(750);
  }
  throw new Error(
    `Local worker did not reach a terminal state within 60 seconds: ${path}`,
  );
}

async function register(label, termsVersion) {
  const account = fixture.accounts[label];
  const { email, password } = account;
  if (!account.tenantId) {
    const registered = await request("/auth/register", {
      method: "POST",
      expected: 201,
      body: {
        email,
        password,
        passwordConfirmation: password,
        name: `SYNTHETIC STORAGE TEST ${label}`,
        organizationName: `${fixturePrefix}_${label}`,
        organizationType: "CANDIDACY",
        termsAccepted: true,
        termsVersion,
      },
    });
    account.tenantId = registered.tenantId;
    await writeFile(fixtureFile, JSON.stringify(fixture), { mode: 0o600 });
  }
  assert.match(account.tenantId, /^[A-Za-z0-9_-]{1,128}$/);
  const loggedIn = await request("/auth/login", {
    method: "POST",
    expected: 201,
    body: { email, password },
  });
  assert.equal(typeof loggedIn.access_token, "string");
  assert.equal(loggedIn.user.tenant.id, account.tenantId);
  assert.equal(loggedIn.user.name, `SYNTHETIC STORAGE TEST ${label}`);
  assert.equal(loggedIn.user.role, "ADMIN");
  const session = { token: loggedIn.access_token, tenantId: account.tenantId };
  sessions.push(session);
  const current = await request("/auth/me", { token: session.token });
  assert.equal(current.user.tenant.id, session.tenantId);
  return session;
}

async function upload(
  session,
  module,
  fileName,
  contentType,
  bytes,
  declaredSha = undefined,
) {
  const contentSha256 =
    declaredSha ?? createHash("sha256").update(bytes).digest("hex");
  const independentIntegrity = module !== "electoral-catalog";
  const issued = await request("/storage/upload-url", {
    token: session.token,
    method: "POST",
    expected: 201,
    body: {
      module,
      fileName,
      contentType,
      size: bytes.length,
      ...(independentIntegrity ? { contentSha256 } : {}),
    },
  });
  assert.equal(issued.bucket, bucket);
  assert.equal(issued.method, "PUT");
  assert.ok(issued.path.startsWith(`${session.tenantId}/${module}/`));
  const signed = new URL(issued.uploadUrl);
  assert.equal(
    signed.origin,
    storage,
    "Signed upload must remain on local Storage",
  );
  assert.equal(
    signed.pathname,
    `/storage/v1/object/upload/sign/${bucket}/${issued.path}`,
  );
  assert.ok(
    signed.searchParams.has("token"),
    "Signed upload must contain authorization",
  );
  const preflight = await fetch(signed, {
    method: "OPTIONS",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Origin: web,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type,x-upsert,x-metadata",
    },
  });
  assert.equal(
    preflight.status,
    204,
    "Browser direct-upload CORS preflight must allow SDK metadata",
  );
  assert.equal(preflight.headers.get("access-control-allow-origin"), web);
  assert.ok(
    preflight.headers
      .get("access-control-allow-headers")
      .includes("x-metadata"),
  );
  // Same binary PUT + x-metadata encoding as @supabase/storage-js uploadToSignedUrl.
  // The application API receives JSON metadata only; bytes go directly to Storage.
  const uploaded = await fetch(signed, {
    method: "PUT",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": contentType,
      "x-upsert": "false",
      Origin: web,
      ...(independentIntegrity
        ? {
            "x-metadata": Buffer.from(
              JSON.stringify({ contentSha256 }),
            ).toString("base64"),
          }
        : {}),
    },
    body: bytes,
  });
  assert.equal(uploaded.status, 200, "Direct signed PUT must succeed");
  assert.equal(uploaded.headers.get("access-control-allow-origin"), web);
  await uploaded.arrayBuffer();
  const confirmation = await request("/storage/complete", {
    token: session.token,
    method: "POST",
    body: { module, path: issued.path, metadata: issued.metadata },
  });
  assert.equal(confirmation.confirmed, true);
  assert.equal(confirmation.path, issued.path);
  if (independentIntegrity) {
    assert.ok(
      ["PENDING", "VERIFIED", "FAILED"].includes(confirmation.contentIntegrity),
    );
  } else {
    // Catalogs use their dedicated import worker to hash downloaded bytes.
    assert.equal(confirmation.contentIntegrity, "NOT_PROVIDED");
  }
  assert.match(confirmation.objectId, /^[A-Za-z0-9_-]{1,128}$/);
  return { ...issued, ...confirmation, contentSha256 };
}

async function main() {
  assert.equal(
    process.env.RUN_LOCAL_STAGING_STORAGE_WORKFLOW,
    "true",
    "Explicit local workflow opt-in is required",
  );
  const lines = (await readFile(envFile, "utf8")).trim().split(/\r?\n/);
  const environment = Object.fromEntries(
    lines.map((line) => {
      const split = line.indexOf("=");
      assert.ok(split > 0, "Malformed local staging environment");
      return [line.slice(0, split), line.slice(split + 1)];
    }),
  );
  assert.equal(environment.COMPOSE_PROJECT_NAME, project);
  inspectService("storage-gateway");
  const gatewayNamespace = docker([
    "exec",
    `${project}-storage-gateway-1`,
    "readlink",
    "/proc/self/ns/net",
  ]).trim();
  for (const service of ["api", "catalog-worker"]) {
    const observed = inspectService(service);
    assert.equal(
      docker([
        "exec",
        `${project}-${service}-1`,
        "readlink",
        "/proc/self/ns/net",
      ]).trim(),
      gatewayNamespace,
      `Restart local ${service} after changing the gateway network namespace`,
    );
    assert.equal(observed.ALLOW_LOCAL_STAGING_BUILD, "true");
    assert.equal(observed.DEPLOYMENT_PROFILE, "evaluation");
    assert.equal(observed.DATABASE_SCHEMA, "politica-staging");
    const database = new URL(observed.DATABASE_URL);
    assert.equal(database.hostname, "app-db");
    assert.equal(database.username, "politica_staging");
    assert.equal(database.pathname, "/politica_staging");
    assert.equal(database.searchParams.get("schema"), "politica-staging");
    assert.ok(
      database.password === environment.STAGING_APP_DB_PASSWORD,
      "Local database identity mismatch",
    );
    assert.equal(observed.SUPABASE_URL, storage);
    assert.equal(observed.SUPABASE_STORAGE_BUCKET, bucket);
    assert.ok(
      observed.SUPABASE_SERVICE_ROLE_KEY ===
        environment.STAGING_STORAGE_SERVICE_KEY,
      "Local Storage identity mismatch",
    );
  }
  const database = inspectService("app-db");
  assert.equal(database.POSTGRES_DB, "politica_staging");
  assert.equal(database.POSTGRES_USER, "politica_staging");
  const health = await request("/health/dependencies");
  assert.equal(health.status, "ok");
  const admin = createClient(storage, environment.STAGING_STORAGE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const privateBucket = await admin.storage.getBucket(bucket);
  assert.ok(!privateBucket.error, "Local private bucket must be available");
  assert.equal(privateBucket.data.public, false);
  pass(
    "Explicit isolated compose identity, real dependencies, private Storage bucket",
  );

  try {
    fixture = JSON.parse(await readFile(fixtureFile, "utf8"));
    assert.equal(fixture.kind, "synthetic-local-storage-workflow");
    assert.match(fixture.prefix, /^storage_workflow_[0-9a-f-]{36}$/);
    fixturePrefix = fixture.prefix;
    for (const label of ["A", "B"]) {
      assert.equal(
        fixture.accounts[label].email,
        `${fixturePrefix}_${label}@example.invalid`,
      );
      assert.equal(typeof fixture.accounts[label].password, "string");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    fixture = {
      kind: "synthetic-local-storage-workflow",
      prefix: fixturePrefix,
      accounts: Object.fromEntries(
        ["A", "B"].map((label) => [
          label,
          {
            email: `${fixturePrefix}_${label}@example.invalid`,
            password: `${randomBytes(24).toString("base64url")}!Audit9`,
          },
        ]),
      ),
    };
    // Reuses only these test accounts on rerun; does not exhaust registration quotas.
    await writeFile(fixtureFile, JSON.stringify(fixture), {
      flag: "wx",
      mode: 0o600,
    });
  }

  const policy = await request("/auth/registration-policy");
  assert.equal(policy.enabled, true);
  const a = await register("A", policy.termsVersion);
  const b = await register("B", policy.termsVersion);
  assert.notEqual(a.tenantId, b.tenantId);
  await request("/storage/upload-url", {
    method: "POST",
    expected: 401,
    body: {},
  });
  pass(
    "Two synthetic tenants registered, real password login/JWT sessions, unsigned API request denied",
  );

  const bytes = Buffer.from("kind,value\nSYNTHETIC_LOCAL_AUDIT,1\n");
  const evidence = await upload(
    a,
    "finance",
    "synthetic-local-audit.csv",
    "text/csv",
    bytes,
  );
  const verified = await poll(
    `/storage/${evidence.objectId}/integrity`,
    a.token,
    ["VERIFIED", "FAILED"],
  );
  assert.equal(verified.status, "VERIFIED");
  assert.ok(
    verified.verifiedAt && Number.isFinite(Date.parse(verified.verifiedAt)),
  );
  assert.equal(verified.failureCode, null);
  pass(
    "Finance evidence: signed URL, direct binary PUT, persisted confirmation, independent worker SHA-256 verified",
  );

  await request(`/storage/${evidence.objectId}/integrity`, {
    token: b.token,
    expected: 404,
  });
  await request("/storage/complete", {
    token: b.token,
    method: "POST",
    expected: 403,
    body: {
      module: "finance",
      path: evidence.path,
      metadata: evidence.metadata,
    },
  });
  const anonymous = await fetch(
    `${storage}/storage/v1/object/${bucket}/${evidence.path}`,
    { redirect: "error", signal: AbortSignal.timeout(15_000) },
  );
  assert.ok(
    [400, 401, 403, 404].includes(anonymous.status),
    "Unsigned Storage read must not disclose private bytes",
  );
  await anonymous.arrayBuffer();
  pass(
    "Tenant B cannot inspect or confirm tenant A evidence; unsigned Storage read denied",
  );

  const corrupted = await upload(
    a,
    "finance",
    "synthetic-wrong-hash.csv",
    "text/csv",
    bytes,
    "0".repeat(64),
  );
  const failed = await poll(
    `/storage/${corrupted.objectId}/integrity`,
    a.token,
    ["VERIFIED", "FAILED"],
  );
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.failureCode, "SHA256_MISMATCH");
  pass(
    "Worker rejects wrong declared SHA despite matching upload metadata, proving independent binary hashing",
  );

  // Parser-compatible, intentionally fictitious local fixture. The official-domain
  // URL below is a required provenance-field shape, never fetched or represented
  // as the source of these synthetic bytes. No release is activated by this test.
  const catalog = Buffer.from(
    JSON.stringify({
      departments: [
        {
          code: 1,
          name: "SYNTHETIC TEST DEPARTMENT",
          municipalities: [
            {
              code: "001",
              name: "SYNTHETIC TEST MUNICIPALITY",
              zones: [
                {
                  code: 1,
                  stands: [
                    {
                      code: "01",
                      name: `SYNTHETIC TEST ONLY ${runId}`,
                      address: "SYNTHETIC",
                      commune: "SYNTHETIC",
                      lat: 0,
                      lng: 0,
                      countTable: 1,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  const artifact = await upload(
    a,
    "electoral-catalog",
    "synthetic-catalog.json",
    "application/json",
    catalog,
  );
  const catalogIntegrity = await request(
    `/storage/${artifact.objectId}/integrity`,
    { token: a.token },
  );
  assert.equal(catalogIntegrity.status, "NOT_PROVIDED");
  const importBody = {
    clientRequestId: randomUUID(),
    catalogKey: `SYNTHETIC_${runId.replaceAll("-", "").toUpperCase()}`,
    sourceUrl:
      "https://www.registraduria.gov.co/?synthetic-local-test-only=true",
    sourceDataset: "SYNTHETIC LOCAL TEST - NOT OFFICIAL DATA",
    sourceCutoffAt: new Date(Date.now() - 60_000).toISOString(),
    electionDate: "2099-10-25",
    authorizationReference:
      "LOCAL SYNTHETIC TEST ONLY - NO OFFICIAL AUTHORIZATION",
    licenseDeclaration:
      "SYNTHETIC FIXTURE GENERATED BY LOCAL TEST - NOT AN OFFICIAL DATASET",
    sourceArtifactPath: artifact.path,
    expectedContentSha256: artifact.contentSha256,
  };
  const queued = await request("/electoral-catalog/imports", {
    token: a.token,
    method: "POST",
    expected: 202,
    body: importBody,
  });
  assert.equal(queued.created, true);
  const completed = await poll(
    `/electoral-catalog/imports/${queued.job.id}`,
    a.token,
    ["SUCCEEDED", "FAILED"],
  );
  assert.equal(
    completed.status,
    "SUCCEEDED",
    `Catalog import failed with code ${completed.lastErrorCode ?? "none"}`,
  );
  assert.ok(completed.releaseId);
  const repeated = await request("/electoral-catalog/imports", {
    token: a.token,
    method: "POST",
    expected: 202,
    body: importBody,
  });
  assert.equal(repeated.created, false);
  assert.equal(repeated.job.id, queued.job.id);
  const readback = await request(
    `/electoral-catalog/releases/${completed.releaseId}`,
    { token: a.token },
  );
  assert.equal(readback.release.status, "STAGED");
  assert.equal(readback.release.contentSha256, artifact.contentSha256);
  assert.equal(readback.entries.length, 4);
  assert.deepEqual(readback.entries.map((entry) => entry.type).sort(), [
    "DEPARTMENT",
    "MUNICIPALITY",
    "POLLING_PLACE",
    "ZONE",
  ]);
  assert.equal(readback.pagination.hasMore, false);
  pass(
    "Catalog worker imports four synthetic hierarchy entries, correct SHA, durable STAGED readback and idempotent request",
  );

  await request(`/electoral-catalog/imports/${queued.job.id}`, {
    token: b.token,
    expected: 404,
  });
  await request(`/electoral-catalog/releases/${completed.releaseId}`, {
    token: b.token,
    expected: 404,
  });
  assert.deepEqual(
    await request("/electoral-catalog/imports", { token: b.token }),
    [],
  );
  assert.deepEqual(
    await request("/electoral-catalog/releases", { token: b.token }),
    [],
  );
  assert.deepEqual(
    await request("/electoral-catalog/releases?status=ACTIVE", {
      token: a.token,
    }),
    [],
  );
  pass(
    "Catalog import and release isolated from tenant B; no synthetic release activated",
  );
  console.log(
    `Evidence retained only in local staging: fixture=${fixturePrefix}; tenants=2; objects=3; stagedCatalogs=1. No official data or production mutation.`,
  );
}

try {
  await main();
} catch (error) {
  // Messages generated by this harness contain no passwords, JWTs or signed URLs.
  console.error(
    `FAIL: ${error instanceof Error ? error.message.split("\n")[0] : "Local workflow failed"}`,
  );
  process.exitCode = 1;
} finally {
  for (const session of sessions) {
    try {
      await request("/auth/logout", {
        token: session.token,
        method: "POST",
        expected: 201,
      });
      await request("/auth/me", { token: session.token, expected: 401 });
    } catch {
      console.error(
        "FAIL: Could not verify revocation of one synthetic local session",
      );
      process.exitCode = 1;
    }
  }
  if (sessions.length && !process.exitCode)
    pass("All synthetic JWT sessions revoked and rejected on readback");
  if (!process.exitCode)
    console.log(`Completed ${checks} real workflow checks without mocks.`);
}
