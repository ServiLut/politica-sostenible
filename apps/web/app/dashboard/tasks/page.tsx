"use client";

import { usePageRequest } from "@/lib/use-page-request";
import { useSearchParams } from "next/navigation";

import { ExportButton } from "@/components/ui/ExportButton";
import { UserCombobox } from "@/components/ui/UserCombobox";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import { getIssueCase } from "@/lib/cases-api";
import { canExportData } from "@/lib/export-policy";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import {
  Commitment,
  CommitmentStatus,
  createCommitment,
  CreateCommitmentInput,
  createTask,
  CreateTaskInput,
  listCommitments,
  listTaskAssignees,
  listTasks,
  PoliticalOperationMode,
  Task,
  TaskStatus,
  updateCommitment,
  updateTask,
  WorkPriority,
} from "@/lib/work-api";
import type { BackendUserRole } from "@/types/saas-schema";
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
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type View = "tasks" | "commitments";
type Dialog = "task" | "commitment" | null;
type DeepLinkTarget = { view: View; entityId: string };

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

const searchTaskAssignees = (search: string, signal: AbortSignal, page = 1) =>
  listTaskAssignees({ search, page, limit: 20 }, signal);

const CAMPAIGN_TASK_CREATE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMMUNICATIONS_MANAGER",
  "ZONE_COORDINATOR",
]);

const PUBLIC_OFFICE_TASK_CREATE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CONSTITUENT_SERVICES_MANAGER",
  "CASE_WORKER",
]);

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
      className="flex items-center justify-end gap-3 min-w-0 flex-wrap"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-40 max-w-full whitespace-normal"
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
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-40 max-w-full whitespace-normal"
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
        className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-500 min-w-0"
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
        className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center min-w-0"
      >
        <AlertCircle aria-hidden="true" className="text-red-600" size={32} />
        <div>
          <h2 className="font-semibold text-slate-900">
            No pudimos cargar la información
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-blue-700 max-w-full whitespace-normal"
        >
          <RefreshCw aria-hidden="true" size={16} /> Reintentar
        </button>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center min-w-0">
        <ClipboardList
          aria-hidden="true"
          className="mb-4 text-slate-300"
          size={44}
        />
        <h2 className="font-semibold text-slate-900">{emptyTitle}</h2>
        <p className="mt-1 max-w-lg text-sm text-slate-500">{emptyMessage}</p>
      </div>
    );
  }

  return null;
}

export default function TasksPage() {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return <TasksWorkspace key={search} search={search} />;
}

