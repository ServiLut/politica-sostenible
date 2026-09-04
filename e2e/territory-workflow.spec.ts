import { expect, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant: {
    id: "tenant-e2e",
    name: "Campaña verificable",
    slug: "campana-verificable",
    type: "CANDIDACY",
  },
  user: {
    id: "admin-e2e",
    email: "admin@example.test",
    name: "Dirección territorial",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};

const municipality = {
  id: "municipio-11001",
  code: "11001",
  name: "Bogotá, D.C.",
  type: "MUNICIPIO",
  parentId: null,
  parent: null,
};

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

test("una zona creada queda visible inmediatamente sin actualización manual", async ({
  page,
}) => {
  let createdZone: Record<string, unknown> | null = null;
  const postBodies: Record<string, unknown>[] = [];

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: session,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              role: session.user.backendRole,
              tenant: session.tenant,
            },
          }),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/campaigns/divisions" &&
      request.method() === "GET"
    ) {
      const requestedType = url.searchParams.get("type");
      const items =
        requestedType === "MUNICIPIO"
          ? [municipality]
          : requestedType === "ZONA" && createdZone
            ? [createdZone]
            : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items,
            pagination: {
              page: 1,
              limit: Number(url.searchParams.get("limit") ?? 24),
              total: items.length,
              totalPages: items.length ? 1 : 0,
            },
          }),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/campaigns/divisions" &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      postBodies.push(body);
      createdZone = {
        id: "zona-centro",
        ...body,
        parent: municipality,
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(createdZone, 201)),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Not mocked" });
  });

  await page.goto("/dashboard/territory");
  await expect(
    page.getByRole("heading", { name: "Organización territorial" }),
  ).toBeVisible();

  await page.getByLabel("Código", { exact: true }).fill("ZC-01");
  await page.getByLabel("Nombre", { exact: true }).fill("Zona Centro");
  await page
    .getByRole("combobox", { name: "Territorio padre" })
    .selectOption(municipality.id);
  await page.getByRole("button", { name: "Crear", exact: true }).click();

  await expect(
    page.getByText("Zona Centro quedó disponible para asignaciones."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zona Centro" })).toBeVisible();
  expect(postBodies).toEqual([
    {
      type: "ZONA",
      code: "ZC-01",
      name: "Zona Centro",
      parentId: municipality.id,
    },
  ]);
});
