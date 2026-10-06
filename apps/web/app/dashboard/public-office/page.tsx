"use client";
import { PageHeader } from "@/components/ui/PageHeader";

import { usePageRequest } from "@/lib/use-page-request";

import { ActivationChecklist } from "@/components/onboarding/ActivationChecklist";
import { useAuth } from "@/context/auth";
import { ApiError, apiRequest } from "@/lib/api-client";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Landmark,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Siren,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

type AlertSeverity = "critical" | "attention" | "ok";

interface PublicOfficeBriefing {
  generatedAt: string;
  tenant: {
    id: string;
    name: string;
    type: string;
    mode: "PUBLIC_OFFICE";
  };
  activation: {
    ready: boolean;
    completedSteps: number;
    totalSteps: number;
    steps: Array<{
      code: string;
      title: string;
      detail: string;
      href: string;
      complete: boolean;
    }>;
  };
  metrics: {
    team: { active: number; pendingInvitations: number };
    cases: { open: number; overdue: number; urgent: number };
    tasks: { open: number; overdue: number };
    commitments: {
      open: number;
      atRisk: number;
      overdue: number;
      teamVisible: number;
    };
    events: { upcoming: number };
    communications: { pendingApproval: number };
    pqrsd?: {
      open: number;
      criticalAlerts: number;
      configurationReady: boolean;
    };
  };
  alerts: Array<{
    code: string;
    severity: AlertSeverity;
    title: string;
    detail: string;
    href: string;
    count?: number;
  }>;
  agenda: {
    upcomingEvents: Array<{
      id: string;
      name: string;
      startsAt: string;
      endsAt: string;
      status: string;
    }>;
    priorityTasks: Array<{
      id: string;
      title: string;
      status: string;
      priority: "URGENT" | "HIGH";
      dueAt: string | null;
    }>;
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CO").format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha definida";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function PublicOfficePage() {
  const { tenant, user } = useAuth();
  const request = useCallback(
    (signal: AbortSignal) =>
      apiRequest<PublicOfficeBriefing>("command-center/briefing", { signal }),
    [],
  );
  const {
    data: briefing,
    loading,
    error: requestError,
    refresh: loadBriefing,
  } = usePageRequest(request);
  const error = requestError
    ? requestError instanceof ApiError
      ? requestError.message
      : "No fue posible consultar el centro de gestión pública."
    : null;

  const progress = briefing
    ? Math.round(
        (briefing.activation.completedSteps /
          Math.max(briefing.activation.totalSteps, 1)) *
          100,
      )
    : 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 min-w-0">
      <PageHeader
        title="Centro de gestión pública"
        icon={Landmark}
        description="Consulta PQRSD, casos, tareas y compromisos de tu organización."
        meta={briefing?.tenant.name ?? tenant?.name}
        actions={
          <button
            type="button"
            onClick={() => void loadBriefing()}
            disabled={loading}
            aria-label="Actualizar centro de gestión"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-blue-50 disabled:opacity-50 max-w-full whitespace-normal"
          >
            {loading ? (
              <LoaderCircle className="animate-spin" size={18} />
            ) : (
              <RefreshCw size={18} />
            )}
            <span>Actualizar</span>
          </button>
        }
      />
      <section
        aria-label="Activación del servicio"
        className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-slate-200 bg-white px-5 py-4"
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Configuración inicial{" "}
            <span className="ml-2 tabular-nums text-blue-700">
              {briefing
                ? `${briefing.activation.completedSteps}/${briefing.activation.totalSteps}`
                : "—"}
            </span>
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {briefing
              ? briefing.activation.ready
                ? "Controles iniciales completos."
                : "Revisa los pasos pendientes más abajo."
              : loading
                ? "Consultando el estado del servicio…"
                : "Estado no disponible. Actualiza para volver a consultarlo."}
          </p>
        </div>
        <div
          className="h-2 w-40 max-w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Progreso de activación de gestión pública"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={briefing ? progress : undefined}
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex flex-col items-start gap-4 border border-red-200 bg-red-50 p-5 text-sm text-red-800 sm:flex-row sm:justify-between min-w-0"
        >
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className="mt-0.5 shrink-0" size={19} />
            <div>
              <p className="font-semibold">No se pudo actualizar el centro</p>
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
            className="inline-flex min-h-10 shrink-0 items-center gap-2 bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50 max-w-full whitespace-normal"
          >
            <RefreshCw aria-hidden="true" size={15} /> Reintentar
          </button>
        </div>
      )}

