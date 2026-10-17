import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

type ProposalRole =
  | "ADMIN"
  | "CAMPAIGN_MANAGER"
  | "AUDITOR"
  | "COMPLIANCE_OFFICER";
type ProposalStatus =
  | "DRAFT"
  | "PROPOSED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "WITHDRAWN";

interface MockProposal {
  id: string;
  referenceCode: string;
  title: string;
  description: string;
  category: string;
  targetGroup: string | null;
  status: ProposalStatus;
  progressPercent: number;
  isPublic: boolean;
  territory: string | null;
  estimatedCost: number | null;
  sourceUrl: string | null;
  ownerId: string;
  owner: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

function sessionFor(role: ProposalRole) {
  const legacyRole =
    role === "ADMIN"
      ? "AdminCampana"
      : role === "CAMPAIGN_MANAGER"
        ? "GerenteOps"
        : "Auditor";
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-e2e",
      name: "Campaña verificable",
      slug: "campana-verificable",
      type: "CANDIDACY" as const,
      operationStage: "CAMPAIGN" as const,
    },
    user: {
      id: `${role.toLowerCase()}-e2e`,
      email: `${role.toLowerCase()}@example.test`,
      name:
        role === "ADMIN" ? "Dirección programática" : "Control programático",
      role: legacyRole,
      backendRole: role,
    },
  };
}

function proposal(overrides: Partial<MockProposal> = {}): MockProposal {
  return {
    id: "proposal-a",
    referenceCode: "PRO-001",
    title: "Agua segura rural",
    description: "Acueductos con seguimiento ciudadano.",
    category: "INFRASTRUCTURE",
    targetGroup: null,
    status: "IN_PROGRESS",
    progressPercent: 42,
    isPublic: true,
    territory: "Zona rural",
    estimatedCost: 125000.5,
    sourceUrl: null,
    ownerId: "owner-a",
    owner: { id: "owner-a", name: "Laura Responsable" },
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
    ...overrides,
  };
}

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

function proposalPage(items: MockProposal[], url = new URL("http://local.test")) {
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const search = (url.searchParams.get("search") ?? "").toLowerCase();
  const filtered = items.filter((item) =>
    (!search || [item.title, item.referenceCode, item.description].some((value) => value.toLowerCase().includes(search))) &&
    (!url.searchParams.has("status") || item.status === url.searchParams.get("status")) &&
    (!url.searchParams.has("category") || item.category === url.searchParams.get("category")),
  );
  return {
    items: filtered.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
  };
}

async function storeSession(page: Page, role: ProposalRole) {
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor(role),
    },
  );
}

