import { apiDownload, apiRequest } from "@/lib/api-client";

export type VoterImportPreviewStatus =
  | "new"
  | "duplicate_file"
  | "duplicate_db";

export interface VoterImportErrorRow {
  row: number;
  field: string;
  message: string;
}

export interface VoterImportPreviewRow {
  documentId: string;
  firstName: string;
  lastName: string;
  status: VoterImportPreviewStatus;
}

export interface VoterImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: VoterImportErrorRow[];
  duplicatesInFile: number;
  duplicatesInDatabase: number;
  preview: VoterImportPreviewRow[];
}

export interface VoterImportExecutionResult {
  success: true;
  imported: number;
  skipped: number;
}

export function getVoterImportTemplate(signal?: AbortSignal): Promise<Blob> {
  return apiDownload("import/personas/template", { signal });
}

export function previewVoterImport(
  csv: string,
  signal?: AbortSignal,
): Promise<VoterImportPreview> {
  return apiRequest<VoterImportPreview>("import/personas/preview", {
    method: "POST",
    body: JSON.stringify({ csv }),
    signal,
  });
}

export function executeVoterImport(
  csv: string,
): Promise<VoterImportExecutionResult> {
  return apiRequest<VoterImportExecutionResult>("import/personas/execute", {
    method: "POST",
    body: JSON.stringify({ csv }),
  });
}
