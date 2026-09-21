import { isIP } from "node:net";

const REQUIRED_VARIABLES = Object.freeze([
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "CONSENT_IP_SALT",
  "OFFLINE_SYNC_HMAC_SECRET",
  "SAAS_ADMIN_USER_IDS",
  "MFA_TOTP_ACTIVE_KEY_ID",
  "MFA_TOTP_ENCRYPTION_KEY",
  "MFA_TOTP_LEGACY_PLAINTEXT_MODE",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
]);

const CATALOG_WORKER_REQUIRED_VARIABLES = Object.freeze([
  "DATABASE_URL",
  "REDIS_URL",
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
const MINIMUM_REDIS_PASSWORD_BYTES = 16;
const MINIMUM_STORAGE_SERVICE_KEY_BYTES = 32;

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
  if (PLACEHOLDER_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
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
  const disabled = environment.SAAS_ADMIN_DISABLED;
  if (disabled !== undefined && !["true", "false"].includes(disabled)) {
    issues.push("SAAS_ADMIN_DISABLED debe ser true o false");
  }
  if (environment.SAAS_ADMIN_EMAILS?.trim()) {
    issues.push(
      "SAAS_ADMIN_EMAILS ya no es compatible; usa exclusivamente SAAS_ADMIN_USER_IDS",
    );
  }

  const serializedUserIds = values.SAAS_ADMIN_USER_IDS;
  if (disabled === "true") {
    if (serializedUserIds) {
      issues.push("SAAS_ADMIN_DISABLED=true no permite SAAS_ADMIN_USER_IDS");
    }
    return;
  }
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
    normalizedUserIds.some((userId) => !IMMUTABLE_USER_ID_PATTERN.test(userId))
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
  if (inheritedSslMode)
    connection.searchParams.set("sslmode", inheritedSslMode);

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
      issues.push(`${name} debe declarar sslmode=verify-full en produccion`);
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
    issues.push("DATABASE_SSL_REJECT_UNAUTHORIZED debe ser true en produccion");
  }
}

function validateSessionBoundDatabaseConnection(
  issues,
  environment,
  name,
  value,
) {
  if (environment.NODE_ENV !== "production" || !value) return;

  try {
    const parsed = new URL(value);
    const poolMode = parsed.searchParams.get("pool_mode")?.toLowerCase();
    const usesTransactionPooler =
      parsed.searchParams.get("pgbouncer")?.toLowerCase() === "true" ||
      poolMode === "transaction" ||
      parsed.port === "6543";
    if (usesTransactionPooler) {
      issues.push(
        `${name} debe ser una conexion directa o de sesion: el SQL directo exige un search_path verificable y no admite pool_mode=transaction, pgbouncer=true ni el puerto 6543`,
      );
    }
  } catch {
    // validateUrl reports malformed URLs with the canonical message.
  }
}

function isEvaluationProfile(environment) {
  return (
    environment.DEPLOYMENT_PROFILE?.trim().toLowerCase() ===
    INSECURE_EVALUATION_PROFILE
  );
}

function isPrivateRedisHostname(hostname) {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const ipVersion = isIP(normalized);

  if (ipVersion === 4) {
    const octets = normalized.split(".").map(Number);
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }
  if (ipVersion === 6) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  return (
    normalized.length > 0 &&
    (!normalized.includes(".") ||
      normalized === "localhost" ||
      normalized.endsWith(".localhost") ||
      normalized.endsWith(".internal") ||
      normalized.endsWith(".local") ||
      normalized.endsWith(".lan"))
  );
}

export function allowsPlaintextInternalRedis(environment = process.env) {
  if (environment.NODE_ENV !== "production") return true;
  if (environment.REDIS_ALLOW_PLAINTEXT_INTERNAL !== "true") return false;

  try {
    const parsed = new URL(environment.REDIS_URL?.trim() ?? "");
    return (
      parsed.protocol === "redis:" && isPrivateRedisHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function validateRedisConfiguration(issues, environment, value) {
  const plaintextFlag = environment.REDIS_ALLOW_PLAINTEXT_INTERNAL?.trim();
  if (plaintextFlag && !["true", "false"].includes(plaintextFlag)) {
    issues.push("REDIS_ALLOW_PLAINTEXT_INTERNAL debe ser true o false");
  }
  if (!value) return;

  validateUrl(issues, "REDIS_URL", value, ["redis:", "rediss:"]);

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return;
  }
  if (!["redis:", "rediss:"].includes(parsed.protocol)) return;
  if (parsed.hash) {
    issues.push("REDIS_URL no debe contener un fragmento");
  }

  for (const [name, configured] of parsed.searchParams.entries()) {
    const normalizedName = name.toLowerCase().replaceAll("_", "");
    const normalizedValue = configured.trim().toLowerCase();
    if (
      ["rejectunauthorized", "tls.rejectunauthorized"].includes(
        normalizedName,
      ) &&
      ["0", "false", "no"].includes(normalizedValue)
    ) {
      issues.push(
        "REDIS_URL intenta desactivar la validacion del certificado TLS",
      );
    }
  }

  if (environment.NODE_ENV !== "production") return;

  if (parsed.protocol === "redis:") {
    if (!allowsPlaintextInternalRedis(environment)) {
      issues.push(
        "REDIS_URL debe usar rediss en produccion; redis sin TLS exige REDIS_ALLOW_PLAINTEXT_INTERNAL=true y un host privado",
      );
    }
  } else if (plaintextFlag === "true") {
    issues.push(
      "REDIS_ALLOW_PLAINTEXT_INTERNAL solo debe activarse cuando REDIS_URL usa redis hacia una red privada",
    );
  }

  let decodedPassword = "";
  try {
    decodedPassword = decodeURIComponent(parsed.password);
  } catch {
    issues.push("REDIS_URL contiene una credencial con codificacion invalida");
  }
  if (!decodedPassword) {
    if (!isEvaluationProfile(environment)) {
      issues.push("REDIS_URL debe incluir autenticacion en produccion");
    }
  } else if (
    Buffer.byteLength(decodedPassword, "utf8") < MINIMUM_REDIS_PASSWORD_BYTES
  ) {
    issues.push(
      `la credencial de REDIS_URL debe contener al menos ${MINIMUM_REDIS_PASSWORD_BYTES} bytes`,
    );
  }
}

function validatePublicRegistrationConfiguration(issues, environment) {
  const configured = environment.PUBLIC_REGISTRATION_ENABLED?.trim();
  if (configured && !["true", "false"].includes(configured)) {
    issues.push("PUBLIC_REGISTRATION_ENABLED debe ser true o false");
  }

  const invitationAcceptance =
    environment.TEAM_INVITATION_ACCEPTANCE_ENABLED?.trim();
  if (
    environment.TEAM_INVITATION_ACCEPTANCE_ENABLED !== undefined &&
    !["true", "false"].includes(invitationAcceptance)
  ) {
    issues.push("TEAM_INVITATION_ACCEPTANCE_ENABLED debe ser true o false");
  }
}

function validateStorageConfiguration(issues, values) {
  validateUrl(issues, "SUPABASE_URL", values.SUPABASE_URL, ["https:"]);

  const serviceKey = values.SUPABASE_SERVICE_ROLE_KEY;
  if (
    serviceKey &&
    Buffer.byteLength(serviceKey, "utf8") < MINIMUM_STORAGE_SERVICE_KEY_BYTES
  ) {
    issues.push(
      `SUPABASE_SERVICE_ROLE_KEY debe contener al menos ${MINIMUM_STORAGE_SERVICE_KEY_BYTES} bytes`,
    );
  }

  const bucket = values.SUPABASE_STORAGE_BUCKET;
  if (
    bucket &&
    (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/i.test(bucket) || bucket.length > 100)
  ) {
    issues.push(
      "SUPABASE_STORAGE_BUCKET debe ser un nombre valido de hasta 100 caracteres",
    );
  }
}

export function runtimeEnvironmentIssues(environment = process.env) {
  const issues = [];
  const values = Object.fromEntries(
    REQUIRED_VARIABLES.map((name) => [name, environment[name]?.trim() ?? ""]),
  );
  const missing = REQUIRED_VARIABLES.filter(
    (name) =>
      !values[name] &&
      !(
        name === "SAAS_ADMIN_USER_IDS" &&
        environment.SAAS_ADMIN_DISABLED === "true"
      ),
  );

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

  for (const name of [
    "JWT_SECRET",
    "CONSENT_IP_SALT",
    "OFFLINE_SYNC_HMAC_SECRET",
  ]) {
    if (values[name] && Buffer.byteLength(values[name], "utf8") < 32) {
      issues.push(`${name} debe contener al menos 32 bytes aleatorios`);
    }
  }

  validateSaasAdminIdentities(issues, environment, values);
  validateMfaEncryption(issues, environment, values);
  validatePublicRegistrationConfiguration(issues, environment);

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
  validateSessionBoundDatabaseConnection(
    issues,
    environment,
    "DATABASE_URL",
    values.DATABASE_URL,
  );
  validateProductionDatabaseTls(issues, environment, "DIRECT_URL", directUrl);

  validateProductionDatabaseFlags(issues, environment);

  validateRedisConfiguration(issues, environment, values.REDIS_URL);
  validateStorageConfiguration(issues, values);
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

export function catalogWorkerEnvironmentIssues(environment = process.env) {
  const issues = [];
  const values = Object.fromEntries(
    CATALOG_WORKER_REQUIRED_VARIABLES.map((name) => [
      name,
      environment[name]?.trim() ?? "",
    ]),
  );
  const missing = CATALOG_WORKER_REQUIRED_VARIABLES.filter(
    (name) => !values[name],
  );
  if (missing.length) issues.push(`faltan: ${missing.join(", ")}`);

  for (const name of CATALOG_WORKER_REQUIRED_VARIABLES) {
    if (values[name] && isPlaceholder(values[name])) {
      issues.push(`${name} contiene un placeholder publico sin resolver`);
    }
  }

  validateUrl(issues, "DATABASE_URL", values.DATABASE_URL, [
    "postgres:",
    "postgresql:",
  ]);
  validateProductionDatabaseTls(
    issues,
    environment,
    "DATABASE_URL",
    values.DATABASE_URL,
  );
  validateSessionBoundDatabaseConnection(
    issues,
    environment,
    "DATABASE_URL",
    values.DATABASE_URL,
  );
  validateProductionDatabaseFlags(issues, environment);
  validateRedisConfiguration(issues, environment, values.REDIS_URL);
  validateStorageConfiguration(issues, values);

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

export function requireCatalogWorkerEnvironment(environment = process.env) {
  prepareRuntimeEnvironment(environment);
  const issues = catalogWorkerEnvironmentIssues(environment);
  if (issues.length > 0) {
    throw new Error(
      `Configuracion del worker de catalogo electoral invalida:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
  }
}
