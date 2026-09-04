import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

type CaptureRole = "VOLUNTEER" | "ZONE_COORDINATOR";

const consentNotice = {
  id: "notice-e2e",
  mode: "CAMPAIGN",
  purpose: "POLITICAL_COMMUNICATION",
  version: "campaign-2026-09-v1",
  title: "AutorizaciÃ³n de tratamiento de datos",
  content:
    "La persona autoriza de forma previa, expresa e informada el tratamiento para comunicaciones polÃ­ticas.",
  controllerName: "CampaÃ±a territorial",
  contactEmail: "privacidad@example.test",
  privacyPolicyUrl: null,
  activatedAt: "2026-09-04T12:00:00.000Z",
};

function sessionFor(role: CaptureRole) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-e2e",
      name: "Campaña territorial",
      slug: "campana-territorial",
      type: "CANDIDACY",
    },
    user: {
      id: role === "VOLUNTEER" ? "volunteer-e2e" : "coordinator-e2e",
      email: `${role.toLowerCase()}@example.test`,
      name: role === "VOLUNTEER" ? "Voluntaria de campo" : "Coordinador zonal",
      role: role === "VOLUNTEER" ? "Voluntario" : "Coordinador",
      backendRole: role,
    },
  };
}

async function installSession(page: Page, role: CaptureRole) {
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor(role),
    },
  );
}

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

async function mockCaptureApi(
  page: Page,
  puestos: Array<{ id: string; code: string; name: string }>,
) {
  const posts: Array<Record<string, unknown>> = [];
  const authorizationHeaders: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (
      url.pathname === "/api/voters/capture-context" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful({ puestos, consentNotice })),
      });
      return;
    }

    if (url.pathname === "/api/voters" && request.method() === "POST") {
      posts.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful({ received: true }, 201)),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ statusCode: 404, message: "Unexpected request" }),
    });
  });

  return { posts, authorizationHeaders };
}

async function fillCitizenData(page: Page, documentId: string) {
  await page.getByLabel("Nombres", { exact: true }).fill("Laura");
  await page.getByLabel("Apellidos", { exact: true }).fill("Méndez");
  await page.getByLabel("Documento", { exact: true }).fill(documentId);
  await page.getByLabel("Celular opcional", { exact: true }).fill("3204447788");
  await page
    .getByLabel("Correo opcional", { exact: true })
    .fill("laura@example.test");
  await page.getByLabel("Mesa opcional", { exact: true }).fill("12");
  await page
    .getByRole("combobox", { name: /Canal real de la autorizaci/ })
    .selectOption("IN_PERSON");
  await page.getByRole("checkbox").check();
}

