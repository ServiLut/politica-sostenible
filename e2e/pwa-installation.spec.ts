import { expect, test, type Page } from "@playwright/test";

async function waitForControlledServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;

    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => resolve(),
        {
          once: true,
        },
      );
    });
  });
}

test("expone un manifiesto instalable y recursos PWA con cabeceras seguras", async ({
  page,
}) => {
  await page.goto("/aplicacion");
  await expect(
    page.getByRole("heading", { name: "Política Sostenible" }),
  ).toBeVisible();

  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute("href", "/manifest.webmanifest");

  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  expect(manifestResponse.headers()["cache-control"]).toContain(
    "must-revalidate",
  );
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    id: "/",
    start_url: "/aplicacion?origen=pwa",
    scope: "/",
    display: "standalone",
  });

  for (const icon of manifest.icons as Array<{ src: string }>) {
    const response = await page.request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()["content-type"], icon.src).toContain("image/png");
  }

  const workerResponse = await page.request.get("/sw.js");
  expect(workerResponse.status()).toBe(200);
  expect(workerResponse.headers()["content-type"]).toContain(
    "application/javascript",
  );
  expect(workerResponse.headers()["service-worker-allowed"]).toBe("/");
  expect(workerResponse.headers()["cache-control"]).toContain(
    "must-revalidate",
  );
});

test("el control de instalación usa el prompt del navegador", async ({
  page,
}) => {
  await page.goto("/aplicacion");

  const installButton = page.getByRole("button", {
    name: "Instalar aplicación",
  });
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        const installEvent = new Event("beforeinstallprompt");
        Object.defineProperties(installEvent, {
          prompt: {
            value: async () => {
              Object.assign(window, { __pwaInstallPromptCalled: true });
            },
          },
          userChoice: {
            value: Promise.resolve({ outcome: "accepted", platform: "web" }),
          },
        });
        window.dispatchEvent(installEvent);
      });
      return installButton.isVisible();
    })
    .toBe(true);
  await installButton.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __pwaInstallPromptCalled?: boolean })
            .__pwaInstallPromptCalled === true,
      ),
    )
    .toBe(true);
  await expect(installButton).toBeHidden();
});

test("muestra instrucciones de instalación para iPhone y iPad", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperties(navigator, {
      userAgent: {
        configurable: true,
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      },
      platform: { configurable: true, value: "iPhone" },
      maxTouchPoints: { configurable: true, value: 5 },
    });
    window.addEventListener(
      "beforeinstallprompt",
      (event) => event.stopImmediatePropagation(),
      true,
    );
  });

  await page.goto("/aplicacion");
  const guide = page.getByText("Cómo instalar en iPhone o iPad", {
    exact: true,
  });
  await expect(guide).toBeVisible();
  await guide.click();
  await expect(
    page.getByText("Agregar a pantalla de inicio", { exact: false }),
  ).toBeVisible();
});

test("una respuesta API nunca entra a las caches del worker", async ({
  page,
}) => {
  const privateMarker = "DOCUMENTO-PRIVADO-NO-CACHEAR";
  await page.route("**/api/pwa-cache-probe", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ marker: privateMarker }),
    }),
  );
  await page.goto("/aplicacion");
  await waitForControlledServiceWorker(page);

  const responseMarker = await page.evaluate(async () => {
    const response = await fetch("/api/pwa-cache-probe", {
      cache: "no-store",
      headers: { Authorization: "Bearer token-de-prueba-no-persistir" },
    });
    return ((await response.json()) as { marker: string }).marker;
  });
  expect(responseMarker).toBe(privateMarker);

  const cachedApiEntries = await page.evaluate(async () => {
    const matches: string[] = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.startsWith("/api/")) {
          matches.push(`${cacheName}:${request.url}`);
        }
      }
    }
    return matches;
  });
  expect(cachedApiEntries).toEqual([]);
});

test("abre el launcher precargado y usa fallback explícito sin red", async ({
  context,
  page,
}) => {
  await page.goto("/aplicacion");
  await waitForControlledServiceWorker(page);

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const shellNames = (await caches.keys()).filter((name) =>
          /^polsost-shell-v5-(?:[a-f0-9]{40}|unversioned-v5)$/.test(name),
        );
        for (const name of shellNames) {
          const cache = await caches.open(name);
          if (
            (await cache.match("/aplicacion")) &&
            (await cache.match("/offline.html"))
          ) {
            return true;
          }
        }
        return false;
      }),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Política Sostenible" }),
  ).toBeVisible();
  // Chromium's protocol-level network emulation does not update
  // navigator.onLine. Reproduce the browser signal separately so the status
  // indicator and the real network failure are both covered.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    window.dispatchEvent(new Event("offline"));
  });
  await expect(page.getByTestId("pwa-connectivity-status")).toContainText(
    "Sin conexión",
  );

  await page.goto("/ruta-no-disponible-sin-conexion", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "Sin conexión a internet" }),
  ).toBeVisible();
  await expect(
    page.getByText("no contiene datos de campaña", { exact: false }),
  ).toBeVisible();
});
