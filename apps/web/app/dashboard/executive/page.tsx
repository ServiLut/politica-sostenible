"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  Loader2,
  MapPinned,
  RefreshCw,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import { useAuth } from "@/context/auth";

interface VoterStats {
  total: number;
  signatures: number;
  consented?: number;
}

interface FinanceSummary {
  totalExpenses: number;
  totalIncome: number;
  balance: number;
}

interface FinancialEntry {
  id: string;
  date: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REPORTED_CNE";
}

interface WitnessReport {
  id: string;
  isSynced: boolean;
  createdAt: string;
}

interface Overview {
  voters: VoterStats;
  finance: FinanceSummary;
  financialEntries: FinancialEntry[];
  witnessReports: WitnessReport[];
}

const EMPTY_OVERVIEW: Overview = {
  voters: { total: 0, signatures: 0, consented: 0 },
  finance: { totalExpenses: 0, totalIncome: 0, balance: 0 },
  financialEntries: [],
  witnessReports: [],
};

function formatCop(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export default function ExecutivePage() {
  const { tenant, user } = useAuth();
  const [overview, setOverview] = useState<Overview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [voters, finance, financialEntries, witnessReports] =
        await Promise.all([
          apiRequest<VoterStats>("voters/stats"),
          apiRequest<FinanceSummary>("finance/summary"),
          apiRequest<FinancialEntry[]>("finance"),
          apiRequest<WitnessReport[]>("witnesses"),
        ]);
      setOverview({ voters, finance, financialEntries, witnessReports });
      setUpdatedAt(new Date());
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
    void loadOverview();
  }, [loadOverview]);

  const compliance = useMemo(() => {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const overdueFinance = overview.financialEntries.filter(
      (entry) =>
        entry.status === "PENDING" &&
        now - new Date(entry.date).getTime() > week,
    ).length;
    const consented = overview.voters.consented ?? 0;
    const consentCoverage = overview.voters.total
      ? Math.round((consented / overview.voters.total) * 100)
      : 100;
    const syncedReports = overview.witnessReports.filter(
      (report) => report.isSynced,
    ).length;

    return { overdueFinance, consented, consentCoverage, syncedReports };
  }, [overview]);

  const priorities = useMemo(() => {
    const items: Array<{
      title: string;
      detail: string;
      href: string;
      tone: "critical" | "attention" | "ok";
    }> = [];

    if (compliance.overdueFinance > 0) {
      items.push({
        title: "Cierre financiero semanal pendiente",
        detail: `${compliance.overdueFinance} movimientos superan siete días sin aprobación.`,
        href: "/dashboard/finance",
        tone: "critical",
      });
    }

    if (compliance.consentCoverage < 100) {
      items.push({
        title: "Consentimientos por completar",
        detail: `La cobertura verificable es ${compliance.consentCoverage}%. No uses registros incompletos en comunicaciones.`,
        href: "/dashboard/votantes",
        tone: "critical",
      });
    }

    if (overview.voters.total === 0) {
      items.push({
        title: "Activa el relacionamiento territorial",
        detail:
          "Registra la primera persona únicamente después de obtener autorización explícita.",
        href: "/dashboard/votantes",
        tone: "attention",
      });
    }

    if (items.length === 0) {
      items.push({
        title: "Controles críticos al día",
        detail:
          "No se detectan vencimientos semanales ni consentimientos incompletos en los datos disponibles.",
        href: "/dashboard/tasks",
        tone: "ok",
      });
    }

    return items.slice(0, 3);
  }, [compliance, overview.voters.total]);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2.25rem] bg-slate-950 p-7 text-white shadow-2xl md:p-9">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
              <ShieldCheck size={13} /> Modo campaña · entorno aislado
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-400">
                Buenos días, {user?.name?.split(" ")[0] ?? "equipo"}
              </p>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">
                {tenant?.name ?? "Centro de mando"}
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              Prioridades operativas sustentadas en datos reales del tenant.
              Este tablero no muestra predicciones de voto ni métricas
              inventadas.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <RefreshCw size={15} />
              )}
              Actualizar operación
            </button>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {updatedAt
                ? `Último corte ${updatedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
                : "Esperando primer corte"}
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700"
        >
          <AlertTriangle className="mt-0.5 shrink-0" size={19} />
          <div>
            <p className="font-black">No se pudo actualizar el tablero</p>
            <p className="mt-1 font-medium">{error}</p>
          </div>
        </div>
      )}

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Personas consentidas"
          value={String(compliance.consented)}
          hint={`${overview.voters.total} registros totales`}
          tone="emerald"
          loading={loading}
        />
        <MetricCard
          icon={BadgeCheck}
          label="Cobertura de consentimiento"
          value={`${compliance.consentCoverage}%`}
          hint="Objetivo obligatorio: 100%"
          tone={compliance.consentCoverage === 100 ? "emerald" : "amber"}
          loading={loading}
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Balance registrado"
          value={formatCop(overview.finance.balance)}
          hint={`${overview.financialEntries.length} movimientos`}
          tone="blue"
          loading={loading}
        />
        <MetricCard
          icon={FileCheck2}
          label="Actas E-14 sincronizadas"
          value={String(compliance.syncedReports)}
          hint={`${overview.witnessReports.length} reportes recibidos`}
          tone="violet"
          loading={loading}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Decisiones de hoy
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                Prioridades verificables
              </h2>
            </div>
            <ClipboardCheck className="text-slate-400" />
          </div>
          <div className="space-y-3">
            {priorities.map((priority) => (
              <Link
                key={priority.title}
                href={priority.href}
                className="group flex items-start gap-4 rounded-2xl border border-slate-100 p-5 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${priority.tone === "critical" ? "bg-red-50 text-red-600" : priority.tone === "attention" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}
                >
                  {priority.tone === "ok" ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <AlertTriangle size={18} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-slate-900">
                    {priority.title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {priority.detail}
                  </span>
                </span>
                <ArrowRight
                  className="mt-2 text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-700"
                  size={17}
                />
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Separación de finalidades
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            Dos operaciones, cero mezclas
          </h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
              <div className="flex items-center gap-3">
                <MapPinned className="text-emerald-700" size={20} />
                <p className="font-black text-emerald-950">Campaña electoral</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-emerald-800">
                Territorio, equipo, finanzas, comunicaciones consentidas y Día
                D.
              </p>
              <span className="mt-3 inline-flex rounded-full bg-emerald-700 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-white">
                Activo
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <Scale className="text-slate-600" size={20} />
                <p className="font-black text-slate-900">Ejercicio del cargo</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                PQRS, agenda pública, compromisos e indicadores en un almacén y
                finalidad independientes.
              </p>
              <span className="mt-3 inline-flex rounded-full bg-slate-200 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-slate-600">
                Aislado por diseño
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Frentes de operación
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            Del territorio a la rendición de cuentas
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ActionLink
            href="/dashboard/votantes"
            icon={Users}
            title="Relacionamiento"
            detail="Consentimiento y registro territorial"
          />
          <ActionLink
            href="/dashboard/finance"
            icon={CircleDollarSign}
            title="Finanzas"
            detail="Libro y control semanal CNE"
          />
          <ActionLink
            href="/dashboard/tasks"
            icon={CalendarDays}
            title="Agenda y equipo"
            detail="Responsables, rutas y compromisos"
          />
          <ActionLink
            href="/dashboard/war-room"
            icon={FileCheck2}
            title="Día D"
            detail="Testigos, incidentes y actas"
          />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  loading,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "amber" | "blue" | "violet";
  loading: boolean;
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div
        className={`mb-5 flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone]}`}
      >
        <Icon size={21} />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.17em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 min-h-9 text-3xl font-black tracking-tight text-slate-950">
        {loading ? <Loader2 className="animate-spin text-slate-300" /> : value}
      </p>
      <p className="mt-2 text-xs font-semibold text-slate-500">{hint}</p>
    </article>
  );
}

function ActionLink({
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
      className="group rounded-2xl border border-slate-100 p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
    >
      <Icon className="mb-4 text-slate-700" size={21} />
      <p className="font-black text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
      <span className="mt-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-700">
        Abrir{" "}
        <ArrowRight
          className="transition group-hover:translate-x-1"
          size={13}
        />
      </span>
    </Link>
  );
}
