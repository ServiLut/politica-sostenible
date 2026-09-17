"use client";

import { CalendarClock, CloudOff, Download, Loader2 } from "lucide-react";
import { useOfflineVault } from "@/context/offline-vault";

export function OfflineCalendarSnapshot() {
  const vault = useOfflineVault();
  const snapshot = vault.electoralCalendarSnapshot;

  async function provision() {
    try {
      await vault.provisionCalendarSnapshot();
    } catch {
      // El proveedor presenta el fallo sin imprimir el contenido del calendario.
    }
  }

  return (
    <section
      aria-labelledby="offline-calendar-title"
      className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4"
    >
      <div className="flex items-start gap-3">
        <CalendarClock
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-indigo-700"
          size={18}
        />
        <div className="min-w-0 flex-1">
          <h3 id="offline-calendar-title" className="text-sm font-black">
            Calendario electoral offline
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            Copia cifrada y estrictamente de solo lectura de una versión ACTIVE.
            No reemplaza el calendario vivo ni sincroniza alertas.
          </p>
        </div>
      </div>

      {!snapshot ? (
        <p className="mt-3 text-xs leading-5 text-slate-700">
          No hay una versión guardada. Conéctate para copiar la release ACTIVE
          antes de salir a campo.
        </p>
      ) : (
        <div className="mt-4">
          <dl className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <dt className="font-bold text-slate-500">Versión / ronda</dt>
              <dd className="mt-0.5 font-black text-slate-900">
                {snapshot.versionLabel} · {snapshot.roundCode}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">Zona de referencia</dt>
              <dd className="mt-0.5 font-black text-slate-900">
                {snapshot.timeZone}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">Corte de fuente</dt>
              <dd className="mt-0.5 font-black text-slate-900">
                {new Date(snapshot.sourceCutoffAt).toLocaleString("es-CO")}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">Copia guardada</dt>
              <dd className="mt-0.5 font-black text-slate-900">
                {new Date(snapshot.savedAt).toLocaleString("es-CO")}
              </dd>
            </div>
          </dl>
          <p className="mt-3 break-all rounded-lg bg-white p-2 font-mono text-[9px] text-slate-600">
            releaseId {snapshot.releaseId} · SHA-256 {snapshot.sourceSha256}
          </p>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {snapshot.milestones.map((milestone) => (
              <article
                key={milestone.id}
                className="rounded-xl border border-indigo-100 bg-white p-3"
              >
                <p className="text-xs font-black text-slate-950">
                  {milestone.title}
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  {milestone.localDate}
                  {milestone.localTime
                    ? ` · ${milestone.localTime}`
                    : ""} · {milestone.timeZone}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                  {milestone.category} · {milestone.semantics}
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  Responsable: {milestone.responsibleName ?? "Sin asignar"} ·
                  Suplente: {milestone.backupName ?? "Sin asignar"}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] font-semibold leading-5 text-indigo-900">
            <CloudOff aria-hidden="true" className="mt-0.5" size={13} />
            {vault.isOnline
              ? "Estás viendo el corte cifrado guardado, no la versión viva; con conexión puedes actualizarlo explícitamente."
              : "Sin conexión: estás viendo el corte cifrado guardado, no la versión viva."}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void provision()}
        disabled={vault.busy || !vault.isOnline}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {vault.busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={15} />
        ) : (
          <Download aria-hidden="true" size={15} />
        )}
        {snapshot ? "Actualizar copia ACTIVE" : "Guardar calendario ACTIVE"}
      </button>
    </section>
  );
}
