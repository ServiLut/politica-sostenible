import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { requireMigrationEnvironment } from "./runtime-environment.mjs";

export const BASELINE_MIGRATION = "20260827000000_baseline";
export const HISTORICAL_MIGRATIONS = Object.freeze([
  "20260821123000_issue_case_mode_reference",
  "20260821140000_consent_revocation_reason",
  "20260821160000_team_invitations",
  "20260821170000_campaign_events",
  "20260821180000_user_account_lifecycle",
]);

const DEPLOY_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const APPLICATION_DIRECTORY = join(DEPLOY_DIRECTORY, "..", "apps", "api");
const BASELINE_SCHEMA = join(
  APPLICATION_DIRECTORY,
  "prisma",
  "baseline.schema.prisma",
);
const PRISMA_CLI = join(
  APPLICATION_DIRECTORY,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);
const POSTGRES_IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_-]{0,62}$/u;

function parsePostgresUrl(value, variableName) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} no es una URL valida`);
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`${variableName} no es una URL PostgreSQL`);
  }
  const usesTemplateDatabaseAuthority =
    parsed.username.toLowerCase() === "user" &&
    parsed.password.toLowerCase() === "password" &&
    parsed.hostname.toLowerCase() === "host";
  if (value.includes("replace-me") || usesTemplateDatabaseAuthority) {
    throw new Error(`${variableName} contiene un placeholder sin resolver`);
  }

  return parsed;
}

function isPooledUrl(parsed) {
  const poolMode = parsed.searchParams.get("pool_mode")?.toLowerCase();
  return (
    parsed.searchParams.get("pgbouncer")?.toLowerCase() === "true" ||
    poolMode === "transaction" ||
    parsed.port === "6543"
  );
}

export function resolveDirectUrl(environment = process.env) {
  const explicitCandidates = [
    ["DIRECT_URL", environment.DIRECT_URL?.trim()],
    ["POSTGRES_URL_NON_POOLING", environment.POSTGRES_URL_NON_POOLING?.trim()],
  ];

  for (const [name, value] of explicitCandidates) {
    if (!value) continue;
    const parsed = parsePostgresUrl(value, name);
    if (isPooledUrl(parsed)) {
      throw new Error(
        `${name} apunta a un pooler. Configura DIRECT_URL con la conexion directa (normalmente puerto 5432)`,
      );
    }
    return { directUrl: value, source: name, parsed };
  }

  const runtimeUrl = environment.DATABASE_URL?.trim();
  if (runtimeUrl) {
    const parsed = parsePostgresUrl(runtimeUrl, "DATABASE_URL");
    if (!isPooledUrl(parsed)) {
      return { directUrl: runtimeUrl, source: "DATABASE_URL", parsed };
    }
  }

  throw new Error(
    "DIRECT_URL es obligatoria para migraciones y debe apuntar directamente a PostgreSQL, no al pooler",
  );
}

export function resolveTargetSchema(parsedUrl, configuredSchema) {
  const schema =
    configuredSchema?.trim() ||
    parsedUrl.searchParams.get("schema")?.trim() ||
    "public";

  if (!POSTGRES_IDENTIFIER.test(schema)) {
    throw new Error(
      "El schema de DIRECT_URL no es un identificador PostgreSQL valido",
    );
  }

  return schema;
}

export function normalizeDirectUrl(parsedUrl, schema) {
  const normalized = new URL(parsedUrl.toString());
  normalized.searchParams.set("schema", schema);
  return normalized;
}

function databaseName(parsedUrl) {
  return decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
}

export function assertSameDatabaseTarget(
  directParsed,
  runtimeUrl,
  configuredSchema,
) {
  if (!runtimeUrl?.trim()) return;
  const runtimeParsed = parsePostgresUrl(runtimeUrl.trim(), "DATABASE_URL");
  const directSchema = resolveTargetSchema(directParsed, configuredSchema);
  const runtimeSchema = resolveTargetSchema(runtimeParsed, configuredSchema);

  if (databaseName(directParsed) !== databaseName(runtimeParsed)) {
    throw new Error(
      "DIRECT_URL y DATABASE_URL apuntan a bases de datos diferentes",
    );
  }
  if (directSchema !== runtimeSchema) {
    throw new Error("DIRECT_URL y DATABASE_URL apuntan a schemas diferentes");
  }
}

function migrationCompleted(row) {
  return (
    row.finished_at !== null &&
    row.rolled_back_at === null
  );
}

export function classifyDatabaseState({
  rows,
  applicationObjectCount,
  localMigrationNames = [BASELINE_MIGRATION],
}) {
  if (rows === null || rows.length === 0) {
    return applicationObjectCount === 0 ? "EMPTY" : "EXISTING_WITHOUT_HISTORY";
  }

  if (
    rows.some((row) => row.finished_at === null && row.rolled_back_at === null)
  ) {
    return "FAILED_MIGRATION";
  }

  const completedNames = rows
    .filter(migrationCompleted)
    .map((row) => row.migration_name);
  const allowedCompletedNames = new Set([
    ...HISTORICAL_MIGRATIONS,
    ...localMigrationNames,
  ]);
  const migrationNamesAreKnown = rows.every((row) =>
    allowedCompletedNames.has(row.migration_name),
  );
  const completedNamesAreKnown = completedNames.every((name) =>
    allowedCompletedNames.has(name),
  );
  const completedNamesAreUnique =
    new Set(completedNames).size === completedNames.length;

  if (
    !migrationNamesAreKnown ||
    !completedNamesAreKnown ||
    !completedNamesAreUnique
  ) {
    return "UNSUPPORTED_HISTORY";
  }

  if (completedNames.includes(BASELINE_MIGRATION)) return "TRACKED";

  const historical = new Set(HISTORICAL_MIGRATIONS);
  const exactHistoricalState =
    rows.length === HISTORICAL_MIGRATIONS.length &&
    completedNames.length === HISTORICAL_MIGRATIONS.length &&
    new Set(completedNames).size === HISTORICAL_MIGRATIONS.length &&
    completedNames.every((name) => historical.has(name));

  return exactHistoricalState ? "HISTORICAL_FIVE" : "UNSUPPORTED_HISTORY";
}

function sslOptions(environment, parsedUrl) {
  const sslMode = parsedUrl.searchParams.get("sslmode")?.toLowerCase();
  if (sslMode === "disable") return false;
  if (sslMode || environment.DATABASE_SSL === "true") {
    return {
      rejectUnauthorized:
        environment.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    };
  }
  return false;
}

function quotedIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function inspectDatabase(client, schema) {
  const qualifiedHistory = `${quotedIdentifier(schema)}."_prisma_migrations"`;
  const historyLookup = await client.query("SELECT to_regclass($1) AS name", [
    qualifiedHistory,
  ]);
  const historyExists = historyLookup.rows[0]?.name !== null;

  const objects = await client.query(
    `SELECT
       (
         SELECT count(*)::integer
         FROM pg_class AS relation
         JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = $1
           AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
           AND relation.relname <> '_prisma_migrations'
           AND NOT EXISTS (
             SELECT 1
             FROM pg_depend AS dependency
             WHERE dependency.classid = 'pg_class'::regclass
               AND dependency.objid = relation.oid
               AND dependency.deptype = 'e'
           )
       ) + (
         SELECT count(*)::integer
         FROM pg_type AS type
         JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
         WHERE namespace.nspname = $1
           AND type.typtype = 'e'
           AND NOT EXISTS (
             SELECT 1
             FROM pg_depend AS dependency
             WHERE dependency.classid = 'pg_type'::regclass
               AND dependency.objid = type.oid
               AND dependency.deptype = 'e'
           )
       ) AS count`,
    [schema],
  );

  if (!historyExists) {
    return {
      rows: null,
      applicationObjectCount: Number(objects.rows[0]?.count ?? 0),
    };
  }

  const history = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
     FROM ${qualifiedHistory}
     ORDER BY started_at ASC`,
  );

  return {
    rows: history.rows,
    applicationObjectCount: Number(objects.rows[0]?.count ?? 0),
  };
}

