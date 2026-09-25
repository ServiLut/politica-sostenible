import { expect, test } from "@playwright/test";
import { listCaseAssignees, updateIssueCase } from "./cases-api";

test("busca responsables fuera de la primera página sin enviar tenant y conserva cancelación", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let requested: URL | undefined;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = async (url, init) => {
    requested = new URL(String(url), "https://unit.invalid");
    signal = init?.signal;
    return new Response(JSON.stringify({ statusCode: 200, data: {
      items: [{ id: "responsable-21", name: "Responsable buscado", role: "CAMPAIGN_MANAGER" }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    } }), { headers: { "content-type": "application/json" } });
  };
  try {
    const result = await listCaseAssignees({ search: "Responsable buscado", limit: 20 }, controller.signal);
    expect(requested?.pathname).toBe("/api/cases/assignees");
    expect(requested?.searchParams.get("search")).toBe("Responsable buscado");
    expect(requested?.searchParams.get("limit")).toBe("20");
    expect(requested?.searchParams.has("tenantId")).toBe(false);
    expect(signal).toBe(controller.signal);
    expect(result.items[0].id).toBe("responsable-21");
  } finally { globalThis.fetch = originalFetch; }
});

test("quitar una asignación opcional se transmite como null y no como campo omitido", async () => {
  const originalFetch = globalThis.fetch;
  let body: unknown;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ statusCode: 200, data: { id: "incidente-propio", assigneeId: null } }), { headers: { "content-type": "application/json" } });
  };
  try {
    await updateIssueCase("incidente-propio", { assigneeId: null });
    expect(body).toEqual({ assigneeId: null });
  } finally { globalThis.fetch = originalFetch; }
});
