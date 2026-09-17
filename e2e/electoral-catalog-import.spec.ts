import { createHash } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "catalog-import-signature",
].join(".");
const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant: {
    id: "tenant-catalog-import-e2e",
    name: "Campaña Ingesta Verificable",
    slug: "ingesta-verificable",
    type: "CANDIDACY" as const,
    operationStage: "ELECTION_PREPARATION" as const,
  },
  user: {
    id: "admin-catalog-import-e2e",
    email: "admin@example.test",
    name: "Administración",
    role: "AdminCampana" as const,
    backendRole: "ADMIN" as const,
  },
};
const artifactPath =
  "tenant-catalog-import-e2e/electoral-catalog/7c8f80d8-66c5-4f3a-9745-b66219c13f74.json";
const artifactContent = JSON.stringify({ version: 1, entries: [] });
const artifactSha256 = createHash("sha256")
  .update(artifactContent)
  .digest("hex");

function job(status: "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED") {
  return {
    id: "import-job-1",
    tenantId: session.tenant.id,
    clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    status,
    catalogKey: "PRESIDENCIA_2026",
    sourceUrl: "https://www.registraduria.gov.co/fuente.json",
    sourceDataset: "DIVIPOLE Presidencia 2026",
    sourceCutoffAt: "2026-05-01T15:00:00.000Z",
    electionDate: "2026-05-31T00:00:00.000Z",
    authorizationReference: "RNEC-AUT-2026-001",
    licenseDeclaration: "Uso interno autorizado por escrito",
    sourceArtifactPath: artifactPath,
    expectedContentSha256: artifactSha256,
    requestedById: session.user.id,
    releaseId: status === "SUCCEEDED" ? "release-rnec-2026" : null,
    attempts: status === "QUEUED" ? 0 : 1,
    startedAt:
      status === "PROCESSING" || status === "SUCCEEDED"
        ? "2026-09-09T14:00:00.000Z"
        : null,
    completedAt:
      status === "SUCCEEDED" || status === "FAILED"
        ? "2026-09-09T14:01:00.000Z"
        : null,
    lastErrorCode: status === "FAILED" ? "HTTP_400" : null,
    lastErrorMessage:
      status === "FAILED"
        ? "El JSON no contiene la jerarquía RNEC esperada."
        : null,
    createdAt: "2026-09-09T13:59:00.000Z",
    updatedAt: "2026-09-09T14:01:00.000Z",
  };
}

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(successful(data, status)),
  });
}

async function installSession(page: Page) {
  await page.addInitScript(
    ({ storageKey, value }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      value: session,
    },
  );
}

async function fulfillAuth(route: Route) {
  await fulfill(route, {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.backendRole,
      tenant: session.tenant,
    },
  });
}

