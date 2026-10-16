import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createFactoryReceipt, RECEIPT_PATH, REQUIRED_JOBS } from "./ci-factory.mjs";

// Reuse the already locked YAML parser from the API's ESLint dependency tree.
// The factory executable itself uses only Node built-ins, before installation.
const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { load } = createRequire(apiRequire.resolve("@eslint/eslintrc"))("js-yaml");
const workflow = load(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
const SCRIPT = fileURLToPath(new URL("./ci-factory.mjs", import.meta.url));
const SHA = "a".repeat(40);
const UPLOAD = "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9";
const success = () => Object.fromEntries(REQUIRED_JOBS.map((job) => [job, { result: "success", outputs: {} }]));
function environment(needs = success()) {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_SHA: SHA,
    GITHUB_REPOSITORY: "ServiLut/politica-sostenible",
    GITHUB_RUN_ID: "12345678901234567890",
    GITHUB_RUN_ATTEMPT: "2",
    GITHUB_EVENT_NAME: "push",
    CI_FACTORY_NEEDS_JSON: JSON.stringify(needs),
  };
}

test("receipt preserves the exact SHA/repository/run and excludes outputs and environment", () => {
  const needs = success();
  needs[REQUIRED_JOBS[0]].outputs.privateValue = "fixture-private-value-never-copy";
  const receipt = createFactoryReceipt({ ...environment(needs), EXTRA_PRIVATE_VALUE: "fixture-private-value-never-copy" }, SHA, new Date("2026-10-16T12:00:00.000Z"));
  assert.equal(receipt.revision, SHA);
  assert.equal(receipt.repository, "ServiLut/politica-sostenible");
  assert.equal(receipt.runId, "12345678901234567890");
  assert.equal(receipt.runAttempt, "2");
  assert.equal(receipt.runUrl, "https://github.com/ServiLut/politica-sostenible/actions/runs/12345678901234567890/attempts/2");
  assert.deepEqual(receipt.results, Object.fromEntries(REQUIRED_JOBS.map((job) => [job, "success"])));
  assert.equal(receipt.deploymentPerformed, false);
  assert.doesNotMatch(JSON.stringify(receipt), /private-value|privateValue|EXTRA_PRIVATE/);
});

for (const job of REQUIRED_JOBS) {
  for (const status of ["failure", "cancelled", "skipped", "", "neutral", true, null]) {
    test(`no receipt when ${job} is ${String(status)}`, () => {
      const needs = success();
      needs[job].result = status;
      assert.throws(() => createFactoryReceipt(environment(needs), SHA), /FACTORY_REQUIRED_JOB_NOT_SUCCESSFUL/);
    });
  }
}

test("missing, extra, malformed and inherited job results cannot satisfy the gate", () => {
  const missing = success();
  delete missing[REQUIRED_JOBS[0]];
  for (const needs of [missing, { ...success(), unexpected: { result: "success" } }, [], null, "success", { ...success(), "security-gate": "success" }]) {
    assert.throws(() => createFactoryReceipt(environment(needs), SHA), /FACTORY_/);
  }
  for (const serialized of ["not-json", "x".repeat(16_385)]) {
    assert.throws(() => createFactoryReceipt({ ...environment(), CI_FACTORY_NEEDS_JSON: serialized }, SHA), /FACTORY_INVALID_JOB_RESULTS/);
  }
});

test("receipt requires exact checkout provenance and a supported GitHub event", () => {
  assert.throws(() => createFactoryReceipt(environment(), "b".repeat(40)), /FACTORY_CHECKOUT_REVISION_MISMATCH/);
  for (const [key, value] of [
    ["GITHUB_ACTIONS", undefined], ["GITHUB_SHA", "main"], ["GITHUB_SHA", "a".repeat(39)],
    ["GITHUB_REPOSITORY", "https://evil.invalid/repo"], ["GITHUB_RUN_ID", "1\nprivate"],
    ["GITHUB_RUN_ID", "01"], ["GITHUB_RUN_ATTEMPT", "0"], ["GITHUB_EVENT_NAME", "pull_request_target"],
  ]) assert.throws(() => createFactoryReceipt({ ...environment(), [key]: value }, SHA), /FACTORY_/);
  for (const event of ["push", "pull_request", "merge_group", "workflow_dispatch"]) {
    assert.equal(createFactoryReceipt({ ...environment(), GITHUB_EVENT_NAME: event }, SHA).event, event);
  }
});

