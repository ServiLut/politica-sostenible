import { expect, test } from "@playwright/test";

test("la PWA abre la bóveda desde un shell real sin red y nunca cachea API ni dashboard", async ({
  context,
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/aplicacion?origen=prueba-pwa");
  await expect(
    page.getByRole("heading", { name: "Política Sostenible" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Bóveda offline/ }),
  ).toBeVisible();

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            "serviceWorker" in navigator &&
            navigator.serviceWorker.controller !== null,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);

  const cacheEvidence = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const cacheNames = await caches.keys();
    const entries = (
      await Promise.all(
        cacheNames.map(async (cacheName) => {
          const cache = await caches.open(cacheName);
          return (await cache.keys()).map((request) => ({
            cacheName,
            url: request.url,
          }));
        }),
      )
    ).flat();

    return {
      cacheNames,
      entries,
      scriptUrl:
        registration?.active?.scriptURL ??
        registration?.waiting?.scriptURL ??
        null,
    };
  });

  expect(cacheEvidence.scriptUrl).toMatch(
    /\/sw\.js\?revision=(?:[a-f0-9]{40}|unversioned-v5)$/,
  );
  expect(
    cacheEvidence.cacheNames.some((name) =>
      name.startsWith("polsost-offline-assets-v5-"),
    ),
  ).toBe(true);
  expect(
    cacheEvidence.cacheNames.some((name) =>
      name.startsWith("polsost-runtime-static-v5-"),
    ),
  ).toBe(true);
  expect(
    cacheEvidence.cacheNames.some((name) =>
      name.startsWith("polsost-shell-v5-"),
    ),
  ).toBe(true);
  expect(
    cacheEvidence.entries.some(
      ({ url }) => new URL(url).pathname === "/aplicacion",
    ),
  ).toBe(true);
  expect(
    cacheEvidence.entries.some(({ url }) => {
      const cachedUrl = new URL(url);
      return (
        cachedUrl.pathname === "/api" ||
        cachedUrl.pathname.startsWith("/api/") ||
        cachedUrl.pathname.startsWith("/dashboard") ||
        cachedUrl.searchParams.has("_rsc")
      );
    }),
  ).toBe(false);

  await context.setOffline(true);
  try {
    await page.goto("/aplicacion?origen=sin-red", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Política Sostenible" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Bóveda offline/ }),
    ).toBeVisible();

    await page.goto("/dashboard/executive", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Sin conexión a internet" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Abrir aplicación sin conexión" })
      .click();
    await expect(
      page.getByRole("button", { name: /Bóveda offline/ }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }

  expect(pageErrors).toEqual([]);
});
