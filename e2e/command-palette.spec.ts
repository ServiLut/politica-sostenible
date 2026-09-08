import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "command-palette-test-signature",
].join(".");

const backendUser = {
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
  documents: [],
};

type SearchMode = "results" | "empty" | "error";

interface SearchRequest {
  method: string;
  url: string;
  authorization: string;
  body: Record<string, unknown>;
}

function successful(data: unknown) {
  return JSON.stringify({ statusCode: 200, message: "Success", data });
}

async function preparePalette(page: Page, mode: SearchMode) {
  const searchRequests: SearchRequest[] = [];
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
      user: backendUser,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({ user: backendUser }),
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

    if (url.pathname === "/api/search") {
      searchRequests.push({
        method: request.method(),
        url: request.url(),
        authorization: request.headers().authorization ?? "",
        body: request.postDataJSON() as Record<string, unknown>,
      });

      if (mode === "error") {
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
          mode === "results"
            ? groupedResponse
            : { voters: [], users: [], proposals: [], documents: [] },
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
    page.getByRole("heading", { name: backendUser.name }),
  ).toBeVisible();

  return {
    searchRequests,
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
    dialog.getByText("Escribe al menos 3 caracteres para buscar."),
  ).toBeVisible();
  await page.waitForTimeout(400);
  expect(searchRequests).toHaveLength(0);

  await input.fill("Ana");
  await expect.poll(() => searchRequests.length).toBeGreaterThan(0);
  await expect(dialog.getByText("Personas", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Equipo", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Propuestas", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Ana Pérez/ })).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: /Ana Administradora/ }),
  ).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Agua segura/ })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Ana Pérez/ })).toHaveAttribute(
    "href",
    "/dashboard/votantes?view=detail&entityId=voter-ana",
  );
  await expect(
    dialog.getByRole("link", { name: /Ana Administradora/ }),
  ).toHaveAttribute(
    "href",
    "/dashboard/team?view=detail&entityId=user-ana",
  );
  await expect(dialog.getByRole("link", { name: /Agua segura/ })).toHaveAttribute(
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
  const { voterListRequests, voterDetailRequests, pageErrors } =
    await preparePalette(page, "results");
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
    dialog.getByText("Error al buscar. Intente de nuevo."),
  ).toBeVisible();
  expect(searchRequests).toHaveLength(1);
  expect(searchRequests[0].method).toBe("POST");
  expect(new URL(searchRequests[0].url).search).toBe("");
  expect(pageErrors).toEqual([]);
  await expect(dialog).toBeVisible();
});
