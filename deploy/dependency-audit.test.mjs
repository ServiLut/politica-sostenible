import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { evaluateDependencyAudit, resolveInstalledBraces, validateAuditReport, verifyBracesMitigation } from "./dependency-audit.mjs";

const advisoryId = "GHSA-vfj7-8cjw-p6xm";
const importerPath = "apps__web>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const passingTap = "# tests 7\n# pass 7\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
const successfulRunner = async () => ({ exitCode: 0, stdout: passingTap });

function auditReport({ clean = false } = {}) {
  return {
    actions: clean ? [] : [{ action: "review", module: "braces", resolves: [{ id: 1240992, path: importerPath }] }],
    advisories: clean ? {} : {
      "1240992": {
        id: 1240992, github_advisory_id: advisoryId, module_name: "braces", severity: "high",
        url: `https://github.com/advisories/${advisoryId}`, patched_versions: "<0.0.0",
        findings: [{ version: "3.0.3", paths: [importerPath] }],
      },
    },
    muted: [],
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: clean ? 0 : 1, critical: 0 }, dependencies: 10, devDependencies: 0, optionalDependencies: 0, totalDependencies: 10 },
  };
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "politica-dependency-gate-"));
  t.after(async () => {
    const target = resolve(root);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(target.startsWith(join(resolve(tmpdir()), "politica-dependency-gate-")));
    await rm(target, { recursive: true, force: true });
  });
  const patch = "synthetic reviewed diff\n";
  const regression = "synthetic regression file; runner is injected by the unit test\n";
  const runtime = "module.exports = 'synthetic protected runtime';\n";
  const installed = join(root, "node_modules/braces");
  for (const directory of ["patches", "deploy", "node_modules/braces"]) await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ pnpm: { patchedDependencies: { "braces@3.0.3": "patches/braces@3.0.3.patch" } } }));
  await writeFile(join(root, "patches/braces@3.0.3.patch"), patch);
  await writeFile(join(root, "deploy/dependency-patches.test.mjs"), regression);
  await writeFile(join(installed, "package.json"), JSON.stringify({ name: "braces", version: "3.0.3" }));
  await writeFile(join(installed, "index.js"), runtime);
  const mitigation = {
    advisoryId, registryAdvisoryId: 1240992, package: "braces", version: "3.0.3", upstreamStatus: "open",
    patchFile: "patches/braces@3.0.3.patch", patchSha256: hash(patch),
    regressionFile: "deploy/dependency-patches.test.mjs", regressionSha256: hash(regression),
    importerPaths: [importerPath], installedFileSha256: { "index.js": hash(runtime) },
  };
  const report = auditReport();
  return { root, installed, mitigation, report, policy: { schemaVersion: 1, mitigations: [mitigation] }, auditExitCode: 1, runRegression: successfulRunner, resolvePackage: async () => installed, advisory: report.advisories[1240992] };
}

test("a clean complete audit succeeds without a patch, policy or runner", async () => {
  const result = await evaluateDependencyAudit({ report: auditReport({ clean: true }), auditExitCode: 0, runRegression: () => assert.fail("No regression should run") });
  assert.deepEqual(result, { status: "pass", upstreamAdvisories: 0, mitigated: [], unmitigated: [], errors: [] });
});

const malformedCases = [
  ["network error JSON", (report) => { report.error = { code: "ECONNRESET" }; }],
  ["unknown top-level format", (report) => { report.auditReportVersion = 2; }],
  ["muted advisories", (report) => { report.muted.push({ id: 1240992 }); }],
  ["missing muted list", (report) => { delete report.muted; }],
  ["missing actions", (report) => { delete report.actions; }],
  ["inconsistent totals", (report) => { report.metadata.vulnerabilities.high = 0; }],
  ["unknown severity count", (report) => { report.metadata.vulnerabilities.unknown = 1; }],
  ["negative count", (report) => { report.metadata.vulnerabilities.low = -1; }],
  ["noninteger dependencies", (report) => { report.metadata.dependencies = 1.5; }],
  ["empty dependency set", (report) => { report.metadata.totalDependencies = 0; }],
  ["wrong advisory record key", (report) => { report.advisories[1240992].id = 9; }],
  ["missing affected versions", (report) => { report.advisories[1240992].findings = []; }],
  ["missing affected paths", (report) => { report.advisories[1240992].findings[0].paths = []; }],
  ["unknown action", (report) => { report.actions[0].action = "ignore"; }],
  ["unknown action record", (report) => { report.actions[0].resolves[0].id = 2; }],
  ["unlisted action path", (report) => { report.actions[0].resolves[0].path = "other"; }],
  ["missing action for an advisory", (report) => { report.actions = []; }],
];
for (const [name, mutate] of malformedCases) {
  test(`rejects ${name}`, () => {
    const report = auditReport();
    mutate(report);
    assert.throws(() => validateAuditReport(report, 1));
  });
}

