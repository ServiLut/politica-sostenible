import { apiDownload, apiRequest } from "@/lib/api-client";

export type VoterImportPreviewStatus =
  "new" | "duplicate_file" | "duplicate_db";

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

export type VoterImportJobStatus =
  | "QUEUED"
  | "VALIDATING"
  | "READY"
  | "IMPORT_QUEUED"
  | "IMPORTING"
  | "COMPLETED"
  | "FAILED";

export interface VoterImportJob {
  id: string;
  fileName: string;
  status: VoterImportJobStatus;
  totalRows: number;
  validRows: number;
  errorRows: number;
  skippedRows: number;
  importedRows: number;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  canExecute: boolean;
  canRetry: boolean;
  progress: {
    phase: "validation" | "import" | "complete";
    processed: number;
    total: number | null;
  };
}

export interface VoterImportPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface VoterImportJobsPage {
  items: VoterImportJob[];
  pagination: VoterImportPagination;
}

export interface VoterImportJobErrorsPage {
  items: Array<{
    row: number;
    errors: Array<{ field: string; message: string }>;
  }>;
  pagination: VoterImportPagination;
}

export interface VoterImportOptions {
  limits: { maxRows: number; maxBytes: number; maxEvidenceBytes?: number };
  notice: { version: string; activatedAt: string };
  requiredHeaders: string[];
  optionalHeaders: string[];
}

export interface CreateVoterImportJobInput {
  clientRequestId: string;
  sourceArtifactPath: string;
  expectedContentSha256: string;
  fileName: string;
}

const jobsPath = "import/personas/jobs";
const jobPath = (id: string) => `${jobsPath}/${encodeURIComponent(id)}`;

export function getVoterImportOptions(
  signal?: AbortSignal,
): Promise<VoterImportOptions> {
  return apiRequest("import/personas/options", { signal });
}

export function listVoterImportJobs(
  page = 1,
  signal?: AbortSignal,
): Promise<VoterImportJobsPage> {
  return apiRequest(`${jobsPath}?page=${page}&limit=10`, { signal });
}

export function getVoterImportJob(
  id: string,
  signal?: AbortSignal,
): Promise<VoterImportJob> {
  return apiRequest(jobPath(id), { signal });
}

export function createVoterImportJob(
  input: CreateVoterImportJobInput,
): Promise<VoterImportJob> {
  // Explicit fields prevent callers from smuggling a tenant or a mode in a spread.
  return apiRequest(jobsPath, {
    method: "POST",
    body: JSON.stringify({
      clientRequestId: input.clientRequestId,
      sourceArtifactPath: input.sourceArtifactPath,
      expectedContentSha256: input.expectedContentSha256,
      fileName: input.fileName,
    }),
  });
}

export function executeVoterImportJob(id: string): Promise<VoterImportJob> {
  return apiRequest(`${jobPath(id)}/execute`, { method: "POST" });
}

export function retryVoterImportJob(id: string): Promise<VoterImportJob> {
  return apiRequest(`${jobPath(id)}/retry`, { method: "POST" });
}

export function getVoterImportJobErrors(
  id: string,
  page = 1,
  signal?: AbortSignal,
): Promise<VoterImportJobErrorsPage> {
  return apiRequest(`${jobPath(id)}/errors?page=${page}&limit=20`, { signal });
}

export function downloadVoterImportErrors(id: string): Promise<Blob> {
  return apiDownload(`${jobPath(id)}/errors.csv`);
}
