"use client";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { exportModuleAsCsv } from "@/lib/export-api";

export function ExportButton({ moduleName, label = "Exportar CSV" }: { moduleName: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      await exportModuleAsCsv(moduleName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al exportar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handleExport}
        disabled={loading}
        aria-busy={loading}
        aria-label={label}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 focus-ring"
      >
        {loading ? <Loader2 className="animate-spin" size={16} role="status" aria-label="Cargando" /> : <Download size={16} />}
        {label}
      </button>
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </>
  );
}
