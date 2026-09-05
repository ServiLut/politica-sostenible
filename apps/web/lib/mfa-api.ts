import { apiRequest } from "./api-client";

export async function getMfaStatus(): Promise<{ enabled: boolean }> {
  return apiRequest("/auth/mfa/status");
}

export async function setupMfa(): Promise<{ qrCodeDataUrl: string; secret: string }> {
  return apiRequest("/auth/mfa/setup", { method: "POST" });
}

export async function verifyMfa(code: string): Promise<{ enabled: boolean }> {
  return apiRequest("/auth/mfa/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function disableMfa(code: string): Promise<{ disabled: boolean }> {
  return apiRequest("/auth/mfa/disable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
