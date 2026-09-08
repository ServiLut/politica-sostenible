import { expect, test } from "@playwright/test";
import {
  allowedProposalStatuses,
  createProposal,
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

test("acumula más de cien propuestas sin enviar contexto de tenant", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const requestInits: Array<RequestInit | undefined> = [];
  const proposals = Array.from({ length: 125 }, (_, index) => ({
    id: `proposal-${index + 1}`,
  }));

  globalThis.fetch = async (input, init) => {
    const requestedUrl = String(input);
    requestedUrls.push(requestedUrl);
    requestInits.push(init);
    const page = Number(
      new URL(requestedUrl, "http://local.test").searchParams.get("page"),
    );
    const start = (page - 1) * 100;
    return successful({
      items: proposals.slice(start, start + 100),
      pagination: { page, limit: 100, total: 125, totalPages: 2 },
    });
  };

  try {
    const result = await listProposals();

    expect(result.items).toHaveLength(125);
    expect(result.items.at(-1)?.id).toBe("proposal-125");
    expect(requestedUrls).toEqual([
      "/api/proposals?page=1&limit=100",
      "/api/proposals?page=2&limit=100",
    ]);
    expect(requestInits.every((init) => init?.method === undefined)).toBe(true);
    expect(requestedUrls.every((url) => !url.includes("tenant"))).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rechaza una paginación inconsistente antes de ocultar propuestas", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const page = Number(
      new URL(String(input), "http://local.test").searchParams.get("page"),
    );
    return successful({
      items: [{ id: `proposal-${page}` }],
      pagination: {
        page,
        limit: 100,
        total: page === 1 ? 101 : 102,
        totalPages: 2,
      },
    });
  };

  try {
    await expect(listProposals()).rejects.toThrow(
      "cambiaron mientras se cargaban",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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
