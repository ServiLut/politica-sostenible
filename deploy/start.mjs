import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runSafeMigrations } from "./migrate.mjs";
import {
  allowsInsecureEvaluationDatabase,
  requireRuntimeEnvironment,
} from "./runtime-environment.mjs";

export const API_READY_URL = "http://127.0.0.1:4000/health/ready";
export const API_READY_TIMEOUT_MS = 60_000;
const API_READY_RETRY_MS = 250;
const API_READY_REQUEST_TIMEOUT_MS = 2_000;

const children = new Set();
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 5_000).unref();
  if (children.size === 0) process.exit(exitCode);
  Promise.all(
    [...children].map(
      (child) => new Promise((resolve) => child.once("exit", resolve)),
    ),
  ).then(() => process.exit(exitCode));
}

function start(name, args, env) {
  const child = spawn(process.execPath, args, {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  let resolveExit;
  const exited = new Promise((resolvePromise) => {
    resolveExit = resolvePromise;
  });
  let exitRecorded = false;
  const recordExit = (result) => {
    if (exitRecorded) return;
    exitRecorded = true;
    children.delete(child);
    resolveExit(result);
  };

  children.add(child);
  child.once("error", (error) => {
    recordExit({ error, code: null, signal: null });
    console.error(`${name} no pudo iniciar`, { code: error.code ?? "UNKNOWN" });
    shutdown(1);
  });
  child.once("exit", (code, signal) => {
    recordExit({ error: null, code, signal });
    if (!shuttingDown) {
      console.error(`${name} terminó inesperadamente`, { code, signal });
      shutdown(code && code !== 0 ? code : 1);
    }
  });

  return { child, exited };
}

function delay(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

function readinessFailureDescription(error, status) {
  if (status) return `HTTP ${status}`;
  if (error && typeof error === "object" && "code" in error && error.code) {
    return String(error.code);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "tiempo de solicitud agotado";
  }
  return "sin respuesta";
}

export async function waitForApiReady({
  url = API_READY_URL,
  timeoutMs = API_READY_TIMEOUT_MS,
  retryMs = API_READY_RETRY_MS,
  requestTimeoutMs = API_READY_REQUEST_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = delay,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("El runtime no ofrece fetch para verificar la API");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("El tiempo maximo de espera de la API debe ser positivo");
  }

  const startedAt = now();
  let lastError;
  let lastStatus;

  while (now() - startedAt < timeoutMs) {
    lastError = undefined;
    lastStatus = undefined;
    const remaining = timeoutMs - (now() - startedAt);
    const controller = new AbortController();
    const requestTimer = setTimer(
      () => controller.abort(),
      Math.min(requestTimeoutMs, remaining),
    );

    try {
      const response = await fetchImpl(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      lastStatus = response.status;
      const ready = response.ok;
      if (response.body && typeof response.body.cancel === "function") {
        await response.body.cancel().catch(() => undefined);
      }
      if (ready) return;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimer(requestTimer);
    }

    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) break;
    await sleep(Math.min(retryMs, timeoutMs - elapsed));
  }

  throw new Error(
    `La API no estuvo lista en ${timeoutMs} ms (${readinessFailureDescription(lastError, lastStatus)})`,
  );
}

function apiExitedBeforeReadiness(exited) {
  return exited.then(({ error, code, signal }) => {
    const detail = error
      ? (error.code ?? error.message ?? "error desconocido")
      : signal
        ? `senal ${signal}`
        : `codigo ${code ?? "desconocido"}`;
    throw new Error(`La API termino antes de estar lista (${detail})`);
  });
}

export async function launchServicesInOrder({
  runMigrations,
  startApi,
  awaitApiReady,
  startWeb,
}) {
  await runMigrations();
  const api = startApi();
  if (!api?.exited || typeof api.exited.then !== "function") {
    throw new Error("El supervisor de la API no expuso su estado de salida");
  }

  await Promise.race([awaitApiReady(), apiExitedBeforeReadiness(api.exited)]);
  return startWeb();
}

async function boot() {
  requireRuntimeEnvironment();
  if (allowsInsecureEvaluationDatabase()) {
    console.warn(
      "ADVERTENCIA: conexion PostgreSQL sin TLS habilitada exclusivamente para este entorno de evaluacion. No usar este perfil con datos personales ni operativos.",
    );
  }
  await launchServicesInOrder({
    runMigrations: () => runSafeMigrations(),
    startApi: () => start("api", ["apps/api/dist/main.js"], { PORT: "4000" }),
    awaitApiReady: () => waitForApiReady(),
    startWeb: () => {
      console.log("API lista; iniciando la interfaz web.");
      return start("web", ["apps/web/server.js"], { PORT: "3000" });
    },
  });
}

function isDirectExecution() {
  return Boolean(
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
  );
}

if (isDirectExecution()) {
  process.on("SIGTERM", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));

  boot().catch((error) => {
    if (shuttingDown) return;
    console.error(
      `El arranque se detuvo antes de exponer la aplicacion: ${error instanceof Error ? error.message : "error desconocido"}`,
    );
    shutdown(1);
  });
}