test("administra propuestas con el enum y contrato reales sin enviar tenant y con responsables elegibles", async ({
  page,
}) => {
  let proposals = [proposal()];
  const mutations: Array<{
    method: string;
    body: Record<string, unknown> | null;
  }> = [];
  const authorizationHeaders: string[] = [];
  const authSession = sessionFor("ADMIN");
  await storeSession(page, "ADMIN");

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (pathname === "/api/auth/me" && method === "GET") {
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

    if (pathname === "/api/proposals" && method === "GET") {
      expect(url.searchParams.get("limit")).toBe("20");
      expect(url.searchParams.has("tenantId")).toBe(false);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(proposalPage(proposals, url))),
      });
      return;
    }

    if (pathname.startsWith("/api/proposals/") && method === "GET") {
      const item = proposals.find((value) => value.id === pathname.split("/").at(-1));
      await route.fulfill({ status: item ? 200 : 404, contentType: "application/json", body: JSON.stringify(item ? successful(item) : { message: "No disponible" }) });
      return;
    }

    if (pathname === "/api/proposals" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutations.push({ method, body });
      const created = proposal({
        ...body,
        id: "proposal-created",
        referenceCode: "PRO-002",
        ownerId: authSession.user.id,
        owner: { id: authSession.user.id, name: authSession.user.name },
        targetGroup: null,
        territory: null,
        sourceUrl: null,
        createdAt: "2026-08-03T12:00:00.000Z",
        updatedAt: "2026-08-03T12:00:00.000Z",
      } as Partial<MockProposal>);
      proposals = [created, ...proposals];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(created, 201)),
      });
      return;
    }

    if (pathname === "/api/proposals/proposal-a" && method === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutations.push({ method, body });
      proposals = proposals.map((item) =>
        item.id === "proposal-a" ? { ...item, ...body } : item,
      ) as MockProposal[];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful(proposals.find((item) => item.id === "proposal-a")),
        ),
      });
      return;
    }

    if (pathname === "/api/proposals/proposal-created" && method === "DELETE") {
      mutations.push({ method, body: null });
      proposals = proposals.filter((item) => item.id !== "proposal-created");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful({ success: true })),
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

  await page.goto("/dashboard/proposals");

  await expect(
    page.getByRole("heading", { name: "Programa político" }),
  ).toBeVisible();
  const initialCard = page.getByRole("button", {
    name: "Editar propuesta Agua segura rural",
  });
  await expect(initialCard).toContainText("En ejecución");
  await expect(initialCard).toContainText("Laura Responsable");
  await expect(initialCard).toContainText("42%");
  await expect(initialCard).toContainText(/125\.000,5/);
  await expect(
    page.getByRole("button", { name: "Eliminar borrador Agua segura rural" }),
  ).toHaveCount(0);

  await initialCard.getByLabel("Cambiar estado de Agua segura rural").selectOption("COMPLETED");
  const editDialog = page.getByRole("dialog", { name: "Editar propuesta" });
  await expect(editDialog.getByRole("combobox", { name: "Estado", exact: true })).toHaveValue("COMPLETED");
  await expect(editDialog.getByLabel("Progreso (%)")).toHaveValue("100");
  await expect(editDialog.getByLabel("Progreso (%)")).toBeDisabled();
  await expect(editDialog.getByLabel(/Confirmo que la propuesta alcanzó el 100/)).not.toBeChecked();
  expect(mutations).toHaveLength(0);
  await editDialog.getByRole("combobox", { name: "Estado", exact: true }).selectOption("IN_PROGRESS");
  await expect(editDialog.getByLabel("Progreso (%)")).toHaveValue("42");
  await editDialog.getByRole("combobox", { name: "Estado", exact: true }).selectOption("COMPLETED");
  await editDialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(editDialog).toBeVisible();
  expect(mutations).toHaveLength(0);
  await editDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(initialCard).toContainText("42%");
  await expect(initialCard).toContainText("En ejecución");

  // The regular editor uses the same explicit final-state confirmation.
  await initialCard.click();
  await expect(editDialog.getByLabel("Título")).toBeDisabled();
  await expect(
    editDialog.getByLabel("Costo estimado (opcional)"),
  ).toBeDisabled();
  await expect(editDialog.getByLabel("Progreso (%)")).toHaveValue("42");
  await editDialog.getByLabel("Progreso (%)").fill("70");
  await editDialog.getByLabel("Estado").selectOption("COMPLETED");
  await editDialog.getByLabel("Estado").selectOption("IN_PROGRESS");
  await expect(editDialog.getByLabel("Progreso (%)")).toHaveValue("70");
  await editDialog.getByLabel("Estado").selectOption("COMPLETED");
  await expect(editDialog.getByLabel("Progreso (%)")).toHaveValue("100");
  await editDialog.getByLabel(/Confirmo que la propuesta alcanzó el 100/).check();
  await editDialog.getByRole("button", { name: "Guardar" }).click();

  const updatedCard = page.getByRole("button", {
    name: "Editar propuesta Agua segura rural",
  });
  await expect(updatedCard).toContainText("Completada");
  await expect(updatedCard).toContainText("100%");
  await expect(updatedCard).toContainText(/125\.000,5/);

  await page.getByRole("group", { name: "Filtrar propuestas por estado" })
    .getByRole("button", { name: /Completada/ }).click();
  await page.getByLabel("Buscar propuestas", { exact: true }).fill("Agua");
  await page.getByLabel("Filtrar por categoría", { exact: true }).selectOption("INFRASTRUCTURE");
  await page.getByRole("button", { name: "Nueva propuesta" }).click();
  const createDialog = page.getByRole("dialog", { name: "Nueva propuesta" });
  await createDialog.getByLabel("Título").fill("Salud preventiva");
  await createDialog
    .getByLabel("Descripción (opcional)")
    .fill("Brigadas rurales mensuales.");
  await createDialog.getByLabel("Categoría").selectOption("HEALTH");
  await createDialog.getByLabel("Estado").selectOption("DRAFT");
  await expect(createDialog.getByLabel("Progreso (%)")).toBeDisabled();
  await expect(createDialog.getByLabel("Progreso (%)")).toHaveValue("0");
  await createDialog.getByLabel("Costo estimado (opcional)").fill("75000.25");
  await expect(
    createDialog.getByText(
      "Es una clasificación interna. No publica la propuesta en internet ni cambia sus permisos de acceso.",
    ),
  ).toBeVisible();
  await createDialog
    .getByLabel("Marcar para evaluación interna de difusión")
    .check();
  await createDialog.getByRole("button", { name: "Guardar" }).click();

  const createdCard = page.getByRole("button", {
    name: "Editar propuesta Salud preventiva",
  });
  await expect(page.getByRole("status").filter({ hasText: "Propuesta guardada:" })).toBeVisible();
  await expect(createdCard).toHaveCount(0);
  await page.getByRole("button", { name: "Ver propuesta guardada", exact: true }).click();
  await expect(page).toHaveURL(/view=detail&entityId=proposal-created/);
  await expect(createdCard).toContainText("Borrador");
  await expect(createdCard).toContainText("Dirección programática");
  await expect(createdCard).toContainText("0%");
  await expect(createdCard).toContainText(/75\.000,25/);
  await expect(updatedCard).toHaveCount(0);
  await page.getByRole("button", { name: "Volver al listado", exact: true }).click();
  await expect(page.getByLabel("Buscar propuestas", { exact: true })).toHaveValue("Agua");
  await expect(page.getByLabel("Filtrar por categoría", { exact: true })).toHaveValue("INFRASTRUCTURE");
  await expect(page.getByRole("group", { name: "Filtrar propuestas por estado" })
    .getByRole("button", { name: /Completada/ })).toHaveAttribute("aria-pressed", "true");
  await expect(createdCard).toHaveCount(0);
  await expect(updatedCard).toBeVisible();
  await page.getByRole("group", { name: "Filtrar propuestas por estado" })
    .getByRole("button", { name: /Todas/ }).click();
  await page.getByLabel("Buscar propuestas", { exact: true }).fill("");
  await page.getByLabel("Filtrar por categoría", { exact: true }).selectOption("ALL");

  await page
    .getByRole("button", { name: "Eliminar borrador Salud preventiva" })
    .click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "¿Eliminar propuesta?",
  });
  await deleteDialog.getByRole("button", { name: "Eliminar" }).click();
  await expect(
    page.getByRole("button", { name: "Editar propuesta Salud preventiva" }),
  ).toHaveCount(0);

  expect(mutations).toEqual([
    {
      method: "PATCH",
      body: {
        title: "Agua segura rural",
        description: "Acueductos con seguimiento ciudadano.",
        category: "INFRASTRUCTURE",
        status: "COMPLETED",
        progressPercent: 100,
        estimatedCost: 125000.5,
        isPublic: true,
        ownerId: "owner-a",
      },
    },
    {
      method: "POST",
      body: {
        title: "Salud preventiva",
        description: "Brigadas rurales mensuales.",
        category: "HEALTH",
        status: "DRAFT",
        progressPercent: 0,
        estimatedCost: 75000.25,
        isPublic: true,
        ownerId: "admin-e2e",
      },
    },
    { method: "DELETE", body: null },
  ]);
  expect(
    mutations.every(
      ({ body }) =>
        body === null ||
        (!("tenantId" in body) &&
          !("tenant_id" in body)),
    ),
  ).toBe(true);
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(7);
  expect(
    authorizationHeaders.every((header) => header === `Bearer ${jwt}`),
  ).toBe(true);
});

