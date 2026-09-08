import { expect, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

function sessionFor(
  backendRole: "ADMIN" | "AUDITOR",
  role: "AdminCampana" | "Auditor",
) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-e2e",
      name: "Campaña verificable",
      slug: "campana-verificable",
      type: "CANDIDACY",
    },
    user: {
      id: `user-${backendRole.toLowerCase()}`,
      email: `${backendRole.toLowerCase()}@example.test`,
      name: backendRole === "ADMIN" ? "Dirección financiera" : "Auditoría",
      role,
      backendRole,
    },
  };
}

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

test("completa el expediente financiero y descarga el borrador interno para revisión CNE", async ({
  page,
}) => {
  const settingsBodies: Record<string, unknown>[] = [];
  const cneReportBodies: Record<string, unknown>[] = [];
  const storageBodies: Record<string, unknown>[] = [];
  const authorizationHeaders: string[] = [];
  const filingReceipt = Buffer.from("%PDF-1.4 constancia de radicación");
  const filingReceiptPath =
    "tenant-e2e/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf";
  let financialEntries = [
    {
      id: "entry-approved",
      type: "EXPENSE",
      amount: 100_000_000,
      date: "2026-08-21T00:00:00.000Z",
      cneCode: "TRANSPORTE",
      description: "Transporte territorial",
      vendorName: "Proveedor verificado",
      vendorTaxId: "900123456",
      hasEvidence: true,
      hasCneReportEvidence: false,
      status: "APPROVED",
      reportedByMe: false,
      reviewedAt: "2026-08-22T12:00:00.000Z",
      cneReportedAt: null as string | null,
      cneReportReference: null as string | null,
      createdAt: "2026-08-21T00:00:00.000Z",
    },
  ];
  let settings = {
    limitsConfigured: false,
    maxTotalBudget: null as number | null,
    maxPublicityLimit: null as number | null,
    remainingBudget: null as number | null,
  };
  let protectedSettings: Record<string, unknown> | null = null;

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("ADMIN", "AdminCampana"),
    },
  );

  await page.route("**/storage/v1/object/upload/sign/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ Key: `private-files/${filingReceiptPath}` }),
    });
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (pathname === "/api/storage/upload-url" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      storageBodies.push(body);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              bucket: "private-files",
              path: filingReceiptPath,
              uploadUrl: `http://127.0.0.1:3000/mock-supabase/storage/v1/object/upload/sign/private-files/${filingReceiptPath}`,
              uploadToken: "signed-finance-token",
              method: "PUT",
              headers: { "Content-Type": "application/pdf" },
              metadata: {
                fileName: "constancia-radicacion.pdf",
                contentType: "application/pdf",
                size: filingReceipt.length,
              },
            },
            201,
          ),
        ),
      });
      return;
    }

    if (pathname === "/api/storage/complete" && request.method() === "POST") {
      storageBodies.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            confirmed: true,
            path: filingReceiptPath,
            module: "finance",
          }),
        ),
      });
      return;
    }

    if (pathname === "/api/finance" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(financialEntries)),
      });
      return;
    }

    if (pathname === "/api/finance/summary" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            totalExpenses: 100_000_000,
            totalIncome: 250_000_000,
            balance: 150_000_000,
            ...settings,
            compliance: protectedSettings
              ? {
                  ready: true,
                  missingFields: [],
                  invalidFields: [],
                  electionName: protectedSettings.electionName,
                  electionDate: protectedSettings.electionDate,
                  reportScope: protectedSettings.reportScope,
                  officialLimitsReference:
                    protectedSettings.officialLimitsReference,
                  officialLimitsUrl: protectedSettings.officialLimitsUrl,
                  reportDeadline: protectedSettings.reportDeadline,
                  financialManagerConfigured: true,
                  accountantConfigured: true,
                  uniqueAccountBank: protectedSettings.uniqueAccountBank,
                  uniqueAccountMasked: "•••• 1234",
                  cuentasClarasConfigured: true,
                }
              : {
                  ready: false,
                  missingFields: [
                    "electionName",
                    "officialLimitsUrl",
                    "financialManagerDocument",
                    "accountantDocument",
                    "uniqueAccountLastFour",
                  ],
                  invalidFields: [],
                  electionName: null,
                  electionDate: null,
                  reportScope: null,
                  officialLimitsReference: null,
                  officialLimitsUrl: null,
                  reportDeadline: null,
                  financialManagerConfigured: false,
                  accountantConfigured: false,
                  uniqueAccountBank: null,
                  uniqueAccountMasked: null,
                  cuentasClarasConfigured: false,
                },
          }),
        ),
      });
      return;
    }

    if (pathname === "/api/finance/settings" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            configured: Boolean(protectedSettings),
            readiness: {
              ready: Boolean(protectedSettings),
              missingFields: protectedSettings ? [] : ["electionName"],
              invalidFields: [],
            },
            settings: protectedSettings,
          }),
        ),
      });
      return;
    }

    if (pathname === "/api/finance/settings" && request.method() === "PUT") {
      const body = request.postDataJSON() as Record<string, unknown>;
      settingsBodies.push(body);
      settings = {
        limitsConfigured: true,
        maxTotalBudget: Number(body.maxTotalBudget),
        maxPublicityLimit: Number(body.maxPublicityLimit),
        remainingBudget: Number(body.maxTotalBudget) - 100_000_000,
      };
      protectedSettings = {
        maxTotalBudget: Number(body.maxTotalBudget),
        maxPublicityLimit: Number(body.maxPublicityLimit),
        electionName: body.electionName,
        electionDate: `${String(body.electionDate)}T00:00:00.000Z`,
        reportScope: body.reportScope,
        officialLimitsReference: body.officialLimitsReference,
        officialLimitsUrl: body.officialLimitsUrl,
        reportDeadline: `${String(body.reportDeadline)}T00:00:00.000Z`,
        financialManagerName: body.financialManagerName,
        financialManagerDocumentMasked: "•••• 7890",
        accountantName: body.accountantName,
        accountantDocumentMasked: "•••• 3210",
        uniqueAccountBank: body.uniqueAccountBank,
        uniqueAccountLastFour: body.uniqueAccountLastFour,
        cuentasClarasCode: body.cuentasClarasCode,
        readiness: { ready: true, missingFields: [], invalidFields: [] },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            id: "settings-e2e",
            ...protectedSettings,
          }),
        ),
      });
      return;
    }

    if (
      pathname === "/api/finance/cne-review-draft" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: '"Tipo","Fecha","Concepto","Monto","Contraparte","Identificación de contraparte","Categoría interna","Responsable"\n"Gasto","2026-08-21","Transporte","100000000","Proveedor","900123456","TRANSPORTE","Gerencia"\n"Ingreso","2026-08-22","Aporte","50000000","Aportante","123456789","OTROS","Gerencia"',
      });
      return;
    }

    if (
      pathname === "/api/finance/entry-approved/cne-report" &&
      request.method() === "PATCH"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      cneReportBodies.push(body);
      financialEntries = financialEntries.map((entry) => ({
        ...entry,
        status: "REPORTED_CNE",
        cneReportedAt: "2026-09-04T15:00:00.000Z",
        cneReportReference: String(body.externalReference),
        hasCneReportEvidence: true,
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(financialEntries[0])),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: `Ruta no simulada: ${pathname}` }),
    });
  });

  await page.goto("/dashboard/finance");
  await expect(
    page.getByRole("heading", { name: "Finanzas de campaña" }),
  ).toBeVisible();
  await expect(
    page.getByText("Completa el expediente financiero electoral"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Borrador interno para revisión CNE",
    }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Configurar expediente" }).click();
  const settingsDialog = page.getByRole("dialog", {
    name: "Expediente financiero electoral",
  });
  await settingsDialog
    .getByLabel("Nombre exacto de la elección")
    .fill("Elecciones territoriales 2027 - Alcaldía");
  await settingsDialog.getByLabel("Fecha de la elección").fill("2027-10-31");
  await settingsDialog
    .getByLabel("Alcance del informe")
    .selectOption("CANDIDATE");
  await settingsDialog
    .getByLabel("Fecha límite del informe")
    .fill("2027-10-31");
  await settingsDialog
    .getByLabel("Código de Cuentas Claras")
    .fill("CC-CANDIDATO-001");
  await settingsDialog
    .getByLabel("Resolución o referencia oficial de topes")
    .fill("Resolución CNE 0001 de 2027");
  await settingsDialog
    .getByLabel("URL oficial de topes (HTTPS)")
    .fill("https://www.cne.gov.co/resoluciones/0001");
  await settingsDialog
    .getByLabel("Responsable financiero o gerente")
    .fill("Gerencia financiera");
  await settingsDialog
    .getByLabel(/Documento del responsable financiero/)
    .fill("1234567890");
  await settingsDialog.getByLabel("Contador responsable").fill("Contador uno");
  await settingsDialog.getByLabel(/Documento del contador/).fill("9876543210");
  await settingsDialog
    .getByLabel("Banco de la cuenta única")
    .fill("Banco autorizado");
  await settingsDialog.getByLabel(/Últimos 4 de la cuenta única/).fill("1234");
  await settingsDialog
    .getByLabel("Tope total de gastos (COP)")
    .fill("500000000");
  await settingsDialog
    .getByLabel("Tope de publicidad exterior (COP)")
    .fill("120000000");
  await settingsDialog
    .getByRole("button", { name: "Guardar expediente" })
    .click();
  await expect(settingsDialog.getByRole("alert")).toContainText(
    "La fecha límite del informe debe ser posterior a la elección",
  );
  expect(settingsBodies).toHaveLength(0);
  await settingsDialog
    .getByLabel("Fecha límite del informe")
    .fill("2027-11-30");
  await settingsDialog
    .getByRole("button", { name: "Guardar expediente" })
    .click();

  await expect(
    page.getByText("Expediente financiero actualizado y auditado."),
  ).toBeVisible();
  await expect(
    page.getByText("Expediente habilitado para registro interno"),
  ).toBeVisible();
  await expect(
    page.getByText(/31\/10\/2027 · Informe de candidato/),
  ).toBeVisible();
  await expect(
    page.getByText(/Fecha límite registrada: 30\/11\/2027/),
  ).toBeVisible();
  expect(settingsBodies).toEqual([
    {
      maxTotalBudget: 500_000_000,
      maxPublicityLimit: 120_000_000,
      electionName: "Elecciones territoriales 2027 - Alcaldía",
      electionDate: "2027-10-31",
      reportScope: "CANDIDATE",
      officialLimitsReference: "Resolución CNE 0001 de 2027",
      officialLimitsUrl: "https://www.cne.gov.co/resoluciones/0001",
      reportDeadline: "2027-11-30",
      financialManagerName: "Gerencia financiera",
      financialManagerDocument: "1234567890",
      accountantName: "Contador uno",
      accountantDocument: "9876543210",
      uniqueAccountBank: "Banco autorizado",
      uniqueAccountLastFour: "1234",
      cuentasClarasCode: "CC-CANDIDATO-001",
    },
  ]);

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Borrador interno para revisión CNE" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^borrador-interno-revision-cne-\d{4}-\d{2}-\d{2}\.csv$/,
  );

  await page
    .getByRole("button", {
      name: "Anotar referencia externa declarada de Transporte territorial",
    })
    .click();
  const reportDialog = page.getByRole("dialog");
  await expect(
    reportDialog.getByRole("heading", {
      name: "Anotar referencia externa del movimiento",
    }),
  ).toBeVisible();
  await expect(reportDialog).toContainText(
    "no constituye ni demuestra una presentación, radicación o rendición oficial",
  );
  await reportDialog
    .getByLabel("Referencia externa declarada")
    .fill("CC-2026/004219");
  await reportDialog
    .getByRole("button", { name: "Guardar anotación externa" })
    .click();
  await expect(reportDialog.getByRole("alert")).toContainText(
    "Adjunta el soporte privado de la referencia externa",
  );
  expect(cneReportBodies).toHaveLength(0);
  await reportDialog
    .getByLabel("Soporte privado de la referencia")
    .setInputFiles({
      name: "constancia-radicacion.pdf",
      mimeType: "application/pdf",
      buffer: filingReceipt,
    });
  await reportDialog
    .getByRole("button", { name: "Guardar anotación externa" })
    .click();
  await expect(
    page.getByText(
      "Referencia externa declarada y auditada; la plataforma no la verifica.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Referencia declarada CC-2026/004219"),
  ).toBeVisible();
  await expect(page.getByText("Soporte privado adjunto")).toBeVisible();
  expect(cneReportBodies).toEqual([
    {
      externalReference: "CC-2026/004219",
      cneReportEvidenceUrl: filingReceiptPath,
    },
  ]);
  expect(storageBodies).toEqual([
    {
      module: "finance",
      fileName: "constancia-radicacion.pdf",
      contentType: "application/pdf",
      size: filingReceipt.length,
    },
    {
      module: "finance",
      path: filingReceiptPath,
      metadata: {
        fileName: "constancia-radicacion.pdf",
        contentType: "application/pdf",
        size: filingReceipt.length,
      },
    },
  ]);
  expect(cneReportBodies[0]).not.toHaveProperty("tenantId");
  expect(cneReportBodies[0]).not.toHaveProperty("tenant_id");
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(9);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});

