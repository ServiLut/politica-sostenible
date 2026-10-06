"use client";
import { useId, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { usePlanCapability } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import { exportModuleAsCsv } from "@/lib/export-api";

export function ExportButton({
  moduleName,
  label = "Exportar CSV",
}: {
  moduleName: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capability = usePlanCapability("export");
  const capabilityMessageId = useId();
  const exportErrorId = `${capabilityMessageId}-export-error`;
  const showCapabilityReason = Boolean(
    capability.reason && capability.status !== "checking",
  );

  async function handleExport() {
    if (!capability.enabled) return;
    setLoading(true);
    setError(null);
    try {
      await exportModuleAsCsv(moduleName);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        capability.refresh();
      }
      setError(err instanceof Error ? err.message : "Error al exportar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex min-w-0 max-w-full flex-col items-stretch gap-1.5 sm:max-w-xs ${showCapabilityReason || error ? "w-full sm:w-auto" : "w-auto"}`}
    >
      <button
        type="button"
        onClick={handleExport}
        disabled={loading || !capability.enabled}
        aria-busy={loading || capability.status === "checking"}
        aria-describedby={[
          showCapabilityReason ? capabilityMessageId : null,
          error ? exportErrorId : null,
        ].filter(Boolean).join(" ") || undefined}
        aria-label={label}
        title={capability.reason ?? undefined}
        className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 whitespace-normal rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed focus-ring [&_svg]:shrink-0"
      >
        {loading || capability.status === "checking" ? (
          <Loader2
            aria-hidden="true"
            className="animate-spin"
            size={16}
          />
        ) : (
          <Download aria-hidden="true" size={16} />
        )}
        {capability.status === "checking"
          ? "Validando plan…"
          : capability.status === "unavailable"
            ? "Exportación no incluida"
            : capability.status === "error"
              ? "Exportación no disponible"
              : loading
                ? "Exportando…"
                : label}
      </button>
      {showCapabilityReason && (
        <p
          id={capabilityMessageId}
          className={
            capability.status === "error"
              ? "min-w-0 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-900"
              : "min-w-0 break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700"
          }
          role={capability.status === "error" ? "alert" : "status"}
        >
          {capability.reason}{" "}
          {capability.status === "error" && (
            <button
              type="button"
              onClick={capability.refresh}
              aria-label="Reintentar validación del plan de exportación"
              className="mt-1 inline-flex min-h-11 items-center rounded-lg px-2 font-semibold underline underline-offset-2 focus-ring"
            >
              Reintentar
            </button>
          )}
        </p>
      )}
      {error && (
        <p id={exportErrorId} className="min-w-0 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-900" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