test("Administración calcula la huella, hace PUT directo y sigue el trabajo hasta preparar el snapshot", async ({
  page,
}) => {
  await installSession(page);
  let created = false;
  let detailCalls = 0;
  let uploadCalls = 0;
  let uploadedMethod = "";
  let uploadedContentType = "";
  let uploadedBody = "";
  const importPayloads: Record<string, unknown>[] = [];

  await page.route("**/mock-storage/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "PUT, OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
        },
      });
      return;
    }
    uploadCalls += 1;
    uploadedMethod = request.method();
    uploadedContentType = request.headers()["content-type"] ?? "";
    uploadedBody = request.postDataBuffer()?.toString("utf8") ?? "";
    await route.fulfill({
      status: 200,
      body: "",
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/me") {
      await fulfillAuth(route);
      return;
    }
    if (url.pathname === "/api/electoral-catalog/releases") {
      await fulfill(route, []);
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/imports" &&
      request.method() === "GET"
    ) {
      const status =
        detailCalls >= 3
          ? "SUCCEEDED"
          : detailCalls >= 2
            ? "PROCESSING"
            : "QUEUED";
      await fulfill(route, created ? [job(status)] : []);
      return;
    }
    if (
      url.pathname === "/api/storage/upload-url" &&
      request.method() === "POST"
    ) {
      const body = JSON.parse(request.postData() ?? "{}") as {
        fileName: string;
        contentType: string;
        size: number;
        module: string;
      };
      expect(body).toEqual({
        module: "electoral-catalog",
        fileName: "rnec.json",
        contentType: "application/json",
        size: Buffer.byteLength(artifactContent),
      });
      await fulfill(
        route,
        {
          bucket: "private-files",
          path: artifactPath,
          uploadUrl:
            "http://127.0.0.1:3000/mock-storage/signed-upload?redacted=true",
          uploadToken: "temporary-upload-token",
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          metadata: {
            fileName: body.fileName,
            contentType: body.contentType,
            size: body.size,
          },
        },
        201,
      );
      return;
    }
    if (
      url.pathname === "/api/storage/complete" &&
      request.method() === "POST"
    ) {
      expect(JSON.parse(request.postData() ?? "{}")).toEqual({
        module: "electoral-catalog",
        path: artifactPath,
        metadata: {
          fileName: "rnec.json",
          contentType: "application/json",
          size: Buffer.byteLength(artifactContent),
        },
      });
      await fulfill(route, {
        confirmed: true,
        path: artifactPath,
        module: "electoral-catalog",
      });
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/imports" &&
      request.method() === "POST"
    ) {
      importPayloads.push(JSON.parse(request.postData() ?? "{}"));
      if (importPayloads.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 503,
            message: "El procesador no está disponible temporalmente.",
          }),
        });
        return;
      }
      created = true;
      await fulfill(
        route,
        { job: job("QUEUED"), created: true, queued: true },
        202,
      );
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/imports/import-job-1" &&
      request.method() === "GET"
    ) {
      detailCalls += 1;
      const status =
        detailCalls >= 3
          ? "SUCCEEDED"
          : detailCalls === 2
            ? "PROCESSING"
            : "QUEUED";
      await fulfill(route, job(status));
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/electoral-catalog");
  await page.getByLabel("Artefacto JSON").setInputFiles({
    name: "rnec.json",
    // Algunos navegadores no infieren el MIME de un archivo local .json.
    mimeType: "",
    buffer: Buffer.from(artifactContent),
  });
  await page.getByLabel("Clave de catálogo").fill("presidencia_2026");
  await page
    .getByLabel("Nombre exacto del dataset")
    .fill("DIVIPOLE Presidencia 2026");
  await page
    .getByLabel("URL HTTPS declarada de RNEC")
    .fill("https://www.registraduria.gov.co/fuente.json");
  await page.getByLabel("Fecha electoral", { exact: true }).fill("2026-05-31");
  await page
    .getByLabel("Fecha y hora de corte", { exact: true })
    .fill("2026-05-01T10:00");
  await page
    .getByLabel("Referencia de autorización escrita")
    .fill("RNEC-AUT-2026-001");
  await page
    .getByLabel("Declaración de licencia y alcance")
    .fill("Uso interno autorizado por escrito");
  await page.getByRole("checkbox").check();
  await page
    .getByLabel("Escribe exactamente: INGESTAR RNEC")
    .fill("INGESTAR RNEC");
  await page.getByRole("button", { name: "Subir y encolar ingesta" }).click();

  await expect(
    page.getByText(/El procesador no está disponible temporalmente/),
  ).toBeVisible();
  await expect(
    page.getByText(/El archivo ya fue confirmado en Storage/),
  ).toBeVisible();
  expect(uploadCalls).toBe(1);
  await page
    .getByRole("button", { name: "Reenviar solicitud durable" })
    .click();

  await expect(
    page.getByText(/Ingesta registrada y enviada al procesador/),
  ).toBeVisible();
  expect(uploadCalls).toBe(1);
  expect(uploadedMethod).toBe("PUT");
  expect(uploadedContentType).toContain("application/json");
  expect(uploadedBody).toBe(artifactContent);
  expect(importPayloads).toHaveLength(2);
  expect(importPayloads[0]).toEqual(importPayloads[1]);
  expect(importPayloads[1]).toMatchObject({
    catalogKey: "PRESIDENCIA_2026",
    sourceArtifactPath: artifactPath,
    expectedContentSha256: artifactSha256,
  });
  expect(importPayloads[1]).not.toHaveProperty("tenantId");
  expect(importPayloads[1]).not.toHaveProperty("uploadUrl");
  expect(importPayloads[1]).not.toHaveProperty("uploadToken");
  expect(String(importPayloads[1].clientRequestId)).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );

  await expect(
    page
      .locator("span")
      .filter({ hasText: /^Snapshot preparado$/ })
      .first(),
  ).toBeVisible({ timeout: 14_000 });
  await expect(
    page.getByText(/Aún debe revisarse, validarse y activarse/),
  ).toBeVisible();
  expect(detailCalls).toBeGreaterThanOrEqual(3);
  const callsAtCompletion = detailCalls;
  await page.waitForTimeout(3_500);
  expect(detailCalls).toBe(callsAtCompletion);
});

