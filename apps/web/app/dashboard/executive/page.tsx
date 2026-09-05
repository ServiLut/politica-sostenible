"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Users,
  ListChecks,
  Activity,
  LoaderCircle,
  RefreshCw,
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
  tenant: {
    id: string;
    name: string;
  };
  finances?: {
    totalIncome: number;
    totalExpenses: number;
  };
  territoryCoverage?: {
    overallPercentage: number;
  };
  overdueTasks?: number;
  teamActivation?: {
    activePercentage: number;
  };
  compliance?: {
    overallStatus: string;
  };
  // Fallbacks for the checklist
  activation?: {
    ready: boolean;
    completedSteps: number;
    totalSteps: number;
    steps: ActivationStep[];
  };
}

function formatCop(amount: number) {
  if (!Number.isFinite(amount)) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    notation: Math.abs(amount) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(amount);
}

export default function ExecutivePage() {
  const { tenant, user } = useAuth();
  const [briefing, setBriefing] = useState<CommandCenterBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<CommandCenterBriefing>("command-center/briefing");
      setBriefing(result);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible consolidar el centro de mando."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  if (loading && !briefing) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <LoaderCircle className="animate-spin text-slate-400" size={48} />
      </div>
    );
  }

  const income = briefing?.finances?.totalIncome ?? 0;
  const expenses = briefing?.finances?.totalExpenses ?? 0;
  const budgetPercentage = income > 0 ? (expenses / income) * 100 : 0;
  let budgetStatus: "red" | "yellow" | "green" = "green";
  if (budgetPercentage > 100) budgetStatus = "red";
  else if (budgetPercentage > 90) budgetStatus = "yellow";

  const territoryPercentage = briefing?.territoryCoverage?.overallPercentage ?? 0;
  let territoryStatus: "red" | "yellow" | "green" = "green";
  if (territoryPercentage < 50) territoryStatus = "red";
  else if (territoryPercentage <= 80) territoryStatus = "yellow";

  const overdue = briefing?.overdueTasks ?? 0;
  let overdueStatus: "red" | "yellow" | "green" = "green";
  if (overdue > 10) overdueStatus = "red";
  else if (overdue > 0) overdueStatus = "yellow";

  const teamPercentage = briefing?.teamActivation?.activePercentage ?? 0;
  let teamStatus: "red" | "yellow" | "green" = "green";
  if (teamPercentage < 50) teamStatus = "red";
  else if (teamPercentage <= 80) teamStatus = "yellow";

  return (
    <main id="main-content" className="mx-auto max-w-[1500px] space-y-8 p-4 sm:p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl text-slate-900">
            Cuadro de Mando
          </h1>
          <p className="mt-2 text-xl font-medium text-slate-500">
            {briefing?.tenant?.name ?? tenant?.name ?? "Operación Política"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadBriefing()}
          disabled={loading}
          className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
        >
          <RefreshCw size={28} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {error && (
        <div className="flex items-center gap-4 rounded-2xl bg-red-50 p-6 text-red-800">
          <AlertTriangle size={32} className="shrink-0" />
          <p className="text-xl font-bold">{error}</p>
        </div>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        <TrafficCard
          title="Ejecución Presupuestal"
          value={`${budgetPercentage.toFixed(1)}%`}
          subtitle={`${formatCop(expenses)} gastados de ${formatCop(income)}`}
          status={budgetStatus}
          icon={CircleDollarSign}
        />
        <TrafficCard
          title="Cumplimiento de Metas"
          value={`${territoryPercentage.toFixed(1)}%`}
          subtitle="Cobertura territorial y votantes contactados"
          status={territoryStatus}
          icon={Users}
        />
        <TrafficCard
          title="Procesos Críticos"
          value={String(overdue)}
          subtitle={overdue === 1 ? "Tarea vencida o caso urgente" : "Tareas vencidas o casos urgentes"}
          status={overdueStatus}
          icon={ListChecks}
        />
        <TrafficCard
          title="Termómetro del Equipo"
          value={`${teamPercentage.toFixed(1)}%`}
          subtitle="Activación del equipo de campaña"
          status={teamStatus}
          icon={Activity}
        />
      </section>

      {briefing?.compliance?.overallStatus !== "ready" && briefing?.activation && (
        <section className="mt-12 rounded-3xl bg-white p-8 shadow-sm border border-slate-200">
          <ActivationChecklist briefing={briefing as any} loading={loading} />
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
}: {
  title: string;
  value: string;
  subtitle: string;
  status: "red" | "yellow" | "green";
  icon: typeof CircleDollarSign;
}) {
  const statusColors = {
    red: "bg-red-500 text-white border-red-600",
    yellow: "bg-amber-400 text-slate-900 border-amber-500",
    green: "bg-emerald-500 text-white border-emerald-600",
  };

  const statusIcons = {
    red: <AlertTriangle size={48} className="opacity-80" />,
    yellow: <AlertTriangle size={48} className="opacity-80" />,
    green: <CheckCircle2 size={48} className="opacity-80" />,
  };

  return (
    <article
      className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border-b-8 p-8 shadow-lg ${statusColors[status]}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-wider opacity-90">
            {title}
          </h2>
          <p className="mt-6 text-7xl font-black tracking-tighter">
            {value}
          </p>
        </div>
        <div className="rounded-2xl bg-white/20 p-4 backdrop-blur-md">
          <Icon size={48} />
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
}

