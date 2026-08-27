import { expect, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

test("la portada comunica capacidades verificables y enlaza las políticas", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { name: "Política Sostenible" }),
  ).toBeVisible();
  await expect(
    page.getByText("Campaña y ejercicio del cargo separados"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Iniciar sesión" }),
  ).toHaveAttribute("href", "/iniciar-sesion");

  await page.getByRole("link", { name: "Privacidad" }).click();
  await expect(page).toHaveURL(/\/privacidad$/);
  await expect(
    page.getByRole("heading", { name: /privacidad electoral por diseño/i }),
  ).toBeVisible();
});

test("el panel redirige a una persona no autenticada", async ({ page }) => {
  await page.goto("/dashboard/executive");
  await expect(page).toHaveURL(
    /\/iniciar-sesion\?next=%2Fdashboard%2Fexecutive$/,
  );
  await expect(
    page.getByRole("heading", { name: "Hola de nuevo" }),
  ).toBeVisible();
});

test("las rutas públicas de demostración quedaron fuera de producción", async ({
  page,
}) => {
  await page.goto("/crm-demo");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Política Sostenible" }),
  ).toBeVisible();
});

test("el registro crea el tipo de organización y evidencia términos versionados", async ({
  page,
}) => {
  let registrationPayload: Record<string, unknown> | null = null;
  await page.route("**/api/auth/register", async (route) => {
    registrationPayload = route.request().postDataJSON() as Record<
      string,
      unknown
    >;
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({
        statusCode: 201,
        message: "Success",
        data: {
          message: "Usuario y organización registrados exitosamente",
          tenantId: "tenant-e2e",
          userId: "user-e2e",
        },
      }),
    });
  });

  await page.goto("/registro");
  await page.getByLabel("Nombre de la organización").fill("Concejo abierto");
  await page.getByLabel("Tipo de operación").selectOption("PUBLIC_OFFICE");
  await page.getByLabel("Nombre", { exact: true }).fill("Ana");
  await page.getByLabel("Apellido", { exact: true }).fill("Pérez");
  await page.getByLabel("Número de documento").fill("1012345678");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Email Corporativo").fill("ana@example.test");
  await page.getByLabel("Password").fill("clave-segura-2026");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Empezar ahora" }).click();

  await expect(
    page.getByRole("heading", { name: "Organización creada" }),
  ).toBeVisible();
  expect(registrationPayload).toMatchObject({
    email: "ana@example.test",
    name: "Ana Pérez",
    organizationName: "Concejo abierto",
    organizationType: "PUBLIC_OFFICE",
    termsAccepted: true,
    termsVersion: "2026.1",
  });
  expect(registrationPayload).not.toHaveProperty("tenantId");
});

test("el inicio de sesión conserva el contrato y envía Bearer a la API", async ({
  page,
}) => {
  const authorizationHeaders: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/auth/login") {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: {
            access_token: jwt,
            user: {
              id: "user-e2e",
              email: "direccion@example.test",
              name: "Dirección de campaña",
              role: "ADMIN",
              tenant: {
                id: "tenant-e2e",
                name: "Campaña verificable",
                slug: "campana-verificable",
                type: "CANDIDACY",
              },
            },
          },
        }),
      });
      return;
    }

    authorizationHeaders.push(request.headers().authorization ?? "");
    const dataByPath: Record<string, unknown> = {
      "/api/voters/stats": { total: 3, signatures: 2, consented: 3 },
      "/api/finance/summary": {
        totalExpenses: 100_000,
        totalIncome: 500_000,
        balance: 400_000,
      },
      "/api/finance": [],
      "/api/witnesses": [],
    };

    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        statusCode: 200,
        message: "Success",
        data: dataByPath[pathname] ?? [],
      }),
    });
  });

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Email").fill("direccion@example.test");
  await page.getByLabel("Password").fill("una-clave-de-prueba");
  await page.getByRole("button", { name: "Entrar ahora" }).click();

  await expect(page).toHaveURL(/\/dashboard\/executive$/);
  await expect(
    page.getByRole("heading", { name: "Campaña verificable" }),
  ).toBeVisible();
  await expect(page.getByText("3 registros totales")).toBeVisible();
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(4);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});
