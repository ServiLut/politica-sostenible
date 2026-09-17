import { expect, test, type Page, type Route } from "@playwright/test";

type TestRole = "ADMIN" | "AUDITOR";
type Stage = "POST_ELECTION" | "CLOSED";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "scrutiny-e2e",
].join(".");

function sessionFor(role: TestRole, stage: Stage) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-scrutiny-e2e",
      name: "Campaña de escrutinio verificable",
      slug: "scrutiny-e2e",
      type: "CANDIDACY" as const,
      operationStage: stage,
    },
    user: {
      id: `actor-${role}`,
      email: `${role.toLowerCase()}@example.test`,
      name: `Persona ${role}`,
      role: role === "ADMIN" ? "AdminCampana" : "Auditor",
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
  return session;
}

function scrutinyOverview(stage: Stage) {
  const readOnly = stage === "CLOSED";
  return {
    operationStage: stage,
    readOnly,
    stateContract: {
      INTERNAL:
        "Captura o borrador del equipo; no acredita radicación, decisión ni resultado oficial.",
      FILED:
        "Actuación presentada externamente con autoridad, fecha, canal, referencia y soporte revisado.",
      DECIDED:
        "Decisión externa incorporada con documento y revisión independiente.",
      OFFICIAL:
        "Dato tomado de una declaración o credencial oficial aprobada; nunca se calcula ni se proyecta.",
    },
    readiness: {
      ready: false,
      evaluatedAt: "2026-09-09T15:00:00.000Z",
      basis:
        "TENANT_SCOPED_APPROVED_DOCUMENTS_EXPLICIT_APPLICABILITY_E16_TIME_COVERAGE_EXTERNAL_EVIDENCE_FOUR_EYES",
      summary: {
        commissionCount: 1,
        documentCount: 2,
        officialDeclarationCount: 0,
        blockerCount: 2,
      },
      blockers: [
        {
          code: "SCRUTINY_REQUIREMENTS_PENDING",
          count: 1,
          detail:
            "1 documento esencial sigue sin decisión expresa de aplicabilidad.",
          href: "/dashboard/scrutiny",
        },
        {
          code: "SCRUTINY_E16_COVERAGE_GAPS",
          count: 1,
          detail: "1 comisión conserva brechas temporales de cobertura E-16.",
          href: "/dashboard/scrutiny",
        },
      ],
    },
    commissions: [
      {
        id: "commission-e2e",
        code: "AUX-BOG-01",
        level: "AUXILIARY",
        name: "Comisión auxiliar Bogotá",
        scopeCode: "11001",
        scopeName: "Bogotá D.C.",
        venue: "Sede central",
        timeZone: "America/Bogota",
        scheduledStartsAt: "2026-10-26T13:00:00.000Z",
        scheduledEndsAt: "2026-10-26T20:00:00.000Z",
        status: "ACTIVE",
        version: 2,
        legalLeadUserId: "actor-ADMIN",
        requirements: [
          {
            id: "requirement-e2e",
            documentType: "E24",
            applicability: "PENDING",
            rationale:
              "Pendiente de determinación expresa por el responsable jurídico.",
            version: 1,
          },
        ],
        coverage: [],
        events: [
          {
            id: "event-e2e",
            type: "OPENED",
            occurredAt: "2026-10-26T13:00:00.000Z",
            notes: "Apertura pública verificada por el equipo.",
          },
        ],
        temporalCoverage: {
          complete: false,
          coveredMilliseconds: 0,
          requiredMilliseconds: 25_200_000,
          gaps: [
            {
              startsAt: "2026-10-26T13:00:00.000Z",
              endsAt: "2026-10-26T20:00:00.000Z",
            },
          ],
        },
      },
    ],
    documents: [
      {
        id: "document-internal-e2e",
        commissionId: "commission-e2e",
        type: "E24",
        evidenceState: "INTERNAL",
        storagePath: "tenant-scrutiny-e2e/scrutiny/file.pdf",
        sha256: "a".repeat(64),
        size: 512,
        contentType: "application/pdf",
        declaredIssuer: "Equipo jurídico",
        authorityInstance: "Control interno",
        versionLabel: "Digitación 1",
        cutoffAt: "2026-10-26T14:00:00.000Z",
        externalReference: null,
        reviewStatus: "PENDING",
        reviewReason: null,
        version: 1,
        createdById: "another-admin",
        custodyEvents: [],
      },
      {
        id: "document-official-e2e",
        commissionId: "commission-e2e",
        type: "DECLARATION_CREDENTIAL",
        evidenceState: "OFFICIAL",
        storagePath: "tenant-scrutiny-e2e/scrutiny/credential.pdf",
        sha256: "b".repeat(64),
        size: 1024,
        contentType: "application/pdf",
        declaredIssuer: "Autoridad electoral competente",
        authorityInstance: "Comisión distrital",
        versionLabel: "Credencial expedida",
        cutoffAt: "2026-10-28T16:00:00.000Z",
        externalReference: "CREDENCIAL-2026-001",
        reviewStatus: "APPROVED",
        reviewReason: "Fuente oficial contrastada por segunda persona.",
        version: 2,
        createdById: "another-admin",
        custodyEvents: [],
      },
    ],
    discrepancies: [],
    actions: [
      {
        id: "action-e2e",
        commissionId: "commission-e2e",
        parentActionId: null,
        type: "CLAIM",
        standingType: "CANDIDATE",
        standingBasis: "Representación acreditada en el expediente.",
        legalGroundCode: "ART-192",
        legalGroundVersion: "Código Electoral",
        facts:
          "La digitación interna muestra una diferencia que aún debe contrastarse.",
        legalBasis:
          "Causal jurídica documentada y sujeta al término de la audiencia.",
        affectedReferences: ["Mesa 001"],
        authority: "Comisión auxiliar",
        deadlineAt: "2026-10-26T19:00:00.000Z",
        deadlineRule: "Término computado durante la audiencia pública.",
        timeZone: "America/Bogota",
        status: "DRAFT",
        currentVersion: 1,
        draftedById: "another-admin",
        approvedById: null,
        filedById: null,
        filingReference: null,
        version: 1,
        decision: null,
        appeals: [],
      },
    ],
    declarations: [
      {
        id: "declaration-draft-e2e",
        commissionId: "commission-e2e",
        scopeReference: "Bogotá D.C.",
        authority: "Comisión distrital",
        authorityReference: "BORRADOR-TRANSCRIPCIÓN",
        declaredAt: "2026-10-28T16:00:00.000Z",
        officialDocumentId: "document-official-e2e",
        status: "DRAFT_INTERNAL",
        reviewStatus: "PENDING",
        recordedById: "another-admin",
        version: 1,
        lines: [
          {
            id: "line-e2e",
            optionCode: "001",
            optionLabel: "Candidatura A",
            votes: 100,
            seats: 1,
            declaredStatus: "TRANSCRITO",
          },
        ],
      },
    ],
    participants: [
      { id: "actor-ADMIN", name: "Persona ADMIN", role: "ADMIN" },
      { id: "another-admin", name: "Segunda persona", role: "ADMIN" },
      { id: "witness-e2e", name: "Testigo E-16", role: "WITNESS" },
    ],
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
    if (request.method() === "GET" && path === "/api/scrutiny") {
      await fulfill(route, scrutinyOverview(stage));
      return;
    }
    if (request.method() === "POST" && path === "/api/storage/download-url") {
      expect(request.postDataJSON()).toEqual({
        module: "scrutiny",
        resourceId: "document-internal-e2e",
      });
      await fulfill(route, {
        url: "https://storage.example.test/signed-scrutiny-document",
        expiresAt: "2026-10-26T15:05:00.000Z",
      });
      return;
    }
    if (
      request.method() === "PUT" &&
      path === "/api/scrutiny/commissions/commission-e2e/requirements"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      onMutation?.(path, body);
      await fulfill(route, {
        id: "requirement-e2e",
        documentType: "E24",
        applicability: body.applicability,
        rationale: body.rationale,
        version: 2,
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });
}

test("opera aplicabilidad con hash canónico y sin tenant enviado por la UI", async ({
  page,
}) => {
  await installSession(page, "ADMIN", "POST_ELECTION");
  const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
  await installRoutes(page, "ADMIN", "POST_ELECTION", (path, body) =>
    mutations.push({ path, body }),
  );

  await page.goto("/dashboard/scrutiny");
  await expect(
    page.getByRole("heading", {
      name: "Escrutinios, reclamaciones y declaración",
    }),
  ).toBeVisible();
  await expect(page.getByText("Interno · no oficial").first()).toBeVisible();
  await expect(page.getByText("Oficial documentado").first()).toBeVisible();
  await expect(
    page.getByText("2 controles pendientes antes del cierre ordinario"),
  ).toBeVisible();
  await page
    .getByText("8. Declaración y resultado documentado", { exact: true })
    .click();
  await expect(
    page.getByText("Borrador interno · no es resultado oficial"),
  ).toBeVisible();

  await page
    .getByText("2. Alistamiento documental y audiencia", { exact: true })
    .click();
  await page.getByLabel("Aplicabilidad").selectOption("NOT_APPLICABLE");
  await page
    .getByLabel("Fundamento de la decisión")
    .fill(
      "La autoridad confirmó que el E-24 no se expide para esta instancia auxiliar.",
    );
  await page.getByRole("button", { name: "Guardar decisión expresa" }).click();

  await expect(
    page.getByText("Aplicabilidad documental actualizada con justificación."),
  ).toBeVisible();

  await page
    .getByText("5. Revisión y cadena de custodia", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preparar copia privada" })
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: "Descargar archivo autorizado" }).first(),
  ).toHaveAttribute(
    "href",
    "https://storage.example.test/signed-scrutiny-document",
  );

  expect(mutations).toHaveLength(1);
  expect(mutations[0].path).toBe(
    "/api/scrutiny/commissions/commission-e2e/requirements",
  );
  expect(mutations[0].body).toMatchObject({
    documentType: "E24",
    applicability: "NOT_APPLICABLE",
    expectedVersion: 1,
  });
  expect(mutations[0].body.clientRequestId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(mutations[0].body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(mutations[0].body).not.toHaveProperty("tenantId");
  expect(mutations[0].body).not.toHaveProperty("commissionId");
});

test("CLOSED conserva consulta, no muestra formularios y no llama datos internos oficiales", async ({
  page,
}) => {
  await installSession(page, "AUDITOR", "CLOSED");
  let mutationCount = 0;
  await installRoutes(page, "AUDITOR", "CLOSED", () => {
    mutationCount += 1;
  });

  await page.goto("/dashboard/scrutiny");
  await expect(
    page.getByText("Operación cerrada: expediente en solo lectura"),
  ).toBeVisible();
  await expect(page.getByLabel("Comisión de trabajo activa")).toHaveValue(
    "commission-e2e",
  );
  await expect(page.locator("form")).toHaveCount(0);
  await page
    .getByText("8. Declaración y resultado documentado", { exact: true })
    .click();
  await expect(
    page.getByText("Borrador interno · no es resultado oficial"),
  ).toBeVisible();
  await expect(page.getByText("Resultado oficial documentado")).toHaveCount(0);
  expect(mutationCount).toBe(0);
});

test("ofrece un reintento accesible después de una falla transitoria", async ({
  page,
}) => {
  await installSession(page, "ADMIN", "POST_ELECTION");
  let requests = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/api/auth/me") {
      const session = sessionFor("ADMIN", "POST_ELECTION");
      await fulfill(route, {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: "ADMIN",
          tenant: session.tenant,
        },
      });
      return;
    }
    if (request.method() === "GET" && path === "/api/billing/capabilities") {
      await fulfill(route, {
        plan: { code: "ENTERPRISE", name: "Enterprise" },
        features: {},
      });
      return;
    }
    if (request.method() === "GET" && path === "/api/scrutiny") {
      requests += 1;
      if (requests === 1) {
        await fulfill(
          route,
          { statusCode: 503, message: "Falla temporal del expediente." },
          503,
        );
      } else {
        await fulfill(route, scrutinyOverview("POST_ELECTION"));
      }
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/scrutiny");
  await expect(page.locator("section[role='alert']")).toContainText(
    "Falla temporal del expediente.",
  );
  await page.getByRole("button", { name: "Reintentar carga" }).click();
  await expect
    .poll(() => requests, { message: "la consulta se repitió" })
    .toBe(2);
  await expect(page.getByLabel("Comisión de trabajo activa")).toHaveValue(
    "commission-e2e",
  );
});
