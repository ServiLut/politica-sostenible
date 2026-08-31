import { spawn } from "node:child_process";

const children = new Set();
let shuttingDown = false;

function requireRuntimeEnvironment(environment = process.env) {
  const required = [
    "DATABASE_URL",
    "JWT_SECRET",
    "CONSENT_IP_SALT",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET",
  ];
  const missing = required.filter((name) => !environment[name]?.trim());
  const invalid = [];

  if (missing.length) invalid.push(`faltan: ${missing.join(", ")}`);

  if (
    !environment.CORS_ORIGINS?.trim() &&
    !environment.NEXT_PUBLIC_APP_URL?.trim()
  ) {
    invalid.push("falta CORS_ORIGINS o NEXT_PUBLIC_APP_URL");
  }

  const jwtSecret = environment.JWT_SECRET?.trim();
  if (jwtSecret && Buffer.byteLength(jwtSecret, "utf8") < 32) {
    invalid.push("JWT_SECRET debe contener al menos 32 bytes");
  }

  for (const name of ["DATABASE_URL", "NEXT_PUBLIC_APP_URL", "SUPABASE_URL"]) {
    const value = environment[name]?.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (value.includes("your-tenant-id") || value.includes("replace-me")) {
        invalid.push(`${name} contiene un placeholder sin resolver`);
      }
      if (name !== "DATABASE_URL" && parsed.protocol !== "https:") {
        invalid.push(`${name} debe usar HTTPS`);
      }
      if (
        name === "DATABASE_URL" &&
        !["postgres:", "postgresql:"].includes(parsed.protocol)
      ) {
        invalid.push("DATABASE_URL no es una URL PostgreSQL");
      }
    } catch {
      invalid.push(`${name} no es una URL válida`);
    }
  }

  if (invalid.length) {
    console.error("Configuración de ejecución inválida:");
    for (const issue of invalid) console.error(`- ${issue}`);
    process.exit(1);
  }
}

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
requireRuntimeEnvironment();
start("api", ["apps/api/dist/main.js"], { PORT: "4000" });
start("web", ["apps/web/server.js"], { PORT: "3000" });
