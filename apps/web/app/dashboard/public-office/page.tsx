"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  Check,
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
import { useAuth } from "@/context/auth";
import { ApiError, apiRequest } from "@/lib/api-client";

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
      public: number;
    };
    events: { upcoming: number };
    communications: { pendingApproval: number };
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
  const [briefing, setBriefing] = useState<PublicOfficeBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBriefing = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<PublicOfficeBriefing>(
        "command-center/briefing",
        { signal },
      );
      setBriefing(result);
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        return;
      }
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible consultar el centro de gestión pública.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadBriefing(controller.signal);
    return () => controller.abort();
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
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.22),transparent_62%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-300">
              <Landmark size={15} aria-hidden="true" /> Gestión pública ·
              Espacio separado
            </p>
            <p className="mt-5 text-sm font-medium text-slate-400">
              Hola, {user?.name?.split(" ")[0] ?? "equipo"}. Este es el corte de
              atención y cumplimiento.
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Centro de gestión pública
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Seguimiento de{" "}
              {briefing?.tenant.name ?? tenant?.name ?? "la organización"},
              calculado con casos, tareas y compromisos del modo autenticado.
            </p>
          </div>

          <div className="border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Activación del servicio
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
                aria-label="Actualizar centro de gestión"
                className="grid h-11 w-11 place-items-center border border-white/15 bg-white/10 transition hover:bg-white/20 disabled:opacity-50"
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
              aria-label="Progreso de activación de gestión pública"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={briefing ? progress : undefined}
            >
              <div
                className="h-full bg-blue-400 transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              {briefing
                ? briefing.activation.ready
                  ? "Onboarding operativo completo para los controles medidos."
                  : "Completa la ruta para asegurar responsables y evidencia."
                : loading
                  ? "Consultando el estado del servicio…"
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
              <p className="font-black">No se pudo actualizar el centro</p>
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
        aria-label="Indicadores de gestión pública"
        className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4"
      >
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
          detail={briefing ? "Superaron la fecha de atención" : "Datos no disponibles"}
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
          label="Compromisos públicos"
          value={briefing?.metrics.commitments.public ?? null}
          detail={
            briefing
              ? `${briefing.metrics.commitments.atRisk} en riesgo`
              : "Datos no disponibles"
          }
          icon={Target}
          testId="public-commitments-metric"
          href="/dashboard/tasks"
          accent="emerald"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <article className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">
            Decisiones del corte
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            Riesgos que necesitan responsable
          </h2>
          <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
            {(briefing?.alerts ?? []).map((alert) => (
              <Link
                key={alert.code}
                href={alert.href}
                className="group grid grid-cols-[40px_1fr_auto] gap-3 py-5"
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
            ))}
            {loading && (
              <div className="flex items-center gap-3 py-8 text-sm font-semibold text-slate-500">
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

        <article className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
            Ruta de activación
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            Del primer caso a la rendición
          </h2>
          <div className="mt-6">
            {(briefing?.activation.steps ?? []).map((step, index) => (
              <Link
                key={step.code}
                href={step.href}
                className="group grid grid-cols-[34px_1fr_auto] gap-3 border-b border-slate-100 py-4 last:border-0"
              >
                <span
                  className={`grid h-8 w-8 place-items-center text-xs font-black ${
                    step.complete
                      ? "bg-blue-700 text-white"
                      : "border border-slate-300 text-slate-500"
                  }`}
                >
                  {step.complete ? <Check size={15} /> : index + 1}
                </span>
                <span>
                  <span className="block text-sm font-black text-slate-900">
                    {step.title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {step.detail}
                  </span>
                </span>
                <ArrowRight
                  className="mt-2 text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-700"
                  size={16}
                />
              </Link>
            ))}
            {!loading && !briefing && (
              <p className="py-6 text-sm text-slate-500">
                La ruta de activación no está disponible. Reintenta la consulta.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
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
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Operación conectada
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              Atender, ejecutar, demostrar
            </h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard/cases"
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-blue-700 px-5 text-sm font-black text-white transition hover:bg-blue-800"
            >
              <FileText size={17} /> Gestionar casos
            </Link>
            <Link
              href="/dashboard/tasks"
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50"
            >
              <ListChecks size={17} /> Tareas y compromisos
            </Link>
            {user?.backendRole === "ADMIN" && (
              <Link
                href="/dashboard/team"
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50"
              >
                <Users aria-hidden="true" size={17} /> Equipo
              </Link>
            )}
          </div>
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
    <article className="bg-white p-5 sm:p-6">
      <div className={`grid h-10 w-10 place-items-center ${accents[accent]}`}>
        <Icon size={20} aria-hidden="true" />
      </div>
      <p className="mt-5 text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">
        {label}
      </p>
      <p
        data-testid={testId}
        className="mt-1 text-3xl font-black tracking-tight text-slate-950"
      >
        {value === null ? "—" : formatNumber(value)}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
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
    <article className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-3">
        <Icon className="text-blue-700" size={20} aria-hidden="true" />
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
    </article>
  );
}
