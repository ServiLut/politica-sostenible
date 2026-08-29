import { apiRequest } from "@/lib/api-client";

export type ReviewableStorageModule = "finance" | "e14";

export interface PrivateDownloadAuthorization {
  url: string;
  expiresAt: string;
}

export function requestPrivateDownload(
  module: ReviewableStorageModule,
  resourceId: string,
): Promise<PrivateDownloadAuthorization> {
  return apiRequest("storage/download-url", {
    method: "POST",
    body: JSON.stringify({ module, resourceId }),
  });
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
