"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  Users,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import { useAuth } from "@/context/auth";
import { ActivationChecklist } from "@/components/onboarding/ActivationChecklist";

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
    finance: {
      income: string;
      expenses: string;
    };
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

function isCommandCenterBriefing(
  value: unknown,
): value is CommandCenterBriefing {
  if (!isRecord(value)) return false;

  const tenant = value.tenant;
  const activation = value.activation;
  const metrics = value.metrics;
  const coverage = value.territorialCoverage;

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
    !isRecord(metrics.finance) ||
    typeof metrics.finance.income !== "string" ||
    typeof metrics.finance.expenses !== "string" ||
    !Array.isArray(coverage)
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

      {!briefing.activation.ready && (
        <section className="mt-12 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <ActivationChecklist briefing={briefing} loading={loading} />
        </section>
      )}
    </main>
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
