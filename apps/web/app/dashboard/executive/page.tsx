"use client";

import { PageHeader } from "@/components/ui/PageHeader";

import { usePageRequest } from "@/lib/use-page-request";

import { ActivationChecklist } from "@/components/onboarding/ActivationChecklist";
import { getVisibleNavigationItems } from "@/config/navigation";
import { useAuth } from "@/context/auth";
import { apiRequest } from "@/lib/api-client";
import {
  briefingAlertCopy,
  canOpenBriefingLink,
  orderBriefingAlerts,
} from "@/lib/command-center-presentation";
import type { PoliticalOperationStage } from "@/types/saas-schema";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ListChecks,
  LoaderCircle,
  MapPinned,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

const OPERATION_STAGES: ReadonlyArray<{
  value: PoliticalOperationStage;
  label: string;
}> = [
  { value: "EXPLORATION", label: "Exploración" },
  { value: "PRE_CAMPAIGN", label: "Precandidatura" },
  { value: "SIGNATURE_COLLECTION", label: "Firmas" },
  { value: "CAMPAIGN", label: "Campaña" },
  { value: "ELECTION_PREPARATION", label: "Preparación" },
  { value: "SIMULATION", label: "Simulacro" },
  { value: "ELECTION_DAY", label: "Jornada" },
  { value: "POST_ELECTION", label: "Poselección" },
  { value: "CLOSED", label: "Cierre" },
];

interface ActivationStep {
  code: string;
  title: string;
  detail: string;
  href: string;
  complete: boolean;
}

interface CommandCenterBriefing {
  generatedAt: string;
  tenant: {
    id: string;
    name: string;
    mode: "CAMPAIGN" | "PUBLIC_OFFICE";
  };
  activation: {
    ready: boolean;
    completedSteps: number;
    totalSteps: number;
    steps: ActivationStep[];
  };
  metrics: {
    people: {
      total: number;
      consented: number;
      consentCoverage: number;
    };
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
  territorialCoverage: Array<{
    name: string;
    code: string;
    voterCount: number;
    goal: number | null;
    coveragePercent: number | null;
  }>;
  overdueItemsCount: number;
  teamActivationRate: number;
  alerts: Array<{
    code: string;
    severity: "critical" | "attention" | "ok";
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

type TrafficStatus = "red" | "yellow" | "green" | "neutral";

interface TrafficMetric {
  value: string;
  subtitle: string;
  status: TrafficStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isActivationStep(value: unknown): value is ActivationStep {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    typeof value.href === "string" &&
    typeof value.complete === "boolean"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBriefingAlert(
  value: unknown,
): value is CommandCenterBriefing["alerts"][number] {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    (value.severity === "critical" ||
      value.severity === "attention" ||
      value.severity === "ok") &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    typeof value.href === "string" &&
    (value.count === undefined || isFiniteNumber(value.count))
  );
}

function isAgendaEvent(
  value: unknown,
): value is CommandCenterBriefing["agenda"]["upcomingEvents"][number] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.startsAt === "string" &&
    typeof value.endsAt === "string" &&
    typeof value.status === "string"
  );
}

function isPriorityTask(
  value: unknown,
): value is CommandCenterBriefing["agenda"]["priorityTasks"][number] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "string" &&
    (value.priority === "URGENT" || value.priority === "HIGH") &&
    (value.dueAt === null || typeof value.dueAt === "string")
  );
}

