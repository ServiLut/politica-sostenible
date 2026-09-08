const CACHE_PREFIX = "polsost-";
const CACHE_VERSION = "v2";
const STATIC_CACHE_NAME = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const OFFLINE_CACHE_NAME = `${CACHE_PREFIX}offline-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const CURRENT_CACHE_NAMES = new Set([
  STATIC_CACHE_NAME,
  OFFLINE_CACHE_NAME,
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
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

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const offlineCache = await caches.open(OFFLINE_CACHE_NAME);
    return (await offlineCache.match(OFFLINE_URL)) ?? Response.error();
  }
}

async function cacheFirstStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && !response.redirected && response.type !== "opaque") {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Next.js uses content-hashed URLs under this prefix. HTML, RSC payloads,
  // API responses and authenticated dashboard data intentionally bypass Cache Storage.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStaticAsset(request));
  }
});
