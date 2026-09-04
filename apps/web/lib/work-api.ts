import { apiRequest } from "@/lib/api-client";

export type PoliticalOperationMode = "CAMPAIGN" | "PUBLIC_OFFICE";
export type TaskStatus =
  | "TODO"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "DONE"
  | "CANCELLED";
export type WorkPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type CommitmentStatus =
  | "PROPOSED"
  | "PLANNED"
  | "IN_PROGRESS"
  | "AT_RISK"
  | "FULFILLED"
  | "NOT_FULFILLED"
  | "CANCELLED";

export interface PageInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PageInfo;
}

export interface WorkUserSummary {
  id: string;
  name: string;
  role: string;
}

export interface WorkAssignee extends WorkUserSummary {
  division: {
    id: string;
    name: string;
    type: string;
  } | null;
}

export interface IssueCaseSummary {
  id: string;
  reference: string;
  title: string;
  status: string;
}

export interface CommitmentSummary {
  id: string;
  reference: string;
  title: string;
  status: CommitmentStatus;
}

export interface Task {
  id: string;
  mode: PoliticalOperationMode;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: WorkPriority;
  assigneeId: string | null;
  issueCaseId: string | null;
  commitmentId: string | null;
  createdById: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: WorkUserSummary | null;
  createdBy: WorkUserSummary;
  issueCase: IssueCaseSummary | null;
  commitment: CommitmentSummary | null;
}

export interface Commitment {
  id: string;
  mode: PoliticalOperationMode;
  reference: string;
  title: string;
  description: string;
  status: CommitmentStatus;
  ownerId?: string | null;
  issueCaseId?: string | null;
  targetDate: string | null;
  progress: number;
  isPublic: boolean;
  evidencePath?: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: WorkUserSummary | null;
  issueCase?: IssueCaseSummary | null;
  _count: { tasks: number };
  canUpdate: boolean;
}

export interface CommitmentPage extends PaginatedResult<Commitment> {
  permissions: {
    canCreate: boolean;
    canReadInternal: boolean;
  };
}

export interface ListTasksParams {
  page?: number;
  limit?: number;
  status?: TaskStatus;
  priority?: WorkPriority;
  assigneeId?: string;
  issueCaseId?: string;
  commitmentId?: string;
  search?: string;
  dueFrom?: string;
  dueTo?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: WorkPriority;
  assigneeId?: string;
  issueCaseId?: string;
  commitmentId?: string;
  dueAt?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: WorkPriority;
  assigneeId?: string | null;
  issueCaseId?: string | null;
  commitmentId?: string | null;
  dueAt?: string | null;
}

export interface ListCommitmentsParams {
  page?: number;
  limit?: number;
  status?: CommitmentStatus;
  ownerId?: string;
  issueCaseId?: string;
  isPublic?: "true" | "false";
  search?: string;
  targetFrom?: string;
  targetTo?: string;
}

export interface CreateCommitmentInput {
  reference: string;
  title: string;
  description: string;
  status?: CommitmentStatus;
  ownerId?: string;
  issueCaseId?: string;
  targetDate?: string;
  progress?: number;
  isPublic?: boolean;
}

export interface UpdateCommitmentInput {
  reference?: string;
  title?: string;
  description?: string;
  status?: CommitmentStatus;
  ownerId?: string | null;
  issueCaseId?: string | null;
  targetDate?: string | null;
  progress?: number;
  isPublic?: boolean;
}

type QueryValue = string | number | boolean | undefined;

function withQuery(path: string, params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function listTasks(
  params: ListTasksParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResult<Task>> {
  return apiRequest(withQuery("tasks", { ...params }), { signal });
}

export function listTaskAssignees(
  signal?: AbortSignal,
): Promise<WorkAssignee[]> {
  return apiRequest("tasks/assignees", { signal });
}

export function createTask(input: CreateTaskInput): Promise<Task> {
  return apiRequest("tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return apiRequest(`tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function listCommitments(
  params: ListCommitmentsParams = {},
  signal?: AbortSignal,
): Promise<CommitmentPage> {
  return apiRequest(withQuery("commitments", { ...params }), { signal });
}

export function createCommitment(
  input: CreateCommitmentInput,
): Promise<Commitment> {
  return apiRequest("commitments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCommitment(
  id: string,
  input: UpdateCommitmentInput,
): Promise<Commitment> {
  return apiRequest(`commitments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
