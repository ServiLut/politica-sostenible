import { expect, test, type Page } from "@playwright/test";
import {
  currentTotpCode,
  loadProductionRoleAccounts,
  type ProductionRoleAccount,
} from "./production-role-audit.fixture";

const accounts = loadProductionRoleAccounts();
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

async function installReadOnlyBoundary(page: Page) {
  const blockedMutations: string[] = [];
  const apiFailures: string[] = [];
  const consoleErrors: string[] = [];
  let authenticationOpen = true;
  let forbiddenChecks = false;
  let apiOrigin: string | null = null;
  const webOrigin = new URL(
    process.env.POLITICA_PRODUCTION_ROLE_AUDIT_BASE_URL!,
  ).origin;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    const isApiResponse =
      url.pathname.startsWith("/api/") ||
      (apiOrigin !== null && apiOrigin !== webOrigin && url.origin === apiOrigin);
    if (
      isApiResponse &&
      (response.status() === 401 ||
        response.status() >= 500 ||
        (!forbiddenChecks && response.status() >= 400))
    ) {
      apiFailures.push(`${response.status()} ${url.pathname}`);
    }
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    if (SAFE_METHODS.has(method)) {
      await route.continue();
      return;
    }

    const url = new URL(request.url());
    const isLogin =
      authenticationOpen &&
      method === "POST" &&
      /\/auth\/login$/.test(url.pathname);
    if (isLogin) {
      apiOrigin = url.origin;
      await route.continue();
      return;
    }

    blockedMutations.push(`${method} ${url.pathname}`);
    await route.abort("blockedbyclient");
  });

  return {
    sealAuthentication() {
      authenticationOpen = false;
    },
    beginForbiddenChecks() {
      forbiddenChecks = true;
    },
    assertClean() {
      expect(blockedMutations, "La UI intentó mutar producción").toEqual([]);
      expect(apiFailures, "La API respondió 401 o 5xx").toEqual([]);
      expect(consoleErrors, "La consola del navegador registró errores").toEqual(
        [],
      );
    },
  };
}

async function loginThroughUi(page: Page, account: ProductionRoleAccount) {
  await page.goto("/iniciar-sesion", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Correo electrónico").fill(account.email);
  await page.getByLabel("Contraseña").fill(account.password);
  await page.getByRole("button", { name: "Entrar ahora" }).click();

  const mfaInput = page.getByLabel("Código de autenticación");
  await expect
    .poll(async () => {
      if (/\/dashboard(?:\/|$)/.test(new URL(page.url()).pathname)) {
        return "dashboard";
      }
      return (await mfaInput.isVisible()) ? "mfa" : "pending";
    })
    .not.toBe("pending");
  const outcome = (await mfaInput.isVisible()) ? "mfa" : "dashboard";

  if (outcome === "mfa") {
    if (!account.totpSecret) {
      throw new Error(
        `El rol ${account.role} exige MFA; falta POLITICA_PRODUCTION_ROLE_AUDIT_${account.role}_TOTP_SECRET.`,
      );
    }
    await mfaInput.fill(currentTotpCode(account.totpSecret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
  }
}

async function desktopNavigationPaths(page: Page) {
  await page.goto("/dashboard/profile", { waitUntil: "domcontentloaded" });
  await expect(page.locator("header")).toBeVisible();
  return page
    .getByRole("navigation", { name: "Navegación principal", exact: true })
    .getByRole("link")
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => Boolean(href)),
    );
}

test.describe.configure({ mode: "serial" });

for (const account of accounts) {
  test(`${account.role}: auditoría cliente READ-ONLY`, async ({ page }) => {
    const boundary = await installReadOnlyBoundary(page);
    await loginThroughUi(page, account);
    boundary.sealAuthentication();

    const visiblePaths = [...new Set(await desktopNavigationPaths(page))];
    await expect(page.getByText(account.roleLabel, { exact: true }).first()).toBeVisible();
    expect(visiblePaths).toEqual(expect.arrayContaining(account.requiredPaths));

    for (const path of visiblePaths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator("header")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Acceso restringido" }),
      ).toHaveCount(0);
    }

    boundary.assertClean();
    boundary.beginForbiddenChecks();

    const forbiddenPaths = account.forbiddenPathCandidates.filter(
      (path) => !visiblePaths.includes(path),
    );
    expect(
      forbiddenPaths.length,
      `El rol ${account.role} debe conservar al menos dos prohibiciones verificables`,
    ).toBeGreaterThanOrEqual(2);

    for (const path of forbiddenPaths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole("heading", { name: "Acceso restringido" }),
      ).toBeVisible();
    }

    boundary.assertClean();
  });
}