function isCommandCenterBriefing(
  value: unknown,
): value is CommandCenterBriefing {
  if (!isRecord(value)) return false;

  const tenant = value.tenant;
  const activation = value.activation;
  const metrics = value.metrics;
  const coverage = value.territorialCoverage;
  const agenda = value.agenda;

  if (
    !isRecord(tenant) ||
    typeof tenant.id !== "string" ||
    typeof tenant.name !== "string" ||
    (tenant.mode !== "CAMPAIGN" && tenant.mode !== "PUBLIC_OFFICE") ||
    !isRecord(activation) ||
    typeof activation.ready !== "boolean" ||
    typeof activation.completedSteps !== "number" ||
    typeof activation.totalSteps !== "number" ||
    !Array.isArray(activation.steps) ||
    !activation.steps.every(isActivationStep) ||
    !isRecord(metrics) ||
    !isRecord(metrics.people) ||
    !isFiniteNumber(metrics.people.total) ||
    !isFiniteNumber(metrics.people.consented) ||
    !isFiniteNumber(metrics.people.consentCoverage) ||
    !isRecord(metrics.team) ||
    !isFiniteNumber(metrics.team.active) ||
    !isFiniteNumber(metrics.team.pendingInvitations) ||
    !isRecord(metrics.territory) ||
    !isFiniteNumber(metrics.territory.departments) ||
    !isFiniteNumber(metrics.territory.municipalities) ||
    !isFiniteNumber(metrics.territory.zones) ||
    !isFiniteNumber(metrics.territory.pollingPlaces) ||
    !isRecord(metrics.tasks) ||
    !isFiniteNumber(metrics.tasks.open) ||
    !isFiniteNumber(metrics.tasks.overdue) ||
    !isRecord(metrics.events) ||
    !isFiniteNumber(metrics.events.upcoming) ||
    !isRecord(metrics.finance) ||
    typeof metrics.finance.income !== "string" ||
    typeof metrics.finance.expenses !== "string" ||
    typeof metrics.finance.balance !== "string" ||
    !isFiniteNumber(metrics.finance.pending) ||
    !isFiniteNumber(metrics.finance.overdue) ||
    !isRecord(metrics.electionDay) ||
    !isFiniteNumber(metrics.electionDay.reports) ||
    !isFiniteNumber(metrics.electionDay.syncedReports) ||
    !isRecord(metrics.communications) ||
    !isFiniteNumber(metrics.communications.pendingApproval) ||
    !Array.isArray(coverage) ||
    !Array.isArray(value.alerts) ||
    !value.alerts.every(isBriefingAlert) ||
    !isRecord(agenda) ||
    !Array.isArray(agenda.upcomingEvents) ||
    !agenda.upcomingEvents.every(isAgendaEvent) ||
    !Array.isArray(agenda.priorityTasks) ||
    !agenda.priorityTasks.every(isPriorityTask)
  ) {
    return false;
  }

  return (
    typeof value.generatedAt === "string" &&
    Number.isFinite(value.overdueItemsCount) &&
    Number.isFinite(value.teamActivationRate) &&
    coverage.every(
      (division) =>
        isRecord(division) &&
        typeof division.name === "string" &&
        typeof division.code === "string" &&
        Number.isFinite(division.voterCount) &&
        (division.goal === null || Number.isFinite(division.goal)) &&
        (division.coveragePercent === null ||
          Number.isFinite(division.coveragePercent)),
    )
  );
}

function formatOperationalDate(value: string | null) {
  if (!value) return "Sin fecha definida";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(date);
}

