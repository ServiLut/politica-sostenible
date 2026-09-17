import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "operation-profile-signature",
].join(".");

type TestRole = "ADMIN" | "COMPLIANCE_OFFICER";

function sessionFor(role: TestRole) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-operation-e2e",
      name: "Campaña Horizonte",
      slug: "campana-horizonte",
      type: "CANDIDACY" as const,
      operationStage: role === "ADMIN" ? "CAMPAIGN" : "ELECTION_DAY",
    },
    user: {
      id: role === "ADMIN" ? "admin-e2e" : "compliance-e2e",
      email: `${role.toLowerCase()}@example.test`,
      name: role === "ADMIN" ? "Administración" : "Cumplimiento",
      role: role === "ADMIN" ? "AdminCampana" : "Auditor",
      backendRole: role,
    },
  };
}

async function installSession(page: Page, role: TestRole) {
  const session = sessionFor(role);
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: session,
    },
  );
  return session;
}

function successful<T>(data: T) {
  return { statusCode: 200, message: "Success", data };
}

const teamMembers = [
  {
    id: "admin-e2e",
    name: "Administración",
    email: "admin@example.test",
    role: "ADMIN",
    isActive: true,
    divisionId: null,
    division: null,
    createdAt: "2026-01-01T12:00:00.000Z",
  },
  {
    id: "manager-e2e",
    name: "Laura Dirección",
    email: "manager@example.test",
    role: "CAMPAIGN_MANAGER",
    isActive: true,
    divisionId: null,
    division: null,
    createdAt: "2026-01-02T12:00:00.000Z",
  },
  {
    id: "compliance-e2e",
    name: "Carlos Cumplimiento",
    email: "compliance@example.test",
    role: "COMPLIANCE_OFFICER",
    isActive: true,
    divisionId: null,
    division: null,
    createdAt: "2026-01-03T12:00:00.000Z",
  },
  {
    id: "inactive-e2e",
    name: "Persona inactiva",
    email: "inactive@example.test",
    role: "ADMIN",
    isActive: false,
    divisionId: null,
    division: null,
    createdAt: "2026-01-04T12:00:00.000Z",
  },
  {
    id: "volunteer-e2e",
    name: "Voluntariado activo",
    email: "volunteer@example.test",
    role: "VOLUNTEER",
    isActive: true,
    divisionId: null,
    division: null,
    createdAt: "2026-01-05T12:00:00.000Z",
  },
];

function configuredContext(overrides: Record<string, unknown> = {}) {
  const stage = String(overrides.stage ?? "ELECTION_DAY");
  const allowedNextStagesByStage: Record<string, string[]> = {
    EXPLORATION: ["EXPLORATION", "PRE_CAMPAIGN"],
    PRE_CAMPAIGN: ["PRE_CAMPAIGN", "SIGNATURE_COLLECTION", "CAMPAIGN"],
    SIGNATURE_COLLECTION: [
      "SIGNATURE_COLLECTION",
      "CAMPAIGN",
      "ELECTION_PREPARATION",
    ],
    CAMPAIGN: ["CAMPAIGN", "ELECTION_PREPARATION"],
    ELECTION_PREPARATION: [
      "ELECTION_PREPARATION",
      "SIMULATION",
      "ELECTION_DAY",
    ],
    SIMULATION: ["SIMULATION", "ELECTION_DAY"],
    ELECTION_DAY: ["ELECTION_DAY", "POST_ELECTION"],
    POST_ELECTION: ["POST_ELECTION", "CLOSED"],
    CLOSED: ["CLOSED"],
  };
  return {
    configured: true as const,
    profile: {
      id: "profile-e2e",
      tenantId: "tenant-operation-e2e",
      operationType: "SINGLE_CANDIDACY",
      stage,
      electionType: "MAYORALTY",
      circumscriptionType: "MUNICIPAL",
      circumscriptionName: "Municipio de Medellín",
      circumscriptionCode: "05001",
      listType: null,
      electionDate: "2027-10-31T17:00:00.000Z",
      votingStartDate: "2027-10-30",
      votingEndDate: "2027-11-01",
      votingWindowSourceUrl: "https://example.test/calendario-electoral.pdf",
      votingWindowReference: "Resolución de prueba, artículo 4",
      expectedTeamSize: 48,
      candidateCount: 1,
      dataControllerName: "Campaña Horizonte",
      responsibleDataUserId: "manager-e2e",
      retentionPeriodDays: 730,
      revocationProcedure:
        "Solicitar la revocación al canal de privacidad y validar la identidad de la persona titular.",
      responsibleDataUser: {
        id: "manager-e2e",
        name: "Laura Dirección",
        role: "CAMPAIGN_MANAGER",
      },
      budget: {
        maxTotalBudget: 500_000_000,
        maxPublicityLimit: 100_000_000,
      },
      derived: {
        workspace: "ELECTION_DAY",
        scale: "MEDIUM",
        dayDEnabled: true,
        warRoomEnabled: true,
        signatureCollectionEnabled: false,
        candidateListEnabled: false,
        preferentialVoteEnabled: false,
        territoryScope: "MUNICIPALITY",
      },
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-07T12:00:00.000Z",
      ...overrides,
      allowedNextStages: allowedNextStagesByStage[stage] ?? [stage],
    },
  };
}

