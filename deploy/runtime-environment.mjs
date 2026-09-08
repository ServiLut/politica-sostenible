const REQUIRED_VARIABLES = Object.freeze([
  "DATABASE_URL",
  "JWT_SECRET",
  "CONSENT_IP_SALT",
  "SAAS_ADMIN_USER_IDS",
  "MFA_TOTP_ACTIVE_KEY_ID",
  "MFA_TOTP_ENCRYPTION_KEY",
  "MFA_TOTP_LEGACY_PLAINTEXT_MODE",
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

const INSECURE_EVALUATION_PROFILE = "evaluation";
const IMMUTABLE_USER_ID_PATTERN =
  /^(?:c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const MAX_SAAS_ADMINS = 32;

export function allowsInsecureEvaluationDatabase(environment = process.env) {
  return (
    environment.NODE_ENV === "production" &&
    environment.DEPLOYMENT_PROFILE?.trim().toLowerCase() ===
      INSECURE_EVALUATION_PROFILE &&
    environment.ALLOW_INSECURE_DATABASE_CONNECTION === "true"
  );
}

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

function isCanonical32ByteBase64(value) {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 && decoded.toString("base64") === value;
  } catch {
    return false;
  }
}

function validateSaasAdminIdentities(issues, environment, values) {
  if (environment.SAAS_ADMIN_EMAILS?.trim()) {
    issues.push(
      "SAAS_ADMIN_EMAILS ya no es compatible; usa exclusivamente SAAS_ADMIN_USER_IDS",
    );
  }

  const serializedUserIds = values.SAAS_ADMIN_USER_IDS;
  if (!serializedUserIds) return;

  const candidates = serializedUserIds.split(",");
  if (candidates.length > MAX_SAAS_ADMINS) {
    issues.push(
      `SAAS_ADMIN_USER_IDS no puede contener mas de ${MAX_SAAS_ADMINS} usuarios`,
    );
  }

  const normalizedUserIds = candidates.map((candidate) =>
    candidate.trim().toLowerCase(),
  );
  if (
    normalizedUserIds.some(
      (userId) => !IMMUTABLE_USER_ID_PATTERN.test(userId),
    )
  ) {
    issues.push(
      "SAAS_ADMIN_USER_IDS debe contener unicamente CUIDs o UUIDs canonicos separados por coma",
    );
  }
  if (new Set(normalizedUserIds).size !== normalizedUserIds.length) {
    issues.push(
      "SAAS_ADMIN_USER_IDS no puede contener identificadores duplicados",
    );
  }
}

function validateMfaEncryption(issues, environment, values) {
  const activeKeyId = values.MFA_TOTP_ACTIVE_KEY_ID;
  if (activeKeyId && !/^[A-Za-z0-9._-]{1,32}$/.test(activeKeyId)) {
    issues.push(
      "MFA_TOTP_ACTIVE_KEY_ID debe tener entre 1 y 32 caracteres alfanumericos, punto, guion o guion bajo",
    );
  }

  const activeKey = values.MFA_TOTP_ENCRYPTION_KEY;
  if (activeKey && !isCanonical32ByteBase64(activeKey)) {
    issues.push(
      "MFA_TOTP_ENCRYPTION_KEY debe ser una clave de 32 bytes en base64 canonico",
    );
  }

  const legacyMode = values.MFA_TOTP_LEGACY_PLAINTEXT_MODE;
  if (legacyMode && !["migrate", "reject"].includes(legacyMode)) {
    issues.push("MFA_TOTP_LEGACY_PLAINTEXT_MODE debe ser migrate o reject");
  }

  const serializedPreviousKeys = environment.MFA_TOTP_PREVIOUS_KEYS?.trim();
  if (!serializedPreviousKeys) return;

  let previousKeys;
  try {
    previousKeys = JSON.parse(serializedPreviousKeys);
  } catch {
    issues.push("MFA_TOTP_PREVIOUS_KEYS debe ser un objeto JSON valido");
    return;
  }
  if (
    typeof previousKeys !== "object" ||
    previousKeys === null ||
    Array.isArray(previousKeys)
  ) {
    issues.push("MFA_TOTP_PREVIOUS_KEYS debe ser un objeto JSON");
    return;
  }

  const entries = Object.entries(previousKeys);
  if (entries.length > 8) {
    issues.push("MFA_TOTP_PREVIOUS_KEYS no puede contener mas de 8 claves");
  }
  for (const [keyId, key] of entries) {
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(keyId)) {
      issues.push(`MFA_TOTP_PREVIOUS_KEYS contiene un identificador invalido`);
    }
    if (keyId === activeKeyId) {
      issues.push("MFA_TOTP_PREVIOUS_KEYS no debe repetir la clave activa");
    }
    if (typeof key !== "string" || !isCanonical32ByteBase64(key)) {
      issues.push(
        `MFA_TOTP_PREVIOUS_KEYS.${keyId} debe ser una clave de 32 bytes en base64 canonico`,
      );
    }
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

  if (allowsInsecureEvaluationDatabase(environment)) {
    try {
      const parsed = new URL(value);
      if (parsed.searchParams.get("sslmode")?.toLowerCase() !== "disable") {
        issues.push(
          `${name} debe declarar sslmode=disable cuando la excepcion de evaluacion esta activa`,
        );
      }
    } catch {
      // validateUrl reports the malformed URL with the canonical message.
    }
    return;
  }

  try {
    const parsed = new URL(value);
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode !== "verify-full") {
      issues.push(
        `${name} debe declarar sslmode=verify-full en produccion`,
      );
    }
  } catch {
    // validateUrl reports the malformed URL with the canonical message.
  }
}

function validateProductionDatabaseFlags(issues, environment) {
  if (environment.NODE_ENV !== "production") return;

  const requestedInsecureConnection =
    environment.ALLOW_INSECURE_DATABASE_CONNECTION === "true";
  const evaluationProfile =
    environment.DEPLOYMENT_PROFILE?.trim().toLowerCase() ===
    INSECURE_EVALUATION_PROFILE;

  if (requestedInsecureConnection && !evaluationProfile) {
    issues.push(
      "ALLOW_INSECURE_DATABASE_CONNECTION solo se permite con DEPLOYMENT_PROFILE=evaluation",
    );
    return;
  }

  if (allowsInsecureEvaluationDatabase(environment)) {
    if (environment.DATABASE_SSL !== "false") {
      issues.push(
        "DATABASE_SSL debe ser false cuando la excepcion de evaluacion esta activa",
      );
    }
    if (environment.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false") {
      issues.push(
        "DATABASE_SSL_REJECT_UNAUTHORIZED debe ser false cuando la excepcion de evaluacion esta activa",
      );
    }
    return;
  }

  if (environment.DATABASE_SSL !== "true") {
    issues.push("DATABASE_SSL debe ser true en produccion");
  }
  if (environment.DATABASE_SSL_REJECT_UNAUTHORIZED !== "true") {
    issues.push(
      "DATABASE_SSL_REJECT_UNAUTHORIZED debe ser true en produccion",
    );
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

  validateSaasAdminIdentities(issues, environment, values);
  validateMfaEncryption(issues, environment, values);

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

  validateProductionDatabaseFlags(issues, environment);

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

  validateProductionDatabaseFlags(issues, environment);

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
