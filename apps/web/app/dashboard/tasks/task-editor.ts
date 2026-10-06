import type { BackendUserRole } from "../../../types/saas-schema";
import type {
  PoliticalOperationMode,
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

function localDateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function taskEditorDraft(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    dueDate: localDateInput(task.dueAt),
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
  if (draft.dueDate !== localDateInput(task.dueAt)) {
    input.dueAt = draft.dueDate
      ? new Date(`${draft.dueDate}T12:00:00`).toISOString()
      : null;
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
  task: Pick<Task, "id" | "issueCaseId">,
): string {
  const query = new URLSearchParams({ view: "tasks", entityId: task.id });
  if (task.issueCaseId) query.set("issueCaseId", task.issueCaseId);
  return `/dashboard/tasks?${query}`;
}

export function workListHref(
  view: "tasks" | "commitments",
  issueCaseId: string | null,
): string {
  const query = new URLSearchParams({ view });
  if (issueCaseId) query.set("issueCaseId", issueCaseId);
  return `/dashboard/tasks?${query}`;
}
