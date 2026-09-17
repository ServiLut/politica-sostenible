import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.setTimeout(60_000);

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "offline-incident-signature",
].join(".");
const passphrase = "Frase offline incidentes 2026";
const authUser = {
  id: "operator-offline-incident-e2e",
  email: "incident.operator@example.test",
  name: "Operación territorial",
  role: "Voluntario",
  backendRole: "VOLUNTEER",
  tenant: {
    id: "tenant-offline-incident-e2e",
    name: "Campaña offline verificable",
    slug: "campana-offline-incidentes",
    type: "CANDIDACY",
  },
};
const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant: authUser.tenant,
  user: {
    id: authUser.id,
    email: authUser.email,
    name: authUser.name,
    role: authUser.role,
    backendRole: authUser.backendRole,
  },
};

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

async function installSession(page: Page) {
  await page.addInitScript((storedSession) => {
    if (window.localStorage.getItem("offline-incident-e2e.no-auth") === "1") {
      return;
    }
    window.sessionStorage.setItem(
      "politica-sostenible.auth-session",
      JSON.stringify(storedSession),
    );
  }, session);
}

async function ensureServiceWorkerControl(page: Page) {
  await page.goto("/aplicacion");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  if (
    !(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
  ) {
    await page.reload();
  }
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
}

async function setOffline(
  context: BrowserContext,
  value: boolean,
  setApiAvailable: (available: boolean) => void,
) {
  setApiAvailable(!value);
  await context.setOffline(value);
}

test("provisiona, captura incidente offline, recupera calendario en cold-start y sincroniza con recibo", async ({
  context,
  page,
}) => {
  await installSession(page);
  let apiAvailable = true;
  const incidentPosts: Array<Record<string, unknown>> = [];

  await page.route("**/api/**", async (route) => {
    if (!apiAvailable) {
      await route.abort("internetdisconnected");
      return;
    }
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful({ user: authUser })),
      });
      return;
    }
    if (path === "/api/offline-incidents/context") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            schemaVersion: 1,
            provisionedAt: "2026-09-09T14:00:00.000Z",
            stage: "CAMPAIGN",
            requiresTerritory: true,
            categories: [
              "SECURITY",
              "LOGISTICS",
              "ELECTORAL_MATERIAL",
              "ACCESSIBILITY",
              "PUBLIC_ORDER",
              "TECHNOLOGY",
              "COMPLIANCE",
              "OTHER",
            ],
            priorities: ["LOW", "MEDIUM", "HIGH", "URGENT"],
            territories: [
              {
                id: "zona-offline-kennedy",
                code: "11-08",
                name: "Kennedy",
                type: "ZONA",
              },
            ],
          }),
        ),
      });
      return;
    }
    if (path === "/api/electoral-calendar") {
      const milestone = {
        id: "milestone-election-day-e2e",
        stableKey: "election-day",
        category: "ELECTION_DAY",
        semantics: "EXTERNAL_DEADLINE",
        title: "Jornada electoral verificada",
        localDate: "2026-10-25",
        localTime: "08:00",
        timeZone: "America/Bogota",
        responsible: { name: "Coordinación operativa" },
        backup: { name: "Suplencia operativa" },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            disclaimer: "Fechas documentadas, no cálculo jurídico.",
            evaluatedAt: "2026-09-09T14:00:00.000Z",
            readOnly: false,
            profile: {},
            operators: [],
            activeSummary: {
              activeReleaseId: "release-active-e2e",
              upcoming30Days: [],
              overdue: [],
              alertsDue: [],
              potentialAssignmentConflicts: [],
              unresolvedRequiredGates: [],
            },
            releases: [
              {
                id: "release-active-e2e",
                status: "ACTIVE",
                versionLabel: "RNEC-v3",
                roundCode: "UNICA",
                sourceSha256: "d".repeat(64),
                sourceCutoffAt: "2026-09-09T13:00:00.000Z",
                milestones: [milestone],
              },
            ],
          }),
        ),
      });
      return;
    }
    if (path === "/api/offline-incidents/sync" && request.method() === "POST") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      incidentPosts.push(payload);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              received: true,
              receiptId: `receipt-${String(payload.clientOperationId)}`,
              clientOperationId: payload.clientOperationId,
              operationType: "INCIDENT_REPORT",
              status: "APPLIED",
              capturedAt: payload.capturedAt,
              receivedAt: "2026-09-09T16:00:00.000Z",
              payloadSha256: payload.payloadSha256,
            },
            201,
          ),
        ),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await ensureServiceWorkerControl(page);
  await page.getByRole("button", { name: /^Bóveda offline/ }).click();
  let dialog = page.getByRole("dialog", { name: "Bóveda offline" });
  await dialog.getByLabel("Frase operativa").fill(passphrase);
  await dialog.getByLabel("Confirmar frase").fill(passphrase);
  await dialog.getByRole("button", { name: "Crear bóveda cifrada" }).click();
  await dialog.getByRole("button", { name: "Provisionar incidentes" }).click();
  await expect(dialog.getByText(/Rol y alcance territorial/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Guardar calendario ACTIVE" })
    .click();
  await expect(dialog.getByText(/Calendario ACTIVE RNEC-v3/)).toBeVisible();

  await setOffline(context, true, (available) => {
    apiAvailable = available;
  });
  await dialog.getByLabel(/Territorio/).selectOption("zona-offline-kennedy");
  await dialog.getByLabel("Título operativo").fill("Falta material operativo");
  await dialog
    .getByLabel("Descripción sin datos personales")
    .fill("El punto reporta faltante del insumo operativo previsto.");
  await dialog
    .getByRole("button", { name: "Guardar cifrado y pendiente" })
    .click();
  await expect(dialog.getByText(/Incidente cifrado localmente/)).toBeVisible();
  await expect(dialog.getByText("Operaciones locales (1)")).toBeVisible();

  const localCiphertext = await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const descriptor = databases.find((item) =>
      item.name?.startsWith("polsost-offline-vault-v2-"),
    );
    if (!descriptor?.name) return "";
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(descriptor.name!);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const request = database
        .transaction("records", "readonly")
        .objectStore("records")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return JSON.stringify(records);
  });
  expect(localCiphertext).not.toContain("Falta material operativo");
  expect(localCiphertext).not.toContain("Jornada electoral verificada");
  expect(localCiphertext).not.toContain(jwt);
  expect(localCiphertext).not.toContain(passphrase);

  await page.evaluate(() => {
    window.sessionStorage.removeItem("politica-sostenible.auth-session");
    window.localStorage.setItem("offline-incident-e2e.no-auth", "1");
  });
  await page.goto("/aplicacion", { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Bóveda offline" }).click();
  dialog = page.getByRole("dialog", { name: "Bóveda offline" });
  await dialog.getByLabel("Frase operativa").fill(passphrase);
  await dialog.getByRole("button", { name: "Desbloquear bóveda" }).click();
  await expect(dialog.getByText("Jornada electoral verificada")).toBeVisible();
  await expect(
    dialog.getByText(/viendo el corte cifrado guardado/),
  ).toBeVisible();
  await expect(dialog.getByText(/^Incidente de campaña ·/)).toBeVisible();
  expect(incidentPosts).toHaveLength(0);

  await setOffline(context, false, (available) => {
    apiAvailable = available;
  });
  await page.evaluate((storedSession) => {
    window.localStorage.removeItem("offline-incident-e2e.no-auth");
    window.sessionStorage.setItem(
      "politica-sostenible.auth-session",
      JSON.stringify(storedSession),
    );
    window.dispatchEvent(new Event("politica-sostenible:auth-session-changed"));
  }, session);
  await dialog
    .getByRole("button", { name: "Sincronizar pendientes (1)" })
    .click();
  await expect(dialog.getByText("Operaciones locales (0)")).toBeVisible();
  expect(incidentPosts).toHaveLength(1);
  expect(incidentPosts[0]).toMatchObject({
    category: "LOGISTICS",
    priority: "MEDIUM",
    title: "Falta material operativo",
    description: "El punto reporta faltante del insumo operativo previsto.",
    divisionId: "zona-offline-kennedy",
  });
  expect(incidentPosts[0].payloadSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(incidentPosts[0]).not.toHaveProperty("tenantId");
  expect(incidentPosts[0]).not.toHaveProperty("mode");
});
