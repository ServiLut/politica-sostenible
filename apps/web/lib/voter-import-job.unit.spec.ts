import { expect, test } from "@playwright/test";
import type { VoterImportJob } from "./import-api";
import {
  canExecuteVoterImport,
  isVoterImportJobRunning,
  voterImportCounts,
  voterImportProgress,
  voterImportStep,
} from "./voter-import-job";

const job: VoterImportJob = {
  id: "job-1",
  fileName: "personas.csv",
  status: "READY",
  totalRows: 1000,
  validRows: 700,
  errorRows: 100,
  skippedRows: 200,
  importedRows: 0,
  attempts: 1,
  createdAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-06T00:01:00Z",
  completedAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  canExecute: true,
  canRetry: false,
  progress: { phase: "validation", processed: 1000, total: 1000 },
};

test("botón de importación sólo habilitado con revisión lista y personas nuevas válidas", () => {
  expect(canExecuteVoterImport(job, false)).toBe(true);
  expect(canExecuteVoterImport(job, true)).toBe(false);
  expect(canExecuteVoterImport({ ...job, canExecute: false }, false)).toBe(
    false,
  );
  expect(canExecuteVoterImport({ ...job, validRows: 0 }, false)).toBe(false);
  for (const status of [
    "VALIDATING",
    "IMPORTING",
    "FAILED",
    "COMPLETED",
  ] as const) {
    expect(canExecuteVoterImport({ ...job, status }, false)).toBe(false);
  }
});

test("los conteos usan filas exactas, sin contar cada motivo ni duplicar existentes", () => {
  expect(voterImportCounts(job).map((item) => item.value)).toEqual([
    1000, 700, 200, 100, 0,
  ]);
  expect(
    voterImportCounts({
      ...job,
      status: "IMPORTING",
      validRows: 400,
      importedRows: 300,
    }).map((item) => item.value),
  ).toEqual([1000, 400, 200, 100, 300]);
});

test("avance desconocido o inconsistente no se presenta como porcentaje", () => {
  expect(
    voterImportProgress({
      ...job,
      progress: { phase: "validation", total: null, processed: 0 },
    }),
  ).toBeNull();
  expect(
    voterImportProgress({
      ...job,
      progress: { phase: "validation", total: 0, processed: 0 },
    }),
  ).toBeNull();
  expect(
    voterImportProgress({
      ...job,
      progress: { phase: "import", total: 10, processed: 11 },
    }),
  ).toBeNull();
  expect(
    voterImportProgress({
      ...job,
      progress: { phase: "import", total: 700, processed: 300 },
    }),
  ).toEqual({ value: 300, max: 700 });
});

test("sólo sondear trabajos activos; los terminados y fallidos requieren acción visible", () => {
  for (const status of [
    "QUEUED",
    "VALIDATING",
    "IMPORT_QUEUED",
    "IMPORTING",
  ] as const)
    expect(isVoterImportJobRunning({ status })).toBe(true);
  for (const status of ["READY", "FAILED", "COMPLETED"] as const)
    expect(isVoterImportJobRunning({ status })).toBe(false);
  expect(voterImportStep(null)).toBe(1);
  expect(voterImportStep(job)).toBe(2);
  expect(voterImportStep({ status: "COMPLETED" })).toBe(3);
});
