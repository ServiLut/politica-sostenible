import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  allowsInsecureEvaluationDatabase,
  allowsPlaintextInternalRedis,
  requireCatalogWorkerEnvironment,
} from "./runtime-environment.mjs";

export async function startCatalogWorker(
  environment = process.env,
  loadWorker = () =>
    import("../apps/api/dist/electoral-catalog-worker.main.js"),
) {
  requireCatalogWorkerEnvironment(environment);
  if (allowsInsecureEvaluationDatabase(environment)) {
    console.warn(
      "ADVERTENCIA: PostgreSQL sin TLS habilitado exclusivamente para evaluacion sin datos reales.",
    );
  }
  if (
    environment.NODE_ENV === "production" &&
    allowsPlaintextInternalRedis(environment)
  ) {
    console.warn(
      "ADVERTENCIA: Redis sin TLS habilitado exclusivamente para una red privada verificada.",
    );
  }
  await loadWorker();
}

function isDirectExecution() {
  return Boolean(
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
  );
}

if (isDirectExecution()) {
  startCatalogWorker().catch((error) => {
    console.error(
      `El worker de catalogo electoral rechazo su configuracion de arranque: ${error instanceof Error ? error.message : "error desconocido"}`,
    );
    process.exitCode = 1;
  });
}
