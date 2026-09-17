import { expect, test, type Page, type Route } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "pqrsd-e2e",
].join(".");

const session = {
  accessToken: jwt,
  expiresAt: null,
  tenant: {
    id: "tenant-pqrsd-e2e",
    name: "Entidad publica verificable",
    slug: "entidad-pqrsd-e2e",
    type: "PUBLIC_OFFICE" as const,
  },
  user: {
    id: "pqrsd-admin-e2e",
    email: "pqrsd-admin@example.test",
    name: "Administracion PQRSD",
    role: "AdminCampana" as const,
    backendRole: "ADMIN" as const,
  },
};

const rule = {
  id: "rule-general-e2e",
  classificationKey: "PETICION_GENERAL",
  label: "Peticion general",
  durationDays: 17,
  dayMethod: "WORKING_DAYS",
  startRule: "NEXT_WORKING_DATE",
  legalBasis: "Acto administrativo institucional documentado.",
  highRisk: false,
};

function rulePackage(status: "DRAFT" | "ACTIVE") {
  return {
    id: `package-${status.toLowerCase()}-e2e`,
    scopeKey: "GENERAL",
    versionLabel: "2026.1",
    sourceUrl: "https://entidad.gov.co/normas/acto-123",
    sourceReference: "Acto 123 de 2026, articulo 8",
    sourceSha256: "a".repeat(64),
    timeZone: "America/Bogota",
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: null,
    nonWorkingWeekdays: [0, 6],
    status,
    revision: 1,
    createdById: "pqrsd-preparer-e2e",
    rules: [rule],
    calendarExceptions: [],
  };
}

function overview(mode: "configuration" | "dossier") {
  const configured = mode === "dossier";
  return {
    scope: "PUBLIC_OFFICE_PQRSD_ONLY",
    configurationReady: configured,
    institutionalStatus: configured
      ? "INTERNAL_EVIDENCE_SYSTEM_CONFIGURED"
      : "CONFIGURATION_REQUIRED",
    institutionalMessage: configured
      ? "La configuracion interna esta aprobada. La entrega externa exige constancia."
      : "Aun no existe un paquete normativo/calendario aprobado. No se habilita la recepcion formal ni se infieren plazos.",
    externalDeliveryAutomated: false,
    generatedAt: "2026-09-09T18:00:00.000Z",
    packages: [rulePackage(configured ? "ACTIVE" : "DRAFT")],
    dossiers: configured
      ? [
          {
            id: "dossier-e2e",
            reference: "PQRSD-INT-2026-0001",
            receivedAt: "2026-09-09T15:00:00.000Z",
            receivedTimeZone: "America/Bogota",
            status: "CLASSIFICATION_PENDING",
            riskLevel: "NORMAL",
            version: 2,
            updatedAt: "2026-09-09T16:00:00.000Z",
            petitioner: {
              maskedFullName: "A*** P***",
              maskedDocumentNumber: "***1234",
              maskedEmail: "a***@example.test",
              maskedPhone: "***4567",
            },
            currentPrimaryAssignee: null,
            currentBackupAssignee: null,
            classifications: [],
            deadlines: [
              {
                calculationStatus: "CALCULATION_REQUIRES_REVIEW",
                currentDueLocalDate: null,
                dueAt: null,
              },
            ],
            detailHref:
              "/dashboard/pqrsd?view=detail&entityId=dossier-e2e",
          },
        ]
      : [],
    alerts: configured
      ? [
          {
            code: "PQRSD_DEADLINE_REQUIRES_REVIEW",
            severity: "critical",
            dossierId: "dossier-e2e",
            reference: "PQRSD-INT-2026-0001",
            message: "Plazo ausente o ambiguo; no se interpreta como cero dias.",
            href: "/dashboard/pqrsd?view=detail&entityId=dossier-e2e",
            remainingBusinessDays: null,
          },
        ]
      : [],
    team: [
      { id: "pqrsd-admin-e2e", name: "Administracion PQRSD", role: "ADMIN" },
      { id: "pqrsd-worker-e2e", name: "Gestor PQRSD", role: "CASE_WORKER" },
    ],
    privacy: {
      listDataMasked: true,
      detailAccessAudited: true,
      campaignDataReuse: false,
      exportEnabled: false,
    },
  };
}

