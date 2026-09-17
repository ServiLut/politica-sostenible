import { expect, test, type Page, type Route } from "@playwright/test";

type TestRole = "ADMIN" | "AUDITOR";
type TestStage = "CAMPAIGN" | "CLOSED";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "integrity-signature",
].join(".");

function sessionFor(role: TestRole, stage: TestStage) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-signature-e2e",
      name: "Campaña con integridad",
      slug: "signature-e2e",
      type: "CANDIDACY" as const,
      operationStage: stage,
    },
    user: {
      id: `user-${role}`,
      email: `${role.toLowerCase()}@example.test`,
      name: `Persona ${role}`,
      role: role === "ADMIN" ? "AdminCampana" : "Auditor",
      backendRole: role,
    },
  };
}

async function installSession(page: Page, role: TestRole, stage: TestStage) {
  const session = sessionFor(role, stage);
  await page.addInitScript(
    ({ value }) => {
      window.sessionStorage.setItem(
        "politica-sostenible.auth-session",
        JSON.stringify(value),
      );
    },
    { value: session },
  );
  return session;
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(
      status >= 400 ? data : { statusCode: status, message: "Success", data },
    ),
  });
}

async function installRoutes(
  page: Page,
  role: TestRole,
  stage: TestStage,
  onSign?: (body: Record<string, unknown>) => void,
) {
  const session = sessionFor(role, stage);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "GET" && path === "/api/auth/me") {
      await fulfill(route, {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role,
          tenant: session.tenant,
        },
      });
      return;
    }
    if (request.method() === "GET" && path === "/api/billing/capabilities") {
      await fulfill(route, {
        plan: { code: "ENTERPRISE", name: "Enterprise" },
        features: { export: true, import: true, mfa: true },
      });
      return;
    }
    if (
      request.method() === "GET" &&
      path === "/api/electronic-signature/candidates"
    ) {
      await fulfill(route, {
        items: [
          {
            documentId: "document-a",
            resourceId: "finance-a",
            contentType: "application/pdf",
            actualSize: 4096,
            confirmedAt: "2026-09-09T10:00:00.000Z",
            consumedAt: "2026-09-09T10:05:00.000Z",
            signature: null,
            resource: {
              kind: "FinancialEntry",
              type: "EXPENSE",
              occurredAt: "2026-09-08T00:00:00.000Z",
              label: "Transporte territorial",
            },
          },
        ],
        limit: 100,
        truncated: false,
      });
      return;
    }
    if (
      request.method() === "POST" &&
      path === "/api/electronic-signature/sign"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      onSign?.(body);
      await fulfill(route, {
        id: "signature-a",
        signedAt: "2026-09-09T12:00:00.000Z",
        module: "finance",
        resourceType: "FinancialEntry",
      });
      return;
    }
    if (
      request.method() === "GET" &&
      path === "/api/electronic-signature/signature-a/verify"
    ) {
      await fulfill(route, {
        id: "signature-a",
        valid: true,
        signedAt: "2026-09-09T12:00:00.000Z",
        module: "finance",
        resourceType: "FinancialEntry",
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });
}

test("firma un candidato resuelto por el servidor sin enviar tenant", async ({
  page,
}) => {
  await installSession(page, "ADMIN", "CAMPAIGN");
  const mutations: Record<string, unknown>[] = [];
  await installRoutes(page, "ADMIN", "CAMPAIGN", (body) =>
    mutations.push(body),
  );

  await page.goto("/dashboard/integrity-signatures");
  await expect(
    page.getByRole("heading", {
      name: "Sellos de vínculo y metadatos con MFA",
    }),
  ).toBeVisible();
  await page.getByRole("radio").check();
  await page.getByLabel("Código MFA de seis dígitos").fill("123456");
  await page.getByRole("button", { name: "Firmar documento" }).click();

  await expect(page.getByRole("status")).toContainText("signature-a");
  expect(mutations).toEqual([
    {
      documentId: "document-a",
      resourceId: "finance-a",
      module: "finance",
      otpCode: "123456",
    },
  ]);
  expect(mutations[0]).not.toHaveProperty("tenantId");
});

test("en CLOSED conserva verificación y no solicita candidatos de firma", async ({
  page,
}) => {
  await installSession(page, "AUDITOR", "CLOSED");
  let candidateRequests = 0;
  await installRoutes(page, "AUDITOR", "CLOSED");
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/candidates")) {
      candidateRequests += 1;
    }
  });

  await page.goto("/dashboard/integrity-signatures");
  await expect(page.getByText("La operación está cerrada:")).toBeVisible();
  await page.getByLabel("ID de firma").fill("signature-a");
  await page.getByLabel("ID del recurso").fill("finance-a");
  await page.getByRole("button", { name: "Verificar integridad" }).click();

  await expect(
    page.getByText("Vínculo y metadatos coinciden"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Integridad de contenido: no verificada independientemente.",
    ),
  ).toBeVisible();
  expect(candidateRequests).toBe(0);
});
