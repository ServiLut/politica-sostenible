import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

type TestRole = "ADMIN" | "COMPLIANCE_OFFICER";

function sessionFor(role: TestRole) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-e2e",
      name: "Organizacion ciudadana",
      slug: "organizacion-ciudadana",
      type: "CANDIDACY",
    },
    user: {
      id: role === "ADMIN" ? "admin-e2e" : "compliance-e2e",
      email: `${role.toLowerCase()}@example.test`,
      name: role === "ADMIN" ? "Administracion" : "Cumplimiento",
      role: role === "ADMIN" ? "AdminCampana" : "Auditor",
      backendRole: role,
    },
  };
}

async function installSession(page: Page, role: TestRole) {
  const session = sessionFor(role);
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: session,
    },
  );
  return session;
}

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

const noticeInput = {
  version: "campaign-2026-09-v1",
  title: "Autorizacion para comunicaciones politicas",
  content:
    "Autorizo de manera previa, expresa e informada el tratamiento de mis datos para las finalidades comunicadas, y conozco como ejercer mis derechos.",
  controllerName: "Organizacion ciudadana responsable",
  contactEmail: "privacidad@example.test",
  privacyPolicyUrl: "https://example.test/privacidad",
};

function currentNoticeContext() {
  return {
    configured: true,
    mode: "CAMPAIGN",
    purpose: "POLITICAL_COMMUNICATION",
    notice: {
      id: "notice-e2e",
      mode: "CAMPAIGN",
      purpose: "POLITICAL_COMMUNICATION",
      ...noticeInput,
      activatedAt: "2026-09-04T12:00:00.000Z",
    },
  };
}

test("administracion activa el aviso del tenant sin enviar tenant, modo ni actor", async ({
  page,
}) => {
  const session = await installSession(page, "ADMIN");
  const mutationBodies: Array<Record<string, unknown>> = [];
  const authorizationHeaders: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (request.method() === "GET" && pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              role: "ADMIN",
              tenant: session.tenant,
            },
          }),
        ),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/consent-notices/current"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            configured: false,
            mode: "CAMPAIGN",
            purpose: "POLITICAL_COMMUNICATION",
            notice: null,
          }),
        ),
      });
      return;
    }

    if (
      request.method() === "PUT" &&
      pathname === "/api/consent-notices/current"
    ) {
      mutationBodies.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(currentNoticeContext())),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/settings");
  await expect(
    page.getByRole("heading", { name: /Aviso de privacidad/ }),
  ).toBeVisible();
  await expect(page.getByText("Sin configurar", { exact: true })).toBeVisible();

  const versionInput = page.getByLabel(/^Versi/);
  await expect(versionInput).not.toHaveAttribute("pattern");
  await versionInput.fill(noticeInput.version);
  await page
    .getByLabel("Responsable del tratamiento")
    .fill(noticeInput.controllerName);
  await page.getByLabel(/^T.tulo$/).fill(noticeInput.title);
  await page.getByLabel(/Texto comunicado/).fill(noticeInput.content);
  await page
    .getByLabel(/Correo para ejercer derechos/)
    .fill(noticeInput.contactEmail);
  const privacyPolicyUrlInput = page.getByLabel(/URL de pol/);
  const activateButton = page.getByRole("button", {
    name: /Activar y exigir esta versi.n/,
  });
  await expect(privacyPolicyUrlInput).toHaveAttribute("pattern", "https://.*");
  await privacyPolicyUrlInput.fill("http://example.test/privacidad");
  await activateButton.click();
  expect(mutationBodies).toHaveLength(0);
  expect(
    await privacyPolicyUrlInput.evaluate(
      (element) => (element as HTMLInputElement).validity.patternMismatch,
    ),
  ).toBe(true);

  await privacyPolicyUrlInput.fill(noticeInput.privacyPolicyUrl);
  await activateButton.click();

  await expect(page.getByRole("status")).toContainText(
    `${noticeInput.version} activo`,
  );
  expect(mutationBodies).toEqual([noticeInput]);
  expect(mutationBodies[0]).not.toHaveProperty("tenantId");
  expect(mutationBodies[0]).not.toHaveProperty("mode");
  expect(mutationBodies[0]).not.toHaveProperty("purpose");
  expect(mutationBodies[0]).not.toHaveProperty("createdById");
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});

test("cumplimiento verifica la version vigente sin controles de escritura", async ({
  page,
}) => {
  const session = await installSession(page, "COMPLIANCE_OFFICER");
  const mutationMethods: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              role: "COMPLIANCE_OFFICER",
              tenant: session.tenant,
            },
          }),
        ),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/consent-notices/current"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(currentNoticeContext())),
      });
      return;
    }

    mutationMethods.push(request.method());
    await route.fulfill({ status: 403, body: "{}" });
  });

  await page.goto("/dashboard/settings");
  await expect(
    page.getByText(new RegExp(`Activo.*${noticeInput.version}`)),
  ).toBeVisible();
  await expect(page.getByText(noticeInput.controllerName)).toBeVisible();
  await expect(
    page.getByText(/Solo Administraci.n puede activar una versi.n nueva/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Activar y exigir esta versi.n/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/^Versi/)).toBeDisabled();
  expect(mutationMethods).toHaveLength(0);
});
