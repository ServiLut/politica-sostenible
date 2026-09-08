import { expect, test, type Page, type Route } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "billing-inbox-test-signature",
].join(".");

const tenant = {
  id: "tenant-operations-e2e",
  name: "Organización verificable",
  slug: "organizacion-verificable",
  type: "CANDIDACY",
  operationStage: "CAMPAIGN",
};

const backendUser = {
  id: "admin-operations-e2e",
  email: "admin.operations@example.test",
  name: "Dirección operativa",
  role: "ADMIN",
  tenant,
};

const subscription = {
  id: "subscription-professional",
  tenantId: tenant.id,
  planId: "plan-professional",
  status: "ACTIVE",
  billingCycle: "MONTHLY",
  currentPeriodStart: "2026-09-01T00:00:00.000Z",
  currentPeriodEnd: "2026-10-01T00:00:00.000Z",
  trialEndsAt: null,
  cancelledAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  plan: {
    id: "plan-professional",
    name: "Profesional",
    code: "PROFESSIONAL",
    description: "Para campañas medianas a grandes",
    maxUsers: 50,
    maxVoters: 10_000,
    maxStorageMb: 2_048,
    includesExport: true,
    includesImport: true,
    includesMfa: true,
    includesApi: false,
    monthlyPriceCop: "299000.00",
    yearlyPriceCop: "3588000.00",
    isActive: true,
    sortOrder: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};

const usage = {
  limits: { users: 50, voters: 10_000, storageMb: 2_048 },
  current: { users: 7, voters: 1_275, storageMb: 384.5 },
};

function successful(data: unknown): string {
  return JSON.stringify({ statusCode: 200, message: "Success", data });
}

async function fulfillJson(
  route: Route,
  data: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: status >= 400 ? JSON.stringify(data) : successful(data),
  });
}

async function installSession(
  page: Page,
  currentTenant = tenant,
  currentUser = backendUser,
): Promise<void> {
  await page.addInitScript(
    ({ storageKey, accessToken, currentTenant, currentUser }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          accessToken,
          expiresAt: 1_893_456_000_000,
          tenant: currentTenant,
          user: {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            role: "AdminCampana",
            backendRole: currentUser.role,
          },
        }),
      );
    },
    {
      storageKey: "politica-sostenible.auth-session",
      accessToken: jwt,
      currentTenant,
      currentUser,
    },
  );
}

async function fulfillCurrentSession(
  route: Route,
  currentUser = backendUser,
): Promise<void> {
  await fulfillJson(route, { user: currentUser });
}

test("muestra el plan, las métricas reales y el contacto comercial", async ({
  page,
}) => {
  const billingRequests: Array<{
    pathname: string;
    search: string;
    authorization: string;
  }> = [];

  await installSession(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me") {
      await fulfillCurrentSession(route);
      return;
    }

    if (
      url.pathname === "/api/billing/subscription" ||
      url.pathname === "/api/billing/usage"
    ) {
      billingRequests.push({
        pathname: url.pathname,
        search: url.search,
        authorization: request.headers().authorization ?? "",
      });
      await fulfillJson(
        route,
        url.pathname.endsWith("subscription") ? subscription : usage,
      );
      return;
    }

    await fulfillJson(
      route,
      { statusCode: 404, message: "Ruta no simulada" },
      404,
    );
  });

  await page.goto("/dashboard/billing");

  await expect(
    page.getByRole("heading", { name: "Plan y uso" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: subscription.plan.name }),
  ).toBeVisible();
  await expect(page.getByText(subscription.plan.description)).toBeVisible();
  await expect(page.getByText(/299\.000/)).toBeVisible();
  await expect(page.getByText("7 / 50", { exact: true })).toBeVisible();
  await expect(page.getByText("1275 / 10000", { exact: true })).toBeVisible();
  await expect(page.getByText("384.5 / 2048", { exact: true })).toBeVisible();
  await expect(page.getByText("Exportación de datos")).toBeVisible();
  await expect(page.getByText("Importación segura de personas")).toBeVisible();
  await expect(page.getByText("Acceso a API")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Contactar ventas" }),
  ).toHaveAttribute("href", "mailto:ventas@abogadosencolombiasas.com");

  expect(billingRequests.length).toBeGreaterThanOrEqual(2);
  expect(new Set(billingRequests.map(({ pathname }) => pathname))).toEqual(
    new Set(["/api/billing/subscription", "/api/billing/usage"]),
  );
  expect(
    billingRequests.every(
      ({ authorization, search }) =>
        authorization === `Bearer ${jwt}` && search === "",
    ),
  ).toBe(true);
});

