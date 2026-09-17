import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "offline-vault-signature",
].join(".");

const passphrase = "Frase operativa E2E segura 2026";
const authUser = {
  id: "volunteer-offline-e2e",
  email: "offline.volunteer@example.test",
  name: "Voluntaria offline",
  role: "Voluntario",
  backendRole: "VOLUNTEER",
  tenant: {
    id: "tenant-offline-e2e",
    name: "Campaña offline verificable",
    slug: "campana-offline",
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
const consentNotice = {
  id: "notice-offline-e2e",
  mode: "CAMPAIGN",
  purpose: "POLITICAL_COMMUNICATION",
  version: "campaign-2026-09-offline",
  title: "Autorización offline de tratamiento",
  content:
    "La persona autoriza de forma previa el tratamiento político informado.",
  controllerName: "Campaña offline verificable",
  contactEmail: "privacidad@example.test",
  privacyPolicyUrl: null,
  activatedAt: "2026-09-01T00:00:00.000Z",
};
const puesto = {
  id: "puesto-offline-central",
  code: "P-OFF-01",
  name: "Puesto Offline Central",
};

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
      disableSeedKey: "offline-vault-e2e.disable-auth-seed",
      storageKey: "politica-sostenible.auth-session",
      storedSession: session,
    },
  );
}

async function ensureServiceWorkerControl(page: Page) {
  await page.goto("/aplicacion");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
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
  browserContext: BrowserContext,
  value: boolean,
  setApiAvailability: (available: boolean) => void,
) {
  setApiAvailability(!value);
  await browserContext.setOffline(value);
}

async function fillMainCapture(page: Page, documentId: string) {
  await page.getByLabel("Nombres", { exact: true }).fill("Laura Offline");
  await page.getByLabel("Apellidos", { exact: true }).fill("Méndez Campo");
  await page.getByLabel("Documento", { exact: true }).fill(documentId);
  await page.getByLabel("Celular opcional", { exact: true }).fill("3204447788");
  await page
    .getByLabel("Correo opcional", { exact: true })
    .fill("laura.offline@example.test");
  await page.getByLabel("Mesa opcional", { exact: true }).fill("12");
  await page
    .getByRole("combobox", { name: /Canal real de la autorizaci/ })
    .selectOption("IN_PERSON");
  await page.getByRole("checkbox").check();
}

