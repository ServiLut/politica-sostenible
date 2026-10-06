import { expect, test, type Page } from "@playwright/test";
import type { VoterImportJob } from "../apps/web/lib/import-api";

// Interface tests with simulated HTTP/Storage. These do not prove a real worker,
// real authorization or persistence in PostgreSQL; those have separate tests.
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
    name: "PRUEBA importación",
    slug: "prueba-importacion",
    type: "CANDIDACY",
  },
  user: {
    id: "admin-e2e",
    email: "admin@example.test",
    name: "Administración QA",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};
const notice = {
  id: "notice-e2e",
  mode: "CAMPAIGN",
  purpose: "POLITICAL_COMMUNICATION",
  version: "prueba-v1",
  title: "Aviso de prueba",
  content: "SIMULACIÓN sin validez",
  controllerName: "PRUEBA",
  contactEmail: "privacidad@example.test",
  privacyPolicyUrl: "https://example.test/privacidad",
  activatedAt: "2026-09-06T12:00:00.000Z",
};
const requiredHeaders = [
  "Documento",
  "Nombre",
  "Apellido",
  "Consentimiento",
  "Version aviso",
  "Fecha consentimiento",
  "Ruta evidencia",
];
const header = requiredHeaders.join(";");
const sourceCsv = `${header}\n1012345678;Ana;Prueba;SI;prueba-v1;2026-09-07T12:00:00.000Z;ana.pdf\n1098765432;Luis;Prueba;;prueba-v1;2026-09-07T12:00:00.000Z;falta.pdf`;
const consentPath =
  "tenant-e2e/consent/123e4567-e89b-42d3-a456-426614174000.pdf";
const csvPath =
  "tenant-e2e/person-import/223e4567-e89b-42d3-a456-426614174000.csv";
const jobId = "c1111111111111111111111111";
const pageOf = <T>(items: T[]) => ({
  items,
  pagination: {
    page: 1,
    limit: 10,
    total: items.length,
    totalPages: items.length ? 1 : 0,
  },
});
const jobBase: VoterImportJob = {
  id: jobId,
  fileName: "personas.csv",
  status: "READY",
  totalRows: 2,
  validRows: 1,
  errorRows: 1,
  skippedRows: 0,
  importedRows: 0,
  attempts: 1,
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-10-06T00:00:00.000Z",
  completedAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  canExecute: true,
  canRetry: false,
  progress: { phase: "validation", processed: 2, total: 2 },
};

async function storeSession(page: Page) {
  await page.addInitScript(
    (authSession) =>
      window.sessionStorage.setItem(
        "politica-sostenible.auth-session",
        JSON.stringify(authSession),
      ),
    session,
  );
}

async function mockApplication(page: Page, importEnabled = true) {
  const mutations: Array<{
    path: string;
    body: Record<string, unknown> | undefined;
  }> = [];
  const uploads: Array<{ path: string; method: string; bytes: Buffer | null }> =
    [];
  const creates: Array<Record<string, unknown>> = [];
  let job: VoterImportJob | null = null;
  let queuedReads = 0;
  let createAttempts = 0;
  const importReads: string[] = [];
  await page.route("**/storage/v1/object/upload/sign/**", async (route) => {
    uploads.push({
      path: new URL(route.request().url()).pathname,
      method: route.request().method(),
      bytes: route.request().postDataBuffer(),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ Key: "private-files/confirmed" }),
    });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postData()
      ? (request.postDataJSON() as Record<string, unknown>)
      : undefined;
    const respond = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: status, data }),
      });
    if (method !== "GET") mutations.push({ path: url.pathname, body });
    if (url.pathname.startsWith("/api/import/")) importReads.push(url.pathname);
    if (url.pathname === "/api/auth/me")
      return route.fulfill({ status: 503, body: "{}" });
    if (url.pathname === "/api/billing/capabilities")
      return respond({
        plan: { code: importEnabled ? "PRO" : "BASIC", name: "Plan QA" },
        features: { export: false, import: importEnabled, mfa: true },
      });
    if (url.pathname === "/api/consent-notices/current")
      return respond({
        configured: true,
        mode: "CAMPAIGN",
        purpose: "POLITICAL_COMMUNICATION",
        notice,
      });
    if (url.pathname === "/api/voters") return respond(pageOf([]));
    if (url.pathname === "/api/import/personas/options")
      return respond({
        limits: { maxRows: 50_000, maxBytes: 20 * 1024 * 1024 },
        notice,
        requiredHeaders,
        optionalHeaders: ["Teléfono", "Correo", "Puesto", "Mesa"],
      });
    if (url.pathname === "/api/storage/upload-url") {
      expect(body?.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
      const module = body?.module;
      expect(["consent", "person-import"]).toContain(module);
      const path = module === "consent" ? consentPath : csvPath;
      return respond(
        {
          bucket: "private-files",
          path,
          uploadUrl: `http://127.0.0.1:3000/mock-supabase/storage/v1/object/upload/sign/private-files/${path}`,
          uploadToken: "test-only-upload-token",
          method: "PUT",
          headers: { "Content-Type": body?.contentType },
          metadata: {
            fileName: body?.fileName,
            contentType: body?.contentType,
            size: body?.size,
            contentSha256: body?.contentSha256,
          },
        },
        201,
      );
    }
    if (url.pathname === "/api/storage/complete")
      return respond({
        confirmed: true,
        objectId: "c2222222222222222222222222",
        path: body?.path,
        module: body?.module,
        contentIntegrity: "VERIFIED",
      });
    if (url.pathname === "/api/import/personas/jobs" && method === "POST") {
      creates.push(body!);
      expect(Object.keys(body!).sort()).toEqual([
        "clientRequestId",
        "expectedContentSha256",
        "fileName",
        "sourceArtifactPath",
      ]);
      expect(body?.sourceArtifactPath).toBe(csvPath);
      job = { ...jobBase };
      if (++createAttempts === 1)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Respuesta temporalmente no disponible",
          }),
        });
      return respond(job);
    }
    if (url.pathname === "/api/import/personas/jobs" && method === "GET")
      return respond(pageOf(job ? [job] : []));
    if (url.pathname === `/api/import/personas/jobs/${jobId}`) {
      if (job?.status === "IMPORT_QUEUED" && ++queuedReads >= 2)
        job = {
          ...job,
          status: "COMPLETED",
          validRows: 0,
          importedRows: 1,
          canExecute: false,
          completedAt: "2026-10-06T00:01:00Z",
          progress: { phase: "complete", processed: 2, total: 2 },
        };
      return respond(job);
    }
    if (url.pathname === `/api/import/personas/jobs/${jobId}/errors`)
      return respond({
        items: [
          {
            row: 3,
            errors: [
              {
                field: "Consentimiento",
                message: "Se requiere autorización expresa",
              },
              { field: "Ruta evidencia", message: "Falta evidencia válida" },
            ],
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    if (url.pathname === `/api/import/personas/jobs/${jobId}/errors.csv`)
      return route.fulfill({
        status: 200,
        contentType: "text/csv",
        body: `\uFEFF${header};Fila;Motivo\n1098765432;Luis;Prueba;;prueba-v1;2026-09-07T12:00:00Z;falta.pdf;3;Falta autorización\n`,
      });
    if (url.pathname === `/api/import/personas/jobs/${jobId}/execute`) {
      expect(method).toBe("POST");
      expect(body).toBeUndefined();
      job = {
        ...job!,
        status: "IMPORT_QUEUED",
        canExecute: false,
        progress: { phase: "import", processed: 1, total: 2 },
      };
      return respond(job);
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "Ruta no simulada" }),
    });
  });
  return { mutations, uploads, creates, importReads };
}

