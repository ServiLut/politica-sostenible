import { apiRequest } from "@/lib/api-client";

export type PoliticalOperationMode = "CAMPAIGN" | "PUBLIC_OFFICE";
export type CampaignEventStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface EventResponsible {
  id: string;
  name: string;
  role: string;
}

export interface CampaignEvent {
  id: string;
  mode: PoliticalOperationMode;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  location: string | null;
  status: CampaignEventStatus;
  capacity: number | null;
  responsibleId: string | null;
  responsible: EventResponsible | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventPage {
  items: CampaignEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListEventsParams {
  page?: number;
  limit?: number;
  status?: CampaignEventStatus;
  responsibleId?: string;
  search?: string;
  startsFrom?: string;
  startsTo?: string;
}

export interface CreateEventInput {
  name: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  capacity?: number;
  responsibleId?: string;
}

export interface UpdateEventInput {
  name?: string;
  description?: string | null;
  startsAt?: string;
  endsAt?: string;
  location?: string | null;
  capacity?: number | null;
  responsibleId?: string | null;
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

export function listEvents(
  params: ListEventsParams = {},
  signal?: AbortSignal,
): Promise<EventPage> {
  return apiRequest(withQuery("events", { ...params }), { signal });
}

export function listEventResponsibles(
  signal?: AbortSignal,
): Promise<EventResponsible[]> {
  return apiRequest("events/responsibles", { signal });
}

export function getEvent(
  id: string,
  signal?: AbortSignal,
): Promise<CampaignEvent> {
  return apiRequest(`events/${encodeURIComponent(id)}`, { signal });
}

export function createEvent(input: CreateEventInput): Promise<CampaignEvent> {
  return apiRequest("events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEvent(
  id: string,
  input: UpdateEventInput,
): Promise<CampaignEvent> {
  return apiRequest(`events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function transitionEvent(
  id: string,
  status: CampaignEventStatus,
): Promise<CampaignEvent> {
  return apiRequest(`events/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteEvent(
  id: string,
): Promise<{ id: string; deleted: true }> {
  return apiRequest(`events/${encodeURIComponent(id)}`, { method: "DELETE" });
}
