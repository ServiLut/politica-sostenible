import { expect, test, type Page, type Route } from "@playwright/test";
import type { BackendAuthUser } from "../apps/web/lib/auth-session";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "command-palette-test-signature",
].join(".");

const backendUser: BackendAuthUser = {
  id: "admin-search-e2e",
  email: "admin.search@example.test",
  name: "Dirección de búsqueda",
  role: "ADMIN",
  tenant: {
    id: "tenant-search-e2e",
    name: "Campaña con búsqueda segura",
    slug: "campana-busqueda-segura",
    type: "CANDIDACY",
  },
};

const groupedResponse = {
  voters: [{ id: "voter-ana", name: "Ana Pérez" }],
  users: [
    {
      id: "user-ana",
      name: "Ana Administradora",
      email: "ana@example.test",
    },
  ],
  proposals: [
    {
      id: "proposal-water",
      title: "Agua segura",
      referenceCode: "P-01",
    },
  ],
  tasks: [
    {
      id: "task-call-leaders",
      title: "Llamar líderes",
      status: "TODO",
      priority: "HIGH",
    },
  ],
  commitments: [
    {
      id: "commitment-water",
      title: "Agua rural",
      reference: "CMP-01",
      status: "PROPOSED",
    },
  ],
  cases: [],
  incidents: [
    {
      id: "incident-access",
      title: "Acceso bloqueado",
      reference: "INC-CAM-01",
      status: "OPEN",
    },
  ],
};

type SearchMode = "results" | "empty" | "error" | "retry";

interface SearchRequest {
  method: string;
  url: string;
  authorization: string;
  body: Record<string, unknown>;
}

function successful(data: unknown) {
  return JSON.stringify({ statusCode: 200, message: "Success", data });
}

