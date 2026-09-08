import { expect, test } from "@playwright/test";
import { flattenGlobalSearch, searchGlobally } from "./search-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("envía la búsqueda global en el cuerpo y adapta el contrato agrupado", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return successful({
      voters: [{ id: "voter-a", name: "Ana Pérez" }],
      users: [{ id: "user-a", name: "Ana Admin", email: "ana@example.test" }],
      proposals: [
        { id: "proposal-a", title: "Agua segura", referenceCode: "P-01" },
      ],
      documents: [],
    });
  };

  try {
    const response = await searchGlobally("Ana");

    expect(requestedUrl).toBe("/api/search");
    expect(requestInit?.method).toBe("POST");
    expect(JSON.parse(String(requestInit?.body))).toEqual({ query: "Ana" });
    expect(requestedUrl).not.toContain("Ana");
    expect(flattenGlobalSearch(response)).toEqual([
      {
        id: "voter-a",
        title: "Ana Pérez",
        subtitle: "Persona vinculada",
        category: "Voters",
        href: "/dashboard/votantes?view=detail&entityId=voter-a",
      },
      {
        id: "user-a",
        title: "Ana Admin",
        subtitle: "ana@example.test",
        category: "Users",
        href: "/dashboard/team?view=detail&entityId=user-a",
      },
      {
        id: "proposal-a",
        title: "Agua segura",
        subtitle: "P-01",
        category: "Proposals",
        href: "/dashboard/proposals?view=detail&entityId=proposal-a",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
