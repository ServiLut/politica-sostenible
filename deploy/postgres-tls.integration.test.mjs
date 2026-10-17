import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prismaMigrationConnectionString } from "./migrate.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const environmentKeys = ["POSTGRES_TLS_TEST_ENABLED", "POSTGRES_TLS_TEST_DATABASE_URL", "POSTGRES_TLS_TEST_CA_FILE"];
const requested = environmentKeys.some((key) => process.env[key] !== undefined);
const production = {
  NODE_ENV: "production", DEPLOYMENT_PROFILE: "commercial",
  DATABASE_SSL: "true", DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
  ALLOW_INSECURE_DATABASE_CONNECTION: "false",
};

function childEnvironment(connectionString, caFile) {
  const environment = { ...process.env, ...production, PS_AUDIT_DBURL: connectionString };
  // Trust must come only from this fixture, never from inherited process options.
  for (const key of Object.keys(environment)) {
    if (/^(?:NODE_OPTIONS|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|SSL_CERT_FILE|SSL_CERT_DIR|PGSSL.*|DATABASE_URL|DIRECT_URL)$/u.test(key)) delete environment[key];
  }
  if (caFile) environment.NODE_EXTRA_CA_CERTS = caFile;
  return environment;
}

async function fixtureConfiguration() {
  assert.equal(process.env.POSTGRES_TLS_TEST_ENABLED, "1", "TLS fixture requires explicit opt-in");
  let url;
  try { url = new URL(process.env.POSTGRES_TLS_TEST_DATABASE_URL); }
  catch { assert.fail("TLS fixture URL is missing or invalid; value withheld"); }
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname === "localhost" &&
    Number(url.port) >= 1024 && Number(url.port) <= 65535 && url.port !== "5432" &&
    url.pathname === "/politica_tls_test" && url.username === "postgres" && !url.password && !url.hash && !url.search,
  "TLS fixture must be an isolated localhost PostgreSQL test database without credentials or URL options");
  const inputCa = process.env.POSTGRES_TLS_TEST_CA_FILE;
  assert.ok(inputCa && isAbsolute(inputCa), "TLS fixture requires an absolute synthetic CA path");
  let caFile;
  let ca;
  try {
    caFile = await realpath(inputCa);
    ca = new X509Certificate(await readFile(caFile));
  } catch { assert.fail("TLS fixture CA cannot be read; path and contents withheld"); }
  const fromRepository = relative(await realpath(root), caFile);
  assert.ok(fromRepository === ".." || fromRepository.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRepository),
    "Synthetic TLS materials must remain outside the repository");
  assert.ok(ca.ca && ca.subject === "CN=Politica disposable QA CA", "TLS fixture requires the designated disposable CA");
  assert.ok(Date.parse(ca.validFrom) <= Date.now() && Date.parse(ca.validTo) > Date.now(), "Synthetic TLS fixture certificate is not currently valid");
  url.searchParams.set("sslmode", "verify-full");
  return { url, caFile };
}

const pgProbe = `
import { createRequire } from 'node:module';
import { postgresClientOptions } from ${JSON.stringify(pathToFileURL(resolve(root, "deploy/migrate.mjs")).href)};
const { Client } = createRequire(${JSON.stringify(pathToFileURL(resolve(root, "apps/api/package.json")).href)})('pg');
const client = new Client(postgresClientOptions(new URL(process.env.PS_AUDIT_DBURL), process.env));
try {
  await client.connect();
  const rows = (await client.query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')).rows;
  const peer = client.connection.stream.getPeerCertificate();
  console.log(JSON.stringify({ ssl: rows.length === 1 && rows[0].ssl === true, expectedSan: peer.subjectaltname === 'DNS:localhost' }));
} catch (error) {
  const allowedCodes = ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'];
  console.log(JSON.stringify({ code: allowedCodes.includes(error?.code) ? error.code : 'UNCLASSIFIED_CONNECTION_ERROR' }));
  process.exitCode = 1;
} finally { await client.end(); }
`;

function execute(args, environment, input) {
  const result = spawnSync(process.execPath, args, {
    cwd: root, env: environment, input, encoding: "utf8", windowsHide: true,
    timeout: 20_000, maxBuffer: 2_000_000,
  });
  assert.ok(!result.error && result.signal === null, "TLS probe failed to execute; process output withheld");
  return result;
}

test("PostgreSQL TLS real: cadena confiable y nombre correcto obligatorios en pg y Prisma nativo", {
  skip: !requested, timeout: 150_000,
}, async (t) => {
  const { url, caFile } = await fixtureConfiguration();
  const temporary = await mkdtemp(join(tmpdir(), "ps-postgres-tls-test-"));
  try {
    const config = join(temporary, "prisma.config.mjs");
    await writeFile(config, 'export default { datasource: { url: process.env.PS_AUDIT_DBURL } };\n', { flag: "wx", mode: 0o600 });
    for (const client of ["pg", "prisma-native"]) {
      for (const scenario of ["trusted-localhost", "untrusted-ca", "wrong-hostname"]) {
        await t.test(`${client}: ${scenario}`, { timeout: 25_000 }, () => {
          const target = new URL(url);
          if (scenario === "wrong-hostname") target.hostname = "127.0.0.1";
          const trustedCa = scenario === "untrusted-ca" ? undefined : caFile;
          let result;
          if (client === "pg") {
            result = execute(["--input-type=module", "-e", pgProbe], childEnvironment(target.toString(), trustedCa));
            let observation;
            try { observation = JSON.parse(result.stdout.trim()); }
            catch { assert.fail("pg probe produced no safe observation; process output withheld"); }
            if (scenario === "trusted-localhost") {
              assert.equal(result.status, 0, "Trusted hostname must connect through real postgresClientOptions");
              assert.deepEqual(observation, { ssl: true, expectedSan: true });
            } else {
              assert.equal(result.status, 1, "Invalid trust or hostname must reject the connection");
              if (scenario === "wrong-hostname") assert.equal(observation.code, "ERR_TLS_CERT_ALTNAME_INVALID");
              else assert.ok(["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT"].includes(observation.code), "Untrusted CA must fail specifically during certificate verification");
            }
          } else {
            const nativeUrl = prismaMigrationConnectionString(target, {
              ...production, ...(trustedCa ? { NODE_EXTRA_CA_CERTS: trustedCa } : {}),
            });
            result = execute([
              resolve(root, "apps/api/node_modules/prisma/build/index.js"), "db", "execute", "--stdin", "--config", config,
            ], childEnvironment(nativeUrl, trustedCa),
            "SELECT 1 / CASE WHEN ssl THEN 1 ELSE 0 END AS tls_verified FROM pg_stat_ssl WHERE pid = pg_backend_pid();");
            const output = `${result.stdout}\n${result.stderr}`;
            if (scenario === "trusted-localhost") {
              assert.equal(result.status, 0, "Trusted hostname must connect through the real native Prisma engine");
              assert.ok(/Script executed successfully/u.test(output), "Native TLS SQL probe must complete");
            } else {
              assert.equal(result.status, 1, "Native Prisma must reject invalid trust or hostname");
              assert.ok(/\bP1011\b/u.test(output), "Native rejection must be a TLS error, not a SQL/configuration error");
            }
          }
        });
      }
    }
  } finally {
    assert.equal(dirname(temporary), resolve(tmpdir()));
    assert.match(basename(temporary), /^ps-postgres-tls-test-[A-Za-z0-9]+$/u);
    await rm(temporary, { recursive: true, force: true });
  }
});
