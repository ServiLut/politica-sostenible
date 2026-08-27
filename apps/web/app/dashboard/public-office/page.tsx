"use client";

import Link from "next/link";
import { ReactNode, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Siren,
  Target,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import { IssueCase, IssueCaseStatus, listIssueCases } from "@/lib/cases-api";
import {
  Commitment,
  CommitmentStatus,
  listCommitments,
  listTasks,
  Task,
  TaskStatus,
  WorkPriority,
} from "@/lib/work-api";

interface DashboardMetrics {
  totalCases: number;
  openCases: number;
  inProgressCases: number;
  pendingTasks: number;
  overdueTasks: number;
  publicCommitments: number;
}

interface DashboardSnapshot {
  metrics: DashboardMetrics;
  recentCases: IssueCase[];
  urgentCases: IssueCase[];
  urgentCasesTotal: number;
  recentTasks: Task[];
  publicCommitments: Commitment[];
}

const PENDING_TASK_STATUSES: readonly TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
];

const CASE_STATUS_LABELS: Record<IssueCaseStatus, string> = {
  OPEN: "Abierto",
  TRIAGED: "Clasificado",
  IN_PROGRESS: "En gestión",
  WAITING_ON_CITIZEN: "Esperando ciudadano",
  WAITING_ON_EXTERNAL_ENTITY: "Esperando entidad",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "Por hacer",
  IN_PROGRESS: "En progreso",
  BLOCKED: "Bloqueada",
  DONE: "Terminada",
  CANCELLED: "Cancelada",
};

const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  PROPOSED: "Propuesto",
  PLANNED: "Planificado",
  IN_PROGRESS: "En progreso",
  AT_RISK: "En riesgo",
  FULFILLED: "Cumplido",
  NOT_FULFILLED: "No cumplido",
  CANCELLED: "Cancelado",
};

const PRIORITY_LABELS: Record<WorkPriority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible consultar el centro de gestión pública.";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CO").format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isOverdue(value: string | null): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return !Number.isNaN(timestamp) && timestamp < Date.now();
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  testId,
  href,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  testId: string;
  href: string;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">
            {label}
          </p>
          <p
            data-testid={testId}
            className="mt-2 text-3xl font-black tracking-tight text-slate-950"
          >
            {formatNumber(value)}
          </p>
        </div>
        <span
          className="rounded-2xl bg-blue-50 p-3 text-blue-700"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-xs leading-5 text-slate-500">{detail}</p>
        <Link
          href={href}
          aria-label={`Abrir ${label.toLowerCase()}`}
          className="shrink-0 rounded-lg p-1.5 text-blue-700 transition hover:bg-blue-50"
        >
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </article>
  );
}

