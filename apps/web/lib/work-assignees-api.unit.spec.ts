import { expect, test } from "@playwright/test";
import { ApiError, apiRequest } from "./api-client";
import { createCommitment, createTask, listTaskAssignees } from "./work-api";

test("consulta responsables por página y búsqueda sin aceptar autoridad del cliente", async () => {
  const originalFetch = globalThis.fetch;
  const seen: { url: URL; options?: RequestInit }[] = [];
  const result = {
    items: [
      {
        id: "responsable-pagina-tres",
        name: "María Equipo",
        role: "CASE_WORKER",
        division: null,
      },
    ],
    pagination: { page: 3, limit: 20, total: 41, totalPages: 3 },
  };
  globalThis.fetch = async (input, options) => {
    seen.push({ url: new URL(String(input), "http://localhost"), options });
    return Response.json({ statusCode: 200, message: "Success", data: result });
  };
  try {
    const controller = new AbortController();
    const input = {
      search: "  María + Equipo  ",
      page: 3,
      tenantId: "otro-tenant",
      role: "ADMIN",
      mode: "CAMPAIGN",
    };
    expect(await listTaskAssignees(input, controller.signal)).toEqual(result);
    expect(seen[0].url.pathname).toBe("/api/tasks/assignees/search");
    expect([...seen[0].url.searchParams]).toEqual([
      ["search", "María + Equipo"],
      ["page", "3"],
      ["limit", "20"],
    ]);
    expect(seen[0].options?.signal).toBe(controller.signal);
    expect(seen[0].options?.cache).toBe("no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("una búsqueda vacía sigue acotada y conserva los errores para el selector", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    expect([...url.searchParams]).toEqual([
      ["page", "1"],
      ["limit", "20"],
    ]);
    return Response.json({ message: "Fuera de alcance" }, { status: 403 });
  };
  try {
    await expect(listTaskAssignees({ search: "   " })).rejects.toThrow(
      "Fuera de alcance",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ApiError conserva el mensaje 409 legacy sin interpretar una lista parcial", async () => {
  const originalFetch = globalThis.fetch;
  const message =
    "Actualiza esta pestaña para buscar responsables en equipos de más de 100 personas.";
  globalThis.fetch = async (input) => {
    expect(new URL(String(input), "http://localhost").pathname).toBe(
      "/api/tasks/assignees",
    );
    return Response.json({ statusCode: 409, message }, { status: 409 });
  };
  try {
    const pending = apiRequest("tasks/assignees");
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    await expect(pending).rejects.toMatchObject({ status: 409, message });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("la selección de una página posterior llega sin sustituirse al crear tarea o compromiso", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, options) => {
    bodies.push(JSON.parse(String(options?.body)));
    return Response.json({
      statusCode: 201,
      message: "Success",
      data: { id: "registro" },
    });
  };
  try {
    const responsible = "responsable-pagina-tres";
    await createTask({
      title: "Seguimiento",
      priority: "MEDIUM",
      assigneeId: responsible,
    });
    await createCommitment({
      title: "Compromiso",
      description: "Descripción",
      reference: "CMP-1",
      ownerId: responsible,
      isPublic: false,
    });
    expect(bodies[0].assigneeId).toBe(responsible);
    expect(bodies[1].ownerId).toBe(responsible);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