test("rejects command errors and exit codes inconsistent with an unfiltered audit", () => {
  for (const code of [2, -1, undefined, "1", 127]) assert.throws(() => validateAuditReport(auditReport(), code));
  assert.throws(() => validateAuditReport(auditReport(), 0));
  assert.throws(() => validateAuditReport(auditReport({ clean: true }), 1));
  for (const report of [null, [], "", {}]) assert.throws(() => validateAuditReport(report, 0));
});

test("keeps the upstream advisory visible after exact installed mitigation verification", async (t) => {
  const inputs = await fixture(t);
  let tested = false;
  const result = await evaluateDependencyAudit({ ...inputs, runRegression: async (root, file) => {
    assert.equal(root, inputs.root);
    assert.equal(file, "deploy/dependency-patches.test.mjs");
    tested = true;
    return successfulRunner();
  } });
  assert.equal(result.status, "pass");
  assert.equal(result.upstreamAdvisories, 1);
  assert.equal(result.mitigated[0].advisoryId, advisoryId);
  assert.equal(result.mitigated[0].upstreamStatus, "open");
  assert.equal(result.mitigated[0].passedTests, 7);
  assert.equal(result.unmitigated.length, 0);
  assert.equal(tested, true);
});

test("an additional advisory is never waived by the braces mitigation", async (t) => {
  const inputs = await fixture(t);
  inputs.report.advisories[999] = { ...inputs.advisory, id: 999, github_advisory_id: "GHSA-unknown", module_name: "another", severity: "low" };
  inputs.report.actions.push({ action: "review", module: "another", resolves: [{ id: 999, path: importerPath }] });
  inputs.report.metadata.vulnerabilities.low = 1;
  const result = await evaluateDependencyAudit(inputs);
  assert.equal(result.status, "blocked");
  assert.equal(result.mitigated.length, 1);
  assert.equal(result.unmitigated[0].package, "another");
});

for (const [name, mutate] of [
  ["missing policy", (inputs) => { inputs.policy = undefined; }],
  ["unknown policy version", (inputs) => { inputs.policy.schemaVersion = 2; }],
  ["second policy exception", (inputs) => { inputs.policy.mitigations.push(inputs.mitigation); }],
  ["wrong policy advisory", (inputs) => { inputs.mitigation.advisoryId = "GHSA-other"; }],
  ["hidden upstream advisory", (inputs) => { inputs.mitigation.upstreamStatus = "fixed"; }],
  ["unreviewed patch hash", (inputs) => { inputs.mitigation.patchSha256 = "PENDING"; }],
  ["unreviewed installed files", (inputs) => { inputs.mitigation.installedFileSha256 = {}; }],
  ["path traversal in policy", (inputs) => { inputs.mitigation.installedFileSha256 = { "../index.js": "a".repeat(64) }; }],
]) {
  test(`preserves the upstream advisory while blocking ${name}`, async (t) => {
    const inputs = await fixture(t);
    mutate(inputs);
    const result = await evaluateDependencyAudit(inputs);
    assert.equal(result.status, "blocked");
    assert.equal(result.unmitigated[0].advisoryId, advisoryId);
    assert.equal(result.mitigated.length, 0);
  });
}

for (const [name, mutate] of [
  ["wrong package", (inputs) => { inputs.advisory.module_name = "not-braces"; }],
  ["another advisory ID", (inputs) => { inputs.advisory.github_advisory_id = "GHSA-other"; }],
  ["another affected version", (inputs) => { inputs.advisory.findings[0].version = "3.0.2"; }],
  ["new upstream fix", (inputs) => { inputs.advisory.patched_versions = ">=3.0.4"; }],
  ["inconsistent advisory URL", (inputs) => { inputs.advisory.url = "https://example.invalid/unrelated"; }],
  ["changed importer chain", (inputs) => { inputs.advisory.findings[0].paths[0] = "apps__api>braces"; inputs.report.actions[0].resolves[0].path = "apps__api>braces"; }],
]) {
  test(`blocks ${name}`, async (t) => {
    const inputs = await fixture(t);
    mutate(inputs);
    const result = await evaluateDependencyAudit(inputs);
    assert.equal(result.status, "blocked");
    assert.equal(result.unmitigated.length, 1);
  });
}

