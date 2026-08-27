import { apiRequest } from "./api-client";

export type AuditOutcome = "SUCCESS" | "DENIED" | "FAILURE";

export interface AuditActor {
  id: string;
  name: string;
  role: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  occurredAt: string;
  actor: AuditActor | null;
}

export interface AuditEventPage {
  items: AuditEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListAuditEventsParams {
  page?: number;
  limit?: number;
  action?: string;
  resourceType?: string;
  outcome?: AuditOutcome;
  occurredFrom?: string;
  occurredTo?: string;
}

export function listAuditEvents(
  params: ListAuditEventsParams = {},
  signal?: AbortSignal,
): Promise<AuditEventPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }

  const query = search.toString();
  return apiRequest(`audit-events${query ? `?${query}` : ""}`, { signal });
}
