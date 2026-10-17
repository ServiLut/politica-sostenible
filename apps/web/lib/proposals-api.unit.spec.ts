import { expect, test } from "@playwright/test";
import {
  allowedProposalStatuses,
  createProposal,
  getProposal,
  listProposals,
  updateProposal,
} from "./proposals-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("el cliente no ofrece retrocesos que reescriban el estado histórico", () => {
  expect(allowedProposalStatuses("DRAFT")).toEqual([
    "DRAFT",
    "PROPOSED",
    "WITHDRAWN",
  ]);
  expect(allowedProposalStatuses("PROPOSED")).toEqual([
    "PROPOSED",
    "IN_PROGRESS",
    "WITHDRAWN",
  ]);
  expect(allowedProposalStatuses("COMPLETED")).toEqual(["COMPLETED"]);
  expect(allowedProposalStatuses("WITHDRAWN")).toEqual(["WITHDRAWN"]);
});

test("solicita sólo una página acotada con filtros y búsqueda, sin contexto de tenant", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const signal = new AbortController().signal;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return successful({ items: [{ id: "proposal-125" }], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } });
  };
  try {
    const result = await listProposals({ page: 2, search: "  agua & salud  ", status: "DRAFT", category: "HEALTH", isPublic: false }, signal);
    expect(result.items).toHaveLength(1);
    expect(result.pagination.total).toBe(21);
    expect(calls).toHaveLength(1);
    const query = new URL(calls[0].url, "http://local.test").searchParams;
    expect(Object.fromEntries(query)).toEqual({ page: "2", limit: "20", search: "agua & salud", category: "HEALTH", status: "DRAFT", isPublic: "false" });
    expect(calls[0].init?.signal).toBe(signal);
  } finally { globalThis.fetch = originalFetch; }
});

test("no descarga páginas adicionales aunque el total sea de cien mil propuestas", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return successful({ items: Array.from({ length: 20 }, (_, id) => ({ id: String(id) })), pagination: { page: 1, limit: 20, total: 100000, totalPages: 5000 } });
  };
  try { expect((await listProposals()).items).toHaveLength(20); expect(calls).toBe(1); }
  finally { globalThis.fetch = originalFetch; }
});

test("acepta una página vacía que desapareció por una eliminación concurrente", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => successful({ items: [], pagination: { page: 2, limit: 20, total: 20, totalPages: 1 } });
  try { expect((await listProposals({ page: 2 })).pagination.totalPages).toBe(1); }
  finally { globalThis.fetch = originalFetch; }
});

for (const pagination of [
  { page: 2, limit: 20, total: 1, totalPages: 1 },
  { page: 1, limit: 100, total: 1, totalPages: 1 },
  { page: 1, limit: 20, total: 1, totalPages: 2 },
  { page: 1, limit: 20, total: 20, totalPages: 1 },
]) {
  test(`rechaza metadatos inconsistentes ${JSON.stringify(pagination)}`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => successful({ items: [{ id: "proposal-a" }], pagination });
    try { await expect(listProposals()).rejects.toThrow("paginación de propuestas inválida"); }
    finally { globalThis.fetch = originalFetch; }
  });
}

test("resuelve una ficha directamente sin descargar el listado", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => { urls.push(String(input)); return successful({ id: "proposal/125" }); };
  try { expect((await getProposal("proposal/125"))?.id).toBe("proposal/125"); expect(urls).toEqual(["/api/proposals/proposal%2F125"]); }
  finally { globalThis.fetch = originalFetch; }
});

test("rechaza identificadores duplicados en una misma página", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => successful({ items: [{ id: "same" }, { id: "same" }], pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } });
  try { await expect(listProposals()).rejects.toThrow("identificador válido"); }
  finally { globalThis.fetch = originalFetch; }
});

test("distingue ficha no disponible de fallo del servidor", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "No disponible" }), { status: 404, headers: { "Content-Type": "application/json" } });
  try {
    expect(await getProposal("missing")).toBeNull();
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    await expect(getProposal("missing")).rejects.toThrow("El servidor no pudo");
  } finally { globalThis.fetch = originalFetch; }
});

test("conserva estado, progreso y costo en las mutaciones sin aceptar tenant ni owner del navegador", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const proposal = {
    id: "proposal-a",
    referenceCode: "PRO-001",
    title: "Agua segura",
    description: "",
    category: "INFRASTRUCTURE",
    targetGroup: null,
    status: "IN_PROGRESS",
    progressPercent: 45,
    isPublic: true,
    territory: null,
    estimatedCost: 250000.5,
    sourceUrl: null,
    ownerId: "owner-a",
    owner: { id: "owner-a", name: "Laura Responsable" },
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
  };

  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return successful(proposal);
  };

  try {
    const input = {
      title: "Agua segura",
      description: "",
      category: "INFRASTRUCTURE" as const,
      status: "IN_PROGRESS" as const,
      progressPercent: 45,
      estimatedCost: 250000.5,
      isPublic: true,
    };
    await createProposal(input);
    await updateProposal("proposal/a", { ...input, estimatedCost: null });

    expect(requests.map(({ url }) => url)).toEqual([
      "/api/proposals",
      "/api/proposals/proposal%2Fa",
    ]);
    expect(requests.map(({ init }) => init?.method)).toEqual(["POST", "PATCH"]);
    expect(JSON.parse(String(requests[0].init?.body))).toEqual(input);
    expect(JSON.parse(String(requests[0].init?.body))).not.toHaveProperty(
      "tenantId",
    );
    expect(JSON.parse(String(requests[0].init?.body))).not.toHaveProperty(
      "ownerId",
    );
    expect(JSON.parse(String(requests[1].init?.body))).toEqual({
      ...input,
      estimatedCost: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
