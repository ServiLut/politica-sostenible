import { expect, test, type Page } from "@playwright/test";
import {
  FRONTEND_ROLE_BY_BACKEND_ROLE,
  ROLE_LABEL_BY_BACKEND_ROLE,
  ROLE_MATRIX_SCENARIOS,
  assertRoleMatrixFixtureIsComplete,
  type BackendRole,
  type FrontendRole,
  type OperationStage,
  type TenantType,
} from "./role-matrix.fixture";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "navigation-test-signature",
].join(".");

type TestIdentity = {
  backendRole: BackendRole;
  frontendRole: FrontendRole;
  name: string;
  tenantType: TenantType;
  operationStage: OperationStage | null;
};

async function prepareSession(page: Page, identity: TestIdentity) {
  const backendUser = {
    id: `user-${identity.backendRole.toLowerCase()}`,
    email: `${identity.backendRole.toLowerCase()}@example.test`,
    name: identity.name,
    role: identity.backendRole,
    tenant: {
      id: `tenant-${identity.tenantType.toLowerCase()}`,
      name: `Organización ${identity.tenantType.toLowerCase()}`,
      slug: `organizacion-${identity.tenantType.toLowerCase()}`,
      type: identity.tenantType,
      operationStage: identity.operationStage,
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

function desktopNavigation(page: Page) {
  return page.getByRole("navigation", {
    name: "Navegación principal",
    exact: true,
  });
}

function mobileNavigation(page: Page) {
  return page.getByRole("navigation", {
    name: "Navegación principal móvil",
    exact: true,
  });
}

async function visibleNavigationPaths(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) >= 1024) {
    const navigation = desktopNavigation(page);
    // Wait for the authenticated sidebar, rather than sampling before hydration.
    await expect(navigation.getByRole("link").first()).toBeVisible();
    const collapsedGroups = navigation.locator("details:not([open]) > summary");
    for (const summary of await collapsedGroups.all()) {
      await summary.click();
    }
    return navigation
      .getByRole("link")
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      );
  }

  const navigation = mobileNavigation(page);
  await expect(navigation.getByRole("link").first()).toBeVisible();
  const primaryPaths = await navigation
    .getByRole("link")
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => Boolean(href)),
    );
  await page.getByRole("button", { name: "Abrir más opciones" }).click();
  const secondaryPaths = await page
    .getByRole("dialog", { name: "Más opciones" })
    .getByRole("link")
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => Boolean(href)),
    );

  return [...primaryPaths, ...secondaryPaths];
}

async function expectRoleWorkspace(page: Page, workspace: string, label: string) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    const drawer = page.getByRole("dialog", { name: "Más opciones" });
    await expect(
      drawer.getByText(`Tu espacio · ${workspace}`, { exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByRole("paragraph").filter({ hasText: new RegExp(`^${label}$`) }),
    ).toBeVisible();
    return;
  }

  await expect(desktopNavigation(page).getByRole("heading").first()).toHaveText(
    workspace,
  );
  await expect(
    page
      .getByRole("complementary")
      .getByRole("paragraph")
      .filter({ hasText: new RegExp(`^${label}$`) }),
  ).toBeVisible();
}

async function expectDashboardLandmarks(page: Page) {
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator('[id="dashboard-content"]')).toHaveCount(1);
  const duplicateIds = await page.locator("[id]").evaluateAll((elements) => {
    const ids = elements.map((element) => element.id).filter(Boolean);
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  });
  expect(
    duplicateIds,
    "Cada etiqueta y destino de foco debe tener un ID único",
  ).toEqual([]);
}

assertRoleMatrixFixtureIsComplete();

for (const scenario of ROLE_MATRIX_SCENARIOS) {
  test(`${scenario.id}: muestra exactamente sus módulos y bloquea acceso directo`, async ({
    page,
  }) => {
    const roleLabelText = ROLE_LABEL_BY_BACKEND_ROLE[scenario.backendRole];
    await prepareSession(page, {
      backendRole: scenario.backendRole,
      frontendRole: FRONTEND_ROLE_BY_BACKEND_ROLE[scenario.backendRole],
      name: `Persona de prueba · ${roleLabelText}`,
      tenantType: scenario.tenantType,
      operationStage: scenario.operationStage,
    });

    await page.goto("/dashboard/profile");
    const actualPaths = await visibleNavigationPaths(page);
    // The mobile dialog hides the underlying page while it is open; landmarks
    // are asserted after navigation when the dialog has been closed.

    // Duplicated or unexpected module links are failures too.
    expect(actualPaths.length).toBe(new Set(actualPaths).size);
    expect([...actualPaths].sort()).toEqual(
      [...scenario.visiblePaths].sort(),
    );
    await expectRoleWorkspace(page, scenario.workspace, roleLabelText);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(new RegExp(`${scenario.defaultPath}$`));
    await expect(page.getByRole("banner")).toBeVisible();
    await expectDashboardLandmarks(page);
    await expect(
      page.getByRole("heading", { name: "Acceso restringido" }),
    ).toHaveCount(0);

    await page.goto(scenario.allowedProbe);
    await expect(page).toHaveURL(new RegExp(`${scenario.allowedProbe}$`));
    await expect(page.getByRole("banner")).toBeVisible();
    await expectDashboardLandmarks(page);
    await expect(
      page.getByRole("heading", { name: "Acceso restringido" }),
    ).toHaveCount(0);

    await page.goto(scenario.forbiddenProbe);
    await expect(page).toHaveURL(new RegExp(`${scenario.forbiddenProbe}$`));
    await expect(
      page.getByRole("heading", { name: "Acceso restringido" }),
    ).toBeVisible();
    await expectDashboardLandmarks(page);
    await expect(page.locator("main")).toContainText(roleLabelText);
    await expect(page.locator("main")).not.toContainText(
      "no está habilitada durante la etapa operativa actual",
    );
  });
}

test("una etapa no habilitada niega el acceso aunque el rol sí esté autorizado", async ({
  page,
}) => {
  await prepareSession(page, {
    backendRole: "ADMIN",
    frontendRole: "AdminCampana",
    name: "Administración",
    tenantType: "CANDIDACY",
    operationStage: "CAMPAIGN",
  });

  await page.goto("/dashboard/war-room");
  await expect(
    page.getByRole("heading", { name: "Esta sección se habilita más adelante" }),
  ).toBeVisible();
  await expectDashboardLandmarks(page);
  await expect(page.locator("main")).toContainText(
    "no está habilitada durante la etapa operativa actual",
  );
  await expect(page.locator("main")).not.toContainText(
    "no tiene permiso para consultar esta sección",
  );
  await expect(
    page.getByRole("link", { name: "Consultar etapas y requisitos" }),
  ).toHaveAttribute("href", "/dashboard/operation-profile");
  await page.getByRole("button", { name: "Volver al panel" }).click();
  await expect(page).toHaveURL(/\/dashboard\/executive$/);
});