test("Administración arma el paquete público desde dos JSON locales sin consultar RNEC", async ({
  page,
}) => {
  await installSession(page);
  let uploadedEnvelope: Record<string, unknown> | null = null;
  let externalRnecRequests = 0;
  let importPayload: Record<string, unknown> | null = null;

  await page.route(/https:\/\/[^/]*registraduria\.gov\.co\//u, async (route) => {
    externalRnecRequests += 1;
    await route.abort();
  });
  await page.route("**/mock-storage/**", async (route) => {
    const request = route.request();
    uploadedEnvelope = JSON.parse(
      request.postDataBuffer()?.toString("utf8") ?? "{}",
    );
    await route.fulfill({
      status: 200,
      body: "",
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/me") {
      await fulfillAuth(route);
      return;
    }
    if (url.pathname === "/api/electoral-catalog/releases") {
      await fulfill(route, []);
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/imports" &&
      request.method() === "GET"
    ) {
      await fulfill(route, []);
      return;
    }
    if (url.pathname === "/api/storage/upload-url") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        fileName: string;
        contentType: string;
        size: number;
      };
      expect(body.fileName).toBe("rnec-public-package-2026-05-31.json");
      expect(body.contentType).toBe("application/json");
      await fulfill(
        route,
        {
          bucket: "private-files",
          path: artifactPath,
          uploadUrl: "http://127.0.0.1:3000/mock-storage/package",
          uploadToken: "temporary-package-token",
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          metadata: {
            fileName: body.fileName,
            contentType: body.contentType,
            size: body.size,
          },
        },
        201,
      );
      return;
    }
    if (url.pathname === "/api/storage/complete") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        metadata: { fileName: string; contentType: string; size: number };
      };
      await fulfill(route, {
        confirmed: true,
        path: artifactPath,
        module: "electoral-catalog",
        metadata: body.metadata,
      });
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/imports" &&
      request.method() === "POST"
    ) {
      importPayload = JSON.parse(request.postData() ?? "{}");
      await fulfill(
        route,
        { job: job("QUEUED"), created: true, queued: true },
        202,
      );
      return;
    }
    if (url.pathname === "/api/electoral-catalog/imports/import-job-1") {
      await fulfill(route, job("QUEUED"));
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  const tree = {
    data: {
      departmentsTree: {
        edges: [
          {
            node: {
              idDepartmentCode: "11",
              departmentName: "BOGOTA D.C.",
              municipalities: [
                {
                  idMunicipality: "11001",
                  municipalityCode: "001",
                  municipalityName: "BOGOTA D.C.",
                  zones: [
                    {
                      idZone: "1100101",
                      idZoneCode: "01",
                      zoneName: "ZONA 01",
                      corporations: ["1"],
                      stands: [
                        {
                          idStand: "A11100116",
                          standCode: "A1",
                          standName: "PUESTO ALFANUMERICO",
                          countTable: 12,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  };
  const geo = [
    {
      codigo: "110010101",
      departamento: "BOGOTA D.C.",
      municipio: "BOGOTA D.C.",
      puesto: "PUESTO ALFANUMERICO",
      comuna: "01",
      direccion: "DIRECCION DECLARADA",
      lat: 4.6,
      lng: -74.1,
    },
  ];

  await page.goto("/dashboard/electoral-catalog");
  await page.getByLabel(/Paquete público RNEC/).check();
  await page.getByLabel(/departmentsTree oficial/).setInputFiles({
    name: "departmentsTree.json",
    mimeType: "",
    buffer: Buffer.from(JSON.stringify(tree)),
  });
  await page.getByLabel(/Geolocalización oficial/).setInputFiles({
    name: "data.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(geo)),
  });
  await page.getByLabel("URL fuente de departmentsTree").fill(
    "https://divulgacione14presidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json",
  );
  await page.getByLabel("URL fuente de geolocalización").fill(
    "https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/data/data.json",
  );
  await page.getByLabel("Clave de catálogo").fill("PRESIDENCIA_2026");
  await page
    .getByLabel("Nombre exacto del dataset")
    .fill("Presidencia 2026 paquete público");
  await page
    .getByLabel("URL HTTPS declarada de RNEC")
    .fill("https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/");
  await page.getByLabel("Fecha electoral", { exact: true }).fill("2026-05-31");
  await page
    .getByLabel("Fecha y hora de corte", { exact: true })
    .fill("2026-05-01T10:00");
  await page
    .getByLabel("Referencia de autorización escrita")
    .fill("RNEC-AUT-2026-001");
  await page
    .getByLabel("Declaración de licencia y alcance")
    .fill("Uso interno condicionado a autorización escrita");
  await page.getByRole("checkbox").check();
  await page
    .getByLabel("Escribe exactamente: INGESTAR RNEC")
    .fill("INGESTAR RNEC");
  await page.getByRole("button", { name: "Subir y encolar ingesta" }).click();

  await expect(page.getByText(/Ingesta registrada y enviada/)).toBeVisible();
  expect(externalRnecRequests).toBe(0);
  expect(uploadedEnvelope).toMatchObject({
    format: "rnec-public-package.v2",
    election: {
      name: "Presidencia 2026 paquete público",
      electionDate: "2026-05-31",
      round: "FIRST_ROUND",
    },
    sources: {
      departmentsTree: {
        rawContentSha256: createHash("sha256")
          .update(JSON.stringify(tree))
          .digest("hex"),
        payloadCanonicalSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        sourceContext: {
          electionDate: "2026-05-31",
          round: "FIRST_ROUND",
        },
        payload: tree,
      },
      geolocation: {
        rawContentSha256: createHash("sha256")
          .update(JSON.stringify(geo))
          .digest("hex"),
        payloadCanonicalSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        sourceContext: {
          electionDate: "2026-05-31",
          round: "FIRST_ROUND",
        },
        payload: geo,
      },
    },
  });
  expect(
    (((uploadedEnvelope as { sources: { departmentsTree: { payload: typeof tree } } })
      .sources.departmentsTree.payload.data.departmentsTree.edges[0].node
      .municipalities[0].zones[0].stands[0].standCode)),
  ).toBe("A1");
  expect(importPayload).toMatchObject({
    catalogKey: "PRESIDENCIA_2026",
    sourceArtifactPath: artifactPath,
  });
  expect(importPayload).not.toHaveProperty("tenantId");
});

test("un fallo exige confirmación y se reencola sin volver a subir el artefacto", async ({
  page,
}) => {
  await installSession(page);
  let currentStatus: "FAILED" | "QUEUED" | "SUCCEEDED" = "FAILED";
  let retryCalls = 0;
  let storageCalls = 0;
  let detailCalls = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/me") {
      await fulfillAuth(route);
      return;
    }
    if (url.pathname === "/api/electoral-catalog/releases") {
      await fulfill(route, []);
      return;
    }
    if (url.pathname.startsWith("/api/storage/")) {
      storageCalls += 1;
      await route.fulfill({ status: 500, body: "{}" });
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/imports" &&
      request.method() === "GET"
    ) {
      await fulfill(route, [job(currentStatus)]);
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/imports/import-job-1" &&
      request.method() === "GET"
    ) {
      detailCalls += 1;
      if (currentStatus === "QUEUED" && detailCalls >= 2) {
        currentStatus = "SUCCEEDED";
      }
      await fulfill(route, job(currentStatus));
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/imports/import-job-1/retry" &&
      request.method() === "POST"
    ) {
      retryCalls += 1;
      expect(request.postData()).toBeNull();
      currentStatus = "QUEUED";
      detailCalls = 0;
      await fulfill(
        route,
        { job: job("QUEUED"), queued: true, noOp: false },
        202,
      );
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/electoral-catalog");
  await expect(
    page.getByText("El JSON no contiene la jerarquía RNEC esperada."),
  ).toBeVisible();
  const retryButton = page.getByRole("button", { name: "Reintentar ingesta" });
  await expect(retryButton).toBeDisabled();
  await page
    .getByLabel(/Confirmo que revisé la causa segura del fallo/)
    .check();
  await retryButton.click();
  expect(retryCalls).toBe(1);
  expect(storageCalls).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByText("Seguimiento pausado mientras esta pestaña está oculta."),
  ).toBeVisible();
  await page.waitForTimeout(3_500);
  expect(detailCalls).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page
      .locator("span")
      .filter({ hasText: /^Snapshot preparado$/ })
      .first(),
  ).toBeVisible({ timeout: 10_000 });
  expect(storageCalls).toBe(0);
});