async function preparePalette(
  page: Page,
  mode: SearchMode,
  activeUser = backendUser,
) {
  const searchRequests: SearchRequest[] = [];
  const capabilityRequests: string[] = [];
  const voterListRequests: URL[] = [];
  const voterDetailRequests: URL[] = [];
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(
    ({ storageKey, token, user }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          accessToken: token,
          expiresAt: 1_893_456_000_000,
          tenant: user.tenant,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: "AdminCampana",
            backendRole: user.role,
          },
        }),
      );
    },
    {
      storageKey: "politica-sostenible.auth-session",
      token: jwt,
      user: activeUser,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({ user: activeUser }),
      });
      return;
    }

    if (url.pathname === "/api/auth/mfa/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({ enabled: false }),
      });
      return;
    }

    if (
      url.pathname === "/api/billing/capabilities" &&
      request.method() === "GET"
    ) {
      expect(request.headers().authorization).toBe(`Bearer ${jwt}`);
      capabilityRequests.push(`${request.method()} ${url.pathname}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({
          plan: { code: "PRO", name: "Profesional" },
          features: { export: true, import: true, mfa: true },
        }),
      });
      return;
    }

    if (url.pathname === "/api/search") {
      searchRequests.push({
        method: request.method(),
        url: request.url(),
        authorization: request.headers().authorization ?? "",
        body: request.postDataJSON() as Record<string, unknown>,
      });

      if (
        mode === "error" ||
        (mode === "retry" && searchRequests.length === 1)
      ) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 503,
            message: "Búsqueda temporalmente no disponible",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful(
          mode === "results" || mode === "retry"
            ? groupedResponse
            : {
                voters: [],
                users: [],
                proposals: [],
                tasks: [],
                commitments: [],
                cases: [],
                incidents: [],
              },
        ),
      });
      return;
    }

    if (url.pathname === "/api/proposals" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({
          items: [
            {
              id: "proposal-water",
              referenceCode: "P-01",
              title: "Agua segura",
              description: "Acceso verificable a agua segura.",
              category: "INFRASTRUCTURE",
              targetGroup: null,
              status: "PROPOSED",
              progressPercent: 25,
              isPublic: true,
              territory: null,
              estimatedCost: null,
              sourceUrl: null,
              ownerId: backendUser.id,
              owner: { id: backendUser.id, name: backendUser.name },
              createdAt: "2026-09-01T12:00:00.000Z",
              updatedAt: "2026-09-01T12:00:00.000Z",
            },
          ],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
        }),
      });
      return;
    }

    if (url.pathname === "/api/voters" && request.method() === "GET") {
      voterListRequests.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({
          items: [
            {
              id: "voter-ana",
              firstName: "Ana",
              lastName: "Pérez",
              documentIdMasked: "******5678",
              phoneMasked: "******4567",
              mesa: 12,
              consentAccepted: true,
              consentTimestamp: "2026-09-01T12:00:00.000Z",
              createdAt: "2026-09-01T12:00:00.000Z",
              puesto: null,
              registrar: { name: backendUser.name },
            },
          ],
          pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
        }),
      });
      return;
    }

    if (
      url.pathname === "/api/voters/voter-ana" &&
      request.method() === "GET"
    ) {
      voterDetailRequests.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({
          id: "voter-ana",
          firstName: "Ana",
          lastName: "Pérez",
          documentId: "1012345678",
          phone: "3001234567",
          email: "ana@example.test",
          mesa: 12,
          consentAccepted: true,
          consentTimestamp: "2026-09-01T12:00:00.000Z",
          termsVersion: "2026.1",
          createdAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-01T12:00:00.000Z",
          puesto: null,
          registrar: { name: backendUser.name },
        }),
      });
      return;
    }

    if (url.pathname === "/api/team/members" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({
          items: [
            {
              id: "user-ana",
              name: "Ana Administradora",
              email: "ana@example.test",
              role: "CAMPAIGN_MANAGER",
              isActive: true,
              divisionId: null,
              division: null,
              createdAt: "2026-09-01T12:00:00.000Z",
            },
          ],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
        }),
      });
      return;
    }

    if (
      url.pathname === "/api/team/invitations" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({
          items: [],
          pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ statusCode: 404, message: "Ruta no simulada" }),
    });
  });

  await page.goto("/dashboard/profile");
  await expect(
    page.getByRole("heading", { name: activeUser.name }),
  ).toBeVisible();

  return {
    searchRequests,
    capabilityRequests,
    voterListRequests,
    voterDetailRequests,
    pageErrors,
  };
}

async function openPalette(page: Page) {
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Búsqueda global" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("atrapa Tab, enfoca la búsqueda, cierra con Escape y restaura el disparador", async ({
  page,
}, testInfo) => {
  const { pageErrors } = await preparePalette(page, "empty");
  const trigger = page.getByRole("button", {
    name: "Abrir opciones de usuario",
  });
  await trigger.focus();
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Búsqueda global" });
  const input = dialog.getByRole("searchbox", {
    name: "Buscar en la organización",
  });
  const close = dialog.getByRole("button", { name: "Cerrar búsqueda" });
  const sections = dialog.getByRole("region", {
    name: "Secciones disponibles",
  });
  const links = sections.getByRole("link");
  await expect(links).toHaveCount(6);
  await expect(input).toBeFocused();
  await dialog.screenshot({ path: testInfo.outputPath("busqueda-accesos.png") });

  await page.keyboard.press("Shift+Tab");
  await expect(links.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(links.first()).toBeFocused();
  for (let index = 1; index < (await links.count()); index += 1) {
    await page.keyboard.press("Tab");
    await expect(links.nth(index)).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test("Ctrl+K busca por POST, agrupa resultados y navega sin exponer el término", async ({
  page,
}) => {
  const { searchRequests, pageErrors } = await preparePalette(page, "results");
  const dialog = await openPalette(page);
  const input = dialog.getByRole("searchbox", {
    name: "Buscar en la organización",
  });

  await input.fill("An");
  await expect(
    dialog.getByText(
      "Abre una sección o escribe al menos 3 caracteres para buscar registros.",
    ),
  ).toBeVisible();
  await page.waitForTimeout(400);
  expect(searchRequests).toHaveLength(0);

  await input.fill("Ana");
  await expect.poll(() => searchRequests.length).toBeGreaterThan(0);
  await expect(dialog.getByText("Personas", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Equipo", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Propuestas", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Tareas", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Compromisos", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("Incidentes y crisis", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Ana Pérez/ })).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: /Ana Administradora/ }),
  ).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Agua segura/ })).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: /Llamar líderes/ }),
  ).toHaveAttribute(
    "href",
    "/dashboard/tasks?view=tasks&entityId=task-call-leaders",
  );
  await expect(
    dialog.getByRole("link", { name: /Agua rural/ }),
  ).toHaveAttribute(
    "href",
    "/dashboard/tasks?view=commitments&entityId=commitment-water",
  );
  await expect(
    dialog.getByRole("link", { name: /Acceso bloqueado/ }),
  ).toHaveAttribute(
    "href",
    "/dashboard/incidents?view=detail&entityId=incident-access",
  );
  await expect(dialog.getByRole("link", { name: /Ana Pérez/ })).toHaveAttribute(
    "href",
    "/dashboard/votantes?view=detail&entityId=voter-ana",
  );
  await expect(
    dialog.getByRole("link", { name: /Ana Administradora/ }),
  ).toHaveAttribute("href", "/dashboard/team?view=detail&entityId=user-ana");
  await expect(
    dialog.getByRole("link", { name: /Agua segura/ }),
  ).toHaveAttribute(
    "href",
    "/dashboard/proposals?view=detail&entityId=proposal-water",
  );
  expect(pageErrors).toEqual([]);

  for (const request of searchRequests) {
    const requestedUrl = new URL(request.url);
    expect(request.method).toBe("POST");
    expect(requestedUrl.pathname).toBe("/api/search");
    expect(requestedUrl.search).toBe("");
    expect(request.body).toEqual({ query: "Ana" });
    expect(request.authorization).toBe(`Bearer ${jwt}`);
  }

  await dialog.getByRole("link", { name: /Agua segura/ }).click();
  await expect(page).toHaveURL(
    /\/dashboard\/proposals\?view=detail&entityId=proposal-water$/,
  );
  const proposal = page.locator("#proposal-result-proposal-water");
  await expect(proposal).toBeVisible();
  await expect(proposal).toHaveAttribute("aria-current", "true");
  await expect(proposal).toBeFocused();
  await expect(
    page.getByRole("dialog", { name: "Búsqueda global" }),
  ).toHaveCount(0);
});

test("muestra un estado vacío para una búsqueda válida sin coincidencias", async ({
  page,
}) => {
  const { searchRequests, pageErrors } = await preparePalette(page, "empty");
  const dialog = await openPalette(page);

  await dialog
    .getByRole("searchbox", { name: "Buscar en la organización" })
    .fill("Nadie");

  await expect.poll(() => searchRequests.length).toBe(1);
  await expect(
    dialog.getByText('No se encontraron resultados para "Nadie"'),
  ).toBeVisible();
  expect(searchRequests[0].body).toEqual({ query: "Nadie" });
  expect(new URL(searchRequests[0].url).search).toBe("");
  expect(pageErrors).toEqual([]);
});

test("el resultado de persona conserva el id y abre solo el detalle autorizado", async ({
  page,
}) => {
  const {
    capabilityRequests,
    voterListRequests,
    voterDetailRequests,
    pageErrors,
  } = await preparePalette(page, "results");
  const dialog = await openPalette(page);
  await dialog
    .getByRole("searchbox", { name: "Buscar en la organización" })
    .fill("Ana");

  const result = dialog.getByRole("link", { name: /Ana Pérez/ });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page).toHaveURL(
    /\/dashboard\/votantes\?view=detail&entityId=voter-ana$/,
  );
  await expect(
    page.getByRole("dialog", { name: "Datos personales autorizados" }),
  ).toBeVisible();
  await expect.poll(() => voterListRequests.length).toBeGreaterThan(0);
  expect(voterListRequests.at(-1)?.searchParams.get("entityId")).toBe(
    "voter-ana",
  );
  expect(voterListRequests.at(-1)?.searchParams.has("tenantId")).toBe(false);
  expect(voterListRequests.at(-1)?.searchParams.has("mode")).toBe(false);
  await expect.poll(() => voterDetailRequests.length).toBe(1);
  expect(voterDetailRequests[0].search).toBe("");
  expect(capabilityRequests).toContain("GET /api/billing/capabilities");
  expect(pageErrors).toEqual([]);
});

test("el resultado de equipo enfoca el miembro exacto", async ({ page }) => {
  const { pageErrors } = await preparePalette(page, "results");
  const dialog = await openPalette(page);
  await dialog
    .getByRole("searchbox", { name: "Buscar en la organización" })
    .fill("Ana");

  const result = dialog.getByRole("link", { name: /Ana Administradora/ });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page).toHaveURL(
    /\/dashboard\/team\?view=detail&entityId=user-ana$/,
  );
  const member = page.locator("#team-member-result-user-ana");
  await expect(member).toBeVisible();
  await expect(member).toHaveAttribute("aria-current", "true");
  await expect(member).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test("mantiene abierta la paleta y muestra el error controlado de búsqueda", async ({
  page,
}) => {
  const { searchRequests, pageErrors } = await preparePalette(page, "error");
  const dialog = await openPalette(page);

  await dialog
    .getByRole("searchbox", { name: "Buscar en la organización" })
    .fill("Error");

  await expect(
    dialog.getByText(
      "No pudimos buscar los registros. Puedes reintentar o abrir una sección.",
    ),
  ).toBeVisible();
  expect(searchRequests).toHaveLength(1);
  expect(searchRequests[0].method).toBe("POST");
  expect(new URL(searchRequests[0].url).search).toBe("");
  expect(pageErrors).toEqual([]);
  await expect(dialog).toBeVisible();
});

test("encuentra una sección con dos letras y permite abrirla con el teclado sin consultar registros", async ({
  page,
}) => {
  const { searchRequests, pageErrors } = await preparePalette(page, "empty");
  const dialog = await openPalette(page);
  await dialog
    .getByRole("searchbox", { name: "Buscar en la organización" })
    .fill("eq");
  const section = dialog.getByRole("link", { name: /Equipo y accesos/ });
  await expect(section).toBeVisible();
  await expect(section).toHaveAttribute("href", "/dashboard/team");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(section).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/team$/);
  await expect(page.locator("#team-member-result-user-ana")).toBeVisible();
  expect(searchRequests).toHaveLength(0);
  expect(pageErrors).toEqual([]);
});

test("reintenta el mismo término sin reescribirlo y recupera los registros", async ({
  page,
}) => {
  const { searchRequests, pageErrors } = await preparePalette(page, "retry");
  const dialog = await openPalette(page);
  const input = dialog.getByRole("searchbox", {
    name: "Buscar en la organización",
  });
  await input.fill("Ana");
  const retry = dialog.getByRole("button", { name: "Reintentar búsqueda" });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("link", { name: /Ana Pérez/ })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(searchRequests).toHaveLength(2);
  expect(searchRequests.map((request) => request.body)).toEqual([
    { query: "Ana" },
    { query: "Ana" },
  ]);
  expect(pageErrors).toEqual([]);
});

test("un reintento lento no sustituye los resultados de una consulta más reciente", async ({
  page,
}) => {
  await preparePalette(page, "empty");
  let attempt = 0;
  let pendingRetry: Route | null = null;
  await page.route("**/api/search", async (route) => {
    const query = route.request().postDataJSON().query as string;
    attempt += 1;
    if (attempt === 1) {
      await route.fulfill({
        status: 503,
        json: { message: "Temporalmente no disponible" },
      });
    } else if (query === "Anterior") {
      pendingRetry = route;
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({
          voters: [{ id: "current", name: "Resultado actual" }],
          users: [],
          proposals: [],
        }),
      });
    }
  });
  const dialog = await openPalette(page);
  const input = dialog.getByRole("searchbox", {
    name: "Buscar en la organización",
  });
  await input.fill("Anterior");
  await dialog.getByRole("button", { name: "Reintentar búsqueda" }).click();
  await expect.poll(() => pendingRetry !== null).toBe(true);
  await input.fill("Actual");
  await expect(
    dialog.getByRole("link", { name: /Resultado actual/ }),
  ).toBeVisible();
  await (pendingRetry as unknown as Route).fulfill({
    status: 200,
    contentType: "application/json",
    body: successful({
      voters: [{ id: "old", name: "Resultado anterior" }],
      users: [],
      proposals: [],
    }),
  });
  await expect(
    dialog.getByRole("link", { name: /Resultado actual/ }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: /Resultado anterior/ }),
  ).toHaveCount(0);
});

for (const scenario of [
  {
    name: "voluntariado",
    role: "VOLUNTEER",
    type: "CANDIDACY",
    stage: "CAMPAIGN",
    absent: "equipo",
    present: "tareas",
    href: "/dashboard/tasks",
  },
  {
    name: "gestión pública",
    role: "ADMIN",
    type: "PUBLIC_OFFICE",
    stage: null,
    absent: "calor",
    present: "atencion",
    href: "/dashboard/cases",
  },
  {
    name: "etapa de campaña",
    role: "ADMIN",
    type: "CANDIDACY",
    stage: "CAMPAIGN",
    absent: "escrutinios",
    present: "agenda",
    href: "/dashboard/events",
  },
] as const) {
  test(`la búsqueda de secciones respeta ${scenario.name}`, async ({
    page,
  }) => {
    await preparePalette(page, "empty", {
      ...backendUser,
      role: scenario.role,
      tenant: {
        ...backendUser.tenant,
        type: scenario.type,
        operationStage: scenario.stage,
      },
    });
    const dialog = await openPalette(page);
    const input = dialog.getByRole("searchbox", {
      name: "Buscar en la organización",
    });
    await input.fill(scenario.absent);
    await expect(
      dialog.getByRole("region", { name: "Secciones disponibles" }),
    ).toHaveCount(0);
    await input.fill(scenario.present);
    await expect(
      dialog
        .getByRole("region", { name: "Secciones disponibles" })
        .getByRole("link"),
    ).toHaveAttribute("href", scenario.href);
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    const viewport = page.viewportSize();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width);
  });
}
