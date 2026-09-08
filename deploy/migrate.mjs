import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
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
const DEFAULT_MIGRATION_LOCK_TIMEOUT_MS = 10_000;
const DEFAULT_MIGRATION_STATEMENT_TIMEOUT_MS = 900_000;
const DATABASE_IDENTITY_ID = "primary";

function positiveTimeout(value, fallback, key, maximum) {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  if (!/^[1-9][0-9]*$/.test(candidate)) {
    throw new Error(`${key} debe ser un entero positivo en milisegundos`);
  }
  const parsed = Number(candidate);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new Error(`${key} excede el maximo permitido de ${maximum} ms`);
  }
  return parsed;
}

export function resolveMigrationTimeouts(environment = process.env) {
  const lockTimeoutMs = positiveTimeout(
    environment.MIGRATION_LOCK_TIMEOUT_MS,
    DEFAULT_MIGRATION_LOCK_TIMEOUT_MS,
    "MIGRATION_LOCK_TIMEOUT_MS",
    60_000,
  );
  const statementTimeoutMs = positiveTimeout(
    environment.MIGRATION_STATEMENT_TIMEOUT_MS,
    DEFAULT_MIGRATION_STATEMENT_TIMEOUT_MS,
    "MIGRATION_STATEMENT_TIMEOUT_MS",
    3_600_000,
  );
  return {
    lockTimeoutMs,
    statementTimeoutMs,
    pgOptions: `-c lock_timeout=${lockTimeoutMs}ms -c statement_timeout=${statementTimeoutMs}ms`,
  };
}
const REQUIRED_PLAN_CATALOG = Object.freeze([
  {
    code: "FREE",
    maxUsers: 3,
    maxVoters: 100,
    maxStorageMb: 50,
    includesExport: false,
    includesImport: false,
    includesMfa: false,
    includesApi: false,
    monthlyPriceCop: 0,
    yearlyPriceCop: 0,
    isActive: true,
    sortOrder: 1,
  },
  {
    code: "STARTER",
    maxUsers: 10,
    maxVoters: 1_000,
    maxStorageMb: 500,
    includesExport: true,
    includesImport: false,
    includesMfa: false,
    includesApi: false,
    monthlyPriceCop: 99_000,
    yearlyPriceCop: 1_188_000,
    isActive: true,
    sortOrder: 2,
  },
  {
    code: "PROFESSIONAL",
    maxUsers: 50,
    maxVoters: 10_000,
    maxStorageMb: 2_048,
    includesExport: true,
    includesImport: true,
    includesMfa: true,
    includesApi: false,
    monthlyPriceCop: 299_000,
    yearlyPriceCop: 3_588_000,
    isActive: true,
    sortOrder: 3,
  },
  {
    code: "ENTERPRISE",
    maxUsers: 999_999,
    maxVoters: 999_999,
    maxStorageMb: 999_999,
    includesExport: true,
    includesImport: true,
    includesMfa: true,
    includesApi: false,
    monthlyPriceCop: 799_000,
    yearlyPriceCop: 9_588_000,
    isActive: true,
    sortOrder: 4,
  },
]);
const REQUIRED_CHECK_CONSTRAINTS = Object.freeze({
  CampaignSettings_report_deadline_check: [
    '"electiondate" is null',
    '"reportdeadline" is null',
    '"reportdeadline" > "electiondate"',
  ],
  CampaignSettings_official_limits_https_check: [
    '"officiallimitsurl" is null',
    "~* '^https://",
  ],
  CampaignSettings_account_last_four_check: [
    '"uniqueaccountlastfour" is null',
    "'^[0-9]{4}$'",
  ],
  WitnessReport_traceability_all_or_none_check: [
    '"credentialtype" is null',
    '"credentialtype" is not null',
    '"haswrittenclaim" is not null',
  ],
  WitnessReport_vote_breakdown_nonnegative_check: [
    '"blankvotes" >= 0',
    '"blankvotes" <= 99999',
    '"nullvotes" >= 0',
    '"nullvotes" <= 99999',
    '"unmarkedvotes" >= 0',
    '"unmarkedvotes" <= 99999',
  ],
  WitnessReport_vote_breakdown_total_check: [
    '"candidatevotes" + "blankvotes" + "nullvotes" + "unmarkedvotes"',
    '<= "totaltablevotes"',
  ],
  WitnessReport_written_claim_check: [
    '"haswrittenclaim" = true',
    '"reclamationground" is not null',
    '"reclamationdescription"',
    "other_statutory_ground",
  ],
  User_authVersion_non_negative_check: ['"authversion" >= 0'],
  User_lastTotpTimeStep_non_negative_check: [
    '"lasttotptimestep" is null',
    '"lasttotptimestep" >= 0',
  ],
  SystemDatabaseIdentity_singleton_check: ["id::text", "'primary'"],
  WitnessReport_vote_totals_check: [
    "mesa > 0",
    '"candidatevotes" >= 0',
    '"candidatevotes" <= "totaltablevotes"',
  ],
  WitnessReport_four_eyes_check: [
    '"reviewerid" is null',
    '"reviewerid" <> "witnessid"',
  ],
  WitnessReport_review_state_check: [
    "'pending'",
    "'accepted'",
    "'rejected'",
    "'superseded'",
    '"reviewreason"',
  ],
  PoliticalDivision_expected_tables_check: [
    '"expectedtables" is null',
    "'puesto'",
    '"expectedtables" >= 1',
    '"expectedtables" <= 99999',
  ],
});
const REQUIRED_CONSTRAINT_TABLES = Object.freeze({
  CampaignSettings_report_deadline_check: "CampaignSettings",
  CampaignSettings_official_limits_https_check: "CampaignSettings",
  CampaignSettings_account_last_four_check: "CampaignSettings",
  WitnessReport_traceability_all_or_none_check: "WitnessReport",
  WitnessReport_vote_breakdown_nonnegative_check: "WitnessReport",
  WitnessReport_vote_breakdown_total_check: "WitnessReport",
  WitnessReport_written_claim_check: "WitnessReport",
  User_authVersion_non_negative_check: "User",
  User_lastTotpTimeStep_non_negative_check: "User",
  SystemDatabaseIdentity_singleton_check: "SystemDatabaseIdentity",
  WitnessReport_vote_totals_check: "WitnessReport",
  WitnessReport_four_eyes_check: "WitnessReport",
  WitnessReport_review_state_check: "WitnessReport",
  PoliticalDivision_expected_tables_check: "PoliticalDivision",
});
const REQUIRED_TRIGGER_DEFINITIONS = Object.freeze({
  AuditEvent_prevent_update_delete: [
    "before delete or update",
    "prevent_audit_event_mutation",
  ],
  AuditEvent_prevent_truncate: [
    "before truncate",
    "prevent_audit_event_mutation",
  ],
  PoliticalProposal_enforce_status_transition: [
    "before insert or update",
    "enforce_political_proposal_status_transition",
  ],
});
const REQUIRED_TRIGGER_TABLES = Object.freeze({
  AuditEvent_prevent_update_delete: "AuditEvent",
  AuditEvent_prevent_truncate: "AuditEvent",
  PoliticalProposal_enforce_status_transition: "PoliticalProposal",
});
const REQUIRED_FUNCTION_DEFINITIONS = Object.freeze({
  prevent_audit_event_mutation: [
    "returns trigger",
    "raise exception",
    "errcode = '55000'",
    "auditevent es append-only",
    "tg_op",
  ],
  enforce_political_proposal_status_transition: [
    "returns trigger",
    "raise exception",
    "errcode = '23514'",
    "transicion de estado de propuesta no permitida",
    "toda propuesta debe iniciar como borrador con progreso 0",
    "el contenido comprometido de una propuesta publicada es inmutable",
    "una propuesta completada o retirada conserva responsable y progreso finales",
    "una propuesta completada requiere progreso 100",
    "una propuesta en borrador o propuesta requiere progreso 0",
    'old."status"',
    'new."status"',
  ],
});
const INVARIANT_INTRODUCING_MIGRATIONS = Object.freeze({
  PoliticalProposal_enforce_status_transition:
    "20260907200000_proposal_status_lifecycle",
  enforce_political_proposal_status_transition:
    "20260907200000_proposal_status_lifecycle",
});
const REQUIRED_INDEX_DEFINITIONS = Object.freeze({
  WitnessReport_one_accepted_per_table_key: [
    "create unique index",
    '"tenantid", "puestoid", mesa',
    "where (status = 'accepted'",
  ],
});

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
  return row.finished_at !== null && row.rolled_back_at === null;
}

