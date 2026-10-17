import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DOCKERIGNORE = new URL("../.dockerignore", import.meta.url);
const RECURSIVE_SECRET_PATTERNS = [
  "**/.env*", "**/*.pem", "**/*.key", "**/*.p12", "**/*.pfx", "**/*.jks",
  "**/*.keystore", "**/*.pgpass", "**/.pgpass", "**/.netrc", "**/id_rsa",
  "**/id_dsa", "**/id_ecdsa", "**/id_ed25519", "**/*.ovpn", "**/auth.bak",
  "**/*.log", "**/*.old.prisma",
];
const SECRET_NAMES = [
  ".env", ".env.local", ".env.production", ".envrc", "private.pem", "private.key",
  "private.p12", "private.pfx", "private.jks", "private.keystore", "private.pgpass",
  ".pgpass", ".netrc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "client.ovpn",
  "runtime.log", "backup.old.prisma", "auth.bak/session.json",
];

test("Docker excluye credenciales en todas las profundidades y solo permite la plantilla raíz", async () => {
  const patterns = (await readFile(DOCKERIGNORE, "utf8"))
    .split(/\r?\n/u).map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  for (const pattern of RECURSIVE_SECRET_PATTERNS) {
    assert.ok(patterns.includes(pattern), `Falta exclusión Docker recursiva: ${pattern}`);
  }
  // A later broad negation can silently re-include sensitive descendants.
  assert.deepEqual(patterns.filter((pattern) => pattern.startsWith("!")), ["!.env.example"]);
  assert.ok(patterns.indexOf("!.env.example") > patterns.indexOf("**/.env*"));
});

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(join(directory, entry.name), path));
    else files.push(path);
  }
  return files.sort();
}

test("el motor Docker filtra un contexto sintético sin usar archivos ni imágenes de la aplicación", {
  skip: process.env.DOCKER_CONTEXT_SAFETY_TEST !== "1"
    ? "Requiere DOCKER_CONTEXT_SAFETY_TEST=1 y un motor Docker local ya iniciado"
    : false,
  timeout: 60_000,
}, async () => {
  // Ignore ambient DOCKER_HOST overrides and refuse remote daemons altogether.
  const { stdout: current } = await execFileAsync("docker", ["context", "show"]);
  const context = current.trim();
  const { stdout: endpoint } = await execFileAsync("docker", [
    "context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}",
  ]);
  assert.match(endpoint.trim(), /^(?:npipe:\/\/|unix:\/\/)/u, "Solo se admite un motor Docker local");
  const dockerEnvironment = { ...process.env };
  for (const key of ["DOCKER_HOST", "BUILDKIT_HOST", "BUILDX_BUILDER"]) {
    delete dockerEnvironment[key];
  }

  const temporaryBase = resolve(tmpdir());
  const fixtureRoot = await mkdtemp(join(temporaryBase, "politica-docker-context-"));
  const fixtureRelative = relative(temporaryBase, resolve(fixtureRoot));
  assert.ok(fixtureRelative && !isAbsolute(fixtureRelative) && !fixtureRelative.startsWith(".."));
  try {
    const contextRoot = join(fixtureRoot, "context");
    const outputRoot = join(fixtureRoot, "output");
    await mkdir(contextRoot);
    const safeFiles = ["source.ts", "apps/api/source.ts", "apps/web/source.ts", ".env.example"];
    const sensitiveFiles = ["", "apps/api/", "deploy/nested/"].flatMap((prefix) =>
      SECRET_NAMES.map((name) => `${prefix}${name}`));
    sensitiveFiles.push("apps/api/.env.example");
    for (const path of [...safeFiles, ...sensitiveFiles]) {
      const target = join(contextRoot, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, "synthetic-fixture-only\n");
    }
    await writeFile(join(contextRoot, ".dockerignore"), await readFile(DOCKERIGNORE));
    await writeFile(join(contextRoot, "Dockerfile"), "FROM scratch\nCOPY . /\n");
    // FROM scratch needs no image pull, and no application code/container runs.
    await execFileAsync("docker", ["--context", context, "build", "--network=none", "--no-cache",
      "--output", `type=local,dest=${outputRoot}`, contextRoot], {
      timeout: 45_000, env: dockerEnvironment,
    });
    const exported = await listFiles(outputRoot);
    for (const path of sensitiveFiles) assert.ok(!exported.includes(path), `Docker incluyó ${path}`);
    for (const path of safeFiles) assert.ok(exported.includes(path), `Docker excluyó fuente necesaria: ${path}`);
  } finally {
    // The only recursive deletion is the mkdtemp directory verified above.
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