test("auditoría consulta y descarga el borrador sin controles de escritura", async ({
  page,
}) => {
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("AUDITOR", "Auditor"),
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/finance") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful([])),
      });
      return;
    }
    if (pathname === "/api/finance/summary") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            totalExpenses: 0,
            totalIncome: 0,
            balance: 0,
            limitsConfigured: false,
            maxTotalBudget: null,
            maxPublicityLimit: null,
            remainingBudget: null,
            compliance: {
              ready: false,
              missingFields: ["electionName"],
              invalidFields: [],
              electionName: null,
              electionDate: null,
              reportScope: null,
              officialLimitsReference: null,
              officialLimitsUrl: null,
              reportDeadline: null,
              financialManagerConfigured: false,
              accountantConfigured: false,
              uniqueAccountBank: null,
              uniqueAccountMasked: null,
              cuentasClarasConfigured: false,
            },
          }),
        ),
      });
      return;
    }
    if (pathname === "/api/finance/cne-review-draft") {
      await route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: '"Tipo","Fecha","Concepto","Monto","Contraparte","Identificación de contraparte","Categoría interna","Responsable"',
      });
      return;
    }
    await route.fulfill({ status: 403, body: "Forbidden" });
  });

  await page.goto("/dashboard/finance");
  await expect(
    page.getByRole("button", {
      name: "Borrador interno para revisión CNE",
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Registrar movimiento" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Configurar expediente" }),
  ).toHaveCount(0);
});
