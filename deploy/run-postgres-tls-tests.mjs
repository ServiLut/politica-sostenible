import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const POSTGRES_TLS_IMAGE = "postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LABEL = "com.politica-sostenible.tls-test";
const execFileAsync = promisify(execFile);
const failure = (code) => { throw new Error(code); };

export function tlsContainerArgs(name, directory) {
  assert.match(name, /^ps-tls-[a-f0-9]{16}$/u);
  assert.ok(directory.startsWith("/") && !/[,\r\n\0]/u.test(directory), "Invalid disposable TLS directory");
  return ["create", "--name", name, "--label", `${LABEL}=${name}`,
    "--cpus", "1", "--memory", "512m", "--pids-limit", "128",
    "--security-opt", "no-new-privileges:true",
    "--publish", "127.0.0.1::5432",
    "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=256m",
    "--mount", `type=bind,source=${directory},target=/tls-fixture,readonly`,
    "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", "POSTGRES_DB=politica_tls_test",
    "--env", "POSTGRES_USER=postgres", "--entrypoint", "sh", POSTGRES_TLS_IMAGE,
    "-c", "set -eu; umask 077; mkdir -p /tmp/ps-tls-certs; cp /tls-fixture/server.key /tls-fixture/server.crt /tmp/ps-tls-certs/; chown -R postgres:postgres /tmp/ps-tls-certs; chmod 600 /tmp/ps-tls-certs/server.key; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/ps-tls-certs/server.crt -c ssl_key_file=/tmp/ps-tls-certs/server.key -c ssl_min_protocol_version=TLSv1.2"];
}

