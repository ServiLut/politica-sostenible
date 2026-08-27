import { apiRequest } from "./api-client";

export type PoliticalOperationMode = "CAMPAIGN" | "PUBLIC_OFFICE";
export type IssueCaseStatus =
  | "OPEN"
  | "TRIAGED"
  | "IN_PROGRESS"
  | "WAITING_ON_CITIZEN"
  | "WAITING_ON_EXTERNAL_ENTITY"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";
export type WorkPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type CommunicationChannel =
  | "IN_PERSON"
  | "PHONE"
  | "SMS"
  | "WHATSAPP"
  | "EMAIL"
  | "SOCIAL_MEDIA"
  | "WEB"
  | "LETTER"
  | "INTERNAL";

export interface CaseUserSummary {
  id: string;
  name: string;
  role: string;
}

export interface IssueCase {
  id: string;
  mode: PoliticalOperationMode;
  reference: string;
  title: string;
  description: string;
  category: string;
  sourceChannel: CommunicationChannel;
  status: IssueCaseStatus;
  priority: WorkPriority;
  voterId: string | null;
  externalContactRef: string | null;
  divisionId: string | null;
  assigneeId: string | null;
  createdById: string | null;
  confidential: boolean;
  dueAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: CaseUserSummary | null;
  createdBy: CaseUserSummary | null;
  voter: { id: string; firstName: string; lastName: string } | null;
  division: { id: string; name: string; type: string } | null;
  _count: { interactions: number; tasks: number; commitments: number };
}

export interface IssueCasePage {
  items: IssueCase[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListIssueCasesParams {
  page?: number;
  limit?: number;
  status?: IssueCaseStatus;
  priority?: WorkPriority;
  sourceChannel?: CommunicationChannel;
  assigneeId?: string;
  category?: string;
  confidential?: "true" | "false";
  search?: string;
  dueFrom?: string;
  dueTo?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface CreateIssueCaseInput {
  reference?: string;
  title: string;
  description: string;
  category: string;
  sourceChannel: CommunicationChannel;
  priority?: WorkPriority;
  externalContactRef?: string;
  assigneeId?: string;
  confidential?: boolean;
  dueAt?: string;
}

export interface UpdateIssueCaseInput {
  title?: string;
  description?: string;
  category?: string;
  sourceChannel?: CommunicationChannel;
  status?: IssueCaseStatus;
  priority?: WorkPriority;
  externalContactRef?: string | null;
  assigneeId?: string | null;
  confidential?: boolean;
  dueAt?: string | null;
}

type QueryValue = string | number | undefined;

function withQuery(path: string, params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function listIssueCases(
  params: ListIssueCasesParams = {},
  signal?: AbortSignal,
): Promise<IssueCasePage> {
  return apiRequest(withQuery("cases", { ...params }), { signal });
}

export function getIssueCase(
  id: string,
  signal?: AbortSignal,
): Promise<IssueCase> {
  return apiRequest(`cases/${encodeURIComponent(id)}`, { signal });
}

export function listCaseAssignees(
  signal?: AbortSignal,
): Promise<CaseUserSummary[]> {
  return apiRequest("cases/assignees", { signal });
}

export function createIssueCase(
  input: CreateIssueCaseInput,
): Promise<IssueCase> {
  return apiRequest("cases", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateIssueCase(
  id: string,
  input: UpdateIssueCaseInput,
): Promise<IssueCase> {
  return apiRequest(`cases/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