test("interfaz simulada: recupera respuesta perdida, revisa errores y retoma tras volver a la página", async ({
  page,
}) => {
  await storeSession(page);
  const observed = await mockApplication(page);
  await page.goto("/dashboard/votantes");
  const open = page.getByRole("button", {
    name: "Importar personas",
    exact: true,
  });
  await expect(open).toBeEnabled();
  expect(observed.importReads).toEqual([]);
  await open.click();
  let dialog = page.getByRole("dialog", {
    name: "Importar personas",
    exact: true,
  });
  await expect(
    dialog.getByRole("heading", { name: "Importar personas", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  dialog = page.getByRole("dialog", { name: "Importar personas", exact: true });
  await dialog
    .getByLabel("Archivo de personas (.csv)")
    .setInputFiles({
      name: "personas.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(sourceCsv),
    });
  await dialog
    .getByLabel("Adjuntar evidencias nuevas (opcional)")
    .setInputFiles({
      name: "ana.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 PRUEBA sin validez"),
    });
  await dialog
    .getByRole("button", { name: "Revisar archivo", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Respuesta temporalmente no disponible",
  );
  await dialog.getByRole("button", { name: "Recuperar revisión" }).click();
  await expect(
    dialog.getByRole("region", { name: "Revisión de la importación" }),
  ).toBeVisible();
  await expect(dialog.getByText("Fila 3", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("Filas con errores", { exact: true }),
  ).toBeVisible();
  expect(observed.creates).toHaveLength(2);
  expect(observed.creates[0]).toEqual(observed.creates[1]);
  expect(observed.uploads).toHaveLength(2);
  expect(observed.uploads.every((upload) => upload.method === "PUT")).toBe(
    true,
  );
  expect(observed.uploads[1].bytes?.includes(Buffer.from(consentPath))).toBe(
    true,
  );
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Descargar filas con errores" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "personas_por_corregir.csv",
  );
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Importar sólo 1 persona lista" })
    .click();
  await expect(
    dialog.getByText("En espera para importar", { exact: true }).first(),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar y volver después" }).click();
  await page.reload();
  await open.click();
  await page.getByRole("button", { name: "Ver resultado" }).click();
  await expect(
    page.getByText("Importación terminada", { exact: true }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Se guardó 1 persona.", { exact: false }),
  ).toBeVisible();
  expect(
    observed.mutations.filter((request) => request.path.endsWith("/execute")),
  ).toHaveLength(1);
  expect(
    observed.mutations.every(
      ({ body }) =>
        !body ||
        (!("tenantId" in body) && !("mode" in body) && !("csv" in body)),
    ),
  ).toBe(true);
});

test("interfaz simulada: plan sin importación no dispara lecturas ni escrituras del asistente", async ({
  page,
}) => {
  await storeSession(page);
  const observed = await mockApplication(page, false);
  await page.goto("/dashboard/votantes");
  const button = page.getByRole("button", {
    name: "Importar personas",
    exact: true,
  });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute(
    "title",
    "Tu plan no incluye importación",
  );
  expect(observed.importReads).toEqual([]);
  expect(observed.mutations).toEqual([]);
});
