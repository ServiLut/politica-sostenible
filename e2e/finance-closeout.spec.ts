import { expect, test, type Page, type Route } from "@playwright/test";

type Stage = "POST_ELECTION" | "CLOSED";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "finance-closeout-e2e",
].join(".");

function sessionFor(stage: Stage) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-finance-e2e",
      name: "Candidatura financiera verificable",
      slug: "finance-e2e",
      type: "CANDIDACY" as const,
      operationStage: stage,
    },
    user: {
      id: "finance-manager-e2e",
      email: "finance@example.test",
      name: "Contabilidad electoral",
      role: "GerenteFinanzas" as const,
      backendRole: "FINANCE_MANAGER" as const,
    },
  };
}

function successful(data: unknown) {
  return { statusCode: 200, message: "Success", data };
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status >= 400 ? data : successful(data)),
  });
}

function complianceSettings() {
  const readiness = { ready: true, missingFields: [], invalidFields: [] };
  return {
    configured: true,
    readiness,
    settings: {
      maxTotalBudget: 500_000_000,
      maxPublicityLimit: 50_000_000,
      electionName: "Alcaldia municipal 2026",
      electionDate: "2026-10-25T00:00:00.000Z",
      reportScope: "CANDIDATE",
      officialLimitsReference: "Acto oficial verificado por cumplimiento",
      officialLimitsUrl: "https://www.cne.gov.co/",
      reportDeadline: "2026-11-25T00:00:00.000Z",
      financialManagerName: "Gerencia de campana",
      financialManagerDocumentMasked: "**** 0001",
      accountantName: "Contabilidad electoral",
      accountantDocumentMasked: "**** 0002",
      uniqueAccountBank: "Banco de prueba",
      uniqueAccountLastFour: "6789",
      cuentasClarasCode: "INTERNO-2026-001",
      readiness,
    },
  };
}

function closeoutOverview(stage: Stage) {
  return {
    operationStage: stage,
    readOnly: stage === "CLOSED",
    legalStateNotice:
      "Este modulo prepara expedientes internos. No se conecta, transmite ni radica automaticamente ante el CNE o Cuentas Claras.",
    readiness: {
      readyForCloseout: false,
      evaluatedAt: "2026-09-09T18:00:00.000Z",
      basis:
        "IMMUTABLE_LEDGER_CUT_BANK_RECONCILIATION_THREE_INDEPENDENT_APPROVALS",
      blockers: [
        {
          code: "NO_REPORT_DOSSIER",
          detail: "No existe expediente de informe de candidatura.",
        },
      ],
    },
    summary: {
      dossierCount: 0,
      bankStatementCount: 0,
      inKindContributionCount: 0,
      payableCount: 0,
      pendingEntryCount: 0,
      unmatchedBankLineCount: 0,
      outstandingPayables: 0,
    },
    dossiers: [],
    bankStatements: [],
    inKindContributions: [],
    payables: [],
  };
}

async function installSession(page: Page, stage: Stage) {
  const session = sessionFor(stage);
  await page.addInitScript(
    ({ value }) => {
      window.sessionStorage.setItem(
        "politica-sostenible.auth-session",
        JSON.stringify(value),
      );
    },
    { value: session },
  );
  return session;
}

async function installRoutes(
  page: Page,
  stage: Stage,
  onDossier?: (body: Record<string, unknown>) => void,
) {
  const session = sessionFor(stage);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/api/auth/me") {
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
    if (request.method() === "GET" && path === "/api/billing/capabilities") {
      await fulfill(route, {
        plan: { code: "ENTERPRISE", name: "Enterprise" },
        features: { export: true, import: true, mfa: true },
      });
      return;
    }
    if (request.method() === "GET" && path === "/api/finance") {
      await fulfill(route, []);
      return;
    }
    if (request.method() === "GET" && path === "/api/finance/summary") {
      await fulfill(route, {
        totalExpenses: 0,
        totalIncome: 0,
        balance: 0,
        limitsConfigured: true,
        maxTotalBudget: 500_000_000,
        maxPublicityLimit: 50_000_000,
        remainingBudget: 500_000_000,
        compliance: complianceSettings().readiness,
      });
      return;
    }
    if (request.method() === "GET" && path === "/api/finance/settings") {
      await fulfill(route, complianceSettings());
      return;
    }
    if (request.method() === "GET" && path === "/api/finance/closeout") {
      await fulfill(route, closeoutOverview(stage));
      return;
    }
    if (
      request.method() === "POST" &&
      path === "/api/finance/closeout/dossiers"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      onDossier?.(body);
      await fulfill(route, {
        id: "dossier-e2e",
        kind: body.kind,
        subjectCode: body.subjectCode,
        subjectName: body.subjectName,
        createdAt: "2026-09-09T18:00:00.000Z",
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });
}

test("crea un expediente interno por HTTP sin aceptar identidad de tenant", async ({
  page,
}) => {
  await installSession(page, "POST_ELECTION");
  let posted: Record<string, unknown> | null = null;
  await installRoutes(page, "POST_ELECTION", (body) => {
    posted = body;
  });

  await page.goto("/dashboard/finance");
  await expect(
    page.getByRole("heading", { name: "Finanzas de campaña" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Expedientes, conciliacion y controles",
    }),
  ).toBeVisible();
  await expect(page.getByText("no se conecta, transmite ni radica", { exact: false })).toBeVisible();

  await page
    .getByRole("button", { name: "Expediente", exact: true })
    .click();
  await page.getByLabel("Codigo del sujeto").fill("cand-e2e-01");
  await page.getByLabel("Nombre", { exact: true }).fill("Candidatura E2E");
  await page.getByRole("button", { name: "Guardar con control" }).click();

  await expect(
    page.getByText(
      "Expediente interno creado; aun no constituye un informe oficial.",
    ),
  ).toBeVisible();
  expect(posted).not.toBeNull();
  expect(posted).toMatchObject({
    kind: "CANDIDATE",
    subjectCode: "CAND-E2E-01",
    subjectName: "Candidatura E2E",
  });
  expect(posted).toHaveProperty("clientRequestId");
  expect(posted).toHaveProperty("payloadSha256");
  expect(posted).not.toHaveProperty("tenantId");
  expect(String(posted?.payloadSha256)).toMatch(/^[a-f0-9]{64}$/u);
});

test("mantiene el expediente CLOSED visible y sin controles de mutacion", async ({
  page,
}) => {
  await installSession(page, "CLOSED");
  await installRoutes(page, "CLOSED");

  await page.goto("/dashboard/finance");
  await expect(
    page.getByText("Operacion cerrada: todo este expediente", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Expediente", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Extracto" })).toHaveCount(0);
  await expect(page.getByText("NO_REPORT_DOSSIER:")).toBeVisible();
});
