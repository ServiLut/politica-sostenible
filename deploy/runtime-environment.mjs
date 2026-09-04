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
  "generate-a-",
  "generate-an-",
  "tu_codigo",
  "change-me",
  "changeme",
]);

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  if (
    PLACEHOLDER_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  ) {
    return true;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    const usesReservedExampleHost =
      hostname === "example.com" || hostname.endsWith(".example.com");
    const usesTemplateDatabaseAuthority =
      parsed.username.toLowerCase() === "user" &&
      parsed.password.toLowerCase() === "password" &&
      hostname === "host";

    return usesReservedExampleHost || usesTemplateDatabaseAuthority;
  } catch {
    return false;
  }
}

function connectionFromPostgresParts(environment) {
  const host = environment.POSTGRES_HOST?.trim();
  const user = environment.POSTGRES_USER?.trim();
  const password = environment.POSTGRES_PASSWORD?.trim();
  const database = environment.POSTGRES_DATABASE?.trim();
  const port = environment.POSTGRES_PORT?.trim() || "5432";

  if (!host || !user || !password || !database) return null;
  if (
    host.includes("://") ||
    host.includes("/") ||
    !/^\d{1,5}$/.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65_535
  ) {
    return null;
  }

  const connection = new URL("postgresql://database.invalid");
  connection.hostname = host;
  connection.port = port;
  connection.username = user;
  connection.password = password;
  connection.pathname = database;

  const configuredSchema = environment.DATABASE_SCHEMA?.trim();
  const urlCandidates = [
    environment.DIRECT_URL,
    environment.POSTGRES_URL_NON_POOLING,
    environment.DATABASE_URL,
  ];
  let inheritedSchema = "";
  let inheritedSslMode = "";
  for (const candidate of urlCandidates) {
    if (!candidate?.trim()) continue;
    try {
      const parsed = new URL(candidate.trim());
      inheritedSchema ||= parsed.searchParams.get("schema")?.trim() ?? "";
      inheritedSslMode ||= parsed.searchParams.get("sslmode")?.trim() ?? "";
    } catch {
      // A malformed candidate must not prevent recovery from complete POSTGRES_* parts.
    }
  }

  connection.searchParams.set(
    "schema",
    configuredSchema || inheritedSchema || "public",
  );
  if (inheritedSslMode) connection.searchParams.set("sslmode", inheritedSslMode);

  return connection.toString();
}

export function prepareRuntimeEnvironment(environment = process.env) {
  const isUsablePostgresUrl = (value) => {
    if (!value?.trim() || isPlaceholder(value.trim())) return false;
    try {
      return ["postgres:", "postgresql:"].includes(
        new URL(value.trim()).protocol,
      );
    } catch {
      return false;
    }
  };

  if (!isUsablePostgresUrl(environment.DATABASE_URL)) {
    const runtimeCandidate = [
      environment.POSTGRES_PRISMA_URL,
      environment.POSTGRES_URL,
    ].find(isUsablePostgresUrl);
    if (runtimeCandidate) environment.DATABASE_URL = runtimeCandidate.trim();
  }

  if (!isUsablePostgresUrl(environment.DIRECT_URL)) {
    const directCandidate = [environment.POSTGRES_URL_NON_POOLING].find(
      isUsablePostgresUrl,
    );
    if (directCandidate) environment.DIRECT_URL = directCandidate.trim();
  }

  const runtimeNeedsRecovery = !isUsablePostgresUrl(environment.DATABASE_URL);
  const directNeedsRecovery = !isUsablePostgresUrl(environment.DIRECT_URL);
  if (runtimeNeedsRecovery || directNeedsRecovery) {
    const recoveredUrl = connectionFromPostgresParts(environment);
    if (recoveredUrl) {
      if (runtimeNeedsRecovery) environment.DATABASE_URL = recoveredUrl;
      if (directNeedsRecovery) environment.DIRECT_URL = recoveredUrl;
    }
  }

  const configuredSchema = environment.DATABASE_SCHEMA?.trim();
  if (configuredSchema) {
    for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
      const value = environment[name]?.trim();
      if (!value) continue;
      try {
        const parsed = new URL(value);
        parsed.searchParams.set("schema", configuredSchema);
        environment[name] = parsed.toString();
      } catch {
        // Validation below reports malformed URLs without hiding the operator error.
      }
    }
  }

  return environment;
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

function validateProductionDatabaseTls(issues, environment, name, value) {
  if (environment.NODE_ENV !== "production" || !value) return;

  try {
    const parsed = new URL(value);
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    if (!sslMode || !["require", "verify-ca", "verify-full"].includes(sslMode)) {
      issues.push(
        `${name} debe declarar sslmode=require, verify-ca o verify-full en produccion`,
      );
    }
  } catch {
    // validateUrl reports the malformed URL with the canonical message.
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

  const directUrl = environment.DIRECT_URL?.trim() ?? "";
  if (directUrl && isPlaceholder(directUrl)) {
    issues.push("DIRECT_URL contiene un placeholder publico sin resolver");
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
  validateUrl(issues, "DIRECT_URL", directUrl, ["postgres:", "postgresql:"]);
  validateProductionDatabaseTls(
    issues,
    environment,
    "DATABASE_URL",
    values.DATABASE_URL,
  );
  validateProductionDatabaseTls(
    issues,
    environment,
    "DIRECT_URL",
    directUrl,
  );

  if (environment.NODE_ENV === "production") {
    if (environment.DATABASE_SSL !== "true") {
      issues.push("DATABASE_SSL debe ser true en produccion");
    }
    if (environment.DATABASE_SSL_REJECT_UNAUTHORIZED !== "true") {
      issues.push(
        "DATABASE_SSL_REJECT_UNAUTHORIZED debe ser true en produccion",
      );
    }
  }

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

export function migrationEnvironmentIssues(environment = process.env) {
  const issues = [];
  const databaseUrl = environment.DATABASE_URL?.trim() ?? "";
  const directUrl = environment.DIRECT_URL?.trim() ?? "";

  const missing = [
    ...(databaseUrl ? [] : ["DATABASE_URL"]),
    ...(directUrl ? [] : ["DIRECT_URL"]),
  ];
  if (missing.length) issues.push(`faltan: ${missing.join(", ")}`);

  for (const [name, value] of [
    ["DATABASE_URL", databaseUrl],
    ["DIRECT_URL", directUrl],
  ]) {
    if (value && isPlaceholder(value)) {
      issues.push(`${name} contiene un placeholder publico sin resolver`);
    }
    validateUrl(issues, name, value, ["postgres:", "postgresql:"]);
    validateProductionDatabaseTls(issues, environment, name, value);
  }

  if (environment.NODE_ENV === "production") {
    if (environment.DATABASE_SSL !== "true") {
      issues.push("DATABASE_SSL debe ser true en produccion");
    }
    if (environment.DATABASE_SSL_REJECT_UNAUTHORIZED !== "true") {
      issues.push(
        "DATABASE_SSL_REJECT_UNAUTHORIZED debe ser true en produccion",
      );
    }
  }

  return issues;
}

export function requireMigrationEnvironment(environment = process.env) {
  prepareRuntimeEnvironment(environment);
  const issues = migrationEnvironmentIssues(environment);
  if (issues.length > 0) {
    throw new Error(
      `Configuracion de migracion invalida:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
  }
}

export function requireRuntimeEnvironment(environment = process.env) {
  prepareRuntimeEnvironment(environment);
  const issues = runtimeEnvironmentIssues(environment);
  if (issues.length > 0) {
    throw new Error(
      `Configuracion de ejecucion invalida:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
  }
}
