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
      tasks: [
        {
          id: "task-a",
          title: "Llamar líderes",
          status: "TODO",
          priority: "HIGH",
        },
      ],
      commitments: [
        {
          id: "commitment-a",
          title: "Agua rural",
          reference: "CMP-01",
          status: "PROPOSED",
        },
      ],
      cases: [
        {
          id: "case-a",
          title: "Petición de agua",
          reference: "CAS-GP-01",
          status: "OPEN",
        },
      ],
      incidents: [
        {
          id: "incident-a",
          title: "Acceso bloqueado",
          reference: "INC-CAM-01",
          status: "OPEN",
        },
      ],
      pqrsd: [
        {
          id: "pqrsd-a",
          reference: "PQRSD-INT-001",
          subject: "Solicitud de alumbrado público",
          status: "IN_PROGRESS",
          riskLevel: "HIGH",
          dueAt: "2026-09-15T04:59:00.000Z",
          responsible: { id: "worker-a", name: "Gestora responsable" },
        },
      ],
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
      {
        id: "task-a",
        title: "Llamar líderes",
        subtitle: "Prioridad alta · Por hacer",
        category: "Tasks",
        href: "/dashboard/tasks?view=tasks&entityId=task-a",
      },
      {
        id: "commitment-a",
        title: "Agua rural",
        subtitle: "CMP-01 · Propuesto",
        category: "Commitments",
        href: "/dashboard/tasks?view=commitments&entityId=commitment-a",
      },
      {
        id: "case-a",
        title: "Petición de agua",
        subtitle: "CAS-GP-01 · Abierto",
        category: "Cases",
        href: "/dashboard/cases?view=detail&entityId=case-a",
      },
      {
        id: "incident-a",
        title: "Acceso bloqueado",
        subtitle: "INC-CAM-01 · Abierto",
        category: "Incidents",
        href: "/dashboard/incidents?view=detail&entityId=incident-a",
      },
      {
        id: "pqrsd-a",
        title: "Solicitud de alumbrado público",
        subtitle:
          "PQRSD-INT-001 · En curso · Riesgo alto · Vence 14/09/2026 · Responsable: Gestora responsable",
        category: "Pqrsd",
        href: "/dashboard/pqrsd?view=detail&entityId=pqrsd-a",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tolera durante el corte una API anterior sin las nuevas categorias", () => {
  expect(
    flattenGlobalSearch({
      voters: [],
      users: [],
      proposals: [],
    }),
  ).toEqual([]);
});
