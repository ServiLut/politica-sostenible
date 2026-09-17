import { apiRequest } from "@/lib/api-client";
import {
  AuthSession,
  BackendAuthUser,
  createAuthSession,
} from "@/lib/auth-session";

export interface LoginDto {
  email: string;
  password: string;
  totpCode?: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  passwordConfirmation: string;
  name: string;
  documentId?: string;
  phone?: string;
  organizationName: string;
  organizationType: "CANDIDACY" | "PARTY" | "GSC" | "PUBLIC_OFFICE";
  termsAccepted: true;
  termsVersion: string;
}

interface LoginResponse {
  access_token?: string;
  user?: BackendAuthUser;
  requiresMfa?: boolean;
}

export interface RegisterResponse {
  message: string;
  tenantId: string;
  userId: string;
}

export interface RegistrationPolicyResponse {
  enabled: boolean;
  invitationAcceptanceEnabled: boolean;
  mode: "SELF_SERVICE" | "CONTROLLED_ACCESS";
  message: string;
  termsVersion: string;
}

interface CurrentSessionResponse {
  user: BackendAuthUser;
}

export interface UpdateOrganizationResponse {
  tenant: BackendAuthUser["tenant"];
  changed: boolean;
}

export async function loginWithCredentials(
  credentials: LoginDto,
): Promise<AuthSession | { requiresMfa: true }> {
  const response = await apiRequest<LoginResponse>("/auth/login", {
    auth: false,
    body: JSON.stringify(credentials),
    method: "POST",
  });

  if (response.requiresMfa) {
    return { requiresMfa: true };
  }

  return createAuthSession(response.access_token!, response.user!);
}

export function registerAccount(data: RegisterDto) {
  return apiRequest<RegisterResponse>("/auth/register", {
    auth: false,
    body: JSON.stringify(data),
    method: "POST",
  });
}

function isRegistrationPolicyResponse(
  value: unknown,
): value is RegistrationPolicyResponse {
  if (typeof value !== "object" || value === null) return false;

  const policy = value as Record<string, unknown>;
  const modeMatchesState = policy.enabled
    ? policy.mode === "SELF_SERVICE"
    : policy.mode === "CONTROLLED_ACCESS";

  return (
    typeof policy.enabled === "boolean" &&
    typeof policy.invitationAcceptanceEnabled === "boolean" &&
    modeMatchesState &&
    typeof policy.message === "string" &&
    policy.message.trim().length > 0 &&
    policy.message.length <= 500 &&
    typeof policy.termsVersion === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(policy.termsVersion)
  );
}

export async function getRegistrationPolicy(signal?: AbortSignal) {
  const policy = await apiRequest<unknown>("/auth/registration-policy", {
    auth: false,
    cache: "no-store",
    signal,
  });

  if (!isRegistrationPolicyResponse(policy)) {
    throw new Error(
      "La política de registro recibida no contiene un contrato legal válido.",
    );
  }

  return policy;
}

export async function getCurrentAuthUser(signal?: AbortSignal) {
  const response = await apiRequest<CurrentSessionResponse>("/auth/me", {
    signal,
  });
  return response.user;
}

export function changeOwnPassword(data: {
  currentPassword: string;
  newPassword: string;
}) {
  return apiRequest<{ message: string }>("/auth/change-password", {
    body: JSON.stringify(data),
    method: "POST",
  });
}

export function logoutAllSessions() {
  return apiRequest<{ message: string }>("/auth/logout", {
    auth: true,
    keepalive: true,
    method: "POST",
  });
}

export function updateOwnOrganization(data: {
  name: string;
  expectedName: string;
}) {
  return apiRequest<UpdateOrganizationResponse>("/auth/organization", {
    body: JSON.stringify(data),
    method: "PATCH",
  });
}
