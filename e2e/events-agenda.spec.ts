import { expect, Page, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

function session(
  tenantType: "CANDIDACY" | "PUBLIC_OFFICE",
  backendRole: "ADMIN" | "AUDITOR",
) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-e2e",
      name:
        tenantType === "PUBLIC_OFFICE"
          ? "Alcaldía verificable"
          : "Campaña verificable",
      slug: "organizacion-verificable",
      type: tenantType,
    },
    user: {
      id: "user-e2e",
      email: "agenda@example.test",
      name: "Dirección operativa",
      role: backendRole === "ADMIN" ? "AdminCampana" : "Auditor",
      backendRole,
    },
  };
}

function paginated<T>(items: T[]) {
  return {
    statusCode: 200,
    message: "Success",
    data: {
      items,
      pagination: {
        page: 1,
        limit: 9,
        total: items.length,
        totalPages: items.length > 0 ? 1 : 0,
      },
    },
  };
}

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

async function installSession(
  page: Page,
  authSession: ReturnType<typeof session>,
) {
  await page.addInitScript(
    ({ storageKey, value }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      value: authSession,
    },
  );
}

test("administra agenda real sin enviar tenant ni modo desde el navegador", async ({
  page,
}) => {
  const authorizationHeaders: string[] = [];
  const mutationBodies: Array<Record<string, unknown>> = [];
  let events = [
    {
      id: "event-draft",
      mode: "CAMPAIGN",
      name: "Reunión de líderes",
      description: "Preparación territorial por comunas.",
      startsAt: "2026-10-01T14:00:00.000Z",
      endsAt: "2026-10-01T16:00:00.000Z",
      location: "Sede norte",
      status: "DRAFT",
      capacity: 80,
      responsibleId: "leader-1",
      responsible: {
        id: "leader-1",
        name: "Laura Coordinadora",
        role: "ZONE_COORDINATOR",
      },
      createdAt: "2026-08-21T12:00:00.000Z",
      updatedAt: "2026-08-21T12:00:00.000Z",
    },
    {
      id: "event-scheduled",
      mode: "CAMPAIGN",
      name: "Encuentro ciudadano",
      description: null,
      startsAt: "2026-10-02T15:00:00.000Z",
      endsAt: "2026-10-02T18:00:00.000Z",
      location: "Parque principal",
      status: "SCHEDULED",
      capacity: 500,
      responsibleId: "leader-1",
      responsible: {
        id: "leader-1",
        name: "Laura Coordinadora",
        role: "ZONE_COORDINATOR",
      },
      createdAt: "2026-08-21T12:00:00.000Z",
      updatedAt: "2026-08-21T12:00:00.000Z",
    },
  ];

  await installSession(page, session("CANDIDACY", "ADMIN"));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (pathname === "/api/events/responsibles" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful([
            {
              id: "leader-1",
              name: "Laura Coordinadora",
              role: "ZONE_COORDINATOR",
            },
          ]),
        ),
      });
      return;
    }

    if (pathname === "/api/events" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated(events)),
      });
      return;
    }

    if (pathname === "/api/events" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      const created = {
        ...events[0],
        ...body,
        id: "event-created",
        description: body.description ?? null,
        location: body.location ?? null,
        capacity: body.capacity ?? null,
        responsibleId: body.responsibleId ?? null,
        responsible:
          body.responsibleId === "leader-1"
            ? {
                id: "leader-1",
                name: "Laura Coordinadora",
                role: "ZONE_COORDINATOR",
              }
            : null,
        status: "DRAFT",
      };
      events = [created, ...events];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(created, 201)),
      });
      return;
    }

    if (pathname === "/api/events/event-draft" && method === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      events = events.map((event) =>
        event.id === "event-draft" ? { ...event, ...body } : event,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful(events.find((event) => event.id === "event-draft")),
        ),
      });
      return;
    }

    if (
      pathname === "/api/events/event-scheduled/status" &&
      method === "PATCH"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      events = events.map((event) =>
        event.id === "event-scheduled" ? { ...event, ...body } : event,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful(events.find((event) => event.id === "event-scheduled")),
        ),
      });
      return;
    }

    if (pathname === "/api/events/event-created" && method === "DELETE") {
      events = events.filter((event) => event.id !== "event-created");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({ id: "event-created", deleted: true }),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Ruta no definida: ${method} ${pathname}`,
      }),
    });
  });

  await page.goto("/dashboard/events");

  await expect(
    page.getByRole("heading", { name: "Eventos y territorio" }),
  ).toBeVisible();
  await expect(page.getByText("Campaña", { exact: true })).toBeVisible();
  await expect(page.getByTestId("event-card-event-draft")).toContainText(
    "Reunión de líderes",
  );

  await page.getByRole("button", { name: "Editar Reunión de líderes" }).click();
  const editDialog = page.getByRole("dialog", { name: "Editar evento" });
  await editDialog.getByLabel("Lugar (opcional)").fill("Casa comunitaria");
  await editDialog.getByLabel("Capacidad (opcional)").fill("140");
  await editDialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByText("“Reunión de líderes” fue actualizado."),
  ).toBeVisible();
  await expect(page.getByTestId("event-card-event-draft")).toContainText(
    "Casa comunitaria",
  );
  await expect(page.getByTestId("event-card-event-draft")).toContainText(
    "Capacidad: 140",
  );

  await page
    .getByRole("combobox", { name: "Siguiente estado de Encuentro ciudadano" })
    .selectOption("IN_PROGRESS");
  await expect(
    page.getByText("Estado de “Encuentro ciudadano” actualizado a En curso."),
  ).toBeVisible();
  await expect(page.getByTestId("event-card-event-scheduled")).toContainText(
    "En curso",
  );

  await page.getByRole("button", { name: "Nuevo evento" }).click();
  const createDialog = page.getByRole("dialog", { name: "Crear evento" });
  await createDialog.getByLabel("Nombre").fill("Foro de propuestas");
  await createDialog
    .getByLabel("Descripción (opcional)")
    .fill("Diálogo programático abierto.");
  await createDialog.getByLabel("Inicio").fill("2026-10-05T09:00");
  await createDialog.getByLabel("Fin").fill("2026-10-05T11:00");
  await createDialog.getByLabel("Lugar (opcional)").fill("Biblioteca central");
  await createDialog
    .getByLabel("Responsable (opcional)")
    .selectOption("leader-1");
  await createDialog.getByLabel("Capacidad (opcional)").fill("220");
  await createDialog.getByRole("button", { name: "Crear borrador" }).click();

  await expect(page.getByText("Evento creado como borrador.")).toBeVisible();
  await expect(page.getByTestId("event-card-event-created")).toContainText(
    "Foro de propuestas",
  );

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Eliminar Foro de propuestas" })
    .click();
  await expect(
    page.getByText("Borrador “Foro de propuestas” eliminado."),
  ).toBeVisible();
  await expect(page.getByTestId("event-card-event-created")).toHaveCount(0);

  expect(mutationBodies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ location: "Casa comunitaria", capacity: 140 }),
      { status: "IN_PROGRESS" },
      expect.objectContaining({
        name: "Foro de propuestas",
        location: "Biblioteca central",
        capacity: 220,
        responsibleId: "leader-1",
      }),
    ]),
  );
  expect(
    mutationBodies.every(
      (body) =>
        !("tenantId" in body) && !("tenant_id" in body) && !("mode" in body),
    ),
  ).toBe(true);
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(10);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});

test("muestra agenda pública vacía en modo de sólo lectura", async ({
  page,
}) => {
  const requestedPaths: string[] = [];
  const authorizationHeaders: string[] = [];
  const authSessionHeaders: string[] = [];
  const authSession = session("PUBLIC_OFFICE", "AUDITOR");
  await installSession(page, authSession);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/api/auth/me") {
      authSessionHeaders.push(request.headers().authorization ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: authSession.user.id,
              email: authSession.user.email,
              name: authSession.user.name,
              role: authSession.user.backendRole,
              tenant: authSession.tenant,
            },
          }),
        ),
      });
      return;
    }

    requestedPaths.push(pathname);
    authorizationHeaders.push(request.headers().authorization ?? "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(paginated([])),
    });
  });

  await page.goto("/dashboard/events");

  await expect(
    page.getByRole("heading", { name: "Eventos y territorio" }),
  ).toBeVisible();
  await expect(
    page.getByText("Gestión pública", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No hay eventos para estos filtros" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo evento" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Agenda y eventos" }),
  ).toBeVisible();
  expect(requestedPaths.length).toBeGreaterThanOrEqual(1);
  expect(requestedPaths.every((path) => path === "/api/events")).toBe(true);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
  expect(authSessionHeaders.length).toBeGreaterThanOrEqual(1);
  expect(authSessionHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});

test("expone el error de carga y permite reintentar sin recargar la página", async ({
  page,
}) => {
  let attempts = 0;
  let backendAvailable = false;
  await installSession(page, session("PUBLIC_OFFICE", "AUDITOR"));
  await page.route("**/api/events*", async (route) => {
    attempts += 1;
    // Todas las lecturas iniciales fallan; la prueba habilita el backend justo
    // antes del clic para no depender de cuántas veces monte React.
    if (!backendAvailable) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 503,
          message: "Agenda temporalmente no disponible",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(paginated([])),
    });
  });

  await page.goto("/dashboard/events");
  await expect(
    page.getByRole("heading", { name: "No pudimos cargar la agenda" }),
  ).toBeVisible();
  await expect(
    page.getByText("Agenda temporalmente no disponible"),
  ).toBeVisible();
  backendAvailable = true;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(
    page.getByRole("heading", { name: "No hay eventos para estos filtros" }),
  ).toBeVisible();
  expect(attempts).toBeGreaterThan(1);
});
