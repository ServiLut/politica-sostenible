import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_JOBS = Object.freeze([
  "security-gate",
  "test-and-build",
  "compose-runtime-smoke",
]);
export const RECEIPT_PATH = ".artifacts/ci-factory-receipt.json";

class FactoryGateError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function demand(condition, code) {
  if (!condition) throw new FactoryGateError(code);
}

/** Copy only public provenance and required job results, never arbitrary outputs. */
export function createFactoryReceipt(environment, checkoutSha, now = new Date()) {
  demand(environment.GITHUB_ACTIONS === "true", "FACTORY_REQUIRES_GITHUB_ACTIONS");
  const revision = environment.GITHUB_SHA;
  demand(typeof revision === "string" && /^[a-f0-9]{40}$/u.test(revision), "FACTORY_INVALID_REVISION");
  demand(checkoutSha === revision, "FACTORY_CHECKOUT_REVISION_MISMATCH");
  const repository = environment.GITHUB_REPOSITORY;
  demand(typeof repository === "string" && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u.test(repository), "FACTORY_INVALID_REPOSITORY");
  const runId = environment.GITHUB_RUN_ID;
  const runAttempt = environment.GITHUB_RUN_ATTEMPT;
  demand(typeof runId === "string" && /^[1-9][0-9]{0,19}$/u.test(runId), "FACTORY_INVALID_RUN_ID");
  demand(typeof runAttempt === "string" && /^[1-9][0-9]{0,5}$/u.test(runAttempt), "FACTORY_INVALID_RUN_ATTEMPT");
  const event = environment.GITHUB_EVENT_NAME;
  demand(["push", "pull_request", "merge_group", "workflow_dispatch"].includes(event), "FACTORY_UNSUPPORTED_EVENT");

  const serializedNeeds = environment.CI_FACTORY_NEEDS_JSON;
  demand(typeof serializedNeeds === "string" && serializedNeeds.length <= 16_384, "FACTORY_INVALID_JOB_RESULTS");
  let needs;
  try {
    needs = JSON.parse(serializedNeeds);
  } catch {
    throw new FactoryGateError("FACTORY_INVALID_JOB_RESULTS");
  }
  demand(needs && typeof needs === "object" && !Array.isArray(needs), "FACTORY_INVALID_JOB_RESULTS");
  demand(Object.keys(needs).length === REQUIRED_JOBS.length && REQUIRED_JOBS.every((job) => Object.hasOwn(needs, job)), "FACTORY_INCOMPLETE_JOB_RESULTS");
  const results = {};
  for (const job of REQUIRED_JOBS) {
    demand(needs[job] && typeof needs[job] === "object" && !Array.isArray(needs[job]) && needs[job].result === "success", "FACTORY_REQUIRED_JOB_NOT_SUCCESSFUL");
    results[job] = needs[job].result;
  }
  demand(now instanceof Date && Number.isFinite(now.getTime()), "FACTORY_INVALID_CLOCK");
  return {
    schema: 1,
    kind: "ci-verification-receipt",
    passed: true,
    revision,
    repository,
    runId,
    runAttempt,
    event,
    runUrl: `https://github.com/${repository}/actions/runs/${runId}/attempts/${runAttempt}`,
    workflow: ".github/workflows/ci.yml",
    results,
    issuedAt: now.toISOString(),
    deploymentPerformed: false,
  };
}

export function runFactoryGate(args, environment = process.env, cwd = process.cwd()) {
  // One fixed, public artifact prevents a caller from redirecting a receipt to
  // an environment/credential file or uploading a wider workspace directory.
  demand(args.length === 1 && args[0] === `--report=${RECEIPT_PATH}`, "FACTORY_UNSUPPORTED_ARGUMENT");
  const checkoutSha = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const receipt = createFactoryReceipt(environment, checkoutSha);
  const destination = resolve(cwd, RECEIPT_PATH);
  mkdirSync(dirname(destination), { recursive: true });
  // A rerun must have a clean checkout. Never silently reuse/replace a receipt.
  writeFileSync(destination, `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const receipt = runFactoryGate(process.argv.slice(2));
    console.log(`FACTORY_GATE_PASSED revision=${receipt.revision}`);
  } catch (error) {
    // Do not print exception stacks, environment values, needs outputs or paths.
    console.error(error instanceof FactoryGateError ? error.code : "FACTORY_GATE_FAILED");
    process.exitCode = 1;
  }
}
