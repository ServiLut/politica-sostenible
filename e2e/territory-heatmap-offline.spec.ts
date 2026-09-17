import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "territory-offline-signature",
].join(".");

const passphrase = "Frase territorial offline segura 2026";
const tenant = {
  id: "tenant-heatmap-offline-e2e",
  name: "Campaña territorial verificable",
  slug: "campana-territorial-verificable",
  type: "CANDIDACY",
  operationStage: "CAMPAIGN",
};
const user = {
  id: "admin-heatmap-offline-e2e",
  email: "territory.admin@example.test",
  name: "Dirección territorial",
  role: "AdminCampana",
  backendRole: "ADMIN",
};
const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant,
  user,
};
const generatedAt = "2026-09-09T15:00:00.000Z";
const heatmap = {
  generatedAt,
  level: "DEPARTAMENTO",
  metric: {
    code: "E14_COVERAGE",
    label: "Cobertura E-14",
    unit: "PERCENT",
  },
  parent: null,
  breadcrumbs: [],
  privacy: {
    minimumReportableCount: null,
    rule: "La métrica no contiene conteos personales.",
  },
  items: [
    {
      id: "departamento-offline-05",
      code: "05",
      name: "Antioquia offline",
      type: "DEPARTAMENTO",
      parentId: null,
      hasChildren: false,
      nextLevel: null,
      value: 65,
      displayValue: "65 %",
      suppressed: false,
      intensity: 65,
      bucket: 4,
      operationalContext: { expectedTables: 200, acceptedTables: 130 },
      geo: {
        latitude: 6.2518,
        longitude: -75.5636,
        basis: "CENTROID",
        locatedPollingPlaces: 180,
        totalPollingPlaces: 200,
      },
    },
  ],
};

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

