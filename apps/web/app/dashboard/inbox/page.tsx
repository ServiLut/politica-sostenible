"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleUserRound,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { getVisibleNavigationItems } from "@/config/navigation";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  filterOperationalInboxItems,
  listOperationalInbox,
  type InboxPriority,
  type OperationalInboxFilter,
  type OperationalInboxItem,
  type OperationalInboxResponse,
} from "@/lib/operational-inbox-api";

const FILTERS: ReadonlyArray<{
  value: OperationalInboxFilter;
  label: string;
}> = [
  { value: "ALL", label: "Todo abierto" },
  { value: "OVERDUE", label: "Vencido" },
  { value: "BLOCKED", label: "Bloqueado" },
  { value: "UNASSIGNED", label: "Sin responsable" },
  { value: "APPROVALS", label: "Por aprobar" },
];

const EMPTY_INBOX_FLOW_HREFS = new Set([
  "/dashboard/incidents",
  "/dashboard/cases",
  "/dashboard/tasks",
  "/dashboard/pqrsd",
  "/dashboard/commitments",
  "/dashboard/communications",
]);

const PRIORITY_LABELS: Readonly<Record<InboxPriority, string>> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error inesperado al consolidar el trabajo.";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function deadlineLabel(item: OperationalInboxItem): string {
  if (!item.dueAt) return "Sin vencimiento definido";
  return `${item.overdue ? "Venció" : "Vence"} ${formatDate(item.dueAt)}`;
}