const readinessFixture = {
  stage: "ELECTION_DAY",
  electionDate: "2027-10-31T17:00:00.000Z",
  votingStartDate: "2027-10-30",
  votingEndDate: "2027-11-01",
  votingWindowSourceUrl: "https://example.test/calendario-electoral.pdf",
  votingWindowReference: "Resolución de prueba, artículo 4",
  generatedAt: "2026-09-09T15:30:00.000Z",
  overall: "BLOCKED",
  sections: {
    BEFORE_CAMPAIGN: [
      {
        code: "ACTIVE_CONSENT_NOTICE",
        label: "Aviso de consentimiento activo",
        status: "WARN",
        detail: "Revise la vigencia del aviso antes de continuar.",
        href: "/dashboard/settings",
      },
      {
        code: "ACTIVE_NON_ADMIN_TEAM",
        label: "Equipo operativo activo",
        status: "BLOCK",
        detail: "No hay integrantes activos distintos de administración.",
        href: "/dashboard/team",
      },
    ],
    CAMPAIGN: [
      {
        code: "OPEN_TASKS",
        label: "Tareas abiertas",
        status: "WARN",
        detail: "Hay tareas operativas pendientes de cierre.",
        href: "/dashboard/tasks",
      },
    ],
    ELECTION_DAY: [
      {
        code: "E14_DIVERGENT",
        label: "Mesas con E-14 divergentes",
        status: "BLOCK",
        detail: "Una mesa tiene capturas pendientes con resultados distintos.",
        href: "/dashboard/war-room",
      },
    ],
    POST_ELECTION: [
      {
        code: "POST_ELECTION_OPERATIONAL_CLOSEOUT",
        label: "Cierre operativo poselectoral",
        status: "PASS",
        detail: "No quedan asuntos operativos abiertos.",
        href: "/dashboard/executive",
      },
    ],
  },
} as const;

