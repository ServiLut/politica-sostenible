"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  FileText
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";

type DashboardData = {
  reportsReceived: number;
  expectedReports: number;
  coveragePercent: number;
  alertsCount: number;
  estimatedParticipation: number;
};

type Tally = {
  id: string;
  territory: string;
  totalVotes: number;
  ourVotes: number;
  percentage: number;
  reportsCount: number;
};

type LiveFeedItem = {
  id: string;
  timestamp: string;
  puesto: string;
  reporterName: string;
  status: "verified" | "pending" | "alert";
};

type AlertItem = {
  id: string;
  puesto: string;
  note: string;
  severity: "high" | "medium";
};

export default function WarRoomPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [tally, setTally] = useState<Tally[]>([]);
  const [feed, setFeed] = useState<LiveFeedItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    setLoadError(null);
    try {
      const [dashRes, tallyRes, alertsRes] = await Promise.all([
        apiRequest<DashboardData>("/election-day/dashboard"),
        apiRequest<{ items: Tally[] }>("/election-day/tally"),
        apiRequest<{ feed: LiveFeedItem[]; alerts: AlertItem[] }>("/election-day/alerts"),
      ]);
      setDashboard(dashRes);
      setTally(tallyRes.items);
      setFeed(alertsRes.feed);
      setAlerts(alertsRes.alerts);
    } catch {
      setLoadError("Error al cargar datos electorales. Se reintentará en 30 segundos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-7 bg-slate-950 min-h-screen p-8 text-white">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            War Room - Día de Elección
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Monitoreo en tiempo real de la jornada electoral.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
          Actualizar
        </button>
      </header>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-900/50 border border-red-700 px-4 py-3 text-sm font-medium text-red-200">
          <AlertCircle size={16} />
          {loadError}
        </div>
      )}
      {/* Live Stats Banner */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <FileText className="text-blue-400" size={24} />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Reportes Recibidos</p>
          <p className="mt-2 text-3xl font-black text-white">
            {dashboard?.reportsReceived || 0} <span className="text-lg font-medium text-slate-500">/ {dashboard?.expectedReports || 0}</span>
          </p>
        </article>
        <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <BarChart3 className="text-emerald-400" size={24} />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Cobertura de Puestos</p>
          <p className="mt-2 text-3xl font-black text-white">{dashboard?.coveragePercent || 0}%</p>
        </article>
        <article className="rounded-3xl border border-red-900/50 bg-red-950/20 p-6 shadow-lg">
          <AlertTriangle className="text-red-400" size={24} />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-red-400/80">Alertas / Irregularidades</p>
          <p className="mt-2 text-3xl font-black text-red-400">{dashboard?.alertsCount || 0}</p>
        </article>
        <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <CheckCircle2 className="text-blue-400" size={24} />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Participación Estimada</p>
          <p className="mt-2 text-3xl font-black text-white">{dashboard?.estimatedParticipation || 0}%</p>
        </article>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Vote Tally Table */}
        <section className="lg:col-span-2 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-bold text-white">Escrutinio por Territorio</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">División</th>
                  <th className="px-4 py-3">Votos Totales</th>
                  <th className="px-4 py-3">Nuestros Votos</th>
                  <th className="px-4 py-3">%</th>
                  <th className="px-4 py-3">Reportes</th>
                </tr>
              </thead>
              <tbody>
                {tally.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800/50">
                    <td className="px-4 py-3 font-medium text-white">{row.territory}</td>
                    <td className="px-4 py-3">{row.totalVotes.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold text-blue-400">{row.ourVotes.toLocaleString()}</td>
                    <td className="px-4 py-3">{row.percentage}%</td>
                    <td className="px-4 py-3">{row.reportsCount}</td>
                  </tr>
                ))}
                {tally.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No hay datos de escrutinio aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Alerts Panel */}
        <section className="rounded-3xl border border-red-900/50 bg-red-950/10 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-red-400">
            <AlertCircle size={20} /> Alertas Críticas
          </h2>
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div key={alert.id} className="rounded-xl bg-red-950/40 p-4 border border-red-900/50">
                <p className="text-xs font-bold text-red-400 mb-1">{alert.puesto}</p>
                <p className="text-sm text-red-200">{alert.note}</p>
              </div>
            ))}
            {alerts.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">No hay alertas reportadas.</p>
            )}
          </div>
        </section>

        {/* Live Feed */}
        <section className="lg:col-span-3 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-bold text-white flex items-center gap-2">
            <Clock size={20} className="text-blue-400" /> Últimos Reportes Recibidos
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {feed.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 rounded-xl bg-slate-950 p-4 border border-slate-800">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-slate-400">{new Date(item.timestamp).toLocaleTimeString()}</span>
                  {item.status === 'verified' && <span className="rounded bg-emerald-950/50 px-2 py-0.5 text-xs text-emerald-400 border border-emerald-900/50">Verificado</span>}
                  {item.status === 'alert' && <span className="rounded bg-red-950/50 px-2 py-0.5 text-xs text-red-400 border border-red-900/50">Alerta</span>}
                  {item.status === 'pending' && <span className="rounded bg-amber-950/50 px-2 py-0.5 text-xs text-amber-400 border border-amber-900/50">Pendiente</span>}
                </div>
                <p className="font-semibold text-sm text-white">{item.puesto}</p>
                <p className="text-xs text-slate-500">Por {item.reporterName}</p>
              </div>
            ))}
            {feed.length === 0 && (
              <p className="text-sm text-slate-500 py-4 col-span-full">Esperando reportes...</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
