import { apiRequest } from "./api-client";
import {
  uploadAuthorizedFile,
  validateUploadAuthorization,
  waitForStorageIntegrityVerification,
  type UploadAuthorization,
  type UploadConfirmation,
} from "./direct-storage-upload";
import type {
  ActiveWitnessCaptureContext,
  CreateWitnessReportInput,
} from "./election-api";

export interface OfflineE14GrantPlace {
  id: string;
  code: string;
  name: string;
  expectedTables: number;
  sourceLocationCode: string | null;
  votingDate: string | null;
  timeZone: string | null;
  address: string | null;
  commune: string | null;
}

export interface OfflineE14CaptureGrant {
  schemaVersion: 3;
  captureGrant: string;
  captureContext: ActiveWitnessCaptureContext;
  issuedAt: string;
  expiresAt: string;
  electionDate: string;
  votingStartDate: string;
  votingEndDate: string;
  electionWindowSha256: string;
  places: OfflineE14GrantPlace[];
}

export interface OfflineE14SyncReceipt {
  received: true;
  receiptId: string;
  clientOperationId: string;
  operationType: "E14_REPORT";
  status: "APPLIED" | "DUPLICATE";
  capturedAt: string;
  receivedAt: string;
  captureContext: ActiveWitnessCaptureContext;
}

export type OfflineE14ReportInput = Omit<
  CreateWitnessReportInput,
  "e14ImageUrl"
>;

export interface OfflineE14SyncInput extends OfflineE14ReportInput {
  e14ImageUrl: string;
  clientOperationId: string;
  capturedAt: string;
  captureGrant: string;
  evidenceSha256: string;
}

export function provisionOfflineE14Grant(
  signal?: AbortSignal,
): Promise<OfflineE14CaptureGrant> {
  return apiRequest("witnesses/offline-capture-grants", {
    method: "POST",
    signal,
  });
}

export function revokeOfflineE14Grants(
  signal?: AbortSignal,
): Promise<{ revoked: number }> {
  return apiRequest("witnesses/offline-capture-grants", {
    method: "DELETE",
    signal,
  });
}

export async function authorizeOfflineE14Evidence(
  file: File,
  contentSha256: string,
  signal?: AbortSignal,
): Promise<UploadAuthorization> {
  const metadata = {
    fileName: file.name,
    contentType: file.type,
    size: file.size,
    contentSha256,
  };
  const authorization = await apiRequest<UploadAuthorization>(
    "storage/upload-url",
    {
      method: "POST",
      signal,
      body: JSON.stringify({ module: "e14", ...metadata }),
    },
  );
  validateUploadAuthorization(authorization, metadata);
  return authorization;
}

export function uploadOfflineE14Evidence(
  file: File,
  authorization: UploadAuthorization,
): Promise<void> {
  return uploadAuthorizedFile(file, authorization);
}

export async function confirmOfflineE14Evidence(
  path: string,
  metadata: UploadAuthorization["metadata"],
  signal?: AbortSignal,
): Promise<UploadConfirmation & { module?: "e14" }> {
  const confirmation = await apiRequest<UploadConfirmation>(
    "storage/complete",
    {
      method: "POST",
      signal,
      body: JSON.stringify({ module: "e14", path, metadata }),
    },
  );
  if (
    confirmation.confirmed !== true ||
    !confirmation.objectId ||
    confirmation.path !== path ||
    (confirmation.module !== undefined && confirmation.module !== "e14")
  ) {
    throw new Error("La API devolvio una confirmacion E-14 inconsistente");
  }
  if (confirmation.contentIntegrity === "PENDING") {
    await waitForStorageIntegrityVerification(confirmation.objectId, { signal });
  } else if (confirmation.contentIntegrity !== "VERIFIED") {
    throw new Error("La evidencia E-14 no supero la verificacion independiente");
  }
  return {
    confirmed: true,
    objectId: confirmation.objectId,
    path: confirmation.path,
    ...(confirmation.module ? { module: "e14" as const } : {}),
    contentIntegrity: "VERIFIED",
  };
}

export function syncOfflineE14(
  input: OfflineE14SyncInput,
  signal?: AbortSignal,
): Promise<OfflineE14SyncReceipt> {
  return apiRequest("logistics/sync/e14", {
    method: "POST",
    signal,
    body: JSON.stringify(input),
  });
}
