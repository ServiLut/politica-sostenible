import { BackendUserRole, Tenant, User, UserRole } from "@/types/saas-schema";

export const AUTH_SESSION_STORAGE_KEY = "politica-sostenible.auth-session";
export const AUTH_SESSION_CHANGED_EVENT =
  "politica-sostenible:auth-session-changed";

export interface BackendTenant {
  id: string;
  name: string;
  slug: string;
  type: Tenant["type"];
  config?: unknown;
}

export interface BackendAuthUser {
  id: string;
  email: string;
  name: string;
  role: BackendUserRole;
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: string | null;
  tenant: BackendTenant;
}

export interface AuthSession {
  accessToken: string;
  expiresAt: number | null;
  tenant: Tenant;
  user: User;
}

const BACKEND_ROLE_TO_USER_ROLE: Record<BackendUserRole, UserRole> = {
  ADMIN: UserRole.AdminCampana,
  CAMPAIGN_MANAGER: UserRole.GerenteOps,
  FINANCE_MANAGER: UserRole.GerenteFinanzas,
  COMMUNICATIONS_MANAGER: UserRole.GerenteOps,
  CONSTITUENT_SERVICES_MANAGER: UserRole.Coordinador,
  CASE_WORKER: UserRole.Coordinador,
  COMPLIANCE_OFFICER: UserRole.Auditor,
  AUDITOR: UserRole.Auditor,
  ZONE_COORDINATOR: UserRole.Coordinador,
  WITNESS: UserRole.Testigo,
  VOLUNTEER: UserRole.Voluntario,
};

const TENANT_TYPES = new Set<Tenant["type"]>([
  "CANDIDACY",
  "PARTY",
  "GSC",
  "PUBLIC_OFFICE",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBackendRole(value: unknown): value is BackendUserRole {
  return typeof value === "string" && value in BACKEND_ROLE_TO_USER_ROLE;
}

function isTenantType(value: unknown): value is Tenant["type"] {
  return typeof value === "string" && TENANT_TYPES.has(value as Tenant["type"]);
}

function isFrontendRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    Object.values(UserRole).includes(value as UserRole)
  );
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function getJwtExpiration(accessToken: string): number | null {
  try {
    const encodedPayload = accessToken.split(".")[1];
    if (!encodedPayload) return null;

    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(paddedBase64), (character) =>
      character.charCodeAt(0),
    );
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));

    return isRecord(payload) && typeof payload.exp === "number"
      ? payload.exp * 1_000
      : null;
  } catch {
    return null;
  }
}

export function mapBackendRole(role: BackendUserRole): UserRole {
  return BACKEND_ROLE_TO_USER_ROLE[role];
}

export function createAuthSession(
  accessToken: string,
  backendUser: BackendAuthUser,
): AuthSession {
  if (
    !accessToken ||
    !backendUser?.id ||
    !backendUser.email ||
    !backendUser.name
  ) {
    throw new Error("La API devolvió una sesión incompleta.");
  }

  if (!isBackendRole(backendUser.role)) {
    throw new Error(
      "Tu rol todavía no está soportado por esta versión de la aplicación.",
    );
  }

  if (
    !backendUser.tenant?.id ||
    !backendUser.tenant.name ||
    !backendUser.tenant.slug ||
    !isTenantType(backendUser.tenant.type)
  ) {
    throw new Error("La API devolvió una campaña inválida para esta sesión.");
  }

  const tenant: Tenant = {
    id: backendUser.tenant.id,
    name: backendUser.tenant.name,
    slug: backendUser.tenant.slug,
    type: backendUser.tenant.type,
    config: backendUser.tenant.config,
  };
  const mustChangePassword = backendUser.mustChangePassword === true;
  if (
    mustChangePassword &&
    !isValidTimestamp(backendUser.temporaryPasswordExpiresAt)
  ) {
    throw new Error(
      "La API devolvió una credencial temporal sin vencimiento válido.",
    );
  }

  return {
    accessToken,
    expiresAt: getJwtExpiration(accessToken),
    tenant,
    user: {
      id: backendUser.id,
      email: backendUser.email,
      name: backendUser.name,
      role: mapBackendRole(backendUser.role),
      backendRole: backendUser.role,
      mustChangePassword,
      temporaryPasswordExpiresAt: mustChangePassword
        ? backendUser.temporaryPasswordExpiresAt
        : null,
    },
  };
}

function isStoredSession(value: unknown): value is AuthSession {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.tenant)) {
    return false;
  }

  const mustChangePassword = value.user.mustChangePassword === true;
  const hasValidTemporaryPasswordState = mustChangePassword
    ? isValidTimestamp(value.user.temporaryPasswordExpiresAt)
    : value.user.temporaryPasswordExpiresAt === undefined ||
      value.user.temporaryPasswordExpiresAt === null;

  return (
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0 &&
    (value.expiresAt === null || typeof value.expiresAt === "number") &&
    typeof value.user.id === "string" &&
    typeof value.user.email === "string" &&
    typeof value.user.name === "string" &&
    isFrontendRole(value.user.role) &&
    isBackendRole(value.user.backendRole) &&
    (value.user.mustChangePassword === undefined ||
      typeof value.user.mustChangePassword === "boolean") &&
    hasValidTemporaryPasswordState &&
    typeof value.tenant.id === "string" &&
    typeof value.tenant.name === "string" &&
    typeof value.tenant.slug === "string" &&
    isTenantType(value.tenant.type)
  );
}

function notifySessionChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
  }
}

export function readAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  const serializedSession = window.sessionStorage.getItem(
    AUTH_SESSION_STORAGE_KEY,
  );
  if (!serializedSession) return null;

  try {
    const session: unknown = JSON.parse(serializedSession);
    if (!isStoredSession(session)) {
      clearAuthSession();
      return null;
    }

    if (session.expiresAt !== null && session.expiresAt <= Date.now()) {
      clearAuthSession();
      return null;
    }

    return session;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function saveAuthSession(session: AuthSession) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
  window.localStorage.removeItem("dev_role");
  notifySessionChanged();
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  window.localStorage.removeItem("dev_role");
  notifySessionChanged();
}

export function getStoredAccessToken(): string | null {
  return readAuthSession()?.accessToken ?? null;
}
