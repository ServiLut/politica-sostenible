import { expect, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "mfa-login-test-signature",
].join(".");

function successful(data: unknown) {
  return JSON.stringify({ statusCode: 200, message: "Success", data });
}

test("completa el desafio MFA con el campo totpCode esperado por la API", async ({
  page,
}) => {
  const loginBodies: Record<string, unknown>[] = [];
  const user = {
    id: "user-with-mfa",
    email: "mfa@example.test",
    name: "Dirección con MFA",
    role: "ADMIN",
    mustChangePassword: false,
    temporaryPasswordExpiresAt: null,
    tenant: {
      id: "tenant-mfa",
      name: "Campaña con MFA",
      slug: "campana-con-mfa",
      type: "CANDIDACY",
      operationStage: "CAMPAIGN",
    },
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/auth/login" && request.method() === "POST") {
      loginBodies.push(request.postDataJSON() as Record<string, unknown>);
      const data =
        loginBodies.length === 1
          ? { requiresMfa: true }
          : { access_token: jwt, user };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful(data),
      });
      return;
    }

    if (pathname === "/api/command-center/briefing") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: successful({ tenant: user.tenant }),
      });
      return;
    }

    await route.fulfill({ status: 503, body: "Unavailable in MFA test" });
  });

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Correo electrónico").fill("MFA@EXAMPLE.TEST");
  await page.getByLabel("Contraseña").fill("clave-segura-2026");
  await page.getByRole("button", { name: "Entrar ahora" }).click();

  await expect(page.getByLabel("Código de autenticación")).toBeVisible();
  await page.getByLabel("Código de autenticación").fill("123456");
  await page.getByRole("button", { name: "Verificar" }).click();

  await expect(page).toHaveURL(/\/dashboard\/executive$/);
  expect(loginBodies).toEqual([
    {
      email: "mfa@example.test",
      password: "clave-segura-2026",
    },
    {
      email: "mfa@example.test",
      password: "clave-segura-2026",
      totpCode: "123456",
    },
  ]);
  expect(loginBodies[1]).not.toHaveProperty("code");
});
