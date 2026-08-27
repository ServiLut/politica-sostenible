"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import {
  Commitment,
  CommitmentStatus,
  createCommitment,
  CreateCommitmentInput,
  createTask,
  CreateTaskInput,
  listCommitments,
  listTasks,
  PaginatedResult,
  PoliticalOperationMode,
  Task,
  TaskStatus,
  updateCommitment,
  updateTask,
  WorkPriority,
} from "@/lib/work-api";

type View = "tasks" | "commitments";
type Dialog = "task" | "commitment" | null;

interface TaskFilters {
  page: number;
  search: string;
  status: "" | TaskStatus;
  priority: "" | WorkPriority;
}

interface CommitmentFilters {
  page: number;
  search: string;
  status: "" | CommitmentStatus;
  isPublic: "" | "true" | "false";
}

const PAGE_SIZE = 9;

const TASK_STATUSES: ReadonlyArray<{ value: TaskStatus; label: string }> = [
  { value: "TODO", label: "Por hacer" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "BLOCKED", label: "Bloqueada" },
  { value: "DONE", label: "Terminada" },
  { value: "CANCELLED", label: "Cancelada" },
];

const PRIORITIES: ReadonlyArray<{ value: WorkPriority; label: string }> = [
  { value: "LOW", label: "Baja" },
  { value: "MEDIUM", label: "Media" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
];

const COMMITMENT_STATUSES: ReadonlyArray<{
  value: CommitmentStatus;
  label: string;
}> = [
  { value: "PROPOSED", label: "Propuesto" },
  { value: "PLANNED", label: "Planificado" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "AT_RISK", label: "En riesgo" },
  { value: "FULFILLED", label: "Cumplido" },
  { value: "NOT_FULFILLED", label: "No cumplido" },
  { value: "CANCELLED", label: "Cancelado" },
];

const INITIAL_TASK_FILTERS: TaskFilters = {
  page: 1,
  search: "",
  status: "",
  priority: "",
};

const INITIAL_COMMITMENT_FILTERS: CommitmentFilters = {
  page: 1,
  search: "",
  status: "",
  isPublic: "",
};

function statusLabel<T extends string>(
  value: T,
  options: ReadonlyArray<{ value: T; label: string }>,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function modeLabel(mode: PoliticalOperationMode | undefined): string {
  if (mode === "CAMPAIGN") return "Campaña";
  if (mode === "PUBLIC_OFFICE") return "Gestión pública";
  return "Modo definido por la API";
}

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error inesperado. Intenta nuevamente.";
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

function dateInputToIso(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString();
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <nav
      aria-label="Paginación"
      className="flex items-center justify-end gap-3"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft aria-hidden="true" size={16} /> Anterior
      </button>
      <span className="text-sm font-semibold text-slate-600">
        Página {page} de {safeTotalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= safeTotalPages}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Siguiente <ChevronRight aria-hidden="true" size={16} />
      </button>
    </nav>
  );
}

function RequestState({
  loading,
  error,
  empty,
  emptyTitle,
  emptyMessage,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyTitle: string;
  emptyMessage: string;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-500"
      >
        <Loader2
          aria-hidden="true"
          className="animate-spin text-blue-600"
          size={28}
        />
        <span className="font-semibold">Cargando información…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center"
      >
        <AlertCircle aria-hidden="true" className="text-red-600" size={32} />
        <div>
          <h2 className="font-black text-slate-900">
            No pudimos cargar la información
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          <RefreshCw aria-hidden="true" size={16} /> Reintentar
        </button>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <ClipboardList
          aria-hidden="true"
          className="mb-4 text-slate-300"
          size={44}
        />
        <h2 className="font-black text-slate-900">{emptyTitle}</h2>
        <p className="mt-1 max-w-lg text-sm text-slate-500">{emptyMessage}</p>
      </div>
    );
  }

  return null;
}

