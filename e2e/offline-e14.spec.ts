import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "offline-e14-signature",
].join(".");
const passphrase = "Frase E-14 offline segura 2026";
const captureGrant = "G".repeat(43);
const originalFileName = "mesa-7-testigo-privado.pdf";
const credentialReference = "E15-BOG-E2E-0007";
const tenant = {
  id: "tenant-offline-e14",
  name: "Campaña E-14 verificable",
  slug: "campana-e14",
  type: "CANDIDACY",
  operationStage: "SIMULATION",
};
const authUser = {
  id: "witness-offline-e14",
  email: "testigo.e14@example.test",
  name: "Testigo E-14",
  role: "Testigo",
  backendRole: "WITNESS",
  tenant,
};
const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant,
  user: {
    id: authUser.id,
    email: authUser.email,
    name: authUser.name,
    role: authUser.role,
    backendRole: authUser.backendRole,
  },
};
const puesto = {
  id: "puesto-offline-e14",
  code: "P-E14-01",
  name: "Colegio E-14 Offline",
  expectedTables: 12,
  sourceLocationCode: "1001",
  votingDate: "2026-09-20",
  timeZone: "America/Bogota",
  address: "Calle 1 # 2-3",
  commune: "Kennedy",
};
const evidence = Buffer.from("%PDF-1.7\nprivate offline E14 evidence");
const confirmedPath =
  "tenant-offline-e14/e14/22222222-2222-4222-8222-222222222222.pdf";

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

async function installSession(page: Page) {
  await page.addInitScript(
    ({ disableSeedKey, storageKey, storedSession }) => {
      if (window.localStorage.getItem(disableSeedKey) === "1") return;
      window.sessionStorage.setItem(storageKey, JSON.stringify(storedSession));
    },
    {
      disableSeedKey: "offline-e14-e2e.disable-auth-seed",
      storageKey: "politica-sostenible.auth-session",
      storedSession: session,
    },
  );
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

async function allVaultRecords(page: Page) {
  return page.evaluate(async () => {
    const result: Array<{ database: string; records: unknown[] }> = [];
    for (const descriptor of await indexedDB.databases()) {
      if (!descriptor.name?.startsWith("polsost-offline-vault-v2-")) continue;
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
      result.push({ database: descriptor.name, records });
      database.close();
    }
    return result;
  });
}

async function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });
}

async function disconnect(
  context: BrowserContext,
  setApiOnline: (online: boolean) => void,
) {
  setApiOnline(false);
  await context.setOffline(true);
}

