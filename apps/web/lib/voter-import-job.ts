import type { VoterImportJob, VoterImportJobStatus } from "./import-api";

export const VOTER_IMPORT_STATUS_LABELS: Record<VoterImportJobStatus, string> =
  {
    QUEUED: "En espera para revisar",
    VALIDATING: "Revisando filas",
    READY: "Revisión lista",
    IMPORT_QUEUED: "En espera para importar",
    IMPORTING: "Importando personas",
    COMPLETED: "Importación terminada",
    FAILED: "Necesita atención",
  };

export function isVoterImportJobRunning(
  job: Pick<VoterImportJob, "status">,
): boolean {
  return ["QUEUED", "VALIDATING", "IMPORT_QUEUED", "IMPORTING"].includes(
    job.status,
  );
}

export function voterImportStep(
  job: Pick<VoterImportJob, "status"> | null,
): 1 | 2 | 3 {
  if (!job) return 1;
  return ["IMPORT_QUEUED", "IMPORTING", "COMPLETED"].includes(job.status)
    ? 3
    : 2;
}

export function canExecuteVoterImport(
  job: VoterImportJob | null,
  busy: boolean,
): boolean {
  return Boolean(
    job &&
    job.status === "READY" &&
    job.canExecute &&
    job.validRows > 0 &&
    !busy,
  );
}

/** Validation totals may be unknown until the CSV is parsed. Never invent a percent. */
export function voterImportProgress(
  job: VoterImportJob,
): { value: number; max: number } | null {
  const { processed, total } = job.progress;
  if (
    total === null ||
    total <= 0 ||
    !Number.isFinite(total) ||
    !Number.isFinite(processed) ||
    processed < 0 ||
    processed > total
  )
    return null;
  return { value: processed, max: total };
}

export function voterImportCounts(job: VoterImportJob) {
  return [
    { label: "Filas del archivo", value: job.totalRows },
    { label: "Nuevas listas", value: job.validRows },
    { label: "Ya existentes", value: job.skippedRows },
    { label: "Filas con errores", value: job.errorRows },
    { label: "Importadas", value: job.importedRows },
  ];
}
