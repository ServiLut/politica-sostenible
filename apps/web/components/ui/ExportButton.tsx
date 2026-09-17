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
    <>
      <button
        type="button"
        onClick={handleExport}
        disabled={loading || !capability.enabled}
        aria-busy={loading || capability.status === "checking"}
        aria-describedby={
          capability.reason ? capabilityMessageId : undefined
        }
        aria-label={label}
        title={capability.reason ?? undefined}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 focus-ring"
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
      {capability.reason && capability.status !== "checking" && (
        <p
          id={capabilityMessageId}
          className={
            capability.status === "error"
              ? "mt-1 text-xs font-semibold text-red-700"
              : "mt-1 text-xs font-semibold text-amber-800"
          }
          role={capability.status === "error" ? "alert" : "status"}
        >
          {capability.reason}{" "}
          {capability.status === "error" && (
            <button
              type="button"
              onClick={capability.refresh}
              aria-label="Reintentar validación del plan de exportación"
              className="font-black underline underline-offset-2"
            >
              Reintentar
            </button>
          )}
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
