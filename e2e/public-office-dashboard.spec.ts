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

const recentCase = {
  id: "case-1",
  mode: "PUBLIC_OFFICE",
  reference: "PQRS-2026-001",
  title: "Reparación de luminaria",
  description: "Solicitud ciudadana sobre alumbrado público.",
  category: "Servicios públicos",
  sourceChannel: "WEB",
  status: "OPEN",
  priority: "HIGH",
  voterId: null,
  externalContactRef: null,
  divisionId: null,
  assigneeId: "case-worker-1",
  createdById: "admin-public-office",
  confidential: false,
  dueAt: "2026-08-30T12:00:00.000Z",
  firstResponseAt: null,
  resolvedAt: null,
  createdAt: "2026-08-21T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
  assignee: {
    id: "case-worker-1",
    name: "Gestora ciudadana",
    role: "CASE_WORKER",
  },
  createdBy: {
    id: "admin-public-office",
    name: "Dirección de gestión",
    role: "ADMIN",
  },
  voter: null,
  division: null,
  _count: { interactions: 2, tasks: 1, commitments: 0 },
};

const urgentCase = {
  ...recentCase,
  id: "case-urgent-1",
  reference: "PQRS-2026-URG",
  title: "Riesgo en vía peatonal",
  priority: "URGENT",
  status: "IN_PROGRESS",
};

const recentTask = {
  id: "task-1",
  mode: "PUBLIC_OFFICE",
  title: "Visitar punto reportado",
  description: "Verificar condiciones en terreno.",
  status: "IN_PROGRESS",
  priority: "HIGH",
  assigneeId: "case-worker-1",
  issueCaseId: "case-1",
  commitmentId: null,
  createdById: "admin-public-office",
  dueAt: "2026-08-20T12:00:00.000Z",
  completedAt: null,
  createdAt: "2026-08-21T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
  assignee: {
    id: "case-worker-1",
    name: "Gestora ciudadana",
    role: "CASE_WORKER",
  },
  createdBy: {
    id: "admin-public-office",
    name: "Dirección de gestión",
    role: "ADMIN",
  },
  issueCase: {
    id: "case-1",
    reference: "PQRS-2026-001",
    title: "Reparación de luminaria",
    status: "OPEN",
  },
  commitment: null,
};

const publicCommitment = {
  id: "commitment-1",
  mode: "PUBLIC_OFFICE",
  reference: "GOB-001",
  title: "Corredores peatonales seguros",
  description: "Intervención verificable de puntos críticos.",
  status: "IN_PROGRESS",
  ownerId: null,
  issueCaseId: null,
  targetDate: "2026-12-20T12:00:00.000Z",
  progress: 45,
  isPublic: true,
  evidencePath: null,
  completedAt: null,
  createdAt: "2026-08-20T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
  owner: null,
  issueCase: null,
  _count: { tasks: 2 },
};

function paginated<T>(items: T[], total: number, limit: number) {
  return {
    statusCode: 200,
    message: "Success",
    data: {
      items,
      pagination: {
        page: 1,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    },
  };
}

test("muestra gestión pública con métricas exactas y Bearer", async ({
  page,
}) => {
  const authorizationHeaders: string[] = [];
  const authSessionHeaders: string[] = [];
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
    const pathname = url.pathname;
    const limit = Number(url.searchParams.get("limit") ?? 20);

    if (request.method() === "GET" && pathname === "/api/auth/me") {
      authSessionHeaders.push(request.headers().authorization ?? "");
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

    if (pathname === "/api/cases") {
      const status = url.searchParams.get("status");
      const priority = url.searchParams.get("priority");
      const response =
        priority === "URGENT"
          ? paginated([urgentCase], 2, limit)
          : status === "OPEN"
            ? paginated([], 7, limit)
            : status === "IN_PROGRESS"
              ? paginated([], 3, limit)
              : paginated([recentCase], 12, limit);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
      return;
    }

    if (pathname === "/api/tasks") {
      const status = url.searchParams.get("status");
      const overdue = url.searchParams.has("dueTo");
      const totals: Record<string, { pending: number; overdue: number }> = {
        TODO: { pending: 5, overdue: 2 },
        IN_PROGRESS: { pending: 4, overdue: 1 },
        BLOCKED: { pending: 2, overdue: 1 },
      };
      const total = status
        ? overdue
          ? totals[status].overdue
          : totals[status].pending
        : 11;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          paginated(status ? [] : [recentTask], total, limit),
        ),
      });
      return;
    }

    if (pathname === "/api/commitments") {
      expect(url.searchParams.get("isPublic")).toBe("true");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated([publicCommitment], 3, limit)),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: `Ruta inesperada: ${pathname}` }),
    });
  });

  await page.goto("/dashboard/public-office");

  await expect(
    page.getByRole("heading", { name: "Centro de gestión pública" }),
  ).toBeVisible();
  await expect(page.getByText("Alcaldía verificable")).toBeVisible();
  await expect(page.getByTestId("total-cases-metric")).toHaveText("12");
  await expect(page.getByTestId("open-cases-metric")).toHaveText("7");
  await expect(page.getByTestId("in-progress-cases-metric")).toHaveText("3");
  await expect(page.getByTestId("pending-tasks-metric")).toHaveText("11");
  await expect(page.getByTestId("overdue-tasks-metric")).toHaveText("4");
  await expect(page.getByTestId("public-commitments-metric")).toHaveText("3");
  await expect(page.getByTestId("urgent-case-case-urgent-1")).toContainText(
    "Riesgo en vía peatonal",
  );
  await expect(page.getByTestId("recent-task-task-1")).toContainText(
    "Visitar punto reportado",
  );
  await expect(
    page.getByTestId("public-commitment-commitment-1").getByRole("progressbar"),
  ).toHaveAttribute("aria-valuenow", "45");
  await expect(
    page.getByRole("link", { name: "Gestionar casos" }),
  ).toHaveAttribute("href", "/dashboard/cases");

  const paths = new Set(requestedUrls.map((url) => url.pathname));
  expect(paths).toEqual(
    new Set(["/api/cases", "/api/tasks", "/api/commitments"]),
  );
  expect(
    requestedUrls.every(
      (url) =>
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("tenant_id") &&
        !url.searchParams.has("mode"),
    ),
  ).toBe(true);
  const overdueStatuses = new Set(
    requestedUrls
      .filter(
        (url) => url.pathname === "/api/tasks" && url.searchParams.has("dueTo"),
      )
      .map((url) => url.searchParams.get("status")),
  );
  expect(overdueStatuses).toEqual(new Set(["TODO", "IN_PROGRESS", "BLOCKED"]));
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(12);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
  expect(authSessionHeaders.length).toBeGreaterThanOrEqual(1);
  expect(authSessionHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});