function EmptyList({ message }: { message: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export default function PublicOfficePage() {
  const { tenant } = useAuth();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const overdueCutoff = new Date().toISOString();
      const [
        recentCases,
        openCases,
        inProgressCases,
        urgentCases,
        recentTasks,
        publicCommitments,
        todoTasks,
        inProgressTasks,
        blockedTasks,
        overdueTodoTasks,
        overdueInProgressTasks,
        overdueBlockedTasks,
      ] = await Promise.all([
        listIssueCases({ page: 1, limit: 5 }, signal),
        listIssueCases({ page: 1, limit: 1, status: "OPEN" }, signal),
        listIssueCases({ page: 1, limit: 1, status: "IN_PROGRESS" }, signal),
        listIssueCases({ page: 1, limit: 5, priority: "URGENT" }, signal),
        listTasks({ page: 1, limit: 5 }, signal),
        listCommitments({ page: 1, limit: 5, isPublic: "true" }, signal),
        listTasks({ page: 1, limit: 1, status: "TODO" }, signal),
        listTasks({ page: 1, limit: 1, status: "IN_PROGRESS" }, signal),
        listTasks({ page: 1, limit: 1, status: "BLOCKED" }, signal),
        listTasks(
          { page: 1, limit: 1, status: "TODO", dueTo: overdueCutoff },
          signal,
        ),
        listTasks(
          {
            page: 1,
            limit: 1,
            status: "IN_PROGRESS",
            dueTo: overdueCutoff,
          },
          signal,
        ),
        listTasks(
          { page: 1, limit: 1, status: "BLOCKED", dueTo: overdueCutoff },
          signal,
        ),
      ]);

      const pendingTasks =
        todoTasks.pagination.total +
        inProgressTasks.pagination.total +
        blockedTasks.pagination.total;
      const overdueTasks =
        overdueTodoTasks.pagination.total +
        overdueInProgressTasks.pagination.total +
        overdueBlockedTasks.pagination.total;

      setSnapshot({
        metrics: {
          totalCases: recentCases.pagination.total,
          openCases: openCases.pagination.total,
          inProgressCases: inProgressCases.pagination.total,
          pendingTasks,
          overdueTasks,
          publicCommitments: publicCommitments.pagination.total,
        },
        recentCases: recentCases.items,
        urgentCases: urgentCases.items,
        urgentCasesTotal: urgentCases.pagination.total,
        recentTasks: recentTasks.items,
        publicCommitments: publicCommitments.items,
      });
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        return;
      }
      setError(readableError(requestError));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard]);

  const hasOperationalData = snapshot
    ? Object.values(snapshot.metrics).some((value) => value > 0)
    : false;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-blue-700">
            <ShieldCheck aria-hidden="true" size={14} /> Gestión pública
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Centro de gestión pública
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Seguimiento operativo de {tenant?.name ?? "la organización"} basado
            exclusivamente en casos, tareas y compromisos registrados.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-blue-300 disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={loading ? "animate-spin" : ""}
              size={17}
            />
            Actualizar
          </button>
          <Link
            href="/dashboard/cases"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 text-sm font-black text-white transition hover:bg-blue-800"
          >
            <FileText aria-hidden="true" size={17} /> Gestionar casos
          </Link>
        </div>
      </header>

      {loading ? (
        <div
          role="status"
          className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-semibold text-slate-500"
        >
          <Loader2
            aria-hidden="true"
            className="animate-spin text-blue-700"
            size={30}
          />
          Calculando indicadores desde la API…
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center"
        >
          <AlertCircle aria-hidden="true" className="text-red-600" size={34} />
          <div>
            <h2 className="font-black text-slate-950">
              No pudimos cargar el centro de gestión
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-blue-800"
          >
            <RefreshCw aria-hidden="true" size={16} /> Reintentar
          </button>
        </div>
      ) : snapshot ? (
        <>
          <section
            aria-label="Indicadores operativos"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <MetricCard
              label="Casos totales"
              value={snapshot.metrics.totalCases}
              detail="Total exacto informado por la paginación"
              icon={<BriefcaseBusiness size={21} />}
              testId="total-cases-metric"
              href="/dashboard/cases"
            />
            <MetricCard
              label="Casos abiertos"
              value={snapshot.metrics.openCases}
              detail="Consulta exacta con estado OPEN"
              icon={<FileText size={21} />}
              testId="open-cases-metric"
              href="/dashboard/cases"
            />
            <MetricCard
              label="Casos en gestión"
              value={snapshot.metrics.inProgressCases}
              detail="Consulta exacta con estado IN_PROGRESS"
              icon={<Clock3 size={21} />}
              testId="in-progress-cases-metric"
              href="/dashboard/cases"
            />
            <MetricCard
              label="Tareas pendientes"
              value={snapshot.metrics.pendingTasks}
              detail="Por hacer, en progreso o bloqueadas"
              icon={<ClipboardCheck size={21} />}
              testId="pending-tasks-metric"
              href="/dashboard/tasks"
            />
            <MetricCard
              label="Tareas vencidas"
              value={snapshot.metrics.overdueTasks}
              detail="Pendientes con fecha límite anterior a hoy"
              icon={<AlertTriangle size={21} />}
              testId="overdue-tasks-metric"
              href="/dashboard/tasks"
            />
            <MetricCard
              label="Compromisos públicos"
              value={snapshot.metrics.publicCommitments}
              detail="Total exacto con visibilidad pública"
              icon={<Target size={21} />}
              testId="public-commitments-metric"
              href="/dashboard/tasks"
            />
          </section>

          {!hasOperationalData && (
            <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <CheckCircle2
                aria-hidden="true"
                className="mx-auto text-slate-300"
                size={42}
              />
              <h2 className="mt-4 text-lg font-black text-slate-950">
                Aún no hay actividad registrada
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Los indicadores permanecerán en cero hasta que se radiquen
                casos, se creen tareas o se publiquen compromisos reales.
              </p>
              <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/dashboard/cases"
                  className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white"
                >
                  Ir a casos
                </Link>
                <Link
                  href="/dashboard/tasks"
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700"
                >
                  Ir a tareas y compromisos
                </Link>
              </div>
            </section>
          )}

          <section className="grid gap-5 xl:grid-cols-3">
            <article className="rounded-3xl border border-red-200 bg-white p-5 shadow-sm">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="inline-flex items-center gap-2 font-black text-slate-950">
                    <Siren
                      aria-hidden="true"
                      className="text-red-600"
                      size={18}
                    />{" "}
                    Casos urgentes
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatNumber(snapshot.urgentCasesTotal)} casos con
                    prioridad URGENT
                  </p>
                </div>
                <Link
                  href="/dashboard/cases"
                  className="text-blue-700"
                  aria-label="Abrir casos urgentes"
                >
                  <ArrowRight aria-hidden="true" size={18} />
                </Link>
              </header>
              <div className="mt-5 space-y-3">
                {snapshot.urgentCases.length === 0 ? (
                  <EmptyList message="No hay casos urgentes registrados." />
                ) : (
                  snapshot.urgentCases.map((issueCase) => (
                    <div
                      key={issueCase.id}
                      data-testid={`urgent-case-${issueCase.id}`}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-mono text-[10px] font-black text-blue-700">
                          {issueCase.reference}
                        </p>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-800">
                          Urgente
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-black text-slate-900">
                        {issueCase.title}
                      </h3>
                      <p className="mt-2 text-xs text-slate-500">
                        {CASE_STATUS_LABELS[issueCase.status]} · vence{" "}
                        {formatDate(issueCase.dueAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-black text-slate-950">
                    Tareas recientes
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Últimas tareas del modo activo
                  </p>
                </div>
                <Link
                  href="/dashboard/tasks"
                  className="text-blue-700"
                  aria-label="Abrir tareas"
                >
                  <ArrowRight aria-hidden="true" size={18} />
                </Link>
              </header>
              <div className="mt-5 space-y-3">
                {snapshot.recentTasks.length === 0 ? (
                  <EmptyList message="No hay tareas registradas." />
                ) : (
                  snapshot.recentTasks.map((task) => (
                    <div
                      key={task.id}
                      data-testid={`recent-task-${task.id}`}
                      className="rounded-2xl border border-slate-100 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase text-amber-800">
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                        {isOverdue(task.dueAt) &&
                          PENDING_TASK_STATUSES.includes(task.status) && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-700">
                              Vencida
                            </span>
                          )}
                      </div>
                      <h3 className="mt-2 text-sm font-black text-slate-900">
                        {task.title}
                      </h3>
                      <p className="mt-2 text-xs text-slate-500">
                        {TASK_STATUS_LABELS[task.status]} ·{" "}
                        {task.assignee?.name ?? "Sin asignar"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-black text-slate-950">
                    Compromisos públicos
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Avance registrado individualmente
                  </p>
                </div>
                <Link
                  href="/dashboard/tasks"
                  className="text-blue-700"
                  aria-label="Abrir compromisos"
                >
                  <ArrowRight aria-hidden="true" size={18} />
                </Link>
              </header>
              <div className="mt-5 space-y-3">
                {snapshot.publicCommitments.length === 0 ? (
                  <EmptyList message="No hay compromisos públicos registrados." />
                ) : (
                  snapshot.publicCommitments.map((commitment) => (
                    <div
                      key={commitment.id}
                      data-testid={`public-commitment-${commitment.id}`}
                      className="rounded-2xl border border-slate-100 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-mono text-[10px] font-black text-blue-700">
                          {commitment.reference}
                        </p>
                        <span className="text-xs font-black text-slate-700">
                          {commitment.progress}%
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-black text-slate-900">
                        {commitment.title}
                      </h3>
                      <div
                        role="progressbar"
                        aria-label={`Avance de ${commitment.title}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={commitment.progress}
                        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
                      >
                        <div
                          className="h-full rounded-full bg-blue-700"
                          style={{ width: `${commitment.progress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {COMMITMENT_STATUS_LABELS[commitment.status]}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/60 px-6 py-5">
              <div>
                <h2 className="font-black text-slate-950">Casos recientes</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Últimos registros informados por la API
                </p>
              </div>
              <Link
                href="/dashboard/cases"
                className="inline-flex items-center gap-2 text-sm font-black text-blue-700"
              >
                Ver todos <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </header>
            {snapshot.recentCases.length === 0 ? (
              <div className="p-6">
                <EmptyList message="No hay casos recientes para mostrar." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs font-black uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Referencia / asunto</th>
                      <th className="px-6 py-4">Categoría</th>
                      <th className="px-6 py-4">Estado</th>
                      <th className="px-6 py-4">Prioridad</th>
                      <th className="px-6 py-4">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {snapshot.recentCases.map((issueCase) => (
                      <tr
                        key={issueCase.id}
                        data-testid={`recent-case-${issueCase.id}`}
                        className="hover:bg-slate-50/70"
                      >
                        <td className="px-6 py-5">
                          <p className="font-mono text-[10px] font-black text-blue-700">
                            {issueCase.reference}
                          </p>
                          <p className="mt-1 font-black text-slate-900">
                            {issueCase.title}
                          </p>
                        </td>
                        <td className="px-6 py-5 font-semibold text-slate-600">
                          {issueCase.category}
                        </td>
                        <td className="px-6 py-5 text-slate-600">
                          {CASE_STATUS_LABELS[issueCase.status]}
                        </td>
                        <td className="px-6 py-5 font-black text-slate-700">
                          {PRIORITY_LABELS[issueCase.priority]}
                        </td>
                        <td className="px-6 py-5 text-slate-600">
                          {issueCase.assignee?.name ?? "Sin asignar"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
