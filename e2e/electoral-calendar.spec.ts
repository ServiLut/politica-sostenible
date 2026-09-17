import { expect, test, type Page, type Route } from "@playwright/test";

type TestRole = "CAMPAIGN_MANAGER" | "COMPLIANCE_OFFICER" | "AUDITOR";
type Stage = "PRE_CAMPAIGN" | "CAMPAIGN" | "ELECTION_DAY" | "CLOSED";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "electoral-calendar-e2e",
].join(".");

function sessionFor(role: TestRole, stage: Stage) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-calendar-e2e",
      name: "Candidatura calendario verificable",
      slug: "calendar-e2e",
      type: "CANDIDACY" as const,
      operationStage: stage,
    },
    user: {
      id: `actor-${role}`,
      email: `${role.toLowerCase()}@example.test`,
      name: `Persona ${role}`,
      role: role === "CAMPAIGN_MANAGER" ? "GerenteOps" : "Auditor",
      backendRole: role,
    },
  };
}

async function installSession(page: Page, role: TestRole, stage: Stage) {
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
}

const people = {
  creator: {
    id: "manager-calendar",
    name: "Gerencia que cargó",
    role: "CAMPAIGN_MANAGER" as const,
    isActive: true,
  },
  reviewer: {
    id: "reviewer-calendar",
    name: "Revisión independiente",
    role: "COMPLIANCE_OFFICER" as const,
    isActive: true,
  },
  backup: {
    id: "backup-calendar",
    name: "Suplencia territorial",
    role: "ZONE_COORDINATOR" as const,
    isActive: true,
  },
};

function milestone(
  id: string,
  title: string,
  localDate: string,
  category: "REGISTRATION" | "CAMPAIGN" = "CAMPAIGN",
) {
  return {
    id,
    stableKey: id.toUpperCase().replaceAll("-", "."),
    category,
    semantics: "EXTERNAL_DEADLINE" as const,
    title,
    applicabilityRule:
      "Aplica sólo al perfil, elección y ronda declarados en esta fuente.",
    originalTextSummary:
      "Resumen interno de la fuente; requiere contraste con el acto original.",
    localDate,
    localTime: "17:00",
    timeZone: "America/Bogota",
    occursAtUtc: `${localDate}T22:00:00.000Z`,
    responsibleUserId: people.creator.id,
    backupUserId: people.backup.id,
    alertOffsetsDays: [30, 15, 7, 3, 1, 0],
    stageGateRequired: category === "REGISTRATION",
    resultEvidenceRequired: category === "REGISTRATION",
    linkedTaskId: null,
    linkedEventId: null,
    responsible: people.creator,
    backup: people.backup,
    results: [],
    resolution: {
      requiresSecondControl: category === "REGISTRATION",
      resolved: false,
      status: "OPEN" as const,
      effectiveResult: null,
      pendingResult: null,
    },
    daysRemaining: 7,
  };
}

function release(
  id: string,
  status: "STAGED" | "VALIDATED" | "ACTIVE" | "SUPERSEDED",
  roundCode: string,
  versionLabel: string,
  milestones = [milestone(`${id}-milestone`, "Hito controlado", "2026-09-16")],
) {
  return {
    id,
    basedOnReleaseId: status === "STAGED" ? "release-active" : null,
    electionType: "MAYORALTY",
    electionDate: "2026-10-25",
    circumscriptionType: "MUNICIPAL",
    circumscriptionName: "Municipio de prueba",
    circumscriptionCode: "05001",
    roundCode,
    versionLabel,
    status,
    sourceAuthority: "Autoridad electoral competente",
    sourceUrl: `https://authority.example.test/calendar/${id}`,
    sourceReference: `Acto verificable ${versionLabel}`,
    sourcePublishedAt: "2026-08-30",
    sourceCutoffAt: "2026-09-09T15:00:00.000Z",
    sourceSha256: "a".repeat(64),
    version: status === "STAGED" ? 1 : status === "VALIDATED" ? 2 : 3,
    createdBy: people.creator,
    validatedBy: status === "STAGED" ? null : people.reviewer,
    activatedBy: status === "ACTIVE" ? people.reviewer : null,
    validatedAt: status === "STAGED" ? null : "2026-09-09T16:00:00.000Z",
    activatedAt: status === "ACTIVE" ? "2026-09-09T17:00:00.000Z" : null,
    supersededAt:
      status === "SUPERSEDED" ? "2026-09-09T17:00:00.000Z" : null,
    milestones,
    diff: {
      baselineReleaseId: status === "STAGED" ? "release-active" : null,
      added: status === "STAGED" ? [] : milestones,
      removed: [],
      moved:
        status === "STAGED"
          ? [
              {
                stableKey: milestones[0].stableKey,
                title: milestones[0].title,
                from: {
                  stableKey: milestones[0].stableKey,
                  title: milestones[0].title,
                  localDate: "2026-09-15",
                  localTime: "17:00",
                  timeZone: "America/Bogota",
                },
                to: {
                  stableKey: milestones[0].stableKey,
                  title: milestones[0].title,
                  localDate: milestones[0].localDate,
                  localTime: milestones[0].localTime,
                  timeZone: milestones[0].timeZone,
                },
              },
            ]
          : [],
      changed: [],
      hasChanges: true,
    },
  };
}

