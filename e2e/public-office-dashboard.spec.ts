import { expect, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant: {
    id: "tenant-public-office",
    name: "Alcaldía verificable",
    slug: "alcaldia-verificable",
    type: "PUBLIC_OFFICE",
  },
  user: {
    id: "admin-public-office",
    email: "gestion@example.test",
    name: "Dirección de gestión",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};

const briefing = {
  generatedAt: "2026-08-27T14:00:00.000Z",
  tenant: {
    id: session.tenant.id,
    name: session.tenant.name,
    type: "PUBLIC_OFFICE",
    mode: "PUBLIC_OFFICE",
  },
  activation: {
    ready: false,
    completedSteps: 3,
    totalSteps: 4,
    steps: [
      {
        code: "TEAM_READY",
        title: "Asignar el equipo de atención",
        detail: "Activa responsables con roles claros.",
        href: "/dashboard/team",
        complete: true,
      },
      {
        code: "FIRST_CASE",
        title: "Abrir el primer caso trazable",
        detail: "Centraliza la solicitud con responsable y SLA.",
        href: "/dashboard/cases",
        complete: true,
      },
      {
        code: "FIRST_PUBLIC_COMMITMENT",
        title: "Publicar el primer compromiso",
        detail: "Define responsable, fecha y avance.",
        href: "/dashboard/tasks",
        complete: true,
      },
      {
        code: "FIRST_SCHEDULED_EVENT",
        title: "Programar la primera actividad pública",
        detail: "Conecta la agenda con la ejecución.",
        href: "/dashboard/events",
        complete: false,
      },
    ],
  },
  metrics: {
    team: { active: 5, pendingInvitations: 1 },
    cases: { open: 12, overdue: 2, urgent: 1 },
    tasks: { open: 11, overdue: 4 },
    commitments: { open: 6, atRisk: 1, overdue: 1, public: 3 },
    events: { upcoming: 0 },
    communications: { pendingApproval: 2 },
  },
  alerts: [
    {
      code: "CASES_REQUIRE_DECISION",
      severity: "critical",
      title: "Casos ciudadanos requieren decisión",
      detail: "1 urgente y 2 vencidos necesitan responsable.",
      href: "/dashboard/cases",
      count: 3,
    },
  ],
  agenda: {
    upcomingEvents: [],
    priorityTasks: [
      {
        id: "task-1",
        title: "Visitar punto reportado",
        status: "IN_PROGRESS",
        priority: "HIGH",
        dueAt: "2026-08-30T12:00:00.000Z",
      },
    ],
  },
};

test("muestra un briefing de gestión pública agregado, aislado y con Bearer", async ({
  page,
}) => {
  const authorizationHeaders: string[] = [];
  const requestedUrls: URL[] = [];

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: session,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "GET" && url.pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: {
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              role: session.user.backendRole,
              tenant: session.tenant,
            },
          },
        }),
      });
      return;
    }

    authorizationHeaders.push(request.headers().authorization ?? "");
    requestedUrls.push(url);

    if (url.pathname === "/api/command-center/briefing") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: briefing,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: `Ruta inesperada: ${url.pathname}` }),
    });
  });

  await page.goto("/dashboard/public-office");

  await expect(
    page.getByRole("heading", { name: "Centro de gestión pública" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Seguimiento de Alcaldía verificable/),
  ).toBeVisible();
  await expect(page.getByTestId("open-cases-metric")).toHaveText("12");
  await expect(page.getByTestId("overdue-cases-metric")).toHaveText("2");
  await expect(page.getByTestId("overdue-tasks-metric")).toHaveText("4");
  await expect(page.getByTestId("public-commitments-metric")).toHaveText("3");
  await expect(page.getByText("Visitar punto reportado")).toBeVisible();
  await expect(
    page.getByText("Casos ciudadanos requieren decisión"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Gestionar casos" }),
  ).toHaveAttribute("href", "/dashboard/cases");

  expect(new Set(requestedUrls.map((url) => url.pathname))).toEqual(
    new Set(["/api/command-center/briefing"]),
  );
  expect(requestedUrls.length).toBeGreaterThanOrEqual(1);
  expect(requestedUrls.length).toBeLessThanOrEqual(2);
  expect(
    requestedUrls.every(
      (url) =>
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("tenant_id") &&
        !url.searchParams.has("mode"),
    ),
  ).toBe(true);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});
