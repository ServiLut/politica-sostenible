import { expect, test } from "@playwright/test";
import { createIssueCase, updateIssueCase } from "./cases-api";
import { listIncidentMunicipalities, municipalityLabel, municipalityQueryReducer } from "./incident-municipalities";

test("consulta una página municipal autenticada, conserva señal y no envía tenant", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let captured: { url: URL; signal: AbortSignal | null | undefined } | undefined;
  globalThis.fetch = async (url, init) => {
    captured = { url: new URL(String(url), "https://unit.invalid"), signal: init?.signal };
    return new Response(JSON.stringify({ statusCode: 200, data: {
      items: [{ id: "municipio-real-id", name: "ARMENIA", code: "05/059", parent: { id: "depto", name: "ANTIOQUIA", code: "05" } }],
      pagination: { page: 3, limit: 25, total: 64, totalPages: 3 },
    } }), { headers: { "content-type": "application/json" } });
  };
  try {
    const page = await listIncidentMunicipalities("  Armenia  ", 3, controller.signal);
    expect(captured?.url.pathname).toBe("/api/campaigns/divisions");
    expect(Object.fromEntries(captured!.url.searchParams)).toEqual({ type: "MUNICIPIO", page: "3", limit: "25", search: "Armenia" });
    expect(captured?.signal).toBe(controller.signal);
    expect(municipalityLabel(page.items[0])).toBe("ARMENIA · ANTIOQUIA · 05/059");
  } finally { globalThis.fetch = originalFetch; }
});

test("POST transmite el ID elegido y PATCH admite retirarlo mediante null", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method?: string; body: unknown }> = [];
  globalThis.fetch = async (_url, init) => {
    calls.push({ method: init?.method, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ statusCode: 200, data: { id: "case-own" } }), { headers: { "content-type": "application/json" } });
  };
  const input = { title: "PRUEBA", description: "Interna", category: "Tecnología", sourceChannel: "INTERNAL" as const };
  try {
    await createIssueCase({ ...input, divisionId: "municipio-del-catalogo" });
    await createIssueCase({ ...input, divisionId: undefined });
    await updateIssueCase("case-own", { divisionId: null });
    await updateIssueCase("case-own", { divisionId: "municipio-otro" });
    expect(calls).toEqual([
      { method: "POST", body: { ...input, divisionId: "municipio-del-catalogo" } },
      { method: "POST", body: input },
      { method: "PATCH", body: { divisionId: null } },
      { method: "PATCH", body: { divisionId: "municipio-otro" } },
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test("la nueva búsqueda vuelve a página1 y el reintento conserva consulta/página", () => {
  const previous = { search: "Armenia", page: 3, revision: 7 };
  expect(municipalityQueryReducer(previous, { type: "search", value: "Bello" })).toEqual({ search: "Bello", page: 1, revision: 7 });
  expect(municipalityQueryReducer(previous, { type: "retry" })).toEqual({ ...previous, revision: 8 });
  expect(municipalityQueryReducer(previous, { type: "page", value: 0 })).toBe(previous);
  expect(municipalityQueryReducer(previous, { type: "search", value: "a".repeat(130) }).search).toHaveLength(100);
});