function overview(stage: Stage) {
  const overdue = milestone(
    "campaign-overdue",
    "Entrega interna pendiente",
    "2026-09-01",
  );
  overdue.daysRemaining = -8;
  const upcoming = milestone(
    "registration-upcoming",
    "Radicación externa declarada",
    "2026-09-16",
    "REGISTRATION",
  );
  const active = release(
    "release-active",
    "ACTIVE",
    "UNICA",
    "Corte activo",
    [overdue, upcoming],
  );
  const staged = release(
    "release-staged",
    "STAGED",
    "UNICA",
    "Corrección con fecha movida",
  );
  const validated = release(
    "release-validated",
    "VALIDATED",
    "SEGUNDA_VUELTA",
    "Segunda vuelta validada",
  );
  return {
    disclaimer:
      "Control interno versionado. No reemplaza el calendario ni una decisión de la autoridad electoral.",
    evaluatedAt: "2026-09-09T15:00:00.000Z",
    readOnly: stage === "CLOSED",
    profile: {
      id: "profile-calendar-e2e",
      stage,
      electionType: "MAYORALTY",
      electionDate: "2026-10-25",
      circumscriptionType: "MUNICIPAL",
      circumscriptionName: "Municipio de prueba",
      circumscriptionCode: "05001",
    },
    releases: [active, staged, validated],
    operators: Object.values(people),
    activeSummary: {
      activeReleaseId: active.id,
      versionLabel: active.versionLabel,
      sourceCutoffAt: active.sourceCutoffAt,
      upcoming30Days: [upcoming],
      overdue: [overdue],
      alertsDue: [upcoming],
      potentialAssignmentConflicts: [],
      unresolvedRequiredGates: [upcoming],
      notificationDeliveryClaimed: false,
    },
  };
}

function successful(data: unknown) {
  return { statusCode: 200, message: "Success", data };
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status >= 400 ? data : successful(data)),
  });
}

async function installRoutes(
  page: Page,
  role: TestRole,
  stage: Stage,
  onMutation?: (path: string, body: Record<string, unknown>) => void,
) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/api/auth/me") {
      const session = sessionFor(role, stage);
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
    if (request.method() === "GET" && path === "/api/electoral-calendar") {
      await fulfill(route, overview(stage));
      return;
    }
    if (
      request.method() === "POST" &&
      path.startsWith("/api/electoral-calendar/")
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      onMutation?.(path, body);
      await fulfill(route, {
        resource: {},
        command: {
          id: "calendar-command-e2e",
          clientRequestId: body.clientRequestId,
          payloadSha256: body.payloadSha256,
        },
        noOp: false,
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });
}