      <section
        aria-label="Indicadores de gestión pública"
        className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-5 min-w-0"
      >
        <MetricCard
          label="PQRSD formales abiertas"
          value={briefing?.metrics.pqrsd?.open ?? null}
          detail={
            briefing?.metrics.pqrsd
              ? briefing.metrics.pqrsd.configurationReady
                ? `${briefing.metrics.pqrsd.criticalAlerts} alertas críticas`
                : "Falta aprobar reglas y calendario"
              : "Datos no disponibles"
          }
          icon={FileText}
          testId="open-pqrsd-metric"
          href="/dashboard/pqrsd"
          accent={briefing?.metrics.pqrsd?.criticalAlerts ? "red" : "emerald"}
        />
        <MetricCard
          label="Casos abiertos"
          value={briefing?.metrics.cases.open ?? null}
          detail={
            briefing
              ? `${briefing.metrics.cases.urgent} urgentes`
              : "Datos no disponibles"
          }
          icon={BriefcaseBusiness}
          testId="open-cases-metric"
          href="/dashboard/cases"
        />
        <MetricCard
          label="Casos vencidos"
          value={briefing?.metrics.cases.overdue ?? null}
          detail={
            briefing ? "Superaron la fecha de atención" : "Datos no disponibles"
          }
          icon={Siren}
          testId="overdue-cases-metric"
          href="/dashboard/cases"
          accent="red"
        />
        <MetricCard
          label="Tareas vencidas"
          value={briefing?.metrics.tasks.overdue ?? null}
          detail={
            briefing
              ? `${briefing.metrics.tasks.open} tareas abiertas`
              : "Datos no disponibles"
          }
          icon={ClipboardCheck}
          testId="overdue-tasks-metric"
          href="/dashboard/tasks"
          accent="amber"
        />
        <MetricCard
          label="Compromisos visibles para el equipo"
          value={briefing?.metrics.commitments.teamVisible ?? null}
          detail={
            briefing
              ? `${briefing.metrics.commitments.atRisk} en riesgo`
              : "Datos no disponibles"
          }
          icon={Target}
          testId="team-visible-commitments-metric"
          href="/dashboard/tasks"
          accent="emerald"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] min-w-0">
        <article className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7 min-w-0">
          <p className="text-xs font-semibold text-red-600">
            Decisiones del corte
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            Riesgos que necesitan responsable
          </h2>
          <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100 min-w-0">
            {(briefing?.alerts ?? []).map((alert) => (
              <Link
                key={alert.code}
                href={alert.href}
                className="group grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 py-5"
              >
                <span
                  className={`grid h-10 w-10 place-items-center ${
                    alert.severity === "critical"
                      ? "bg-red-50 text-red-700"
                      : alert.severity === "attention"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {alert.severity === "ok" ? (
                    <CheckCircle2 size={19} />
                  ) : (
                    <AlertTriangle size={19} />
                  )}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
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
            ))}
            {loading && (
              <div className="flex items-center gap-3 py-8 text-sm font-semibold text-slate-500 min-w-0">
                <LoaderCircle className="animate-spin" size={18} />
                Consolidando casos, tareas y compromisos…
              </div>
            )}
            {!loading && !briefing && (
              <p className="py-6 text-sm text-slate-500">
                Las prioridades no están disponibles. Reintenta la consulta.
              </p>
            )}
          </div>
        </article>

        <ActivationChecklist briefing={briefing} loading={loading} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2 min-w-0">
        <AgendaPanel
          title="Agenda pública próxima"
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
                <span className="block text-sm font-semibold text-slate-900">
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
                <span className="block text-sm font-semibold text-slate-900">
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

      <section className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7 min-w-0">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between min-w-0">
          <div>
            <p className="text-xs font-semibold text-slate-500">
              Operación conectada
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Atender, ejecutar, demostrar
            </h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row min-w-0">
            <Link
              href="/dashboard/cases"
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-blue-700 px-5 text-sm font-semibold text-white transition hover:bg-blue-800 max-w-full whitespace-normal"
            >
              <FileText size={17} /> Gestionar casos
            </Link>
            <Link
              href="/dashboard/tasks"
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 px-5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 max-w-full whitespace-normal"
            >
              <ListChecks size={17} /> Tareas y compromisos
            </Link>
            {user?.backendRole === "ADMIN" && (
              <Link
                href="/dashboard/team"
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 px-5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 max-w-full whitespace-normal"
              >
                <Users aria-hidden="true" size={17} /> Equipo
              </Link>
            )}
          </div>
        </div>
      </section>

      {briefing?.generatedAt && (
        <p className="text-right text-xs font-semibold text-slate-400">
          Corte generado {formatDate(briefing.generatedAt)}
        </p>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  testId,
  href,
  accent = "blue",
}: {
  label: string;
  value: number | null;
  detail: string;
  icon: typeof ShieldCheck;
  testId: string;
  href: string;
  accent?: "blue" | "red" | "amber" | "emerald";
}) {
  const accents = {
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };

  return (
    <article className="bg-white p-5 sm:p-6 min-w-0">
      <div className={`grid h-10 w-10 place-items-center ${accents[accent]}`}>
        <Icon size={20} aria-hidden="true" />
      </div>
      <p className="mt-5 text-xs font-semibold text-slate-500">{label}</p>
      <p
        data-testid={testId}
        className="mt-1 text-2xl font-semibold tracking-tight text-slate-950"
      >
        {value === null ? "—" : formatNumber(value)}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3 min-w-0 flex-wrap">
        <p className="text-xs font-medium text-slate-500">{detail}</p>
        <Link href={href} aria-label={`Abrir ${label.toLowerCase()}`}>
          <ArrowRight className="text-slate-300" size={15} />
        </Link>
      </div>
    </article>
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
    <article className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="text-blue-700" size={20} aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="mt-4 min-w-0">
        {hasChildren ? (
          children
        ) : (
          <p className="border-t border-slate-100 py-5 text-sm leading-6 text-slate-500">
            {empty}
          </p>
        )}
      </div>
    </article>
  );
}
