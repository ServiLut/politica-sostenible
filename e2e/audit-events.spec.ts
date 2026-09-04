import { expect, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

function sessionFor(backendRole: "ADMIN" | "CAMPAIGN_MANAGER") {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-e2e",
      name: "Campaña verificable",
      slug: "campana-verificable",
      type: "CANDIDACY",
    },
    user: {
      id: `user-${backendRole.toLowerCase()}`,
      email: `${backendRole.toLowerCase()}@example.test`,
      name: backendRole === "ADMIN" ? "Control interno" : "Gerencia",
      role: backendRole === "ADMIN" ? "AdminCampana" : "GerenteOps",
      backendRole,
    },
  };
}

test("auditoría consulta, filtra y pagina una vista minimizada", async ({
  page,
}) => {
  const requests: URL[] = [];

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("ADMIN"),
    },
  );

  await page.route("**/api/audit-events**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(url);
    expect(request.headers().authorization).toBe(`Bearer ${jwt}`);

    const currentPage = Number(url.searchParams.get("page") ?? "1");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 200,
        message: "Success",
        data: {
          items: [
            {
              id: `audit-${currentPage}`,
              action: "CASE_UPDATED",
              resourceType: "IssueCase",
              resourceId: `case-${currentPage}`,
              outcome: "SUCCESS",
              occurredAt: "2026-08-21T15:30:00.000Z",
              actor: {
                id: "actor-a",
                name: "Control interno",
                role: "COMPLIANCE_OFFICER",
              },
              before: "contenido privado",
              metadata: "metadatos privados",
              sourceIpHash: "hash privado",
              requestId: "request privado",
            },
            {
              id: `access-reset-${currentPage}`,
              action: "TEAM_MEMBER_ACCESS_RESET",
              resourceType: "User",
              resourceId: `member-${currentPage}`,
              outcome: "SUCCESS",
              occurredAt: "2026-08-21T15:35:00.000Z",
              actor: {
                id: "actor-a",
                name: "Control interno",
                role: "ADMIN",
              },
            },
          ],
          pagination: {
            page: currentPage,
            limit: 20,
            total: 21,
            totalPages: 2,
          },
        },
      }),
    });
  });

  await page.goto("/dashboard/audit");
  await expect(
    page.getByRole("heading", { name: "Bitácora de auditoría" }),
  ).toBeVisible();
  const isMobile = (page.viewportSize()?.width ?? 0) < 768;
  const auditRow = page.getByTestId(
    `${isMobile ? "audit-card" : "audit-row"}-audit-1`,
  );
  await expect(
    auditRow.getByText("Caso actualizado", { exact: true }),
  ).toBeVisible();
  await expect(auditRow.getByText("CASE_UPDATED")).toBeVisible();
  await expect(
    auditRow.getByText("Control interno", { exact: true }),
  ).toBeVisible();
  await expect(auditRow.getByText("Cumplimiento", { exact: true })).toBeVisible();
  await expect(auditRow.getByText("Exitosa", { exact: true })).toBeVisible();
  const resetAudit = page.getByTestId(
    `${isMobile ? "audit-card" : "audit-row"}-access-reset-1`,
  );
  await expect(
    resetAudit.getByText("Acceso de integrante restablecido", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("contenido privado")).toHaveCount(0);
  await expect(page.getByText("hash privado")).toHaveCount(0);

  await page.getByLabel("Acción").fill("CASE_");
  await page.getByLabel("Tipo de recurso").fill("IssueCase");
  await page.getByLabel("Resultado").selectOption("SUCCESS");
  await page.getByLabel("Desde").fill("2026-08-01");
  await page.getByLabel("Hasta").fill("2026-08-31");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();

  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(2);
  const filtered = requests.at(-1);
  expect(filtered?.searchParams.get("action")).toBe("CASE_");
  expect(filtered?.searchParams.get("resourceType")).toBe("IssueCase");
  expect(filtered?.searchParams.get("outcome")).toBe("SUCCESS");
  expect(filtered?.searchParams.get("occurredFrom")).toBe(
    "2026-08-01T00:00:00.000-05:00",
  );
  expect(filtered?.searchParams.get("occurredTo")).toBe(
    "2026-08-31T23:59:59.999-05:00",
  );

  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("page")).toBe("2");
});

test("un rol operativo no ve la ruta ni genera consultas de auditoría", async ({
  page,
}) => {
  let auditRequests = 0;
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("CAMPAIGN_MANAGER"),
    },
  );
  await page.route("**/api/audit-events**", async (route) => {
    auditRequests += 1;
    await route.fulfill({ status: 403, body: "Forbidden" });
  });

  await page.goto("/dashboard/audit");
  await expect(
    page.getByRole("heading", { name: "Acceso Restringido" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Auditoría" })).toHaveCount(0);
  expect(auditRequests).toBe(0);
});
