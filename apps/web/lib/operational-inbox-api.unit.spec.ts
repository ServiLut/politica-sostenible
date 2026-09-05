import { expect, test } from "@playwright/test";
import {
  filterOperationalInboxItems,
  listOperationalInbox,
  type OperationalInboxItem,
} from "./operational-inbox-api";

const baseItem: OperationalInboxItem = {
  id: "TASK:task-a",
  entityId: "task-a",
  kind: "TASK",
  kindLabel: "Tarea",
  reference: null,
  title: "Preparar agenda",
  status: "TODO",
  statusLabel: "Por hacer",
  priority: "MEDIUM",
  responsible: null,
  dueAt: null,
  overdue: false,
  blocked: true,
  blockReason: "Sin responsable asignado",
  cta: { label: "Abrir tarea", href: "/dashboard/tasks" },
  createdAt: "2026-09-05T12:00:00.000Z",
};

test("requests a bounded unified inbox without accepting tenant or mode", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        statusCode: 200,
        data: {
          generatedAt: "2026-09-05T12:00:00.000Z",
          mode: "CAMPAIGN",
          summary: {
            total: 0,
            visible: 0,
            overdue: 0,
            blocked: 0,
            unassigned: 0,
            pendingApprovals: 0,
            truncated: false,
            byKind: {
              tasks: 0,
              commitments: 0,
              cases: 0,
              incidents: 0,
              approvals: 0,
            },
          },
          items: [],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await listOperationalInbox(80);
    expect(requestedUrl).toBe("/api/operational-inbox?limit=80");
    expect(requestedUrl).not.toContain("tenant");
    expect(requestedUrl).not.toContain("mode");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("filters the inbox by action state and human search terms", () => {
  const items: OperationalInboxItem[] = [
    baseItem,
    {
      ...baseItem,
      id: "CASE:case-a",
      entityId: "case-a",
      kind: "CASE",
      kindLabel: "Caso",
      reference: "PQRS-001",
      title: "Solicitud de alumbrado",
      responsible: { id: "user-a", name: "Ana", role: "CASE_WORKER" },
      dueAt: "2026-09-01T12:00:00.000Z",
      overdue: true,
      blocked: false,
      blockReason: null,
      cta: { label: "Gestionar caso", href: "/dashboard/cases" },
    },
    {
      ...baseItem,
      id: "COMMUNICATION_APPROVAL:approval-a",
      entityId: "approval-a",
      kind: "COMMUNICATION_APPROVAL",
      kindLabel: "Aprobación",
      title: "Boletín regional",
      responsible: null,
      blocked: true,
      blockReason: "Espera revisión independiente",
      cta: {
        label: "Tomar decisión",
        href: "/dashboard/communications",
      },
    },
  ];

  expect(filterOperationalInboxItems(items, "OVERDUE", "")).toHaveLength(1);
  expect(filterOperationalInboxItems(items, "UNASSIGNED", "")).toEqual([
    baseItem,
  ]);
  expect(filterOperationalInboxItems(items, "APPROVALS", "boletín")).toEqual([
    expect.objectContaining({ id: "COMMUNICATION_APPROVAL:approval-a" }),
  ]);
  expect(filterOperationalInboxItems(items, "ALL", "PQRS-001")).toEqual([
    expect.objectContaining({ id: "CASE:case-a" }),
  ]);
});
