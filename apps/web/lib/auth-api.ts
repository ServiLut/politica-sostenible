import { apiRequest } from "@/lib/api-client";
import {
  AuthSession,
  BackendAuthUser,
  createAuthSession,
} from "@/lib/auth-session";

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  documentId: string;
  phone?: string;
  organizationName: string;
  organizationType: "CANDIDACY" | "PARTY" | "GSC" | "PUBLIC_OFFICE";
  termsAccepted: true;
  termsVersion: string;
}

interface LoginResponse {
  access_token: string;
  user: BackendAuthUser;
}

export interface RegisterResponse {
  message: string;
  tenantId: string;
  userId: string;
}

interface CurrentSessionResponse {
  user: BackendAuthUser;
}

export async function loginWithCredentials(
  credentials: LoginDto,
): Promise<AuthSession> {
  const response = await apiRequest<LoginResponse>("/auth/login", {
    auth: false,
    body: JSON.stringify(credentials),
    method: "POST",
  });

  return createAuthSession(response.access_token, response.user);
}

export function registerAccount(data: RegisterDto) {
  return apiRequest<RegisterResponse>("/auth/register", {
    auth: false,
    body: JSON.stringify(data),
    method: "POST",
  });
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
