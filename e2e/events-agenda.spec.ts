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

function planCapabilities() {
  return successful({
    plan: { code: "PRO", name: "Profesional" },
    features: { export: true, import: true, mfa: true },
  });
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

    if (pathname === "/api/billing/capabilities" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(planCapabilities()),
      });
      return;
    }

    if (pathname === "/api/events/responsibles" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({ items: [
            {
              id: "leader-1",
              name: "Laura Coordinadora",
              role: "ZONE_COORDINATOR",
            },
          ], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } }),
        ),
      });
      return;
    }

    if (pathname === "/api/events" && method === "GET") {
      const url = new URL(request.url());
      const status = url.searchParams.get("status");
      const search = (url.searchParams.get("search") ?? "").toLocaleLowerCase("es-CO");
      const visible = events.filter(event => (!status || event.status === status) && event.name.toLocaleLowerCase("es-CO").includes(search));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated(visible)),
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
    page.getByRole("heading", { name: "Agenda y eventos" }),
  ).toBeVisible();
  await expect(page.getByText("Campaña", { exact: true })).toBeVisible();
  await expect(page.getByTestId("event-card-event-draft")).toContainText(
    "Reunión de líderes",
  );

  const editTrigger = page.getByRole("button", {
    name: "Editar Reunión de líderes",
  });
  await editTrigger.click();
  const editDialog = page.getByRole("dialog", { name: "Editar evento" });
  await expect(
    editDialog.getByRole("heading", { name: "Editar evento" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    editDialog.getByRole("button", { name: "Guardar cambios" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    editDialog.getByRole("button", { name: "Cerrar formulario" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editDialog).toHaveCount(0);
  await expect(editTrigger).toBeFocused();
  await editTrigger.click();
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

  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("SCHEDULED");
  await expect(page.getByTestId("event-card-event-scheduled")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Siguiente estado de Encuentro ciudadano" })
    .selectOption("IN_PROGRESS");
  await expect(
    page.getByText("Estado de “Encuentro ciudadano” actualizado a En curso."),
  ).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByTestId("event-card-event-scheduled")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No hay eventos para estos filtros" })).toBeVisible();
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("IN_PROGRESS");
  await expect(page.getByTestId("event-card-event-scheduled")).toContainText(
    "En curso",
  );

  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("");
  await page.getByRole("button", { name: "Nuevo evento" }).click();
  const createDialog = page.getByRole("dialog", { name: "Crear evento" });
  await createDialog.getByLabel("Nombre").fill("Foro de propuestas");
  await createDialog
    .getByLabel("Descripción (opcional)")
    .fill("Diálogo programático abierto.");
  await createDialog.getByLabel("Inicio").fill("2026-10-05T09:00");
  await createDialog.getByLabel("Fin").fill("2026-10-05T11:00");
  await createDialog.getByLabel("Lugar (opcional)").fill("Biblioteca central");
  await createDialog.getByRole("button", { name: "Responsable del evento" }).click();
  await createDialog.getByRole("button", { name: /^Laura Coordinadora/ }).click();
  await createDialog.getByLabel("Capacidad (opcional)").fill("220");
  await createDialog.getByRole("button", { name: "Crear borrador" }).click();

  await expect(page.getByText("Evento creado como borrador.")).toBeVisible();
  await expect(page.getByTestId("event-card-event-created")).toContainText(
    "Foro de propuestas",
  );

  await page
    .getByRole("button", { name: "Eliminar Foro de propuestas" })
    .click();
  const deleteConfirmation = page.getByRole("alertdialog", {
    name: "Eliminar borrador de evento",
  });
  await expect(deleteConfirmation).toBeVisible();
  await expect(
    deleteConfirmation.getByRole("button", { name: "Cancelar" }),
  ).toBeFocused();
  await deleteConfirmation
    .getByRole("button", { name: "Eliminar borrador", exact: true })
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

for (const target of [
  { status: "CANCELLED", action: "cancelar", title: "¿Cancelar evento?", label: "Cancelado" },
  { status: "COMPLETED", action: "finalizar", title: "¿Finalizar evento?", label: "Finalizado" },
]) {
  test(`${target.status}: confirma el estado final, permite volver sin cambios y conserva el evento ante rechazo`, async ({ page }) => {
    const authSession = session("CANDIDACY", "ADMIN");
    await installSession(page, authSession);
    let current = {
      id: "event-terminal", name: "Encuentro de prueba terminal", mode: "CAMPAIGN",
      description: null, startsAt: "2026-10-20T14:00:00.000Z", endsAt: "2026-10-20T15:00:00.000Z",
      status: "IN_PROGRESS", location: "Sede de prueba", capacity: 20,
      responsibleId: null, responsible: null,
      createdAt: "2026-10-16T12:00:00.000Z", updatedAt: "2026-10-16T12:00:00.000Z",
    };
    let rejectNext = true;
    const patches: unknown[] = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/auth/me") {
        await route.fulfill({ json: successful({ user: {
          ...authSession.user, role: "ADMIN", tenant: authSession.tenant,
        } }) });
      } else if (pathname === "/api/events" && request.method() === "GET") {
        await route.fulfill({ json: paginated([current]) });
      } else if (pathname === "/api/events/event-terminal/status" && request.method() === "PATCH") {
        const body = request.postDataJSON();
        patches.push(body);
        if (rejectNext) {
          rejectNext = false;
          await route.fulfill({ status: 409, json: { message: "El estado del evento cambió. Actualiza antes de volver a intentarlo." } });
        } else {
          current = { ...current, status: body.status };
          await route.fulfill({ json: successful(current) });
        }
      } else if (pathname === "/api/billing/capabilities") {
        await route.fulfill({ json: planCapabilities() });
      } else {
        await route.fulfill({ status: 404, json: { message: "Ruta no definida" } });
      }
    });
    await page.goto("/dashboard/events");
    const card = page.getByTestId("event-card-event-terminal");
    const selector = page.getByRole("combobox", { name: `Siguiente estado de ${current.name}` });
    const dialog = page.getByRole("alertdialog", { name: target.title });
    await selector.selectOption(target.status);
    await expect(dialog).toContainText(current.name);
    await expect(dialog).toContainText("No podrás editarlo ni reabrirlo");
    await expect(dialog.getByRole("button", { name: "Volver sin cambios" })).toBeFocused();
    expect(patches).toEqual([]);
    await dialog.getByRole("button", { name: "Volver sin cambios" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card).toContainText("En curso");
    await expect(selector).toBeEnabled();
    expect(patches).toEqual([]);

    await selector.selectOption(target.status);
    await dialog.getByRole("button", { name: `Sí, ${target.action} evento` }).click();
    await expect(page.getByRole("alert").filter({ hasText: "El estado del evento cambió" })).toBeVisible();
    await expect(card).toContainText("En curso");
    await expect(selector).toBeEnabled();
    expect(patches).toEqual([{ status: target.status }]);

    await page.reload();
    await expect(card).toContainText("En curso");
    await selector.selectOption(target.status);
    expect(patches).toHaveLength(1);
    await dialog.getByRole("button", { name: `Sí, ${target.action} evento` }).click();
    await expect(card).toContainText(target.label);
    await expect(selector).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Editar ${current.name}` })).toHaveCount(0);
    expect(patches).toEqual([{ status: target.status }, { status: target.status }]);
  });
}

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
    if (request.method() === "GET" && pathname === "/api/billing/capabilities") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(planCapabilities()),
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
    page.getByRole("heading", { name: "Agenda y eventos" }),
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
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole("button", { name: "Abrir más opciones" }).click();
  }
  await expect(
    page.getByRole("link", { name: "Agenda y eventos" }),
  ).toBeVisible();
  expect(requestedPaths.length).toBeGreaterThanOrEqual(1);
  expect(
    requestedPaths.every((path) =>
      ["/api/events", "/api/billing/capabilities"].includes(path),
    ),
  ).toBe(true);
  expect(requestedPaths).toContain("/api/events");
  expect(requestedPaths).toContain("/api/billing/capabilities");
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
  const authSession = session("PUBLIC_OFFICE", "AUDITOR");
  const authRequests: string[] = [];
  const unexpectedApiRequests: string[] = [];
  await installSession(page, authSession);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    expect(request.headers().authorization).toBe(`Bearer ${jwt}`);

    if (method === "GET" && pathname === "/api/auth/me") {
      authRequests.push(`${method} ${pathname}`);
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

    if (method === "GET" && pathname === "/api/billing/capabilities") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(planCapabilities()),
      });
      return;
    }

    if (method !== "GET" || pathname !== "/api/events") {
      const requestLabel = `${method} ${pathname}`;
      unexpectedApiRequests.push(requestLabel);
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          message: `Solicitud API inesperada: ${requestLabel}`,
        }),
      });
      return;
    }

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
    page.getByText("El servidor no pudo completar la solicitud. Intenta nuevamente más tarde."),
  ).toBeVisible();
  await expect(page.getByText("Agenda temporalmente no disponible")).toHaveCount(0);
  backendAvailable = true;
  await page.getByRole("button", { name: "Reintentar agenda" }).click();
  await expect(
    page.getByRole("heading", { name: "No hay eventos para estos filtros" }),
  ).toBeVisible();
  expect(attempts).toBeGreaterThan(1);
  expect(authRequests.length).toBeGreaterThanOrEqual(1);
  expect(unexpectedApiRequests).toEqual([]);
});