test("dirección ve alertas, diff y lenguaje estrictamente interno", async ({
  page,
}) => {
  await installSession(page, "CAMPAIGN_MANAGER", "CAMPAIGN");
  await installRoutes(page, "CAMPAIGN_MANAGER", "CAMPAIGN");
  await page.goto("/dashboard/electoral-calendar");

  await expect(
    page.getByRole("heading", { name: "Calendario electoral versionado" }),
  ).toBeVisible();
  await expect(page.getByText("Bandeja de alertas")).toBeVisible();
  await expect(page.getByText("Vencido: Entrega interna pendiente")).toBeVisible();
  await expect(page.getByText("Movido: Hito controlado")).toBeVisible();
  await expect(
    page.getByText("no certifica oficialidad", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Zona IANA")).toHaveValue("America/Bogota");

  const calendarNavigation = page.getByRole("link", {
    name: "Calendario electoral",
  });
  if (!(await calendarNavigation.isVisible())) {
    await page.getByRole("button", { name: "Abrir más opciones" }).click();
  }
  await expect(calendarNavigation).toBeVisible();
});

test("segunda persona valida y activa con fuente, diff y tareas reconocidos", async ({
  page,
}) => {
  await installSession(page, "COMPLIANCE_OFFICER", "PRE_CAMPAIGN");
  const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
  await installRoutes(
    page,
    "COMPLIANCE_OFFICER",
    "PRE_CAMPAIGN",
    (path, body) => mutations.push({ path, body }),
  );
  await page.goto("/dashboard/electoral-calendar");

  const stagedArticle = page.getByRole("article").filter({
    hasText: "Corrección con fecha movida",
  });
  await stagedArticle
    .getByText("Revisé la fuente aplicable", { exact: false })
    .click();
  await stagedArticle
    .getByLabel("Razón de validación")
    .fill("Fuente y alcance contrastados por una segunda persona.");
  await stagedArticle
    .getByRole("button", { name: "Validar fuente y versión" })
    .click();
  await expect(
    page.getByText("Fuente validada por una persona distinta"),
  ).toBeVisible();

  const validatedArticle = page.getByRole("article").filter({
    hasText: "Segunda vuelta validada",
  });
  await validatedArticle.getByText("Confirmo nuevamente la fuente").click();
  await validatedArticle
    .getByText("Revisé fechas añadidas", { exact: false })
    .click();
  await validatedArticle
    .getByText("Resolví o concilié", { exact: false })
    .click();
  await validatedArticle
    .getByLabel("Razón de activación")
    .fill("Fuente, cambios y tareas conciliados antes de activar.");
  await validatedArticle
    .getByRole("button", { name: "Activar para control interno" })
    .click();

  expect(mutations.map(({ path }) => path)).toEqual([
    "/api/electoral-calendar/releases/release-staged/validate",
    "/api/electoral-calendar/releases/release-validated/activate",
  ]);
  for (const { body } of mutations) {
    expect(body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(body).not.toHaveProperty("tenantId");
    expect(body).not.toHaveProperty("mode");
  }
  expect(mutations[1].body).toMatchObject({
    sourceReviewedAcknowledged: true,
    diffReviewedAcknowledged: true,
    affectedTasksResolvedAcknowledged: true,
  });
});

test("ELECTION_DAY congela versiones pero conserva registro operativo", async ({
  page,
}) => {
  await installSession(page, "CAMPAIGN_MANAGER", "ELECTION_DAY");
  let mutations = 0;
  await installRoutes(page, "CAMPAIGN_MANAGER", "ELECTION_DAY", () => {
    mutations += 1;
  });
  await page.goto("/dashboard/electoral-calendar");

  await expect(page.getByText("Jornada electoral:", { exact: false })).toBeVisible();
  await expect(page.getByText("Preparar una versión")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Validar fuente y versión" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Activar para control interno" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Registrar resultado" }),
  ).toHaveCount(2);
  expect(mutations).toBe(0);
});

test("CLOSED mantiene historia en sólo lectura y no emite mutaciones", async ({
  page,
}) => {
  await installSession(page, "AUDITOR", "CLOSED");
  let mutations = 0;
  await installRoutes(page, "AUDITOR", "CLOSED", () => {
    mutations += 1;
  });
  await page.goto("/dashboard/electoral-calendar");

  await expect(page.getByText("Operación cerrada:", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Corte activo" })).toBeVisible();
  await expect(page.getByText("Preparar una versión")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrar resultado" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Validar fuente y versión" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Activar para control interno" }),
  ).toHaveCount(0);
  expect(mutations).toBe(0);
});