for (const [name, mutate] of [
  ["patch tampering", async (inputs) => writeFile(join(inputs.root, inputs.mitigation.patchFile), "changed patch")],
  ["regression tampering", async (inputs) => writeFile(join(inputs.root, inputs.mitigation.regressionFile), "changed regression")],
  ["installed runtime tampering", async (inputs) => writeFile(join(inputs.installed, "index.js"), "unpatched runtime")],
  ["extra runtime entrypoint", async (inputs) => writeFile(join(inputs.installed, "bypass.cjs"), "unreviewed runtime")],
  ["wrong installed version", async (inputs) => writeFile(join(inputs.installed, "package.json"), JSON.stringify({ name: "braces", version: "3.0.2" }))],
  ["missing pnpm configuration", async (inputs) => writeFile(join(inputs.root, "package.json"), "{}")],
  ["wrong patch path", async (inputs) => writeFile(join(inputs.root, "package.json"), JSON.stringify({ pnpm: { patchedDependencies: { "braces@3.0.3": "other.patch" } } }))],
  ["additional unreviewed patched dependency", async (inputs) => writeFile(join(inputs.root, "package.json"), JSON.stringify({ pnpm: { patchedDependencies: { "braces@3.0.3": "patches/braces@3.0.3.patch", "other@1.0.0": "other.patch" } } }))],
]) {
  test(`fails closed for ${name}`, async (t) => {
    const inputs = await fixture(t);
    await mutate(inputs);
    let ran = false;
    const result = await evaluateDependencyAudit({ ...inputs, runRegression: async () => { ran = true; return successfulRunner(); } });
    assert.equal(result.status, "blocked");
    assert.equal(ran, false);
    assert.equal(result.mitigated.length, 0);
  });
}

for (const [name, result] of [
  ["process failure", { exitCode: 1, stdout: passingTap }],
  ["missing TAP evidence", { exitCode: 0, stdout: "ok" }],
  ["skipped regression", { exitCode: 0, stdout: passingTap.replace("# pass 7", "# pass 6").replace("# skipped 0", "# skipped 1") }],
  ["no executed tests", { exitCode: 0, stdout: passingTap.replaceAll("7", "0") }],
  ["failed test", { exitCode: 0, stdout: passingTap.replace("# fail 0", "# fail 1") }],
  ["pending test", { exitCode: 0, stdout: passingTap.replace("# todo 0", "# todo 1") }],
  ["ambiguous TAP summaries", { exitCode: 0, stdout: passingTap + passingTap }],
]) {
  test(`does not accept ${name} as regression proof`, async (t) => {
    const inputs = await fixture(t);
    assert.equal((await evaluateDependencyAudit({ ...inputs, runRegression: async () => result })).status, "blocked");
  });
}

test("verifies every actual importer even when the module store contains another valid copy", async (t) => {
  const inputs = await fixture(t);
  const secondPath = "apps__api>micromatch>braces";
  inputs.mitigation.importerPaths.push(secondPath);
  inputs.advisory.findings[0].paths.push(secondPath);
  const secondDirectory = join(inputs.root, "node_modules/another-braces");
  await mkdir(secondDirectory);
  await writeFile(join(secondDirectory, "package.json"), await readFile(join(inputs.installed, "package.json")));
  await writeFile(join(secondDirectory, "index.js"), "unpatched second installation");
  await assert.rejects(verifyBracesMitigation({ ...inputs, resolvePackage: async (_root, path) => path === secondPath ? secondDirectory : inputs.installed }), /bytes del módulo instalado/);
});

test("resolves declared importer edges instead of accepting an unused node_modules copy", async (t) => {
  const inputs = await fixture(t);
  const workspace = join(inputs.root, "apps/web");
  await mkdir(workspace, { recursive: true });
  const manifest = join(workspace, "package.json");
  await writeFile(manifest, JSON.stringify({ name: "web", devDependencies: { braces: "3.0.3" } }));
  await writeFile(join(inputs.installed, "package.json"), JSON.stringify({ name: "braces", version: "3.0.3", exports: { ".": "./index.js" } }));
  assert.equal(await resolveInstalledBraces(inputs.root, "apps__web>braces"), inputs.installed);
  await writeFile(manifest, JSON.stringify({ name: "web" }));
  await assert.rejects(resolveInstalledBraces(inputs.root, "apps__web>braces"), /dependencia declarada/);
  await assert.rejects(resolveInstalledBraces(inputs.root, "apps__missing>braces"));
  for (const path of ["apps__web>../braces", "apps__../web>braces", "other>braces"]) {
    await assert.rejects(resolveInstalledBraces(inputs.root, path));
  }
});