test("pagina y filtra en servidor; el enlace directo alcanza una propuesta fuera de página", async ({ page }) => {
  const authSession = sessionFor("COMPLIANCE_OFFICER");
  const proposals = Array.from({ length: 125 }, (_, index) => proposal({
    id: `proposal-${index + 1}`,
    referenceCode: `PRO-${String(index + 1).padStart(3, "0")}`,
    title: `Propuesta ${index + 1}`,
    category: index === 124 ? "HEALTH" : "INFRASTRUCTURE",
  }));
  const requests: URL[] = [];
  await storeSession(page, "COMPLIANCE_OFFICER");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") {
      await route.fulfill({ json: successful({ user: { ...authSession.user, role: authSession.user.backendRole, tenant: authSession.tenant } }) });
    } else if (url.pathname === "/api/proposals") {
      requests.push(url);
      expect(url.searchParams.get("limit")).toBe("20");
      await route.fulfill({ json: successful(proposalPage(proposals, url)) });
    } else if (url.pathname === "/api/proposals/proposal-125") {
      requests.push(url);
      await route.fulfill({ json: successful(proposals[124]) });
    } else {
      await route.fulfill({ status: 404, json: { message: "No disponible" } });
    }
  });
  await page.goto("/dashboard/proposals");
  const pagination = page.getByRole("navigation", { name: "Paginación de propuestas" });
  await expect(pagination).toContainText("1–20 de 125 propuestas");
  await expect(page.getByRole("heading", { name: "Propuesta 125", exact: true })).toHaveCount(0);
  expect(requests.every((url) => url.searchParams.get("page") === "1")).toBe(true);
  await pagination.getByRole("button", { name: "Siguiente" }).click();
  await expect(pagination).toContainText("21–40 de 125 propuestas");
  await expect(page.getByRole("heading", { name: "Propuesta 21", exact: true })).toBeVisible();
  await page.getByLabel("Filtrar por categoría").selectOption("HEALTH");
  await expect(pagination).toContainText("1–1 de 1 propuesta");
  await expect(page.getByRole("heading", { name: "Propuesta 125", exact: true })).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
  expect(requests.at(-1)?.searchParams.get("category")).toBe("HEALTH");
  await page.getByLabel("Buscar propuestas").fill("PRO-125");
  await expect.poll(() => requests.at(-1)?.searchParams.get("search")).toBe("PRO-125");
  await expect(pagination).toContainText("1–1 de 1 propuesta");
  await page.goto("/dashboard/proposals?view=detail&entityId=proposal-125");
  await expect(page.getByRole("heading", { name: "Propuesta 125", exact: true })).toBeVisible();
  expect(requests.at(-1)?.pathname).toBe("/api/proposals/proposal-125");
  await expect(pagination).toHaveCount(0);
  await page.getByRole("button", { name: "Volver al listado" }).click();
  await expect(pagination).toContainText("1–20 de 125 propuestas");
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
});

