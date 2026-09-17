const CACHE_PREFIX = "polsost-";
const requestedRevision = new URL(self.location.href).searchParams.get(
  "revision",
);
const APP_REVISION = /^[a-f0-9]{40}$/.test(requestedRevision ?? "")
  ? requestedRevision
  : "unversioned-v5";
const CACHE_VERSION = `v5-${APP_REVISION}`;
const OFFLINE_ASSET_CACHE_NAME = `${CACHE_PREFIX}offline-assets-${CACHE_VERSION}`;
const RUNTIME_STATIC_CACHE_NAME = `${CACHE_PREFIX}runtime-static-${CACHE_VERSION}`;
const SHELL_CACHE_NAME = `${CACHE_PREFIX}shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const LAUNCHER_URL = "/aplicacion";
const MAX_OFFLINE_ASSET_ENTRIES = 256;
const MAX_RUNTIME_STATIC_ENTRIES = 128;
const MAX_SHELL_ENTRIES = 16;
const NAVIGATION_TIMEOUT_MS = 5_000;
const CURRENT_CACHE_NAMES = new Set([
  OFFLINE_ASSET_CACHE_NAME,
  RUNTIME_STATIC_CACHE_NAME,
  SHELL_CACHE_NAME,
]);
const SAFE_PUBLIC_RESOURCES = new Map([
  [OFFLINE_URL, "text/html"],
  ["/manifest.webmanifest", "application/manifest+json"],
  ["/icons/icon.svg", "image/svg+xml"],
  ["/icons/icon-192.png", "image/png"],
  ["/icons/icon-512.png", "image/png"],
  ["/icons/icon-maskable-512.png", "image/png"],
  ["/icons/apple-touch-icon.png", "image/png"],
]);

function isRscRequest(request, url) {
  return (
    request.headers.get("RSC") === "1" ||
    request.headers.has("Next-Router-State-Tree") ||
    request.headers.has("Next-Router-Prefetch") ||
    url.searchParams.has("_rsc")
  );
}

function isCacheablePublicResponse(response, expectedContentPrefix) {
  const contentType = response.headers.get("content-type") ?? "";
  return (
    response.status === 200 &&
    !response.redirected &&
    response.type !== "opaque" &&
    contentType.toLowerCase().startsWith(expectedContentPrefix)
  );
}

function isCacheableStaticResponse(response) {
  const contentType = (
    response.headers.get("content-type") ?? ""
  ).toLowerCase();
  return (
    response.status === 200 &&
    !response.redirected &&
    response.type !== "opaque" &&
    [
      "application/javascript",
      "application/wasm",
      "font/",
      "image/",
      "text/css",
      "text/javascript",
    ].some((prefix) => contentType.startsWith(prefix))
  );
}

function staticUrlsFromMarkup(markup, baseUrl) {
  const candidates = new Set();
  const attributePattern = /(?:src|href)=["']([^"']+)["']/gi;
  const cssUrlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

  for (const pattern of [attributePattern, cssUrlPattern]) {
    for (const match of markup.matchAll(pattern)) {
      try {
        const candidate = new URL(match[1], baseUrl);
        if (
          candidate.origin === self.location.origin &&
          candidate.pathname.startsWith("/_next/static/")
        ) {
          candidates.add(candidate.href);
        }
      } catch {
        // Ignore malformed references. Only explicit same-origin static URLs
        // are eligible for the generic shell cache.
      }
    }
  }

  return [...candidates];
}

async function trimCache(cacheName, maximumEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maximumEntries;
  if (excess <= 0) return;

  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

async function assertCacheWithinLimit(cacheName, maximumEntries) {
  const cache = await caches.open(cacheName);
  if ((await cache.keys()).length > maximumEntries) {
    throw new Error(`La caché excede el límite seguro: ${cacheName}`);
  }
}

async function cacheOfflineStaticResource(url, ancestors = new Set()) {
  const canonicalUrl = new URL(url, self.location.origin).href;
  if (ancestors.has(canonicalUrl)) return;

  const lineage = new Set(ancestors);
  lineage.add(canonicalUrl);
  const cache = await caches.open(OFFLINE_ASSET_CACHE_NAME);
  const cached = await cache.match(canonicalUrl);
  const response =
    cached ?? (await fetch(new Request(canonicalUrl, { cache: "reload" })));
  if (!cached && !isCacheableStaticResponse(response)) {
    throw new Error(`Recurso estático no almacenable: ${canonicalUrl}`);
  }

  if (
    (response.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("text/css")
  ) {
    const css = await response.clone().text();
    const dependencies = staticUrlsFromMarkup(css, canonicalUrl);
    await Promise.all(
      dependencies.map((dependency) =>
        cacheOfflineStaticResource(dependency, lineage),
      ),
    );
  }

  // Store a document dependency only after all of its own dependencies have
  // succeeded. A failed install can therefore never publish a partial shell.
  if (!cached) await cache.put(canonicalUrl, response.clone());
}

async function cacheSafeShellResponse(cache, key, response) {
  if (!isCacheablePublicResponse(response, "text/html")) {
    throw new Error(`Documento público no almacenable: ${key}`);
  }

  const html = await response.clone().text();
  const dependencies = staticUrlsFromMarkup(
    html,
    new URL(key, self.location.origin),
  );
  // Array.map also passes a numeric index. Wrap the callback so that index can
  // never replace the optional Set used to detect recursive dependencies.
  await Promise.all(
    dependencies.map((dependency) =>
      cacheOfflineStaticResource(dependency),
    ),
  );
  // Never evict a launcher dependency to meet a quota: that would install a
  // shell that opens but cannot hydrate. Reject the candidate update instead.
  await assertCacheWithinLimit(
    OFFLINE_ASSET_CACHE_NAME,
    MAX_OFFLINE_ASSET_ENTRIES,
  );
  await cache.put(key, response.clone());
}

async function precacheGenericShell() {
  const cache = await caches.open(SHELL_CACHE_NAME);

  for (const [path, expectedContentPrefix] of SAFE_PUBLIC_RESOURCES) {
    const response = await fetch(new Request(path, { cache: "reload" }));
    if (!isCacheablePublicResponse(response, expectedContentPrefix)) {
      throw new Error(`Recurso público no almacenable: ${path}`);
    }
    await cache.put(path, response);
  }

  const launcherResponse = await fetch(
    new Request(LAUNCHER_URL, { cache: "reload" }),
  );
  await cacheSafeShellResponse(cache, LAUNCHER_URL, launcherResponse);
  await Promise.all([
    trimCache(RUNTIME_STATIC_CACHE_NAME, MAX_RUNTIME_STATIC_ENTRIES),
    trimCache(SHELL_CACHE_NAME, MAX_SHELL_ENTRIES),
  ]);
}

self.addEventListener("install", (event) => {
  // Updates intentionally remain in the waiting state. The page asks the
  // operator to apply them before SKIP_WAITING is ever sent.
  event.waitUntil(precacheGenericShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) && !CURRENT_CACHE_NAMES.has(key),
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function offlineFallback() {
  const cache = await caches.open(SHELL_CACHE_NAME);
  return (
    (await cache.match(OFFLINE_URL)) ??
    new Response("Sin conexión", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
}

async function networkOnlyNavigation(request) {
  try {
    return await fetchWithTimeout(request);
  } catch {
    return offlineFallback();
  }
}

async function networkFirstSafeLauncher(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  try {
    const response = await fetchWithTimeout(request);
    if (isCacheablePublicResponse(response, "text/html")) {
      await cacheSafeShellResponse(cache, LAUNCHER_URL, response.clone());
      await trimCache(SHELL_CACHE_NAME, MAX_SHELL_ENTRIES);
    }
    return response;
  } catch {
    return (await cache.match(LAUNCHER_URL)) ?? offlineFallback();
  }
}

async function cacheFirstStaticAsset(request) {
  const offlineCache = await caches.open(OFFLINE_ASSET_CACHE_NAME);
  const offlineAsset = await offlineCache.match(request);
  if (offlineAsset) return offlineAsset;

  const runtimeCache = await caches.open(RUNTIME_STATIC_CACHE_NAME);
  const runtimeAsset = await runtimeCache.match(request);
  if (runtimeAsset) return runtimeAsset;

  const response = await fetch(request);
  if (isCacheableStaticResponse(response)) {
    await runtimeCache.put(request, response.clone());
    await trimCache(RUNTIME_STATIC_CACHE_NAME, MAX_RUNTIME_STATIC_ENTRIES);
  }
  return response;
}

async function cacheFirstSafePublicResource(
  request,
  path,
  expectedContentPrefix,
) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  const cached = await cache.match(path);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheablePublicResponse(response, expectedContentPrefix)) {
    await cache.put(path, response.clone());
    await trimCache(SHELL_CACHE_NAME, MAX_SHELL_ENTRIES);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API requests, authenticated RSC payloads and router state always go to
  // the network. They are never written to Cache Storage.
  if (
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    isRscRequest(request, url)
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      url.pathname === LAUNCHER_URL
        ? networkFirstSafeLauncher(request)
        : networkOnlyNavigation(request),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStaticAsset(request));
    return;
  }

  const expectedContentPrefix = SAFE_PUBLIC_RESOURCES.get(url.pathname);
  if (expectedContentPrefix) {
    event.respondWith(
      cacheFirstSafePublicResource(
        request,
        url.pathname,
        expectedContentPrefix,
      ),
    );
  }
});
