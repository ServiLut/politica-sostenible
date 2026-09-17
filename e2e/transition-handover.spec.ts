import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "transition-signature",
].join(".");

const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant: {
    id: "tenant-transition-e2e",
    name: "Campaña Horizonte",
    slug: "campana-horizonte",
    type: "CANDIDACY" as const,
    operationStage: "POST_ELECTION" as const,
  },
  user: {
    id: "audit-transition-e2e",
    email: "audit@example.test",
    name: "Auditoría",
    role: "Auditor" as const,
    backendRole: "AUDITOR" as const,
  },
};

const report = {
  reportId: "550e8400-e29b-41d4-a716-446655440000",
  packageKind: "INTERNAL_CAMPAIGN_CLOSEOUT_DRAFT",
  generatedAt: "2026-09-09T17:00:00.000Z",
  status: "BLOCKED",
  organization: { name: "Campaña Horizonte", type: "CANDIDACY" },
  election: {
    name: "Alcaldía de prueba",
    type: "MAYORALTY",
    date: "2026-08-30T05:00:00.000Z",
    circumscriptionType: "MUNICIPAL",
    circumscriptionName: "Municipio de prueba",
  },
  lifecycle: {
    stage: "POST_ELECTION",
    retentionPeriodDays: 730,
    closureType: null,
    terminatedAt: null,
    terminationCause: null,
    complianceCertified: false,
    authorityFilingCertified: false,
  },
  termination: null,
  finance: {
    entries: 3,
    pendingReview: 1,
    approvedNotReported: 1,
    reported: 1,
    income: 100000,
    expenses: 25000,
    balance: 75000,
    reportScope: "CANDIDATE",
    reportDeadline: "2026-10-01T05:00:00.000Z",
    officialLimitsReference: "Referencia verificable",
    cuentasClarasCodeConfigured: true,
    closeoutReady: false,
    closeoutBlockerCodes: ["UNREPORTED_FINANCIAL_ENTRIES"],
  },
  operation: {
    openTasks: 2,
    openCases: 1,
    pendingCommunications: 0,
    e14PendingReview: 1,
    e14Rejected: 0,
  },
  evidence: { confirmedNotAssociated: 0, expiredAuthorizations: 0 },
  governance: {
    activePrivacyNotices: 1,
    activeTeamByRole: [{ role: "ADMIN", count: 1 }],
  },
  actions: [
    {
      code: "FINANCE_NOT_CLOSED",
      severity: "BLOCK",
      label: "Conciliar y cerrar el libro financiero",
      detail: "1 registro espera revisión y 1 está aprobado sin constancia.",
      href: "/dashboard/finance",
    },
  ],
  transitionPolicy: {
    automaticTransferAllowed: false,
    campaignDataReusedAutomatically: false,
    requiredDestinationType: "PUBLIC_OFFICE",
    explanation:
      "Una eventual gestión pública exige una organización separada.",
  },
  disclaimer: "Borrador interno; no acredita radicación.",
  integrity: {
    algorithm: "SHA-256",
    scope: "REPORT_BODY_WITHOUT_INTEGRITY",
    sha256: "a".repeat(64),
  },
};

const generatedReport = {
  ...report,
  reportId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
  generatedAt: "2026-09-10T18:30:00.000Z",
  integrity: { ...report.integrity, sha256: "b".repeat(64) },
};

function summary(source: typeof report) {
  return {
    reportId: source.reportId,
    operationProfileId: "profile-transition-e2e",
    generatedAt: source.generatedAt,
    status: source.status,
    packageKind: source.packageKind,
    sha256: source.integrity.sha256,
    generatedBy: {
      id: session.user.id,
      name: session.user.name,
      role: session.user.backendRole,
    },
  };
}

function successful<T>(data: T) {
  return { statusCode: 200, message: "Success", data };
}

async function installSession(page: Page) {
  await page.addInitScript(
    ({ storageKey, value }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
      Object.defineProperty(window, "print", {
        configurable: true,
        value: () =>
          document.documentElement.setAttribute("data-printed", "true"),
      });
    },
    {
      storageKey: "politica-sostenible.auth-session",
      value: session,
    },
  );
}

test("recupera el corte durable exacto y solo genera otro por acción explícita", async ({
  page,
}) => {
  await installSession(page);
  let generationRequests = 0;
  let exactReadRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/me" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              role: session.user.backendRole,
              tenant: session.tenant,
            },
          }),
        ),
      });
      return;
    }
    if (
      pathname === "/api/transition-handover/report" &&
      request.method() === "POST"
    ) {
      generationRequests += 1;
      expect(request.postData()).toBeNull();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(generatedReport)),
      });
      return;
    }
    if (
      pathname === "/api/transition-handover/reports" &&
      request.method() === "GET"
    ) {
      expect(new URL(request.url()).searchParams.get("page")).toBe("1");
      expect(new URL(request.url()).searchParams.get("limit")).toBe("25");
      const items =
        generationRequests === 0
          ? [summary(report)]
          : [summary(generatedReport), summary(report)];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items,
            pagination: {
              page: 1,
              limit: 25,
              total: items.length,
              totalPages: 1,
            },
          }),
        ),
      });
      return;
    }
    if (
      pathname === `/api/transition-handover/reports/${report.reportId}` &&
      request.method() === "GET"
    ) {
      exactReadRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(report)),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/transition");
  await expect(
    page.getByRole("heading", { name: "Cierre y transición responsable" }),
  ).toBeVisible();
  expect(generationRequests).toBe(0);

  await page.getByRole("button", { name: "Abrir expediente guardado" }).click();
  await expect(
    page.getByText("Expediente conservado, recuperado sin regeneración"),
  ).toBeVisible();
  await expect(
    page.getByText(`ID ${report.reportId}`, { exact: true }),
  ).toBeVisible();
  expect(exactReadRequests).toBe(1);
  expect(generationRequests).toBe(0);

  const storedDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar JSON" }).click();
  const storedDownload = await storedDownloadPromise;
  expect(storedDownload.suggestedFilename()).toBe(
    `expediente-empalme-${report.reportId}.json`,
  );
  const storedDownloadPath = await storedDownload.path();
  if (!storedDownloadPath)
    throw new Error("Playwright no conservó la descarga");
  expect(JSON.parse(await readFile(storedDownloadPath, "utf8"))).toEqual(
    report,
  );

  await page.getByRole("button", { name: "Generar nuevo corte" }).click();
  await expect(
    page.getByText(`ID ${generatedReport.reportId}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[aria-live="polite"]').getByText("Cierre bloqueado"),
  ).toBeVisible();
  await expect(
    page.getByText("Conciliar y cerrar el libro financiero"),
  ).toBeVisible();
  await expect(
    page.getByText("Campaña y gestión pública no se mezclan"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Escala el cierre a Administración, Gerencia financiera o Cumplimiento.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Resolver" })).toHaveCount(0);
  expect(generationRequests).toBe(1);
  expect(exactReadRequests).toBe(1);

  await page.getByRole("button", { name: "Imprimir" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-printed", "true");
});