test("online → offline → captura cifrada → reload → unlock → sync foreground", async ({
  context,
  page,
}) => {
  await installSession(page);
  let apiAvailable = true;
  const syncPosts: Array<Record<string, unknown>> = [];
  const authorizationHeaders: string[] = [];

  await page.route("**/api/**", async (route) => {
    if (!apiAvailable) {
      await route.abort("internetdisconnected");
      return;
    }
    const request = route.request();
    const url = new URL(request.url());
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (url.pathname === "/api/auth/me" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful({ user: authUser })),
      });
      return;
    }
    if (
      url.pathname === "/api/voters/capture-context" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful({ puestos: [puesto], consentNotice })),
      });
      return;
    }
    if (
      url.pathname === "/api/logistics/sync/voter" &&
      request.method() === "POST"
    ) {
      const payload = request.postDataJSON() as Record<string, unknown>;
      syncPosts.push(payload);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              received: true,
              receiptId: `receipt-${String(payload.clientOperationId)}`,
              clientOperationId: payload.clientOperationId,
              operationType: "VOTER_CAPTURE",
              status: "APPLIED",
              capturedAt: payload.capturedAt,
              receivedAt: "2026-09-09T16:00:00.000Z",
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
  await page.goto("/dashboard/captura-territorial");
  await expect(
    page.getByRole("heading", { name: "Vinculación en territorio" }),
  ).toBeVisible();
  await expect(page.getByText(consentNotice.version)).toBeVisible();

  await page.getByRole("button", { name: /^Bóveda offline/ }).click();
  const dialog = page.getByRole("dialog", { name: "Bóveda offline" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Frase operativa").fill(passphrase);
  await dialog.getByLabel("Confirmar frase").fill(passphrase);
  await dialog.getByRole("button", { name: "Crear bóveda cifrada" }).click();
  await expect(
    dialog.getByText("Contexto territorial y aviso guardados cifrados."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar bóveda offline" }).click();

  await setOffline(context, true, (available) => {
    apiAvailable = available;
  });
  const encryptedSubmit = page.getByRole("button", {
    name: "Guardar cifrado para sincronizar",
  });
  await expect(encryptedSubmit).toBeVisible();

  await fillMainCapture(page, "1098765432");
  await encryptedSubmit.click();
  await expect(page.getByRole("status")).toContainText(
    "Captura guardada cifrada en este dispositivo",
  );
  await expect(
    page.getByRole("button", { name: "Bóveda offline · 1" }),
  ).toBeVisible();

  const storedSnapshot = await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const result: Array<{ database: string; records: unknown[] }> = [];
    for (const descriptor of databases) {
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
  const serializedSnapshot = JSON.stringify(storedSnapshot);
  expect(storedSnapshot).toHaveLength(1);
  expect(serializedSnapshot).not.toContain("1098765432");
  expect(serializedSnapshot).not.toContain("Laura Offline");
  expect(serializedSnapshot).not.toContain("laura.offline@example.test");
  expect(serializedSnapshot).not.toContain(jwt);
  expect(serializedSnapshot).not.toContain(passphrase);

  const cachedPathsBeforeSync = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        paths.push(new URL(request.url).pathname);
      }
    }
    return paths;
  });
  expect(cachedPathsBeforeSync.some((path) => path.startsWith("/api/"))).toBe(
    false,
  );
  expect(cachedPathsBeforeSync).not.toContain("/dashboard/captura-territorial");

  await page.evaluate(() => {
    window.sessionStorage.removeItem("politica-sostenible.auth-session");
    window.localStorage.setItem("offline-vault-e2e.disable-auth-seed", "1");
  });

  await page.goto("/aplicacion", { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Política Sostenible" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bóveda offline" }).click();
  const offlineDialog = page.getByRole("dialog", { name: "Bóveda offline" });
  await expect(
    offlineDialog.getByRole("button", { name: "Desbloquear bóveda" }),
  ).toBeVisible();
  await offlineDialog.getByLabel("Frase operativa").fill(passphrase);
  await offlineDialog
    .getByRole("button", { name: "Desbloquear bóveda" })
    .click();
  await expect(
    offlineDialog.getByText("Operaciones locales (1)"),
  ).toBeVisible();
  await expect(offlineDialog).not.toContainText("Laura Offline");
  await expect(offlineDialog).not.toContainText("1098765432");
  await expect(
    offlineDialog.getByRole("button", { name: "Sincronizar pendientes (1)" }),
  ).toBeVisible();
  expect(syncPosts).toHaveLength(0);

  await setOffline(context, false, (available) => {
    apiAvailable = available;
  });
  await page.evaluate((storedSession) => {
    window.localStorage.removeItem("offline-vault-e2e.disable-auth-seed");
    window.sessionStorage.setItem(
      "politica-sostenible.auth-session",
      JSON.stringify(storedSession),
    );
    window.dispatchEvent(new Event("politica-sostenible:auth-session-changed"));
  }, session);
  const syncButton = offlineDialog.getByRole("button", {
    name: "Sincronizar pendientes (1)",
  });
  await expect(syncButton).toBeEnabled();
  await syncButton.click();
  await expect(
    offlineDialog.getByText("1 operación(es) recibida(s) por el servidor."),
  ).toBeVisible();
  await expect(
    offlineDialog.getByText("Operaciones locales (0)"),
  ).toBeVisible();
  await expect(
    offlineDialog.getByRole("button", { name: "Sincronizar pendientes (0)" }),
  ).toBeDisabled();

  expect(syncPosts).toHaveLength(1);
  expect(syncPosts[0]).toMatchObject({
    documentId: "1098765432",
    firstName: "Laura Offline",
    lastName: "Méndez Campo",
    phone: "3204447788",
    email: "laura.offline@example.test",
    puestoId: puesto.id,
    mesa: 12,
    consentAccepted: true,
    termsVersion: consentNotice.version,
    collectionChannel: "IN_PERSON",
  });
  expect(syncPosts[0].clientOperationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(syncPosts[0].capturedAt).toMatch(/Z$/);
  expect(syncPosts[0]).not.toHaveProperty("tenantId");
  expect(syncPosts[0]).not.toHaveProperty("userId");
  expect(syncPosts[0]).not.toHaveProperty("accessToken");
  expect(
    authorizationHeaders.every((header) => header === `Bearer ${jwt}`),
  ).toBe(true);

  const retainedRecords = await page.evaluate(async (databaseName) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ type?: string }>>(
      (resolve, reject) => {
        const request = database
          .transaction("records", "readonly")
          .objectStore("records")
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    database.close();
    return records;
  }, storedSnapshot[0].database);
  expect(
    retainedRecords.filter((record) => record.type === "VOTER_CAPTURE"),
  ).toEqual([]);
  expect(JSON.stringify(retainedRecords)).not.toContain("1098765432");

  const cachedPathsAfterSync = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        paths.push(new URL(request.url).pathname);
      }
    }
    return paths;
  });
  expect(cachedPathsAfterSync.some((path) => path.startsWith("/api/"))).toBe(
    false,
  );

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    offlineDialog.getByRole("button", { name: "Desbloquear bóveda" }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const ephemeralPhrase = offlineDialog.getByLabel("Frase operativa");
  await ephemeralPhrase.fill("Esta frase temporal debe limpiarse");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(ephemeralPhrase).toHaveValue("");
});

