import { expect, test } from "@playwright/test";

function policyEnvelope(
  enabled: boolean,
  termsVersion: string = "registro-2026.9",
) {
  return JSON.stringify({
    statusCode: 200,
    message: "Success",
    data: {
      enabled,
      invitationAcceptanceEnabled: true,
      mode: enabled ? "SELF_SERVICE" : "CONTROLLED_ACCESS",
      message: enabled
        ? "El registro publico de organizaciones esta habilitado."
        : "El registro publico esta cerrado. Solicita una invitacion a la administracion de la plataforma.",
      termsVersion,
    },
  });
}

test("no expone el formulario cuando produccion declara acceso controlado", async ({
  page,
}) => {
  await page.route("**/api/auth/registration-policy", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: policyEnvelope(false),
    }),
  );

  await page.goto("/registro");

  await expect(
    page.getByRole("heading", { name: "Registro controlado" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Empezar ahora" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Iniciar sesión" }),
  ).toBeVisible();
});

test("muestra el formulario exclusivamente cuando la API lo habilita", async ({
  page,
}) => {
  await page.route("**/api/auth/registration-policy", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: policyEnvelope(true),
    }),
  );

  await page.goto("/registro");

  await expect(
    page.getByRole("heading", { name: "Crea tu organización" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nombre de la organización")).toBeVisible();
  await page.getByLabel("Nombre de la organización").fill("Concejo abierto");
  await page.getByLabel("Nombre", { exact: true }).fill("Ana");
  await page.getByLabel("Apellido", { exact: true }).fill("Pérez");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("link", { name: /términos versión/ })).toHaveText(
    "términos versión registro-2026.9",
  );
});

test("falla cerrado cuando la API habilita registro sin una versión legal válida", async ({
  page,
}) => {
  await page.route("**/api/auth/registration-policy", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: policyEnvelope(true, "version con espacios"),
    }),
  );

  await page.goto("/registro");

  await expect(
    page.getByText("Por seguridad, el registro permanece cerrado."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Empezar ahora" })).toHaveCount(
    0,
  );
});

test("falla cerrado y permite reintentar si no puede verificar la politica", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/auth/registration-policy", (route) => {
    attempts += 1;
    if (attempts === 1) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Servicio no disponible" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: policyEnvelope(true),
    });
  });

  await page.goto("/registro");

  await expect(
    page.getByText("Por seguridad, el registro permanece cerrado."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reintentar verificación" }).click();
  await expect(
    page.getByRole("heading", { name: "Crea tu organización" }),
  ).toBeVisible();
});