test("permite reintentar la facturación después de una falla transitoria", async ({
  page,
}) => {
  let subscriptionRequests = 0;
  let usageRequests = 0;
  let billingRecovered = false;

  await installSession(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/auth/me") {
      await fulfillCurrentSession(route);
      return;
    }

    if (pathname === "/api/billing/subscription") {
      subscriptionRequests += 1;
      if (!billingRecovered) {
        await fulfillJson(
          route,
          {
            statusCode: 503,
            message: "Facturación temporalmente no disponible",
          },
          503,
        );
        return;
      }
      await fulfillJson(route, subscription);
      return;
    }

    if (pathname === "/api/billing/usage") {
      usageRequests += 1;
      if (!billingRecovered) {
        await fulfillJson(
          route,
          {
            statusCode: 503,
            message: "Facturación temporalmente no disponible",
          },
          503,
        );
        return;
      }
      await fulfillJson(route, usage);
      return;
    }

    await fulfillJson(
      route,
      { statusCode: 404, message: "Ruta no simulada" },
      404,
    );
  });

  await page.goto("/dashboard/billing");
  await expect(
    page.getByText("Facturación temporalmente no disponible"),
  ).toBeVisible();

  const requestsBeforeRetry = {
    subscription: subscriptionRequests,
    usage: usageRequests,
  };
  billingRecovered = true;
  await page.getByRole("button", { name: "Reintentar" }).click();

  await expect(
    page.getByRole("heading", { name: subscription.plan.name }),
  ).toBeVisible();
  expect(subscriptionRequests).toBeGreaterThan(
    requestsBeforeRetry.subscription,
  );
  expect(usageRequests).toBeGreaterThan(requestsBeforeRetry.usage);
});

function inboxItem(overrides: Record<string, unknown>) {
  return {
    id: "TASK:task-overdue",
    entityId: "task-overdue",
    kind: "TASK",
    kindLabel: "Tarea",
    reference: null,
    title: "Visita al barrio central",
    status: "TODO",
    statusLabel: "Por hacer",
    priority: "HIGH",
    responsible: null,
    dueAt: "2026-09-01T13:00:00.000Z",
    overdue: true,
    blocked: true,
    blockReason: "Sin responsable asignado",
    cta: {
      label: "Gestionar tarea",
      href: "/dashboard/tasks?view=tasks&entityId=task-overdue",
    },
    createdAt: "2026-08-20T12:00:00.000Z",
    ...overrides,
  };
}

const initialInboxItems = [
  inboxItem({}),
  inboxItem({
    id: "COMMITMENT:commitment-environment",
    entityId: "commitment-environment",
    kind: "COMMITMENT",
    kindLabel: "Compromiso",
    reference: "CMP-024",
    title: "Publicar informe ambiental",
    status: "AT_RISK",
    statusLabel: "En riesgo",
    responsible: {
      id: "manager-one",
      name: "Ana Responsable",
      role: "CAMPAIGN_MANAGER",
    },
    dueAt: "2026-10-15T13:00:00.000Z",
    overdue: false,
    blocked: true,
    blockReason: "El compromiso está marcado en riesgo",
    cta: {
      label: "Gestionar compromiso",
      href: "/dashboard/tasks?view=commitments&entityId=commitment-environment",
    },
  }),
  inboxItem({
    id: "COMMUNICATION_APPROVAL:approval-weekly",
    entityId: "approval-weekly",
    kind: "COMMUNICATION_APPROVAL",
    kindLabel: "Aprobación",
    reference: null,
    title: "Boletín semanal",
    status: "PENDING",
    statusLabel: "Pendiente de revisión",
    priority: "MEDIUM",
    overdue: false,
    blocked: true,
    blockReason: "Espera revisión independiente; solicitada por Comunicaciones",
    cta: {
      label: "Revisar y decidir",
      href: "/dashboard/communications?view=review&entityId=approval-weekly",
    },
  }),
  inboxItem({
    id: "INCIDENT:incident-logistics",
    entityId: "incident-logistics",
    kind: "INCIDENT",
    kindLabel: "Incidente",
    reference: "INC-031",
    title: "Confirmar logística del evento",
    status: "IN_PROGRESS",
    statusLabel: "En gestión",
    priority: "MEDIUM",
    responsible: {
      id: "coordinator-one",
      name: "Carlos Coordinador",
      role: "ZONE_COORDINATOR",
    },
    dueAt: "2026-10-20T13:00:00.000Z",
    overdue: false,
    blocked: false,
    blockReason: null,
    cta: {
      label: "Gestionar incidente",
      href: "/dashboard/incidents?view=detail&entityId=incident-logistics",
    },
  }),
];

