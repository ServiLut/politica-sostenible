"use client";

import { useCallback, useState } from "react";
import { Download } from "lucide-react";
import {
  downloadVoterImportErrors,
  getVoterImportJobErrors,
  type VoterImportJob,
} from "@/lib/import-api";
import { usePageRequest } from "@/lib/use-page-request";
import {
  isVoterImportJobRunning,
  voterImportCounts,
  voterImportProgress,
  VOTER_IMPORT_STATUS_LABELS,
} from "@/lib/voter-import-job";

export function saveVoterImportDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to resolve the download before releasing its bytes.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const buttonClass =
  "min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50";

export function VoterImportJobReview({ job }: { job: VoterImportJob }) {
  const progress = voterImportProgress(job);
  return (
    <section
      aria-label="Revisión de la importación"
      className="min-w-0 space-y-4"
    >
      <div
        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
        role="status"
      >
        <h3 className="font-semibold text-slate-900">
          {VOTER_IMPORT_STATUS_LABELS[job.status]}
        </h3>
        <p className="mt-1 break-all text-sm text-slate-600">{job.fileName}</p>
        {isVoterImportJobRunning(job) && (
          <div className="mt-3 space-y-2">
            {progress && (
              <progress
                aria-label={
                  job.progress.phase === "validation"
                    ? "Filas revisadas"
                    : "Filas procesadas"
                }
                value={progress.value}
                max={progress.max}
                className="h-2 w-full"
              />
            )}
            <p className="text-sm text-slate-700">
              {job.progress.total === null
                ? "Preparando la revisión del archivo…"
                : `${job.progress.processed.toLocaleString("es-CO")} de ${job.progress.total.toLocaleString("es-CO")} filas procesadas.`}{" "}
              Puedes cerrar esta ventana y volver desde Importaciones recientes.
            </p>
          </div>
        )}
      </div>
      {(job.status === "QUEUED" || job.status === "VALIDATING") && (
        <p className="text-sm text-slate-600">
          Revisión en curso: los conteos son parciales hasta que aparezca
          «Revisión lista».
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {voterImportCounts(job).map(({ label, value }) => (
          <div
            key={label}
            className="min-w-0 rounded-xl border border-slate-200 p-3"
          >
            <dt className="text-xs font-semibold text-slate-600">{label}</dt>
            <dd className="mt-1 break-words text-2xl font-semibold text-slate-900">
              {value.toLocaleString("es-CO")}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm leading-6 text-slate-600">
        Las personas que ya existen se omiten sin modificarlas. Los documentos o
        evidencias repetidos dentro del archivo se incluyen en «Filas con
        errores». Una fila con varios errores se cuenta una sola vez.
      </p>
      {job.status === "FAILED" && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {job.lastErrorMessage ||
            "La importación no pudo terminar. Revisa el resultado antes de continuar."}
          {job.importedRows > 0 &&
            ` Ya ${job.importedRows === 1 ? "se guardó 1 persona" : `se guardaron ${job.importedRows.toLocaleString("es-CO")} personas`}; el resultado parcial se conserva.`}
        </p>
      )}
      {job.status === "COMPLETED" && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
        >
          {job.importedRows === 1
            ? "Se guardó 1 persona."
            : `Se guardaron ${job.importedRows.toLocaleString("es-CO")} personas.`}{" "}
          {job.errorRows > 0
            ? "Las filas con errores no se importaron; puedes corregirlas y revisarlas en otro archivo."
            : "Puedes encontrarlas en el listado de Personas."}
        </p>
      )}
      {job.errorRows > 0 && <ImportErrors key={job.id} job={job} />}
    </section>
  );
}

function ImportErrors({ job }: { job: VoterImportJob }) {
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const request = useCallback(
    (signal: AbortSignal) => getVoterImportJobErrors(job.id, page, signal),
    [job.id, page],
  );
  const { data, loading, error, refresh } = usePageRequest(request, {
    reloadKey: job.errorRows,
  });
  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      saveVoterImportDownload(
        await downloadVoterImportErrors(job.id),
        "personas_por_corregir.csv",
      );
    } catch (cause) {
      setDownloadError(
        cause instanceof Error
          ? cause.message
          : "No se pudo descargar el archivo. Intenta de nuevo.",
      );
    } finally {
      setDownloading(false);
    }
  }
  return (
    <section
      aria-label="Filas por corregir"
      className="space-y-3 rounded-xl border border-amber-200 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">
          {job.errorRows.toLocaleString("es-CO")}{" "}
          {job.errorRows === 1 ? "fila" : "filas"} por corregir
        </h3>
        <button
          type="button"
          className={`${buttonClass} inline-flex items-center gap-2`}
          disabled={downloading}
          onClick={() => void download()}
        >
          <Download size={16} aria-hidden="true" />
          {downloading ? "Descargando…" : "Descargar filas con errores"}
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Corrige este CSV en Excel y elige «Revisar archivo corregido». No tienes
        que borrar las columnas de ayuda ni adjuntar otra vez las evidencias ya
        guardadas. El resultado anterior se conserva.
      </p>
      {downloadError && (
        <p role="alert" className="text-sm text-red-800">
          {downloadError}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm text-slate-600">
          Cargando errores…
        </p>
      )}
      {Boolean(error) && (
        <div role="alert" className="space-y-2 text-sm text-red-800">
          <p>
            {error instanceof Error
              ? error.message
              : "No se pudieron consultar los errores."}
          </p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => void refresh()}
          >
            Reintentar errores
          </button>
        </div>
      )}
      {data && (
        <>
          <ul className="divide-y divide-amber-100 text-sm">
            {data.items.map((row) => (
              <li key={row.row} className="py-3">
                <p className="font-semibold text-slate-900">Fila {row.row}</p>
                <ul className="mt-1 list-inside list-disc space-y-1 text-slate-700">
                  {row.errors.map((item, index) => (
                    <li key={`${item.field}-${index}`}>
                      <strong>{item.field}:</strong> {item.message}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={loading || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </button>
            <p className="text-sm text-slate-600">
              Página {data.pagination.page} de{" "}
              {Math.max(1, data.pagination.totalPages)}
            </p>
            <button
              type="button"
              className={buttonClass}
              disabled={loading || page >= data.pagination.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </section>
  );
}
