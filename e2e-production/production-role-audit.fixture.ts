import { createHmac } from "node:crypto";
import {
  ALL_BACKEND_ROLES,
  ROLE_LABEL_BY_BACKEND_ROLE,
  type BackendRole,
} from "../e2e/role-matrix.fixture";

const ENV_PREFIX = "POLITICA_PRODUCTION_ROLE_AUDIT";

const REQUIRED_PATHS_BY_ROLE = {
  ADMIN: ["/dashboard/tasks", "/dashboard/team", "/dashboard/billing"],
  CAMPAIGN_MANAGER: ["/dashboard/executive", "/dashboard/tasks"],
  FINANCE_MANAGER: ["/dashboard/finance", "/dashboard/tasks"],
  COMMUNICATIONS_MANAGER: [
    "/dashboard/communications",
    "/dashboard/tasks",
  ],
  CONSTITUENT_SERVICES_MANAGER: [
    "/dashboard/public-office",
    "/dashboard/cases",
    "/dashboard/pqrsd",
    "/dashboard/tasks",
  ],
  CASE_WORKER: [
    "/dashboard/public-office",
    "/dashboard/cases",
    "/dashboard/pqrsd",
    "/dashboard/tasks",
  ],
  COMPLIANCE_OFFICER: [
    "/dashboard/communications",
    "/dashboard/audit",
    "/dashboard/tasks",
  ],
  AUDITOR: [
    "/dashboard/communications",
    "/dashboard/audit",
    "/dashboard/tasks",
  ],
  ZONE_COORDINATOR: [
    "/dashboard/captura-territorial",
    "/dashboard/territory",
    "/dashboard/tasks",
  ],
  WITNESS: ["/dashboard/witness-planning", "/dashboard/tasks"],
  VOLUNTEER: ["/dashboard/captura-territorial", "/dashboard/tasks"],
} as const satisfies Record<BackendRole, readonly string[]>;

const FORBIDDEN_PATHS_BY_ROLE = {
  ADMIN: [
    "/dashboard/war-room",
    "/dashboard/public-office",
    "/dashboard/cases",
    "/dashboard/pqrsd",
    "/dashboard/operation-profile",
  ],
  CAMPAIGN_MANAGER: [
    "/dashboard/team",
    "/dashboard/billing",
    "/dashboard/audit",
    "/dashboard/electoral-catalog",
    "/dashboard/settings",
    "/dashboard/public-office",
    "/dashboard/cases",
  ],
  FINANCE_MANAGER: [
    "/dashboard/team",
    "/dashboard/billing",
    "/dashboard/audit",
    "/dashboard/cases",
    "/dashboard/war-room",
    "/dashboard/captura-territorial",
  ],
  COMMUNICATIONS_MANAGER: [
    "/dashboard/team",
    "/dashboard/billing",
    "/dashboard/audit",
    "/dashboard/finance",
    "/dashboard/electoral-catalog",
    "/dashboard/war-room",
    "/dashboard/cases",
  ],
  CONSTITUENT_SERVICES_MANAGER: [
    "/dashboard/team",
    "/dashboard/billing",
    "/dashboard/audit",
    "/dashboard/finance",
    "/dashboard/war-room",
    "/dashboard/operation-profile",
  ],
  CASE_WORKER: [
    "/dashboard/team",
    "/dashboard/billing",
    "/dashboard/audit",
    "/dashboard/finance",
    "/dashboard/war-room",
    "/dashboard/operation-profile",
  ],
  COMPLIANCE_OFFICER: ["/dashboard/team", "/dashboard/billing"],
  AUDITOR: [
    "/dashboard/team",
    "/dashboard/billing",
    "/dashboard/settings",
  ],
  ZONE_COORDINATOR: [
    "/dashboard/team",
    "/dashboard/billing",
    "/dashboard/audit",
    "/dashboard/finance",
    "/dashboard/public-office",
    "/dashboard/cases",
  ],
  WITNESS: [
    "/dashboard/team",
    "/dashboard/billing",
    "/dashboard/audit",
    "/dashboard/finance",
    "/dashboard/public-office",
    "/dashboard/cases",
  ],
  VOLUNTEER: [
    "/dashboard/team",
    "/dashboard/billing",
    "/dashboard/audit",
    "/dashboard/finance",
    "/dashboard/public-office",
    "/dashboard/cases",
  ],
} as const satisfies Record<BackendRole, readonly string[]>;

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta la variable obligatoria ${name}.`);
  }
  return value;
}

function accountEnvironmentName(role: BackendRole, suffix: string) {
  return `${ENV_PREFIX}_${role}_${suffix}`;
}

export type ProductionRoleAccount = {
  role: BackendRole;
  roleLabel: string;
  email: string;
  password: string;
  totpSecret: string | null;
  requiredPaths: readonly string[];
  forbiddenPathCandidates: readonly string[];
};

export function loadProductionRoleAccounts(): readonly ProductionRoleAccount[] {
  return ALL_BACKEND_ROLES.map((role) => ({
    role,
    roleLabel: ROLE_LABEL_BY_BACKEND_ROLE[role],
    email: requiredEnvironmentValue(accountEnvironmentName(role, "EMAIL")),
    password: requiredEnvironmentValue(
      accountEnvironmentName(role, "PASSWORD"),
    ),
    totpSecret:
      process.env[accountEnvironmentName(role, "TOTP_SECRET")]?.trim() || null,
    requiredPaths: REQUIRED_PATHS_BY_ROLE[role],
    forbiddenPathCandidates: FORBIDDEN_PATHS_BY_ROLE[role],
  }));
}

function decodeBase32(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = secret.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || [...normalized].some((char) => !alphabet.includes(char))) {
    throw new Error("El secreto TOTP de producción no tiene Base32 válido.");
  }

  let bits = "";
  for (const char of normalized) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function currentTotpCode(secret: string, now = Date.now()) {
  const counter = Math.floor(now / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}
