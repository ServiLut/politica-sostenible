import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

const tenant = {
  id: "tenant-campaign",
  name: "Campaña verificable",
  slug: "campana-verificable",
  type: "CANDIDACY",
};

const adminSession = {
  accessToken: jwt,
  expiresAt: null,
  tenant,
  user: {
    id: "admin-campaign",
    email: "direccion@example.test",
    name: "Dirección de campaña",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};

const complianceSession = {
  accessToken: jwt,
  expiresAt: null,
  tenant,
  user: {
    id: "compliance-campaign",
    email: "cumplimiento@example.test",
    name: "Oficial de cumplimiento",
    role: "Auditor",
    backendRole: "COMPLIANCE_OFFICER",
  },
};

const zoneCoordinatorSession = {
  accessToken: jwt,
  expiresAt: null,
  tenant,
  user: {
    id: "zone-campaign",
    email: "zona@example.test",
    name: "Coordinación territorial",
    role: "Coordinador",
    backendRole: "ZONE_COORDINATOR",
  },
};

const assignees = [
  { id: "admin-campaign", name: "Dirección de campaña", role: "ADMIN" },
  { id: "legal-team", name: "Equipo jurídico", role: "CAMPAIGN_MANAGER" },
];

const initialIncident = {
  id: "incident-1",
  mode: "CAMPAIGN",
  reference: "PQRS-CAM-2026-AAA111",
  title: "Daño en material de puesto",
  description: "El coordinador reportó material deteriorado antes del evento.",
  category: "Logística",
  sourceChannel: "INTERNAL",
  status: "OPEN",
  priority: "HIGH",
  voterId: null,
  externalContactRef: "FOLIO-18",
  divisionId: null,
  assigneeId: "admin-campaign",
  createdById: "admin-campaign",
  confidential: false,
  dueAt: "2026-08-30T17:00:00.000Z",
  firstResponseAt: null,
  resolvedAt: null,
  createdAt: "2026-08-21T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
  assignee: assignees[0],
  createdBy: assignees[0],
  voter: null,
  division: null,
  _count: { interactions: 1, tasks: 0, commitments: 0 },
};

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

function pageOf(items: (typeof initialIncident)[]) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 12,
      total: items.length,
      totalPages: items.length ? 1 : 0,
    },
  };
}

async function installSession(
  page: Page,
  session:
    | typeof adminSession
    | typeof complianceSession
    | typeof zoneCoordinatorSession,
) {
  await page.addInitScript(
    ({
      storageKey,
      authSession,
    }: {
      storageKey: string;
      authSession: unknown;
    }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: session,
    },
  );
}

function currentSessionResponse(
  authSession:
    | typeof adminSession
    | typeof complianceSession
    | typeof zoneCoordinatorSession,
) {
  return successful({
    user: {
      id: authSession.user.id,
      email: authSession.user.email,
      name: authSession.user.name,
      role: authSession.user.backendRole,
      tenant: authSession.tenant,
    },
  });
}

