"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ListChecks,
  LoaderCircle,
  MapPinned,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import { useAuth } from "@/context/auth";
import { ActivationChecklist } from "@/components/onboarding/ActivationChecklist";
import { getVisibleNavigationItems } from "@/config/navigation";
import type { PoliticalOperationStage } from "@/types/saas-schema";

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
    value: `${percentage.toFixed(1)}%`,
    subtitle: `${formatCop(expenses)} gastados de ${formatCop(income)}`,
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
    value: `${percentage.toFixed(1)}%`,
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
    value: `${percentage.toFixed(1)}%`,
    subtitle: "Integrantes activos sobre el equipo registrado",
    status: percentage < 50 ? "red" : percentage <= 80 ? "yellow" : "green",
  };
}

export default function ExecutivePage() {
  const { tenant, user } = useAuth();
  const [briefing, setBriefing] = useState<CommandCenterBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const loadBriefing = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);

    try {
      const result = await apiRequest<unknown>("command-center/briefing", {
        signal: controller.signal,
      });
      if (!isCommandCenterBriefing(result)) {
        throw new Error(
          "El centro de mando devolvió una respuesta incompleta. Reintenta en unos minutos.",
        );
      }
      if (!controller.signal.aborted) setBriefing(result);
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : "No fue posible consolidar el centro de mando.",
      );
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadBriefing();
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [loadBriefing]);

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
      <main
        id="main-content"
        className="mx-auto max-w-[1500px] space-y-8 p-4 sm:p-8"
      >
        <header>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Cuadro de Mando
          </h1>
          <p className="mt-2 text-xl font-medium text-slate-500">
            {tenant?.name ?? "Operación Política"}
          </p>
        </header>
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
      </main>
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

  return (
    <main
      id="main-content"
      className="mx-auto max-w-[1500px] space-y-8 p-4 sm:p-8"
    >
      <header className="flex items-start justify-between gap-5">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Cuadro de Mando
          </h1>
          <p className="mt-2 text-xl font-medium text-slate-500">
            {briefing.tenant.name}
          </p>
          {generatedAt && (
            <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Corte del {generatedAt}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Actualizar cuadro de mando"
          title="Actualizar cuadro de mando"
          onClick={() => void loadBriefing()}
          disabled={loading}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 disabled:opacity-50 sm:h-16 sm:w-16"
        >
          <RefreshCw
            aria-hidden="true"
            size={28}
            className={loading ? "animate-spin" : undefined}
          />
        </button>
      </header>

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

      <section className="grid gap-6 md:grid-cols-2">
        <TrafficCard
          title="Ejecución Presupuestal"
          value={budget.value}
          subtitle={budget.subtitle}
          status={budget.status}
          icon={CircleDollarSign}
          href="/dashboard/finance"
        />
        <TrafficCard
          title="Cumplimiento de Metas"
          value={territoryCoverage.value}
          subtitle={territoryCoverage.subtitle}
          status={territoryCoverage.status}
          icon={Users}
          href="/dashboard/territory"
        />
        <TrafficCard
          title="Procesos Críticos"
          value={overdue.value}
          subtitle={overdue.subtitle}
          status={overdue.status}
          icon={ListChecks}
          href="/dashboard/tasks"
        />
        <TrafficCard
          title="Termómetro del Equipo"
          value={team.value}
          subtitle={
            canManageTeam
              ? team.subtitle
              : `${team.subtitle}. La gestión de accesos corresponde a Administración.`
          }
          status={team.status}
          icon={Activity}
          href={canManageTeam ? "/dashboard/team" : undefined}
        />
      </section>

      <section
        aria-label="Indicadores operativos de campaña"
        className="grid gap-px overflow-hidden rounded-3xl bg-slate-200 sm:grid-cols-2 xl:grid-cols-4"
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">
            Decisiones del corte
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            Riesgos que necesitan responsable
          </h2>
          <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
            {briefing.alerts.map((alert) => (
              <Link
                key={alert.code}
                href={alert.href}
                className="group grid grid-cols-[40px_1fr_auto] gap-3 py-5"
              >
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl ${
                    alert.severity === "critical"
                      ? "bg-red-50 text-red-700"
                      : alert.severity === "attention"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {alert.severity === "ok" ? (
                    <CheckCircle2 aria-hidden="true" size={19} />
                  ) : (
                    <AlertTriangle aria-hidden="true" size={19} />
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
                  aria-hidden="true"
                  className="mt-3 text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-800"
                  size={17}
                />
              </Link>
            ))}
          </div>
        </article>

        <ActivationChecklist briefing={briefing} loading={loading} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CampaignAgendaPanel
          title="Agenda próxima"
          icon={CalendarClock}
          empty="No hay actividades programadas para las próximas dos semanas."
        >
          {briefing.agenda.upcomingEvents.map((event) => (
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
          icon={ListChecks}
          empty="No hay tareas urgentes o de alta prioridad abiertas."
        >
          {briefing.agenda.priorityTasks.map((task) => (
            <Link
              key={task.id}
              href={`/dashboard/tasks?view=tasks&entityId=${encodeURIComponent(task.id)}`}
              className="flex items-center justify-between gap-4 border-t border-slate-100 py-4 first:border-0"
            >
              <span>
                <span className="block text-sm font-black text-slate-900">
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

      <p className="text-right text-[11px] font-semibold text-slate-400">
        Este corte es operativo e interno; no equivale a una certificación de
        autoridad electoral, contable o de protección de datos.
      </p>
    </main>
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
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
            Ciclo electoral controlado
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            {currentIndex >= 0
              ? `Etapa actual: ${OPERATION_STAGES[currentIndex].label}`
              : "Perfil operativo pendiente"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Cada avance requiere alistamiento y queda registrado; una etapa no
            se presume por el calendario ni por una decisión de la interfaz.
          </p>
        </div>
        <Link
          href="/dashboard/operation-profile"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-black text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
        >
          Revisar alistamiento <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
      <ol className="mt-6 grid gap-2 sm:grid-cols-3 xl:grid-cols-9">
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
              className={`rounded-xl border px-3 py-3 text-center text-[11px] font-black uppercase tracking-wide ${
                status === "current"
                  ? "border-blue-700 bg-blue-700 text-white"
                  : status === "previous"
                    ? "border-slate-300 bg-slate-100 text-slate-700"
                    : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              <span className="block text-[10px] opacity-70">{index + 1}</span>
              {stage.label}
            </li>
          );
        })}
      </ol>
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
    <article className="bg-white p-6">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
        <Icon aria-hidden="true" size={20} />
      </div>
      <p className="mt-5 text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">
        {value}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{detail}</p>
        {href ? (
          <Link href={href} aria-label={`Abrir ${label.toLowerCase()}`}>
            <ArrowRight
              aria-hidden="true"
              className="text-slate-300"
              size={15}
            />
          </Link>
        ) : (
          <span className="max-w-48 text-right text-[11px] font-bold leading-4 text-amber-800">
            {unavailableReason ?? "Modulo no habilitado para este contexto."}
          </span>
        )}
      </div>
    </article>
  );
}

function CampaignAgendaPanel({
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
  const items = Array.isArray(children) ? children : children ? [children] : [];

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-3">
        <Icon aria-hidden="true" className="text-blue-700" size={20} />
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      <div className="mt-4">
        {items.length > 0 ? (
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

function TrafficCard({
  title,
  value,
  subtitle,
  status,
  icon: Icon,
  href,
}: {
  title: string;
  value: string;
  subtitle: string;
  status: TrafficStatus;
  icon: typeof CircleDollarSign;
  href?: string;
}) {
  const statusColors: Record<TrafficStatus, string> = {
    red: "border-red-600 bg-red-500 text-white",
    yellow: "border-amber-500 bg-amber-400 text-slate-900",
    green: "border-emerald-600 bg-emerald-500 text-white",
    neutral: "border-slate-400 bg-slate-200 text-slate-900",
  };

  const statusIcons: Record<TrafficStatus, React.ReactNode> = {
    red: <AlertTriangle aria-hidden="true" size={48} className="opacity-80" />,
    yellow: (
      <AlertTriangle aria-hidden="true" size={48} className="opacity-80" />
    ),
    green: <CheckCircle2 aria-hidden="true" size={48} className="opacity-80" />,
    neutral: <Activity aria-hidden="true" size={48} className="opacity-60" />,
  };

  const card = (
    <article
      className={`relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border-b-8 p-8 shadow-lg ${statusColors[status]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-wider opacity-90">
            {title}
          </h2>
          <p className="mt-6 break-words text-5xl font-black tracking-tighter sm:text-7xl">
            {value}
          </p>
        </div>
        <div className="shrink-0 rounded-2xl bg-white/20 p-4 backdrop-blur-md">
          <Icon aria-hidden="true" size={48} />
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        {statusIcons[status]}
        <p className="text-xl font-medium leading-tight opacity-90">
          {subtitle}
        </p>
      </div>
    </article>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      aria-label={`Abrir ${title.toLowerCase()}`}
      className="block transition-transform hover:scale-[1.02]"
    >
      {card}
    </Link>
  );
}