function TasksWorkspace({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const requestedView = params.get("view");
  const entityId = params.get("entityId")?.trim() ?? "";
  const caseId = params.get("issueCaseId")?.trim() ?? "";
  const create = params.get("create");
  const { tenant, user } = useAuth();
  const canCreateTask = Boolean(
    user &&
    tenant &&
    (tenant.type === "PUBLIC_OFFICE"
      ? PUBLIC_OFFICE_TASK_CREATE_ROLES.has(user.backendRole)
      : CAMPAIGN_TASK_CREATE_ROLES.has(user.backendRole)),
  );
  const [view, setView] = useState<View>(
    create === "commitment" || requestedView === "commitments"
      ? "commitments"
      : "tasks",
  );
  const [deepLinkTarget] = useState<DeepLinkTarget | null>(
    entityId &&
      entityId.length <= 128 &&
      (requestedView === "tasks" || requestedView === "commitments")
      ? { view: requestedView, entityId }
      : null,
  );
  const [dialogSelection, setDialog] = useState<Dialog | undefined>(undefined);
  const [linkedCaseRequestId, setLinkedCaseRequestId] = useState<string | null>(
    caseId && caseId.length <= 128 ? caseId : null,
  );
  const requestedDialog: Dialog =
    linkedCaseRequestId && (create === "task" || create === "commitment")
      ? create
      : null;
  const [taskFilters, setTaskFilters] =
    useState<TaskFilters>(INITIAL_TASK_FILTERS);
  const [commitmentFilters, setCommitmentFilters] = useState<CommitmentFilters>(
    INITIAL_COMMITMENT_FILTERS,
  );
  const [taskSearch, setTaskSearch] = useState("");
  const [commitmentSearch, setCommitmentSearch] = useState("");
  const [taskReload, setTaskReload] = useState(0);
  const [commitmentReload, setCommitmentReload] = useState(0);
  const [mutation, setMutation] = useState<string | null>(null);
  const [actionError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>(
    {},
  );
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const [taskDraft, setNewTask] = useState({
    title: "",
    description: "",
    priority: "MEDIUM" as WorkPriority,
    dueDate: "",
    assigneeId: "",
    assigneeName: "",
  });
  const [commitmentDraft, setNewCommitment] = useState({
    reference: "",
    title: "",
    description: "",
    targetDate: "",
    isPublic: false,
    ownerId: "",
    ownerName: "",
  });

  const linkedRequest = useCallback(
    (signal: AbortSignal) => getIssueCase(linkedCaseRequestId!, signal),
    [linkedCaseRequestId],
  );
  const linkedQuery = usePageRequest(linkedRequest, {
    enabled: Boolean(linkedCaseRequestId),
  });
  const linkedCase = linkedQuery.data;
  const linkedCaseLoading = linkedQuery.loading;
  const linkedCaseError =
    caseId.length > 128
      ? "El vínculo recibido no tiene un identificador de caso válido."
      : linkedQuery.error
        ? `No fue posible vincular el caso solicitado. ${readableError(linkedQuery.error)}`
        : null;
  const ownId = user?.id ?? "";
  const newTask = {
    ...taskDraft,
    assigneeId: taskDraft.assigneeId || ownId,
  };
  const newCommitment = {
    ...commitmentDraft,
    ownerId: commitmentDraft.ownerId || ownId,
  };
  const taskRequest = useCallback(
    (signal: AbortSignal) =>
      listTasks(
        {
          page: taskFilters.page,
          limit: PAGE_SIZE,
          entityId:
            deepLinkTarget?.view === "tasks"
              ? deepLinkTarget.entityId
              : undefined,
          search: taskFilters.search || undefined,
          status: taskFilters.status || undefined,
          priority: taskFilters.priority || undefined,
          issueCaseId: linkedCase?.id,
        },
        signal,
      ),
    [deepLinkTarget, linkedCase?.id, taskFilters],
  );
  const tasks = usePageRequest(taskRequest, {
    reloadKey: taskReload,
    enabled: !linkedCaseRequestId || Boolean(linkedCase),
  });
  const taskResult = tasks.data;
  const setTaskResult = tasks.setData;
  const taskLoading = tasks.loading;
  const taskError = tasks.error ? readableError(tasks.error) : null;
  const commitmentRequest = useCallback(
    (signal: AbortSignal) =>
      listCommitments(
        {
          page: commitmentFilters.page,
          limit: PAGE_SIZE,
          entityId:
            deepLinkTarget?.view === "commitments"
              ? deepLinkTarget.entityId
              : undefined,
          search: commitmentFilters.search || undefined,
          status: commitmentFilters.status || undefined,
          isPublic: commitmentFilters.isPublic || undefined,
          issueCaseId: linkedCase?.id,
        },
        signal,
      ),
    [commitmentFilters, deepLinkTarget, linkedCase?.id],
  );
  const commitments = usePageRequest(commitmentRequest, {
    reloadKey: commitmentReload,
    enabled: !linkedCaseRequestId || Boolean(linkedCase),
  });
  const commitmentResult = commitments.data;
  const setCommitmentResult = commitments.setData;
  const commitmentLoading = commitments.loading;
  const commitmentError = commitments.error
    ? readableError(commitments.error)
    : null;
  const requestedDialogAllowed =
    requestedDialog === "task"
      ? canCreateTask
      : requestedDialog === "commitment" &&
        commitmentResult?.permissions.canCreate;
  const dialog =
    dialogSelection === undefined
      ? linkedCase && requestedDialogAllowed
        ? requestedDialog
        : null
      : dialogSelection;
  const mutationError =
    actionError ??
    (entityId.length > 128
      ? "El vínculo recibido no tiene un identificador de trabajo válido."
      : null) ??
    (dialogSelection === undefined &&
    linkedCase &&
    requestedDialog &&
    !requestedDialogAllowed &&
    !commitmentLoading
      ? "Tu acceso actual no permite crear el trabajo solicitado."
      : null);

  useAccessibleDialog({
    open: dialog !== null,
    containerRef: dialogRef,
    initialFocusRef: dialogTitleRef,
    onClose: () => {
      if (!mutation) setDialog(null);
    },
    closeOnEscape: mutation === null,
  });

  useEffect(() => {
    if (!deepLinkTarget || view !== deepLinkTarget.view) return;

    const items =
      deepLinkTarget.view === "tasks"
        ? taskResult?.items
        : commitmentResult?.items;
    const loading =
      deepLinkTarget.view === "tasks" ? taskLoading : commitmentLoading;
    if (loading || !items?.some((item) => item.id === deepLinkTarget.entityId))
      return;

    const frame = window.requestAnimationFrame(() => {
      const prefix =
        deepLinkTarget.view === "tasks" ? "task-item" : "commitment-item";
      const element = document.getElementById(
        `${prefix}-${deepLinkTarget.entityId}`,
      );
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    commitmentLoading,
    commitmentResult,
    deepLinkTarget,
    taskLoading,
    taskResult,
    view,
  ]);

  const activeMode = useMemo(
    () => taskResult?.items[0]?.mode ?? commitmentResult?.items[0]?.mode,
    [taskResult, commitmentResult],
  );
  const canExport = canExportData(user?.backendRole);
  const canCreateCurrentView =
    view === "tasks"
      ? canCreateTask
      : Boolean(commitmentResult?.permissions.canCreate);
  const exportModuleName = view === "tasks" ? "tareas" : "compromisos";

  function showNotice(message: string) {
    setNotice(message);
    setMutationError(null);
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMutation("create-task");
    setMutationError(null);

    if (!newTask.assigneeId) {
      setMutation(null);
      setMutationError("Selecciona una persona responsable para la tarea.");
      return;
    }

    const input: CreateTaskInput = {
      title: newTask.title.trim(),
      priority: newTask.priority,
      assigneeId: newTask.assigneeId,
      ...(newTask.description.trim()
        ? { description: newTask.description.trim() }
        : {}),
      ...(newTask.dueDate ? { dueAt: dateInputToIso(newTask.dueDate) } : {}),
      ...(linkedCase ? { issueCaseId: linkedCase.id } : {}),
    };

    try {
      await createTask(input);
      setNewTask({
        title: "",
        description: "",
        priority: "MEDIUM",
        dueDate: "",
        assigneeId: ownId,
        assigneeName: user?.name ?? "",
      });
      setDialog(null);
      setTaskFilters((current) => ({ ...current, page: 1 }));
      setTaskReload((current) => current + 1);
      showNotice(
        linkedCase
          ? `Tarea creada y vinculada al caso ${linkedCase.reference}.`
          : "Tarea creada correctamente.",
      );
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutation(null);
    }
  }

  async function handleCreateCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commitmentResult?.permissions.canCreate) {
      setMutationError(
        "Tu acceso actual permite consultar compromisos, pero no crearlos.",
      );
      return;
    }
    if (!newCommitment.ownerId) {
      setMutationError(
        "Selecciona una persona responsable para el compromiso.",
      );
      return;
    }
    setMutation("create-commitment");
    setMutationError(null);

    const input: CreateCommitmentInput = {
      reference: newCommitment.reference.trim(),
      title: newCommitment.title.trim(),
      description: newCommitment.description.trim(),
      isPublic: newCommitment.isPublic,
      ownerId: newCommitment.ownerId,
      ...(newCommitment.targetDate
        ? { targetDate: dateInputToIso(newCommitment.targetDate) }
        : {}),
      ...(linkedCase ? { issueCaseId: linkedCase.id } : {}),
    };

    try {
      await createCommitment(input);
      setNewCommitment({
        reference: "",
        title: "",
        description: "",
        targetDate: "",
        isPublic: false,
        ownerId: ownId,
        ownerName: user?.name ?? "",
      });
      setDialog(null);
      setCommitmentFilters((current) => ({ ...current, page: 1 }));
      setCommitmentReload((current) => current + 1);
      showNotice(
        linkedCase
          ? `Compromiso creado y vinculado al caso ${linkedCase.reference}.`
          : "Compromiso creado correctamente.",
      );
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
    if (!commitment.canUpdate) return;
    if (status === "FULFILLED" && commitment.progress !== 100) {
      setMutationError(
        "Guarda primero el avance en 100% antes de marcar el compromiso como cumplido.",
      );
      return;
    }
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
      setProgressDrafts((current) => ({
        ...current,
        [commitment.id]: updated.progress,
      }));
      showNotice(`Estado de “${commitment.title}” actualizado.`);
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutation(null);
    }
  }

  async function handleCommitmentProgress(commitment: Commitment) {
    if (!commitment.canUpdate) return;
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

  function clearLinkedCaseContext() {
    setLinkedCaseRequestId(null);
    setDialog(null);
    setTaskFilters((current) => ({ ...current, page: 1 }));
    setCommitmentFilters((current) => ({ ...current, page: 1 }));

    const url = new URL(window.location.href);
    url.searchParams.delete("issueCaseId");
    url.searchParams.delete("create");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 min-w-0">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between min-w-0">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 min-w-0">
            <span
              className="h-2 w-2 rounded-full bg-blue-600"
              aria-hidden="true"
            />
            {modeLabel(activeMode)}
          </div>
          <h1 className="font-semibold tracking-tight text-slate-950 text-2xl sm:text-3xl break-words">
            Tareas y compromisos
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Organiza el trabajo operativo y da seguimiento verificable a los
            compromisos de la organización.
          </p>
        </div>
        {(canExport || canCreateCurrentView) && (
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            {canExport && <ExportButton moduleName={exportModuleName} />}
            {canCreateCurrentView && (
              <button
                type="button"
                onClick={() => {
                  setMutationError(null);
                  setDialog(view === "tasks" ? "task" : "commitment");
                }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-700 max-w-full whitespace-normal"
              >
                <Plus aria-hidden="true" size={19} />
                {view === "tasks" ? "Nueva tarea" : "Nuevo compromiso"}
              </button>
            )}
          </div>
        )}
      </header>

      {linkedCaseLoading && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900 min-w-0"
        >
          <Loader2 className="animate-spin" aria-hidden="true" size={18} />
          Verificando el caso autorizado antes de vincular el trabajo…
        </div>
      )}

      {linkedCaseError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between min-w-0"
        >
          <span className="inline-flex items-start gap-2 font-semibold">
            <AlertCircle
              className="mt-0.5 shrink-0"
              aria-hidden="true"
              size={18}
            />
            {linkedCaseError}
          </span>
          <button
            type="button"
            onClick={clearLinkedCaseContext}
            className="min-h-10 shrink-0 rounded-xl border border-red-300 px-4 text-sm font-semibold max-w-full whitespace-normal"
          >
            Continuar sin vínculo
          </button>
        </div>
      )}

      {linkedCase && (
        <section
          data-testid="linked-case-context"
          aria-label="Caso vinculado"
          className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between min-w-0"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-xl bg-emerald-700 p-2 text-white">
              <Link2 aria-hidden="true" size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-800">
                Trabajo vinculado a {linkedCase.reference}
              </p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900">
                {linkedCase.title}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Las listas y cualquier registro nuevo se relacionan con este
                caso.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearLinkedCaseContext}
            className="min-h-10 shrink-0 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 max-w-full whitespace-normal"
          >
            Quitar vínculo
          </button>
        </section>
      )}

      <div aria-live="polite" className="space-y-3 min-w-0">
        {notice && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 min-w-0 flex-wrap">
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
            className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 min-w-0 flex-wrap"
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
        className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm min-w-0"
      >
        <button
          id="tasks-tab"
          type="button"
          role="tab"
          aria-selected={view === "tasks"}
          aria-controls="tasks-panel"
          onClick={() => setView("tasks")}
          className={`min-h-11 rounded-xl px-5 text-sm font-semibold transition ${
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
          className={`min-h-11 rounded-xl px-5 text-sm font-semibold transition ${
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
        className="space-y-5 min-w-0"
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm min-w-0">
          <form
            role="search"
            aria-label="Filtrar tareas"
            onSubmit={submitTaskSearch}
            className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] min-w-0"
          >
            <label className="relative min-w-0">
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
                className="min-h-12 w-full rounded-2xl border border-slate-200 pl-11 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
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
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
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
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
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
              className="min-h-12 rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 max-w-full whitespace-normal"
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
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 min-w-0">
                {taskResult.items.map((task) => {
                  const statusMutation = mutation === `task-status-${task.id}`;
                  return (
                    <article
                      key={task.id}
                      id={`task-item-${task.id}`}
                      tabIndex={-1}
                      data-testid={`task-card-${task.id}`}
                      aria-labelledby={`task-title-${task.id}`}
                      aria-current={
                        deepLinkTarget?.view === "tasks" &&
                        deepLinkTarget.entityId === task.id
                          ? "true"
                          : undefined
                      }
                      className={`flex min-h-64 flex-col rounded-3xl border bg-white p-5 shadow-sm transition focus:outline-none focus:ring-4 focus:ring-blue-200 ${
                        deepLinkTarget?.view === "tasks" &&
                        deepLinkTarget.entityId === task.id
                          ? "border-blue-500 ring-4 ring-blue-100"
                          : "border-slate-200 hover:border-blue-200 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 min-w-0 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          <Flag aria-hidden="true" size={13} />
                          {statusLabel(task.priority, PRIORITIES)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                          {statusLabel(task.status, TASK_STATUSES)}
                        </span>
                      </div>
                      <h2
                        id={`task-title-${task.id}`}
                        className="mt-4 text-lg font-semibold leading-tight text-slate-950"
                      >
                        {task.title}
                      </h2>
                      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">
                        {task.description || "Sin descripción adicional."}
                      </p>
                      <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600 min-w-0">
                        <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap">
                          <dt className="font-bold">Responsable</dt>
                          <dd className="truncate">
                            {task.assignee?.name ?? "Sin asignar"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap">
                          <dt className="inline-flex items-center gap-1 font-bold">
                            <CalendarDays aria-hidden="true" size={14} /> Vence
                          </dt>
                          <dd>{formatDate(task.dueAt)}</dd>
                        </div>
                      </dl>
                      <label className="mt-4 block text-sm font-semibold text-slate-700 min-w-0">
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
                            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60 min-w-0 max-w-full"
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
        className="space-y-5 min-w-0"
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm min-w-0">
          <form
            role="search"
            aria-label="Filtrar compromisos"
            onSubmit={submitCommitmentSearch}
            className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] min-w-0"
          >
            <label className="relative min-w-0">
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
                className="min-h-12 w-full rounded-2xl border border-slate-200 pl-11 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
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
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
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
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
              >
                <option value="">Todos los niveles de acceso</option>
                <option value="true">Todo el equipo</option>
                {commitmentResult?.permissions.canReadInternal && (
                  <option value="false">Acceso restringido</option>
                )}
              </select>
            </label>
            <button
              type="submit"
              className="min-h-12 rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 max-w-full whitespace-normal"
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
          emptyMessage={
            commitmentResult?.permissions.canCreate
              ? "Cambia los filtros o registra el primer compromiso para iniciar su seguimiento."
              : "Cambia los filtros para consultar los compromisos visibles para tu acceso actual."
          }
          onRetry={() => setCommitmentReload((current) => current + 1)}
        />

        {!commitmentLoading &&
          !commitmentError &&
          commitmentResult &&
          commitmentResult.items.length > 0 && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 min-w-0">
                {commitmentResult.items.map((commitment) => {
                  const currentProgress =
                    progressDrafts[commitment.id] ?? commitment.progress;
                  const statusMutation =
                    mutation === `commitment-status-${commitment.id}`;
                  const progressMutation =
                    mutation === `commitment-progress-${commitment.id}`;
                  const progressLocked = commitment.status === "FULFILLED";
                  return (
                    <article
                      key={commitment.id}
                      id={`commitment-item-${commitment.id}`}
                      tabIndex={-1}
                      data-testid={`commitment-card-${commitment.id}`}
                      aria-labelledby={`commitment-title-${commitment.id}`}
                      aria-current={
                        deepLinkTarget?.view === "commitments" &&
                        deepLinkTarget.entityId === commitment.id
                          ? "true"
                          : undefined
                      }
                      className={`flex min-h-80 flex-col rounded-3xl border bg-white p-5 shadow-sm transition focus:outline-none focus:ring-4 focus:ring-blue-200 ${
                        deepLinkTarget?.view === "commitments" &&
                        deepLinkTarget.entityId === commitment.id
                          ? "border-blue-500 ring-4 ring-blue-100"
                          : "border-slate-200 hover:border-blue-200 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 min-w-0 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-blue-700">
                          {commitment.reference}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                          {commitment.isPublic ? (
                            <Eye aria-hidden="true" size={13} />
                          ) : (
                            <EyeOff aria-hidden="true" size={13} />
                          )}
                          {commitment.isPublic
                            ? "Todo el equipo"
                            : "Acceso restringido"}
                        </span>
                      </div>
                      <h2
                        id={`commitment-title-${commitment.id}`}
                        className="mt-4 text-lg font-semibold leading-tight text-slate-950"
                      >
                        {commitment.title}
                      </h2>
                      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">
                        {commitment.description}
                      </p>
                      <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-xs text-slate-600 min-w-0 grid-cols-1 sm:grid-cols-2">
                        {commitment.owner && (
                          <div className="col-span-2 min-w-0">
                            <dt className="font-bold">Responsable</dt>
                            <dd className="mt-1">{commitment.owner.name}</dd>
                          </div>
                        )}
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
                      <label className="mt-4 block text-sm font-semibold text-slate-700 min-w-0">
                        Estado de {commitment.title}
                        {!commitment.canUpdate && " (solo lectura)"}
                        <span className="relative mt-1 block">
                          <select
                            aria-label={`Estado de ${commitment.title}`}
                            value={commitment.status}
                            disabled={
                              Boolean(mutation) || !commitment.canUpdate
                            }
                            onChange={(event) =>
                              void handleCommitmentStatus(
                                commitment,
                                event.target.value as CommitmentStatus,
                              )
                            }
                            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60 min-w-0 max-w-full"
                          >
                            {COMMITMENT_STATUSES.map((status) => (
                              <option
                                key={status.value}
                                value={status.value}
                                disabled={
                                  status.value === "FULFILLED" &&
                                  commitment.status !== "FULFILLED" &&
                                  commitment.progress !== 100
                                }
                              >
                                {status.label}
                                {status.value === "FULFILLED" &&
                                commitment.progress !== 100
                                  ? " · requiere 100%"
                                  : ""}
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
                      {commitment.canUpdate && commitment.progress !== 100 && (
                        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                          Guarda el avance en 100% para habilitar el estado
                          Cumplido.
                        </p>
                      )}
                      <div className="mt-4 min-w-0">
                        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-700 min-w-0 flex-wrap gap-3">
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
                          className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100 min-w-0"
                        >
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all min-w-0"
                            style={{ width: `${currentProgress}%` }}
                          />
                        </div>
                        <div className="flex gap-2 min-w-0 flex-wrap">
                          <input
                            id={`progress-${commitment.id}`}
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={currentProgress}
                            disabled={
                              Boolean(mutation) ||
                              !commitment.canUpdate ||
                              progressLocked
                            }
                            onChange={(event) =>
                              setProgressDrafts((current) => ({
                                ...current,
                                [commitment.id]: Number(event.target.value),
                              }))
                            }
                            className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60 max-w-full"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void handleCommitmentProgress(commitment)
                            }
                            disabled={
                              Boolean(mutation) ||
                              !commitment.canUpdate ||
                              progressLocked ||
                              currentProgress === commitment.progress
                            }
                            className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 max-w-full whitespace-normal"
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
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm min-w-0 z-[150] overflow-y-auto flex-wrap">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-dialog-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-white p-4 sm:px-6">
              <div className="min-w-0 flex-1">
                <h2
                  id="work-dialog-title"
                  ref={dialogTitleRef}
                  tabIndex={-1}
                  className="text-xl font-semibold text-slate-950 outline-none"
                >
                  {dialog === "task" ? "Crear tarea" : "Registrar compromiso"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Define el responsable, la fecha y los detalles para facilitar
                  el seguimiento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={Boolean(mutation)}
                aria-label="Cerrar formulario"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
              >
                <X aria-hidden="true" size={21} />
              </button>
            </header>

            {linkedCase && (
              <div
                data-testid="linked-case-dialog-context"
                className="mx-4 mt-4 flex max-h-32 min-w-0 shrink-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-emerald-200 bg-emerald-50 p-3 sm:mx-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-xs font-semibold text-emerald-800">
                    Se vinculará al caso {linkedCase.reference}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {linkedCase.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearLinkedCaseContext}
                  disabled={Boolean(mutation)}
                  className="min-h-10 shrink-0 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900 disabled:opacity-50 max-w-full whitespace-normal"
                >
                  Quitar vínculo
                </button>
              </div>
            )}

            {dialog === "task" ? (
              <form
                onSubmit={handleCreateTask}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
                  <label className="block text-sm font-semibold text-slate-800 min-w-0">
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
                      className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-800 min-w-0">
                    Descripción{" "}
                    <span className="font-normal text-slate-400">
                      (opcional)
                    </span>
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
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
                    />
                  </label>
                  <div className="block text-sm font-semibold text-slate-800 min-w-0">
                    <p>Responsable</p>
                    <UserCombobox
                      className="mt-2"
                      ariaLabel="Responsable de la tarea"
                      value={newTask.assigneeId}
                      selectedLabel={
                        newTask.assigneeId === ownId
                          ? user?.name
                          : newTask.assigneeName
                      }
                      allowUnassigned={false}
                      paginated
                      disabled={mutation === "create-task"}
                      fetchItems={searchTaskAssignees}
                      onChange={(value, selectedUser) =>
                        setNewTask((current) => ({
                          ...current,
                          assigneeId: value,
                          assigneeName: selectedUser?.name ?? "",
                        }))
                      }
                    />
                    <p className="mt-2 text-xs font-normal text-slate-500">
                      Busca por nombre o correo y recorre las páginas de
                      personas autorizadas.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 min-w-0">
                    <label className="block text-sm font-semibold text-slate-800 min-w-0">
                      Prioridad
                      <select
                        value={newTask.priority}
                        onChange={(event) =>
                          setNewTask((current) => ({
                            ...current,
                            priority: event.target.value as WorkPriority,
                          }))
                        }
                        className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
                      >
                        {PRIORITIES.map((priority) => (
                          <option key={priority.value} value={priority.value}>
                            {priority.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold text-slate-800 min-w-0">
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
                        className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
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
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-100 bg-white p-4 sm:px-6">
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    disabled={Boolean(mutation)}
                    className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 max-w-full whitespace-normal"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={Boolean(mutation) || !newTask.assigneeId}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 max-w-full whitespace-normal"
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
              <form
                onSubmit={handleCreateCommitment}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
                  <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)] min-w-0">
                    <label className="block text-sm font-semibold text-slate-800 min-w-0">
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
                        className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-800 min-w-0">
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
                        className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
                      />
                    </label>
                  </div>
                  <label className="block text-sm font-semibold text-slate-800 min-w-0">
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
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
                    />
                  </label>
                  <div className="block text-sm font-semibold text-slate-800 min-w-0">
                    <p>Responsable</p>
                    <UserCombobox
                      className="mt-2"
                      ariaLabel="Responsable del compromiso"
                      value={newCommitment.ownerId}
                      selectedLabel={
                        newCommitment.ownerId === ownId
                          ? user?.name
                          : newCommitment.ownerName
                      }
                      allowUnassigned={false}
                      paginated
                      disabled={mutation === "create-commitment"}
                      fetchItems={searchTaskAssignees}
                      onChange={(value, selectedUser) =>
                        setNewCommitment((current) => ({
                          ...current,
                          ownerId: value,
                          ownerName: selectedUser?.name ?? "",
                        }))
                      }
                    />
                    <p className="mt-2 text-xs font-normal text-slate-500">
                      Busca por nombre o correo y recorre las páginas de
                      personas autorizadas.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 min-w-0">
                    <label className="block text-sm font-semibold text-slate-800 min-w-0">
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
                        className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
                      />
                    </label>
                    <label className="mt-7 flex min-h-12 items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 min-w-0">
                      <input
                        type="checkbox"
                        checked={newCommitment.isPublic}
                        onChange={(event) =>
                          setNewCommitment((current) => ({
                            ...current,
                            isPublic: event.target.checked,
                          }))
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 min-w-0 max-w-full"
                      />
                      <span>
                        Compartir con todo el equipo
                        <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">
                          Amplía la consulta dentro de esta organización. No
                          crea un portal público ni publica contenido en
                          internet.
                        </span>
                      </span>
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
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-100 bg-white p-4 sm:px-6">
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    disabled={Boolean(mutation)}
                    className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 max-w-full whitespace-normal"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={Boolean(mutation) || !newCommitment.ownerId}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 max-w-full whitespace-normal"
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
