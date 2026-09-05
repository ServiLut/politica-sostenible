"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  ListChecks,
  LoaderCircle,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import { useAuth } from "@/context/auth";
import { ActivationChecklist } from "@/components/onboarding/ActivationChecklist";

type AlertSeverity = "critical" | "attention" | "ok";

interface ActivationStep {
  code: string;
  title: string;
  detail: string;
  href: string;
  complete: boolean;
}

interface BriefingAlert {
  code: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href: string;
  count?: number;
}

interface AgendaEvent {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface PriorityTask {
  id: string;
  title: string;
  status: string;
  priority: "URGENT" | "HIGH";
  dueAt: string | null;
}

interface CommandCenterBriefing {
  generatedAt: string;
  tenant: {
    id: string;
    name: string;
    type: string;
    mode: "CAMPAIGN";
  };
  activation: {
    ready: boolean;
    completedSteps: number;
    totalSteps: number;
    steps: ActivationStep[];
  };
  metrics: {
    people: { total: number; consented: number; consentCoverage: number };
    team: { active: number; pendingInvitations: number };
    territory: {
      departments: number;
      municipalities: number;
      zones: number;
      pollingPlaces: number;
    };
    tasks: { open: number; overdue: number };
    events: { upcoming: number };
    finance: {
      income: string;
      expenses: string;
      balance: string;
      pending: number;
      overdue: number;
    };
    electionDay: { reports: number; syncedReports: number };
    communications: { pendingApproval: number };
  };
  alerts: BriefingAlert[];
  agenda: {
    upcomingEvents: AgendaEvent[];
    priorityTasks: PriorityTask[];
  };
}

function formatCop(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "$0";

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    notation: Math.abs(amount) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha definida";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ExecutivePage() {
  const { tenant, user } = useAuth();
  const [briefing, setBriefing] = useState<CommandCenterBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const electionOperationActive = Boolean(
    briefing && briefing.metrics.electionDay.reports > 0,
  );

  const loadBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<CommandCenterBriefing>(
        "command-center/briefing",
      );
      setBriefing(result);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible consolidar el centro de mando.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  const progress = briefing
    ? Math.round(
        (briefing.activation.completedSteps /
          Math.max(briefing.activation.totalSteps, 1)) *
          100,
      )
    : 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <section className="relative overflow-hidden border border-slate-800 bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8 lg:px-10 lg:py-9">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.20),transparent_62%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
              <ShieldCheck size={15} aria-hidden="true" /> Centro de mando ·
              Campaña
            </p>
            <p className="mt-5 text-sm font-medium text-slate-400">
              Hola, {user?.name?.split(" ")[0] ?? "equipo"}. Esto requiere tu
              atención.
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              {briefing?.tenant.name ?? tenant?.name ?? "Operación política"}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Decisiones calculadas con datos agregados del espacio autenticado.
              Sin predicciones de voto, puntajes opacos ni cifras de
              demostración.
            </p>
          </div>

