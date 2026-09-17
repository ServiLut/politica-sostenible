import { expect, test, type Page, type Route } from "@playwright/test";

const sha256 = "a".repeat(64);
const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "catalog-signature",
].join(".");

const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant: {
    id: "tenant-catalog-e2e",
    name: "Campaña Catálogo Verificable",
    slug: "catalogo-verificable",
    type: "CANDIDACY" as const,
    operationStage: "ELECTION_PREPARATION" as const,
  },
  user: {
    id: "auditor-catalog-e2e",
    email: "audit@example.test",
    name: "Auditoría independiente",
    role: "Auditor" as const,
    backendRole: "AUDITOR" as const,
  },
};

function release(status: "STAGED" | "VALIDATED" | "ACTIVE") {
  return {
    id: "release-rnec-2026",
    tenantId: session.tenant.id,
    catalogKey: "PRESIDENCIA_2026",
    type: "ELECTORAL_RNEC",
    status,
    sourceUrl:
      "https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/index.html",
    sourceOrganization: "Registraduría Nacional del Estado Civil",
    sourceDataset: "DIVIPOLE Presidencia 2026",
    sourceCutoffAt: "2026-05-01T05:00:00.000Z",
    electionDate: "2026-05-31T05:00:00.000Z",
    contentSha256: sha256,
    parserVersion: "rnec-tree-v1",
    authorizationReference: "RNEC-AUT-2026-001",
    licenseDeclaration: "Uso interno autorizado por escrito",
    sourceArtifactPath:
      "tenant-catalog-e2e/electoral-catalog/divipole-2026.txt",
    recordCount: 4,
    departmentCount: 1,
    municipalityCount: 1,
    zoneCount: 1,
    pollingPlaceCount: 1,
    physicalPollingPlaceCount: 1,
    expectedTableCount: 12,
    validationSummary: null,
    rejectionReason: null,
    createdById: "admin-creator-e2e",
    validatedById: status === "STAGED" ? null : session.user.id,
    activatedById: status === "ACTIVE" ? session.user.id : null,
    approvedById: status === "ACTIVE" ? session.user.id : null,
    supersededByReleaseId: null,
    createdAt: "2026-09-01T13:00:00.000Z",
    validatedAt: status === "STAGED" ? null : "2026-09-09T13:00:00.000Z",
    activatedAt: status === "ACTIVE" ? "2026-09-09T14:00:00.000Z" : null,
    supersededAt: null,
  };
}

const entries = [
  {
    id: "entry-department",
    tenantId: session.tenant.id,
    releaseId: "release-rnec-2026",
    namespace: "RNEC_DIVIPOLE",
    type: "DEPARTMENT",
    canonicalCode: "11",
    departmentCode: "11",
    municipalityCode: null,
    zoneCode: null,
    pollingPlaceCode: null,
    sourceLocationCode: null,
    votingDate: null,
    parentId: null,
    name: "Bogotá D.C.",
    nameIsDerived: false,
    address: null,
    commune: null,
    latitude: null,
    longitude: null,
    timeZone: null,
    expectedTables: null,
  },
  {
    id: "entry-place",
    tenantId: session.tenant.id,
    releaseId: "release-rnec-2026",
    namespace: "RNEC_DIVIPOLE",
    type: "POLLING_PLACE",
    canonicalCode: "11001001001",
    departmentCode: "11",
    municipalityCode: "001",
    zoneCode: "01",
    pollingPlaceCode: "001",
    sourceLocationCode: "1001",
    votingDate: "2026-05-31",
    parentId: "entry-zone",
    name: "Colegio Distrital Verificable",
    nameIsDerived: false,
    address: "Carrera 1 # 2-3",
    commune: "Localidad 1",
    latitude: "4.61",
    longitude: "-74.08",
    timeZone: "America/Bogota",
    expectedTables: 12,
  },
];

const integrity = {
  valid: true,
  blockingIssues: [],
  counts: {
    records: 4,
    departments: 1,
    municipalities: 1,
    zones: 1,
    pollingPlaces: 1,
    physicalPollingPlaces: 1,
    additionalVotingDayRepresentations: 0,
    expectedTables: 12,
  },
  gaps: {
    departmentsWithoutMunicipalities: 0,
    municipalitiesWithoutZones: 0,
    zonesWithoutPollingPlaces: 0,
    pollingPlacesWithoutCoordinates: 0,
    pollingPlacesWithoutCommune: 0,
    pollingPlaceRecordsWithoutAddress: 0,
    physicalPollingPlacesWithoutAddress: 0,
    physicalPollingPlacesWithoutTimeZone: 0,
  },
};

function successful<T>(data: T) {
  return { statusCode: 200, message: "Success", data };
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status >= 400 ? data : successful(data)),
  });
}

async function installSession(page: Page, value = session) {
  await page.addInitScript(
    ({ storageKey, value }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      value,
    },
  );
}

