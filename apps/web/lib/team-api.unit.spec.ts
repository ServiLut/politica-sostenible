import { expect, test } from "@playwright/test";
import { listAssignableTeamDivisions } from "./team-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("recorre todas las paginas de divisiones asignables", async () => {
  const requests: URL[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    requests.push(url);
    const page = Number(url.searchParams.get("page"));
    return successful({
      items: [
        {
          id: `puesto-${page}`,
          code: `P-${page}`,
          name: `Puesto ${page}`,
          type: "PUESTO",
        },
      ],
      pagination: { page, limit: 100, total: 2, totalPages: 2 },
    });
  };

  try {
    await expect(
      listAssignableTeamDivisions("WITNESS", "  central  "),
    ).resolves.toEqual([
      { id: "puesto-1", code: "P-1", name: "Puesto 1", type: "PUESTO" },
      { id: "puesto-2", code: "P-2", name: "Puesto 2", type: "PUESTO" },
    ]);
    expect(
      requests.map((url) => ({
        page: url.searchParams.get("page"),
        limit: url.searchParams.get("limit"),
        search: url.searchParams.get("search"),
        type: url.searchParams.get("type"),
      })),
    ).toEqual([
      { page: "1", limit: "100", search: "central", type: "PUESTO" },
      { page: "2", limit: "100", search: "central", type: "PUESTO" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rechaza paginacion territorial inconsistente o excesiva", async () => {
  const originalFetch = globalThis.fetch;
  let reportedPage = 2;
  let totalPages = 2;
  globalThis.fetch = async () =>
    successful({
      items: [],
      pagination: { page: reportedPage, limit: 100, total: 0, totalPages },
    });

  try {
    await expect(listAssignableTeamDivisions("WITNESS")).rejects.toThrow(
      "paginación territorial inválida o excesiva",
    );
    reportedPage = 1;
    totalPages = 1_001;
    await expect(listAssignableTeamDivisions("WITNESS")).rejects.toThrow(
      "paginación territorial inválida o excesiva",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
