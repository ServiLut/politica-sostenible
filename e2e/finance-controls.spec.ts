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

test("configura topes auditables y descarga el borrador interno para revisión CNE", async ({
  page,
}) => {
  const settingsBodies: Record<string, unknown>[] = [];
  const cneReportBodies: Record<string, unknown>[] = [];
  const authorizationHeaders: string[] = [];
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

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("ADMIN", "AdminCampana"),
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    authorizationHeaders.push(request.headers().authorization ?? "");

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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            id: "settings-e2e",
            maxTotalBudget: settings.maxTotalBudget,
            maxPublicityLimit: settings.maxPublicityLimit,
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
        body: "Fecha,Concepto,Monto\n2026-08-21,Transporte,100000000",
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
    page.getByText("Configura los topes de esta elección"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Configurar topes" }).click();
  await page.getByLabel("Tope total de gastos (COP)").fill("500000000");
  await page.getByLabel("Tope de publicidad exterior (COP)").fill("120000000");
  await page.getByRole("button", { name: "Guardar topes" }).click();

  await expect(
    page.getByText("Topes actualizados y registrados en la auditoría."),
  ).toBeVisible();
  await expect(
    page.getByText("Topes configurados para esta elección"),
  ).toBeVisible();
  expect(settingsBodies).toEqual([
    { maxTotalBudget: 500_000_000, maxPublicityLimit: 120_000_000 },
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
      name: "Registrar radicación externa de Transporte territorial",
    })
    .click();
  const reportDialog = page.getByRole("dialog");
  await expect(
    reportDialog.getByRole("heading", {
      name: "Registrar radicación en Cuentas Claras",
    }),
  ).toBeVisible();
  await expect(reportDialog).toContainText(
    "Política Sostenible no envía información al CNE",
  );
  await reportDialog
    .getByLabel("Número de radicado externo")
    .fill("CC-2026/004219");
  await reportDialog
    .getByRole("button", { name: "Confirmar radicación externa" })
    .click();
  await expect(
    page.getByText(
      "Radicación externa confirmada y registrada en la auditoría.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Radicado externo CC-2026/004219")).toBeVisible();
  expect(cneReportBodies).toEqual([
    { externalReference: "CC-2026/004219" },
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
          }),
        ),
      });
      return;
    }
    if (pathname === "/api/finance/cne-review-draft") {
      await route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: "Fecha,Concepto,Monto",
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
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Registrar movimiento" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Configurar topes" }),
  ).toHaveCount(0);
});