export function findMigrationChecksumMismatches({ rows, localMigrations }) {
  if (!rows?.length || !localMigrations?.length) return [];

  const expectedChecksums = new Map(
    localMigrations.map(({ name, checksum }) => [name, checksum.toLowerCase()]),
  );

  return rows.filter(migrationCompleted).flatMap((row) => {
    const expectedChecksum = expectedChecksums.get(row.migration_name);
    if (!expectedChecksum) return [];

    const observedChecksum =
      typeof row.checksum === "string" ? row.checksum.toLowerCase() : null;
    if (observedChecksum === expectedChecksum) return [];

    return [
      {
        migrationName: row.migration_name,
        expectedChecksum,
        observedChecksum,
      },
    ];
  });
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

export function resolvedBaselinePreflight({ rows, databaseIdentity }) {
  const completedRows = (rows ?? []).filter(migrationCompleted);
  const baseline = completedRows.find(
    (row) => row.migration_name === BASELINE_MIGRATION,
  );
  if (!baseline || Number(baseline.applied_steps_count) !== 0) {
    return "NOT_RESOLVED";
  }
  if (databaseIdentity) return "ESTABLISHED_IDENTITY";

  const completedNames = new Set(
    completedRows.map((row) => row.migration_name),
  );
  if (HISTORICAL_MIGRATIONS.every((name) => completedNames.has(name))) {
    return "HISTORICAL_PROVENANCE";
  }
  return completedRows.length === 1
    ? "VERIFY_BASELINE_SCHEMA"
    : "UNSUPPORTED_RESOLVED_BASELINE";
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
    `SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
     FROM ${qualifiedHistory}
     ORDER BY started_at ASC`,
  );

  return {
    rows: history.rows,
    applicationObjectCount: Number(objects.rows[0]?.count ?? 0),
  };
}

