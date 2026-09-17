import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import applicationManifest from "../../app/manifest";
import {
  isIosInstallPlatform,
  serviceWorkerScriptUrl,
} from "./ServiceWorkerRegistration";

const webDirectory = resolve(process.cwd(), "apps/web");
const publicDirectory = resolve(webDirectory, "public");
const serviceWorker = readFileSync(resolve(publicDirectory, "sw.js"), "utf8");
const registration = readFileSync(
  resolve(webDirectory, "components/pwa/ServiceWorkerRegistration.tsx"),
  "utf8",
);
const nextConfiguration = readFileSync(
  resolve(webDirectory, "next.config.ts"),
  "utf8",
);

function pngDimensions(path: string) {
  const image = readFileSync(path);
  expect(image.subarray(1, 4).toString("ascii")).toBe("PNG");
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

test("el manifiesto nativo declara identidad, alcance e iconos raster portables", () => {
  const manifest = applicationManifest();

  expect(manifest).toMatchObject({
    id: "/",
    lang: "es-CO",
    start_url: "/aplicacion?origen=pwa",
    scope: "/",
    display: "standalone",
    prefer_related_applications: false,
  });

  const expectedIcons = new Map([
    ["/icons/icon-192.png", 192],
    ["/icons/icon-512.png", 512],
    ["/icons/icon-maskable-512.png", 512],
  ]);
  expect(manifest.icons).toHaveLength(expectedIcons.size);

  for (const icon of manifest.icons ?? []) {
    const expectedSize = expectedIcons.get(icon.src);
    expect(expectedSize, `icono inesperado ${icon.src}`).toBeDefined();
    expect(
      pngDimensions(resolve(publicDirectory, icon.src.replace(/^\//, ""))),
    ).toEqual({ width: expectedSize, height: expectedSize });
  }

  expect(
    pngDimensions(resolve(publicDirectory, "icons/apple-touch-icon.png")),
  ).toEqual({ width: 180, height: 180 });
});

test("el worker excluye API y RSC antes de aplicar cualquier estrategia de cache", () => {
  const apiGuard = serviceWorker.indexOf(
    'url.pathname.startsWith("/api/") ||\n    isRscRequest(request, url)',
  );
  const navigationStrategy = serviceWorker.indexOf(
    'if (request.mode === "navigate")',
  );
  const staticStrategy = serviceWorker.indexOf(
    'url.pathname.startsWith("/_next/static/")',
    navigationStrategy,
  );

  expect(apiGuard).toBeGreaterThan(0);
  expect(apiGuard).toBeLessThan(navigationStrategy);
  expect(apiGuard).toBeLessThan(staticStrategy);
  expect(serviceWorker).toContain('const LAUNCHER_URL = "/aplicacion"');
  expect(serviceWorker).not.toMatch(/['"]\/dashboard/);
  expect(serviceWorker).not.toContain("Authorization");
  expect(serviceWorker).not.toContain("indexedDB");
  expect(serviceWorker).toContain("isCacheableStaticResponse(response)");
  expect(serviceWorker).not.toContain(
    'isCacheablePublicResponse(response, "text/")',
  );
});

test("solo el launcher público se conserva como documento navegable", () => {
  expect(serviceWorker).toContain(
    "url.pathname === LAUNCHER_URL\n        ? networkFirstSafeLauncher(request)\n        : networkOnlyNavigation(request)",
  );
  expect(serviceWorker).toContain(
    "await cacheSafeShellResponse(cache, LAUNCHER_URL, launcherResponse)",
  );
  expect(serviceWorker).toContain("return offlineFallback()");
  expect(serviceWorker).toContain('url.searchParams.has("_rsc")');
});

test("la actualización espera una decisión visible antes de activar el worker", () => {
  const installSection = serviceWorker.slice(
    serviceWorker.indexOf('self.addEventListener("install"'),
    serviceWorker.indexOf('self.addEventListener("activate"'),
  );

  expect(installSection).not.toContain("self.skipWaiting(");
  expect(serviceWorker).toContain('event.data?.type === "SKIP_WAITING"');
  expect(serviceWorker).toContain("event.waitUntil(self.skipWaiting())");
  expect(registration).toContain("registration.waiting");
  expect(registration).toContain(
    'waitingWorker.postMessage({ type: "SKIP_WAITING" })',
  );
  expect(registration).toContain("applyingUpdateRef.current");
  expect(registration).toContain("reloadOnControllerChangeRef.current");
  expect(registration).toContain("UPDATE_ACTIVATION_TIMEOUT_MS");
  expect(registration).toContain("setWaitingWorker(null)");
});

test("cada release usa caches aisladas y preserva los recursos del launcher", () => {
  const revision = "a".repeat(40);
  expect(serviceWorkerScriptUrl(revision)).toBe(`/sw.js?revision=${revision}`);
  expect(serviceWorkerScriptUrl("../valor-no-seguro")).toBe(
    "/sw.js?revision=unversioned-v5",
  );
  expect(registration).toContain(".register(serviceWorkerScriptUrl(), {");
  expect(nextConfiguration).toContain("NEXT_PUBLIC_APP_REVISION: appRevision");
  expect(serviceWorker).toContain(
    "new URL(self.location.href).searchParams.get(",
  );
  expect(serviceWorker).toContain("const CACHE_VERSION = `v5-${APP_REVISION}`");
  expect(serviceWorker).toContain("OFFLINE_ASSET_CACHE_NAME");
  expect(serviceWorker).toContain("RUNTIME_STATIC_CACHE_NAME");
  expect(serviceWorker).toContain("offlineCache.match(request)");
  expect(serviceWorker).toContain("runtimeCache.match(request)");
});

test("las caches tienen límites y eliminan versiones propias anteriores", () => {
  expect(serviceWorker).toContain("const MAX_OFFLINE_ASSET_ENTRIES = 256");
  expect(serviceWorker).toContain("const MAX_RUNTIME_STATIC_ENTRIES = 128");
  expect(serviceWorker).toContain("const MAX_SHELL_ENTRIES = 16");
  expect(serviceWorker).toContain("assertCacheWithinLimit(");
  expect(serviceWorker).toContain("trimCache(RUNTIME_STATIC_CACHE_NAME");
  expect(serviceWorker).toContain("trimCache(SHELL_CACHE_NAME");
  expect(serviceWorker).toContain("key.startsWith(CACHE_PREFIX)");
  expect(serviceWorker).toContain("!CURRENT_CACHE_NAMES.has(key)");
  expect(serviceWorker).toContain("caches.delete(key)");
});

test("publica el launcher solo después de guardar todas sus dependencias", () => {
  const functionStart = serviceWorker.indexOf(
    "async function cacheSafeShellResponse",
  );
  const functionEnd = serviceWorker.indexOf(
    "async function precacheGenericShell",
  );
  const cacheShellFunction = serviceWorker.slice(functionStart, functionEnd);

  expect(
    cacheShellFunction.indexOf("Promise.all(dependencies.map"),
  ).toBeLessThan(cacheShellFunction.indexOf("cache.put(key"));
  expect(cacheShellFunction).toContain(
    "dependencies.map((dependency) =>\n      cacheOfflineStaticResource(dependency)",
  );
  expect(cacheShellFunction).not.toContain(
    "dependencies.map(cacheOfflineStaticResource)",
  );
  expect(serviceWorker).toContain("ancestors.has(canonicalUrl)");
});

test("la pantalla de contingencia no ejecuta JavaScript inline", () => {
  const offlinePage = readFileSync(
    resolve(publicDirectory, "offline.html"),
    "utf8",
  );

  expect(offlinePage).toContain('href="/aplicacion"');
  expect(offlinePage).toContain("Abrir aplicación sin conexión");
  expect(offlinePage).not.toMatch(/\son[a-z]+\s*=/i);
  expect(offlinePage).not.toContain("<script");
});

test("detecta iPhone, iPad e iPadOS sin confundir un Mac sin pantalla táctil", () => {
  expect(
    isIosInstallPlatform({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    }),
  ).toBe(true);
  expect(
    isIosInstallPlatform({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
  ).toBe(true);
  expect(
    isIosInstallPlatform({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 0,
    }),
  ).toBe(false);
});