function operationalInboxResponse(refreshed: boolean) {
  const items = refreshed
    ? [
        ...initialInboxItems,
        inboxItem({
          id: "TASK:task-refreshed",
          entityId: "task-refreshed",
          title: "Nueva tarea después del corte",
          priority: "LOW",
          responsible: {
            id: "coordinator-two",
            name: "Elena Coordinadora",
            role: "ZONE_COORDINATOR",
          },
          dueAt: null,
          overdue: false,
          blocked: false,
          blockReason: null,
        }),
      ]
    : initialInboxItems;

  return {
    generatedAt: refreshed
      ? "2026-09-07T15:05:00.000Z"
      : "2026-09-07T15:00:00.000Z",
    mode: "CAMPAIGN",
    summary: {
      total: items.length,
      visible: items.length,
      overdue: 1,
      blocked: 3,
      unassigned: 1,
      pendingApprovals: 1,
      truncated: false,
      byKind: {
        tasks: refreshed ? 2 : 1,
        commitments: 1,
        cases: 0,
        incidents: 1,
        approvals: 1,
      },
    },
    items,
  };
}

const linkedCommitment = {
  id: "commitment-environment",
  mode: "CAMPAIGN",
  reference: "CMP-024",
  title: "Publicar informe ambiental",
  description: "Consolidar y publicar el informe verificable.",
  status: "AT_RISK",
  ownerId: backendUser.id,
  issueCaseId: null,
  targetDate: "2026-10-15T13:00:00.000Z",
  progress: 45,
  isPublic: true,
  evidencePath: null,
  completedAt: null,
  createdAt: "2026-08-20T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  owner: {
    id: backendUser.id,
    name: backendUser.name,
    role: backendUser.role,
  },
  issueCase: null,
  _count: { tasks: 0 },
  canUpdate: true,
};

const linkedTask = {
  id: "task-overdue",
  mode: "CAMPAIGN",
  title: "Visita al barrio central",
  description: "Confirmar la agenda territorial pendiente.",
  status: "TODO",
  priority: "HIGH",
  assigneeId: backendUser.id,
  issueCaseId: null,
  commitmentId: null,
  createdById: backendUser.id,
  dueAt: "2026-09-01T13:00:00.000Z",
  completedAt: null,
  createdAt: "2026-08-20T12:00:00.000Z",
  updatedAt: "2026-08-20T12:00:00.000Z",
  assignee: {
    id: backendUser.id,
    name: backendUser.name,
    role: backendUser.role,
  },
  createdBy: {
    id: backendUser.id,
    name: backendUser.name,
    role: backendUser.role,
  },
  issueCase: null,
  commitment: null,
};

const linkedApproval = {
  id: "approval-weekly",
  mode: "CAMPAIGN",
  issueCaseId: null,
  channel: "EMAIL",
  title: "Boletín semanal",
  content: { message: "Resumen semanal sujeto a revisión independiente." },
  contentHash: "a".repeat(64),
  purpose: "Información operativa",
  containsSensitiveData: false,
  status: "PENDING",
  requestedById: "communications-user",
  decidedById: null,
  decisionReason: null,
  decidedAt: null,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  requestedBy: {
    id: "communications-user",
    name: "Equipo de comunicaciones",
    role: "COMMUNICATIONS_MANAGER",
  },
  decidedBy: null,
  issueCase: null,
};

