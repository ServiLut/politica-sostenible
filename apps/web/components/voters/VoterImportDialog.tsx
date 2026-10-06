"use client";

import { Download, FileSpreadsheet, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlanCapability } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import { uploadFileDirectlyWithClientDeclaredHash } from "@/lib/direct-storage-upload";
import {
  createVoterImportJob,
  executeVoterImportJob,
  getVoterImportJob,
  getVoterImportOptions,
  listVoterImportJobs,
  retryVoterImportJob,
  type CreateVoterImportJobInput,
  type VoterImportExecutionResult,
  type VoterImportJob,
} from "@/lib/import-api";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { usePageRequest } from "@/lib/use-page-request";
import {
  createBlankVoterImportTemplate,
  formatVoterImportSize,
  MAX_CONSENT_EVIDENCE_BYTES,
  mergeVoterImportEvidenceFiles,
  VOTER_IMPORT_COLUMN_HELP,
} from "@/lib/voter-import";
import { createVoterImportUploadSession } from "@/lib/voter-import-upload";
import {
  canExecuteVoterImport,
  isVoterImportJobRunning,
  voterImportStep,
  VOTER_IMPORT_STATUS_LABELS,
} from "@/lib/voter-import-job";
import {
  saveVoterImportDownload,
  VoterImportJobReview,
} from "./VoterImportJobReview";

interface VoterImportDialogProps {
  enabled: boolean;
  noticeActivatedAt: string | null;
  noticeVersion: string | null;
  onCompleted(result: VoterImportExecutionResult): void;
}

const secondary =
  "min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50";
const fileClass =
  "block w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo completar la consulta. Intenta de nuevo.";
}

