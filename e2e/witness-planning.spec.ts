import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "witness-planning-signature",
].join(".");

async function installSession(page: Page) {
  await page.addInitScript(({ accessToken }) => {
    window.sessionStorage.setItem(
      "politica-sostenible.auth-session",
      JSON.stringify({
        accessToken,
        expiresAt: null,
        tenant: {
          id: "tenant-witness",
          name: "Campaña Testigo",
          slug: "witness",
          type: "CANDIDACY",
          operationStage: "ELECTION_PREPARATION",
        },
        user: {
          id: "admin-witness",
          email: "admin@example.test",
          name: "Administración",
          role: "AdminCampana",
          backendRole: "ADMIN",
        },
      }),
    );
  }, { accessToken: jwt });
}

function successful(data: unknown) {
  return { statusCode: 200, message: "Success", data };
}

const coverageWindow = {
  id: "window-a",
  captureContext: "REAL",
  puestoId: "place-a",
  localDate: "2027-10-31",
  startsAt: "2027-10-31T12:00:00.000Z",
  endsAt: "2027-10-31T22:00:00.000Z",
  timeZone: "America/Bogota",
  utcOffsetMinutes: -300,
  version: 1,
  puesto: {
    id: "place-a",
    code: "001",
    name: "Colegio Central",
    expectedTables: 2,
    votingDate: "2027-10-31",
    timeZone: "America/Bogota",
    isActive: true,
  },
};

test("muestra déficit temporal y crea una asignación real sin enviar tenantId", async ({ page }) => {
  await installSession(page);
  let postedBody: Record<string, unknown> | null = null;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/me") {
      await route.fulfill({ json: successful({
        user: { id: "admin-witness", email: "admin@example.test", name: "Administración", role: "AdminCampana", backendRole: "ADMIN" },
        tenant: { id: "tenant-witness", name: "Campaña Testigo", slug: "witness", type: "CANDIDACY", operationStage: "ELECTION_PREPARATION" },
      }) });
      return;
    }
    if (path === "/api/billing/capabilities") {
      await route.fulfill({ json: successful({ features: {} }) });
      return;
    }
    if (path === "/api/campaigns/divisions") {
      await route.fulfill({ json: successful({ items: [coverageWindow.puesto], evaluatedAt: new Date().toISOString(), pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } }) });
      return;
    }
    if (path.endsWith("/coverage-windows")) {
      await route.fulfill({ json: successful({ operationStage: "ELECTION_PREPARATION", readOnly: false, items: [coverageWindow] }) });
      return;
    }
    if (path.endsWith("/candidates")) {
      await route.fulfill({ json: successful({ items: [{ id: "witness-a", name: "Testigo Uno", division: null }], truncated: false }) });
      return;
    }
    if (path.endsWith("/coverage")) {
      await route.fulfill({ json: successful({
        operationStage: "ELECTION_PREPARATION",
        captureContext: "REAL",
        readinessBasis: "CONFIRMED_ACTIVE_WITNESS_FULL_DECLARED_WINDOW_EXACT_TABLE_PRIMARY_AND_BACKUP",
        summary: { expectedPollingPlaces: 1, placesWithoutExpectedTables: 0, placesWithoutCoverageWindows: 0, coverageWindowCount: 1, expectedTableWindows: 2, confirmedPrimaryTables: 0, confirmedBackupTables: 0, missingPrimaryTables: 2, missingBackupTables: 2, confirmedPrimaryUncoveredMinutes: 1200, confirmedBackupUncoveredMinutes: 1200, fullyConfirmed: false, ineligibleAssignmentCount: 0 },
        places: [{ puesto: coverageWindow.puesto, configurationReady: true, hasCoverageWindow: true, fullyConfirmed: false, windows: [{ window: { ...coverageWindow, puesto: undefined, captureContext: undefined, puestoId: undefined, version: undefined, durationMinutes: 600 }, primaryConfirmedTemporalGaps: [{ tableFrom: 1, tableTo: 2, gaps: [{ startsAt: coverageWindow.startsAt, endsAt: coverageWindow.endsAt, durationMinutes: 600 }] }], backupConfirmedTemporalGaps: [{ tableFrom: 1, tableTo: 2, gaps: [{ startsAt: coverageWindow.startsAt, endsAt: coverageWindow.endsAt, durationMinutes: 600 }] }], bothConfirmedTables: 0, fullyConfirmed: false }] }],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      }) });
      return;
    }
    if (path === "/api/witnesses/assignments" && route.request().method() === "POST") {
      postedBody = route.request().postDataJSON();
      await route.fulfill({ json: successful({ id: "assignment-a" }) });
      return;
    }
    if (path === "/api/witnesses/assignments") {
      await route.fulfill({ json: successful({ operationStage: "ELECTION_PREPARATION", readOnly: false, items: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } }) });
      return;
    }
    await route.fulfill({ json: successful({}) });
  });

  await page.goto("/dashboard/witness-planning");
  await expect(page.getByRole("heading", { name: "Planificación exacta de testigos" })).toBeVisible();
  await expect(page.getByText("BLOQUEADO")).toBeVisible();
  await expect(page.getByText(/1\.200 minutos-mesa PRIMARY/)).toBeVisible();

  await page.getByLabel("Ventana").selectOption("window-a");
  await page.getByLabel("Testigo activo").selectOption("witness-a");
  await page.getByLabel("Mesa inicial").fill("1");
  await page.getByLabel("Mesa final").fill("2");
  await page.getByRole("button", { name: "Planificar asignación" }).click();
  await expect(page.getByText("Asignación planificada. Aún debe confirmarse.")).toBeVisible();
  expect(postedBody).toMatchObject({
    coverageWindowId: "window-a",
    witnessId: "witness-a",
    puestoId: "place-a",
    tableStart: 1,
    tableEnd: 2,
    shiftStartsAt: coverageWindow.startsAt,
    shiftEndsAt: coverageWindow.endsAt,
  });
  expect(postedBody).not.toHaveProperty("tenantId");
});
