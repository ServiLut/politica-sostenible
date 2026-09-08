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

function configuredContext(
  overrides: Record<string, unknown> = {},
) {
  return {
    configured: true as const,
    profile: {
      id: "profile-e2e",
      tenantId: "tenant-operation-e2e",
      operationType: "SINGLE_CANDIDACY",
      stage: "ELECTION_DAY",
      electionType: "MAYORALTY",
      circumscriptionType: "MUNICIPAL",
      circumscriptionName: "Municipio de Medellín",
      circumscriptionCode: "05001",
      listType: null,
      electionDate: "2027-10-31T17:00:00.000Z",
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
    },
  };
}

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
          successful(
            currentContext ?? { configured: false, profile: null },
          ),
        ),
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

  await page.getByLabel("Etapa operativa").selectOption("ELECTION_DAY");
  await page.getByLabel("Tipo de elección").selectOption("MAYORALTY");
  await page.getByLabel("Fecha electoral").fill("2027-10-31");
  await page
    .getByLabel("Nombre de la circunscripción")
    .fill("Municipio de Medellín");
  await page
    .getByLabel("Código de circunscripción (opcional)")
    .fill("05001");
  await page.getByLabel("Tamaño esperado del equipo").fill("48");
  await page.getByLabel("Presupuesto total máximo (COP)").fill("500000000");
  await page
    .getByLabel("Límite máximo de publicidad (COP)")
    .fill("100000000");
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

  await expect(page.getByRole("status")).toContainText(
    "Perfil operativo guardado y navegación actualizada",
  );
  await expect
    .poll(() => mutationBodies.length, { message: "se envió el PUT" })
    .toBe(1);
  expect(mutationBodies[0]).toEqual({
    operationType: "SINGLE_CANDIDACY",
    stage: "ELECTION_DAY",
    electionType: "MAYORALTY",
    circumscriptionType: "MUNICIPAL",
    circumscriptionName: "Municipio de Medellín",
    circumscriptionCode: "05001",
    electionDate: "2027-10-31T17:00:00.000Z",
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
        return (JSON.parse(serialized) as { tenant?: { operationStage?: string } })
          .tenant?.operationStage;
      }),
    )
    .toBe("ELECTION_DAY");
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

    unexpectedRequests.push(`${request.method()} ${pathname}`);
    await route.fulfill({ status: 403, body: "{}" });
  });

  await page.goto("/dashboard/operation-profile");
  await expect(
    page.getByRole("heading", { name: "Perfil de operación" }),
  ).toBeVisible();
  await expect(page.getByText("Perfil configurado", { exact: true })).toBeVisible();
  await expect(page.getByText("Laura Dirección", { exact: false })).toBeVisible();
  await expect(
    page.getByText(/Solo Administración puede modificar/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar perfil" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Tipo de operación")).toHaveCount(0);
  expect(unexpectedRequests).toEqual([]);
});
