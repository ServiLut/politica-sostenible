import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));

test("los archivos del runner resuelven supervisor y worker con identidades separadas", async (t) => {
  const dockerfile = await readFile(join(PROJECT_ROOT, "Dockerfile"), "utf8");
  const runner = dockerfile.split(/^FROM .+ AS runner\s*$/m)[1];
  assert.ok(runner, "falta la etapa final runner");

  const runtimeRoot = await mkdtemp(join(tmpdir(), "politica-packaging-"));
  t.after(async () => {
    // Remove only this generated test directory, never a repository or parent.
    assert.equal(dirname(resolve(runtimeRoot)), resolve(tmpdir()));
    assert.ok(basename(runtimeRoot).startsWith("politica-packaging-"));
    await rm(runtimeRoot, { recursive: true, force: true });
  });
  await mkdir(join(runtimeRoot, "deploy"));

  for (const [, source, destination] of runner.matchAll(
    /^COPY (deploy\/[a-z0-9-]+\.mjs) \.\/(deploy\/[a-z0-9-]+\.mjs)\s*$/gm,
  )) {
    await copyFile(join(PROJECT_ROOT, source), join(runtimeRoot, destination));
  }

  const environment = {};
  const instructions = runner.replace(/\\\r?\n\s*/g, " ");
  for (const [, values] of instructions.matchAll(/^ENV (.+)$/gm)) {
    for (const [, key, value] of values.matchAll(
      /\b(NODE_ENV|(?:API|WEB|CATALOG_WORKER)_PROCESS_(?:UID|GID))=([^\s]+)/g,
    )) {
      environment[key] = value;
    }
  }

  // Import only: the modules' direct-execution guards keep boot, migrations,
  // network access, and worker startup out of this packaging regression test.
  const supervisorUrl = pathToFileURL(join(runtimeRoot, "deploy/start.mjs")).href;
  const workerUrl = pathToFileURL(
    join(runtimeRoot, "deploy/catalog-worker-entrypoint.mjs"),
  ).href;
  const program = `
    const supervisor = await import(${JSON.stringify(supervisorUrl)});
    await import(${JSON.stringify(workerUrl)});
    const identities = supervisor.resolveCombinedRuntimeIdentities(
      ${JSON.stringify(environment)}, { platform: "linux", supervisorUid: 0 }
    );
    console.log(JSON.stringify(identities));
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    encoding: "utf8",
    timeout: 10_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    api: { uid: 1001, gid: 1001 },
    catalogWorker: { uid: 1003, gid: 1003 },
    web: { uid: 1002, gid: 1002 },
  });
});
