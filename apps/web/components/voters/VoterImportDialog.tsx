"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { uploadFileDirectly } from "@/lib/direct-storage-upload";
import {
  executeVoterImport,
  getVoterImportTemplate,
  previewVoterImport,
  type VoterImportExecutionResult,
  type VoterImportPreview,
  type VoterImportPreviewStatus,
} from "@/lib/import-api";
import {
  adaptVoterImportTemplate,
  applyVoterImportEvidencePaths,
  inspectVoterImportCsv,
  matchVoterImportEvidence,
} from "@/lib/voter-import";

type AccessState = "checking" | "available" | "unavailable" | "error";

interface VoterImportDialogProps {
  enabled: boolean;
  noticeActivatedAt: string | null;
  noticeVersion: string | null;
  onCompleted(result: VoterImportExecutionResult): void;
}

const STATUS_LABELS: Record<VoterImportPreviewStatus, string> = {
  new: "Nueva",
  duplicate_file: "Duplicada en archivo",
  duplicate_db: "Ya existe",
};
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function maskedDocument(documentId: string): string {
  const visible = documentId.slice(-4);
  return `${"•".repeat(Math.max(0, documentId.length - visible.length))}${visible}`;
}

export function VoterImportDialog({
  enabled,
  noticeActivatedAt,
  noticeVersion,
  onCompleted,
}: VoterImportDialogProps) {
  const [accessState, setAccessState] = useState<AccessState>("checking");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [template, setTemplate] = useState<Blob | null>(null);
  const [open, setOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<VoterImportPreview | null>(null);
  const [preparedCsv, setPreparedCsv] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [completed, setCompleted] =
    useState<VoterImportExecutionResult | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const closeDialogActionRef = useRef<() => void>(() => undefined);
  const uploadedPathsRef = useRef(new Map<string, string>());
  busyRef.current = preparing || executing;

  const checkAccess = useCallback(async (signal?: AbortSignal) => {
    setAccessState("checking");
    setAccessError(null);
    try {
      const downloadedTemplate = await getVoterImportTemplate(signal);
      if (signal?.aborted) return;
      if (!noticeVersion) {
        throw new Error("No hay una versión activa del aviso de privacidad.");
      }
      const compatibleTemplate = adaptVoterImportTemplate(
        await downloadedTemplate.text(),
        noticeVersion,
        noticeActivatedAt ?? undefined,
      );
      setTemplate(
        new Blob([compatibleTemplate], { type: "text/csv;charset=utf-8" }),
      );
      setAccessState("available");
    } catch (requestError: unknown) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        return;
      }
      if (requestError instanceof ApiError && requestError.status === 403) {
        setAccessState("unavailable");
      } else {
        setAccessState("error");
      }
      setAccessError(
        readableError(
          requestError,
          "No fue posible validar el acceso a la importación.",
        ),
      );
    }
  }, [noticeActivatedAt, noticeVersion]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void checkAccess(controller.signal);
    return () => controller.abort();
  }, [checkAccess, enabled]);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : triggerRef.current;
    const animationFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          closeDialogActionRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          !element.hasAttribute("hidden"),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  function clearWorkflow(clearInputs = true) {
    setPreview(null);
    setPreparedCsv(null);
    setConfirmed(false);
    setProgress(null);
    setError(null);
    setWarning(null);
    setCompleted(null);
    uploadedPathsRef.current.clear();
    if (clearInputs) {
      setCsvFile(null);
      setEvidenceFiles([]);
      if (csvInputRef.current) csvInputRef.current.value = "";
      if (evidenceInputRef.current) evidenceInputRef.current.value = "";
    }
  }

  function closeDialog() {
    if (preparing || executing) return;
    setOpen(false);
    clearWorkflow();
  }
  closeDialogActionRef.current = closeDialog;

  function handleCsvChange(file: File | null) {
    clearWorkflow(false);
    setCsvFile(file);
  }

  function handleEvidenceChange(files: File[]) {
    clearWorkflow(false);
    setEvidenceFiles(files);
  }

  function downloadTemplate() {
    if (!template) return;
    const url = URL.createObjectURL(template);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "plantilla_personas.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function generatePreview() {
    if (!csvFile) {
      setError("Selecciona primero el archivo CSV diligenciado.");
      return;
    }
    if (evidenceFiles.length === 0) {
      setError("Selecciona las evidencias referenciadas por el CSV.");
      return;
    }

    setPreparing(true);
    setError(null);
    setWarning(null);
    setPreview(null);
    setPreparedCsv(null);
    setConfirmed(false);
    setCompleted(null);

    try {
      setProgress("Leyendo y validando la estructura del CSV…");
      const sourceCsv = await csvFile.text();
      const inspection = inspectVoterImportCsv(sourceCsv);
      const evidencePlan = matchVoterImportEvidence(
        inspection,
        evidenceFiles,
      );
      if (evidencePlan.unusedFileNames.length > 0) {
        setWarning(
          `${evidencePlan.unusedFileNames.length} archivo(s) no están referenciados en el CSV y no se subirán.`,
        );
      }

      for (let index = 0; index < evidencePlan.matches.length; index += 1) {
        const match = evidencePlan.matches[index];
        if (uploadedPathsRef.current.has(match.reference)) continue;
        setProgress(
          `Subiendo evidencia ${index + 1} de ${evidencePlan.matches.length}: ${match.file.name}`,
        );
        const confirmation = await uploadFileDirectly(match.file, "consent");
        uploadedPathsRef.current.set(match.reference, confirmation.path);
      }

      setProgress("Validando personas y evidencias con el servidor…");
      const nextPreparedCsv = applyVoterImportEvidencePaths(
        sourceCsv,
        uploadedPathsRef.current,
      );
      const nextPreview = await previewVoterImport(nextPreparedCsv);
      setPreparedCsv(nextPreparedCsv);
      setPreview(nextPreview);
    } catch (requestError: unknown) {
      setPreview(null);
      setPreparedCsv(null);
      setConfirmed(false);
      setError(
        readableError(
          requestError,
          "No fue posible generar la vista previa de importación.",
        ),
      );
    } finally {
      setProgress(null);
      setPreparing(false);
    }
  }

  async function executeImport() {
    if (!preparedCsv || !preview || preview.errorRows.length > 0 || !confirmed) {
      return;
    }
    setExecuting(true);
    setError(null);
    try {
      const result = await executeVoterImport(preparedCsv);
      setCompleted(result);
      setConfirmed(false);
      onCompleted(result);
    } catch (requestError: unknown) {
      setPreview(null);
      setPreparedCsv(null);
      setConfirmed(false);
      setError(
        readableError(
          requestError,
          "No fue posible ejecutar la importación. Genera una vista previa nueva antes de reintentar.",
        ),
      );
    } finally {
      setExecuting(false);
    }
  }

  const busy = preparing || executing;
  const canExecute = Boolean(
    preview &&
      preparedCsv &&
      preview.validRows > 0 &&
      preview.errorRows.length === 0 &&
      confirmed &&
      !busy &&
      !completed,
  );

  return (
    <>
      {accessState === "error" && enabled ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => void checkAccess()}
          title={accessError ?? undefined}
          className="inline-flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-xs font-black uppercase tracking-wider text-amber-900"
        >
          <RotateCcw aria-hidden="true" size={15} /> Reintentar importación
        </button>
      ) : (
        <button
          type="button"
          disabled={
            !enabled ||
            accessState === "checking" ||
            accessState === "unavailable"
          }
          title={
            !enabled
              ? "Se requiere un aviso de privacidad activo."
              : accessError ?? undefined
          }
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-xs font-black uppercase tracking-wider text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {accessState === "checking" && enabled ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={15} />
          ) : (
            <FileUp aria-hidden="true" size={15} />
          )}
          {accessState === "unavailable"
            ? "Importación no incluida"
            : "Importar CSV"}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-5">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="voter-import-title"
            aria-describedby="voter-import-description"
            tabIndex={-1}
            className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-5 sm:px-7">
              <div>
                <div className="mb-3 inline-flex rounded-xl bg-blue-50 p-2 text-blue-700">
                  <FileSpreadsheet aria-hidden="true" size={21} />
                </div>
                <h2
                  id="voter-import-title"
                  className="text-2xl font-black text-slate-950"
                >
                  Importar personas autorizadas
                </h2>
                <p
                  id="voter-import-description"
                  className="mt-2 max-w-2xl text-sm leading-6 text-slate-500"
                >
                  La evidencia viaja directamente al almacenamiento privado. El
                  API recibe únicamente el CSV con las rutas confirmadas por el
                  servidor.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Cerrar importación"
                disabled={busy}
                onClick={closeDialog}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="space-y-6 p-5 sm:p-7">
              <section className="grid gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="font-black">1. Descarga y completa la plantilla</p>
                  <p className="mt-1">
                    Usa la versión de aviso <strong>{noticeVersion}</strong>. En
                    “Ruta evidencia” escribe el nombre exacto de cada PDF o
                    imagen; no escribas rutas del servidor ni identificadores de
                    organización. Sustituye la fecha de ejemplo por la fecha real
                    de autorización en formato ISO 8601 UTC.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  disabled={!template || busy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-800 px-4 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                >
                  <Download aria-hidden="true" size={16} /> Descargar plantilla
                </button>
              </section>

              {!completed && (
                <section className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    2. Archivo CSV
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      disabled={busy || preview !== null}
                      onChange={(event) =>
                        handleCsvChange(event.target.files?.[0] ?? null)
                      }
                      className="block min-h-12 w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold normal-case tracking-normal text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-black"
                    />
                    <span className="block text-[11px] font-semibold normal-case tracking-normal text-slate-500">
                      {csvFile?.name ?? "Máximo 500 filas y 100.000 caracteres."}
                    </span>
                  </label>

                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    3. Evidencias de consentimiento
                    <input
                      ref={evidenceInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      disabled={busy || preview !== null}
                      onChange={(event) =>
                        handleEvidenceChange(Array.from(event.target.files ?? []))
                      }
                      className="block min-h-12 w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold normal-case tracking-normal text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-black"
                    />
                    <span className="block text-[11px] font-semibold normal-case tracking-normal text-slate-500">
                      {evidenceFiles.length > 0
                        ? `${evidenceFiles.length} archivo(s) seleccionado(s).`
                        : "PDF, JPG, PNG o WEBP; 15 MB por archivo, máximo 30 por lote."}
                    </span>
                  </label>
                </section>
              )}

              {warning && (
                <div
                  role="status"
                  className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900"
                >
                  {warning}
                </div>
              )}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
                >
                  <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
                  <p>{error}</p>
                </div>
              )}
              {progress && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-900"
                >
                  <Loader2 aria-hidden="true" className="animate-spin" size={18} />
                  {progress}
                </div>
              )}

              {completed && (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
                  <CheckCircle2 aria-hidden="true" size={28} />
                  <h3 className="mt-3 text-xl font-black">
                    Importación completada
                  </h3>
                  <p className="mt-2 text-sm font-semibold">
                    {completed.imported} persona(s) importada(s) y {completed.skipped}{" "}
                    registro(s) omitido(s).
                  </p>
                </section>
              )}

              {preview && !completed && (
                <section className="space-y-5" aria-label="Vista previa de importación">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    {[
                      ["Filas", preview.totalRows],
                      ["Listas", preview.validRows],
                      ["Errores", preview.errorRows.length],
                      ["Duplicadas archivo", preview.duplicatesInFile],
                      ["Ya existentes", preview.duplicatesInDatabase],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          {label}
                        </p>
                        <p className="mt-1 text-2xl font-black text-slate-900">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {preview.errorRows.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-red-200">
                      <div className="bg-red-50 px-5 py-3 text-sm font-black text-red-900">
                        Corrige estos errores y genera otra vista previa
                      </div>
                      <ul className="max-h-52 divide-y divide-red-100 overflow-y-auto bg-white">
                        {preview.errorRows.map((item, index) => (
                          <li
                            key={`${item.row}-${item.field}-${index}`}
                            className="px-5 py-3 text-sm text-red-800"
                          >
                            <strong>Fila {item.row} · {item.field}:</strong>{" "}
                            {item.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Persona</th>
                          <th className="px-4 py-3">Documento</th>
                          <th className="px-4 py-3">Resultado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {preview.preview.slice(0, 50).map((item, index) => (
                          <tr key={`${item.documentId}-${index}`}>
                            <td className="px-4 py-3 font-bold text-slate-900">
                              {item.firstName} {item.lastName}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-600">
                              {maskedDocument(item.documentId)}
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-700">
                              {STATUS_LABELS[item.status]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.preview.length > 50 && (
                      <p className="border-t border-slate-100 px-4 py-3 text-xs font-semibold text-slate-500">
                        Se muestran 50 de {preview.preview.length} resultados.
                      </p>
                    )}
                  </div>

                  {preview.errorRows.length === 0 && preview.validRows > 0 && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold leading-6 text-emerald-950">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        disabled={busy}
                        onChange={(event) => setConfirmed(event.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 accent-emerald-700"
                      />
                      <span>
                        Confirmo que las {preview.validRows} persona(s) otorgaron
                        autorización expresa bajo el aviso {noticeVersion}, y que
                        cada evidencia corresponde a su fila.
                      </span>
                    </label>
                  )}
                </section>
              )}

              <footer className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                {preview && !completed && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => clearWorkflow()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-50"
                  >
                    <RotateCcw aria-hidden="true" size={15} /> Cambiar archivos
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={closeDialog}
                  className="min-h-11 rounded-xl border border-slate-200 px-5 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-50"
                >
                  {completed ? "Cerrar" : "Cancelar"}
                </button>
                {!preview && !completed && (
                  <button
                    type="button"
                    disabled={busy || !csvFile || evidenceFiles.length === 0}
                    onClick={() => void generatePreview()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-800 px-6 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    {preparing ? (
                      <Loader2 aria-hidden="true" className="animate-spin" size={16} />
                    ) : (
                      <ShieldCheck aria-hidden="true" size={16} />
                    )}
                    Subir y validar
                  </button>
                )}
                {preview && !completed && (
                  <button
                    type="button"
                    disabled={!canExecute}
                    onClick={() => void executeImport()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-xs font-black uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {executing ? (
                      <Loader2 aria-hidden="true" className="animate-spin" size={16} />
                    ) : (
                      <CheckCircle2 aria-hidden="true" size={16} />
                    )}
                    Confirmar e importar
                  </button>
                )}
              </footer>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
