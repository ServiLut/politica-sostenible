import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "navigation-test-signature",
].join(".");

type TestIdentity = {
  backendRole: string;
  frontendRole: string;
  name: string;
};

async function prepareSession(page: Page, identity: TestIdentity) {
  const backendUser = {
    id: `user-${identity.backendRole.toLowerCase()}`,
    email: `${identity.backendRole.toLowerCase()}@example.test`,
    name: identity.name,
    role: identity.backendRole,
    tenant: {
      id: "tenant-navigation",
      name: "Campaña navegación clara",
      slug: "campana-navegacion-clara",
      type: "CANDIDACY",
    },
  };

  await page.addInitScript(
    ({ storageKey, token, user, frontendRole }) => {
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
            role: frontendRole,
            backendRole: user.role,
          },
        }),
      );
    },
    {
      storageKey: "politica-sostenible.auth-session",
      token: jwt,
      user: backendUser,
      frontendRole: identity.frontendRole,
    },
  );

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: { user: backendUser },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Ruta no simulada" });
  });
}

async function openSecondaryNavigationOnMobile(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole("button", { name: "Abrir más opciones" }).click();
  }
}

function workspaceLabel(page: Page, label: string) {
  const labels = page.getByText(`Tu espacio · ${label}`);
  return (page.viewportSize()?.width ?? 1280) < 1024
    ? labels.last()
    : labels.first();
}

test("dirección ve una navegación neutral y centrada en la bandeja", async ({
  page,
}) => {
  await prepareSession(page, {
    backendRole: "ADMIN",
    frontendRole: "AdminCampana",
    name: "Dirección",
  });

  await page.goto("/dashboard/profile");
  await openSecondaryNavigationOnMobile(page);

  await expect(workspaceLabel(page, "Dirección")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Bandeja operativa", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Personas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Operación electoral", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /Votantes|Captura territorial|Día D \/ E-14/,
  );
});

test("campo prioriza la jornada, las tareas y la agenda con lenguaje claro", async ({
  page,
}) => {
  await prepareSession(page, {
    backendRole: "VOLUNTEER",
    frontendRole: "Voluntario",
    name: "Equipo de campo",
  });

  await page.goto("/dashboard/profile");
  await openSecondaryNavigationOnMobile(page);

  await expect(workspaceLabel(page, "Campo")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Jornada territorial", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Tareas y compromisos", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Agenda y eventos", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Operación electoral", exact: true }),
  ).toHaveCount(0);
});

test("el rol de testigo conserva acceso explícito a la operación electoral", async ({
  page,
}) => {
  await prepareSession(page, {
    backendRole: "WITNESS",
    frontendRole: "Testigo",
    name: "Testigo electoral",
  });

  await page.goto("/dashboard/profile");
  await openSecondaryNavigationOnMobile(page);

  await expect(workspaceLabel(page, "Campo")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Operación electoral", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Bandeja operativa", exact: true }),
  ).toHaveCount(0);
});