test("eliminar el último borrador de una página regresa a la última página válida", async ({ page }) => {
  const authSession = sessionFor("ADMIN");
  let rows = Array.from({ length: 21 }, (_, index) => proposal({ id: `draft-${index}`, title: `Borrador ${index}`, status: "DRAFT", progressPercent: 0 }));
  await storeSession(page, "ADMIN");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") await route.fulfill({ json: successful({ user: { ...authSession.user, role: authSession.user.backendRole, tenant: authSession.tenant } }) });
    else if (url.pathname === "/api/proposals") await route.fulfill({ json: successful(proposalPage(rows, url)) });
    else if (url.pathname === "/api/proposals/draft-20" && route.request().method() === "DELETE") {
      rows = rows.filter((item) => item.id !== "draft-20");
      await route.fulfill({ json: successful({ success: true }) });
    } else await route.fulfill({ status: 404, json: { message: "No disponible" } });
  });
  await page.goto("/dashboard/proposals");
  const pagination = page.getByRole("navigation", { name: "Paginación de propuestas" });
  await expect(pagination).toContainText("1–20 de 21 propuestas");
  await pagination.getByRole("button", { name: "Siguiente" }).click();
  await expect(pagination).toContainText("21–21 de 21 propuestas");
  await page.getByRole("button", { name: "Eliminar borrador Borrador 20", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(pagination).toContainText("1–20 de 20 propuestas");
  await expect(pagination.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Borrador 20", exact: true })).toHaveCount(0);
});

test("una ficha ajena o eliminada muestra no disponible sin descargar páginas", async ({ page }) => {
  const authSession = sessionFor("AUDITOR");
  let listCalls = 0;
  await storeSession(page, "AUDITOR");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") await route.fulfill({ json: successful({ user: { ...authSession.user, role: authSession.user.backendRole, tenant: authSession.tenant } }) });
    else if (url.pathname === "/api/proposals") { listCalls += 1; await route.fulfill({ json: successful(proposalPage([])) }); }
    else await route.fulfill({ status: 404, json: { message: "No disponible" } });
  });
  await page.goto("/dashboard/proposals?view=detail&entityId=proposal-other-tenant");
  await expect(page.getByRole("alert")).toContainText("fuera de tu alcance autorizado");
  expect(listCalls).toBe(0);
});

for (const role of ["AUDITOR", "COMPLIANCE_OFFICER"] as const) {
  test(`${role} conserva lectura y no recibe controles de mutación`, async ({
    page,
  }) => {
    const methods: string[] = [];
    const authSession = sessionFor(role);
    await storeSession(page, role);

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const method = request.method();

      if (pathname === "/api/auth/me" && method === "GET") {
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

      if (pathname === "/api/proposals" && method === "GET") {
        methods.push(method);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(successful(proposalPage([proposal()]))),
        });
        return;
      }

      methods.push(method);
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ message: "Mutación no permitida" }),
      });
    });

    await page.goto("/dashboard/proposals");

    await expect(page.getByText("Acceso de consulta")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Agua segura rural" }),
    ).toBeVisible();
    await expect(page.getByText("Laura Responsable")).toBeVisible();
    await expect(page.getByText("42%")).toBeVisible();
    await expect(page.getByText(/125\.000,5/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Nueva propuesta" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Eliminar borrador/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Editar propuesta/ }),
    ).toHaveCount(0);

    await page.getByRole("heading", { name: "Agua segura rural" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Actualizar" }).click();
    await expect(page.getByText("Laura Responsable")).toBeVisible();

    expect(methods.length).toBeGreaterThanOrEqual(2);
    expect(methods.every((method) => method === "GET")).toBe(true);
  });
}