export function VoterImportDialog({
  enabled,
  noticeVersion,
  noticeActivatedAt,
  onCompleted,
}: VoterImportDialogProps) {
  const importCapability = usePlanCapability("import");
  const [open, setOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] =
    useState<CreateVoterImportJobInput | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyRevision, setHistoryRevision] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const busyRef = useRef(false);
  const operationRef = useRef<AbortController | null>(null);
  const [uploadSession] = useState(() =>
    createVoterImportUploadSession({
      upload: (file, module, signal) =>
        uploadFileDirectlyWithClientDeclaredHash(file, module, { signal }),
      requestId: () => crypto.randomUUID(),
    }),
  );
  const reportedJobs = useRef(new Set<string>());
  const allowed = open && enabled && importCapability.enabled;
  const requestOptions = useCallback(
    (signal: AbortSignal) => getVoterImportOptions(signal),
    [],
  );
  const options = usePageRequest(requestOptions, {
    enabled: allowed,
    reloadKey: `${noticeVersion ?? ""}:${noticeActivatedAt ?? ""}`,
  });
  const requestHistory = useCallback(
    (signal: AbortSignal) => listVoterImportJobs(historyPage, signal),
    [historyPage],
  );
  const history = usePageRequest(requestHistory, {
    enabled: allowed,
    reloadKey: historyRevision,
  });
  const requestJob = useCallback(
    (signal: AbortSignal) => getVoterImportJob(jobId!, signal),
    [jobId],
  );
  const {
    data: job,
    loading: jobLoading,
    error: jobError,
    refresh: refreshJob,
    setData: setJob,
  } = usePageRequest(requestJob, {
    enabled: allowed && Boolean(jobId),
    retainDataOnRefresh: true,
  });

  const closeDialog = useCallback(() => {
    if (!busyRef.current) setOpen(false);
  }, []);
  useAccessibleDialog({
    open,
    containerRef: dialogRef,
    initialFocusRef: titleRef,
    returnFocusRef: triggerRef,
    closeOnEscape: !busy,
    onClose: closeDialog,
  });
  useEffect(() => () => operationRef.current?.abort(), []);
  useEffect(() => {
    if (
      !open ||
      !job ||
      !isVoterImportJobRunning(job) ||
      jobLoading ||
      jobError ||
      busy
    )
      return;
    const timer = window.setTimeout(() => void refreshJob(), 3000);
    return () => window.clearTimeout(timer);
  }, [open, job, jobLoading, jobError, busy, refreshJob]);
  useEffect(() => {
    if (job?.status !== "COMPLETED" || reportedJobs.current.has(job.id)) return;
    reportedJobs.current.add(job.id);
    onCompleted({
      success: true,
      imported: job.importedRows,
      skipped: job.skippedRows,
    });
  }, [job, onCompleted]);

  function showCurrentStep() {
    bodyRef.current?.scrollTo({ top: 0, behavior: "auto" });
    titleRef.current?.focus({ preventScroll: true });
  }
  function selectJob(next: VoterImportJob) {
    if (next.status === "COMPLETED") reportedJobs.current.add(next.id);
    setJobId(next.id);
    setError(null);
    setWarning(null);
    setPendingCreate(null);
    showCurrentStep();
  }
  function chooseCorrectedFile() {
    setJobId(null);
    setPendingCreate(null);
    setCsvFile(null);
    setError(null);
    setWarning(
      "Las evidencias seleccionadas y las cargas confirmadas de esta ventana se conservan. Elige el CSV corregido para crear otra revisión.",
    );
    setHistoryRevision((value) => value + 1);
    showCurrentStep();
  }
  function cancelPreparation() {
    const operation = operationRef.current;
    if (!operation) return;
    operation.abort();
    operationRef.current = null;
    busyRef.current = false;
    setBusy(false);
    setProgress(null);
    setWarning(
      "Se detuvo la preparación. Las evidencias ya confirmadas se conservan. Si se estaba guardando la revisión, consulta Importaciones recientes o usa Recuperar revisión antes de volver a cargar.",
    );
    setHistoryRevision((value) => value + 1);
  }
  async function prepare() {
    if (busyRef.current || !csvFile || !options.data) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setWarning(null);
    const controller = new AbortController();
    operationRef.current = controller;
    try {
      let input = pendingCreate;
      if (!input) {
        input = await uploadSession.prepare({
          file: csvFile,
          evidenceFiles,
          limits: options.data.limits,
          signal: controller.signal,
          onProgress: setProgress,
          onUnused: (count) =>
            setWarning(
              count
                ? `${count} archivos adjuntos no aparecen en el CSV y no se cargarán.`
                : null,
            ),
        });
        // Preserve the ID after a lost response; retries address the same job.
        setPendingCreate(input);
      }
      controller.signal.throwIfAborted();
      setProgress("Guardando la revisión…");
      const created = await createVoterImportJob(input);
      if (controller.signal.aborted) return;
      selectJob(created);
      setHistoryRevision((value) => value + 1);
    } catch (cause) {
      if (
        !controller.signal.aborted &&
        cause instanceof ApiError &&
        [400, 403, 404, 422].includes(cause.status)
      )
        setPendingCreate(null);
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo preparar el archivo. Los archivos seleccionados se conservan.",
        );
    } finally {
      if (operationRef.current === controller) {
        busyRef.current = false;
        operationRef.current = null;
      }
      if (!controller.signal.aborted) {
        setBusy(false);
        setProgress(null);
      }
    }
  }
  async function actOnJob(action: "execute" | "retry") {
    if (!job || busyRef.current) return;
    if (action === "execute" && !canExecuteVoterImport(job, false)) return;
    if (action === "retry" && !job.canRetry) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await (action === "execute"
        ? executeVoterImportJob(job.id)
        : retryVoterImportJob(job.id));
      setJob(result);
      showCurrentStep();
      setHistoryRevision((value) => value + 1);
    } catch (cause) {
      setError(
        `${cause instanceof Error ? cause.message : "No se recibió confirmación."} Actualiza el estado antes de intentarlo otra vez; el proceso podría haber comenzado.`,
      );
      await refreshJob();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const currentStep = jobId && !job ? 2 : voterImportStep(job);
  const canExecute = canExecuteVoterImport(
    job,
    busy || jobLoading || Boolean(jobError),
  );

  return (
    <>
      {importCapability.status === "error" ? (
        <button
          type="button"
          className={secondary}
          onClick={importCapability.refresh}
        >
          Reintentar validación del plan
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={primary}
          disabled={!enabled || !importCapability.enabled}
          aria-describedby={
            !importCapability.enabled ? "voter-import-plan-status" : undefined
          }
          title={
            !enabled
              ? "Configura primero el aviso de privacidad"
              : !importCapability.enabled
                ? importCapability.status === "checking"
                  ? "Comprobando funciones del plan"
                  : "Tu plan no incluye importación"
                : undefined
          }
          onClick={() => {
            setOpen(true);
            setHistoryRevision((value) => value + 1);
          }}
        >
          <FileSpreadsheet size={18} aria-hidden="true" />
          Importar personas
        </button>
      )}
      {!importCapability.enabled && (
        <p
          id="voter-import-plan-status"
          role="status"
          className="w-full text-sm text-slate-600"
        >
          {importCapability.reason ??
            "No se pudo comprobar si tu plan permite importar. Intenta de nuevo."}
        </p>
      )}
      {open && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/55 p-2 sm:p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="voter-import-title"
            aria-busy={busy}
            className="flex max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4 sm:px-6">
              <div className="min-w-0">
                <h2
                  ref={titleRef}
                  tabIndex={-1}
                  id="voter-import-title"
                  className="text-xl font-semibold text-slate-900 outline-none"
                >
                  Importar personas
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Carga muchas personas desde un archivo de Excel guardado como
                  CSV.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar importación"
                disabled={busy}
                onClick={closeDialog}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </header>
            <div ref={bodyRef} className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
              <ol
                aria-label="Pasos de la importación"
                className="grid grid-cols-3 gap-2 text-center text-xs font-semibold sm:text-sm"
              >
                {["Elegir archivo", "Revisar", "Importar"].map(
                  (label, index) => (
                    <li
                      key={label}
                      aria-current={
                        currentStep === index + 1 ? "step" : undefined
                      }
                      className={`rounded-xl px-2 py-3 ${currentStep === index + 1 ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}
                    >
                      {index + 1}. {label}
                    </li>
                  ),
                )}
              </ol>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
                >
                  {error}
                </p>
              )}
              {warning && (
                <p
                  role="status"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                >
                  {warning}
                </p>
              )}
              {progress && (
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-xl bg-blue-50 p-4 text-sm text-blue-950"
                >
                  <Loader2
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 animate-spin"
                    size={18}
                  />
                  {progress}
                </p>
              )}
              {Boolean(options.error) && (
                <div
                  role="alert"
                  className="space-y-2 rounded-xl bg-red-50 p-4 text-sm text-red-900"
                >
                  <p>{errorMessage(options.error)}</p>
                  <button
                    type="button"
                    className={secondary}
                    onClick={() => void options.refresh()}
                  >
                    Reintentar preparación
                  </button>
                </div>
              )}
              {options.loading && !options.data && (
                <p role="status" className="text-sm text-slate-600">
                  Cargando límites y aviso de privacidad…
                </p>
              )}
              {!jobId && options.data && (
                <section
                  className="space-y-4"
                  aria-label="Archivo y evidencias"
                >
                  <div className="flex flex-col items-start gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900">
                        Empieza con la plantilla
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Hasta{" "}
                        {options.data.limits.maxRows.toLocaleString("es-CO")}{" "}
                        filas y{" "}
                        {formatVoterImportSize(options.data.limits.maxBytes)}.
                        En Excel: Guardar como → CSV UTF-8. Se aceptan coma o
                        punto y coma; los archivos .xlsx deben guardarse como
                        CSV primero.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      className={`${secondary} inline-flex w-full shrink-0 items-center justify-center gap-2 sm:w-auto`}
                      onClick={() =>
                        saveVoterImportDownload(
                          new Blob(
                            [
                              createBlankVoterImportTemplate(
                                options.data!.requiredHeaders,
                                options.data!.optionalHeaders,
                              ),
                            ],
                            { type: "text/csv;charset=utf-8" },
                          ),
                          "plantilla_personas.csv",
                        )
                      }
                    >
                      <Download size={16} aria-hidden="true" />
                      Descargar plantilla
                    </button>
                  </div>
                  <details className="rounded-xl border border-slate-200 p-4">
                    <summary className="min-h-8 cursor-pointer text-sm font-semibold text-slate-900">
                      Qué va en cada columna
                    </summary>
                    <p className="my-3 text-sm text-slate-700">
                      Aviso vigente:{" "}
                      <strong>{options.data.notice.version}</strong>. Usa la
                      fecha real de cada autorización. La plantilla está vacía
                      para que ningún dato de ejemplo se importe por accidente.
                    </p>
                    <dl className="space-y-3 text-sm">
                      {VOTER_IMPORT_COLUMN_HELP.map(({ column, help }) => (
                        <div key={column}>
                          <dt className="font-semibold text-slate-900">
                            {column}
                          </dt>
                          <dd className="mt-1 leading-6 text-slate-600">
                            {help}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                  <label className="block space-y-2 text-sm font-semibold text-slate-900">
                    Archivo de personas (.csv)
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      disabled={busy || Boolean(pendingCreate)}
                      className={fileClass}
                      onChange={(event) => {
                        setCsvFile(event.target.files?.[0] ?? null);
                        setError(null);
                        setWarning(null);
                      }}
                    />
                    {csvFile && (
                      <span className="block break-all font-normal text-slate-600">
                        Seleccionado: {csvFile.name}
                      </span>
                    )}
                  </label>
                  <label className="block space-y-2 text-sm font-semibold text-slate-900">
                    Adjuntar evidencias nuevas (opcional)
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      disabled={busy || Boolean(pendingCreate)}
                      className={fileClass}
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        try {
                          const merged = mergeVoterImportEvidenceFiles(
                            evidenceFiles,
                            files,
                          );
                          setEvidenceFiles(merged.files);
                          setError(null);
                          setWarning(
                            merged.replaced
                              ? `Reemplazaste ${merged.replaced} evidencias seleccionadas. Sus archivos nuevos se comprobarán otra vez antes de revisar el CSV.`
                              : null,
                          );
                        } catch (cause) {
                          setError(errorMessage(cause));
                        }
                      }}
                    />
                    <span className="block font-normal leading-6 text-slate-600">
                      Selecciona todos los archivos de autorización de una vez.
                      PDF o imagen, máximo {formatVoterImportSize(Math.min(MAX_CONSENT_EVIDENCE_BYTES, options.data.limits.maxEvidenceBytes ?? options.data.limits.maxBytes))} cada uno. El nombre debe
                      coincidir con «Ruta evidencia». Si el CSV ya tiene
                      referencias válidas de evidencias cargadas, no necesitas
                      adjuntarlas de nuevo.
                    </span>
                  </label>
                  {evidenceFiles.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                      <p>
                        {evidenceFiles.length.toLocaleString("es-CO")}{" "}
                        evidencias seleccionadas; se cargarán sólo las usadas en
                        el archivo.
                      </p>
                      <button
                        type="button"
                        disabled={busy || Boolean(pendingCreate)}
                        className={secondary}
                        onClick={() => setEvidenceFiles([])}
                      >
                        Quitar selección de evidencias
                      </button>
                    </div>
                  )}
                  {pendingCreate && (
                    <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
                      El CSV ya está cargado. «Recuperar revisión» vuelve a
                      consultar con la misma solicitud para evitar duplicar la
                      importación.
                    </p>
                  )}
                </section>
              )}
              {jobId && (
                <>
                  {jobLoading && !job && (
                    <p role="status" className="text-sm text-slate-600">
                      Cargando importación…
                    </p>
                  )}
                  {Boolean(jobError) && (
                    <div
                      role="alert"
                      className="space-y-2 rounded-xl bg-red-50 p-4 text-sm text-red-900"
                    >
                      <p>
                        No se pudo actualizar el estado:{" "}
                        {errorMessage(jobError)}
                      </p>
                      <button
                        type="button"
                        className={secondary}
                        onClick={() => void refreshJob()}
                      >
                        Actualizar estado
                      </button>
                    </div>
                  )}
                  {job && <VoterImportJobReview job={job} />}
                  {job?.status === "READY" && job.validRows > 0 && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                      <span>
                        Al continuar se importarán sólo las{" "}
                        {job.validRows.toLocaleString("es-CO")} personas nuevas
                        listas; las filas con errores y las ya existentes no se
                        importarán. Cada nueva persona debe tener su
                        autorización y evidencia verificadas.
                      </span>
                    </div>
                  )}
                </>
              )}
              <details
                className="rounded-xl border border-slate-200 p-4"
                open={!jobId && !csvFile}
              >
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  Importaciones recientes · volver a una carga
                </summary>
                <p className="my-3 text-sm leading-6 text-slate-600">
                  Las revisiones y las importaciones continúan aunque cierres la
                  ventana. Elige una para consultar su resultado.
                </p>
                {history.loading && (
                  <p role="status" className="text-sm text-slate-600">
                    Cargando importaciones…
                  </p>
                )}
                {Boolean(history.error) && (
                  <div role="alert" className="space-y-2 text-sm text-red-900">
                    <p>{errorMessage(history.error)}</p>
                    <button
                      type="button"
                      className={secondary}
                      onClick={() => void history.refresh()}
                    >
                      Reintentar historial
                    </button>
                  </div>
                )}
                {history.data && (
                  <>
                    {history.data.items.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        Todavía no hay importaciones.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-200">
                        {history.data.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-col items-start gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="break-all text-sm font-semibold text-slate-900">
                                {item.fileName}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                {new Date(item.createdAt).toLocaleString(
                                  "es-CO",
                                )}{" "}
                                · {VOTER_IMPORT_STATUS_LABELS[item.status]} ·{" "}
                                {item.importedRows.toLocaleString("es-CO")}{" "}
                                {item.importedRows === 1 ? "importada" : "importadas"}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              className={`${secondary} w-full shrink-0 sm:w-auto`}
                              aria-label={`Ver resultado de ${item.fileName}`}
                              onClick={() => selectJob(item)}
                            >
                              Ver resultado
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        className={secondary}
                        disabled={busy || history.loading || historyPage <= 1}
                        onClick={() => setHistoryPage((value) => value - 1)}
                      >
                        Más recientes
                      </button>
                      <p className="text-xs text-slate-600">
                        Página {history.data.pagination.page} de{" "}
                        {Math.max(1, history.data.pagination.totalPages)}
                      </p>
                      <button
                        type="button"
                        className={secondary}
                        disabled={
                          busy ||
                          history.loading ||
                          historyPage >= history.data.pagination.totalPages
                        }
                        onClick={() => setHistoryPage((value) => value + 1)}
                      >
                        Anteriores
                      </button>
                    </div>
                  </>
                )}
              </details>
            </div>
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white p-3 sm:px-6">
              {job && !isVoterImportJobRunning(job) && (
                <button
                  type="button"
                  disabled={busy}
                  className={secondary}
                  onClick={chooseCorrectedFile}
                >
                  {job.errorRows > 0
                    ? "Revisar archivo corregido"
                    : "Elegir otro archivo"}
                </button>
              )}
              {busy && progress && (
                <button
                  type="button"
                  className={secondary}
                  onClick={cancelPreparation}
                >
                  Detener preparación
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                className={secondary}
                onClick={closeDialog}
              >
                {job && isVoterImportJobRunning(job)
                  ? "Cerrar y volver después"
                  : "Cerrar"}
              </button>
              {!jobId && (
                <button
                  type="button"
                  disabled={
                    busy || !csvFile || !options.data || Boolean(options.error)
                  }
                  className={primary}
                  onClick={() => void prepare()}
                >
                  {busy && (
                    <Loader2
                      size={16}
                      aria-hidden="true"
                      className="animate-spin"
                    />
                  )}
                  {pendingCreate ? "Recuperar revisión" : "Revisar archivo"}
                </button>
              )}
              {job?.status === "READY" && job.validRows > 0 && (
                <button
                  type="button"
                  disabled={!canExecute}
                  className={primary}
                  onClick={() => void actOnJob("execute")}
                >
                  Importar sólo {job.validRows.toLocaleString("es-CO")}{" "}
                  {job.validRows === 1 ? "persona lista" : "personas listas"}
                </button>
              )}
              {job?.status === "FAILED" && job.canRetry && (
                <button
                  type="button"
                  disabled={busy || jobLoading || Boolean(jobError)}
                  className={primary}
                  onClick={() => void actOnJob("retry")}
                >
                  Retomar importación
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
