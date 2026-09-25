import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PLACEHOLDER_FRAGMENTS = [
  "replace-me",
  "replace-with-",
  "example.com",
  "localhost",
  "127.0.0.1",
  "change-me",
  "changeme",
];

function hasPlaceholder(value) {
  const normalized = value.toLowerCase();
  return PLACEHOLDER_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment),
  );
}

function validHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !hasPlaceholder(value)
    );
  } catch {
    return false;
  }
}

function validLoopbackOrigin(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      ["127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.pathname === "/" && !url.username && !url.password &&
      !url.search && !url.hash;
  } catch {
    return false;
  }
}

function validAnonKey(value) {
  if (hasPlaceholder(value)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value)) return true;

  try {
    const [, payload] = value.split(".");
    if (!payload) return false;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role ===
      "anon";
  } catch {
    return false;
  }
}

export function publicBuildEnvironmentIssues(environment = process.env) {
  const appUrl = environment.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const storageUrl = environment.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const issues = [];

  const localBuild = environment.ALLOW_LOCAL_STAGING_BUILD === "true";
  const evaluation = environment.DEPLOYMENT_PROFILE === "evaluation";
  if (localBuild && !evaluation) {
    issues.push("ALLOW_LOCAL_STAGING_BUILD requiere el perfil evaluation; no se puede promover este build a producción");
  }
  const validOrigin = localBuild && evaluation ? validLoopbackOrigin : validHttpsOrigin;

  if (!validOrigin(appUrl)) {
    issues.push(localBuild && evaluation ? "NEXT_PUBLIC_APP_URL debe apuntar exclusivamente a loopback" : "NEXT_PUBLIC_APP_URL debe ser un origen HTTPS real");
  }
  if (!validOrigin(storageUrl)) {
    issues.push(localBuild && evaluation ? "NEXT_PUBLIC_SUPABASE_URL debe apuntar exclusivamente a loopback" : "NEXT_PUBLIC_SUPABASE_URL debe ser un origen HTTPS real");
  }
  if (!validAnonKey(anonKey)) {
    issues.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY debe ser una clave anon/publishable valida",
    );
  }
  return issues;
}

export function requirePublicBuildEnvironment(environment = process.env) {
  const issues = publicBuildEnvironmentIssues(environment);
  if (issues.length > 0) {
    throw new Error(
      `Configuracion publica de build invalida:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
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
    requirePublicBuildEnvironment();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Build invalido");
    process.exitCode = 1;
  }
}
