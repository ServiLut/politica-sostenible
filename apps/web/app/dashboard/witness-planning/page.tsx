"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, Users } from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import { listVotingPlaces, type VotingPlace } from "@/lib/election-api";
import {
  cancelWitnessAssignment,
  confirmWitnessAssignment,
  createWitnessAssignment,
  createWitnessCoverageWindow,
  getWitnessCoverage,
  listWitnessAssignments,
  listWitnessCandidates,
  listWitnessCoverageWindows,
  reassignWitnessAssignment,
  type WitnessAssignment,
  type WitnessCandidate,
  type WitnessCaptureContext,
  type WitnessCoverageResponse,
  type WitnessCoverageWindow,
} from "@/lib/witness-planning-api";
import type { BackendUserRole } from "@/types/saas-schema";

const PLANNER_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "ZONE_COORDINATOR",
]);

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error && error.message
    ? error.message
    : "No fue posible completar la operación.";
}

export function instantFromLocal(
  localDateTime: string,
  utcOffsetMinutes: number,
): string {
  const match = localDateTime.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
  );
  if (!match) throw new Error("Completa fecha y hora local.");
  const [, year, month, day, hour, minute] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute) - utcOffsetMinutes,
    ),
  ).toISOString();
}

export function localFromInstant(
  instant: string,
  utcOffsetMinutes: number,
): string {
  const date = new Date(new Date(instant).getTime() + utcOffsetMinutes * 60_000);
  return date.toISOString().slice(0, 16);
}

function formatInstant(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(instant));
}

