import { expect, test } from "@playwright/test";
import { openPrivateResource, requestPrivateDownload, validatePrivateDownloadAuthorization } from "./private-storage";
import { getCalendarEvidenceDownload } from "./electoral-calendar-api";
import { getPqrsdDocumentDownload } from "./pqrsd-api";
import { getScrutinyDocumentDownload } from "./scrutiny-api";

const storageOrigin = "https://storage.example.test";
const path = "/storage/v1/object/sign/private-fixture/tenant-fixture/document.pdf?token=synthetic-download-token";
const now = Date.parse("2026-10-16T12:00:00Z");
const expiresAt = "2026-10-16T12:05:00Z";

test("acepta sólo la descarga firmada en el origen configurado y permite loopback HTTP de pruebas", () => {
  const authorization = { url: `${storageOrigin}${path}`, expiresAt };
  expect(validatePrivateDownloadAuthorization(authorization, storageOrigin, now)).toEqual(authorization);
  expect(validatePrivateDownloadAuthorization({ ...authorization, url: `http://127.0.0.1:3000${path}` }, "http://127.0.0.1:3000/mock-supabase", now).url).toContain("http://127.0.0.1:3000/");
});

for (const [index, url] of [
  "javascript:alert(1)", "data:text/html,test", `//storage.example.test${path}`,
  `https://user:synthetic@storage.example.test${path}`,
  `https://storage.example.test.attacker.invalid${path}`,
  `https://attacker.invalid${path}`, `http://storage.example.test${path}`,
  `${storageOrigin}/storage/v1/object/public/private-fixture/document.pdf`,
  `${storageOrigin}/storage/v1/object/sign/private-fixture/document.pdf`,
  `${storageOrigin}${path}&token=another-synthetic-token`, `${storageOrigin}${path}#fragment`,
].entries()) {
  test(`rechaza destino privado fuera del contrato ${index + 1}: ${url.split("?")[0]}`, () => {
    expect(() => validatePrivateDownloadAuthorization({ url, expiresAt }, storageOrigin, now)).toThrow("enlace de archivo privado no válido");
  });
}

test("rechaza expiración, configuración ausente y URLs inválidas sin incluir tokens en el error", () => {
  for (const authorization of [
    { url: `${storageOrigin}${path}`, expiresAt: "2026-10-16T11:00:00Z" },
    { url: `${storageOrigin}${path}`, expiresAt: "invalid" },
    { url: "NOT_A_URL_WITH_SYNTHETIC_PRIVATE_VALUE", expiresAt },
  ]) {
    const error = (() => { try { validatePrivateDownloadAuthorization(authorization, storageOrigin, now); } catch (error) { return error; } })();
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("synthetic");
    expect((error as Error).message).not.toContain(authorization.url);
  }
  expect(() => validatePrivateDownloadAuthorization({ url: `${storageOrigin}${path}`, expiresAt }, "", now)).toThrow();
});

test("calendario, PQRSD y escrutinios validan la misma descarga privada sin alterar el contrato POST", async () => {
  const originalFetch = globalThis.fetch;
  const previousOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = storageOrigin;
  const requests: unknown[] = [];
  const authorization = { url: `${storageOrigin}${path}`, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  globalThis.fetch = async (_url, options) => {
    expect(options?.method).toBe("POST");
    requests.push(JSON.parse(String(options?.body)));
    return new Response(JSON.stringify({ data: authorization, statusCode: 200 }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    expect(await requestPrivateDownload("finance", "finance-fixture")).toEqual(authorization);
    expect(await getCalendarEvidenceDownload("calendar-fixture")).toEqual(authorization);
    expect(await getPqrsdDocumentDownload("pqrsd-fixture")).toEqual(authorization);
    expect(await getScrutinyDocumentDownload("scrutiny-fixture")).toEqual(authorization);
    expect(requests).toEqual([
      { module: "finance", resourceId: "finance-fixture" },
      { module: "electoral-calendar", resourceId: "calendar-fixture" },
      { module: "pqrsd", resourceId: "pqrsd-fixture" },
      { module: "scrutiny", resourceId: "scrutiny-fixture" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousOrigin;
  }
});

test("una URL rechazada cierra la pestaña vacía y nunca ejecuta navegación", async () => {
  const originalFetch = globalThis.fetch;
  const previousOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  process.env.NEXT_PUBLIC_SUPABASE_URL = storageOrigin;
  const navigations: string[] = [];
  let closed = false;
  const preview = { opener: {} as object | null, location: { replace: (url: string) => navigations.push(url) }, close: () => { closed = true; } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { open: () => preview, sessionStorage: { getItem: () => null } } });
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: { url: "javascript:alert(1)", expiresAt: new Date(Date.now() + 60_000).toISOString() }, statusCode: 200,
  }), { headers: { "Content-Type": "application/json" } });
  try {
    await expect(openPrivateResource("finance", "finance-fixture")).rejects.toThrow("enlace de archivo privado no válido");
    expect(preview.opener).toBeNull();
    expect(closed).toBe(true);
    expect(navigations).toEqual([]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousOrigin;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
