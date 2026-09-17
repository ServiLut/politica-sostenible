import { spawn } from "node:child_process";
import { closeSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runSafeMigrations } from "./migrate.mjs";
import { catalogWorkerHealthIssues } from "./catalog-worker-healthcheck.mjs";
import {
  allowsInsecureEvaluationDatabase,
  requireRuntimeEnvironment,
} from "./runtime-environment.mjs";

export const API_READY_URL = "http://127.0.0.1:4000/health/ready";
export const API_READY_TIMEOUT_MS = 60_000;
export const CATALOG_WORKER_READY_TIMEOUT_MS = 60_000;
export const SUPERVISOR_SHUTDOWN_GRACE_MS = 30_000;
const MINIMUM_SUPERVISOR_SHUTDOWN_GRACE_MS = 10_000;
const MAXIMUM_SUPERVISOR_SHUTDOWN_GRACE_MS = 120_000;
const API_READY_RETRY_MS = 250;
const API_READY_REQUEST_TIMEOUT_MS = 2_000;
const CATALOG_WORKER_READY_RETRY_MS = 250;

const SYSTEM_ENVIRONMENT_KEYS = Object.freeze([
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "TZ",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
]);
const API_ENVIRONMENT_KEYS = Object.freeze([
  "NODE_ENV",
  "DATABASE_URL",
  "DATABASE_SCHEMA",
  "DATABASE_SSL",
  "DATABASE_SSL_REJECT_UNAUTHORIZED",
  "REDIS_URL",
  "REDIS_ALLOW_PLAINTEXT_INTERNAL",
  "DEPLOYMENT_PROFILE",
  "ALLOW_INSECURE_DATABASE_CONNECTION",
  "JWT_SECRET",
  "CONSENT_IP_SALT",
  "OFFLINE_SYNC_HMAC_SECRET",
  "SAAS_ADMIN_USER_IDS",
  "MFA_TOTP_ACTIVE_KEY_ID",
  "MFA_TOTP_ENCRYPTION_KEY",
  "MFA_TOTP_LEGACY_PLAINTEXT_MODE",
  "MFA_TOTP_PREVIOUS_KEYS",
  "CORS_ORIGINS",
  "NEXT_PUBLIC_APP_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "SENTRY_DSN",
  "SENTRY_TRACES_SAMPLE_RATE",
]);
const CATALOG_WORKER_ENVIRONMENT_KEYS = Object.freeze([
  "NODE_ENV",
  "DATABASE_URL",
  "DATABASE_SCHEMA",
  "DATABASE_SSL",
  "DATABASE_SSL_REJECT_UNAUTHORIZED",
  "DEPLOYMENT_PROFILE",
  "ALLOW_INSECURE_DATABASE_CONNECTION",
  "REDIS_URL",
  "REDIS_ALLOW_PLAINTEXT_INTERNAL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "SENTRY_DSN",
  "SENTRY_TRACES_SAMPLE_RATE",
]);
const WEB_ENVIRONMENT_KEYS = Object.freeze([
  "NODE_ENV",
  "HOSTNAME",
  "NESTJS_API_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);
const SUPERVISOR_SECRET_KEYS = Object.freeze([
  "DATABASE_URL",
  "DIRECT_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PASSWORD",
  "JWT_SECRET",
  "CONSENT_IP_SALT",
  "OFFLINE_SYNC_HMAC_SECRET",
  "SAAS_ADMIN_USER_IDS",
  "MFA_TOTP_ENCRYPTION_KEY",
  "MFA_TOTP_PREVIOUS_KEYS",
  "SUPABASE_SERVICE_ROLE_KEY",
  "REDIS_URL",
  "SENTRY_DSN",
]);
const SERVICE_IDENTITY_KEYS = Object.freeze({
  api: ["API_PROCESS_UID", "API_PROCESS_GID"],
  catalogWorker: ["CATALOG_WORKER_PROCESS_UID", "CATALOG_WORKER_PROCESS_GID"],
  web: ["WEB_PROCESS_UID", "WEB_PROCESS_GID"],
});

const children = new Set();
let shuttingDown = false;
let configuredShutdownGraceMs = SUPERVISOR_SHUTDOWN_GRACE_MS;

export function resolveSupervisorShutdownGraceMs(environment = process.env) {
  const configured = environment.SUPERVISOR_SHUTDOWN_GRACE_MS?.trim();
  if (!configured) return SUPERVISOR_SHUTDOWN_GRACE_MS;
  if (!/^[0-9]+$/.test(configured)) {
    throw new Error(
      "SUPERVISOR_SHUTDOWN_GRACE_MS debe ser un entero en milisegundos",
    );
  }

  const milliseconds = Number(configured);
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < MINIMUM_SUPERVISOR_SHUTDOWN_GRACE_MS ||
    milliseconds > MAXIMUM_SUPERVISOR_SHUTDOWN_GRACE_MS
  ) {
    throw new Error(
      `SUPERVISOR_SHUTDOWN_GRACE_MS debe estar entre ${MINIMUM_SUPERVISOR_SHUTDOWN_GRACE_MS} y ${MAXIMUM_SUPERVISOR_SHUTDOWN_GRACE_MS}`,
    );
  }
  return milliseconds;
}

export function stopChildrenGracefully(
  childProcesses,
  {
    exitCode = 0,
    graceMs = SUPERVISOR_SHUTDOWN_GRACE_MS,
    exitProcess = process.exit.bind(process),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {},
) {
  const activeChildren = [...childProcesses].filter(
    (child) => child.exitCode === null && child.signalCode === null,
  );
  if (activeChildren.length === 0) {
    exitProcess(exitCode);
    return Promise.resolve("graceful");
  }

  const pendingChildren = new Set(activeChildren);
  const exits = activeChildren.map(
    (child) =>
      new Promise((resolvePromise) => {
        child.once("exit", () => {
          pendingChildren.delete(child);
          resolvePromise();
        });
      }),
  );
  let forced = false;
  let resolveForcedExit;
  const forcedExit = new Promise((resolvePromise) => {
    resolveForcedExit = resolvePromise;
  });
  const forceTimer = setTimer(() => {
    forced = true;
    for (const child of pendingChildren) child.kill("SIGKILL");
    resolveForcedExit("forced");
    exitProcess(exitCode);
  }, graceMs);
  forceTimer?.unref?.();

  for (const child of activeChildren) child.kill("SIGTERM");

  const gracefulExit = Promise.all(exits).then(() => {
    if (forced) return "forced";
    clearTimer(forceTimer);
    exitProcess(exitCode);
    return "graceful";
  });
  return Promise.race([gracefulExit, forcedExit]);
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  void stopChildrenGracefully(children, {
    exitCode,
    graceMs: configuredShutdownGraceMs,
  });
}

export function buildChildEnvironment(
  target,
  source = process.env,
  overrides = {},
) {
  const targetKeys =
    target === "api"
      ? API_ENVIRONMENT_KEYS
      : target === "catalog-worker"
        ? CATALOG_WORKER_ENVIRONMENT_KEYS
        : target === "web"
          ? WEB_ENVIRONMENT_KEYS
          : [];
  const allowed = new Set([...SYSTEM_ENVIRONMENT_KEYS, ...targetKeys]);
  const selected = {};
  for (const key of allowed) {
    if (typeof source[key] === "string") selected[key] = source[key];
  }
  return { ...selected, ...overrides };
}

export function scrubSupervisorSecrets(environment = process.env) {
  for (const key of SUPERVISOR_SECRET_KEYS) delete environment[key];
}

function parseServiceId(value, key) {
  if (!/^[1-9][0-9]{0,9}$/.test(value ?? "")) {
    throw new Error(`${key} debe ser un entero positivo distinto de root`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 2_147_483_647) {
    throw new Error(`${key} esta fuera del rango permitido`);
  }
  return parsed;
}

export function resolveCombinedRuntimeIdentities(
  environment = process.env,
  { platform = process.platform, supervisorUid = process.getuid?.() } = {},
) {
  const configuredValues = Object.values(SERVICE_IDENTITY_KEYS)
    .flat()
    .map((key) => environment[key]?.trim())
    .filter(Boolean);

  if (configuredValues.length === 0) {
    if (environment.NODE_ENV === "production") {
      throw new Error(
        "El contenedor combinado de produccion exige UID y GID separados para API, worker y web",
      );
    }
    return { api: undefined, web: undefined };
  }
  if (configuredValues.length !== 6) {
    throw new Error(
      "La separacion de procesos exige UID y GID para API, worker y web",
    );
  }
  if (platform === "win32" || supervisorUid !== 0) {
    throw new Error(
      "La separacion de procesos exige un supervisor root en Linux que reduzca privilegios al crear cada hijo",
    );
  }

  const [apiUidKey, apiGidKey] = SERVICE_IDENTITY_KEYS.api;
  const [workerUidKey, workerGidKey] = SERVICE_IDENTITY_KEYS.catalogWorker;
  const [webUidKey, webGidKey] = SERVICE_IDENTITY_KEYS.web;
  const api = {
    uid: parseServiceId(environment[apiUidKey]?.trim(), apiUidKey),
    gid: parseServiceId(environment[apiGidKey]?.trim(), apiGidKey),
  };
  const catalogWorker = {
    uid: parseServiceId(environment[workerUidKey]?.trim(), workerUidKey),
    gid: parseServiceId(environment[workerGidKey]?.trim(), workerGidKey),
  };
  const web = {
    uid: parseServiceId(environment[webUidKey]?.trim(), webUidKey),
    gid: parseServiceId(environment[webGidKey]?.trim(), webGidKey),
  };

  if (
    new Set([api.uid, catalogWorker.uid, web.uid]).size !== 3 ||
    new Set([api.gid, catalogWorker.gid, web.gid]).size !== 3
  ) {
    throw new Error("API, worker y web deben usar UID y GID distintos");
  }
  return { api, catalogWorker, web };
}

export function assertCombinedRuntimeBoundary(
  identities,
  {
    readStatus = () => readFileSync("/proc/self/status", "utf8"),
    openProbe = (path) => openSync(path, "wx"),
    closeProbe = closeSync,
    removeProbe = unlinkSync,
    probePath = `/app/.combined-runtime-write-probe-${process.pid}`,
  } = {},
) {
  if (!identities.api && !identities.web) return;

  if (!/^NoNewPrivs:\s+1$/mu.test(readStatus())) {
    throw new Error(
      "El contenedor combinado exige no-new-privileges para aislar API, worker y web",
    );
  }

  let descriptor;
  try {
    descriptor = openProbe(probePath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EROFS") return;
    throw new Error(
      `No se pudo demostrar que /app sea de solo lectura (${error?.code ?? "error desconocido"})`,
    );
  }

  try {
    closeProbe(descriptor);
    descriptor = undefined;
  } finally {
    if (descriptor !== undefined) closeProbe(descriptor);
    removeProbe(probePath);
  }
  throw new Error(
    "El contenedor combinado exige un filesystem /app de solo lectura",
  );
}

export function clearSupervisorSupplementaryGroups(
  identities,
  setGroups = process.setgroups?.bind(process),
) {
  if (!identities.api && !identities.web) return;
  if (typeof setGroups !== "function") {
    throw new Error("No se pueden limpiar los grupos suplementarios");
  }
  setGroups([]);
}

function start(name, args, environment, identity) {
  const child = spawn(process.execPath, args, {
    env: environment,
    stdio: "inherit",
    ...(identity ?? {}),
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

export async function waitForCatalogWorkerReady({
  timeoutMs = CATALOG_WORKER_READY_TIMEOUT_MS,
  retryMs = CATALOG_WORKER_READY_RETRY_MS,
  healthIssues = () => catalogWorkerHealthIssues(),
  now = Date.now,
  sleep = delay,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("El tiempo maximo de espera del worker debe ser positivo");
  }

  const startedAt = now();
  let lastIssues = ["heartbeat aun no disponible"];
  while (now() - startedAt < timeoutMs) {
    try {
      lastIssues = healthIssues();
      if (Array.isArray(lastIssues) && lastIssues.length === 0) return;
    } catch {
      lastIssues = ["heartbeat ausente o ilegible"];
    }

    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) break;
    await sleep(Math.min(retryMs, timeoutMs - elapsed));
  }

  throw new Error(
    `El worker no estuvo listo en ${timeoutMs} ms (${lastIssues.join(", ")})`,
  );
}

function serviceExitedBeforeReadiness(name, exited) {
  return exited.then(({ error, code, signal }) => {
    const detail = error
      ? (error.code ?? error.message ?? "error desconocido")
      : signal
        ? `senal ${signal}`
        : `codigo ${code ?? "desconocido"}`;
    throw new Error(`${name} termino antes de estar disponible (${detail})`);
  });
}

export async function launchServicesInOrder({
  runMigrations,
  startCatalogWorker,
  awaitCatalogWorkerReady,
  startApi,
  awaitApiReady,
  startWeb,
}) {
  await runMigrations();
  const catalogWorker = startCatalogWorker();
  if (
    !catalogWorker?.exited ||
    typeof catalogWorker.exited.then !== "function"
  ) {
    throw new Error("El supervisor del worker no expuso su estado de salida");
  }
  await Promise.race([
    awaitCatalogWorkerReady(),
    serviceExitedBeforeReadiness("El worker", catalogWorker.exited),
  ]);

  const api = startApi();
  if (!api?.exited || typeof api.exited.then !== "function") {
    throw new Error("El supervisor de la API no expuso su estado de salida");
  }

  await Promise.race([
    awaitApiReady(),
    serviceExitedBeforeReadiness("La API", api.exited),
  ]);
  return startWeb();
}

async function boot() {
  requireRuntimeEnvironment();
  configuredShutdownGraceMs = resolveSupervisorShutdownGraceMs();
  const identities = resolveCombinedRuntimeIdentities();
  assertCombinedRuntimeBoundary(identities);
  if (allowsInsecureEvaluationDatabase()) {
    console.warn(
      "ADVERTENCIA: conexion PostgreSQL sin TLS habilitada exclusivamente para este entorno de evaluacion. No usar este perfil con datos personales ni operativos.",
    );
  }
  await launchServicesInOrder({
    runMigrations: async () => {
      await runSafeMigrations();
      clearSupervisorSupplementaryGroups(identities);
    },
    startCatalogWorker: () =>
      start(
        "catalog-worker",
        ["deploy/catalog-worker-entrypoint.mjs"],
        buildChildEnvironment("catalog-worker", process.env, {
          HOME: "/home/politica-worker",
          TMPDIR: "/tmp",
        }),
        identities.catalogWorker,
      ),
    awaitCatalogWorkerReady: () => waitForCatalogWorkerReady(),
    startApi: () => {
      const api = start(
        "api",
        ["apps/api/dist/main.js"],
        buildChildEnvironment("api", process.env, {
          PORT: "4000",
          HOME: "/home/politica-api",
          TMPDIR: "/tmp",
        }),
        identities.api,
      );
      scrubSupervisorSecrets();
      return api;
    },
    awaitApiReady: () => waitForApiReady(),
    startWeb: () => {
      console.log("API lista; iniciando la interfaz web.");
      return start(
        "web",
        ["apps/web/server.js"],
        buildChildEnvironment("web", process.env, {
          PORT: "3000",
          HOME: "/home/politica-web",
          TMPDIR: "/tmp",
        }),
        identities.web,
      );
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