function databaseInspectionSignature(inspection) {
  const rows = (inspection.rows ?? [])
    .map((row) => ({
      migrationName: row.migration_name,
      checksum: row.checksum ?? null,
      finished: row.finished_at !== null,
      rolledBack: row.rolled_back_at !== null,
      appliedSteps: Number(row.applied_steps_count ?? 0),
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );

  return JSON.stringify({
    historyTablePresent: inspection.rows !== null,
    applicationObjectCount: inspection.applicationObjectCount,
    rows,
  });
}

export function databaseInspectionsMatch(directInspection, runtimeInspection) {
  return (
    databaseInspectionSignature(directInspection) ===
    databaseInspectionSignature(runtimeInspection)
  );
}

export async function proveSameDatabase(
  directClient,
  runtimeClient,
  lockKeys = [randomBytes(4).readInt32BE(), randomBytes(4).readInt32BE()],
) {
  let directTransaction = false;
  let runtimeTransaction = false;
  try {
    await directClient.query("BEGIN");
    directTransaction = true;
    await directClient.query(
      "SELECT pg_advisory_xact_lock($1::integer, $2::integer)",
      lockKeys,
    );

    await runtimeClient.query("BEGIN");
    runtimeTransaction = true;
    const probe = await runtimeClient.query(
      "SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS acquired",
      lockKeys,
    );
    if (probe.rows[0]?.acquired === true) {
      throw new Error(
        "DIRECT_URL y DATABASE_URL llegan a bases fisicas diferentes; se detuvo el despliegue antes de migrar",
      );
    }
    if (probe.rows[0]?.acquired !== false) {
      throw new Error(
        "no fue posible demostrar que DIRECT_URL y DATABASE_URL llegan a la misma base",
      );
    }
  } finally {
    if (runtimeTransaction) {
      await runtimeClient.query("ROLLBACK").catch(() => undefined);
    }
    if (directTransaction) {
      await directClient.query("ROLLBACK").catch(() => undefined);
    }
  }
}

async function inspectDatabaseIdentity(client, schema) {
  const qualifiedIdentity = `${quotedIdentifier(schema)}."SystemDatabaseIdentity"`;
  const lookup = await client.query("SELECT to_regclass($1) AS name", [
    qualifiedIdentity,
  ]);
  if (lookup.rows[0]?.name === null) return null;

  const identity = await client.query(
    `SELECT fingerprint FROM ${qualifiedIdentity} WHERE id = $1`,
    [DATABASE_IDENTITY_ID],
  );
  const fingerprint = identity.rows[0]?.fingerprint;
  if (
    identity.rows.length !== 1 ||
    typeof fingerprint !== "string" ||
    !/^[a-f0-9]{32}$/.test(fingerprint)
  ) {
    throw new Error(
      "la identidad de la base de datos falta, esta duplicada o es invalida",
    );
  }
  return fingerprint;
}

function normalizedPlan(row) {
  return {
    code: row.code,
    maxUsers: Number(row.maxUsers),
    maxVoters: Number(row.maxVoters),
    maxStorageMb: Number(row.maxStorageMb),
    includesExport: row.includesExport,
    includesImport: row.includesImport,
    includesMfa: row.includesMfa,
    includesApi: row.includesApi,
    monthlyPriceCop: Number(row.monthlyPriceCop),
    yearlyPriceCop: Number(row.yearlyPriceCop),
    isActive: row.isActive,
    sortOrder: Number(row.sortOrder),
  };
}

export function planCatalogMatches(rows, { requireAll = true } = {}) {
  if (!Array.isArray(rows)) return false;
  const expectedByCode = new Map(
    REQUIRED_PLAN_CATALOG.map((plan) => [plan.code, plan]),
  );
  if (requireAll && rows.length !== REQUIRED_PLAN_CATALOG.length) return false;
  if (rows.length > REQUIRED_PLAN_CATALOG.length) return false;

  const observedCodes = new Set();
  for (const row of rows) {
    const observed = normalizedPlan(row);
    const expected = expectedByCode.get(observed.code);
    if (
      !expected ||
      observedCodes.has(observed.code) ||
      JSON.stringify(observed) !== JSON.stringify(expected)
    ) {
      return false;
    }
    observedCodes.add(observed.code);
  }
  return !requireAll || observedCodes.size === REQUIRED_PLAN_CATALOG.length;
}

async function inspectPlanCatalog(client, schema) {
  const qualifiedPlans = `${quotedIdentifier(schema)}."SubscriptionPlan"`;
  const lookup = await client.query("SELECT to_regclass($1) AS name", [
    qualifiedPlans,
  ]);
  if (lookup.rows[0]?.name === null) return null;

  const plans = await client.query(
    `SELECT
       code::text AS code,
       "maxUsers",
       "maxVoters",
       "maxStorageMb",
       "includesExport",
       "includesImport",
       "includesMfa",
       "includesApi",
       "monthlyPriceCop"::text AS "monthlyPriceCop",
       "yearlyPriceCop"::text AS "yearlyPriceCop",
       "isActive",
       "sortOrder"
     FROM ${qualifiedPlans}
     ORDER BY code::text ASC`,
  );
  return plans.rows;
}

function normalizedSqlDefinition(value) {
  return typeof value === "string"
    ? value.toLowerCase().replaceAll(/\s+/g, " ").trim()
    : "";
}

export function databaseInvariantIssues(snapshot, { ignoredNames = [] } = {}) {
  const issues = [];
  const constraints = new Map(
    (snapshot.constraints ?? []).map((row) => [row.name, row]),
  );
  for (const [name, fragments] of Object.entries(REQUIRED_CHECK_CONSTRAINTS)) {
    const row = constraints.get(name);
    const definition = normalizedSqlDefinition(row?.definition);
    if (
      !row ||
      row.tableName !== REQUIRED_CONSTRAINT_TABLES[name] ||
      row.type !== "c" ||
      row.validated !== true ||
      fragments.some(
        (fragment) => !definition.includes(normalizedSqlDefinition(fragment)),
      )
    ) {
      issues.push(name);
    }
  }

  const triggers = new Map(
    (snapshot.triggers ?? []).map((row) => [row.name, row]),
  );
  for (const [name, fragments] of Object.entries(
    REQUIRED_TRIGGER_DEFINITIONS,
  )) {
    const row = triggers.get(name);
    const definition = normalizedSqlDefinition(row?.definition);
    if (
      !row ||
      row.tableName !== REQUIRED_TRIGGER_TABLES[name] ||
      row.enabled !== "A" ||
      fragments.some(
        (fragment) => !definition.includes(normalizedSqlDefinition(fragment)),
      )
    ) {
      issues.push(name);
    }
  }

  const functions = new Map(
    (snapshot.functions ?? []).map((row) => [row.name, row]),
  );
  for (const [name, fragments] of Object.entries(
    REQUIRED_FUNCTION_DEFINITIONS,
  )) {
    const row = functions.get(name);
    const definition = normalizedSqlDefinition(row?.definition);
    if (
      !row ||
      fragments.some(
        (fragment) => !definition.includes(normalizedSqlDefinition(fragment)),
      )
    ) {
      issues.push(name);
    }
  }

  const indexes = new Map(
    (snapshot.indexes ?? []).map((row) => [row.name, row]),
  );
  for (const [name, fragments] of Object.entries(REQUIRED_INDEX_DEFINITIONS)) {
    const row = indexes.get(name);
    const definition = normalizedSqlDefinition(row?.definition);
    if (
      !row ||
      row.tableName !== "WitnessReport" ||
      fragments.some(
        (fragment) => !definition.includes(normalizedSqlDefinition(fragment)),
      )
    ) {
      issues.push(name);
    }
  }
  const ignored = new Set(ignoredNames);
  return issues.filter((name) => !ignored.has(name));
}

function invariantsNotIntroducedYet(rows) {
  const completedNames = new Set(
    (rows ?? []).filter(migrationCompleted).map((row) => row.migration_name),
  );

  return Object.entries(INVARIANT_INTRODUCING_MIGRATIONS)
    .filter(([, migrationName]) => !completedNames.has(migrationName))
    .map(([invariantName]) => invariantName);
}

async function inspectDatabaseInvariants(client, schema) {
  const constraintNames = Object.keys(REQUIRED_CHECK_CONSTRAINTS);
  const triggerNames = Object.keys(REQUIRED_TRIGGER_DEFINITIONS);
  const functionNames = Object.keys(REQUIRED_FUNCTION_DEFINITIONS);
  const indexNames = Object.keys(REQUIRED_INDEX_DEFINITIONS);
  const [constraints, triggers, functions, indexes] = await Promise.all([
    client.query(
      `SELECT
         constraint_row.conname AS name,
         relation.relname AS "tableName",
         constraint_row.contype AS type,
         constraint_row.convalidated AS validated,
         pg_get_constraintdef(constraint_row.oid, true) AS definition
       FROM pg_constraint AS constraint_row
       JOIN pg_namespace AS namespace
         ON namespace.oid = constraint_row.connamespace
       JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
       WHERE namespace.nspname = $1
         AND constraint_row.conname = ANY($2::text[])`,
      [schema, constraintNames],
    ),
    client.query(
      `SELECT
         trigger_row.tgname AS name,
         relation.relname AS "tableName",
         trigger_row.tgenabled AS enabled,
         pg_get_triggerdef(trigger_row.oid, true) AS definition
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = $1
         AND NOT trigger_row.tgisinternal
         AND trigger_row.tgname = ANY($2::text[])`,
      [schema, triggerNames],
    ),
    client.query(
      `SELECT
         procedure.proname AS name,
         pg_get_functiondef(procedure.oid) AS definition
       FROM pg_proc AS procedure
       JOIN pg_namespace AS namespace
         ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = $1
         AND procedure.proname = ANY($2::text[])`,
      [schema, functionNames],
    ),
    client.query(
      `SELECT
         indexname AS name,
         tablename AS "tableName",
         indexdef AS definition
       FROM pg_indexes
       WHERE schemaname = $1
         AND indexname = ANY($2::text[])`,
      [schema, indexNames],
    ),
  ]);
  return {
    constraints: constraints.rows,
    triggers: triggers.rows,
    functions: functions.rows,
    indexes: indexes.rows,
  };
}

async function localMigrations() {
  const migrationsDirectory = join(
    APPLICATION_DIRECTORY,
    "prisma",
    "migrations",
  );
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const migrationDirectories = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  return Promise.all(
    migrationDirectories.map(async (entry) => {
      const contents = await readFile(
        join(migrationsDirectory, entry.name, "migration.sql"),
      );
      return {
        name: entry.name,
        checksum: createHash("sha256").update(contents).digest("hex"),
      };
    }),
  );
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
      "`pnpm --filter api exec prisma migrate diff --from-config-datasource --to-schema prisma/baseline.schema.prisma --exit-code` " +
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
  const normalizedRuntime = normalizeDirectUrl(
    parsePostgresUrl(environment.DATABASE_URL.trim(), "DATABASE_URL"),
    schema,
  );
  const runtimeUrl = normalizedRuntime.toString();
  const migrationTimeouts = resolveMigrationTimeouts(environment);
  const prismaEnvironment = {
    ...environment,
    DIRECT_URL: directUrl,
    PGOPTIONS: migrationTimeouts.pgOptions,
  };
  const requireFromApi = createRequire(
    join(APPLICATION_DIRECTORY, "package.json"),
  );
  const { Client } = requireFromApi("pg");
  const client = new Client({
    connectionString: directUrl,
    connectionTimeoutMillis: 15_000,
    ssl: sslOptions(environment, normalizedDirect),
  });
  const runtimeClient = new Client({
    connectionString: runtimeUrl,
    connectionTimeoutMillis: 15_000,
    ssl: sslOptions(environment, normalizedRuntime),
  });

  console.log(
    `Verificando migraciones con ${source} directa (schema: ${schema})...`,
  );

  let lockAcquired = false;
  try {
    await client.connect();
    await client.query(
      "SELECT set_config('lock_timeout', $1, false), set_config('statement_timeout', $2, false)",
      [
        `${migrationTimeouts.lockTimeoutMs}ms`,
        `${migrationTimeouts.statementTimeoutMs}ms`,
      ],
    );
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
    await runtimeClient.connect();
    await runtimeClient.query(
      "SELECT set_config('lock_timeout', $1, false), set_config('statement_timeout', $2, false)",
      [
        `${migrationTimeouts.lockTimeoutMs}ms`,
        `${migrationTimeouts.statementTimeoutMs}ms`,
      ],
    );
    await proveSameDatabase(client, runtimeClient);

    const migrationFiles = await localMigrations();
    const localMigrationNames = migrationFiles.map(({ name }) => name);
    if (!localMigrationNames.includes(BASELINE_MIGRATION)) {
      throw new Error(`falta la migracion requerida ${BASELINE_MIGRATION}`);
    }

    const inspection = await inspectDatabase(client, schema);
    const runtimeInspection = await inspectDatabase(runtimeClient, schema);
    if (!databaseInspectionsMatch(inspection, runtimeInspection)) {
      throw new Error(
        "DIRECT_URL y DATABASE_URL no observan el mismo esquema e historial; se detuvo el despliegue antes de migrar",
      );
    }
    const [directIdentity, runtimeIdentity] = await Promise.all([
      inspectDatabaseIdentity(client, schema),
      inspectDatabaseIdentity(runtimeClient, schema),
    ]);
    if (directIdentity !== runtimeIdentity) {
      throw new Error(
        "DIRECT_URL y DATABASE_URL apuntan a identidades de base de datos diferentes",
      );
    }
    if (directIdentity !== null) {
      const existingInvariantIssues = databaseInvariantIssues(
        await inspectDatabaseInvariants(client, schema),
        { ignoredNames: invariantsNotIntroducedYet(inspection.rows) },
      );
      if (existingInvariantIssues.length > 0) {
        throw new Error(
          `faltan invariantes PostgreSQL críticas: ${existingInvariantIssues.join(", ")}`,
        );
      }
    }
    const existingPlans = await inspectPlanCatalog(client, schema);
    if (
      existingPlans !== null &&
      !planCatalogMatches(existingPlans, { requireAll: false })
    ) {
      throw new Error(
        "el catalogo de planes existente difiere del contrato del candidato; inventaria y aprueba los terminos antes de migrar",
      );
    }
    const state = classifyDatabaseState({
      ...inspection,
      localMigrationNames,
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

    const checksumMismatches = findMigrationChecksumMismatches({
      rows: inspection.rows,
      localMigrations: migrationFiles,
    });
    if (checksumMismatches.length > 0) {
      const names = checksumMismatches
        .map(({ migrationName }) => migrationName)
        .join(", ");
      throw new Error(
        `las migraciones ya aplicadas no coinciden byte a byte con el repositorio: ${names}. ` +
          "Deten el despliegue, conserva el respaldo y reconcilia cada historial sobre una copia restaurada; no edites _prisma_migrations automaticamente",
      );
    }

    const baselinePreflight = resolvedBaselinePreflight({
      rows: inspection.rows,
      databaseIdentity: directIdentity,
    });
    if (baselinePreflight === "UNSUPPORTED_RESOLVED_BASELINE") {
      throw new Error(
        "la baseline fue marcada como aplicada sin pasos, pero no tiene identidad ni la procedencia historica permitida; se requiere revision manual",
      );
    }
    if (baselinePreflight === "VERIFY_BASELINE_SCHEMA") {
      const baselineDiffExitCode = await runPrisma(
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
      if (baselineDiffExitCode === 2) {
        throw new Error(
          "la baseline resuelta manualmente no coincide con la fotografia esperada; no se aplicaron deltas",
        );
      }
    }

    if (state === "HISTORICAL_FIVE") {
      if (localMigrationNames[0] !== BASELINE_MIGRATION) {
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
    const driftExitCode = await runPrisma(
      [
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        join(APPLICATION_DIRECTORY, "prisma", "schema.prisma"),
        "--exit-code",
      ],
      prismaEnvironment,
      [0, 2],
    );
    if (driftExitCode === 2) {
      throw new Error(
        "el esquema desplegado tiene deriva respecto de schema.prisma; la API no puede iniciar",
      );
    }

    const finalInspection = await inspectDatabase(client, schema);
    const finalRuntimeInspection = await inspectDatabase(runtimeClient, schema);
    if (!databaseInspectionsMatch(finalInspection, finalRuntimeInspection)) {
      throw new Error(
        "DATABASE_URL no observa el historial final aplicado por DIRECT_URL; la API no puede iniciar",
      );
    }
    const finalMismatches = findMigrationChecksumMismatches({
      rows: finalInspection.rows,
      localMigrations: migrationFiles,
    });
    if (finalMismatches.length > 0) {
      throw new Error(
        "la verificacion posterior detecto checksums de migracion incompatibles; la API no puede iniciar",
      );
    }
    const [finalDirectIdentity, finalRuntimeIdentity] = await Promise.all([
      inspectDatabaseIdentity(client, schema),
      inspectDatabaseIdentity(runtimeClient, schema),
    ]);
    if (
      finalDirectIdentity === null ||
      finalDirectIdentity !== finalRuntimeIdentity
    ) {
      throw new Error(
        "la conexion de ejecucion no coincide con la identidad migrada; la API no puede iniciar",
      );
    }
    const finalPlans = await inspectPlanCatalog(client, schema);
    if (!planCatalogMatches(finalPlans)) {
      throw new Error(
        "el catalogo obligatorio de cuatro planes falta o es incoherente; la API no puede iniciar",
      );
    }
    const finalInvariantIssues = databaseInvariantIssues(
      await inspectDatabaseInvariants(client, schema),
    );
    if (finalInvariantIssues.length > 0) {
      throw new Error(
        `la base no conserva todas las restricciones y protecciones críticas: ${finalInvariantIssues.join(", ")}`,
      );
    }
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
    await runtimeClient.end().catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