test("un 4xx jamás se encola y una falla de red exige una segunda acción explícita", async ({
  page,
}) => {
  await installSession(page);
  let voterMutation: "REJECT" | "NETWORK" = "REJECT";

  await page.route("**/api/**", async (route) => {
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
    if (path === "/api/voters/capture-context") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful({ puestos: [puesto], consentNotice })),
      });
      return;
    }
    if (path === "/api/voters" && request.method() === "POST") {
      if (voterMutation === "NETWORK") {
        await route.abort("connectionfailed");
      } else {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 422,
            message: "La API rechazó la captura de prueba.",
          }),
        });
      }
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/captura-territorial");
  await expect(page.getByText(consentNotice.version)).toBeVisible();
  await page.getByRole("button", { name: /^Bóveda offline/ }).click();
  const dialog = page.getByRole("dialog", { name: "Bóveda offline" });
  await dialog.getByLabel("Frase operativa").fill(passphrase);
  await dialog.getByLabel("Confirmar frase").fill(passphrase);
  await dialog.getByRole("button", { name: "Crear bóveda cifrada" }).click();
  await expect(
    dialog.getByText("Contexto territorial y aviso guardados cifrados."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar bóveda offline" }).click();

  await fillMainCapture(page, "1012345678");
  const onlineSubmit = page.getByRole("button", {
    name: "Guardar con trazabilidad",
  });
  await onlineSubmit.click();
  await expect(
    page.getByText("La API rechazó la captura de prueba."),
  ).toBeVisible();
  await expect(onlineSubmit).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bóveda offline" }),
  ).toBeVisible();

  voterMutation = "NETWORK";
  await onlineSubmit.click();
  await expect(page.getByText(/no se encoló automáticamente/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bóveda offline" }),
  ).toBeVisible();

  const explicitEncryptedSave = page.getByRole("button", {
    name: "Guardar cifrado para sincronizar",
  });
  await explicitEncryptedSave.click();
  await expect(
    page.getByRole("button", { name: "Bóveda offline · 1" }),
  ).toBeVisible();
});
