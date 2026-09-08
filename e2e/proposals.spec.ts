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

function proposalPage(items: MockProposal[]) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 100,
      total: items.length,
      totalPages: items.length > 0 ? 1 : 0,
    },
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

test("administra propuestas con el enum y contrato reales sin enviar tenant ni owner", async ({
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
      expect(url.searchParams.get("limit")).toBe("100");
      expect(url.searchParams.has("tenantId")).toBe(false);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(proposalPage(proposals))),
      });
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

  await initialCard.click();
  const editDialog = page.getByRole("dialog", { name: "Editar propuesta" });
  await expect(editDialog.getByLabel("Título")).toBeDisabled();
  await expect(
    editDialog.getByLabel("Costo estimado (opcional)"),
  ).toBeDisabled();
  await editDialog.getByLabel("Estado").selectOption("COMPLETED");
  await editDialog.getByLabel("Progreso (%)").fill("100");
  await editDialog.getByRole("button", { name: "Guardar" }).click();

  const updatedCard = page.getByRole("button", {
    name: "Editar propuesta Agua segura rural",
  });
  await expect(updatedCard).toContainText("Completada");
  await expect(updatedCard).toContainText("100%");
  await expect(updatedCard).toContainText(/125\.000,5/);

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
  await expect(createdCard).toContainText("Borrador");
  await expect(createdCard).toContainText("Dirección programática");
  await expect(createdCard).toContainText("0%");
  await expect(createdCard).toContainText(/75\.000,25/);

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
      },
    },
    { method: "DELETE", body: null },
  ]);
  expect(
    mutations.every(
      ({ body }) =>
        body === null ||
        (!("tenantId" in body) &&
          !("tenant_id" in body) &&
          !("ownerId" in body)),
    ),
  ).toBe(true);
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(7);
  expect(
    authorizationHeaders.every((header) => header === `Bearer ${jwt}`),
  ).toBe(true);
});

test("muestra propuestas que están después de la primera página de cien", async ({
  page,
}) => {
  const authSession = sessionFor("COMPLIANCE_OFFICER");
  const proposals = Array.from({ length: 125 }, (_, index) =>
    proposal({
      id: `proposal-${index + 1}`,
      referenceCode: `PRO-${String(index + 1).padStart(3, "0")}`,
      title: `Propuesta ${index + 1}`,
    }),
  );
  const requestedPages: number[] = [];
  await storeSession(page, "COMPLIANCE_OFFICER");

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "GET" && url.pathname === "/api/auth/me") {
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

    if (request.method() === "GET" && url.pathname === "/api/proposals") {
      const requestedPage = Number(url.searchParams.get("page"));
      requestedPages.push(requestedPage);
      const start = (requestedPage - 1) * 100;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: proposals.slice(start, start + 100),
            pagination: {
              page: requestedPage,
              limit: 100,
              total: proposals.length,
              totalPages: 2,
            },
          }),
        ),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/proposals");

  await expect(
    page.getByRole("heading", { name: "Propuesta 125", exact: true }),
  ).toBeVisible();
  expect([...new Set(requestedPages)].sort()).toEqual([1, 2]);
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