function priorityStyle(priority: InboxPriority, overdue: boolean): string {
  if (overdue || priority === "URGENT") return "bg-red-50 text-red-800";
  if (priority === "HIGH") return "bg-amber-50 text-amber-800";
  if (priority === "MEDIUM") return "bg-blue-50 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

function SummaryButton({
  label,
  value,
  filter,
  active,
  onSelect,
}: {
  label: string;
  value: number;
  filter: OperationalInboxFilter;
  active: boolean;
  onSelect: (filter: OperationalInboxFilter) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(filter)}
      className={`min-h-24 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
        active
          ? "border-blue-700 bg-blue-700 text-white shadow-lg shadow-blue-950/10"
          : "border-slate-200 bg-white text-slate-950 hover:border-blue-300"
      }`}
    >
      <span className="block text-2xl font-semibold tabular-nums">{value}</span>
      <span
        className={`mt-1 block text-xs font-semibold ${
          active ? "text-blue-100" : "text-slate-500"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function WorkItemCard({ item }: { item: OperationalInboxItem }) {
  return (
    <article
      data-testid={`inbox-item-${item.entityId}`}
      className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
        item.overdue ? "border-red-200" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[9px] font-semibold text-white">
          {item.kindLabel}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${priorityStyle(item.priority, item.overdue)}`}
        >
          {PRIORITY_LABELS[item.priority]}
        </span>
        {item.overdue && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-700 px-2.5 py-1 text-[9px] font-semibold text-white">
            <AlertTriangle aria-hidden="true" size={12} /> Vencido
          </span>
        )}
      </div>

      <div className="mt-4 min-w-0">
        {item.reference && (
          <p className="text-xs font-semibold text-slate-400">
            {item.reference}
          </p>
        )}
        <h2 className="mt-1 text-lg font-semibold leading-snug text-slate-950">
          {item.title}
        </h2>
        <p className="mt-1 text-xs font-bold text-slate-500">
          {item.statusLabel}
        </p>
      </div>

      <dl className="mt-4 grid gap-3 border-y border-slate-100 py-4 text-sm sm:grid-cols-2 min-w-0">
        <div>
          <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <CircleUserRound aria-hidden="true" size={14} /> Responsable
          </dt>
          <dd
            className={`mt-1 font-bold ${
              !item.responsible && item.kind !== "COMMUNICATION_APPROVAL"
                ? "text-red-700"
                : "text-slate-800"
            }`}
          >
            {item.responsible?.name ??
              (item.kind === "COMMUNICATION_APPROVAL"
                ? "Revisión independiente pendiente"
                : "Sin responsable")}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <CalendarClock aria-hidden="true" size={14} /> Plazo
          </dt>
          <dd
            className={`mt-1 font-bold ${
              item.overdue ? "text-red-700" : "text-slate-800"
            }`}
          >
            {deadlineLabel(item)}
          </dd>
        </div>
      </dl>

      {item.blockReason && (
        <div
          role="note"
          className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-xs font-semibold leading-5 ${
            item.overdue
              ? "bg-red-50 text-red-800"
              : "bg-amber-50 text-amber-900"
          }`}
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={15}
          />
          <span>{item.blockReason}</span>
        </div>
      )}

      <Link
        href={item.cta.href}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto max-w-full whitespace-normal"
      >
        {item.cta.label} <ArrowRight aria-hidden="true" size={16} />
      </Link>
    </article>
  );
}

export default function OperationalInboxPage() {
  const { tenant, user } = useAuth();
  const [result, setResult] = useState<OperationalInboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<OperationalInboxFilter>("ALL");
  const [search, setSearch] = useState("");

  function requestReload() {
    setLoading(true);
    setError(null);
    setReload((value) => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();

    void listOperationalInbox(100, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult(response);
      })
      .catch((requestError: unknown) => {
        if (
          !controller.signal.aborted &&
          !(
            requestError instanceof DOMException &&
            requestError.name === "AbortError"
          )
        ) {
          setError(readableError(requestError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reload]);

  const visibleItems = useMemo(
    () => filterOperationalInboxItems(result?.items ?? [], filter, search),
    [filter, result, search],
  );
  const emptyStateFlows = useMemo(() => {
    if (!tenant || !user) return [];

    return getVisibleNavigationItems(
      user,
      tenant,
      tenant.operationStage,
    ).filter((item) => EMPTY_INBOX_FLOW_HREFS.has(item.href));
  }, [tenant, user]);

  return (
    <div
      data-testid="operational-inbox"
      className="mx-auto max-w-7xl space-y-6 min-w-0"
    >
      <header className="overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/10 sm:p-8 min-w-0">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between min-w-0">
          <div className="max-w-3xl min-w-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 min-w-0">
              <Inbox aria-hidden="true" size={22} />
            </div>
            <p className="mt-5 text-xs font-semibold text-blue-300">
              Coordinación diaria
            </p>
            <h1 className="mt-1 font-semibold tracking-tight text-2xl sm:text-3xl break-words">
              Bandeja operativa
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Un solo lugar para saber qué ocurrió, quién responde, qué está
              vencido y cuál es la siguiente acción.
            </p>
          </div>
          <button
            type="button"
            onClick={requestReload}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-white transition hover:border-blue-400 disabled:opacity-60 max-w-full whitespace-normal"
          >
            <RefreshCw
              aria-hidden="true"
              className={loading ? "animate-spin" : ""}
              size={16}
            />
            Actualizar corte
          </button>
        </div>
      </header>

      {loading && !result ? (
        <div
          role="status"
          className="flex min-h-80 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-500 min-w-0"
        >
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin text-blue-600"
            size={24}
          />
          Consolidando responsables y vencimientos…
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-red-200 bg-red-50 p-8 text-center min-w-0"
        >
          <AlertCircle aria-hidden="true" className="text-red-700" size={34} />
          <h2 className="mt-4 text-xl font-semibold text-slate-950">
            No fue posible consolidar la bandeja
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            {error}
          </p>
          <button
            type="button"
            onClick={requestReload}
            className="mt-5 min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white max-w-full whitespace-normal"
          >
            Reintentar
          </button>
        </div>
      ) : result ? (
        <>
          <section
            aria-label="Resumen de trabajo"
            className="grid gap-3 lg:grid-cols-5 min-w-0 grid-cols-1 sm:grid-cols-2"
          >
            <SummaryButton
              label="Todo abierto"
              value={result.summary.total}
              filter="ALL"
              active={filter === "ALL"}
              onSelect={setFilter}
            />
            <SummaryButton
              label="Vencido"
              value={result.summary.overdue}
              filter="OVERDUE"
              active={filter === "OVERDUE"}
              onSelect={setFilter}
            />
            <SummaryButton
              label="Bloqueado"
              value={result.summary.blocked}
              filter="BLOCKED"
              active={filter === "BLOCKED"}
              onSelect={setFilter}
            />
            <SummaryButton
              label="Sin responsable"
              value={result.summary.unassigned}
              filter="UNASSIGNED"
              active={filter === "UNASSIGNED"}
              onSelect={setFilter}
            />
            <SummaryButton
              label="Por aprobar"
              value={result.summary.pendingApprovals}
              filter="APPROVALS"
              active={filter === "APPROVALS"}
              onSelect={setFilter}
            />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 min-w-0">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between min-w-0">
              <div
                className="flex flex-wrap gap-2 min-w-0"
                aria-label="Filtros de bandeja"
              >
                {FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                    className={`min-h-10 rounded-full px-4 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      filter === option.value
                        ? "bg-slate-950 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="relative block w-full lg:max-w-sm min-w-0">
                <span className="sr-only">Buscar entre las acciones cargadas</span>
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={17}
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar entre acciones cargadas"
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 min-w-0 max-w-full"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500 min-w-0">
              <span aria-live="polite">
                {visibleItems.length}{" "}
                {visibleItems.length === 1 ? "resultado" : "resultados"}
              </span>
              <span>Corte: {formatDate(result.generatedAt)}</span>
            </div>
            {result.summary.truncated && (
              <div
                role="status"
                className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900"
              >
                <p>
                  Se muestran las {result.summary.visible} acciones más críticas
                  de {result.summary.total}. Los filtros y la búsqueda solo
                  consultan estas acciones cargadas. Para encontrar otras,
                  abre el módulo correspondiente.
                </p>
                <nav aria-label="Consultar todos los registros por módulo" className="mt-3 flex flex-wrap gap-2">
                  {emptyStateFlows.map((item) => (
                    <Link key={item.href} href={item.href} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100">
                      Abrir {item.title}
                    </Link>
                  ))}
                </nav>
              </div>
            )}
          </section>

          {visibleItems.length > 0 ? (
            <section
              aria-label="Trabajo pendiente"
              className="grid gap-4 lg:grid-cols-2 min-w-0"
            >
              {visibleItems.map((item) => (
                <WorkItemCard key={item.id} item={item} />
              ))}
            </section>
          ) : (
            <section className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center min-w-0">
              <CheckCircle2
                aria-hidden="true"
                className="text-emerald-600"
                size={42}
              />
              <h2 className="mt-4 text-xl font-semibold text-slate-950">
                {result.summary.total === 0
                  ? "La operación está al día"
                  : "Sin coincidencias entre las acciones cargadas"}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                {result.summary.total === 0
                  ? "Cuando aparezca una tarea, compromiso, caso, expediente PQRSD, incidente o aprobación pendiente, quedará priorizado aquí."
                  : "Cambia el filtro o busca en el módulo correspondiente para consultar el resto del trabajo abierto."}
              </p>
              {result.summary.total === 0 && emptyStateFlows.length > 0 && (
                <nav
                  aria-label="Flujos operativos disponibles"
                  data-testid="inbox-empty-actions"
                  className="mt-6 flex flex-wrap justify-center gap-3 min-w-0"
                >
                  {emptyStateFlows.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-blue-400 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 max-w-full whitespace-normal"
                    >
                      Abrir {item.title}
                      <ArrowRight aria-hidden="true" size={16} />
                    </Link>
                  ))}
                </nav>
              )}
              {result.summary.total > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter("ALL");
                    setSearch("");
                  }}
                  className="mt-5 min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white max-w-full whitespace-normal"
                >
                  Limpiar filtros
                </button>
              )}
            </section>
          )}

          <aside className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-emerald-700"
              size={19}
            />
            <p>
              La bandeja no duplica información: cada botón abre el registro
              original y respeta el alcance de tu organización, modo y rol.
            </p>
          </aside>
        </>
      ) : null}
    </div>
  );
}
