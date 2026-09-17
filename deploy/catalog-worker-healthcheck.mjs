import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CATALOG_WORKER_HEARTBEAT_PATH =
  "/tmp/electoral-catalog-worker.ready";
export const CATALOG_WORKER_MAX_HEARTBEAT_AGE_MS = 90_000;
const MAXIMUM_CLOCK_SKEW_MS = 5_000;

export function catalogWorkerHealthIssues({
  heartbeatPath = CATALOG_WORKER_HEARTBEAT_PATH,
  now = Date.now(),
  readHeartbeat = (path) => readFileSync(path, "utf8"),
  statHeartbeat = statSync,
} = {}) {
  const issues = [];
  let stat;
  let serializedHeartbeat;

  try {
    stat = statHeartbeat(heartbeatPath);
    serializedHeartbeat = readHeartbeat(heartbeatPath).trim();
  } catch {
    return ["heartbeat ausente o ilegible"];
  }

  if (typeof stat.isFile === "function" && !stat.isFile()) {
    issues.push("heartbeat no es un archivo regular");
  }
  if (stat.size > 64) issues.push("heartbeat excede el tamano esperado");

  const heartbeatTime = Date.parse(serializedHeartbeat);
  if (!Number.isFinite(heartbeatTime)) {
    issues.push("heartbeat no contiene una fecha ISO valida");
    return issues;
  }

  const contentAge = now - heartbeatTime;
  const modifiedAge = now - stat.mtimeMs;
  if (
    contentAge < -MAXIMUM_CLOCK_SKEW_MS ||
    modifiedAge < -MAXIMUM_CLOCK_SKEW_MS
  ) {
    issues.push("heartbeat esta fechado en el futuro");
  }
  if (
    contentAge > CATALOG_WORKER_MAX_HEARTBEAT_AGE_MS ||
    modifiedAge > CATALOG_WORKER_MAX_HEARTBEAT_AGE_MS
  ) {
    issues.push("heartbeat vencido");
  }

  return issues;
}

export function requireCatalogWorkerHealth(options) {
  const issues = catalogWorkerHealthIssues(options);
  if (issues.length > 0) {
    throw new Error(`Worker no saludable: ${issues.join(", ")}`);
  }
}

function isDirectExecution() {
  return Boolean(
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
  );
}

if (isDirectExecution()) {
  try {
    requireCatalogWorkerHealth();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Worker no saludable",
    );
    process.exitCode = 1;
  }
}
