import { apiRequest } from "@/lib/api-client";

export type InboxItemKind =
  | "TASK"
  | "COMMITMENT"
  | "CASE"
  | "INCIDENT"
  | "COMMUNICATION_APPROVAL";

export type InboxPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface OperationalInboxItem {
  id: string;
  entityId: string;
  kind: InboxItemKind;
  kindLabel: string;
  reference: string | null;
  title: string;
  status: string;
  statusLabel: string;
  priority: InboxPriority;
  responsible: {
    id: string;
    name: string;
    role: string;
  } | null;
  dueAt: string | null;
  overdue: boolean;
  blocked: boolean;
  blockReason: string | null;
  cta: { label: string; href: string };
  createdAt: string;
}

export interface OperationalInboxResponse {
  generatedAt: string;
  mode: "CAMPAIGN" | "PUBLIC_OFFICE";
  summary: {
    total: number;
    visible: number;
    overdue: number;
    blocked: number;
    unassigned: number;
    pendingApprovals: number;
    truncated: boolean;
    byKind: {
      tasks: number;
      commitments: number;
      cases: number;
      incidents: number;
      approvals: number;
    };
  };
  items: OperationalInboxItem[];
}

export type OperationalInboxFilter =
  | "ALL"
  | "OVERDUE"
  | "BLOCKED"
  | "UNASSIGNED"
  | "APPROVALS";

export function listOperationalInbox(
  limit = 100,
  signal?: AbortSignal,
): Promise<OperationalInboxResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiRequest(`operational-inbox?${params.toString()}`, { signal });
}

export function filterOperationalInboxItems(
  items: OperationalInboxItem[],
  filter: OperationalInboxFilter,
  search: string,
): OperationalInboxItem[] {
  const normalizedSearch = search.trim().toLocaleLowerCase("es-CO");

  return items.filter((item) => {
    const matchesFilter =
      filter === "ALL" ||
      (filter === "OVERDUE" && item.overdue) ||
      (filter === "BLOCKED" && item.blocked) ||
      (filter === "UNASSIGNED" &&
        item.kind !== "COMMUNICATION_APPROVAL" &&
        item.responsible === null) ||
      (filter === "APPROVALS" && item.kind === "COMMUNICATION_APPROVAL");
    if (!matchesFilter) return false;
    if (!normalizedSearch) return true;

    return [item.title, item.reference, item.kindLabel, item.statusLabel]
      .filter((value): value is string => Boolean(value))
      .some((value) =>
        value.toLocaleLowerCase("es-CO").includes(normalizedSearch),
      );
  });
}