          <div className="border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Activación operativa
                </p>
                <p className="mt-1 text-2xl font-black">
                  {briefing
                    ? `${briefing.activation.completedSteps}/${briefing.activation.totalSteps}`
                    : "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadBriefing()}
                disabled={loading}
                aria-label="Actualizar centro de mando"
                className="grid h-11 w-11 place-items-center border border-white/15 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-50"
              >
                {loading ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <RefreshCw size={18} />
                )}
              </button>
            </div>
            <div
              className="mt-4 h-1.5 overflow-hidden bg-white/10"
              role="progressbar"
              aria-label="Progreso de activación"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={briefing ? progress : undefined}
            >
              <div
                className="h-full bg-emerald-400 transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              {briefing
                ? briefing.activation.ready
                  ? "Onboarding operativo completo; mantén los controles medidos al día."
                  : "Completa la ruta para pasar de configuración a ejecución."
                : loading
                  ? "Consultando el estado operativo…"
                  : "Estado no disponible. Actualiza para volver a consultarlo."}
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex flex-col items-start gap-4 border border-red-200 bg-red-50 p-5 text-sm text-red-800 sm:flex-row sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={19} />
            <div>
              <p className="font-black">No se pudo actualizar el tablero</p>
              <p className="mt-1">{error}</p>
              <p className="mt-1 text-xs font-semibold">
                {briefing
                  ? "Se conserva el último corte disponible."
                  : "Los indicadores no están disponibles; no se sustituyeron por ceros."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadBriefing()}
            disabled={loading}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 bg-red-700 px-4 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" size={15} /> Reintentar
          </button>
        </div>
      )}

      <section
        aria-label="Indicadores principales"
        className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          icon={Users}
          label="Personas autorizadas"
          value={briefing ? String(briefing.metrics.people.consented) : "—"}
          hint={
            briefing
              ? `${briefing.metrics.people.total} relaciones totales`
              : "Datos no disponibles"
          }
          loading={loading}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Cobertura de consentimiento"
          value={
            briefing ? `${briefing.metrics.people.consentCoverage}%` : "—"
          }
          hint={briefing ? "La meta obligatoria es 100%" : "Datos no disponibles"}
          loading={loading}
          accent={
            briefing?.metrics.people.consentCoverage === 100
              ? "emerald"
              : "amber"
          }
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Balance registrado"
          value={briefing ? formatCop(briefing.metrics.finance.balance) : "—"}
          hint={
            briefing
              ? `${briefing.metrics.finance.pending} movimientos pendientes`
              : "Datos no disponibles"
          }
          loading={loading}
          accent="blue"
        />
        {electionOperationActive ? (
          <MetricCard
            icon={FileCheck2}
            label="Actas sincronizadas"
            value={String(briefing?.metrics.electionDay.syncedReports ?? 0)}
            hint={`${briefing?.metrics.electionDay.reports ?? 0} reportes recibidos`}
            loading={loading}
            accent="violet"
          />
        ) : (
          <MetricCard
            icon={ListChecks}
            label="Tareas abiertas"
            value={briefing ? String(briefing.metrics.tasks.open) : "—"}
            hint={
              briefing
                ? `${briefing.metrics.tasks.overdue} tareas vencidas`
                : "Datos no disponibles"
            }
            loading={loading}
            accent={briefing?.metrics.tasks.overdue ? "amber" : "emerald"}
          />
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">
                Decisiones de hoy
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Lo que necesita tu decisión
              </h2>
            </div>
            <ListChecks className="text-slate-400" aria-hidden="true" />
          </div>

          <div className="divide-y divide-slate-100 border-y border-slate-100">
            {(briefing?.alerts ?? []).map((alert) => (
              <AlertLink key={alert.code} alert={alert} />
            ))}
            {!loading && !briefing && (
              <p className="py-6 text-sm text-slate-500">
                Actualiza el tablero para obtener prioridades verificables.
              </p>
            )}
            {loading && (
              <div className="flex items-center gap-3 py-8 text-sm font-semibold text-slate-500">
                <LoaderCircle className="animate-spin" size={18} />
                Consolidando controles y vencimientos…
              </div>
            )}
          </div>
        </div>

        <ActivationChecklist briefing={briefing} loading={loading} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <AgendaPanel
          title="Próximas acciones"
          icon={CalendarClock}
          empty={
            briefing
              ? "No hay actividades programadas para las próximas dos semanas."
              : loading
                ? "Consultando la agenda…"
                : "La agenda no está disponible. Reintenta la consulta."
          }
        >
          {(briefing?.agenda.upcomingEvents ?? []).map((event) => (
            <Link
              key={event.id}
              href="/dashboard/events"
              className="flex items-center justify-between gap-4 border-t border-slate-100 py-4 first:border-0"
            >
              <span>
                <span className="block text-sm font-black text-slate-900">
                  {event.name}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {formatDate(event.startsAt)}
                </span>
              </span>
              <ArrowRight className="shrink-0 text-slate-300" size={16} />
            </Link>
          ))}
        </AgendaPanel>

        <AgendaPanel
          title="Tareas de alta prioridad"
          icon={ListChecks}
          empty={
            briefing
              ? "No hay tareas urgentes o de alta prioridad abiertas."
              : loading
                ? "Consultando tareas prioritarias…"
                : "Las tareas prioritarias no están disponibles. Reintenta la consulta."
          }
        >
          {(briefing?.agenda.priorityTasks ?? []).map((task) => (
            <Link
              key={task.id}
              href="/dashboard/tasks"
              className="flex items-center justify-between gap-4 border-t border-slate-100 py-4 first:border-0"
            >
              <span>
                <span className="block text-sm font-black text-slate-900">
                  {task.title}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {task.priority === "URGENT" ? "Urgente" : "Alta"} ·{" "}
                  {formatDate(task.dueAt)}
                </span>
              </span>
              <ArrowRight className="shrink-0 text-slate-300" size={16} />
            </Link>
          ))}
        </AgendaPanel>
      </section>

      <section className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            Flujo de trabajo
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            Escuchar, organizar, movilizar y rendir cuentas
          </h2>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction
            href="/dashboard/inbox"
            icon={ListChecks}
            title="Bandeja operativa"
            detail="Pendientes, bloqueos y decisiones"
          />
          <QuickAction
            href="/dashboard/votantes"
            icon={Users}
            title="Personas"
            detail="Relacionamiento autorizado"
          />
          <QuickAction
            href="/dashboard/territory"
            icon={MapPinned}
            title="Territorio"
            detail={
              briefing
                ? `${briefing.metrics.territory.municipalities} municipios configurados`
                : loading
                  ? "Consultando…"
                  : "Datos no disponibles"
            }
          />
          {electionOperationActive ? (
            <QuickAction
              href="/dashboard/war-room"
              icon={FileCheck2}
              title="Operación electoral"
              detail="Reportes activos, revisión y actas"
            />
          ) : (
            <QuickAction
              href="/dashboard/events"
              icon={CalendarClock}
              title="Agenda"
              detail="Próximos hitos y actividades"
            />
          )}
        </div>
      </section>

      {briefing?.generatedAt && (
        <p className="text-right text-[11px] font-semibold text-slate-400">
          Corte generado {formatDate(briefing.generatedAt)}
        </p>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  loading,
  accent = "emerald",
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  hint: string;
  loading: boolean;
  accent?: "emerald" | "amber" | "blue" | "violet";
}) {
  const accents = {
    emerald: "text-emerald-700 bg-emerald-50",
    amber: "text-amber-700 bg-amber-50",
    blue: "text-blue-700 bg-blue-50",
    violet: "text-violet-700 bg-violet-50",
  };

  return (
    <article className="bg-white p-5 sm:p-6">
      <div className={`grid h-10 w-10 place-items-center ${accents[accent]}`}>
        <Icon size={20} aria-hidden="true" />
      </div>
      <p className="mt-5 text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 min-h-10 text-3xl font-black tracking-tight text-slate-950">
        {loading ? (
          <LoaderCircle className="animate-spin text-slate-300" />
        ) : (
          value
        )}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">{hint}</p>
    </article>
  );
}

function AlertLink({ alert }: { alert: BriefingAlert }) {
  const styles: Record<AlertSeverity, string> = {
    critical: "bg-red-50 text-red-700",
    attention: "bg-amber-50 text-amber-700",
    ok: "bg-emerald-50 text-emerald-700",
  };

  return (
    <Link
      href={alert.href}
      className="group grid grid-cols-[40px_1fr_auto] gap-3 py-5"
    >
      <span
        className={`grid h-10 w-10 place-items-center ${styles[alert.severity]}`}
      >
        {alert.severity === "ok" ? (
          <CheckCircle2 size={19} />
        ) : (
          <AlertTriangle size={19} />
        )}
      </span>
      <span>
        <span className="block text-sm font-black text-slate-900">
          {alert.title}
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {alert.detail}
        </span>
      </span>
      <ArrowRight
        className="mt-3 text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-800"
        size={17}
      />
    </Link>
  );
}

function AgendaPanel({
  title,
  icon: Icon,
  empty,
  children,
}: {
  title: string;
  icon: typeof CalendarClock;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);

  return (
    <div className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-3">
        <Icon className="text-emerald-700" size={20} aria-hidden="true" />
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      <div className="mt-4">
        {hasChildren ? (
          children
        ) : (
          <p className="border-t border-slate-100 py-5 text-sm leading-6 text-slate-500">
            {empty}
          </p>
        )}
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string;
  icon: typeof ShieldCheck;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white p-5 transition hover:bg-slate-50"
    >
      <Icon className="text-slate-700" size={20} aria-hidden="true" />
      <p className="mt-4 text-sm font-black text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
      <span className="mt-4 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
        Abrir
        <ArrowRight
          className="transition group-hover:translate-x-1"
          size={13}
        />
      </span>
    </Link>
  );
}
