import { spawn } from "node:child_process";
import { runSafeMigrations } from "./migrate.mjs";
import { requireRuntimeEnvironment } from "./runtime-environment.mjs";

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
  children.add(child);
  child.once("error", (error) => {
    console.error(`${name} no pudo iniciar`, { code: error.code ?? "UNKNOWN" });
    shutdown(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`${name} terminó inesperadamente`, { code, signal });
      shutdown(code && code !== 0 ? code : 1);
    }
  });
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

async function boot() {
  requireRuntimeEnvironment();
  await runSafeMigrations();
  start("api", ["apps/api/dist/main.js"], { PORT: "4000" });
  start("web", ["apps/web/server.js"], { PORT: "3000" });
}

boot().catch((error) => {
  console.error(
    `El arranque se detuvo antes de exponer la aplicacion: ${error instanceof Error ? error.message : "error desconocido"}`,
  );
  shutdown(1);
});