const linkedIncident = {
  id: "incident-logistics",
  mode: "CAMPAIGN",
  reference: "INC-031",
  title: "Confirmar logística del evento",
  description: "Incidente operativo pendiente de revisión.",
  category: "Logística",
  sourceChannel: "INTERNAL",
  status: "IN_PROGRESS",
  priority: "MEDIUM",
  voterId: null,
  externalContactRef: null,
  divisionId: null,
  assigneeId: backendUser.id,
  createdById: backendUser.id,
  confidential: false,
  dueAt: "2026-10-20T13:00:00.000Z",
  firstResponseAt: null,
  resolvedAt: null,
  resolutionReady: false,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  assignee: {
    id: backendUser.id,
    name: backendUser.name,
    role: backendUser.role,
  },
  createdBy: {
    id: backendUser.id,
    name: backendUser.name,
    role: backendUser.role,
  },
  voter: null,
  division: null,
  _count: { interactions: 0, tasks: 0, commitments: 0 },
};

const publicTenant = {
  ...tenant,
  id: "tenant-public-office-e2e",
  name: "Despacho verificable",
  slug: "despacho-verificable",
  type: "PUBLIC_OFFICE",
  operationStage: "POST_ELECTION",
};

const publicManager = {
  ...backendUser,
  id: "public-manager-e2e",
  email: "manager.public@example.test",
  name: "Dirección de servicio",
  role: "CONSTITUENT_SERVICES_MANAGER",
  tenant: publicTenant,
};

const linkedCase = {
  ...linkedIncident,
  id: "case-public-service",
  mode: "PUBLIC_OFFICE",
  reference: "PQRS-084",
  title: "Solicitud de alumbrado público",
  description: "Caso ciudadano pendiente de seguimiento.",
  category: "Servicios públicos",
  sourceChannel: "WEB",
  assigneeId: publicManager.id,
  createdById: publicManager.id,
  assignee: {
    id: publicManager.id,
    name: publicManager.name,
    role: publicManager.role,
  },
  createdBy: {
    id: publicManager.id,
    name: publicManager.name,
    role: publicManager.role,
  },
};