async function localMigrationNames() {
  const migrationsDirectory = join(
    APPLICATION_DIRECTORY,
    "prisma",
    "migrations",
  );
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function runPrisma(args, environment, allowedExitCodes = [0]) {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PRISMA_CLI, ...args], {
      cwd: APPLICATION_DIRECTORY,
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Prisma termino por la senal ${signal}`));
      else resolve(code ?? 1);
    });
  });

  if (!allowedExitCodes.includes(exitCode)) {
    throw new Error(`Prisma termino con codigo ${exitCode}`);
  }
  return exitCode;
}

function actionableAdoptionError(reason) {
  return new Error(
    `${reason}. Deten el despliegue. Sobre una copia restaurada ejecuta ` +
      "`pnpm --filter api exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` " +
      `y sigue "Base existente sin historial de Prisma" en DEPLOYMENT.md; no uses prisma db push`,
  );
}

export async function runSafeMigrations(environment = process.env) {
  requireMigrationEnvironment(environment);
  const { source, parsed } = resolveDirectUrl(environment);
  const schema = resolveTargetSchema(parsed, environment.DATABASE_SCHEMA);
  const normalizedDirect = normalizeDirectUrl(parsed, schema);
  const directUrl = normalizedDirect.toString();
  assertSameDatabaseTarget(
    normalizedDirect,
    environment.DATABASE_URL,
    environment.DATABASE_SCHEMA,
  );
  const prismaEnvironment = { ...environment, DIRECT_URL: directUrl };
  const requireFromApi = createRequire(
    join(APPLICATION_DIRECTORY, "package.json"),
  );
  const { Client } = requireFromApi("pg");
  const client = new Client({
    connectionString: directUrl,
    connectionTimeoutMillis: 15_000,
    ssl: sslOptions(environment, normalizedDirect),
  });

  console.log(
    `Verificando migraciones con ${source} directa (schema: ${schema})...`,
  );

  let lockAcquired = false;
  try {
    await client.connect();
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(hashtext('politica-sostenible'), hashtext($1)) AS acquired",
      [schema],
    );
    lockAcquired = lock.rows[0]?.acquired === true;
    if (!lockAcquired) {
      throw new Error(
        "otro contenedor ya esta verificando migraciones; reintenta el despliegue cuando termine",
      );
    }

    const localMigrations = await localMigrationNames();
    if (!localMigrations.includes(BASELINE_MIGRATION)) {
      throw new Error(`falta la migracion requerida ${BASELINE_MIGRATION}`);
    }

    const inspection = await inspectDatabase(client, schema);
    const state = classifyDatabaseState({
      ...inspection,
      localMigrationNames: localMigrations,
    });

    if (state === "EXISTING_WITHOUT_HISTORY") {
      throw actionableAdoptionError(
        "El schema contiene objetos pero no tiene un historial de Prisma",
      );
    }
    if (state === "FAILED_MIGRATION") {
      throw new Error(
        "hay una migracion fallida o incompleta; revisa prisma migrate status y resuelvela antes de desplegar",
      );
    }
    if (state === "UNSUPPORTED_HISTORY") {
      throw new Error(
        "el historial no contiene la baseline ni coincide exactamente con las cinco migraciones historicas permitidas; se requiere revision manual",
      );
    }

    if (state === "HISTORICAL_FIVE") {
      if (localMigrations[0] !== BASELINE_MIGRATION) {
        throw new Error(
          "la baseline debe ser la primera migracion local antes de adoptar el historial antiguo",
        );
      }

      console.log(
        "Detectadas exactamente las cinco migraciones historicas; comprobando deriva contra la fotografia inmutable de la baseline...",
      );
      const diffExitCode = await runPrisma(
        [
          "migrate",
          "diff",
          "--from-config-datasource",
          "--to-schema",
          BASELINE_SCHEMA,
          "--exit-code",
        ],
        prismaEnvironment,
        [0, 2],
      );
      if (diffExitCode === 2) {
        throw new Error(
          "el schema historico tiene deriva; no se adopto la baseline. Crea y revisa una migracion de reconciliacion",
        );
      }
      await runPrisma(
        ["migrate", "resolve", "--applied", BASELINE_MIGRATION],
        prismaEnvironment,
      );
      console.log("Baseline adoptada despues de verificar deriva cero.");
    }

    if (state === "EMPTY") {
      console.log(
        "Schema vacio verificado; aplicando migraciones versionadas...",
      );
    } else {
      console.log("Historial de migraciones valido; aplicando pendientes...");
    }

    await runPrisma(["migrate", "deploy"], prismaEnvironment);
    await runPrisma(["migrate", "status"], prismaEnvironment);
    console.log("Migraciones verificadas. La API puede iniciar.");
  } finally {
    if (lockAcquired) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtext('politica-sostenible'), hashtext($1))",
          [schema],
        );
      } catch {
        // Closing the session below also releases its advisory lock.
      }
    }
    await client.end().catch(() => undefined);
  }
}
