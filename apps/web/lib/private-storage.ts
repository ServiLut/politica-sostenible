import { apiRequest } from "@/lib/api-client";

export type ReviewableStorageModule =
  | "finance"
  | "e14"
  | "signature-collection"
  | "electoral-calendar"
  | "pqrsd"
  | "scrutiny";

export interface PrivateDownloadAuthorization {
  url: string;
  expiresAt: string;
}

export function validatePrivateDownloadAuthorization(
  authorization: PrivateDownloadAuthorization,
  configuredStorageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
  now = Date.now(),
): PrivateDownloadAuthorization {
  const invalid = () => new Error("La API devolvió un enlace de archivo privado no válido. Solicita el enlace nuevamente.");
  try {
    if (!configuredStorageUrl || !authorization || typeof authorization.url !== "string" || typeof authorization.expiresAt !== "string") throw invalid();
    const storage = new URL(configuredStorageUrl);
    const url = new URL(authorization.url);
    const localHttp = storage.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(storage.hostname);
    if (
      (storage.protocol !== "https:" && !localHttp) ||
      storage.username || storage.password || storage.search || storage.hash ||
      url.origin !== storage.origin || url.username || url.password || url.hash ||
      !url.pathname.startsWith("/storage/v1/object/sign/") ||
      url.pathname.slice("/storage/v1/object/sign/".length).split("/").filter(Boolean).length < 2 ||
      url.searchParams.getAll("token").length !== 1 || !url.searchParams.get("token") ||
      !Number.isFinite(Date.parse(authorization.expiresAt)) || Date.parse(authorization.expiresAt) <= now
    ) throw invalid();
    return { url: url.href, expiresAt: authorization.expiresAt };
  } catch {
    // Do not include the signed URL/token in diagnostics.
    throw invalid();
  }
}

export async function requestPrivateDownload(
  module: ReviewableStorageModule,
  resourceId: string,
): Promise<PrivateDownloadAuthorization> {
  const authorization = await apiRequest<PrivateDownloadAuthorization>("storage/download-url", {
    method: "POST",
    body: JSON.stringify({ module, resourceId }),
  });
  return validatePrivateDownloadAuthorization(authorization);
}

/**
 * Opens a blank tab synchronously so browsers do not classify the later signed
 * URL navigation as an unsolicited popup.
 */
export async function openPrivateResource(
  module: ReviewableStorageModule,
  resourceId: string,
): Promise<void> {
  const preview = window.open("about:blank", "_blank");
  if (!preview) {
    throw new Error(
      "El navegador bloqueó la vista del soporte. Habilita ventanas emergentes para este sitio.",
    );
  }
  preview.opener = null;

  try {
    const authorization = await requestPrivateDownload(module, resourceId);
    preview.location.replace(authorization.url);
  } catch (error) {
    preview.close();
    throw error;
  }
}