test("voluntariado captura únicamente en los puestos devueltos por su alcance", async ({
  page,
}) => {
  await installSession(page, "VOLUNTEER");
  const { posts, authorizationHeaders } = await mockCaptureApi(page, [
    { id: "puesto-a", code: "P-01", name: "Colegio Central" },
    { id: "puesto-b", code: "P-02", name: "Escuela Norte" },
  ]);

  await page.goto("/dashboard/captura-territorial");

  await expect(
    page.getByRole("heading", { name: "Vinculación en territorio" }),
  ).toBeVisible();
  expect(
    await page.locator('a[href="/dashboard/captura-territorial"]').count(),
  ).toBeGreaterThan(0);

  const puestoSelect = page.getByRole("combobox", {
    name: /^Puesto habilitado/,
  });
  await expect(puestoSelect).toBeVisible();
  await expect(puestoSelect.locator("option")).toHaveCount(3);
  await expect(puestoSelect.locator('option[value="puesto-a"]')).toHaveText(
    "Colegio Central · P-01",
  );
  await expect(puestoSelect.locator('option[value="puesto-b"]')).toHaveText(
    "Escuela Norte · P-02",
  );
  await expect(
    puestoSelect.locator('option[value="puesto-outside"]'),
  ).toHaveCount(0);

  await fillCitizenData(page, "1098765432");

  // Incluso si alguien altera el DOM local, el formulario compara de nuevo
  // contra el contexto autorizado devuelto por la API y no emite la mutación.
  await puestoSelect.evaluate((element) => {
    const option = document.createElement("option");
    option.value = "puesto-outside";
    option.textContent = "Puesto fuera de alcance";
    element.append(option);
    (element as HTMLSelectElement).value = option.value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Guardar con trazabilidad" }).click();
  await expect(
    page.getByText(
      "Selecciona un puesto habilitado dentro de tu asignación territorial.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(posts).toHaveLength(0);

  await puestoSelect.selectOption("puesto-b");
  await page.getByRole("button", { name: "Guardar con trazabilidad" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Solicitud recibida y procesada con trazabilidad",
  );
  expect(posts).toHaveLength(1);
  expect(posts[0]).toEqual({
    documentId: "1098765432",
    firstName: "Laura",
    lastName: "Méndez",
    puestoId: "puesto-b",
    consentAccepted: true,
    termsVersion: consentNotice.version,
    collectionChannel: "IN_PERSON",
    phone: "3204447788",
    email: "laura@example.test",
    mesa: 12,
  });
  expect(posts[0]).not.toHaveProperty("tenantId");
  expect(posts[0]).not.toHaveProperty("registrarId");
  await expect(page.getByLabel("Documento", { exact: true })).toHaveValue("");
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});

test("coordinación territorial usa automáticamente su único puesto asignado", async ({
  page,
}) => {
  await installSession(page, "ZONE_COORDINATOR");
  const { posts } = await mockCaptureApi(page, [
    { id: "puesto-central", code: "P-10", name: "Puesto Central" },
  ]);

  await page.goto("/dashboard/captura-territorial");

  await expect(
    page.getByRole("heading", { name: "Vinculación en territorio" }),
  ).toBeVisible();
  await expect(page.getByText("Puesto Central", { exact: true })).toBeVisible();
  await expect(page.getByText(/selección automática/i)).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /^Puesto habilitado/ }),
  ).toHaveCount(0);

  await fillCitizenData(page, "1012345678");
  await page.getByRole("button", { name: "Guardar con trazabilidad" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Solicitud recibida y procesada con trazabilidad",
  );
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    documentId: "1012345678",
    puestoId: "puesto-central",
    consentAccepted: true,
  });
  expect(posts[0]).not.toHaveProperty("tenantId");
});

test("una recarga con otro aviso invalida la confirmación y el canal anteriores", async ({
  page,
}) => {
  await installSession(page, "ZONE_COORDINATOR");
  const updatedNotice = {
    ...consentNotice,
    id: "notice-e2e-v2",
    version: "campaign-2026-09-v2",
    title: "Autorización actualizada de tratamiento de datos",
  };
  const posts: Array<Record<string, unknown>> = [];
  let contextReads = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (
      url.pathname === "/api/voters/capture-context" &&
      request.method() === "GET"
    ) {
      contextReads += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            puestos: [
              { id: "puesto-central", code: "P-10", name: "Puesto Central" },
            ],
            consentNotice: contextReads === 1 ? consentNotice : updatedNotice,
          }),
        ),
      });
      return;
    }

    if (url.pathname === "/api/voters" && request.method() === "POST") {
      posts.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful({ received: true }, 201)),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/captura-territorial");
  await fillCitizenData(page, "1012345678");

  const channel = page.getByRole("combobox", {
    name: /Canal real de la autorizaci/,
  });
  const confirmation = page.getByRole("checkbox");
  const submit = page.getByRole("button", {
    name: "Guardar con trazabilidad",
  });
  await expect(submit).toBeEnabled();

  await page
    .getByRole("button", { name: /Actualizar asignaci/ })
    .click();
  await expect(page.getByText(new RegExp(updatedNotice.version))).toBeVisible();
  await expect(channel).toHaveValue("");
  await expect(confirmation).not.toBeChecked();
  await expect(submit).toBeDisabled();
  expect(posts).toHaveLength(0);

  await channel.selectOption("PHONE");
  await confirmation.check();
  await submit.click();

  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    termsVersion: updatedNotice.version,
    collectionChannel: "PHONE",
    consentAccepted: true,
  });
});

test("una captura repetida recibe un resultado indistinguible y no enumera personas", async ({
  page,
}) => {
  await installSession(page, "VOLUNTEER");
  let postCount = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (
      url.pathname === "/api/voters/capture-context" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            puestos: [
              {
                id: "puesto-central",
                code: "P-10",
                name: "Puesto Central",
              },
            ],
            consentNotice,
          }),
        ),
      });
      return;
    }

    if (url.pathname === "/api/voters" && request.method() === "POST") {
      postCount += 1;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful({ received: true })),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/captura-territorial");
  await fillCitizenData(page, "1012345678");
  await page.getByRole("button", { name: "Guardar con trazabilidad" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Solicitud recibida y procesada con trazabilidad",
  );
  await expect(page.getByLabel("Documento", { exact: true })).toHaveValue("");
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  expect(postCount).toBe(1);
});