function assertWorkflowContract(config) {
  assert.deepEqual(Object.keys(config.on).sort(), ["merge_group", "pull_request", "push", "workflow_dispatch"]);
  assert.deepEqual(config.on.push, { branches: ["main", "release/**", "codex/**"] });
  for (const event of ["pull_request", "merge_group", "workflow_dispatch"]) assert.equal(config.on[event], null);
  assert.deepEqual(config.permissions, { contents: "read" });
  assert.deepEqual(Object.keys(config.jobs), [...REQUIRED_JOBS, "factory-gate"]);
  const gate = config.jobs["security-gate"];
  assert.equal(gate.if, undefined);
  assert.equal(gate.needs, undefined);
  assert.equal(gate.steps.find((step) => step.uses?.startsWith("actions/checkout@")).with["fetch-depth"], 0);
  assert.equal(gate.steps.find((step) => step.run).run, "node deploy/security-gate.mjs --history --tracked-only --redact-locations --report=.artifacts/security-gate.json");
  for (const job of ["test-and-build", "compose-runtime-smoke"]) {
    assert.deepEqual(config.jobs[job].needs, ["security-gate"]);
    assert.equal(config.jobs[job].if, undefined);
  }
  const dependencyAudit = config.jobs["test-and-build"].steps.find((step) => step.name === "Auditar toda la cadena de dependencias");
  assert.equal(dependencyAudit.shell, "bash");
  assert.equal(dependencyAudit.run.trim(), [
    "mkdir -p .artifacts",
    "audit_status=0",
    "pnpm audit --json > .artifacts/dependency-audit.json || audit_status=$?",
    'node deploy/dependency-audit.mjs --report .artifacts/dependency-audit.json --audit-exit-code "$audit_status"',
  ].join("\n"));
  const postgresChecks = config.jobs["test-and-build"].steps.find((step) => step.name === "Probar rollback histórico y protección de planes con PostgreSQL real");
  // These suites create temporary PUBLIC privilege canaries in the same QA
  // database. Parallel files would contaminate each other's isolation checks.
  assert.equal(postgresChecks.run, "node --test --test-concurrency=1 deploy/migration-atomicity.integration.test.mjs deploy/subscription-plan-seed-postgres.test.mjs deploy/schema-contract-marker.integration.test.mjs deploy/runtime-db-role.integration.test.mjs");
  assert.equal(postgresChecks.env.RUNTIME_ROLE_TEST_DATABASE_URL, postgresChecks.env.MIGRATION_TEST_DATABASE_URL);
  const deployChecks = config.jobs["test-and-build"].steps.find((step) => step.run === "pnpm test:deploy");
  assert.equal(deployChecks.env.DOCKER_CONTEXT_SAFETY_TEST, "1");
  const factory = config.jobs["factory-gate"];
  assert.equal(factory.if, "always()");
  assert.deepEqual(factory.needs, REQUIRED_JOBS);
  const factoryRun = factory.steps.find((step) => step.run);
  assert.equal(factoryRun.run, "node deploy/ci-factory.mjs --report=.artifacts/ci-factory-receipt.json");
  assert.deepEqual(factoryRun.env, { CI_FACTORY_NEEDS_JSON: "${{ toJSON(needs) }}" });
  for (const [jobId, job] of Object.entries(config.jobs)) {
    assert.equal(job["continue-on-error"], undefined);
    assert.equal(job["runs-on"], "ubuntu-24.04");
    for (const step of job.steps) {
      assert.equal(step["continue-on-error"], undefined);
      if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/u);
      if (step.uses?.startsWith("actions/checkout@")) assert.equal(step.with["persist-credentials"], false);
      if (step.uses?.startsWith("actions/setup-node@")) assert.equal(step.with["node-version"], 22);
      if (step.uses?.startsWith("actions/upload-artifact@")) {
        assert.equal(step.uses, UPLOAD);
        assert.equal(step.with["if-no-files-found"], "error");
        assert.equal(step.with["include-hidden-files"], true);
        assert.ok(step.with.name.includes("${{ github.sha }}"));
        assert.ok(step.with.name.includes("${{ github.run_id }}"));
        assert.ok(step.with.name.includes("${{ github.run_attempt }}"));
        assert.equal(step.with.path, jobId === "security-gate" ? ".artifacts/security-gate.json" : RECEIPT_PATH);
        assert.equal(step.if, jobId === "security-gate" ? "always()" : "success()");
      } else if (step.name === "Limpiar topología primaria") {
        assert.equal(step.if, "always()");
      } else {
        assert.equal(step.if, undefined);
      }
    }
  }
  const uploads = Object.values(config.jobs).flatMap((job) => job.steps).filter((step) => step.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(uploads.length, 2);
  assert.doesNotMatch(JSON.stringify(config), /\$\{\{\s*secrets\./u);
}

test("workflow has mandatory gates, immutable actions, safe artifacts and all requested events", () => {
  assertWorkflowContract(workflow);
});

test("workflow contract rejects bypasses instead of only matching reassuring text", () => {
  for (const mutate of [
    (value) => { value.jobs["test-and-build"].needs = []; },
    (value) => { value.jobs["compose-runtime-smoke"].if = "always()"; },
    (value) => { value.jobs["factory-gate"].if = "success()"; },
    (value) => { value.jobs["factory-gate"].needs.pop(); },
    (value) => { value.jobs["security-gate"].steps[2]["continue-on-error"] = true; },
    (value) => { value.jobs["security-gate"].steps[2].run += " || true"; },
    (value) => { value.jobs["security-gate"].steps[2].run = value.jobs["security-gate"].steps[2].run.replace(" --redact-locations", ""); },
    (value) => { value.jobs["security-gate"].steps[0].with["fetch-depth"] = 1; },
    (value) => { value.jobs["security-gate"].steps[0].with["persist-credentials"] = true; },
    (value) => { value.jobs["factory-gate"].steps.at(-1).with.path = ".artifacts/"; },
    (value) => { value.jobs["factory-gate"].steps.at(-1).if = "always()"; },
    (value) => { value.on.push.branches.pop(); },
    (value) => { value.permissions.contents = "write"; },
    (value) => { value.jobs["test-and-build"].steps.find((step) => step.name === "Auditar toda la cadena de dependencias").run += "\ntrue"; },
    (value) => { value.jobs["test-and-build"].steps.find((step) => step.name === "Auditar toda la cadena de dependencias").run = "pnpm audit --audit-level critical"; },
    (value) => { value.jobs["test-and-build"].steps.find((step) => step.name === "Probar rollback histórico y protección de planes con PostgreSQL real").run = value.jobs["test-and-build"].steps.find((step) => step.name === "Probar rollback histórico y protección de planes con PostgreSQL real").run.replace(" --test-concurrency=1", ""); },
    (value) => { delete value.jobs["test-and-build"].steps.find((step) => step.run === "pnpm test:deploy").env.DOCKER_CONTEXT_SAFETY_TEST; },
  ]) {
    const changed = structuredClone(workflow);
    mutate(changed);
    assert.throws(() => assertWorkflowContract(changed));
  }
});

function temporaryCheckout() {
  const cwd = mkdtempSync(join(tmpdir(), "politica-ci-factory-"));
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim();
  git(["init", "--quiet"]);
  writeFileSync(join(cwd, "fixture.txt"), "isolated CI receipt test\n");
  git(["add", "fixture.txt"]);
  git(["-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "-c", `core.hooksPath=${join(cwd, "no-hooks")}`, "commit", "--quiet", "-m", "Isolated receipt fixture"]);
  return { cwd, sha: git(["rev-parse", "HEAD"]), close: () => {
    assert.ok(resolve(cwd).startsWith(`${resolve(tmpdir())}${sep}`));
    assert.ok(basename(cwd).startsWith("politica-ci-factory-"));
    rmSync(cwd, { recursive: true, force: true });
  } };
}

test("CLI writes one exact-checkout receipt and refuses to overwrite it", () => {
  const fixture = temporaryCheckout();
  try {
    const run = () => spawnSync(process.execPath, [SCRIPT, `--report=${RECEIPT_PATH}`], { cwd: fixture.cwd, encoding: "utf8", windowsHide: true, env: { ...process.env, ...environment(), GITHUB_SHA: fixture.sha } });
    assert.equal(run().status, 0);
    const path = join(fixture.cwd, RECEIPT_PATH);
    const first = readFileSync(path, "utf8");
    assert.equal(JSON.parse(first).revision, fixture.sha);
    assert.equal(run().status, 1);
    assert.equal(readFileSync(path, "utf8"), first);
  } finally { fixture.close(); }
});

test("CLI failure emits no receipt and never prints untrusted job outputs", () => {
  const fixture = temporaryCheckout();
  try {
    const needs = success();
    needs["security-gate"] = { result: "failure", outputs: { privateValue: "fixture-private-value-never-copy" } };
    const result = spawnSync(process.execPath, [SCRIPT, `--report=${RECEIPT_PATH}`], { cwd: fixture.cwd, encoding: "utf8", windowsHide: true, env: { ...process.env, ...environment(needs), GITHUB_SHA: fixture.sha } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FACTORY_REQUIRED_JOB_NOT_SUCCESSFUL/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /private-value|privateValue/);
    assert.equal(existsSync(join(fixture.cwd, RECEIPT_PATH)), false);
  } finally { fixture.close(); }
});
