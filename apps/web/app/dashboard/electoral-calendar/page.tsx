"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  FileClock,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { uploadFileDirectly } from "@/lib/direct-storage-upload";
import {
  activateCalendarRelease,
  CALENDAR_CATEGORIES,
  createCalendarRelease,
  getCalendarEvidenceDownload,
  getElectoralCalendarOverview,
  recordCalendarResult,
  reviewCalendarResult,
  sha256File,
  validateCalendarRelease,
  type CalendarCategory,
  type CalendarMilestone,
  type CalendarMilestoneInput,
  type CalendarRelease,
  type CalendarResult,
  type ElectoralCalendarOverview,
} from "@/lib/electoral-calendar-api";
import { useAuth } from "@/context/auth";
import type { BackendUserRole } from "@/types/saas-schema";

const MANAGEMENT_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
]);
const REVIEW_ROLES = new Set<BackendUserRole>([
  "COMPLIANCE_OFFICER",
  "AUDITOR",
]);
const RESULT_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "FINANCE_MANAGER",
  "COMPLIANCE_OFFICER",
  "ZONE_COORDINATOR",
]);

const CATEGORY_LABELS: Record<CalendarCategory, string> = {
  REGISTRATION: "Inscripción",
  SIGNATURES: "Apoyos ciudadanos",
  CAMPAIGN: "Campaña",
  ELECTION_PREPARATION: "Preparación electoral",
  ELECTION_DAY: "Jornada electoral",
  SCRUTINY: "Escrutinio",
  FINANCE: "Finanzas",
  DATA_GOVERNANCE: "Gobierno de datos",
  INTERNAL: "Decisión interna",
};

const SEMANTICS_LABELS = {
  INFORMATIONAL: "Informativo · no es vencimiento",
  INTERNAL_TARGET: "Meta interna · no es plazo legal",
  EXTERNAL_DEADLINE: "Plazo externo declarado · confirmar fuente",
} as const;

const RELEASE_LABELS: Record<CalendarRelease["status"], string> = {
  STAGED: "En preparación",
  VALIDATED: "Fuente validada",
  ACTIVE: "Activo para control interno",
  SUPERSEDED: "Sustituido · histórico",
};

const RESULT_LABELS = {
  COMPLETED: "Completado",
  NOT_APPLICABLE: "No aplicaba",
  MISSED: "No cumplido a tiempo",
  CANCELLED: "Cancelado",
  PENDING_REVIEW: "Pendiente de segundo control",
  OPEN: "Sin resultado",
} as const;

type MilestoneDraft = CalendarMilestoneInput;

function freshId() {
  return globalThis.crypto.randomUUID();
}

function value(data: FormData, key: string) {
  const candidate = data.get(key);
  return typeof candidate === "string" ? candidate.trim() : "";
}

function optionalValue(data: FormData, key: string) {
  return value(data, key) || undefined;
}

function checked(data: FormData, key: string) {
  return data.get(key) === "on";
}

function readableError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible completar la operación. Recarga el calendario e inténtalo de nuevo.";
}

function dateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function dateTimeLabel(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(parsed);
}

function localInputToIso(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Corte inválido");
  return parsed.toISOString();
}