test("filtra, busca, enlaza y actualiza la bandeja operativa", async ({
  page,
}) => {
  let inboxRequests = 0;
  let inboxRefreshed = false;
  const inboxRequestMetadata: Array<{
    search: string;
    authorization: string;
  }> = [];
  const commitmentDestinationRequests: URL[] = [];

  await installSession(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me") {
      await fulfillCurrentSession(route);
      return;
    }

    if (url.pathname === "/api/operational-inbox") {
      inboxRequests += 1;
      inboxRequestMetadata.push({
        search: url.search,
        authorization: request.headers().authorization ?? "",
      });
      await fulfillJson(route, operationalInboxResponse(inboxRefreshed));
      return;
    }

    if (url.pathname === "/api/tasks/assignees") {
      await fulfillJson(route, []);
      return;
    }

    if (url.pathname === "/api/tasks") {
      await fulfillJson(route, {
        items: [],
        pagination: { page: 1, limit: 9, total: 0, totalPages: 0 },
      });
      return;
    }

    if (url.pathname === "/api/commitments") {
      commitmentDestinationRequests.push(url);
      const matchesTarget =
        url.searchParams.get("entityId") === linkedCommitment.id;
      await fulfillJson(route, {
        items: matchesTarget ? [linkedCommitment] : [],
        pagination: {
          page: 1,
          limit: 9,
          total: matchesTarget ? 1 : 0,
          totalPages: matchesTarget ? 1 : 0,
        },
        permissions: { canCreate: true, canReadInternal: true },
      });
      return;
    }

    await fulfillJson(
      route,
      { statusCode: 404, message: "Ruta no simulada" },
      404,
    );
  });

  await page.goto("/dashboard/inbox");

  await expect(
    page.getByRole("heading", { name: "Bandeja operativa" }),
  ).toBeVisible();
  const summary = page.getByRole("region", { name: "Resumen de trabajo" });
  await expect(
    summary.getByRole("button", { name: /Todo abierto/ }),
  ).toContainText("4");

  await summary.getByRole("button", { name: /Vencido/ }).click();
  await expect(page.getByTestId("inbox-item-task-overdue")).toBeVisible();
  await expect(
    page.getByTestId("inbox-item-commitment-environment"),
  ).toHaveCount(0);

  const filters = page.getByLabel("Filtros de bandeja");
  await filters.getByRole("button", { name: "Todo abierto" }).click();
  const search = page.getByRole("searchbox", { name: "Buscar en la bandeja" });
  await search.fill("ambiental");
  const commitmentCard = page.getByTestId("inbox-item-commitment-environment");
  await expect(commitmentCard).toBeVisible();
  await expect(page.getByText("1 resultado", { exact: true })).toBeVisible();
  await expect(
    commitmentCard.getByRole("link", { name: "Gestionar compromiso" }),
  ).toHaveAttribute(
    "href",
    "/dashboard/tasks?view=commitments&entityId=commitment-environment",
  );

  await search.fill("");
  await filters.getByRole("button", { name: "Por aprobar" }).click();
  const approvalCard = page.getByTestId("inbox-item-approval-weekly");
  await expect(approvalCard).toBeVisible();
  await expect(
    approvalCard.getByRole("link", { name: "Revisar y decidir" }),
  ).toHaveAttribute(
    "href",
    "/dashboard/communications?view=review&entityId=approval-weekly",
  );

  await filters.getByRole("button", { name: "Todo abierto" }).click();
  const requestsBeforeReload = inboxRequests;
  inboxRefreshed = true;
  await page.getByRole("button", { name: "Actualizar corte" }).click();
  await expect(page.getByTestId("inbox-item-task-refreshed")).toBeVisible();
  await expect(
    summary.getByRole("button", { name: /Todo abierto/ }),
  ).toContainText("5");

  expect(inboxRequests).toBeGreaterThan(requestsBeforeReload);
  expect(
    inboxRequestMetadata.every(
      ({ authorization, search }) =>
        authorization === `Bearer ${jwt}` && search === "?limit=100",
    ),
  ).toBe(true);

  await page
    .getByTestId("inbox-item-commitment-environment")
    .getByRole("link", { name: "Gestionar compromiso" })
    .click();

  await expect(page).toHaveURL(
    /\/dashboard\/tasks\?view=commitments&entityId=commitment-environment$/,
  );
  await expect(page.getByRole("tab", { name: /Compromisos/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const linkedCommitmentCard = page.getByTestId(
    "commitment-card-commitment-environment",
  );
  await expect(linkedCommitmentCard).toHaveAttribute("aria-current", "true");
  await expect(linkedCommitmentCard).toBeFocused();
  expect(
    commitmentDestinationRequests.some(
      (url) =>
        url.searchParams.get("entityId") === "commitment-environment" &&
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("mode"),
    ),
  ).toBe(true);
});

test("una bandeja vacía enlaza los flujos operativos permitidos", async ({
  page,
}) => {
  await installSession(page);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/auth/me") {
      await fulfillCurrentSession(route);
      return;
    }
    if (url.pathname === "/api/operational-inbox") {
      await fulfillJson(route, {
        generatedAt: "2026-09-07T15:00:00.000Z",
        mode: "CAMPAIGN",
        summary: {
          total: 0,
          visible: 0,
          overdue: 0,
          blocked: 0,
          unassigned: 0,
          pendingApprovals: 0,
          truncated: false,
          byKind: {
            tasks: 0,
            commitments: 0,
            cases: 0,
            incidents: 0,
            approvals: 0,
          },
        },
        items: [],
      });
      return;
    }

    await fulfillJson(
      route,
      { statusCode: 404, message: "Ruta no simulada" },
      404,
    );
  });

  await page.goto("/dashboard/inbox");

  const actions = page.getByTestId("inbox-empty-actions");
  await expect(actions).toBeVisible();
  await expect(
    actions.getByRole("link", { name: "Abrir Incidentes y crisis" }),
  ).toHaveAttribute("href", "/dashboard/incidents");
  await expect(
    actions.getByRole("link", { name: "Abrir Tareas y compromisos" }),
  ).toHaveAttribute("href", "/dashboard/tasks");
  await expect(
    actions.getByRole("link", { name: "Abrir Atención ciudadana" }),
  ).toHaveCount(0);
});

