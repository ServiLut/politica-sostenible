import { expect, test } from "@playwright/test";

function responseNonce(contentSecurityPolicy: string | undefined) {
  expect(contentSecurityPolicy).toBeTruthy();
  expect(contentSecurityPolicy).toContain("script-src-attr 'none'");
  expect(contentSecurityPolicy).not.toMatch(
    /script-src[^;]*'unsafe-inline'/u,
  );

  const nonce = contentSecurityPolicy?.match(/'nonce-([^']+)'/u)?.[1];
  expect(nonce).toMatch(/^[A-Za-z0-9+/=_-]{32,}$/u);
  return nonce as string;
}

test("cada documento ejecuta únicamente scripts con el nonce de su respuesta", async ({
  page,
}) => {
  const response = await page.goto("/iniciar-sesion");
  expect(response?.status()).toBe(200);
  const nonce = responseNonce(
    response?.headers()["content-security-policy"],
  );

  const scriptNonces = await page.locator("script").evaluateAll((scripts) =>
    // Browsers deliberately hide nonce attributes from getAttribute() after
    // parsing; the reflected HTMLScriptElement.nonce property remains the
    // standards-defined way to inspect the value.
    scripts.map((script) => (script as HTMLScriptElement).nonce),
  );
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(new Set(scriptNonces)).toEqual(new Set([nonce]));
  await expect(
    page.getByRole("heading", { name: "Hola de nuevo" }),
  ).toBeVisible();
});

test("el nonce no se reutiliza entre respuestas", async ({ request }) => {
  const first = await request.get("/iniciar-sesion");
  const second = await request.get("/iniciar-sesion");

  const firstNonce = responseNonce(
    first.headers()["content-security-policy"],
  );
  const secondNonce = responseNonce(
    second.headers()["content-security-policy"],
  );

  expect(firstNonce).not.toBe(secondNonce);
});
