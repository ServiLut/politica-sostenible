import { expect, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

const canonicalAliases = [
  ["/dashboard/compliance", "/dashboard/audit"],
  ["/dashboard/directory", "/dashboard/votantes"],
  ["/dashboard/elections", "/dashboard/war-room"],
  ["/dashboard/finanzas", "/dashboard/finance"],
  ["/dashboard/messaging", "/dashboard/communications"],
  ["/dashboard/org", "/dashboard/team"],
  ["/dashboard/pipeline", "/dashboard/votantes"],
  ["/dashboard/security", "/dashboard/audit"],
  ["/dashboard/testigos", "/dashboard/war-room"],
] as const;

test("las rutas heredadas equivalentes sólo redirigen a módulos canónicos", async ({
  request,
}) => {
  for (const [legacyPath, canonicalPath] of canonicalAliases) {
    const response = await request.get(legacyPath, { maxRedirects: 0 });

    expect(response.status(), legacyPath).toBe(308);
    expect(
      new URL(response.headers().location, response.url()).pathname,
      legacyPath,
    ).toBe(canonicalPath);
  }
});

test("la IA simulada y sus subrutas no pueden utilizarse", async ({
  request,
}) => {
  for (const blockedPath of [
    "/dashboard/agent",
    "/dashboard/agent/conversacion-inventada",
  ]) {
    const response = await request.get(blockedPath, { maxRedirects: 0 });

    expect(response.status(), blockedPath).toBe(404);
    expect(await response.text(), blockedPath).not.toMatch(
      /estratega electoral|analizando datos|predicci[oó]n/i,
    );
  }
});

test("un alias heredado no permite saltarse el RBAC del módulo real", async ({
  page,
}) => {
  const authSession = {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-e2e",
      name: "Campaña verificable",
      slug: "campana-verificable",
      type: "CANDIDACY",
    },
    user: {
      id: "witness-e2e",
      email: "testigo@example.test",
      name: "Testigo de mesa",
      role: "Testigo",
      backendRole: "WITNESS",
    },
  };
  const authRequests: string[] = [];
  const unexpectedApiRequests: string[] = [];

  await page.addInitScript(
    ({ storageKey, session }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(session));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      session: authSession,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    expect(request.headers().authorization).toBe(
      `Bearer ${authSession.accessToken}`,
    );

    if (method === "GET" && pathname === "/api/auth/me") {
      authRequests.push(`${method} ${pathname}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: {
            user: {
              id: authSession.user.id,
              email: authSession.user.email,
              name: authSession.user.name,
              role: authSession.user.backendRole,
              tenant: authSession.tenant,
            },
          },
        }),
      });
      return;
    }

    if (method === "GET" && pathname === "/api/billing/capabilities") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: {
            plan: { code: "PRO", name: "Profesional" },
            features: { export: true, import: true, mfa: true },
          },
        }),
      });
      return;
    }

    const requestLabel = `${method} ${pathname}`;
    unexpectedApiRequests.push(requestLabel);
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Solicitud API inesperada: ${requestLabel}`,
      }),
    });
  });

  await page.goto("/dashboard/org");

  await expect(page).toHaveURL(/\/dashboard\/team$/);
  await expect(
    page.getByRole("heading", { name: "Acceso Restringido" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Invitaci[oó]n enviada correctamente/i),
  ).toHaveCount(0);
  expect(authRequests.length).toBeGreaterThanOrEqual(1);
  expect(unexpectedApiRequests).toEqual([]);
});

test("los prototipos públicos sólo regresan a la portada real", async ({
  request,
}) => {
  for (const prototypePath of ["/crm-demo", "/test"]) {
    const response = await request.get(prototypePath, { maxRedirects: 0 });

    expect(response.status(), prototypePath).toBe(308);
    expect(
      new URL(response.headers().location, response.url()).pathname,
      prototypePath,
    ).toBe("/");
  }
});