export function assertTlsTapResult(result) {
  assert.equal(result.code, 0, "TLS suite must exit successfully; raw output withheld");
  const expected = { tests: 7, pass: 7, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  for (const [name, value] of Object.entries(expected)) {
    const lines = [...result.stdout.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`, "gmu"))];
    assert.ok(lines.length === 1 && Number(lines[0][1]) === value, `TLS suite requires exact ${name} count`);
  }
  const expectedCases = ["pg", "prisma-native"].flatMap((client) =>
    ["trusted-localhost", "untrusted-ca", "wrong-hostname"].map((scenario) => `${client}: ${scenario}`)).sort();
  const passedCases = [...result.stdout.matchAll(/^    ok \d+ - ((?:pg|prisma-native): (?:trusted-localhost|untrusted-ca|wrong-hostname))\r?$/gmu)]
    .map((match) => match[1]).sort();
  assert.deepEqual(passedCases, expectedCases, "Every physical TLS scenario must execute exactly once");
}

export async function runPostgresTlsTests() {
  if (process.platform !== "linux") failure("TLS_RUNNER_REQUIRES_LINUX_AND_LOCAL_DOCKER");
  const environment = { ...process.env };
  for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "BUILDKIT_HOST", "BUILDX_BUILDER"]) delete environment[key];
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const command = async (executable, args, { timeout = 30_000, allowFailure = false, cleanup = false, env = environment } = {}) => {
    try {
      const result = await execFileAsync(executable, args, {
        cwd: ROOT, env, timeout, maxBuffer: 2_000_000, windowsHide: true,
        signal: cleanup ? undefined : cancellation.signal,
      });
      return { ...result, code: 0 };
    } catch (error) {
      if (allowFailure && typeof error.code === "number") return { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
      failure("TLS_FIXTURE_COMMAND_FAILED_OUTPUT_WITHHELD");
    }
  };
  let directory;
  let docker;
  let containerAttempted = false;
  const name = `ps-tls-${randomBytes(8).toString("hex")}`;
  try {
    const context = (await command("docker", ["context", "show"])).stdout.trim();
    assert.match(context, /^[A-Za-z0-9_.-]{1,100}$/u, "Invalid Docker context");
    const endpoint = (await command("docker", ["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"])).stdout.trim();
    if (!endpoint.startsWith("unix:///")) failure("TLS_FIXTURE_REQUIRES_LOCAL_DOCKER_SOCKET");
    docker = (args, options) => command("docker", ["--context", context, ...args], options);
    await docker(["info", "--format", "{{.ID}}"]);
    await command("openssl", ["version"]);
    await docker(["pull", POSTGRES_TLS_IMAGE], { timeout: 180_000 });
    directory = await mkdtemp(join(tmpdir(), "ps-tls-ci-"));
    await chmod(directory, 0o700);
    const file = (name) => join(directory, name);
    const serverDirectory = file("server");
    await mkdir(serverDirectory, { mode: 0o700 });
    const serverFile = (name) => join(serverDirectory, name);
    await command("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
      "-subj", "/CN=Politica disposable QA CA", "-addext", "basicConstraints=critical,CA:TRUE",
      "-keyout", file("ca.key"), "-out", file("ca.pem")]);
    await command("openssl", ["req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost",
      "-keyout", serverFile("server.key"), "-out", file("server.csr")]);
    await writeFile(file("extensions.cnf"), "subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\n", { mode: 0o600 });
    await command("openssl", ["x509", "-req", "-in", file("server.csr"), "-CA", file("ca.pem"), "-CAkey", file("ca.key"),
      "-CAcreateserial", "-days", "2", "-extfile", file("extensions.cnf"), "-out", serverFile("server.crt")]);
    await chmod(file("ca.key"), 0o600);
    await chmod(serverFile("server.key"), 0o600);
    containerAttempted = true;
    await docker(tlsContainerArgs(name, serverDirectory));
    await docker(["start", name]);
    let ready = false;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const check = await docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "politica_tls_test"], { timeout: 5_000, allowFailure: true });
      if (check.code === 0) { ready = true; break; }
      await new Promise((done) => setTimeout(done, 500));
    }
    if (!ready) failure("TLS_FIXTURE_NOT_READY");
    const binding = (await docker(["port", name, "5432/tcp"])).stdout.trim().match(/^127\.0\.0\.1:(\d+)$/u);
    if (!binding || Number(binding[1]) < 1024 || Number(binding[1]) > 65535 || binding[1] === "5432") failure("TLS_FIXTURE_PORT_NOT_ISOLATED");
    const result = await command(process.execPath, ["--test", "--test-reporter=tap", "deploy/postgres-tls.integration.test.mjs"], {
      timeout: 160_000, allowFailure: true,
      env: { ...environment, POSTGRES_TLS_TEST_ENABLED: "1",
        POSTGRES_TLS_TEST_DATABASE_URL: `postgresql://postgres@localhost:${binding[1]}/politica_tls_test`,
        POSTGRES_TLS_TEST_CA_FILE: file("ca.pem") },
    });
    assertTlsTapResult(result);
  } finally {
    let cleanupFailed = false;
    if (containerAttempted && docker) {
      try {
        const inspection = await docker(["inspect", name], { allowFailure: true, cleanup: true });
        if (inspection.code !== 0) cleanupFailed = true;
        else {
          const containers = JSON.parse(inspection.stdout);
          const container = containers[0];
          if (containers.length !== 1 || container.Name !== `/${name}` || container.Config?.Labels?.[LABEL] !== name ||
              container.Config?.Image !== POSTGRES_TLS_IMAGE) cleanupFailed = true;
          else await docker(["rm", "--force", "--volumes", container.Id], { cleanup: true });
        }
      } catch { cleanupFailed = true; }
    }
    if (directory) {
      try {
        assert.equal(dirname(await realpath(directory)), await realpath(tmpdir()));
        assert.match(basename(directory), /^ps-tls-ci-[A-Za-z0-9]+$/u);
        await rm(directory, { recursive: true, force: true });
      } catch { cleanupFailed = true; }
    }
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    if (cleanupFailed) failure("TLS_FIXTURE_CLEANUP_NOT_CONFIRMED");
  }
  return { status: "TLS_PHYSICAL_MATRIX_PASSED", scenarios: 6, skipped: 0, fixtureCleaned: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPostgresTlsTests().then((result) => console.log(JSON.stringify(result)))
    .catch(() => { console.error("TLS_PHYSICAL_MATRIX_FAILED: fixture, cases and cleanup must all pass; raw output withheld"); process.exitCode = 1; });
}