async function installSession(page: Page) {
  await page.addInitScript(
    ({ storageKey, storedSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(storedSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      storedSession: session,
    },
  );
}

test("guarda opt-in cifrado y usa solo el snapshot exacto con la bóveda desbloqueada", async ({
  context,
  page,
}) => {
  await installSession(page);
  let apiAvailable = true;
  let heatmapRequests = 0;

  await page.route("**/api/**", async (route) => {
    if (!apiAvailable) {
      await route.abort("internetdisconnected");
      return;
    }
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.backendRole,
              tenant,
            },
          }),
        ),
      });
      return;
    }
    if (url.pathname === "/api/billing/capabilities") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            plan: { code: "PRO", name: "Profesional" },
            features: { export: true, import: true, mfa: true },
          }),
        ),
      });
      return;
    }
    if (
      url.pathname === "/api/campaigns/territory-heatmap" &&
      request.method() === "GET"
    ) {
      heatmapRequests += 1;
      expect(url.searchParams.get("level")).toBe("DEPARTAMENTO");
      expect(url.searchParams.get("metric")).toBe("E14_COVERAGE");
      expect(url.searchParams.has("parentId")).toBe(false);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(heatmap)),
      });
      return;
    }
    if (
      url.pathname === "/api/campaigns/divisions" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [],
            pagination: {
              page: 1,
              limit: Number(url.searchParams.get("limit") ?? 24),
              total: 0,
              totalPages: 0,
            },
          }),
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

  try {
    await page.goto("/dashboard/territory");
    await expect(
      page.getByRole("heading", { name: "Mapa de calor operativo" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Antioquia offline: 65 %/ }),
    ).toBeVisible();
    await expect(page.getByText("Corte del servidor:")).toBeVisible();
    await expect(
      page.getByText(/nombres, códigos e identificadores de territorios/),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Guardar esta vista offline" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Bóveda offline" });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByText(/Desbloquea o crea la bóveda cifrada/),
    ).toBeVisible();
    await dialog.getByLabel("Frase operativa").fill(passphrase);
    await dialog.getByLabel("Confirmar frase").fill(passphrase);
    await dialog.getByRole("button", { name: "Crear bóveda cifrada" }).click();
    await expect(dialog.getByText(/Bóveda creada/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cerrar bóveda offline" }).click();

    await expect(
      page.getByRole("img", { name: /Antioquia offline: 65 %/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Guardar esta vista offline" })
      .click();
    await expect(
      page.getByText(/Vista cifrada guardada en este dispositivo/),
    ).toBeVisible();

    const localStorageSnapshot = await page.evaluate(async () => {
      const databases = await indexedDB.databases();
      const records: unknown[] = [];
      for (const descriptor of databases) {
        if (!descriptor.name?.startsWith("polsost-offline-vault-v2-")) {
          continue;
        }
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(descriptor.name!);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const stored = await new Promise<unknown[]>((resolve, reject) => {
          const request = database
            .transaction("records", "readonly")
            .objectStore("records")
            .getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        records.push(...stored);
        database.close();
      }
      const cachedApiRequests: string[] = [];
      const cachedBodies: string[] = [];
      for (const cacheName of await caches.keys()) {
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys()) {
          const path = new URL(request.url).pathname;
          if (path.startsWith("/api/")) cachedApiRequests.push(path);
          const response = await cache.match(request);
          if (response) cachedBodies.push(await response.text());
        }
      }
      return { records, cachedApiRequests, cachedBodies };
    });
    expect(localStorageSnapshot.records).toHaveLength(1);
    expect(localStorageSnapshot.cachedApiRequests).toEqual([]);
    const serialized = JSON.stringify(localStorageSnapshot.records);
    for (const forbidden of [
      "Antioquia offline",
      "departamento-offline-05",
      "E14_COVERAGE",
      "65 %",
      jwt,
      passphrase,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    const serializedCaches = JSON.stringify(localStorageSnapshot.cachedBodies);
    expect(serializedCaches).not.toContain("Antioquia offline");
    expect(serializedCaches).not.toContain("departamento-offline-05");

    await page.evaluate(async () => navigator.serviceWorker.ready);

    const onlineRequests = heatmapRequests;
    apiAvailable = false;
    await context.setOffline(true);
    await page.getByRole("button", { name: "Actualizar vista" }).click();
    await expect(page.getByText("Modo offline", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Puede estar desactualizada y no se actualizará/),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Antioquia offline: 65 %/ }),
    ).toBeVisible();
    await expect(page.getByText("Corte del servidor:")).toBeVisible();
    expect(heatmapRequests).toBeGreaterThanOrEqual(onlineRequests);

    await page.getByRole("button", { name: /^Bóveda offline/ }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Bloquear" }).click();
    await dialog.getByRole("button", { name: "Cerrar bóveda offline" }).click();
    await page.getByRole("button", { name: "Actualizar vista" }).click();
    await expect(
      page.getByText(
        "No fue posible conectar con el servidor. Intenta nuevamente.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Modo offline", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("img", { name: /Antioquia offline: 65 %/ }),
    ).toHaveCount(0);

    const requestsBeforeColdStart = heatmapRequests;
    await page.close();
    const coldPage = await context.newPage();
    try {
      await coldPage.goto("/aplicacion", { waitUntil: "domcontentloaded" });
      await expect(
        coldPage.getByRole("heading", { name: "Política Sostenible" }),
      ).toBeVisible();
      await coldPage
        .getByRole("button", { name: "Bóveda offline", exact: true })
        .click();
      const coldDialog = coldPage.getByRole("dialog", {
        name: "Bóveda offline",
      });
      await expect(
        coldDialog.getByRole("button", { name: "Cerrar bóveda offline" }),
      ).toBeFocused();
      await coldPage.keyboard.press("Escape");
      await expect(coldDialog).toBeHidden();
      await expect(
        coldPage.getByRole("button", {
          name: "Bóveda offline",
          exact: true,
        }),
      ).toBeFocused();
      await coldPage
        .getByRole("button", { name: "Bóveda offline", exact: true })
        .click();
      await expect(coldDialog.getByLabel("Frase operativa")).toBeVisible();
      await coldDialog.getByLabel("Frase operativa").fill(passphrase);
      await coldDialog
        .getByRole("button", { name: "Desbloquear bóveda" })
        .click();

      await expect(
        coldDialog.getByRole("heading", {
          name: "Mapas de calor guardados (1)",
        }),
      ).toBeVisible();
      await expect(coldDialog.getByText("MODO OFFLINE", { exact: true })).toBeVisible();
      await expect(
        coldDialog.getByText(/Pueden estar desactualizadas/),
      ).toBeVisible();
      await coldDialog
        .getByRole("button", { name: /Cobertura E-14/ })
        .click();
      const openedSnapshot = coldDialog.getByRole("article", {
        name: "Snapshot offline: Cobertura E-14",
      });
      await expect(openedSnapshot).toBeVisible();
      await expect(openedSnapshot.getByText("Antioquia offline")).toBeVisible();
      await expect(openedSnapshot.getByText("65 %")).toBeVisible();
      await expect(openedSnapshot.getByText("Copia local")).toBeVisible();
      await expect(
        openedSnapshot.getByText("Corte del servidor:", { exact: false }),
      ).toBeVisible();
      await expect(
        coldPage.evaluate(async () => {
          try {
            await fetch("/api/e2e-network-proof", { cache: "no-store" });
            return false;
          } catch {
            return true;
          }
        }),
      ).resolves.toBe(true);
      expect(heatmapRequests).toBe(requestsBeforeColdStart);
    } finally {
      await coldPage.close();
    }
  } finally {
    apiAvailable = true;
    await context.setOffline(false);
  }
});
