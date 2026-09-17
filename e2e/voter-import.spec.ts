import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant: {
    id: "tenant-e2e",
    name: "Campaña importadora",
    slug: "campana-importadora",
    type: "CANDIDACY",
  },
  user: {
    id: "admin-e2e",
    email: "admin@example.test",
    name: "Administración territorial",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};

const notice = {
  id: "notice-e2e",
  mode: "CAMPAIGN",
  purpose: "POLITICAL_COMMUNICATION",
  version: "campaign-2026-09-v3",
  title: "Autorización para comunicaciones políticas",
  content: "Aviso activo verificable.",
  controllerName: "Campaña importadora",
  contactEmail: "privacidad@example.test",
  privacyPolicyUrl: "https://example.test/privacidad",
  activatedAt: "2026-09-06T12:00:00.000Z",
};

const header =
  "Documento,Nombre,Apellido,Teléfono,Correo,Puesto,Mesa,Consentimiento,Version aviso,Fecha consentimiento,Ruta evidencia";
const sourceCsv = [
  header,
  `1012345678,Ana,Pérez,3001234567,ana@example.test,,,SI,${notice.version},2026-09-07T12:00:00.000Z,consentimiento-ana.pdf`,
].join("\n");
const evidenceBytes = Buffer.from("%PDF-1.4 evidencia consentimiento e2e");
const confirmedPath =
  "tenant-e2e/consent/123e4567-e89b-42d3-a456-426614174000.pdf";

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

async function storeSession(page: Page) {
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: session,
    },
  );
}

function votersPage() {
  return {
    items: [],
    pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
  };
}

