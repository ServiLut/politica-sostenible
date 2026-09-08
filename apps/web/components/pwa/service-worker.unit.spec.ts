import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const publicDirectory = resolve(process.cwd(), "apps/web/public");
const serviceWorker = readFileSync(resolve(publicDirectory, "sw.js"), "utf8");

test("el service worker no persiste documentos ni respuestas autenticadas", () => {
  expect(serviceWorker).toContain(
    'if (request.mode === "navigate")',
  );
  expect(serviceWorker).toContain("networkFirstNavigation(request)");
  expect(serviceWorker).toContain(
    'url.pathname.startsWith("/_next/static/")',
  );
  expect(serviceWorker).not.toMatch(/["']\/dashboard["']/);
  expect(serviceWorker).not.toMatch(/["']\/api\/["']/);
  expect(serviceWorker.match(/cache\.put\(/g)).toHaveLength(1);
});

test("el service worker elimina versiones anteriores de sus propias caches", () => {
  expect(serviceWorker).toContain("key.startsWith(CACHE_PREFIX)");
  expect(serviceWorker).toContain("!CURRENT_CACHE_NAMES.has(key)");
  expect(serviceWorker).toContain("caches.delete(key)");
});

test("todos los iconos declarados por el manifiesto existen", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(publicDirectory, "manifest.json"), "utf8"),
  ) as { icons: Array<{ src: string }> };

  expect(manifest.icons.length).toBeGreaterThan(0);
  for (const icon of manifest.icons) {
    expect(() =>
      readFileSync(resolve(publicDirectory, icon.src.replace(/^\//, ""))),
    ).not.toThrow();
  }
});
