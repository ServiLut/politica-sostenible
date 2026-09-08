import { expect, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "dashboard-not-found-signature",
].join(".");

const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant: {
    id: "tenant-not-found-e2e",
    name: "Campaña verificable",
    slug: "campana-verificable",
    type: "CANDIDACY",
    operationStage: "CAMPAIGN",
  },
  user: {
    id: "admin-not-found-e2e",
    email: "admin@example.test",
    name: "Administración",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};

test("una ruta desconocida del dashboard responde 404 y no simula falta de permisos", async ({
  page,
}) => {
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
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: {
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              role: session.user.backendRole,
              tenant: session.tenant,
            },
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  const response = await page.goto("/dashboard/modulo-que-no-existe");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Página no encontrada" }),
  ).toBeVisible();
  await expect(page.getByText("Acceso restringido")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Ir al panel" }),
  ).toHaveAttribute("href", "/dashboard");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});
