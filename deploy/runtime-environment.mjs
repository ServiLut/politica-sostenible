const REQUIRED_VARIABLES = Object.freeze([
  "DATABASE_URL",
  "JWT_SECRET",
  "CONSENT_IP_SALT",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
]);

const PLACEHOLDER_FRAGMENTS = Object.freeze([
  "replace-me",
  "replace-with-",
  "your-tenant-id",
  "generate-a-",
  "generate-an-",
  "tu_codigo",
  "change-me",
  "changeme",
]);

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return PLACEHOLDER_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment),
  );
}

function validateUrl(issues, name, value, protocols) {
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) {
      issues.push(
        `${name} debe usar ${protocols.map((item) => item.replace(":", "")).join(" o ")}`,
      );
    }
  } catch {
    issues.push(`${name} no es una URL valida`);
  }
}

export function runtimeEnvironmentIssues(environment = process.env) {
  const issues = [];
  const values = Object.fromEntries(
    REQUIRED_VARIABLES.map((name) => [name, environment[name]?.trim() ?? ""]),
  );
  const missing = REQUIRED_VARIABLES.filter((name) => !values[name]);

  if (missing.length) issues.push(`faltan: ${missing.join(", ")}`);

  if (
    !environment.CORS_ORIGINS?.trim() &&
    !environment.NEXT_PUBLIC_APP_URL?.trim()
  ) {
    issues.push("falta CORS_ORIGINS o NEXT_PUBLIC_APP_URL");
  }

  for (const name of REQUIRED_VARIABLES) {
    if (values[name] && isPlaceholder(values[name])) {
      issues.push(`${name} contiene un placeholder publico sin resolver`);
    }
  }

  for (const name of ["JWT_SECRET", "CONSENT_IP_SALT"]) {
    if (values[name] && Buffer.byteLength(values[name], "utf8") < 32) {
      issues.push(`${name} debe contener al menos 32 bytes aleatorios`);
    }
  }

  validateUrl(issues, "DATABASE_URL", values.DATABASE_URL, [
    "postgres:",
    "postgresql:",
  ]);
  validateUrl(issues, "SUPABASE_URL", values.SUPABASE_URL, ["https:"]);
  validateUrl(
    issues,
    "NEXT_PUBLIC_APP_URL",
    environment.NEXT_PUBLIC_APP_URL?.trim(),
    ["https:"],
  );

  const corsOrigins = environment.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of corsOrigins ?? []) {
    validateUrl(issues, "CORS_ORIGINS", origin, ["https:"]);
  }

  return issues;
}

export function requireRuntimeEnvironment(environment = process.env) {
  const issues = runtimeEnvironmentIssues(environment);
  if (issues.length > 0) {
    throw new Error(
      `Configuracion de ejecucion invalida:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
  }
}