test("administración configura todos los parámetros y sincroniza la etapa local", async ({
  page,
}) => {
  const session = await installSession(page, "ADMIN");
  const mutationBodies: Array<Record<string, unknown>> = [];
  let currentContext: ReturnType<typeof configuredContext> | null = null;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              role: "ADMIN",
              tenant: session.tenant,
            },
          }),
        ),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/operation-profile") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful(currentContext ?? { configured: false, profile: null }),
        ),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/operation-profile/adoption"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({ configured: Boolean(currentContext), profile: null, request: null }),
        ),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/operation-profile/readiness"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(readinessFixture)),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/team/members") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: teamMembers,
            pagination: {
              page: 1,
              limit: 100,
              total: teamMembers.length,
              totalPages: 1,
            },
          }),
        ),
      });
      return;
    }

    if (request.method() === "PUT" && pathname === "/api/operation-profile") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      currentContext = configuredContext({
        operationType: body.operationType,
        stage: body.stage,
        electionType: body.electionType,
        circumscriptionType: body.circumscriptionType,
        circumscriptionName: body.circumscriptionName,
        circumscriptionCode: body.circumscriptionCode ?? null,
        listType: body.listType ?? null,
        electionDate: body.electionDate,
        votingStartDate: body.votingStartDate,
        votingEndDate: body.votingEndDate,
        votingWindowSourceUrl: body.votingWindowSourceUrl ?? null,
        votingWindowReference: body.votingWindowReference ?? null,
        expectedTeamSize: body.expectedTeamSize,
        candidateCount: body.candidateCount,
        dataControllerName: body.dataControllerName,
        responsibleDataUserId: body.responsibleDataUserId,
        retentionPeriodDays: body.retentionPeriodDays,
        revocationProcedure: body.revocationProcedure,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(currentContext)),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/operation-profile");
  await expect(
    page.getByRole("heading", { name: "Perfil de operación" }),
  ).toBeVisible();
  await expect(page.getByText("Sin configurar", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("option", { name: /Persona inactiva/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: /Voluntariado activo/ }),
  ).toHaveCount(0);

  await expect(
    page.getByRole("option", { name: "Jornada electoral" }),
  ).toHaveCount(0);
  await page.getByLabel("Etapa operativa").selectOption("PRE_CAMPAIGN");
  await page.getByLabel("Tipo de elección").selectOption("MAYORALTY");
  await page.getByLabel("Fecha electoral").fill("2027-10-31");
  await page.getByLabel("Primera fecha incluida").fill("2027-10-30");
  await page.getByLabel("Última fecha incluida").fill("2027-11-01");
  await page
    .getByLabel("Fuente documental HTTPS (si aplica)")
    .fill("https://example.test/calendario-electoral.pdf");
  await page
    .getByLabel("Referencia documental (si aplica)")
    .fill("Resolución de prueba, artículo 4");
  await page
    .getByLabel("Nombre de la circunscripción")
    .fill("Municipio de Medellín");
  await page.getByLabel("Código de circunscripción (opcional)").fill("05001");
  await page.getByLabel("Tamaño esperado del equipo").fill("48");
  await page.getByLabel("Presupuesto total máximo (COP)").fill("500000000");
  await page.getByLabel("Límite máximo de publicidad (COP)").fill("100000000");
  await page
    .getByLabel("Responsable del tratamiento")
    .fill("Campaña Horizonte");
  await page.getByLabel("Persona responsable").selectOption("manager-e2e");
  await page.getByLabel("Conservación de datos (días)").fill("730");
  await page
    .getByLabel("Procedimiento de revocación, supresión o corrección")
    .fill(
      "Solicitar la revocación al canal de privacidad y validar la identidad de la persona titular.",
    );
  await page.getByRole("button", { name: "Guardar perfil" }).click();

  await expect(
    page.getByRole("status").filter({
      hasText: "Perfil operativo guardado y navegación actualizada",
    }),
  ).toBeVisible();
  await expect
    .poll(() => mutationBodies.length, { message: "se envió el PUT" })
    .toBe(1);
  expect(mutationBodies[0]).toEqual({
    operationType: "SINGLE_CANDIDACY",
    stage: "PRE_CAMPAIGN",
    electionType: "MAYORALTY",
    circumscriptionType: "MUNICIPAL",
    circumscriptionName: "Municipio de Medellín",
    circumscriptionCode: "05001",
    electionDate: "2027-10-31",
    votingStartDate: "2027-10-30",
    votingEndDate: "2027-11-01",
    votingWindowSourceUrl: "https://example.test/calendario-electoral.pdf",
    votingWindowReference: "Resolución de prueba, artículo 4",
    expectedTeamSize: 48,
    candidateCount: 1,
    maxTotalBudget: 500_000_000,
    maxPublicityLimit: 100_000_000,
    dataControllerName: "Campaña Horizonte",
    responsibleDataUserId: "manager-e2e",
    retentionPeriodDays: 730,
    revocationProcedure:
      "Solicitar la revocación al canal de privacidad y validar la identidad de la persona titular.",
  });
  expect(mutationBodies[0]).not.toHaveProperty("tenantId");
  expect(mutationBodies[0]).not.toHaveProperty("mode");
  expect(mutationBodies[0]).not.toHaveProperty("createdById");
  expect(mutationBodies[0]).not.toHaveProperty("expectedUpdatedAt");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const serialized = window.sessionStorage.getItem(
          "politica-sostenible.auth-session",
        );
        if (!serialized) return null;
        return (
          JSON.parse(serialized) as { tenant?: { operationStage?: string } }
        ).tenant?.operationStage;
      }),
    )
    .toBe("PRE_CAMPAIGN");
});

