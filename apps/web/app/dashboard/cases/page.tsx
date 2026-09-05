"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileLock2,
  History,
  Inbox,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { CaseInteractionsPanel } from "@/components/cases/CaseInteractionsPanel";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  CaseUserSummary,
  CommunicationChannel,
  createIssueCase,
  IssueCase,
  IssueCasePage,
  IssueCaseStatus,
  listCaseAssignees,
  listIssueCases,
  updateIssueCase,
  WorkPriority,
} from "@/lib/cases-api";
import { BackendUserRole } from "@/types/saas-schema";
import { ExportButton } from "@/components/ui/ExportButton";

const PAGE_SIZE = 12;

const CASE_WRITE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "CONSTITUENT_SERVICES_MANAGER",
  "CASE_WORKER",
]);
const CASE_ASSIGNMENT_MANAGER_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "CONSTITUENT_SERVICES_MANAGER",
]);
const INTERACTION_WRITE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CONSTITUENT_SERVICES_MANAGER",
  "CASE_WORKER",
]);
const CONSENT_REVOKE_ROLES = new Set<BackendUserRole>([
  ...INTERACTION_WRITE_ROLES,
  "COMPLIANCE_OFFICER",
]);

const STATUS_OPTIONS: ReadonlyArray<{
  value: IssueCaseStatus;
  label: string;
}> = [
  { value: "OPEN", label: "Abierto" },
  { value: "TRIAGED", label: "Clasificado" },
  { value: "IN_PROGRESS", label: "En gestión" },
  { value: "WAITING_ON_CITIZEN", label: "Esperando ciudadano" },
  { value: "WAITING_ON_EXTERNAL_ENTITY", label: "Esperando entidad" },
  { value: "RESOLVED", label: "Resuelto" },
  { value: "CLOSED", label: "Cerrado" },
  { value: "CANCELLED", label: "Cancelado" },
];

