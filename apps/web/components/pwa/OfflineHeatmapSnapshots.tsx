"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  Clock3,
  MapPinned,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import {
  territoryHeatmapSnapshotKey,
  type TerritoryHeatmapSnapshot,
} from "@/lib/territory-heatmap";

interface OfflineHeatmapSnapshotsProps {
  snapshots: TerritoryHeatmapSnapshot[];
  isOnline: boolean;
}

const LEVEL_LABELS = {
  DEPARTAMENTO: "Departamentos",
  MUNICIPIO: "Municipios",
  ZONA: "Zonas",
  PUESTO: "Puestos",
} as const;

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(timestamp));
}

export function OfflineHeatmapSnapshots({
  snapshots,
  isOnline,
}: OfflineHeatmapSnapshotsProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = useMemo(
    () =>
      snapshots.find(
        (snapshot) =>
          territoryHeatmapSnapshotKey(snapshot.query) === selectedKey,
      ) ?? null,
    [selectedKey, snapshots],
  );

  return (
    <section
      aria-labelledby="offline-heatmaps-title"
      className="rounded-2xl border border-amber-300 bg-amber-50 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-900">
            <WifiOff aria-hidden="true" size={15} /> MODO OFFLINE
          </p>
          <h3
            id="offline-heatmaps-title"
            className="mt-1 text-sm font-black text-slate-950"
          >
            Mapas de calor guardados ({snapshots.length})
          </h3>
        </div>
        <span className="rounded-full border border-amber-300 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-900">
          Bóveda desbloqueada
        </span>
      </div>

      <p className="mt-3 text-xs font-semibold leading-5 text-amber-950">
        Estas son copias agregadas cifradas de cortes anteriores. Pueden estar
        desactualizadas y abrirlas no consulta al servidor, incluso cuando el
        dispositivo indique conexión.
      </p>

      {snapshots.length === 0 ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-white/70 p-3 text-xs leading-5 text-slate-600">
          No hay mapas guardados para esta partición de tenant y usuario. Deben
          guardarse de forma explícita desde Territorio mientras hay conexión.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {snapshots.map((snapshot) => {
            const key = territoryHeatmapSnapshotKey(snapshot.query);
            const expanded = key === selectedKey;
            const scope = snapshot.response.parent?.name ?? "Nivel nacional";
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={
                    expanded ? "offline-heatmap-detail" : undefined
                  }
                  onClick={() => setSelectedKey(expanded ? null : key)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-left text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
                >
                  <span>
                    <span className="block text-xs font-black">
                      {snapshot.response.metric.label}
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-600">
                      {LEVEL_LABELS[snapshot.query.level]} · {scope} · guardado{" "}
                      {formatTimestamp(snapshot.savedAt)}
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    size={16}
                    className={`shrink-0 transition ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <article
          id="offline-heatmap-detail"
          aria-label={`Snapshot offline: ${selected.response.metric.label}`}
          className="mt-4 rounded-xl border-2 border-amber-400 bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-black text-slate-950">
                <MapPinned aria-hidden="true" size={17} />
                {selected.response.metric.label}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                {LEVEL_LABELS[selected.query.level]} ·{" "}
                {selected.response.parent?.name ?? "Nivel nacional"}
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-900">
              {isOnline ? "Copia local" : "Sin conexión"}
            </span>
          </div>

          <div className="mt-3 space-y-1 text-[11px] font-semibold text-slate-600">
            <p className="flex items-center gap-2">
              <Clock3 aria-hidden="true" size={14} /> Corte del servidor:{" "}
              <time dateTime={selected.response.generatedAt}>
                {formatTimestamp(selected.response.generatedAt)}
              </time>
            </p>
            <p>
              Copia guardada:{" "}
              <time dateTime={selected.savedAt}>
                {formatTimestamp(selected.savedAt)}
              </time>
            </p>
          </div>

          {selected.response.items.length === 0 ? (
            <p className="mt-4 text-xs text-slate-600">
              El corte guardado no contiene territorios visibles.
            </p>
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {selected.response.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                    {item.type} · {item.code}
                  </p>
                  <p className="mt-1 text-xs font-black text-slate-950">
                    {item.name}
                  </p>
                  <p className="mt-2 text-base font-black text-blue-900">
                    {item.suppressed ? "Dato protegido" : item.displayValue}
                  </p>
                  {selected.query.metric === "E14_COVERAGE" && (
                    <p className="mt-1 text-[11px] text-slate-600">
                      {item.operationalContext.acceptedTables.toLocaleString(
                        "es-CO",
                      )} de{" "}
                      {item.operationalContext.expectedTables.toLocaleString(
                        "es-CO",
                      )} mesas configuradas
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 flex items-start gap-2 border-t border-slate-200 pt-3 text-[11px] font-semibold leading-5 text-slate-600">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-emerald-700"
              size={15}
            />
            {selected.response.privacy.rule}
          </p>
        </article>
      )}
    </section>
  );
}