function formatCop(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    notation: Math.abs(amount) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(amount);
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function finiteNumber(value: number | string): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function budgetMetric(
  finance: CommandCenterBriefing["metrics"]["finance"],
): TrafficMetric {
  const income = finiteNumber(finance.income);
  const expenses = finiteNumber(finance.expenses);

  if (income === null || expenses === null) {
    return {
      value: "Sin datos",
      subtitle: "El corte financiero no contiene valores válidos",
      status: "neutral",
    };
  }

  if (income <= 0) {
    if (expenses > 0) {
      return {
        value: "Sin base",
        subtitle: `${formatCop(expenses)} gastados sin ingresos registrados`,
        status: "red",
      };
    }

    return {
      value: "Sin movimientos",
      subtitle: "Aún no hay ingresos ni gastos registrados",
      status: "neutral",
    };
  }

  const percentage = (expenses / income) * 100;
  return {
    value: `${percentage.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`,
    subtitle: `${formatCop(expenses)} en gastos · ${formatCop(income)} en ingresos`,
    status: percentage > 100 ? "red" : percentage > 90 ? "yellow" : "green",
  };
}

function territoryMetric(
  coverage: CommandCenterBriefing["territorialCoverage"],
): TrafficMetric {
  const configured = coverage.filter(
    (division) =>
      division.goal !== null &&
      Number.isFinite(division.goal) &&
      division.goal > 0 &&
      Number.isFinite(division.voterCount),
  );

  if (configured.length === 0) {
    return {
      value: "Sin metas",
      subtitle:
        "No hay metas territoriales registradas para calcular la cobertura",
      status: "neutral",
    };
  }

  const totalGoal = configured.reduce(
    (total, division) => total + (division.goal ?? 0),
    0,
  );
  const totalVoters = configured.reduce(
    (total, division) => total + division.voterCount,
    0,
  );
  const percentage = (totalVoters / totalGoal) * 100;

  return {
    value: `${percentage.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`,
    subtitle: `${totalVoters.toLocaleString("es-CO")} de ${totalGoal.toLocaleString("es-CO")} vínculos en ${configured.length} territorios con meta`,
    status: percentage < 50 ? "red" : percentage <= 80 ? "yellow" : "green",
  };
}

function overdueMetric(value: number): TrafficMetric {
  const overdue = finiteNumber(value);
  if (overdue === null) {
    return {
      value: "Sin datos",
      subtitle: "El corte no informó vencimientos",
      status: "neutral",
    };
  }

  const count = Math.max(0, Math.trunc(overdue));
  return {
    value: count.toLocaleString("es-CO"),
    subtitle:
      count === 1
        ? "Tarea o compromiso vencido"
        : "Tareas o compromisos vencidos",
    status: count > 10 ? "red" : count > 0 ? "yellow" : "green",
  };
}

function teamMetric(value: number): TrafficMetric {
  const activationRate = finiteNumber(value);
  if (activationRate === null) {
    return {
      value: "Sin datos",
      subtitle: "El corte no informó la activación del equipo",
      status: "neutral",
    };
  }

  const percentage = Math.max(0, activationRate);
  return {
    value: `${percentage.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`,
    subtitle: "Cuentas activas sobre las cuentas del equipo",
    status: percentage < 50 ? "red" : percentage <= 80 ? "yellow" : "green",
  };
}

export default function ExecutivePage() {
  const { tenant, user } = useAuth();
  const request = useCallback(async (signal: AbortSignal) => {
    const result = await apiRequest<unknown>("command-center/briefing", {
      signal,
    });
    if (!isCommandCenterBriefing(result))
      throw new Error(
        "El centro de mando devolvió una respuesta incompleta. Reintenta en unos minutos.",
      );
    return result;
  }, []);
  const {
    data: briefing,
    loading,
    error: requestError,
    refresh: loadBriefing,
  } = usePageRequest(request);
  const error =
    requestError instanceof Error
      ? requestError.message
      : requestError
        ? "No fue posible consolidar el centro de mando."
        : null;

  if (loading && !briefing) {
    return (
      <div
        className="flex h-[50vh] items-center justify-center"
        role="status"
        aria-label="Cargando cuadro de mando"
      >
        <LoaderCircle
          className="animate-spin text-slate-400"
          aria-hidden="true"
          size={48}
        />
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="mx-auto min-w-0 max-w-[1440px] space-y-6">
        <PageHeader
          title="Cuadro de mando"
          icon={Activity}
          description={tenant?.name ?? "Operación política"}
        />
        <section
          role="alert"
          className="rounded-3xl border border-red-200 bg-red-50 p-8 text-red-950"
        >
          <AlertTriangle aria-hidden="true" size={36} />
          <h2 className="mt-5 text-2xl font-black">
            No pudimos cargar el corte ejecutivo
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6">
            {error ?? "La respuesta del centro de mando no está disponible."}
          </p>
          <button
            type="button"
            onClick={() => void loadBriefing()}
            disabled={loading}
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-5 text-sm font-black text-white transition hover:bg-red-800 disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={loading ? "animate-spin" : undefined}
              size={18}
            />
            {loading ? "Reintentando…" : "Reintentar consulta"}
          </button>
        </section>
      </div>
    );
  }

  const budget = budgetMetric(briefing.metrics.finance);
  const territoryCoverage = territoryMetric(briefing.territorialCoverage);
  const overdue = overdueMetric(briefing.overdueItemsCount);
  const team = teamMetric(briefing.teamActivationRate);
  const generatedAt = formatGeneratedAt(briefing.generatedAt);
  const canManageTeam = user?.backendRole === "ADMIN";
  const canOpenElectionOperations = Boolean(
    user &&
    tenant &&
    getVisibleNavigationItems(user, tenant, tenant.operationStage ?? null).some(
      ({ href }) => href === "/dashboard/war-room",
    ),
  );
  const electionOperationsUnavailableReason =
    tenant?.type !== "CANDIDACY"
      ? "Disponible solo para una candidatura."
      : "Se habilita desde la preparación electoral, según la etapa configurada.";
  const visibleHrefs =
    user && tenant
      ? getVisibleNavigationItems(
          user,
          tenant,
          tenant.operationStage ?? null,
        ).map((item) => item.href)
      : [];
  const orderedAlerts = orderBriefingAlerts(briefing.alerts);
  const attentionAlerts = orderedAlerts.filter(
    (alert) => alert.severity !== "ok",
  );
  const featuredAlert = attentionAlerts[0];
  const featuredCopy = featuredAlert ? briefingAlertCopy(featuredAlert) : null;
  const shortcuts = [
    {
      href: "/dashboard/tasks",
      label: "Tareas y compromisos",
      detail: "Organiza el trabajo",
      icon: ListChecks,
    },
    {
      href: "/dashboard/events",
      label: "Agenda del equipo",
      detail: "Consulta y programa",
      icon: CalendarClock,
    },
    {
      href: "/dashboard/votantes",
      label: "Personas e importación",
      detail: "Abre tu base de contactos",
      icon: Users,
    },
  ].filter((item) => visibleHrefs.includes(item.href));

  return (
    <div className="mx-auto min-w-0 max-w-[1440px] space-y-6">
      <PageHeader
        title="Cuadro de mando"
        className="command-heading"
        eyebrow="Tu espacio de dirección"
        description="Lo que necesita atención y el trabajo de tu equipo."
        meta={generatedAt ? `Actualizado el ${generatedAt}` : undefined}
        actions={
          <button
            type="button"
            aria-label="Actualizar cuadro de mando"
            title="Actualizar cuadro de mando"
            onClick={() => void loadBriefing()}
            disabled={loading}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60 sm:px-4"
          >
            <RefreshCw
              aria-hidden="true"
              size={18}
              className={loading ? "animate-spin" : undefined}
            />
            <span className="hidden sm:inline">
              {loading ? "Actualizando…" : "Actualizar"}
            </span>
          </button>
        }
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
        >
          <AlertTriangle aria-hidden="true" size={28} className="shrink-0" />
          <div>
            <p className="font-black">No se pudo actualizar el corte.</p>
            <p className="mt-1 text-sm font-semibold leading-6">
              {error} Se mantienen visibles los últimos datos recibidos.
            </p>
          </div>
        </div>
      )}

      <OperationLifecycle currentStage={tenant?.operationStage ?? null} />

      <section
        aria-label="Atención y accesos de trabajo"
        className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]"
      >
        <article className="command-focus min-w-0 rounded-[20px] p-5 text-white sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-blue-100">
            <span className="inline-flex items-center gap-2">
              <Activity aria-hidden="true" size={16} /> Atención de la operación
            </span>
            {featuredAlert?.severity === "critical" && (
              <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-900">
                Alerta crítica
              </span>
            )}
            {attentionAlerts.length > 0 && (
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5">
                {attentionAlerts.length}{" "}
                {attentionAlerts.length === 1 ? "asunto" : "asuntos"}
              </span>
            )}
          </div>
          <h2 className="mt-3 max-w-2xl text-xl font-semibold tracking-tight sm:text-2xl">
            {featuredCopy?.title ?? "Consulta el trabajo de tu equipo"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
            {featuredCopy?.detail ??
              "No hay alertas pendientes en este corte. Consulta la agenda y las tareas para continuar."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {featuredAlert &&
            canOpenBriefingLink(featuredAlert.href, visibleHrefs) ? (
              <Link
                href={featuredAlert.href}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-blue-900 shadow-sm transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Revisar ahora <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ) : featuredAlert ? (
              <p className="text-sm text-blue-100">
                Consulta este asunto con el responsable de la sección.
              </p>
            ) : visibleHrefs.includes("/dashboard/tasks") ? (
              <Link
                href="/dashboard/tasks"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Abrir tareas <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ) : null}
            {attentionAlerts.length > 1 && (
              <a
                href="#command-attention"
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-white underline decoration-white/40 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Ver todos los asuntos
              </a>
            )}
          </div>
        </article>
        <div className="workspace-panel min-w-0 px-5 py-2">
          {shortcuts.map(({ href, label, detail, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-[68px] items-center gap-3 rounded-lg border-b border-slate-100 py-3 last:border-0 focus-ring"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-700">
                <Icon aria-hidden="true" size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                  {label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {detail}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                size={16}
                className="shrink-0 text-slate-400 group-hover:text-blue-700"
              />
            </Link>
          ))}
        </div>
      </section>

      <section
        aria-label="Resumen de la operación"
        className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <TrafficCard
          title="Gastos sobre ingresos"
          value={budget.value}
          subtitle={budget.subtitle}
          status={budget.status}
          icon={CircleDollarSign}
          href="/dashboard/finance"
          action="Ver movimientos"
        />
        <TrafficCard
          title="Cobertura de metas"
          value={territoryCoverage.value}
          subtitle={territoryCoverage.subtitle}
          status={territoryCoverage.status}
          icon={Users}
          href="/dashboard/territory"
          action="Revisar metas"
        />
        <TrafficCard
          title="Pendientes vencidos"
          value={overdue.value}
          subtitle={overdue.subtitle}
          status={overdue.status}
          icon={ListChecks}
          href="/dashboard/tasks"
          action="Ver pendientes"
        />
        <TrafficCard
          title="Cuentas activas"
          value={team.value}
          subtitle={
            canManageTeam
              ? team.subtitle
              : `${team.subtitle}. La gestión de accesos corresponde a Administración.`
          }
          status={team.status}
          icon={Activity}
          href={canManageTeam ? "/dashboard/team" : undefined}
          action="Ver equipo"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CampaignAgendaPanel
          title="Agenda próxima"
          href="/dashboard/events"
          linkLabel="Ver agenda"
          icon={CalendarClock}
          empty="No hay actividades programadas para las próximas dos semanas."
        >
          {briefing.agenda.upcomingEvents.map((event) => (
            <Link
              key={event.id}
              href="/dashboard/events"
              className="group flex items-center justify-between gap-4 rounded-lg border-t border-slate-100 py-4 first:border-0 focus-ring"
            >
              <span>
                <span className="block text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                  {event.name}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {formatOperationalDate(event.startsAt)}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="shrink-0 text-slate-300"
                size={16}
              />
            </Link>
          ))}
        </CampaignAgendaPanel>

        <CampaignAgendaPanel
          title="Tareas de alta prioridad"
          href="/dashboard/tasks"
          linkLabel="Ver tareas"
          icon={ListChecks}
          empty="No hay tareas urgentes o de alta prioridad abiertas."
        >
          {briefing.agenda.priorityTasks.map((task) => (
            <Link
              key={task.id}
              href={`/dashboard/tasks?view=tasks&entityId=${encodeURIComponent(task.id)}`}
              className="group flex items-center justify-between gap-4 rounded-lg border-t border-slate-100 py-4 first:border-0 focus-ring"
            >
              <span>
                <span className="block text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                  {task.title}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {task.priority === "URGENT" ? "Urgente" : "Alta"} ·{" "}
                  {formatOperationalDate(task.dueAt)}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="shrink-0 text-slate-300"
                size={16}
              />
            </Link>
          ))}
        </CampaignAgendaPanel>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-2">
        <article
          id="command-attention"
          tabIndex={-1}
          className="workspace-panel min-w-0 scroll-mt-6 p-5 outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:p-6"
        >
          <p className="text-xs font-semibold text-slate-500">Seguimiento</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            Todos los asuntos del corte
          </h2>
          <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
            {orderedAlerts.map((alert) => {
              const copy = briefingAlertCopy(alert);
              const canOpen = canOpenBriefingLink(alert.href, visibleHrefs);
              const content = (
                <>
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${alert.severity === "critical" ? "bg-red-50 text-red-700" : alert.severity === "attention" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}
                  >
                    {alert.severity === "ok" ? (
                      <CheckCircle2 aria-hidden="true" size={18} />
                    ) : (
                      <AlertTriangle aria-hidden="true" size={18} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {copy.title}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-600">
                      {copy.detail}
                    </span>
                    {!canOpen && (
                      <span className="mt-1 block text-xs text-slate-500">
                        Consulta con el responsable de la sección.
                      </span>
                    )}
                  </span>
                  {canOpen && (
                    <ArrowRight
                      aria-hidden="true"
                      className="mt-2 text-slate-400 group-hover:text-blue-700"
                      size={16}
                    />
                  )}
                </>
              );
              return canOpen ? (
                <Link
                  key={alert.code}
                  href={alert.href}
                  className="group grid min-w-0 grid-cols-[36px_minmax(0,1fr)_16px] gap-3 rounded-lg py-4 focus-ring"
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={alert.code}
                  className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] gap-3 py-4"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </article>

        <ActivationChecklist briefing={briefing} loading={loading} />
      </section>

      <section
        aria-label="Indicadores operativos de campaña"
        className="grid min-w-0 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4"
      >
        <OperationalMetric
          label="Vínculos autorizados"
          value={`${briefing.metrics.people.consented.toLocaleString("es-CO")} / ${briefing.metrics.people.total.toLocaleString("es-CO")}`}
          detail={`${briefing.metrics.people.consentCoverage.toLocaleString("es-CO")}% con autorización vigente`}
          href="/dashboard/votantes"
          icon={ShieldCheck}
        />
        <OperationalMetric
          label="Puestos electorales"
          value={briefing.metrics.territory.pollingPlaces.toLocaleString(
            "es-CO",
          )}
          detail={`${briefing.metrics.territory.zones.toLocaleString("es-CO")} zonas configuradas`}
          href="/dashboard/territory"
          icon={MapPinned}
        />
        <OperationalMetric
          label="Actas aceptadas"
          value={briefing.metrics.electionDay.reports.toLocaleString("es-CO")}
          detail={`${briefing.metrics.electionDay.syncedReports.toLocaleString("es-CO")} sincronizadas`}
          href={canOpenElectionOperations ? "/dashboard/war-room" : undefined}
          unavailableReason={electionOperationsUnavailableReason}
          icon={ListChecks}
        />
        <OperationalMetric
          label="Comunicaciones por revisar"
          value={briefing.metrics.communications.pendingApproval.toLocaleString(
            "es-CO",
          )}
          detail="Esperan una decisión humana independiente"
          href="/dashboard/communications"
          icon={MessageSquareText}
        />
      </section>

      <p className="text-xs leading-5 text-slate-500">
        Este corte es operativo e interno; no equivale a una certificación de
        autoridad electoral, contable o de protección de datos.
      </p>
    </div>
  );
}

function OperationLifecycle({
  currentStage,
}: {
  currentStage: PoliticalOperationStage | null;
}) {
  const currentIndex = currentStage
    ? OPERATION_STAGES.findIndex(({ value }) => value === currentStage)
    : -1;
  return (
    <section
      aria-label="Ciclo de la operación política"
      className="flex min-w-0 flex-col items-stretch gap-2 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-1 sm:flex-row sm:items-start sm:gap-4"
    >
      <details className="group/steps min-w-0 flex-1">
        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-2 focus-ring [&::-webkit-details-marker]:hidden">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-blue-600"
            aria-hidden="true"
          />
          <span className="text-xs text-slate-500">Etapa actual</span>
          <h2 className="text-sm font-semibold text-slate-800">
            {currentIndex >= 0
              ? OPERATION_STAGES[currentIndex].label
              : "Perfil pendiente"}
          </h2>
          <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-slate-600">
            Ver etapas{" "}
            <ChevronDown
              aria-hidden="true"
              size={16}
              className="transition-transform group-open/steps:rotate-180"
            />
          </span>
        </summary>
        <div className="px-2 pb-2">
          <p className="pb-2 pt-1 text-sm leading-6 text-slate-600">
            {currentIndex < 0
              ? "Completa el perfil para organizar las etapas y consultar los requisitos de la operación."
              : "Consulta los requisitos y el historial antes de avanzar de etapa."}
          </p>
          <ol className="grid min-w-0 grid-cols-3 gap-2 pb-3 pt-2 xl:grid-cols-9">
            {OPERATION_STAGES.map((stage, index) => {
              const status =
                currentIndex < 0
                  ? "pending"
                  : index < currentIndex
                    ? "previous"
                    : index === currentIndex
                      ? "current"
                      : "pending";
              return (
                <li
                  key={stage.value}
                  aria-current={status === "current" ? "step" : undefined}
                  className={`min-w-0 rounded-lg border px-1 py-2.5 text-center text-[11px] leading-4 font-semibold [overflow-wrap:anywhere] sm:text-xs ${
                    status === "current"
                      ? "border-blue-700 bg-blue-700 text-white"
                      : status === "previous"
                        ? "border-slate-300 bg-slate-100 text-slate-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  <span className="mb-1 block text-xs opacity-70">
                    {index + 1}
                  </span>
                  {stage.label}
                </li>
              );
            })}
          </ol>
        </div>
      </details>
      <Link
        href="/dashboard/operation-profile"
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 focus-ring sm:my-0.5"
      >
        Revisar alistamiento <ArrowRight aria-hidden="true" size={15} />
      </Link>
    </section>
  );
}

function OperationalMetric({
  label,
  value,
  detail,
  href,
  unavailableReason,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
  unavailableReason?: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <article className="min-w-0 bg-white p-5">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
        <Icon aria-hidden="true" size={20} />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs leading-5 text-slate-500">
          {detail}
        </p>
        {href ? (
          <Link
            href={href}
            aria-label={`Abrir ${label.toLowerCase()}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-blue-700 transition-colors hover:bg-blue-50 focus-ring"
          >
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        ) : (
          <span className="basis-full text-xs leading-5 text-amber-800">
            {unavailableReason ?? "Modulo no habilitado para este contexto."}
          </span>
        )}
      </div>
    </article>
  );
}

function CampaignAgendaPanel({
  title,
  href,
  linkLabel,
  icon: Icon,
  empty,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  icon: typeof CalendarClock;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : children ? [children] : [];

  return (
    <article className="workspace-panel min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            aria-hidden="true"
            className="shrink-0 text-slate-500"
            size={18}
          />
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        </div>
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-ring"
        >
          {linkLabel}
          <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </div>
      <div className="mt-4">
        {items.length > 0 ? (
          children
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            {empty}
          </p>
        )}
      </div>
    </article>
  );
}

function TrafficCard({
  title,
  value,
  subtitle,
  status,
  icon: Icon,
  href,
  action,
}: {
  title: string;
  value: string;
  subtitle: string;
  status: TrafficStatus;
  icon: typeof CircleDollarSign;
  href?: string;
  action: string;
}) {
  const statusColors: Record<TrafficStatus, string> = {
    red: "border-red-200 bg-red-50 text-red-800",
    yellow: "border-amber-200 bg-amber-50 text-amber-800",
    green: "border-slate-200 bg-slate-50 text-slate-600",
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
  };

  const statusLabels: Record<TrafficStatus, string> = {
    red: "Requiere atención",
    yellow: "Por revisar",
    green: "",
    neutral: "",
  };

  const card = (
    <article className="command-metric flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 transition-colors group-hover:border-blue-300 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h2 className="min-w-0 text-sm leading-5 font-medium text-slate-600">
          {title}
        </h2>
        <div
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${statusColors[status]}`}
        >
          <Icon aria-hidden="true" size={17} />
        </div>
      </div>
      <p
        className={`mt-2 break-words font-semibold leading-tight tracking-tight tabular-nums ${status === "neutral" ? "text-xl text-slate-500" : "text-3xl text-slate-950"}`}
      >
        {value}
      </p>
      <p className="mt-2 flex-1 text-xs leading-5 text-slate-600">{subtitle}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1">
        {statusLabels[status] ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusColors[status]}`}
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-current"
            />
            {statusLabels[status]}
          </span>
        ) : (
          <span className="text-xs font-medium text-slate-500 group-hover:text-blue-700">
            {href ? action : "Solo consulta"}
          </span>
        )}
        {href && (
          <ArrowRight
            aria-hidden="true"
            size={17}
            className="text-slate-400 group-hover:text-blue-700"
          />
        )}
      </div>
    </article>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      aria-label={`Abrir ${title.toLowerCase()}`}
      className="group block min-w-0 rounded-2xl focus-ring"
    >
      {card}
    </Link>
  );
}