test("abre y focaliza la solicitud exacta desde la bandeja", async ({
  page,
}) => {
  const approvalRequests: URL[] = [];
  await installSession(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me") {
      await fulfillCurrentSession(route);
      return;
    }
    if (url.pathname === "/api/operational-inbox") {
      await fulfillJson(route, operationalInboxResponse(false));
      return;
    }
    if (url.pathname === "/api/communications/approvals") {
      approvalRequests.push(url);
      const matchesTarget =
        url.searchParams.get("entityId") === linkedApproval.id;
      await fulfillJson(route, {
        items: matchesTarget ? [linkedApproval] : [],
        pagination: {
          page: 1,
          limit: 10,
          total: matchesTarget ? 1 : 0,
          totalPages: matchesTarget ? 1 : 0,
        },
      });
      return;
    }

    await fulfillJson(
      route,
      { statusCode: 404, message: "Ruta no simulada" },
      404,
    );
  });

  await page.goto("/dashboard/inbox");
  await page
    .getByTestId("inbox-item-approval-weekly")
    .getByRole("link", { name: "Revisar y decidir" })
    .click();

  await expect(page).toHaveURL(
    /\/dashboard\/communications\?view=review&entityId=approval-weekly$/,
  );
  const approvalCard = page.getByTestId("communication-card-approval-weekly");
  await expect(approvalCard).toHaveAttribute("aria-current", "true");
  await expect(approvalCard).toBeFocused();
  expect(
    approvalRequests.some(
      (url) =>
        url.searchParams.get("entityId") === "approval-weekly" &&
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("mode"),
    ),
  ).toBe(true);
});

test("abre y focaliza la tarea exacta desde la bandeja", async ({ page }) => {
  const taskRequests: URL[] = [];
  await installSession(page);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/auth/me") {
      await fulfillCurrentSession(route);
      return;
    }
    if (url.pathname === "/api/operational-inbox") {
      await fulfillJson(route, operationalInboxResponse(false));
      return;
    }
    if (url.pathname === "/api/tasks/assignees") {
      await fulfillJson(route, []);
      return;
    }
    if (url.pathname === "/api/tasks") {
      taskRequests.push(url);
      const matchesTarget = url.searchParams.get("entityId") === linkedTask.id;
      await fulfillJson(route, {
        items: matchesTarget ? [linkedTask] : [],
        pagination: {
          page: 1,
          limit: 9,
          total: matchesTarget ? 1 : 0,
          totalPages: matchesTarget ? 1 : 0,
        },
      });
      return;
    }
    if (url.pathname === "/api/commitments") {
      await fulfillJson(route, {
        items: [],
        pagination: { page: 1, limit: 9, total: 0, totalPages: 0 },
        permissions: { canCreate: true, canReadInternal: true },
      });
      return;
    }

    await fulfillJson(
      route,
      { statusCode: 404, message: "Ruta no simulada" },
      404,
    );
  });

  await page.goto("/dashboard/inbox");
  await page
    .getByTestId("inbox-item-task-overdue")
    .getByRole("link", { name: "Gestionar tarea" })
    .click();

  await expect(page).toHaveURL(
    /\/dashboard\/tasks\?view=tasks&entityId=task-overdue$/,
  );
  await expect(page.getByRole("tab", { name: /Tareas/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const taskCard = page.getByTestId("task-card-task-overdue");
  await expect(taskCard).toHaveAttribute("aria-current", "true");
  await expect(taskCard).toBeFocused();
  expect(
    taskRequests.some(
      (url) =>
        url.searchParams.get("entityId") === linkedTask.id &&
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("mode"),
    ),
  ).toBe(true);
});

test("abre la bitácora del incidente exacto desde la bandeja", async ({
  page,
}) => {
  const detailRequests: URL[] = [];
  await installSession(page);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me") {
      await fulfillCurrentSession(route);
      return;
    }
    if (url.pathname === "/api/operational-inbox") {
      await fulfillJson(route, operationalInboxResponse(false));
      return;
    }
    if (url.pathname === `/api/cases/${linkedIncident.id}`) {
      detailRequests.push(url);
      await fulfillJson(route, linkedIncident);
      return;
    }
    if (url.pathname === "/api/cases/assignees") {
      await fulfillJson(route, []);
      return;
    }
    if (url.pathname === "/api/cases") {
      await fulfillJson(route, {
        items: [linkedIncident],
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
      });
      return;
    }
    if (url.pathname === "/api/interactions") {
      await fulfillJson(route, {
        items: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
      return;
    }
    if (url.pathname === "/api/interactions/consents/status") {
      await fulfillJson(route, {
        issueCaseId: linkedIncident.id,
        purpose: "POLITICAL_COMMUNICATION",
        subjectType: "OTHER",
        status: null,
        active: false,
        consentRecordId: null,
        collectionChannel: null,
        noticeVersion: null,
        grantedAt: null,
        expiresAt: null,
        revokedAt: null,
        recordedAt: null,
        currentNotice: null,
        requiresReconsent: false,
      });
      return;
    }

    await fulfillJson(
      route,
      { statusCode: 404, message: "Ruta no simulada" },
      404,
    );
  });

  await page.goto("/dashboard/inbox");
  await page
    .getByTestId("inbox-item-incident-logistics")
    .getByRole("link", { name: "Gestionar incidente" })
    .click();

  await expect(page).toHaveURL(
    /\/dashboard\/incidents\?view=detail&entityId=incident-logistics$/,
    { timeout: 20_000 },
  );
  const logDialog = page.getByRole("dialog", { name: "Bitácora del caso" });
  await expect(logDialog).toBeVisible();
  await expect(logDialog).toContainText(linkedIncident.reference);
  await expect(logDialog).toContainText(linkedIncident.title);
  expect(detailRequests.length).toBeGreaterThan(0);
  expect(detailRequests.every((url) => url.search === "")).toBe(true);
});