test("cumplimiento consulta el resumen sin cargar equipo ni exponer escritura", async ({
  page,
}) => {
  const session = await installSession(page, "COMPLIANCE_OFFICER");
  const unexpectedRequests: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              role: "COMPLIANCE_OFFICER",
              tenant: session.tenant,
            },
          }),
        ),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/operation-profile") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(configuredContext())),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/operation-profile/termination"
    ) {
      const current = configuredContext().profile;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            profile: {
              id: current.id,
              stage: current.stage,
              updatedAt: current.updatedAt,
              votingStartDate: current.votingStartDate,
              votingEndDate: current.votingEndDate,
              votingWindowSourceUrl: current.votingWindowSourceUrl,
              votingWindowReference: current.votingWindowReference,
              closureType: current.closureType,
              terminatedAt: current.terminatedAt,
              terminationCause: current.terminationCause,
            },
            request: null,
            dossier: null,
          }),
        ),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/operation-profile/adoption"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({ configured: true, profile: { id: "profile-e2e", stage: "ELECTION_DAY" }, request: null }),
        ),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/operation-profile/readiness"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(readinessFixture)),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/billing/capabilities"
    ) {
      await route.fulfill({ status: 403, body: "{}" });
      return;
    }

    unexpectedRequests.push(`${request.method()} ${pathname}`);
    await route.fulfill({ status: 403, body: "{}" });
  });

  await page.goto("/dashboard/operation-profile");
  await expect(
    page.getByRole("heading", { name: "Perfil de operación" }),
  ).toBeVisible();
  await expect(
    page.getByText("Perfil configurado", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Laura Dirección", { exact: false }),
  ).toBeVisible();
  const readinessPanel = page.locator(
    'section[aria-labelledby="operation-readiness-title"]',
  );
  await expect(readinessPanel).toBeVisible();
  await expect(
    readinessPanel.getByRole("heading", { name: "Alistamiento por ciclo" }),
  ).toBeVisible();
  for (const sectionName of ["Antes", "Campaña", "Elección", "Después"]) {
    await expect(
      readinessPanel.getByRole("heading", { name: sectionName, exact: true }),
    ).toBeVisible();
  }
  await expect(
    readinessPanel.getByRole("status", {
      name: "Estado general: Con bloqueos",
    }),
  ).toBeVisible();
  await expect(
    readinessPanel.getByText("Atención", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    readinessPanel.getByText("Bloqueo", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    readinessPanel.getByText("Cumplido", { exact: true }),
  ).toBeVisible();
  await expect(
    readinessPanel.getByRole("link", {
      name: "Revisar: Aviso de consentimiento activo",
    }),
  ).toHaveAttribute("href", "/dashboard/settings");
  await expect(
    readinessPanel.getByRole("link", {
      name: "Revisar: Equipo operativo activo",
    }),
  ).toHaveCount(0);
  await expect(
    readinessPanel.getByText("La corrección requiere un rol autorizado."),
  ).toBeVisible();

  const readinessText = await readinessPanel.innerText();
  expect(readinessText).not.toContain("tenant-operation-e2e");
  expect(readinessText).not.toContain("profile-e2e");
  expect(readinessText).not.toContain("compliance@example.test");
  expect(readinessText).not.toContain("500.000.000");
  expect(readinessText).not.toContain("voterCount");
  await expect(
    page.getByText(/Solo Administración puede modificar/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar perfil" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Tipo de operación")).toHaveCount(0);
  expect(unexpectedRequests).toEqual([]);
});

test("conserva el perfil y permite reintentar si falla el alistamiento", async ({
  page,
}) => {
  const session = await installSession(page, "COMPLIANCE_OFFICER");
  let readinessRequests = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              role: "COMPLIANCE_OFFICER",
              tenant: session.tenant,
            },
          }),
        ),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/operation-profile") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(configuredContext())),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/operation-profile/adoption"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({ configured: true, profile: { id: "profile-e2e", stage: "ELECTION_DAY" }, request: null }),
        ),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/operation-profile/readiness"
    ) {
      readinessRequests += 1;
      if (readinessRequests === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 503,
            message: "Falla temporal al calcular el alistamiento.",
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(successful(readinessFixture)),
        });
      }
      return;
    }

    await route.fulfill({ status: 403, body: "{}" });
  });

  await page.goto("/dashboard/operation-profile");
  await expect(
    page.getByText("Perfil configurado", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "No pudimos verificar el alistamiento",
    }),
  ).toBeVisible();
  await expect(
    page
      .locator('section[aria-labelledby="operation-readiness-title"]')
      .getByRole("alert"),
  ).toContainText("Falla temporal al calcular el alistamiento.");

  await page.getByRole("button", { name: "Reintentar alistamiento" }).click();

  await expect
    .poll(() => readinessRequests, {
      message: "el panel repitió la consulta de estado",
    })
    .toBe(2);
  await expect(
    page.getByRole("status", { name: "Estado general: Con bloqueos" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "No pudimos verificar el alistamiento",
    }),
  ).toHaveCount(0);
});
