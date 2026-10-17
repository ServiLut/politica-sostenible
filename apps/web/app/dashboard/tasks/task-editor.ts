import type { BackendUserRole } from "../../../types/saas-schema";
import type {
  PoliticalOperationMode,
  Commitment,
  Task,
  UpdateTaskInput,
  WorkPriority,
} from "../../../lib/work-api";

export interface TaskDraft {
  title: string;
  description: string;
  priority: WorkPriority;
  dueDate: string;
  assigneeId: string;
  assigneeName: string;
}

/** Visibility mirrors TasksService; authorization remains in the API. */
export function canEditTaskDetails(
  role: BackendUserRole | undefined,
  mode: PoliticalOperationMode,
): boolean {
  if (role === "ADMIN") return true;
  return mode === "CAMPAIGN"
    ? role === "CAMPAIGN_MANAGER" ||
        role === "COMMUNICATIONS_MANAGER" ||
        role === "ZONE_COORDINATOR"
    : role === "CONSTITUENT_SERVICES_MANAGER";
}

function colombiaDateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatDeadlineDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function taskEditorDraft(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    dueDate: colombiaDateInput(task.dueAt),
    assigneeId: task.assigneeId ?? "",
    assigneeName: task.assignee?.name ?? "",
  };
}

/** Never rewrite unchanged dates, assignments, state or case/commitment links. */
export function taskEditInput(task: Task, draft: TaskDraft): UpdateTaskInput {
  const title = draft.title.trim();
  if (!title) throw new Error("Escribe un título para la tarea.");
  const input: UpdateTaskInput = {};
  if (title !== task.title) input.title = title;
  if (draft.description !== (task.description ?? "")) {
    input.description = draft.description.trim() || null;
  }
  if (draft.priority !== task.priority) input.priority = draft.priority;
  if (draft.assigneeId !== (task.assigneeId ?? "")) {
    input.assigneeId = draft.assigneeId || null;
  }
  if (draft.dueDate !== colombiaDateInput(task.dueAt)) {
    // Nest resolves date-only values to the end of the Colombia civil day.
    input.dueAt = draft.dueDate || null;
  }
  return input;
}

/** Run against current filters when the mutation finishes, not its old snapshot. */
export function taskFiltersAfterMutation<T extends { page: number }>(
  current: T,
): T {
  return { ...current, page: 1 };
}

/** Use the persisted identity, retaining an authorized case context when present. */
export function createdTaskHref(
  task: Pick<Task, "id" | "issueCaseId"> & Partial<Pick<Task, "commitmentId">>,
): string {
  const query = new URLSearchParams({ view: "tasks", entityId: task.id });
  if (task.issueCaseId) query.set("issueCaseId", task.issueCaseId);
  if (task.commitmentId) query.set("commitmentId", task.commitmentId);
  return `/dashboard/tasks?${query}`;
}

export function workListHref(
  view: "tasks" | "commitments",
  issueCaseId: string | null,
  commitmentId: string | null = null,
): string {
  const query = new URLSearchParams({ view });
  if (issueCaseId) query.set("issueCaseId", issueCaseId);
  if (view === "tasks" && commitmentId) query.set("commitmentId", commitmentId);
  return `/dashboard/tasks?${query}`;
}

export function commitmentTasksHref(
  commitment: Pick<Commitment, "id" | "issueCaseId">,
  issueCaseId: string | null,
  create = false,
): string {
  const query = new URLSearchParams({ view: "tasks", commitmentId: commitment.id });
  // A visible commitment does not grant access to its related case. Only keep
  // an explicit case context that this workspace has already authorized.
  if (issueCaseId) query.set("issueCaseId", issueCaseId);
  if (create) query.set("create", "task");
  return `/dashboard/tasks?${query}`;
}
