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
    return desktopNavigation(page)
      .getByRole("link")
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      );
  }

  const primaryPaths = await mobileNavigation(page)
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

function workspaceLabel(page: Page, label: string) {
  const labels = page.getByText(`Tu espacio · ${label}`, { exact: true });
  return (page.viewportSize()?.width ?? 1280) < 1024
    ? labels.last()
    : labels.first();
}

function roleLabel(page: Page, label: string) {
  const labels = page.getByText(label, { exact: true });
  return (page.viewportSize()?.width ?? 1280) < 1024
    ? labels.last()
    : labels.first();
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
      name: roleLabelText,
      tenantType: scenario.tenantType,
      operationStage: scenario.operationStage,
    });

    await page.goto("/dashboard/profile");
    const actualPaths = await visibleNavigationPaths(page);

    expect([...new Set(actualPaths)].sort()).toEqual(
      [...scenario.visiblePaths].sort(),
    );
    await expect(workspaceLabel(page, scenario.workspace)).toBeVisible();
    await expect(roleLabel(page, roleLabelText)).toBeVisible();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(new RegExp(`${scenario.defaultPath}$`));
    await expect(page.locator("header")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Acceso restringido" }),
    ).toHaveCount(0);

    await page.goto(scenario.allowedProbe);
    await expect(page).toHaveURL(new RegExp(`${scenario.allowedProbe}$`));
    await expect(page.locator("header")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Acceso restringido" }),
    ).toHaveCount(0);

    await page.goto(scenario.forbiddenProbe);
    await expect(page).toHaveURL(new RegExp(`${scenario.forbiddenProbe}$`));
    await expect(
      page.getByRole("heading", { name: "Acceso restringido" }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText(roleLabelText);
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
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "no está habilitada durante la etapa operativa actual",
  );
  await expect(page.locator("main")).not.toContainText(
    "no tiene permiso para consultar esta sección",
  );
});