export default function TasksPage() {
  const [view, setView] = useState<View>("tasks");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [taskFilters, setTaskFilters] =
    useState<TaskFilters>(INITIAL_TASK_FILTERS);
  const [commitmentFilters, setCommitmentFilters] = useState<CommitmentFilters>(
    INITIAL_COMMITMENT_FILTERS,
  );
  const [taskSearch, setTaskSearch] = useState("");
  const [commitmentSearch, setCommitmentSearch] = useState("");
  const [taskResult, setTaskResult] = useState<PaginatedResult<Task> | null>(
    null,
  );
  const [commitmentResult, setCommitmentResult] =
    useState<PaginatedResult<Commitment> | null>(null);
  const [taskLoading, setTaskLoading] = useState(true);
  const [commitmentLoading, setCommitmentLoading] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [commitmentError, setCommitmentError] = useState<string | null>(null);
  const [taskReload, setTaskReload] = useState(0);
  const [commitmentReload, setCommitmentReload] = useState(0);
  const [mutation, setMutation] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>(
    {},
  );
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "MEDIUM" as WorkPriority,
    dueDate: "",
  });
  const [newCommitment, setNewCommitment] = useState({
    reference: "",
    title: "",
    description: "",
    targetDate: "",
    isPublic: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    setTaskLoading(true);
    setTaskError(null);

    void listTasks(
      {
        page: taskFilters.page,
        limit: PAGE_SIZE,
        search: taskFilters.search || undefined,
        status: taskFilters.status || undefined,
        priority: taskFilters.priority || undefined,
      },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setTaskResult(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setTaskError(readableError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setTaskLoading(false);
      });

    return () => controller.abort();
  }, [taskFilters, taskReload]);

  useEffect(() => {
    const controller = new AbortController();
    setCommitmentLoading(true);
    setCommitmentError(null);

    void listCommitments(
      {
        page: commitmentFilters.page,
        limit: PAGE_SIZE,
        search: commitmentFilters.search || undefined,
        status: commitmentFilters.status || undefined,
        isPublic: commitmentFilters.isPublic || undefined,
      },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setCommitmentResult(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setCommitmentError(readableError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommitmentLoading(false);
      });

    return () => controller.abort();
  }, [commitmentFilters, commitmentReload]);

  useEffect(() => {
    if (!dialog) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    dialogTitleRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousActiveElement?.focus();
    };
  }, [dialog]);

  const activeMode = useMemo(
    () => taskResult?.items[0]?.mode ?? commitmentResult?.items[0]?.mode,
    [taskResult, commitmentResult],
  );

  function showNotice(message: string) {
    setNotice(message);
    setMutationError(null);
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMutation("create-task");
    setMutationError(null);

    const input: CreateTaskInput = {
      title: newTask.title.trim(),
      priority: newTask.priority,
      ...(newTask.description.trim()
        ? { description: newTask.description.trim() }
        : {}),
      ...(newTask.dueDate ? { dueAt: dateInputToIso(newTask.dueDate) } : {}),
    };

    try {
      await createTask(input);
      setNewTask({
        title: "",
        description: "",
        priority: "MEDIUM",
        dueDate: "",
      });
      setDialog(null);
      setTaskFilters((current) => ({ ...current, page: 1 }));
      setTaskReload((current) => current + 1);
      showNotice("Tarea creada correctamente.");
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutation(null);
    }
  }

  async function handleCreateCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMutation("create-commitment");
    setMutationError(null);

    const input: CreateCommitmentInput = {
      reference: newCommitment.reference.trim(),
      title: newCommitment.title.trim(),
      description: newCommitment.description.trim(),
      isPublic: newCommitment.isPublic,
      ...(newCommitment.targetDate
        ? { targetDate: dateInputToIso(newCommitment.targetDate) }
        : {}),
    };

    try {
      await createCommitment(input);
      setNewCommitment({
        reference: "",
        title: "",
        description: "",
        targetDate: "",
        isPublic: false,
      });
      setDialog(null);
      setCommitmentFilters((current) => ({ ...current, page: 1 }));
      setCommitmentReload((current) => current + 1);
      showNotice("Compromiso creado correctamente.");
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutation(null);
    }
  }

  async function handleTaskStatus(task: Task, status: TaskStatus) {
    const mutationKey = `task-status-${task.id}`;
    setMutation(mutationKey);
    setMutationError(null);

    try {
      const updated = await updateTask(task.id, { status });
      setTaskResult((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      showNotice(`Estado de “${task.title}” actualizado.`);
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutation(null);
    }
  }

  async function handleCommitmentStatus(
    commitment: Commitment,
    status: CommitmentStatus,
  ) {
    const mutationKey = `commitment-status-${commitment.id}`;
    setMutation(mutationKey);
    setMutationError(null);

    try {
      const updated = await updateCommitment(commitment.id, { status });
      setCommitmentResult((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      showNotice(`Estado de “${commitment.title}” actualizado.`);
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutation(null);
    }
  }

  async function handleCommitmentProgress(commitment: Commitment) {
    const progress = progressDrafts[commitment.id] ?? commitment.progress;
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      setMutationError("El avance debe ser un número entero entre 0 y 100.");
      return;
    }

    const mutationKey = `commitment-progress-${commitment.id}`;
    setMutation(mutationKey);
    setMutationError(null);

    try {
      const updated = await updateCommitment(commitment.id, { progress });
      setCommitmentResult((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      setProgressDrafts((current) => ({
        ...current,
        [commitment.id]: updated.progress,
      }));
      showNotice(`Avance de “${commitment.title}” actualizado.`);
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutation(null);
    }
  }

  function submitTaskSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskFilters((current) => ({
      ...current,
      page: 1,
      search: taskSearch.trim(),
    }));
  }

  function submitCommitmentSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommitmentFilters((current) => ({
      ...current,
      page: 1,
      search: commitmentSearch.trim(),
    }));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-blue-700">
            <span
              className="h-2 w-2 rounded-full bg-blue-600"
              aria-hidden="true"
            />
            {modeLabel(activeMode)}
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            Tareas y compromisos
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Organiza el trabajo operativo y da seguimiento verificable a los
            compromisos de la organización.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMutationError(null);
            setDialog(view === "tasks" ? "task" : "commitment");
          }}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-700"
        >
          <Plus aria-hidden="true" size={19} />
          {view === "tasks" ? "Nueva tarea" : "Nuevo compromiso"}
        </button>
      </header>

      <div aria-live="polite" className="space-y-3">
        {notice && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" size={18} /> {notice}
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Cerrar confirmación"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>
        )}
        {mutationError && !dialog && (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900"
          >
            <span className="inline-flex items-center gap-2">
              <AlertCircle aria-hidden="true" size={18} /> {mutationError}
            </span>
            <button
              type="button"
              onClick={() => setMutationError(null)}
              aria-label="Cerrar error"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Tipo de seguimiento"
        className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        <button
          id="tasks-tab"
          type="button"
          role="tab"
          aria-selected={view === "tasks"}
          aria-controls="tasks-panel"
          onClick={() => setView("tasks")}
          className={`min-h-11 rounded-xl px-5 text-sm font-black transition ${
            view === "tasks"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Tareas {taskResult ? `(${taskResult.pagination.total})` : ""}
        </button>
        <button
          id="commitments-tab"
          type="button"
          role="tab"
          aria-selected={view === "commitments"}
          aria-controls="commitments-panel"
          onClick={() => setView("commitments")}
          className={`min-h-11 rounded-xl px-5 text-sm font-black transition ${
            view === "commitments"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Compromisos{" "}
          {commitmentResult ? `(${commitmentResult.pagination.total})` : ""}
        </button>
      </div>

      <section
        id="tasks-panel"
        role="tabpanel"
        aria-labelledby="tasks-tab"
        hidden={view !== "tasks"}
        className="space-y-5"
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <form
            role="search"
            aria-label="Filtrar tareas"
            onSubmit={submitTaskSearch}
            className="grid gap-3 lg:grid-cols-[1fr_12rem_12rem_auto]"
          >
            <label className="relative">
              <span className="sr-only">Buscar tareas</span>
              <Search
                aria-hidden="true"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="search"
                value={taskSearch}
                onChange={(event) => setTaskSearch(event.target.value)}
                placeholder="Buscar por título o descripción"
                className="min-h-12 w-full rounded-2xl border border-slate-200 pl-11 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="sr-only">Estado de la tarea</span>
              <select
                value={taskFilters.status}
                onChange={(event) =>
                  setTaskFilters((current) => ({
                    ...current,
                    page: 1,
                    status: event.target.value as "" | TaskStatus,
                  }))
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Todos los estados</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Prioridad de la tarea</span>
              <select
                value={taskFilters.priority}
                onChange={(event) =>
                  setTaskFilters((current) => ({
                    ...current,
                    page: 1,
                    priority: event.target.value as "" | WorkPriority,
                  }))
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Todas las prioridades</option>
                {PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="min-h-12 rounded-2xl bg-slate-900 px-5 text-sm font-black text-white transition hover:bg-blue-700"
            >
              Buscar
            </button>
          </form>
        </div>

        <RequestState
          loading={taskLoading}
          error={taskError}
          empty={
            !taskLoading && !taskError && (taskResult?.items.length ?? 0) === 0
          }
          emptyTitle="No hay tareas con estos filtros"
          emptyMessage="Cambia los filtros o crea la primera tarea para comenzar el seguimiento."
          onRetry={() => setTaskReload((current) => current + 1)}
        />

        {!taskLoading &&
          !taskError &&
          taskResult &&
          taskResult.items.length > 0 && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {taskResult.items.map((task) => {
                  const statusMutation = mutation === `task-status-${task.id}`;
                  return (
                    <article
                      key={task.id}
                      data-testid={`task-card-${task.id}`}
                      aria-labelledby={`task-title-${task.id}`}
                      className="flex min-h-64 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                          <Flag aria-hidden="true" size={13} />
                          {statusLabel(task.priority, PRIORITIES)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                          {statusLabel(task.status, TASK_STATUSES)}
                        </span>
                      </div>
                      <h2
                        id={`task-title-${task.id}`}
                        className="mt-4 text-lg font-black leading-tight text-slate-950"
                      >
                        {task.title}
                      </h2>
                      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">
                        {task.description || "Sin descripción adicional."}
                      </p>
                      <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                        <div className="flex items-center justify-between gap-3">
                          <dt className="font-bold">Responsable</dt>
                          <dd className="truncate">
                            {task.assignee?.name ?? "Sin asignar"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="inline-flex items-center gap-1 font-bold">
                            <CalendarDays aria-hidden="true" size={14} /> Vence
                          </dt>
                          <dd>{formatDate(task.dueAt)}</dd>
                        </div>
                      </dl>
                      <label className="mt-4 block text-xs font-black text-slate-700">
                        Estado de {task.title}
                        <span className="relative mt-1 block">
                          <select
                            aria-label={`Estado de ${task.title}`}
                            value={task.status}
                            disabled={Boolean(mutation)}
                            onChange={(event) =>
                              void handleTaskStatus(
                                task,
                                event.target.value as TaskStatus,
                              )
                            }
                            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                          >
                            {TASK_STATUSES.map((status) => (
                              <option key={status.value} value={status.value}>
                                {status.label}
                              </option>
                            ))}
                          </select>
                          {statusMutation && (
                            <Loader2
                              aria-label="Actualizando estado"
                              className="absolute right-8 top-3 animate-spin text-blue-600"
                              size={17}
                            />
                          )}
                        </span>
                      </label>
                    </article>
                  );
                })}
              </div>
              <Pagination
                page={taskResult.pagination.page}
                totalPages={taskResult.pagination.totalPages}
                onChange={(page) =>
                  setTaskFilters((current) => ({ ...current, page }))
                }
              />
            </>
          )}
      </section>

      <section
        id="commitments-panel"
        role="tabpanel"
        aria-labelledby="commitments-tab"
        hidden={view !== "commitments"}
        className="space-y-5"
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <form
            role="search"
            aria-label="Filtrar compromisos"
            onSubmit={submitCommitmentSearch}
            className="grid gap-3 lg:grid-cols-[1fr_12rem_12rem_auto]"
          >
            <label className="relative">
              <span className="sr-only">Buscar compromisos</span>
              <Search
                aria-hidden="true"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="search"
                value={commitmentSearch}
                onChange={(event) => setCommitmentSearch(event.target.value)}
                placeholder="Buscar por referencia, título o descripción"
                className="min-h-12 w-full rounded-2xl border border-slate-200 pl-11 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="sr-only">Estado del compromiso</span>
              <select
                value={commitmentFilters.status}
                onChange={(event) =>
                  setCommitmentFilters((current) => ({
                    ...current,
                    page: 1,
                    status: event.target.value as "" | CommitmentStatus,
                  }))
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Todos los estados</option>
                {COMMITMENT_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Visibilidad del compromiso</span>
              <select
                value={commitmentFilters.isPublic}
                onChange={(event) =>
                  setCommitmentFilters((current) => ({
                    ...current,
                    page: 1,
                    isPublic: event.target.value as "" | "true" | "false",
                  }))
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Toda visibilidad</option>
                <option value="true">Públicos</option>
                <option value="false">Internos</option>
              </select>
            </label>
            <button
              type="submit"
              className="min-h-12 rounded-2xl bg-slate-900 px-5 text-sm font-black text-white transition hover:bg-blue-700"
            >
              Buscar
            </button>
          </form>
        </div>

        <RequestState
          loading={commitmentLoading}
          error={commitmentError}
          empty={
            !commitmentLoading &&
            !commitmentError &&
            (commitmentResult?.items.length ?? 0) === 0
          }
          emptyTitle="No hay compromisos con estos filtros"
          emptyMessage="Cambia los filtros o registra el primer compromiso para iniciar su seguimiento."
          onRetry={() => setCommitmentReload((current) => current + 1)}
        />

        {!commitmentLoading &&
          !commitmentError &&
          commitmentResult &&
          commitmentResult.items.length > 0 && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {commitmentResult.items.map((commitment) => {
                  const currentProgress =
                    progressDrafts[commitment.id] ?? commitment.progress;
                  const statusMutation =
                    mutation === `commitment-status-${commitment.id}`;
                  const progressMutation =
                    mutation === `commitment-progress-${commitment.id}`;
                  return (
                    <article
                      key={commitment.id}
                      data-testid={`commitment-card-${commitment.id}`}
                      aria-labelledby={`commitment-title-${commitment.id}`}
                      className="flex min-h-80 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-mono text-xs font-black text-blue-700">
                          {commitment.reference}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                          {commitment.isPublic ? (
                            <Eye aria-hidden="true" size={13} />
                          ) : (
                            <EyeOff aria-hidden="true" size={13} />
                          )}
                          {commitment.isPublic ? "Público" : "Interno"}
                        </span>
                      </div>
                      <h2
                        id={`commitment-title-${commitment.id}`}
                        className="mt-4 text-lg font-black leading-tight text-slate-950"
                      >
                        {commitment.title}
                      </h2>
                      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">
                        {commitment.description}
                      </p>
                      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs text-slate-600">
                        <div>
                          <dt className="font-bold">Fecha objetivo</dt>
                          <dd className="mt-1">
                            {formatDate(commitment.targetDate)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold">Tareas vinculadas</dt>
                          <dd className="mt-1">{commitment._count.tasks}</dd>
                        </div>
                      </dl>
                      <label className="mt-4 block text-xs font-black text-slate-700">
                        Estado de {commitment.title}
                        <span className="relative mt-1 block">
                          <select
                            aria-label={`Estado de ${commitment.title}`}
                            value={commitment.status}
                            disabled={Boolean(mutation)}
                            onChange={(event) =>
                              void handleCommitmentStatus(
                                commitment,
                                event.target.value as CommitmentStatus,
                              )
                            }
                            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                          >
                            {COMMITMENT_STATUSES.map((status) => (
                              <option key={status.value} value={status.value}>
                                {status.label}
                              </option>
                            ))}
                          </select>
                          {statusMutation && (
                            <Loader2
                              aria-label="Actualizando estado"
                              className="absolute right-8 top-3 animate-spin text-blue-600"
                              size={17}
                            />
                          )}
                        </span>
                      </label>
                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between text-xs font-black text-slate-700">
                          <label htmlFor={`progress-${commitment.id}`}>
                            Avance
                          </label>
                          <span>{currentProgress}%</span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`Avance de ${commitment.title}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={currentProgress}
                          className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100"
                        >
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all"
                            style={{ width: `${currentProgress}%` }}
                          />
                        </div>
                        <div className="flex gap-2">
                          <input
                            id={`progress-${commitment.id}`}
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={currentProgress}
                            disabled={Boolean(mutation)}
                            onChange={(event) =>
                              setProgressDrafts((current) => ({
                                ...current,
                                [commitment.id]: Number(event.target.value),
                              }))
                            }
                            className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void handleCommitmentProgress(commitment)
                            }
                            disabled={
                              Boolean(mutation) ||
                              currentProgress === commitment.progress
                            }
                            className="min-h-11 rounded-xl bg-slate-900 px-4 text-xs font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {progressMutation ? (
                              <Loader2
                                aria-label="Guardando avance"
                                className="animate-spin"
                                size={17}
                              />
                            ) : (
                              "Guardar"
                            )}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <Pagination
                page={commitmentResult.pagination.page}
                totalPages={commitmentResult.pagination.totalPages}
                onChange={(page) =>
                  setCommitmentFilters((current) => ({ ...current, page }))
                }
              />
            </>
          )}
      </section>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-dialog-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2
                  id="work-dialog-title"
                  ref={dialogTitleRef}
                  tabIndex={-1}
                  className="text-xl font-black text-slate-950 outline-none"
                >
                  {dialog === "task" ? "Crear tarea" : "Registrar compromiso"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Los datos se guardarán en el modo operativo activo de la API.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={Boolean(mutation)}
                aria-label="Cerrar formulario"
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
              >
                <X aria-hidden="true" size={21} />
              </button>
            </header>

            {dialog === "task" ? (
              <form onSubmit={handleCreateTask} className="space-y-5 p-6">
                <label className="block text-sm font-black text-slate-800">
                  Título
                  <input
                    required
                    maxLength={200}
                    autoComplete="off"
                    value={newTask.title}
                    onChange={(event) =>
                      setNewTask((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="block text-sm font-black text-slate-800">
                  Descripción{" "}
                  <span className="font-normal text-slate-400">(opcional)</span>
                  <textarea
                    rows={4}
                    maxLength={5000}
                    value={newTask.description}
                    onChange={(event) =>
                      setNewTask((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-black text-slate-800">
                    Prioridad
                    <select
                      value={newTask.priority}
                      onChange={(event) =>
                        setNewTask((current) => ({
                          ...current,
                          priority: event.target.value as WorkPriority,
                        }))
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    >
                      {PRIORITIES.map((priority) => (
                        <option key={priority.value} value={priority.value}>
                          {priority.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-black text-slate-800">
                    Fecha límite{" "}
                    <span className="font-normal text-slate-400">
                      (opcional)
                    </span>
                    <input
                      type="date"
                      value={newTask.dueDate}
                      onChange={(event) =>
                        setNewTask((current) => ({
                          ...current,
                          dueDate: event.target.value,
                        }))
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </div>
                {mutationError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"
                  >
                    {mutationError}
                  </p>
                )}
                <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    disabled={Boolean(mutation)}
                    className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={Boolean(mutation)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {mutation === "create-task" && (
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin"
                        size={17}
                      />
                    )}
                    Crear tarea
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateCommitment} className="space-y-5 p-6">
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <label className="block text-sm font-black text-slate-800">
                    Referencia
                    <input
                      required
                      maxLength={100}
                      autoComplete="off"
                      value={newCommitment.reference}
                      onChange={(event) =>
                        setNewCommitment((current) => ({
                          ...current,
                          reference: event.target.value,
                        }))
                      }
                      placeholder="CMP-001"
                      className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-sm font-black text-slate-800">
                    Título
                    <input
                      required
                      maxLength={200}
                      autoComplete="off"
                      value={newCommitment.title}
                      onChange={(event) =>
                        setNewCommitment((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </div>
                <label className="block text-sm font-black text-slate-800">
                  Descripción
                  <textarea
                    required
                    rows={4}
                    maxLength={5000}
                    value={newCommitment.description}
                    onChange={(event) =>
                      setNewCommitment((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-black text-slate-800">
                    Fecha objetivo{" "}
                    <span className="font-normal text-slate-400">
                      (opcional)
                    </span>
                    <input
                      type="date"
                      value={newCommitment.targetDate}
                      onChange={(event) =>
                        setNewCommitment((current) => ({
                          ...current,
                          targetDate: event.target.value,
                        }))
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                  <label className="mt-7 flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-800">
                    <input
                      type="checkbox"
                      checked={newCommitment.isPublic}
                      onChange={(event) =>
                        setNewCommitment((current) => ({
                          ...current,
                          isPublic: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Compromiso público
                  </label>
                </div>
                {mutationError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"
                  >
                    {mutationError}
                  </p>
                )}
                <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    disabled={Boolean(mutation)}
                    className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={Boolean(mutation)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {mutation === "create-commitment" && (
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin"
                        size={17}
                      />
                    )}
                    Registrar compromiso
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