function Metric({ label, value, warning = false }: { label: string; value: string | number; warning?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${warning ? "text-amber-700" : "text-slate-950"}`}>
        {value}
      </p>
    </div>
  );
}

function ResultForm({
  milestone,
  busy,
  onDone,
}: {
  milestone: CalendarMilestone;
  busy: boolean;
  onDone: (operation: () => Promise<unknown>, message: string) => Promise<boolean>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("evidence");
    const saved = await onDone(async () => {
      let evidenceStoragePath: string | undefined;
      let evidenceSha256: string | undefined;
      if (file instanceof File && file.size > 0) {
        evidenceSha256 = await sha256File(file);
        const upload = await uploadFileDirectly(
          file,
          "electoral-calendar",
          evidenceSha256,
        );
        evidenceStoragePath = upload.path;
      }
      return recordCalendarResult(milestone.id, {
        clientRequestId: freshId(),
        outcome: value(data, "outcome") as
          | "COMPLETED"
          | "NOT_APPLICABLE"
          | "MISSED"
          | "CANCELLED",
        explanation: value(data, "explanation"),
        ...(evidenceStoragePath && evidenceSha256
          ? { evidenceStoragePath, evidenceSha256 }
          : {}),
      });
    }, "Resultado guardado. Su condición de segundo control se muestra por separado.");
    if (saved) form.reset();
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold text-slate-700">
        El resultado es independiente de una tarea o evento enlazado.
      </p>
      <label className="grid gap-1 text-sm font-semibold text-slate-800">
        Resultado
        <select name="outcome" required className="min-h-11 rounded-xl border border-slate-300 bg-white px-3">
          <option value="COMPLETED">Completado</option>
          <option value="NOT_APPLICABLE">No aplicaba</option>
          <option value="MISSED">No cumplido a tiempo</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-800">
        Explicación verificable
        <textarea name="explanation" required minLength={10} maxLength={3000} rows={3} className="rounded-xl border border-slate-300 bg-white px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-800">
        Evidencia privada (PDF, JPG, PNG o WebP)
        <input
          name="evidence"
          type="file"
          required={milestone.resultEvidenceRequired}
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
        />
      </label>
      <p className="text-xs leading-5 text-slate-600">
        El archivo se envía directamente al almacenamiento privado mediante URL firmada; la API sólo vincula su ruta opaca y SHA-256.
      </p>
      <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "Guardando…" : "Registrar resultado"}
      </button>
    </form>
  );
}

function ReviewForm({
  result,
  busy,
  onDone,
}: {
  result: CalendarResult;
  busy: boolean;
  onDone: (operation: () => Promise<unknown>, message: string) => Promise<boolean>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const saved = await onDone(
      () =>
        reviewCalendarResult(result.id, {
          clientRequestId: freshId(),
          decision: value(data, "decision") as "APPROVE" | "REJECT",
          rationale: value(data, "rationale"),
        }),
      "Segundo control registrado de forma inmutable.",
    );
    if (saved) form.reset();
  }
  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <p className="text-xs font-bold text-indigo-950">
        Registrado por {result.recordedBy.name}. Otra persona debe decidir.
      </p>
      <label className="grid gap-1 text-sm font-semibold text-slate-800">
        Decisión
        <select name="decision" required className="min-h-11 rounded-xl border border-slate-300 bg-white px-3">
          <option value="APPROVE">Aprobar resultado</option>
          <option value="REJECT">Rechazar y permitir una nueva constancia</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-800">
        Razón del control
        <textarea name="rationale" required minLength={10} maxLength={2000} rows={2} className="rounded-xl border border-slate-300 bg-white px-3 py-2" />
      </label>
      <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-indigo-900 px-4 text-sm font-bold text-white disabled:opacity-50">
        Registrar segundo control
      </button>
    </form>
  );
}

export default function ElectoralCalendarPage() {
  const { user } = useAuth();
  const role = user?.backendRole;
  const [overview, setOverview] = useState<ElectoralCalendarOverview | null>(null);
  const [drafts, setDrafts] = useState<MilestoneDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await getElectoralCalendarOverview(signal));
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(readableError(loadError));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const activeRelease = useMemo(
    () => overview?.releases.find((release) => release.status === "ACTIVE") ?? null,
    [overview],
  );
  const canManage = Boolean(role && MANAGEMENT_ROLES.has(role) && !overview?.readOnly && overview?.profile.stage !== "ELECTION_DAY");
  const canReview = Boolean(role && REVIEW_ROLES.has(role) && !overview?.readOnly && overview?.profile.stage !== "ELECTION_DAY");
  const canRecord = Boolean(role && RESULT_ROLES.has(role) && !overview?.readOnly);

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
      await load();
      return true;
    } catch (mutationError) {
      setError(readableError(mutationError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function addDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const semantics = value(data, "semantics") as MilestoneDraft["semantics"];
    const responsibleUserId = optionalValue(data, "responsibleUserId");
    const backupUserId = optionalValue(data, "backupUserId");
    if (semantics === "EXTERNAL_DEADLINE" && (!responsibleUserId || !backupUserId || responsibleUserId === backupUserId)) {
      setError("Un plazo externo exige responsable y suplente diferentes.");
      return;
    }
    const alertOffsetsDays = data
      .getAll("alertOffsetsDays")
      .map(Number)
      .sort((left, right) => right - left);
    setDrafts((current) => [
      ...current,
      {
        stableKey: value(data, "stableKey").toUpperCase(),
        category: value(data, "category") as CalendarCategory,
        semantics,
        title: value(data, "title"),
        applicabilityRule: value(data, "applicabilityRule"),
        originalTextSummary: value(data, "originalTextSummary"),
        localDate: value(data, "localDate"),
        ...(optionalValue(data, "localTime") ? { localTime: optionalValue(data, "localTime") } : {}),
        timeZone: value(data, "timeZone"),
        ...(responsibleUserId ? { responsibleUserId } : {}),
        ...(backupUserId ? { backupUserId } : {}),
        alertOffsetsDays,
        stageGateRequired: checked(data, "stageGateRequired"),
        resultEvidenceRequired: checked(data, "resultEvidenceRequired"),
        ...(optionalValue(data, "linkedTaskId") ? { linkedTaskId: optionalValue(data, "linkedTaskId") } : {}),
        ...(optionalValue(data, "linkedEventId") ? { linkedEventId: optionalValue(data, "linkedEventId") } : {}),
      },
    ]);
    setError(null);
    form.reset();
  }

  async function createRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (drafts.length === 0) {
      setError("Añade al menos un hito antes de guardar la versión.");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const roundCode = value(data, "roundCode").toUpperCase();
    const baseline = overview?.releases.find(
      (release) => release.status === "ACTIVE" && release.roundCode === roundCode,
    );
    const saved = await run(
      () =>
        createCalendarRelease({
          clientRequestId: freshId(),
          ...(baseline ? { basedOnReleaseId: baseline.id } : {}),
          roundCode,
          versionLabel: value(data, "versionLabel"),
          sourceAuthority: value(data, "sourceAuthority"),
          sourceUrl: value(data, "sourceUrl"),
          sourceReference: value(data, "sourceReference"),
          sourcePublishedAt: value(data, "sourcePublishedAt"),
          sourceCutoffAt: localInputToIso(value(data, "sourceCutoffAt")),
          sourceSha256: value(data, "sourceSha256").toLowerCase(),
          milestones: drafts,
        }),
      baseline
        ? "Nueva versión guardada. Revise el diff antes de validarla."
        : "Primera versión guardada en preparación.",
    );
    if (saved) {
      form.reset();
      setDrafts([]);
    }
  }

  async function validateRelease(release: CalendarRelease, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      () =>
        validateCalendarRelease(release.id, {
          clientRequestId: freshId(),
          expectedVersion: release.version,
          sourceReviewedAcknowledged: checked(data, "sourceReviewedAcknowledged"),
          rationale: value(data, "rationale"),
        }),
      "Fuente validada por una persona distinta del cargador.",
    );
  }

  async function activateRelease(release: CalendarRelease, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      () =>
        activateCalendarRelease(release.id, {
          clientRequestId: freshId(),
          expectedVersion: release.version,
          sourceReviewedAcknowledged: checked(data, "sourceReviewedAcknowledged"),
          diffReviewedAcknowledged: checked(data, "diffReviewedAcknowledged"),
          affectedTasksResolvedAcknowledged: checked(data, "affectedTasksResolvedAcknowledged"),
          rationale: value(data, "rationale"),
        }),
      "Versión activada para control interno; la anterior quedó histórica.",
    );
  }

  async function authorizeDownload(resultId: string) {
    setBusy(true);
    setError(null);
    try {
      const receipt = await getCalendarEvidenceDownload(resultId);
      setDownloadUrls((current) => ({ ...current, [resultId]: receipt.url }));
      setMessage("Enlace privado autorizado por cinco minutos.");
    } catch (downloadError) {
      setError(readableError(downloadError));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !overview) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <Loader2 className="animate-spin" aria-hidden="true" /> Cargando calendario versionado…
        </p>
      </main>
    );
  }

  if (!overview) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
          <h1 className="text-xl font-black">No fue posible abrir el calendario</h1>
          <p className="mt-2 text-sm">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-900 px-4 font-bold text-white">
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 pb-24 sm:p-6 lg:p-8">
      <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Ciclo electoral completo</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Calendario electoral versionado</h1>
        <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-200">{overview.disclaimer}</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-white/10 px-3 py-2">{overview.profile.electionType}</span>
          <span className="rounded-full bg-white/10 px-3 py-2">{overview.profile.circumscriptionName}</span>
          <span className="rounded-full bg-white/10 px-3 py-2">Elección {dateLabel(overview.profile.electionDate)}</span>
          <span className="rounded-full bg-white/10 px-3 py-2">Etapa {overview.profile.stage}</span>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{error}</p>}
      {message && <p aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{message}</p>}
      {overview.readOnly && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">
          Operación cerrada: todo el expediente queda en sólo lectura. No se habilitan correcciones silenciosas.
        </p>
      )}
      {overview.profile.stage === "ELECTION_DAY" && !overview.readOnly && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-950">
          Jornada electoral: se usa exclusivamente el paquete activo. Las fechas no pueden cargarse, validarse ni activarse; sí pueden registrarse resultados.
        </p>
      )}

      <section aria-labelledby="summary-title">
        <h2 id="summary-title" className="sr-only">Resumen de calendario</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Versión activa" value={activeRelease?.versionLabel ?? "Ninguna"} warning={!activeRelease} />
          <Metric label="Próximos 30 días" value={overview.activeSummary.upcoming30Days.length} />
          <Metric label="Vencidos sin resolver" value={overview.activeSummary.overdue.length} warning={overview.activeSummary.overdue.length > 0} />
          <Metric label="Bloqueos configurados" value={overview.activeSummary.unresolvedRequiredGates.length} warning={overview.activeSummary.unresolvedRequiredGates.length > 0} />
        </div>
      </section>

      {!activeRelease && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h2 className="flex items-center gap-2 font-black"><AlertTriangle aria-hidden="true" size={19} /> No hay calendario activo</h2>
          <p className="mt-2 text-sm leading-6">Ninguna fecha se considera vigente para la operación. Cargue una versión, haga que otra persona valide la fuente y actívela tras revisar el diff.</p>
        </section>
      )}

      {(overview.activeSummary.overdue.length > 0 || overview.activeSummary.alertsDue.length > 0) && (
        <section aria-labelledby="alerts-title" className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <h2 id="alerts-title" className="text-xl font-black text-slate-950">Bandeja de alertas</h2>
          <p className="mt-1 text-xs text-slate-600">Señales calculadas al abrir la pantalla. Esto no afirma que un correo o notificación haya sido entregado.</p>
          <ul className="mt-4 space-y-2">
            {overview.activeSummary.overdue.map((item) => (
              <li key={`overdue-${item.id}`} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950">
                <strong>Vencido:</strong> {item.title} · {dateLabel(item.localDate)} · {item.responsible?.name ?? "sin responsable"}
              </li>
            ))}
            {overview.activeSummary.alertsDue.map((item) => (
              <li key={`due-${item.id}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <strong>T-{item.daysRemaining ?? 0}:</strong> {item.title} · {SEMANTICS_LABELS[item.semantics]}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManage && (
        <section aria-labelledby="new-release-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="new-release-title" className="text-2xl font-black text-slate-950">Preparar una versión</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">La elección y circunscripción se copian del perfil vigente. No se reciben desde este formulario.</p>

          <form onSubmit={addDraft} className="mt-5 grid gap-4 rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 lg:grid-cols-2">
            <h3 className="text-lg font-black text-slate-950 lg:col-span-2">Añadir hito al borrador</h3>
            <label className="grid gap-1 text-sm font-semibold">Clave estable<input name="stableKey" required pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,79}" placeholder="RADICACION_APOYOS" className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 uppercase" /></label>
            <label className="grid gap-1 text-sm font-semibold">Título<input name="title" required minLength={3} maxLength={300} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Categoría<select name="category" required className="min-h-11 rounded-xl border border-slate-300 bg-white px-3">{CALENDAR_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold">Semántica<select name="semantics" required className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"><option value="INFORMATIONAL">Informativo</option><option value="INTERNAL_TARGET">Meta interna</option><option value="EXTERNAL_DEADLINE">Plazo externo declarado</option></select></label>
            <label className="grid gap-1 text-sm font-semibold">Fecha civil<input name="localDate" type="date" required className="min-h-11 rounded-xl border border-slate-300 bg-white px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Hora civil (opcional)<input name="localTime" type="time" className="min-h-11 rounded-xl border border-slate-300 bg-white px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Zona IANA<input name="timeZone" required defaultValue="America/Bogota" minLength={3} maxLength={100} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Responsable<select name="responsibleUserId" className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"><option value="">Sin asignar</option>{overview.operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name} · {operator.role}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold">Suplente<select name="backupUserId" className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"><option value="">Sin asignar</option>{overview.operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name} · {operator.role}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold lg:col-span-2">Regla de aplicabilidad<textarea name="applicabilityRule" required minLength={5} maxLength={2000} rows={2} placeholder="A quién y bajo qué fuente aplica; no calcule prórrogas no aprobadas." className="rounded-xl border border-slate-300 bg-white px-3 py-2" /></label>
            <label className="grid gap-1 text-sm font-semibold lg:col-span-2">Resumen fiel del texto fuente<textarea name="originalTextSummary" required minLength={5} maxLength={3000} rows={2} className="rounded-xl border border-slate-300 bg-white px-3 py-2" /></label>
            <label className="grid gap-1 text-sm font-semibold">ID de tarea enlazada (opcional)<input name="linkedTaskId" maxLength={128} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">ID de evento enlazado (opcional)<input name="linkedEventId" maxLength={128} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3" /></label>
            <fieldset className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-2"><legend className="px-1 text-sm font-bold">Alertas internas</legend><div className="mt-2 flex flex-wrap gap-4">{[30, 15, 7, 3, 1, 0].map((offset) => <label key={offset} className="flex items-center gap-2 text-sm"><input name="alertOffsetsDays" value={offset} type="checkbox" defaultChecked={[30, 15, 7, 3, 1, 0].includes(offset)} />{offset === 0 ? "Al vencer" : `T-${offset}`}</label>)}</div></fieldset>
            <label className="flex items-start gap-2 text-sm"><input name="stageGateRequired" type="checkbox" className="mt-1" /><span>Bloqueo de etapa configurado expresamente (sólo plazo externo).</span></label>
            <label className="flex items-start gap-2 text-sm"><input name="resultEvidenceRequired" type="checkbox" className="mt-1" /><span>Exigir documento confirmado al cerrar.</span></label>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-900 px-4 font-bold text-white lg:col-span-2"><Plus size={16} aria-hidden="true" /> Añadir hito al borrador</button>
          </form>

          <div className="mt-4 space-y-2" aria-live="polite">
            {drafts.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">Todavía no hay hitos en este borrador.</p> : drafts.map((draft, index) => (
              <div key={`${draft.stableKey}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div><p className="font-bold text-slate-950">{draft.title}</p><p className="mt-1 text-xs text-slate-600">{draft.stableKey} · {CATEGORY_LABELS[draft.category]} · {dateLabel(draft.localDate)} {draft.localTime ?? "sin hora"} · {draft.timeZone}</p></div>
                <button type="button" onClick={() => setDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Retirar ${draft.title} del borrador`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200 text-red-700"><Trash2 size={17} aria-hidden="true" /></button>
              </div>
            ))}
          </div>

          <form onSubmit={createRelease} className="mt-5 grid gap-4 lg:grid-cols-2">
            <h3 className="text-lg font-black text-slate-950 lg:col-span-2">Fuente y versión</h3>
            <label className="grid gap-1 text-sm font-semibold">Ronda o vuelta<input name="roundCode" required pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}" placeholder="PRIMERA_VUELTA" className="min-h-11 rounded-xl border border-slate-300 px-3 uppercase" /></label>
            <label className="grid gap-1 text-sm font-semibold">Versión de la fuente<input name="versionLabel" required maxLength={80} placeholder="Resolución 001 · corte 1" className="min-h-11 rounded-xl border border-slate-300 px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Autoridad emisora<input name="sourceAuthority" required minLength={2} maxLength={300} className="min-h-11 rounded-xl border border-slate-300 px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">URL HTTPS de fuente<input name="sourceUrl" type="url" required pattern="https://.*" maxLength={2048} className="min-h-11 rounded-xl border border-slate-300 px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold lg:col-span-2">Referencia exacta<input name="sourceReference" required minLength={5} maxLength={1000} className="min-h-11 rounded-xl border border-slate-300 px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Publicación de la fuente<input name="sourcePublishedAt" type="date" required className="min-h-11 rounded-xl border border-slate-300 px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold">Corte consultado<input name="sourceCutoffAt" type="datetime-local" required className="min-h-11 rounded-xl border border-slate-300 px-3" /></label>
            <label className="grid gap-1 text-sm font-semibold lg:col-span-2">SHA-256 del artefacto usado<input name="sourceSha256" required minLength={64} maxLength={64} pattern="[a-fA-F0-9]{64}" spellCheck={false} className="min-h-11 rounded-xl border border-slate-300 px-3 font-mono text-xs" /></label>
            <button type="submit" disabled={busy || drafts.length === 0} className="min-h-12 rounded-xl bg-slate-950 px-5 font-black text-white disabled:opacity-50 lg:col-span-2">{busy ? "Guardando…" : `Guardar versión con ${drafts.length} hito(s)`}</button>
          </form>
        </section>
      )}

      <section aria-labelledby="versions-title" className="space-y-4">
        <div className="flex items-center justify-between gap-3"><div><h2 id="versions-title" className="text-2xl font-black text-slate-950">Versiones e historial</h2><p className="mt-1 text-sm text-slate-600">Una corrección crea otra versión; nunca reemplaza contenido histórico.</p></div><button type="button" onClick={() => void load()} disabled={loading || busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold"><RefreshCw size={16} aria-hidden="true" /> Actualizar</button></div>
        {overview.releases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><FileClock className="mx-auto text-slate-400" aria-hidden="true" /><p className="mt-3 font-bold text-slate-700">No hay versiones cargadas para este perfil.</p></div>
        ) : overview.releases.map((release) => (
          <article key={release.id} className={`rounded-3xl border bg-white p-5 shadow-sm sm:p-6 ${release.status === "ACTIVE" ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200"}`}>
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">{release.roundCode} · {RELEASE_LABELS[release.status]}</p><h3 className="mt-1 text-xl font-black text-slate-950">{release.versionLabel}</h3><p className="mt-2 text-sm text-slate-600">{release.sourceAuthority} · corte {dateTimeLabel(release.sourceCutoffAt)}</p></div><a href={release.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-800">Abrir fuente HTTPS</a></header>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs font-bold uppercase text-slate-500">Creó</dt><dd className="mt-1 font-semibold">{release.createdBy.name}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-500">Validó</dt><dd className="mt-1 font-semibold">{release.validatedBy?.name ?? "Pendiente"}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-500">Activó</dt><dd className="mt-1 font-semibold">{release.activatedBy?.name ?? "Pendiente"}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-500">SHA-256</dt><dd className="mt-1 break-all font-mono text-[11px]">{release.sourceSha256}</dd></div></dl>

            <details className="mt-5 rounded-2xl border border-slate-200 p-4" open={release.status === "STAGED" || release.status === "VALIDATED"}><summary className="cursor-pointer font-black text-slate-950">Diff frente a la base</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Añadidos" value={release.diff.added.length} /><Metric label="Retirados" value={release.diff.removed.length} warning={release.diff.removed.length > 0} /><Metric label="Movidos" value={release.diff.moved.length} warning={release.diff.moved.length > 0} /><Metric label="Otros cambios" value={release.diff.changed.length} /></div>{!release.diff.hasChanges && release.basedOnReleaseId && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">La versión no cambia hitos frente a su base. Verifique por qué necesita activarse.</p>}<ul className="mt-3 space-y-2 text-sm">{release.diff.added.map((item) => <li key={`a-${item.stableKey}`} className="rounded-lg bg-emerald-50 p-2"><strong>Añadido:</strong> {item.title} · {dateLabel(item.localDate)}</li>)}{release.diff.removed.map((item) => <li key={`r-${item.stableKey}`} className="rounded-lg bg-red-50 p-2"><strong>Retirado:</strong> {item.title} · antes {dateLabel(item.localDate)}</li>)}{release.diff.moved.map((item) => <li key={`m-${item.stableKey}`} className="rounded-lg bg-amber-50 p-2"><strong>Movido:</strong> {item.title} · {dateLabel(item.from.localDate)} → {dateLabel(item.to.localDate)}</li>)}</ul></details>

            {canReview && release.status === "STAGED" && <form onSubmit={(event) => validateRelease(release, event)} className="mt-4 grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><label className="flex items-start gap-2 text-sm font-semibold"><input name="sourceReviewedAcknowledged" type="checkbox" required className="mt-1" />Revisé la fuente aplicable, elección, ronda, circunscripción, corte y huella.</label><label className="grid gap-1 text-sm font-semibold">Razón de validación<textarea name="rationale" required minLength={10} maxLength={2000} rows={2} className="rounded-xl border border-slate-300 bg-white px-3 py-2" /></label><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-indigo-900 px-4 font-bold text-white disabled:opacity-50">Validar fuente y versión</button></form>}
            {canReview && release.status === "VALIDATED" && <form onSubmit={(event) => activateRelease(release, event)} className="mt-4 grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><label className="flex items-start gap-2 text-sm font-semibold"><input name="sourceReviewedAcknowledged" type="checkbox" required className="mt-1" />Confirmo nuevamente la fuente aplicable.</label><label className="flex items-start gap-2 text-sm font-semibold"><input name="diffReviewedAcknowledged" type="checkbox" required className="mt-1" />Revisé fechas añadidas, retiradas, movidas y cambios de control.</label><label className="flex items-start gap-2 text-sm font-semibold"><input name="affectedTasksResolvedAcknowledged" type="checkbox" required className="mt-1" />Resolví o concilié las tareas y eventos afectados.</label><label className="grid gap-1 text-sm font-semibold">Razón de activación<textarea name="rationale" required minLength={10} maxLength={2000} rows={2} className="rounded-xl border border-slate-300 bg-white px-3 py-2" /></label><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-emerald-900 px-4 font-bold text-white disabled:opacity-50">Activar para control interno</button></form>}

            <div className="mt-5 space-y-3">{release.milestones.map((milestone) => (
              <section key={milestone.id} className={`rounded-2xl border p-4 ${milestone.resolution.resolved ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">{CATEGORY_LABELS[milestone.category]} · {SEMANTICS_LABELS[milestone.semantics]}</p><h4 className="mt-1 font-black text-slate-950">{milestone.title}</h4><p className="mt-2 text-sm text-slate-700">{dateLabel(milestone.localDate)} {milestone.localTime ? `a las ${milestone.localTime}` : "· sin hora declarada"} · {milestone.timeZone}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${milestone.resolution.resolved ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{RESULT_LABELS[milestone.resolution.status]}</span></div>
                <p className="mt-3 text-sm leading-6 text-slate-600"><strong>Aplicabilidad:</strong> {milestone.applicabilityRule}</p>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="font-bold uppercase text-slate-500">Responsable</dt><dd className="mt-1">{milestone.responsible?.name ?? "No asignado"}</dd></div><div><dt className="font-bold uppercase text-slate-500">Suplente</dt><dd className="mt-1">{milestone.backup?.name ?? "No asignado"}</dd></div></dl>
                {milestone.stageGateRequired && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs font-bold text-red-900">Regla configurada para bloquear transición hasta tener resultado efectivo.</p>}
                {milestone.results.map((result) => <div key={result.id} className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm"><p><strong>{RESULT_LABELS[result.outcome]}</strong> · {result.recordedBy.name} · {dateTimeLabel(result.recordedAt)}</p><p className="mt-1 text-slate-600">{result.explanation}</p>{result.evidencePath && <div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={() => void authorizeDownload(result.id)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-bold">Autorizar lectura privada</button>{downloadUrls[result.id] && <a href={downloadUrls[result.id]} target="_blank" rel="noreferrer" className="min-h-10 rounded-lg bg-slate-950 px-3 py-3 text-xs font-bold text-white">Abrir evidencia</a>}</div>}{result.review && <p className={`mt-2 rounded-lg p-2 text-xs font-bold ${result.review.decision === "APPROVE" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>Segundo control: {result.review.decision === "APPROVE" ? "aprobado" : "rechazado"} por {result.review.reviewer.name}. {result.review.rationale}</p>}{canReview && milestone.resolution.requiresSecondControl && !result.review && <ReviewForm result={result} busy={busy} onDone={run} />}</div>)}
                {canRecord && release.status === "ACTIVE" && !milestone.resolution.resolved && !milestone.resolution.pendingResult && <ResultForm milestone={milestone} busy={busy} onDone={run} />}
              </section>
            ))}</div>
          </article>
        ))}
      </section>

      <footer className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
        <p className="flex items-start gap-2"><ShieldCheck className="mt-1 shrink-0 text-emerald-700" size={18} aria-hidden="true" /><span>“Activo” significa vigente para el control interno de esta operación. La plataforma no certifica oficialidad, días hábiles, prórrogas ni recepción por una autoridad.</span></p>
        <p className="mt-2">Ajuste tareas en <Link href="/dashboard/tasks" className="font-bold underline">Tareas</Link> y eventos en <Link href="/dashboard/events" className="font-bold underline">Agenda</Link>; cerrarlos allí no cierra automáticamente un hito.</p>
      </footer>
    </main>
  );
}