test("abre la bitácora del caso exacto en modo de gestión pública", async ({
  page,
}) => {
  const caseInboxResponse = {
    generatedAt: "2026-09-07T15:00:00.000Z",
    mode: "PUBLIC_OFFICE",
    summary: {
      total: 1,
      visible: 1,
      overdue: 0,
      blocked: 0,
      unassigned: 0,
      pendingApprovals: 0,
      truncated: false,
      byKind: {
        tasks: 0,
        commitments: 0,
        cases: 1,
        incidents: 0,
        approvals: 0,
      },
    },
    items: [
      inboxItem({
        id: `CASE:${linkedCase.id}`,
        entityId: linkedCase.id,
        kind: "CASE",
        kindLabel: "Caso",
        reference: linkedCase.reference,
        title: linkedCase.title,
        status: linkedCase.status,
        statusLabel: "En gestión",
        responsible: linkedCase.assignee,
        dueAt: linkedCase.dueAt,
        overdue: false,
        blocked: false,
        blockReason: null,
        cta: {
          label: "Gestionar caso",
          href: `/dashboard/cases?view=detail&entityId=${linkedCase.id}`,
        },
      }),
    ],
  };
  const detailRequests: URL[] = [];
  await installSession(page, publicTenant, publicManager);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/auth/me") {
      await fulfillCurrentSession(route, publicManager);
      return;
    }
    if (url.pathname === "/api/operational-inbox") {
      await fulfillJson(route, caseInboxResponse);
      return;
    }
    if (url.pathname === `/api/cases/${linkedCase.id}`) {
      detailRequests.push(url);
      await fulfillJson(route, linkedCase);
      return;
    }
    if (url.pathname === "/api/cases/assignees") {
      await fulfillJson(route, []);
      return;
    }
    if (url.pathname === "/api/cases") {
      await fulfillJson(route, {
        items: [linkedCase],
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
      });
      return;
    }
    if (url.pathname === "/api/interactions") {
      await fulfillJson(route, {
        items: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
      return;
    }
    if (url.pathname === "/api/interactions/consents/status") {
      await fulfillJson(route, {
        issueCaseId: linkedCase.id,
        purpose: "SERVICE_FOLLOW_UP",
        subjectType: "OTHER",
        status: null,
        active: false,
        consentRecordId: null,
        collectionChannel: null,
        noticeVersion: null,
        grantedAt: null,
        expiresAt: null,
        revokedAt: null,
        recordedAt: null,
        currentNotice: null,
        requiresReconsent: false,
      });
      return;
    }

    await fulfillJson(
      route,
      { statusCode: 404, message: "Ruta no simulada" },
      404,
    );
  });

  await page.goto("/dashboard/inbox");
  await page
    .getByTestId(`inbox-item-${linkedCase.id}`)
    .getByRole("link", { name: "Gestionar caso" })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/dashboard/cases\\?view=detail&entityId=${linkedCase.id}$`),
    { timeout: 20_000 },
  );
  const logDialog = page.getByRole("dialog", { name: "Bitácora del caso" });
  await expect(logDialog).toBeVisible();
  await expect(logDialog).toContainText(linkedCase.reference);
  await expect(logDialog).toContainText(linkedCase.title);
  expect(detailRequests.length).toBeGreaterThan(0);
  expect(detailRequests.every((url) => url.search === "")).toBe(true);
});