test("E-14 SIMULACRO: provision → offline/reload → direct PUT → durable receipt", async ({
  context,
  page,
}) => {
  await installSession(page);
  let apiOnline = true;
  const apiBodies: Array<{ path: string; body: Record<string, unknown> }> = [];
  const directUploads: Array<{ method: string; body: Buffer | null }> = [];
  let operationId = "";
  let capturedAt = "";

  await page.route("**/storage/v1/object/upload/sign/**", async (route) => {
    directUploads.push({
      method: route.request().method(),
      body: route.request().postDataBuffer(),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ Key: "private-evidence/" + confirmedPath }),
    });
  });

  await page.route("**/api/**", async (route: Route) => {
    if (!apiOnline) {
      await route.abort("internetdisconnected");
      return;
    }
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.postDataJSON() as Record<string, unknown> | null;
    if (body) apiBodies.push({ path, body });

    if (path === "/api/auth/me" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful({ user: authUser })),
      });
      return;
    }
    if (path === "/api/witnesses/offline-capture-grants" && method === "POST") {
      const now = Date.now();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              schemaVersion: 3,
              captureGrant,
              captureContext: "SIMULATION",
              issuedAt: new Date(now - 60_000).toISOString(),
              expiresAt: new Date(now + 6 * 60 * 60_000).toISOString(),
              electionDate: "2026-09-20",
              votingStartDate: "2026-09-20",
              votingEndDate: "2026-09-20",
              electionWindowSha256: "e".repeat(64),
              places: [puesto],
            },
            201,
          ),
        ),
      });
      return;
    }
    if (path === "/api/storage/upload-url" && method === "POST") {
      expect(body).toMatchObject({
        module: "e14",
        contentType: "application/pdf",
        size: evidence.length,
      });
      expect(body?.fileName).toMatch(/^e14-[0-9a-f]{8}-[0-9a-f-]{27}\.pdf$/i);
      expect(body?.contentSha256).toMatch(/^[0-9a-f]{64}$/);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              bucket: "private-evidence",
              path: confirmedPath,
              uploadUrl:
                "http://127.0.0.1:3000/mock-supabase/storage/v1/object/upload/sign/private-evidence/" +
                confirmedPath,
              uploadToken: "signed-upload-token-ephemeral",
              method: "PUT",
              headers: { "Content-Type": "application/pdf" },
              metadata: {
                fileName: body?.fileName,
                contentType: "application/pdf",
                size: evidence.length,
                contentSha256: body?.contentSha256,
              },
            },
            201,
          ),
        ),
      });
      return;
    }
    if (path === "/api/storage/complete" && method === "POST") {
      expect(body).toMatchObject({
        module: "e14",
        path: confirmedPath,
        metadata: {
          contentType: "application/pdf",
          size: evidence.length,
        },
      });
      expect(JSON.stringify(body)).not.toContain("signed-upload-token");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            { confirmed: true, path: confirmedPath, module: "e14" },
            201,
          ),
        ),
      });
      return;
    }
    if (path === "/api/logistics/sync/e14" && method === "POST") {
      operationId = String(body?.clientOperationId);
      capturedAt = String(body?.capturedAt);
      expect(body).toMatchObject({
        puestoId: puesto.id,
        mesa: 7,
        credentialReference,
        e14ImageUrl: confirmedPath,
        captureGrant,
      });
      expect(body?.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(body).not.toHaveProperty("tenantId");
      expect(body).not.toHaveProperty("actorUserId");
      expect(body).not.toHaveProperty("captureContext");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              received: true,
              receiptId: "receipt-e14-e2e",
              clientOperationId: operationId,
              operationType: "E14_REPORT",
              status: "APPLIED",
              capturedAt,
              receivedAt: new Date().toISOString(),
              captureContext: "SIMULATION",
            },
            201,
          ),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ statusCode: 404, message: "Unexpected request" }),
    });
  });

  await ensureServiceWorkerControl(page);
  await page.getByRole("button", { name: /^Bóveda offline/ }).click();
  let dialog = page.getByRole("dialog", { name: "Bóveda offline" });
  await dialog.getByLabel("Frase operativa").fill(passphrase);
  await dialog.getByLabel("Confirmar frase").fill(passphrase);
  await dialog.getByRole("button", { name: "Crear bóveda cifrada" }).click();
  await dialog
    .getByRole("button", { name: "Provisionar capacidad E-14" })
    .click();
  await expect(dialog.getByText(/Contexto SIMULACRO/)).toBeVisible();

  await disconnect(context, (online) => {
    apiOnline = online;
  });
  await dialog.getByLabel("Puesto autorizado").selectOption(puesto.id);
  await dialog.getByLabel("Mesa", { exact: true }).fill("7");
  await dialog.getByLabel("Referencia de credencial").fill(credentialReference);
  await dialog.getByLabel("Candidatura").fill("80");
  await dialog.getByLabel("Blancos").fill("5");
  await dialog.getByLabel("Nulos").fill("3");
  await dialog.getByLabel("No marcados").fill("2");
  await dialog.getByLabel("Total mesa").fill("200");
  await dialog.getByLabel("Archivo privado del E-14").setInputFiles({
    name: originalFileName,
    mimeType: "application/pdf",
    buffer: evidence,
  });
  await dialog
    .getByRole("button", {
      name: "Guardar acta cifrada en este dispositivo",
    })
    .click();
  await expect(
    dialog.getByText("E-14 cifrado localmente. Aún no ha sido recibido"),
  ).toBeVisible();
  await expect(dialog.getByText(/Reporte E-14/)).toBeVisible();
  await expect(dialog.getByText(/SIMULACRO/).last()).toBeVisible();

  const encrypted = await allVaultRecords(page);
  expect(encrypted).toHaveLength(1);
  const serialized = JSON.stringify(encrypted);
  for (const secret of [
    captureGrant,
    originalFileName,
    credentialReference,
    evidence.toString("utf8"),
    jwt,
    passphrase,
    "signed-upload-token-ephemeral",
  ]) {
    expect(serialized).not.toContain(secret);
  }
  const cachesBefore = await cachedUrls(page);
  expect(cachesBefore.some((url) => url.includes("/api/"))).toBe(false);
  expect(cachesBefore.some((url) => url.includes("/storage/v1/"))).toBe(false);

  await page.evaluate(() => {
    window.sessionStorage.removeItem("politica-sostenible.auth-session");
    window.localStorage.setItem("offline-e14-e2e.disable-auth-seed", "1");
  });
  await page.goto("/aplicacion", { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Bóveda offline" }).click();
  dialog = page.getByRole("dialog", { name: "Bóveda offline" });
  await dialog.getByLabel("Frase operativa").fill(passphrase);
  await dialog.getByRole("button", { name: "Desbloquear bóveda" }).click();
  await expect(dialog.getByText("Operaciones locales (1)")).toBeVisible();
  await expect(dialog).not.toContainText(originalFileName);
  await expect(dialog).not.toContainText(credentialReference);
  await expect(
    dialog.getByRole("button", { name: "Sincronizar pendientes (1)" }),
  ).toBeVisible();
  expect(directUploads).toHaveLength(0);
  expect(apiBodies.some(({ path }) => path === "/api/logistics/sync/e14")).toBe(
    false,
  );

  apiOnline = true;
  await context.setOffline(false);
  await page.evaluate((storedSession) => {
    window.localStorage.removeItem("offline-e14-e2e.disable-auth-seed");
    window.sessionStorage.setItem(
      "politica-sostenible.auth-session",
      JSON.stringify(storedSession),
    );
    window.dispatchEvent(new Event("politica-sostenible:auth-session-changed"));
  }, session);
  const sync = dialog.getByRole("button", {
    name: "Sincronizar pendientes (1)",
  });
  await expect(sync).toBeEnabled();
  await sync.click();
  await expect(
    dialog.getByText("1 operación(es) recibida(s) por el servidor."),
  ).toBeVisible();
  await expect(dialog.getByText("Operaciones locales (0)")).toBeVisible();

  expect(directUploads).toHaveLength(1);
  expect(directUploads[0].method).toBe("PUT");
  const directBody = directUploads[0].body?.toString("utf8") ?? "";
  expect(directBody).toContain(evidence.toString("utf8"));
  expect(directBody).toContain("contentSha256");
  expect(directBody).toMatch(/e14-[0-9a-f-]{36}\.pdf/i);
  expect(directBody).not.toContain(originalFileName);
  expect(operationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(capturedAt).toMatch(/Z$/);
  expect(apiBodies.map(({ path }) => path)).toEqual([
    "/api/storage/upload-url",
    "/api/storage/complete",
    "/api/logistics/sync/e14",
  ]);

  const retained = await allVaultRecords(page);
  expect(
    retained
      .flatMap(({ records }) => records)
      .filter((record) => (record as { type?: string }).type === "E14_REPORT"),
  ).toEqual([]);
  expect(JSON.stringify(retained)).not.toContain(originalFileName);
  const cachesAfter = await cachedUrls(page);
  expect(cachesAfter.some((url) => url.includes("/api/"))).toBe(false);
  expect(cachesAfter.some((url) => url.includes("/storage/v1/"))).toBe(false);
});
