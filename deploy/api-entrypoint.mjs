import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  allowsInsecureEvaluationDatabase,
  requireRuntimeEnvironment,
} from "./runtime-environment.mjs";

export async function startApi(
  environment = process.env,
  loadApi = () => import("../apps/api/dist/main.js"),
) {
  requireRuntimeEnvironment(environment);
  if (allowsInsecureEvaluationDatabase(environment)) {
    console.warn(
      "ADVERTENCIA: conexion PostgreSQL sin TLS habilitada exclusivamente para evaluacion sin datos reales.",
    );
  }
  await loadApi();
}

function isDirectExecution() {
  return Boolean(
    process.argv[1] &&
      import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
  );
}

if (isDirectExecution()) {
  startApi().catch((error) => {
    console.error(
      `La API rechazo su configuracion de arranque: ${error instanceof Error ? error.message : "error desconocido"}`,
    );
    process.exitCode = 1;
  });
}