const PRIORITY_OPTIONS: ReadonlyArray<{
  value: WorkPriority;
  label: string;
}> = [
  { value: "LOW", label: "Baja" },
  { value: "MEDIUM", label: "Media" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
];

const CHANNEL_OPTIONS: ReadonlyArray<{
  value: CommunicationChannel;
  label: string;
}> = [
  { value: "WEB", label: "Formulario web" },
  { value: "IN_PERSON", label: "Presencial" },
  { value: "PHONE", label: "Teléfono" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Correo" },
  { value: "SOCIAL_MEDIA", label: "Red social" },
  { value: "LETTER", label: "Carta" },
  { value: "SMS", label: "SMS" },
  { value: "INTERNAL", label: "Registro interno" },
];

const TRANSITIONS: Readonly<Record<IssueCaseStatus, IssueCaseStatus[]>> = {
  OPEN: ["TRIAGED", "IN_PROGRESS", "CANCELLED"],
  TRIAGED: [
    "IN_PROGRESS",
    "WAITING_ON_CITIZEN",
    "WAITING_ON_EXTERNAL_ENTITY",
    "RESOLVED",
    "CANCELLED",
  ],
  IN_PROGRESS: [
    "WAITING_ON_CITIZEN",
    "WAITING_ON_EXTERNAL_ENTITY",
    "RESOLVED",
    "CANCELLED",
  ],
  WAITING_ON_CITIZEN: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  WAITING_ON_EXTERNAL_ENTITY: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: ["OPEN"],
};

interface Filters {
  page: number;
  search: string;
  status: "" | IssueCaseStatus;
  priority: "" | WorkPriority;
}

const INITIAL_FILTERS: Filters = {
  page: 1,
  search: "",
  status: "",
  priority: "",
};

function optionLabel<T extends string>(
  value: T,
  options: ReadonlyArray<{ value: T; label: string }>,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function readableError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error inesperado. Intenta nuevamente.";
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha límite";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function modeLabel(mode: IssueCase["mode"] | undefined) {
  if (mode === "PUBLIC_OFFICE") return "Gestión pública";
  if (mode === "CAMPAIGN") return "Campaña";
  return "Modo activo definido por la organización";
}

function CaseCard({
  issueCase,
  assignees,
  canMutate,
  canManageAssignments,
  saving,
  onSave,
  onOpenInteractions,
}: {
  issueCase: IssueCase;
  assignees: CaseUserSummary[];
  canMutate: boolean;
  canManageAssignments: boolean;
  saving: boolean;
  onSave: (
    issueCase: IssueCase,
    change: {
      status: IssueCaseStatus;
      priority: WorkPriority;
      assigneeId?: string | null;
    },
  ) => Promise<void>;
  onOpenInteractions: (issueCase: IssueCase) => void;
}) {
  const [status, setStatus] = useState(issueCase.status);
  const [priority, setPriority] = useState(issueCase.priority);
  const [assigneeId, setAssigneeId] = useState(issueCase.assigneeId ?? "");
  const nextStatuses = useMemo(
    () => [issueCase.status, ...TRANSITIONS[issueCase.status]],
    [issueCase.status],
  );
  const hasChanges =
    status !== issueCase.status ||
    priority !== issueCase.priority ||
    (canManageAssignments && assigneeId !== (issueCase.assigneeId ?? ""));

  return (
    <article
      data-testid={`case-card-${issueCase.id}`}
      className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
            {issueCase.reference}
          </p>
          <h2 className="mt-2 text-lg font-black leading-tight text-slate-950">
            {issueCase.title}
          </h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {issueCase.category} ·{" "}
            {optionLabel(issueCase.sourceChannel, CHANNEL_OPTIONS)}
          </p>
        </div>
        {issueCase.confidential && (
          <span
            title="Clasificación operativa; el acceso sigue los permisos generales del rol y la asignación del caso"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-50 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-violet-700"
          >
            <FileLock2 aria-hidden="true" size={17} />
            Manejo especial
          </span>
        )}
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
        {issueCase.description}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-2xl bg-slate-50 p-3">
          <dt className="font-bold text-slate-400">Responsable</dt>
          <dd className="mt-1 font-black text-slate-700">
            {issueCase.assignee?.name ?? "Sin asignar"}
          </dd>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <dt className="font-bold text-slate-400">Vencimiento</dt>
          <dd className="mt-1 font-black text-slate-700">
            {formatDate(issueCase.dueAt)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
          {optionLabel(issueCase.status, STATUS_OPTIONS)}
        </span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">
          {optionLabel(issueCase.priority, PRIORITY_OPTIONS)}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1">
          {issueCase._count.interactions} interacciones
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1">
          {issueCase._count.tasks} tareas
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1">
          {issueCase._count.commitments} compromisos
        </span>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          aria-label={`Abrir bitácora de ${issueCase.reference}`}
          onClick={() => onOpenInteractions(issueCase)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-800 transition hover:border-blue-700 hover:bg-blue-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        >
          <History aria-hidden="true" size={16} />
          Bitácora
        </button>
        {canMutate && (
          <>
            <Link
              href={`/dashboard/tasks?create=task&issueCaseId=${encodeURIComponent(issueCase.id)}`}
              aria-label={`Crear tarea vinculada a ${issueCase.reference}`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-800 transition hover:border-emerald-700 hover:bg-emerald-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
            >
              <ListChecks aria-hidden="true" size={16} />
              Crear tarea
            </Link>
            <Link
              href={`/dashboard/tasks?create=commitment&issueCaseId=${encodeURIComponent(issueCase.id)}`}
              aria-label={`Registrar compromiso vinculado a ${issueCase.reference}`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-800 transition hover:border-violet-700 hover:bg-violet-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-600 focus:ring-offset-2"
            >
              <Target aria-hidden="true" size={16} />
              Compromiso
            </Link>
          </>
        )}
      </div>

      {canMutate && (
        <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Estado
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as IssueCaseStatus)
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold normal-case tracking-normal text-slate-800"
              >
                {STATUS_OPTIONS.filter(({ value }) =>
                  nextStatuses.includes(value),
                ).map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={
                      option.value === "RESOLVED" &&
                      issueCase.status !== "RESOLVED" &&
                      !issueCase.resolutionReady
                    }
                  >
                    {option.label}
                    {option.value === "RESOLVED" && !issueCase.resolutionReady
                      ? " · requiere resultado en bitácora"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Prioridad
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as WorkPriority)
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold normal-case tracking-normal text-slate-800"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!issueCase.resolutionReady &&
            TRANSITIONS[issueCase.status].includes("RESOLVED") && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                Para resolver este caso, abre la Bitácora y registra primero una
                gestión con el campo Resultado.
              </p>
            )}
          {canManageAssignments && (
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Responsable
              <select
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold normal-case tracking-normal text-slate-800"
              >
                <option value="">Sin asignar</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={!hasChanges || saving}
            onClick={() =>
              void onSave(issueCase, {
                status,
                priority,
                ...(canManageAssignments
                  ? { assigneeId: assigneeId || null }
                  : {}),
              })
            }
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}
            Guardar seguimiento
          </button>
        </div>
      )}
    </article>
  );
}

export default function CasesPage() {
  const { user } = useAuth();
  const canMutate = user !== null && CASE_WRITE_ROLES.has(user.backendRole);
  const canManageAssignments =
    user !== null && CASE_ASSIGNMENT_MANAGER_ROLES.has(user.backendRole);
  const canRegisterInteraction =
    user !== null && INTERACTION_WRITE_ROLES.has(user.backendRole);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [searchDraft, setSearchDraft] = useState("");
  const [result, setResult] = useState<IssueCasePage | null>(null);
  const [assignees, setAssignees] = useState<CaseUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<IssueCase | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    sourceChannel: "WEB" as CommunicationChannel,
    priority: "MEDIUM" as WorkPriority,
    externalContactRef: "",
    assigneeId: "",
    dueDate: "",
    confidential: false,
  });

  const loadCases = useCallback(
    (signal: AbortSignal) =>
      listIssueCases(
        {
          page: filters.page,
          limit: PAGE_SIZE,
          search: filters.search || undefined,
          status: filters.status || undefined,
          priority: filters.priority || undefined,
        },
        signal,
      ),
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void loadCases(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult(response);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(readableError(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [loadCases, reload]);

  useEffect(() => {
    if (!canManageAssignments) return;
    const controller = new AbortController();

    void listCaseAssignees(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setAssignees(response);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setMutationError(readableError(requestError));
        }
      });

    return () => controller.abort();
  }, [canManageAssignments]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters((current) => ({
      ...current,
      page: 1,
      search: searchDraft.trim(),
    }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("create");
    setMutationError(null);

    try {
      await createIssueCase({
        title: form.title,
        description: form.description,
        category: form.category,
        sourceChannel: form.sourceChannel,
        priority: form.priority,
        externalContactRef: form.externalContactRef || undefined,
        assigneeId: form.assigneeId || undefined,
        confidential: form.confidential,
        dueAt: form.dueDate
          ? new Date(`${form.dueDate}T12:00:00`).toISOString()
          : undefined,
      });
      setForm({
        title: "",
        description: "",
        category: "",
        sourceChannel: "WEB",
        priority: "MEDIUM",
        externalContactRef: "",
        assigneeId: "",
        dueDate: "",
        confidential: false,
      });
      setIsCreateOpen(false);
      setNotice("PQRS radicada y auditada correctamente.");
      setFilters((current) => ({ ...current, page: 1 }));
      setReload((value) => value + 1);
    } catch (requestError: unknown) {
      setMutationError(readableError(requestError));
    } finally {
      setSaving(null);
    }
  }

  async function handleUpdate(
    issueCase: IssueCase,
    change: {
      status: IssueCaseStatus;
      priority: WorkPriority;
      assigneeId?: string | null;
    },
  ) {
    setSaving(issueCase.id);
    setMutationError(null);

    try {
      const updated = await updateIssueCase(issueCase.id, change);
      setResult((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      setNotice(`${updated.reference} actualizado y auditado.`);
    } catch (requestError: unknown) {
      setMutationError(readableError(requestError));
    } finally {
      setSaving(null);
    }
  }

  const totalPages = Math.max(1, result?.pagination.totalPages ?? 1);

  return (
    <div className="space-y-7">
      {notice && (
        <div
          role="status"
          className="fixed right-6 top-6 z-[90] flex items-center gap-3 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-bold text-white shadow-2xl"
        >
          <CheckCircle2 size={18} /> {notice}
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
            <ShieldCheck size={13} /> {modeLabel(result?.items[0]?.mode)}
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
            Atención ciudadana y PQRS
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Radicación, asignación y trazabilidad de solicitudes del modo
            operativo activo. El modo y la organización se resuelven desde la
            sesión validada por la API.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton moduleName="casos" />
          {canMutate && (
            <button
              type="button"
              onClick={() => {
                setMutationError(null);
                setIsCreateOpen(true);
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-6 text-xs font-black uppercase tracking-wider text-white transition hover:bg-slate-950"
            >
              <Plus size={17} /> Radicar PQRS
            </button>
          )}
        </div>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <form
          onSubmit={submitSearch}
          className="grid gap-3 lg:grid-cols-[1fr_190px_170px_auto]"
        >
          <label className="relative">
            <span className="sr-only">Buscar casos</span>
            <Search
              className="absolute left-4 top-3.5 text-slate-400"
              size={17}
            />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Referencia, asunto, categoría o descripción"
              className="min-h-11 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
            />
          </label>
          <select
            aria-label="Filtrar por estado"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                page: 1,
                status: event.target.value as Filters["status"],
              }))
            }
            className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700"
          >
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por prioridad"
            value={filters.priority}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                page: 1,
                priority: event.target.value as Filters["priority"],
              }))
            }
            className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700"
          >
            <option value="">Toda prioridad</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-700"
          >
            Buscar
          </button>
        </form>
      </section>

      {mutationError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={18} /> {mutationError}
        </div>
      )}

      {loading ? (
        <div
          role="status"
          className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-500"
        >
          <Loader2 className="animate-spin text-blue-700" size={30} />
          <span className="font-bold">
            Consultando casos del tenant activo…
          </span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center"
        >
          <AlertCircle className="text-red-600" size={34} />
          <div>
            <h2 className="font-black text-slate-950">
              No fue posible cargar los casos
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-wider text-white"
          >
            <RefreshCw size={16} /> Reintentar
          </button>
        </div>
      ) : !result?.items.length ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Inbox className="mb-4 text-slate-300" size={48} />
          <h2 className="font-black text-slate-950">
            No hay casos para estos filtros
          </h2>
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            La plataforma no agrega datos de ejemplo. Ajusta los filtros o
            radica la primera solicitud real.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>{result.pagination.total} casos encontrados</span>
            <span>
              Página {filters.page} de {totalPages}
            </span>
          </div>
          <section className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
            {result.items.map((issueCase) => (
              <CaseCard
                key={`${issueCase.id}:${issueCase.updatedAt}`}
                issueCase={issueCase}
                assignees={assignees}
                canMutate={canMutate}
                canManageAssignments={canManageAssignments}
                saving={saving === issueCase.id}
                onSave={handleUpdate}
                onOpenInteractions={setSelectedCase}
              />
            ))}
          </section>
          <nav
            aria-label="Paginación de casos"
            className="flex justify-end gap-3"
          >
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <button
              type="button"
              disabled={filters.page >= totalPages}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-40"
            >
              Siguiente <ChevronRight size={16} />
            </button>
          </nav>
        </>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-case-title"
            className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-7">
              <div>
                <h2
                  id="new-case-title"
                  className="text-2xl font-black text-slate-950"
                >
                  Radicar solicitud ciudadana
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  La referencia y el modo los asigna la API de forma segura.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
              >
                <X />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-5 p-7">
              {mutationError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
                >
                  {mutationError}
                </div>
              )}
              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500 md:col-span-2">
                  Asunto
                  <input
                    required
                    maxLength={200}
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500 md:col-span-2">
                  Descripción
                  <textarea
                    required
                    maxLength={5000}
                    rows={5}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Categoría
                  <input
                    required
                    maxLength={100}
                    placeholder="Ej. Servicios públicos"
                    value={form.category}
                    onChange={(event) =>
                      setForm({ ...form, category: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Canal de ingreso
                  <select
                    value={form.sourceChannel}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        sourceChannel: event.target
                          .value as CommunicationChannel,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  >
                    {CHANNEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Prioridad
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        priority: event.target.value as WorkPriority,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {canManageAssignments ? (
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Responsable
                    <select
                      value={form.assigneeId}
                      onChange={(event) =>
                        setForm({ ...form, assigneeId: event.target.value })
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    >
                      <option value="">Sin asignar</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-900">
                    El caso quedara asignado automaticamente a tu usuario.
                  </div>
                )}
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Fecha límite
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(event) =>
                      setForm({ ...form, dueDate: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500 md:col-span-2">
                  Referencia externa opcional
                  <input
                    maxLength={200}
                    placeholder="Código o contacto mínimo necesario"
                    value={form.externalContactRef}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        externalContactRef: event.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm font-bold text-violet-900 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.confidential}
                    onChange={(event) =>
                      setForm({ ...form, confidential: event.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <FileLock2
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                    size={18}
                  />
                  <span>
                    <span className="block">
                      Aplicar etiqueta de manejo especial
                    </span>
                    <span className="mt-1 block text-xs font-semibold normal-case leading-5 tracking-normal text-violet-700">
                      Es una clasificación operativa. No restringe el acceso: la
                      visibilidad sigue los permisos generales del rol y la
                      asignación del caso.
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="min-h-11 rounded-xl border border-slate-200 px-5 text-xs font-black uppercase tracking-wider text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  disabled={saving === "create"}
                  type="submit"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                >
                  {saving === "create" ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Plus size={16} />
                  )}{" "}
                  Radicar caso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedCase && (
        <CaseInteractionsPanel
          key={selectedCase.id}
          issueCase={selectedCase}
          canCreate={canRegisterInteraction}
          canGrantConsent={canRegisterInteraction}
          canRevokeConsent={
            user !== null && CONSENT_REVOKE_ROLES.has(user.backendRole)
          }
          onClose={() => setSelectedCase(null)}
          onCreated={(interaction) => {
            setResult((current) =>
              current
                ? {
                    ...current,
                    items: current.items.map((item) =>
                      item.id === selectedCase.id
                        ? {
                            ...item,
                            resolutionReady:
                              item.resolutionReady ||
                              Boolean(interaction.outcome),
                            _count: {
                              ...item._count,
                              interactions: item._count.interactions + 1,
                            },
                          }
                        : item,
                    ),
                  }
                : current,
            );
            setSelectedCase((current) =>
              current
                ? {
                    ...current,
                    resolutionReady:
                      current.resolutionReady || Boolean(interaction.outcome),
                    _count: {
                      ...current._count,
                      interactions: current._count.interactions + 1,
                    },
                  }
                : current,
            );
            setNotice("Gestión registrada y auditada en la bitácora del caso.");
          }}
        />
      )}
    </div>
  );
}