test("auditoría consulta procedencia, brechas, entradas y diff sin activar datos", async ({
  page,
}) => {
  await installSession(page);
  let diffCalls = 0;
  let mutationCalls = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/me") {
      await fulfill(route, {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.backendRole,
          tenant: session.tenant,
        },
      });
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/releases" &&
      request.method() === "GET"
    ) {
      await fulfill(route, [release("VALIDATED")]);
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/imports" &&
      request.method() === "GET"
    ) {
      await fulfill(route, []);
      return;
    }
    if (url.pathname.endsWith("/gaps")) {
      await fulfill(route, {
        releaseId: "release-rnec-2026",
        contentSha256: sha256,
        integrity,
      });
      return;
    }
    if (url.pathname.endsWith("/diff")) {
      diffCalls += 1;
      await fulfill(route, {
        target: {
          id: "release-rnec-2026",
          sha256,
          status: "VALIDATED",
        },
        base: null,
        summary: { added: 4, removed: 0, changed: 0 },
        sample: {
          limit: 500,
          truncated: false,
          added: ["RNEC_DIVIPOLE:11"],
          removed: [],
          changed: [],
        },
      });
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/releases/release-rnec-2026" &&
      request.method() === "GET"
    ) {
      await fulfill(route, {
        release: release("VALIDATED"),
        entries,
        pagination: { hasMore: false, nextCursorId: null },
      });
      return;
    }
    if (request.method() === "POST") mutationCalls += 1;
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/electoral-catalog");
  await expect(
    page.getByRole("heading", { name: "Catálogo electoral verificable" }),
  ).toBeVisible();
  await expect(
    page.getByText("DIVIPOLE Presidencia 2026").first(),
  ).toBeVisible();
  await expect(page.getByText(sha256)).toBeVisible();
  await expect(
    page.getByText("RNEC-AUT-2026-001", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Integridad estructural aprobada")).toBeVisible();
  await expect(page.getByText("Colegio Distrital Verificable")).toBeVisible();
  await expect(page.getByText("1001", { exact: true })).toBeVisible();
  await expect(page.getByText("2026-05-31", { exact: true })).toBeVisible();
  await expect(page.getByText("America/Bogota", { exact: true })).toBeVisible();
  await expect(page.getByText(/1 ubicaciones físicas/)).toBeVisible();
  await expect(page.getByText(/No operativo:/)).toBeVisible();
  await expect(page.getByText(/Modo de observación:/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Subir y encolar ingesta" }),
  ).toHaveCount(0);
  expect(mutationCalls).toBe(0);

  await page.getByRole("button", { name: "Comparar" }).click();
  await expect(
    page
      .getByRole("region", { name: "Comparar versiones" })
      .getByText("RNEC_DIVIPOLE:11", { exact: true }),
  ).toBeVisible();
  expect(diffCalls).toBe(1);
  expect(mutationCalls).toBe(0);
});

test("el doble control exige huella y confirmaciones, explica 409 y permite reintentar", async ({
  page,
}) => {
  await installSession(page);
  let currentStatus: "STAGED" | "VALIDATED" | "ACTIVE" = "STAGED";
  let validationCalls = 0;
  let activationCalls = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/me") {
      await fulfill(route, {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.backendRole,
          tenant: session.tenant,
        },
      });
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/releases" &&
      request.method() === "GET"
    ) {
      await fulfill(route, [release(currentStatus)]);
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/imports" &&
      request.method() === "GET"
    ) {
      await fulfill(route, []);
      return;
    }
    if (url.pathname.endsWith("/gaps")) {
      await fulfill(route, {
        releaseId: "release-rnec-2026",
        contentSha256: sha256,
        integrity,
      });
      return;
    }
    if (
      url.pathname === "/api/electoral-catalog/releases/release-rnec-2026" &&
      request.method() === "GET"
    ) {
      await fulfill(route, {
        release: release(currentStatus),
        entries,
        pagination: { hasMore: false, nextCursorId: null },
      });
      return;
    }
    if (url.pathname.endsWith("/validate") && request.method() === "POST") {
      validationCalls += 1;
      expect(JSON.parse(request.postData() ?? "{}")).toEqual({
        expectedContentSha256: sha256,
      });
      currentStatus = "VALIDATED";
      await fulfill(route, {
        release: release("VALIDATED"),
        validated: true,
        noOp: false,
        integrity,
      });
      return;
    }
    if (url.pathname.endsWith("/activate") && request.method() === "POST") {
      activationCalls += 1;
      expect(JSON.parse(request.postData() ?? "{}")).toEqual({
        expectedContentSha256: sha256,
      });
      if (activationCalls === 1) {
        await fulfill(
          route,
          {
            statusCode: 409,
            message: "El catálogo cambió durante la activación; recarga.",
          },
          409,
        );
        return;
      }
      currentStatus = "ACTIVE";
      await fulfill(route, {
        release: release("ACTIVE"),
        activated: true,
        noOp: false,
        superseded: 0,
        retiredLegacy: 0,
        retiredRnec: 0,
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/electoral-catalog");
  const validateButton = page.getByRole("button", {
    name: "Validar estructura",
  });
  await expect(validateButton).toBeDisabled();
  expect(validationCalls).toBe(0);

  await page.getByLabel("SHA-256 revisado (64 caracteres)").fill(sha256);
  await page.getByRole("checkbox").check();
  await expect(validateButton).toBeEnabled();
  await validateButton.click();
  await expect(
    page.getByText(/Release validado. Aún no es operativo/),
  ).toBeVisible();
  expect(validationCalls).toBe(1);

  const activateButton = page.getByRole("button", {
    name: "Aprobar y activar",
  });
  await expect(activateButton).toBeDisabled();
  await page.getByLabel("SHA-256 revisado (64 caracteres)").fill(sha256);
  await page.getByRole("checkbox").check();
  await page
    .getByLabel(/^Escribe exactamente:/)
    .fill("ACTIVAR aaaaaaaa…aaaaaaaa");
  await expect(activateButton).toBeEnabled();
  await activateButton.click();
  await expect(
    page.getByText(/El catálogo cambió o no cumple los controles\./),
  ).toBeVisible();
  expect(activationCalls).toBe(1);

  await activateButton.click();
  await expect(
    page
      .locator("span")
      .filter({ hasText: /^Activo y operativo$/ })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("La proyección territorial oficial quedó disponible."),
  ).toBeVisible();
  expect(activationCalls).toBe(2);
});