test("administra un incidente real con filtros, responsable y transición auditada", async ({
  page,
}) => {
  const authorizationHeaders: string[] = [];
  const requestedCaseUrls: URL[] = [];
  const mutationBodies: Record<string, unknown>[] = [];
  let incidents = [initialIncident];

  await installSession(page, adminSession);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (url.pathname === "/api/cases/assignees" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(assignees)),
      });
      return;
    }

    if (url.pathname === "/api/cases" && method === "GET") {
      requestedCaseUrls.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(pageOf(incidents))),
      });
      return;
    }

    if (url.pathname === "/api/cases" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      const created = {
        ...initialIncident,
        ...body,
        id: "incident-2",
        reference: "PQRS-CAM-2026-BBB222",
        assigneeId: String(body.assigneeId),
        assignee: assignees[1],
        createdAt: "2026-08-21T15:00:00.000Z",
        updatedAt: "2026-08-21T15:00:00.000Z",
      } as typeof initialIncident;
      incidents = [created, ...incidents];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(created, 201)),
      });
      return;
    }

    if (url.pathname === "/api/cases/incident-2" && method === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      const updated = {
        ...incidents[0],
        ...body,
        updatedAt: "2026-08-21T16:00:00.000Z",
      } as typeof initialIncident;
      incidents = [updated, ...incidents.slice(1)];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(updated)),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Ruta no simulada: ${method} ${url.pathname}`,
      }),
    });
  });

  await page.goto("/dashboard/incidents");

  await expect(
    page.getByRole("heading", { name: "Incidentes y respuesta de crisis" }),
  ).toBeVisible();
  await expect(
    page.getByText(/no inventa análisis de sentimiento/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Incidentes y crisis" }),
  ).toBeVisible();
  await expect(page.getByTestId("incident-card-incident-1")).toContainText(
    "Daño en material de puesto",
  );
  await expect(page.getByTestId("incident-card-incident-1")).toContainText(
    "Severidad Alta",
  );

  await page
    .getByRole("combobox", { name: "Filtrar incidentes por estado" })
    .selectOption("IN_PROGRESS");
  await expect
    .poll(() =>
      requestedCaseUrls.some(
        (url) => url.searchParams.get("status") === "IN_PROGRESS",
      ),
    )
    .toBe(true);

  await page
    .getByRole("combobox", { name: "Filtrar incidentes por estado" })
    .selectOption("");
  await page.getByPlaceholder(/Referencia, hecho/).fill("material");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect
    .poll(() =>
      requestedCaseUrls.some(
        (url) => url.searchParams.get("search") === "material",
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Reportar incidente" }).click();
  const dialog = page.getByRole("dialog", { name: "Reportar incidente" });
  await dialog
    .getByLabel("Hecho reportado")
    .fill("Amenaza al equipo territorial");
  await dialog
    .getByLabel("Descripción verificable")
    .fill(
      "Llamada recibida a las 14:00; el equipo activó el protocolo interno.",
    );
  await dialog.getByLabel("Categoría").selectOption("Seguridad");
  await dialog.getByLabel("Severidad / prioridad").selectOption("URGENT");
  await dialog.getByLabel("Responsable").selectOption("legal-team");
  await dialog.getByLabel("Vencimiento").fill("2026-08-22");
  await dialog.getByLabel(/Restringir como incidente confidencial/).check();
  await dialog.getByRole("button", { name: "Registrar incidente" }).click();

  await expect(
    page.getByText("Incidente registrado con trazabilidad de auditoría."),
  ).toBeVisible();
  const createdCard = page.getByTestId("incident-card-incident-2");
  await expect(createdCard).toContainText("Amenaza al equipo territorial");
  await expect(createdCard).toContainText("Severidad Crítica");

  await createdCard
    .getByRole("combobox", { name: /Estado operativo/ })
    .selectOption("IN_PROGRESS");
  await createdCard.getByRole("button", { name: "Guardar respuesta" }).click();
  await expect(
    page.getByText("PQRS-CAM-2026-BBB222 actualizado y auditado."),
  ).toBeVisible();
  await expect(createdCard).toContainText("Respuesta en curso");

  expect(mutationBodies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: "Amenaza al equipo territorial",
        category: "Seguridad",
        priority: "URGENT",
        assigneeId: "legal-team",
        confidential: true,
      }),
      { status: "IN_PROGRESS" },
    ]),
  );
  expect(
    mutationBodies.every(
      (body) =>
        !("tenantId" in body) && !("tenant_id" in body) && !("mode" in body),
    ),
  ).toBe(true);
  expect(
    requestedCaseUrls.every(
      (url) =>
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("tenant_id") &&
        !url.searchParams.has("mode"),
    ),
  ).toBe(true);
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(7);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});

test("cumplimiento revisa incidentes sin permisos de mutación", async ({
  page,
}) => {
  const requestedPaths: string[] = [];
  let authSessionRequests = 0;

  await installSession(page, complianceSession);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "GET" && url.pathname === "/api/auth/me") {
      authSessionRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentSessionResponse(complianceSession)),
      });
      return;
    }

    requestedPaths.push(`${request.method()} ${url.pathname}`);

    if (request.method() === "GET" && url.pathname === "/api/cases") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(pageOf([initialIncident]))),
      });
      return;
    }

    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Operación no permitida" }),
    });
  });

  await page.goto("/dashboard/incidents");

  await expect(
    page.getByRole("heading", { name: "Incidentes y respuesta de crisis" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Acceso de cumplimiento en modo consulta/),
  ).toBeVisible();
  await expect(page.getByTestId("incident-card-incident-1")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reportar incidente" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guardar respuesta" }),
  ).toHaveCount(0);
  expect(requestedPaths.length).toBeGreaterThanOrEqual(1);
  expect(requestedPaths.every((path) => path === "GET /api/cases")).toBe(true);
  expect(authSessionRequests).toBeGreaterThanOrEqual(1);
});

test("no expone incidentes al coordinador zonal sin permiso en la API", async ({
  page,
}) => {
  const requestedPaths: string[] = [];
  let authSessionRequests = 0;

  await installSession(page, zoneCoordinatorSession);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === "/api/auth/me") {
      authSessionRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentSessionResponse(zoneCoordinatorSession)),
      });
      return;
    }

    requestedPaths.push(pathname);
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Operación no permitida" }),
    });
  });

  await page.goto("/dashboard/incidents");

  await expect(
    page.getByRole("heading", { name: "Acceso Restringido" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Incidentes y crisis" }),
  ).toHaveCount(0);
  expect(requestedPaths).toEqual([]);
  expect(authSessionRequests).toBeGreaterThanOrEqual(1);
});