test("importa con evidencia directa y reutiliza exactamente el CSV validado", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await storeSession(page);
  const apiRequests: Array<{
    method: string;
    pathname: string;
    search: string;
    body?: Record<string, unknown>;
  }> = [];
  const storageUploads: Array<{ method: string; body: Buffer | null }> = [];
  let previewAttempts = 0;

  await page.route("**/storage/v1/object/upload/sign/**", async (route) => {
    storageUploads.push({
      method: route.request().method(),
      body: route.request().postDataBuffer(),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ Key: `private-files/${confirmedPath}` }),
    });
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postData()
      ? (request.postDataJSON() as Record<string, unknown>)
      : undefined;
    apiRequests.push({ method, pathname: url.pathname, search: url.search, body });

    if (url.pathname === "/api/auth/me") {
      await route.fulfill({ status: 503, body: "{}" });
      return;
    }
    if (url.pathname === "/api/billing/capabilities" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            plan: { code: "PRO", name: "Profesional" },
            features: { export: true, import: true, mfa: true },
          }),
        ),
      });
      return;
    }
    if (url.pathname === "/api/consent-notices/current" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            configured: true,
            mode: "CAMPAIGN",
            purpose: "POLITICAL_COMMUNICATION",
            notice,
          }),
        ),
      });
      return;
    }
    if (url.pathname === "/api/voters" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(votersPage())),
      });
      return;
    }
    if (
      url.pathname === "/api/import/personas/template" &&
      method === "GET"
    ) {
      const serverTemplate = [
        header,
        `1234567890,Juan,García,3001234567,juan@ejemplo.com,,,SI,VERSION_AVISO_ACTIVA,2026-09-07T11:00:00.000Z,tenant-e2e/consent/UUID.pdf`,
      ].join("\n");
      await route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: `\uFEFF${serverTemplate}`,
      });
      return;
    }
    if (url.pathname === "/api/storage/upload-url" && method === "POST") {
      expect(body).toEqual({
        module: "consent",
        fileName: "consentimiento-ana.pdf",
        contentType: "application/pdf",
        size: evidenceBytes.length,
      });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              bucket: "private-files",
              path: confirmedPath,
              uploadUrl: `http://127.0.0.1:3000/mock-supabase/storage/v1/object/upload/sign/private-files/${confirmedPath}`,
              uploadToken: "signed-consent-token",
              method: "PUT",
              headers: { "Content-Type": "application/pdf" },
              metadata: {
                fileName: "consentimiento-ana.pdf",
                contentType: "application/pdf",
                size: evidenceBytes.length,
              },
            },
            201,
          ),
        ),
      });
      return;
    }
    if (url.pathname === "/api/storage/complete" && method === "POST") {
      expect(body).toEqual({
        module: "consent",
        path: confirmedPath,
        metadata: {
          fileName: "consentimiento-ana.pdf",
          contentType: "application/pdf",
          size: evidenceBytes.length,
        },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({ confirmed: true, path: confirmedPath, module: "consent" }),
        ),
      });
      return;
    }
    if (url.pathname === "/api/import/personas/preview" && method === "POST") {
      previewAttempts += 1;
      const csv = String(body?.csv);
      expect(Object.keys(body ?? {})).toEqual(["csv"]);
      expect(csv).toContain(confirmedPath);
      expect(csv).not.toContain("consentimiento-ana.pdf");
      if (previewAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 503,
            message: "Error temporal al validar la importación.",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            totalRows: 1,
            validRows: 1,
            errorRows: [],
            duplicatesInFile: 0,
            duplicatesInDatabase: 0,
            preview: [
              {
                documentId: "1012345678",
                firstName: "Ana",
                lastName: "Pérez",
                status: "new",
              },
            ],
          }),
        ),
      });
      return;
    }
    if (url.pathname === "/api/import/personas/execute" && method === "POST") {
      const previewRequest = apiRequests.find(
        (item) => item.pathname === "/api/import/personas/preview",
      );
      expect(Object.keys(body ?? {})).toEqual(["csv"]);
      expect(body?.csv).toBe(previewRequest?.body?.csv);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({ success: true, imported: 1, skipped: 0 }),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: `Ruta no simulada: ${method} ${url.pathname}` }),
    });
  });

  await page.goto("/dashboard/votantes");
  const openButton = page.getByRole("button", { name: "Importar CSV" });
  await expect(openButton).toBeEnabled();
  await openButton.click();

  let dialog = page.getByRole("dialog", {
    name: "Importar personas autorizadas",
  });
  const closeButton = dialog.getByRole("button", {
    name: "Cerrar importación",
  });
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(openButton).toBeFocused();

  await openButton.click();
  dialog = page.getByRole("dialog", {
    name: "Importar personas autorizadas",
  });
  await expect(
    dialog.getByRole("button", { name: "Cerrar importación" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
  const fileInputs = dialog.locator('input[type="file"]');
  await fileInputs.nth(0).setInputFiles({
    name: "personas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sourceCsv, "utf8"),
  });
  await fileInputs.nth(1).setInputFiles({
    name: "consentimiento-ana.pdf",
    mimeType: "application/pdf",
    buffer: evidenceBytes,
  });
  await dialog.getByRole("button", { name: "Subir y validar" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Error temporal al validar la importación.",
  );
  await dialog.getByRole("button", { name: "Subir y validar" }).click();

  await expect(
    dialog.getByRole("region", { name: "Vista previa de importación" }),
  ).toBeVisible();
  await expect(dialog.getByText("Ana Pérez")).toBeVisible();
  await expect(dialog.getByText("••••••5678")).toBeVisible();
  await expect(dialog.getByText("Nueva", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Confirmar e importar" }),
  ).toBeDisabled();

  await dialog
    .getByRole("checkbox", { name: /Confirmo que las 1 persona/u })
    .check();
  await dialog.getByRole("button", { name: "Confirmar e importar" }).click();
  await expect(dialog.getByText("Importación completada")).toBeVisible();
  await expect(dialog.getByText(/1 persona\(s\) importada\(s\)/u)).toBeVisible();

  expect(storageUploads).toHaveLength(1);
  expect(storageUploads[0].method).toBe("PUT");
  expect(storageUploads[0].body?.includes(evidenceBytes)).toBe(true);
  const mutationRequests = apiRequests.filter((item) => item.body !== undefined);
  expect(
    mutationRequests.every(
      (item) =>
        !("tenantId" in (item.body ?? {})) &&
        !("mode" in (item.body ?? {})) &&
        !JSON.stringify(item.body).includes("%PDF-1.4"),
    ),
  ).toBe(true);
  const templateRequest = apiRequests.find(
    (item) => item.pathname === "/api/import/personas/template",
  );
  expect(templateRequest?.search).toBe("");
  expect(templateRequest?.body).toBeUndefined();
  const previewRequests = apiRequests.filter(
    (item) => item.pathname === "/api/import/personas/preview",
  );
  expect(previewRequests).toHaveLength(2);
  expect(previewRequests[1].body?.csv).toBe(previewRequests[0].body?.csv);
  expect(
    apiRequests.filter((item) => item.pathname === "/api/storage/upload-url"),
  ).toHaveLength(1);
});

test("el plan sin importación queda bloqueado antes de cualquier mutación", async ({
  page,
}) => {
  await storeSession(page);
  const mutations: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") mutations.push(url.pathname);

    if (url.pathname === "/api/auth/me") {
      await route.fulfill({ status: 503, body: "{}" });
      return;
    }
    if (url.pathname === "/api/billing/capabilities") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            plan: { code: "BASIC", name: "Básico" },
            features: { export: false, import: false, mfa: false },
          }),
        ),
      });
      return;
    }
    if (url.pathname === "/api/consent-notices/current") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            configured: true,
            mode: "CAMPAIGN",
            purpose: "POLITICAL_COMMUNICATION",
            notice,
          }),
        ),
      });
      return;
    }
    if (url.pathname === "/api/voters") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(votersPage())),
      });
      return;
    }
    if (url.pathname === "/api/import/personas/template") {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 403,
          message: "El plan actual no incluye la importación de datos.",
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/votantes");
  const unavailable = page.getByRole("button", {
    name: "Tu plan no incluye importación",
  });
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toBeDisabled();
  expect(mutations).toEqual([]);
});
