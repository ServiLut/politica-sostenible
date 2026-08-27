import { apiRequest } from "./api-client";

export type PoliticalOperationMode = "CAMPAIGN" | "PUBLIC_OFFICE";
export type CommunicationApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
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

export interface CommunicationActor {
  id: string;
  name: string;
  role: string;
}

export interface CommunicationApproval {
  id: string;
  mode: PoliticalOperationMode;
  issueCaseId: string | null;
  channel: CommunicationChannel;
  title: string;
  content: { message?: unknown };
  contentHash: string;
  purpose: string;
  containsSensitiveData: boolean;
  status: CommunicationApprovalStatus;
  requestedById: string;
  decidedById: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: CommunicationActor;
  decidedBy: CommunicationActor | null;
  issueCase: {
    id: string;
    reference: string;
    status: string;
  } | null;
}

export interface CommunicationApprovalPage {
  items: CommunicationApproval[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListCommunicationApprovalsParams {
  page?: number;
  limit?: number;
  status?: CommunicationApprovalStatus;
  channel?: CommunicationChannel;
  containsSensitiveData?: "true" | "false";
  requestedById?: string;
  issueCaseId?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface CreateCommunicationApprovalInput {
  title: string;
  message: string;
  channel: CommunicationChannel;
  purpose: string;
  containsSensitiveData?: boolean;
  issueCaseId?: string;
}

export interface DecideCommunicationApprovalInput {
  status: "APPROVED" | "REJECTED";
  decisionReason: string;
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

export function listCommunicationApprovals(
  params: ListCommunicationApprovalsParams = {},
  signal?: AbortSignal,
): Promise<CommunicationApprovalPage> {
  return apiRequest(withQuery("communications/approvals", { ...params }), {
    signal,
  });
}

export function createCommunicationApproval(
  input: CreateCommunicationApprovalInput,
): Promise<CommunicationApproval> {
  return apiRequest("communications/approvals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function decideCommunicationApproval(
  id: string,
  input: DecideCommunicationApprovalInput,
): Promise<CommunicationApproval> {
  return apiRequest(
    `communications/approvals/${encodeURIComponent(id)}/decision`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}