function detail() {
  return {
    id: "dossier-e2e",
    reference: "PQRSD-INT-2026-0001",
    subject: "Solicitud de informacion publica",
    description: "Hechos completos de la solicitud ciudadana.",
    status: "CLASSIFICATION_PENDING",
    version: 2,
    rulePackage: {
      rules: [rule],
      timeZone: "America/Bogota",
      sourceReference: "Acto 123 de 2026, articulo 8",
    },
    petitioner: {
      fullName: "Ana Persona",
      documentType: "CC",
      documentNumber: "1012345678",
      email: "ana.persona@example.test",
      phone: "+573001234567",
      postalAddress: "Direccion reservada",
      preferredChannel: "Correo electronico",
    },
    documents: [],
    acknowledgements: [],
    classifications: [],
    deadlines: [],
    assignments: [],
    transfers: [],
    extensions: [],
    responses: [],
    closures: [],
    reopenings: [],
    statusEvents: [],
    privacyNotice:
      "Detalle sensible. Este acceso quedo auditado y no autoriza reutilizacion en CRM de campana.",
  };
}

function successful(data: unknown) {
  return { statusCode: 200, message: "Success", data };
}

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(successful(data)),
  });
}

async function installSession(page: Page) {
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

async function installRoutes(
  page: Page,
  mode: "configuration" | "dossier",
  onMutation?: (body: Record<string, unknown>) => void,
  onDetailPurpose?: (purpose: string) => void,
  onSearchRequest?: (request: {
    url: string;
    authorization: string;
    body: Record<string, unknown>;
  }) => void,
) {
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
          role: session.user.backendRole,
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
    if (request.method() === "GET" && path === "/api/operational-inbox") {
      await fulfill(route, {
        generatedAt: "2026-09-10T13:00:00.000Z",
        mode: "PUBLIC_OFFICE",
        summary: {
          total: 1,
          visible: 1,
          overdue: 0,
          blocked: 1,
          unassigned: 0,
          pendingApprovals: 0,
          truncated: false,
          byKind: {
            tasks: 0,
            commitments: 0,
            cases: 0,
            incidents: 0,
            approvals: 0,
            pqrsd: 1,
          },
        },
        items: [
          {
            id: "PQRSD:dossier-e2e",
            entityId: "dossier-e2e",
            kind: "PQRSD",
            kindLabel: "PQRSD formal",
            reference: "PQRSD-INT-2026-0001",
            title: "Solicitud de informacion publica",
            status: "CLASSIFICATION_PENDING",
            statusLabel: "Clasificacion pendiente",
            priority: "HIGH",
            responsible: {
              id: "pqrsd-worker-e2e",
              name: "Gestor PQRSD",
              role: "CASE_WORKER",
            },
            dueAt: "2026-09-15T04:59:00.000Z",
            overdue: false,
            blocked: true,
            blockReason: "Clasificacion pendiente de revision",
            cta: {
              label: "Gestionar expediente",
              href: "/dashboard/pqrsd?view=detail&entityId=dossier-e2e",
            },
            createdAt: "2026-09-09T15:00:00.000Z",
          },
        ],
      });
      return;
    }
    if (request.method() === "POST" && path === "/api/search") {
      onSearchRequest?.({
        url: request.url(),
        authorization: request.headers().authorization ?? "",
        body: request.postDataJSON() as Record<string, unknown>,
      });
      await fulfill(route, {
        voters: [],
        users: [],
        proposals: [],
        tasks: [],
        commitments: [],
        cases: [],
        incidents: [],
        pqrsd: [
          {
            id: "dossier-e2e",
            reference: "PQRSD-INT-2026-0001",
            subject: "Solicitud de informacion publica",
            status: "CLASSIFICATION_PENDING",
            riskLevel: "HIGH",
            dueAt: "2026-09-15T04:59:00.000Z",
            responsible: {
              id: "pqrsd-worker-e2e",
              name: "Gestor PQRSD",
            },
          },
        ],
      });
      return;
    }
    if (request.method() === "GET" && path === "/api/pqrsd") {
      await fulfill(route, overview(mode));
      return;
    }
    if (
      request.method() === "GET" &&
      path === "/api/pqrsd/dossiers/dossier-e2e"
    ) {
      onDetailPurpose?.(url.searchParams.get("purpose") ?? "");
      await fulfill(route, detail());
      return;
    }
    if (
      request.method() === "POST" &&
      path === "/api/pqrsd/rule-packages/package-draft-e2e/review"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      onMutation?.(body);
      await fulfill(route, {
        id: "package-draft-e2e",
        status: "ACTIVE",
        revision: 2,
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });
}

test("shows fail-closed configuration and submits a four-eyes decision over HTTP", async ({
  page,
}) => {
  await installSession(page);
  let posted: Record<string, unknown> | null = null;
  await installRoutes(page, "configuration", (body) => {
    posted = body;
  });

  await page.goto("/dashboard/pqrsd");
  await expect(
    page.getByRole("heading", { name: "Expediente PQRSD con control probatorio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Configuracion aprobada pendiente · recepcion formal bloqueada",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("No existen plazos 10/15/30 por defecto", { exact: false }),
  ).toBeVisible();

  await page
    .getByLabel("Fundamento para 2026.1")
    .fill("Revision independiente de fuente, vigencia y calendario.");
  await page.getByRole("button", { name: "Registrar decision" }).click();
  await expect(
    page.getByText("Decision independiente registrada."),
  ).toBeVisible();

  expect(posted).toMatchObject({
    decision: "APPROVE_ACTIVATE",
    expectedRevision: 1,
  });
  expect(posted).toHaveProperty("clientRequestId");
  expect(String(posted?.payloadSha256)).toMatch(/^[a-f0-9]{64}$/u);
  expect(posted).not.toHaveProperty("tenantId");
});

test("keeps the list masked and audits purpose before revealing sensitive detail", async ({
  page,
}) => {
  await installSession(page);
  let capturedPurpose = "";
  await installRoutes(
    page,
    "dossier",
    undefined,
    (purpose) => (capturedPurpose = purpose),
  );

  await page.goto("/dashboard/pqrsd");
  await expect(page.getByText("A*** P***")).toBeVisible();
  await expect(page.getByText("Ana Persona")).toHaveCount(0);
  await expect(
    page.getByText("Requiere revision · no es cero"),
  ).toBeVisible();

  await page
    .getByLabel("Proposito para abrir detalle")
    .fill("Atender expediente asignado en prueba E2E");
  await page.getByRole("button", { name: "Abrir y auditar" }).click();

  await expect(
    page.getByRole("heading", { name: "PQRSD-INT-2026-0001" }),
  ).toBeVisible();
  await expect(page.getByText("Ana Persona")).toBeVisible();
  await expect(
    page.getByText("no autoriza reutilizacion en CRM de campana", {
      exact: false,
    }),
  ).toBeVisible();
  expect(capturedPurpose).toBe("Atender expediente asignado en prueba E2E");
});

test("discovers formal PQRSD in the operational inbox and global search without leaking petitioner PII", async ({
  page,
}) => {
  await installSession(page);
  const searchRequests: Array<{
    url: string;
    authorization: string;
    body: Record<string, unknown>;
  }> = [];
  let capturedPurpose = "";
  await installRoutes(
    page,
    "dossier",
    undefined,
    (purpose) => (capturedPurpose = purpose),
    (request) => searchRequests.push(request),
  );

  await page.goto("/dashboard/inbox");
  const card = page.getByTestId("inbox-item-dossier-e2e");
  await expect(card).toBeVisible();
  await expect(card).toContainText("PQRSD-INT-2026-0001");
  await expect(card).toContainText("Solicitud de informacion publica");
  await expect(card).toContainText("Gestor PQRSD");
  await expect(page.getByText("Ana Persona")).toHaveCount(0);
  await expect(page.getByText("1012345678")).toHaveCount(0);

  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Búsqueda global" });
  await dialog
    .getByRole("searchbox", { name: "Buscar en la organización" })
    .fill("alumbrado");
  const searchResult = dialog.getByRole("link", {
    name: /Solicitud de informacion publica/,
  });
  await expect(dialog.getByText("PQRSD formal", { exact: true })).toBeVisible();
  await expect(searchResult).toHaveAttribute(
    "href",
    "/dashboard/pqrsd?view=detail&entityId=dossier-e2e",
  );
  await expect(searchResult).toContainText("Riesgo alto");
  await expect(searchResult).toContainText("Gestor PQRSD");
  await expect.poll(() => searchRequests.length).toBe(1);
  expect(searchRequests[0]).toMatchObject({
    authorization: `Bearer ${jwt}`,
    body: { query: "alumbrado" },
  });
  expect(new URL(searchRequests[0].url).search).toBe("");
  await page.keyboard.press("Escape");

  await card.getByRole("link", { name: "Gestionar expediente" }).click();
  await expect(page).toHaveURL(
    /\/dashboard\/pqrsd\?view=detail&entityId=dossier-e2e$/,
  );
  await expect(
    page.getByRole("heading", { name: "PQRSD-INT-2026-0001" }),
  ).toBeVisible();
  expect(capturedPurpose).toContain("alerta exacta");
});
