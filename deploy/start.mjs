import { spawn } from "node:child_process";

const children = new Set();
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 5_000).unref();
  if (children.size === 0) process.exit(exitCode);
  Promise.all([...children].map((child) => new Promise((resolve) => child.once("exit", resolve)))).then(() => process.exit(exitCode));
}

function start(name, args, env) {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: "inherit" });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`${name} terminó inesperadamente`, { code, signal });
      shutdown(code ?? 1);
    }
  });
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
start("api", ["apps/api/dist/main.js"], { PORT: "4000" });
start("web", ["apps/web/server.js"], { PORT: "3000" });