function SummaryCard({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${alert ? "text-amber-700" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}

type RowAction = { kind: "CANCEL" | "REASSIGN"; assignment: WitnessAssignment } | null;

export default function WitnessPlanningPage() {
  const { user } = useAuth();
  const role = user?.backendRole;
  const isPlannerRole = Boolean(role && PLANNER_ROLES.has(role));
  const [context, setContext] = useState<WitnessCaptureContext>("REAL");
  const [coverage, setCoverage] = useState<WitnessCoverageResponse | null>(null);
  const [windows, setWindows] = useState<WitnessCoverageWindow[]>([]);
  const [assignments, setAssignments] = useState<WitnessAssignment[]>([]);
  const [candidates, setCandidates] = useState<WitnessCandidate[]>([]);
  const [places, setPlaces] = useState<VotingPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [rowAction, setRowAction] = useState<RowAction>(null);
  const [selectedWindowId, setSelectedWindowId] = useState("");

  const reload = useCallback(async (signal?: AbortSignal) => {
    const [coverageData, windowData, assignmentData, candidateData, placeData] =
      await Promise.all([
        getWitnessCoverage(context, signal),
        listWitnessCoverageWindows(context, signal),
        listWitnessAssignments(context, signal),
        isPlannerRole
          ? listWitnessCandidates(signal)
          : Promise.resolve({ items: [], truncated: false }),
        isPlannerRole
          ? listVotingPlaces({ page: 1, limit: 100 }, signal)
          : Promise.resolve({ items: [] }),
      ]);
    if (signal?.aborted) return;
    setCoverage(coverageData);
    setWindows(windowData.items);
    setAssignments(assignmentData.items);
    setCandidates(candidateData.items);
    setPlaces(placeData.items);
  }, [context, isPlannerRole]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void reload(controller.signal)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(readableError(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload, revision]);

  const canPlan = Boolean(
    isPlannerRole &&
      !coverage?.operationStage?.match(/POST_ELECTION|CLOSED/),
  );
  const selectedWindow = useMemo(
    () => windows.find(({ id }) => id === selectedWindowId) ?? null,
    [selectedWindowId, windows],
  );

  async function mutate(key: string, operation: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setNotice(message);
      setRowAction(null);
      setRevision((value) => value + 1);
    } catch (cause: unknown) {
      setError(readableError(cause));
    } finally {
      setBusy(null);
    }
  }

  function handleWindowSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const puestoId = String(data.get("puestoId") ?? "");
    const localDate = String(data.get("localDate") ?? "");
    const startsLocal = String(data.get("startsLocal") ?? "");
    const endsLocal = String(data.get("endsLocal") ?? "");
    const timeZone = String(data.get("timeZone") ?? "").trim();
    const utcOffsetMinutes = Number(data.get("utcOffsetMinutes"));
    void mutate(
      "window",
      () =>
        createWitnessCoverageWindow({
          clientRequestId: crypto.randomUUID(),
          puestoId,
          captureContext: context,
          localDate,
          startsAt: instantFromLocal(startsLocal, utcOffsetMinutes),
          endsAt: instantFromLocal(endsLocal, utcOffsetMinutes),
          timeZone,
          utcOffsetMinutes,
        }),
      "Ventana operativa registrada con trazabilidad.",
    );
  }

  function handleAssignmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWindow) return;
    const data = new FormData(event.currentTarget);
    const offset = selectedWindow.utcOffsetMinutes;
    void mutate(
      "assignment",
      () =>
        createWitnessAssignment({
          clientRequestId: crypto.randomUUID(),
          coverageWindowId: selectedWindow.id,
          witnessId: String(data.get("witnessId") ?? ""),
          puestoId: selectedWindow.puestoId,
          tableStart: Number(data.get("tableStart")),
          tableEnd: Number(data.get("tableEnd")),
          shiftStartsAt: instantFromLocal(String(data.get("shiftStartsLocal") ?? ""), offset),
          shiftEndsAt: instantFromLocal(String(data.get("shiftEndsLocal") ?? ""), offset),
          captureContext: context,
          assignmentType: String(data.get("assignmentType")) as "PRIMARY" | "BACKUP",
        }),
      "Asignación planificada. Aún debe confirmarse.",
    );
  }

  function handleRowAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rowAction) return;
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") ?? "");
    const current = rowAction.assignment;
    if (rowAction.kind === "CANCEL") {
      void mutate(
        `cancel-${current.id}`,
        () => cancelWitnessAssignment(current.id, current.version, reason),
        "Asignación cancelada; su historia permanece auditable.",
      );
      return;
    }
    void mutate(
      `reassign-${current.id}`,
      () =>
        reassignWitnessAssignment(current.id, current.version, reason, {
          coverageWindowId: current.coverageWindowId,
          witnessId: String(data.get("witnessId") ?? ""),
          puestoId: current.puestoId,
          tableStart: current.tableStart,
          tableEnd: current.tableEnd,
          shiftStartsAt: current.shiftStartsAt,
          shiftEndsAt: current.shiftEndsAt,
          captureContext: current.captureContext,
          assignmentType: current.assignmentType,
        }),
      "Reasignación completada en una sola transacción.",
    );
  }

  if (loading && !coverage) {
    return <div className="flex min-h-[40vh] items-center justify-center" role="status"><Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" /><span className="sr-only">Cargando planificación</span></div>;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Día D</p>
          <h1 className="text-3xl font-black text-slate-950">Planificación exacta de testigos</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">La cobertura sólo cuenta cuando PRIMARY y BACKUP confirmados cubren cada mesa durante toda la ventana local declarada. Una asignación parcial nunca aparece como lista.</p>
        </div>
        <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />Actualizar
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label htmlFor="capture-context" className="font-semibold">Contexto</label>
        <select id="capture-context" value={context} onChange={(event) => setContext(event.target.value as WitnessCaptureContext)} className="rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600">
          <option value="REAL">Elección real</option>
          <option value="SIMULATION">Simulacro</option>
        </select>
        <span className="text-sm text-slate-600">Etapa: {coverage?.operationStage ?? "sin dato"}</span>
      </div>

      <div aria-live="polite" className="space-y-2">
        {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900"><AlertTriangle className="mr-2 inline h-5 w-5" aria-hidden="true" />{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="mr-2 inline h-5 w-5" aria-hidden="true" />{notice}</div>}
        {!canPlan && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">Modo de consulta: tu rol o la etapa actual no permite cambiar la planificación.</div>}
      </div>

      {coverage && (
        <section aria-labelledby="coverage-title">
          <h2 id="coverage-title" className="mb-3 text-xl font-bold">Estado verificable</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <SummaryCard label="Puestos" value={coverage.summary.expectedPollingPlaces} />
            <SummaryCard label="Sin ventana" value={coverage.summary.placesWithoutCoverageWindows} alert={coverage.summary.placesWithoutCoverageWindows > 0} />
            <SummaryCard label="Mesa-jornadas" value={coverage.summary.expectedTableWindows} />
            <SummaryCard label="Huecos PRIMARY" value={coverage.summary.missingPrimaryTables} alert={coverage.summary.missingPrimaryTables > 0} />
            <SummaryCard label="Huecos BACKUP" value={coverage.summary.missingBackupTables} alert={coverage.summary.missingBackupTables > 0} />
            <SummaryCard label="Resultado" value={coverage.summary.fullyConfirmed ? "LISTO" : "BLOQUEADO"} alert={!coverage.summary.fullyConfirmed} />
          </div>
          {!coverage.summary.fullyConfirmed && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Déficit temporal confirmado: {coverage.summary.confirmedPrimaryUncoveredMinutes.toLocaleString("es-CO")} minutos-mesa PRIMARY y {coverage.summary.confirmedBackupUncoveredMinutes.toLocaleString("es-CO")} minutos-mesa BACKUP.</p>
          )}
        </section>
      )}

      {canPlan && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={handleWindowSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold"><Clock3 className="mr-2 inline h-5 w-5" aria-hidden="true" />1. Declarar jornada del puesto</h2>
            <label className="block text-sm font-semibold">Puesto<select name="puestoId" required className="mt-1 w-full rounded-lg border p-2">{places.map((place) => <option key={place.id} value={place.id}>{place.code} · {place.name}</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">Fecha local<input name="localDate" type="date" required className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="text-sm font-semibold">Zona IANA<input name="timeZone" placeholder="America/Bogota" required className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="text-sm font-semibold">Inicio local<input name="startsLocal" type="datetime-local" required className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="text-sm font-semibold">Fin local<input name="endsLocal" type="datetime-local" required className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="text-sm font-semibold">Offset UTC (minutos)<input name="utcOffsetMinutes" type="number" min={-840} max={840} required placeholder="-300" className="mt-1 w-full rounded-lg border p-2" /></label>
            </div>
            <p className="text-xs text-slate-600">La API valida fecha, zona IANA y offset contra el puesto. No se presume una jornada de 24 horas ni un horario legal universal.</p>
            <button type="submit" disabled={busy !== null || places.length === 0} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50">{busy === "window" ? "Guardando…" : "Registrar ventana"}</button>
          </form>

          <form onSubmit={handleAssignmentSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold"><Users className="mr-2 inline h-5 w-5" aria-hidden="true" />2. Asignar mesa y turno</h2>
            <label className="block text-sm font-semibold">Ventana<select name="coverageWindowId" required value={selectedWindowId} onChange={(event) => setSelectedWindowId(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Selecciona…</option>{windows.map((item) => <option key={item.id} value={item.id}>{item.puesto.code} · {item.localDate} · {formatInstant(item.startsAt, item.timeZone)}–{formatInstant(item.endsAt, item.timeZone)}</option>)}</select></label>
            <label className="block text-sm font-semibold">Testigo activo<select name="witnessId" required className="mt-1 w-full rounded-lg border p-2"><option value="">Selecciona…</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">Condición<select name="assignmentType" className="mt-1 w-full rounded-lg border p-2"><option value="PRIMARY">Principal</option><option value="BACKUP">Suplente</option></select></label>
              <span />
              <label className="text-sm font-semibold">Mesa inicial<input name="tableStart" type="number" min={1} max={selectedWindow?.puesto.expectedTables ?? undefined} required className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="text-sm font-semibold">Mesa final<input name="tableEnd" type="number" min={1} max={selectedWindow?.puesto.expectedTables ?? undefined} required className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="text-sm font-semibold">Inicio del turno<input key={`${selectedWindowId}-start`} name="shiftStartsLocal" type="datetime-local" required defaultValue={selectedWindow ? localFromInstant(selectedWindow.startsAt, selectedWindow.utcOffsetMinutes) : ""} className="mt-1 w-full rounded-lg border p-2" /></label>
              <label className="text-sm font-semibold">Fin del turno<input key={`${selectedWindowId}-end`} name="shiftEndsLocal" type="datetime-local" required defaultValue={selectedWindow ? localFromInstant(selectedWindow.endsAt, selectedWindow.utcOffsetMinutes) : ""} className="mt-1 w-full rounded-lg border p-2" /></label>
            </div>
            <button type="submit" disabled={busy !== null || !selectedWindow} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50">{busy === "assignment" ? "Guardando…" : "Planificar asignación"}</button>
          </form>
        </div>
      )}

      <section className="space-y-3" aria-labelledby="gap-title">
        <h2 id="gap-title" className="text-xl font-bold">Brechas por puesto, mesa y tiempo</h2>
        {coverage?.places.map((place) => (
          <article key={place.puesto.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold">{place.puesto.code} · {place.puesto.name}</h3>
            {!place.hasCoverageWindow && <p className="mt-2 text-sm font-semibold text-amber-800">Sin ventana operativa declarada.</p>}
            {place.windows.map((window) => (
              <div key={window.window.id} className="mt-3 border-t pt-3 text-sm">
                <p className="font-semibold">{window.window.localDate}: {formatInstant(window.window.startsAt, window.window.timeZone)} – {formatInstant(window.window.endsAt, window.window.timeZone)}</p>
                {window.fullyConfirmed ? <p className="mt-1 text-emerald-700">Cobertura temporal completa confirmada.</p> : <div className="mt-2 grid gap-2 md:grid-cols-2"><GapList label="PRIMARY" groups={window.primaryConfirmedTemporalGaps} /><GapList label="BACKUP" groups={window.backupConfirmedTemporalGaps} /></div>}
              </div>
            ))}
          </article>
        ))}
      </section>

      <section className="space-y-3" aria-labelledby="assignments-title">
        <h2 id="assignments-title" className="text-xl font-bold">Asignaciones durables</h2>
        {assignments.length === 0 && <p className="rounded-xl border bg-white p-5 text-slate-600">No hay asignaciones en este contexto.</p>}
        {assignments.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-bold">{item.puesto.code} · mesas {item.tableStart}–{item.tableEnd}</h3><p className="text-sm text-slate-600">{item.assignmentType === "PRIMARY" ? "Principal" : "Suplente"} · {item.witness.name} · {item.status}</p><p className="text-xs text-slate-500">{formatInstant(item.shiftStartsAt, item.coverageWindow.timeZone)} – {formatInstant(item.shiftEndsAt, item.coverageWindow.timeZone)}</p></div>
              {canPlan && item.status !== "CANCELLED" && <div className="flex flex-wrap gap-2">{item.status === "PLANNED" && <button type="button" disabled={busy !== null} onClick={() => void mutate(`confirm-${item.id}`, () => confirmWitnessAssignment(item.id, item.version), "Asignación confirmada.")} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-600">Confirmar</button>}<button type="button" onClick={() => setRowAction({ kind: "REASSIGN", assignment: item })} className="rounded-lg border px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600">Reasignar</button><button type="button" onClick={() => setRowAction({ kind: "CANCEL", assignment: item })} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 focus:outline-none focus:ring-2 focus:ring-red-600">Cancelar</button></div>}
            </div>
          </article>
        ))}
      </section>

      {rowAction && <form onSubmit={handleRowAction} className="rounded-xl border-2 border-blue-300 bg-blue-50 p-5" aria-labelledby="row-action-title"><h2 id="row-action-title" className="text-lg font-bold">{rowAction.kind === "CANCEL" ? "Cancelar asignación" : "Reasignar testigo"}</h2>{rowAction.kind === "REASSIGN" && <label className="mt-3 block text-sm font-semibold">Nuevo testigo<select name="witnessId" required autoFocus className="mt-1 w-full rounded-lg border p-2"><option value="">Selecciona…</option>{candidates.filter(({ id }) => id !== rowAction.assignment.witnessId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>}<label className="mt-3 block text-sm font-semibold">Justificación<textarea name="reason" minLength={20} maxLength={1000} required autoFocus={rowAction.kind === "CANCEL"} className="mt-1 min-h-24 w-full rounded-lg border p-2" /></label><div className="mt-3 flex gap-2"><button type="submit" disabled={busy !== null} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-600">Confirmar decisión</button><button type="button" onClick={() => setRowAction(null)} className="rounded-lg border bg-white px-4 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600">Volver sin cambios</button></div></form>}

      <p className="text-xs text-slate-500">Las mutaciones requieren conexión y confirmación de la API. La interfaz no simula guardados offline.</p>
    </main>
  );
}

function GapList({ label, groups }: { label: string; groups: Array<{ tableFrom: number; tableTo: number; gaps: Array<{ startsAt: string; endsAt: string; durationMinutes: number }> }> }) {
  if (groups.length === 0) return <p className="text-emerald-700">{label}: sin huecos.</p>;
  return <div className="rounded-lg bg-amber-50 p-3"><p className="font-bold text-amber-900">{label}</p><ul className="mt-1 list-disc pl-5 text-amber-950">{groups.map((group) => <li key={`${group.tableFrom}-${group.tableTo}-${group.gaps[0]?.startsAt}`}>Mesas {group.tableFrom}–{group.tableTo}: {group.gaps.map((gap) => `${gap.durationMinutes} min (${new Date(gap.startsAt).toISOString().slice(11, 16)}–${new Date(gap.endsAt).toISOString().slice(11, 16)} UTC)`).join(", ")}</li>)}</ul></div>;
}
