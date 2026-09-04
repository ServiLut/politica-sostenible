import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

const tenant = {
  id: "tenant-campaign",
  name: "Campaña verificable",
  slug: "campana-verificable",
  type: "CANDIDACY",
};

const adminSession = {
  accessToken: jwt,
  expiresAt: null,
  tenant,
  user: {
    id: "admin-campaign",
    email: "direccion@example.test",
    name: "Dirección de campaña",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};

const complianceSession = {
  accessToken: jwt,
  expiresAt: null,
  tenant,
  user: {
    id: "compliance-campaign",
    email: "cumplimiento@example.test",
    name: "Oficial de cumplimiento",
    role: "Auditor",
    backendRole: "COMPLIANCE_OFFICER",
  },
};

const zoneCoordinatorSession = {
  accessToken: jwt,
  expiresAt: null,
  tenant,
  user: {
    id: "zone-campaign",
    email: "zona@example.test",
    name: "Coordinación territorial",
    role: "Coordinador",
    backendRole: "ZONE_COORDINATOR",
  },
};

const assignees = [
  { id: "admin-campaign", name: "Dirección de campaña", role: "ADMIN" },
  { id: "legal-team", name: "Equipo jurídico", role: "CAMPAIGN_MANAGER" },
];

const initialIncident = {
  id: "incident-1",
  mode: "CAMPAIGN",
  reference: "PQRS-CAM-2026-AAA111",
  title: "Daño en material de puesto",
  description: "El coordinador reportó material deteriorado antes del evento.",
  category: "Logística",
  sourceChannel: "INTERNAL",
  status: "OPEN",
  priority: "HIGH",
  voterId: null,
  externalContactRef: "FOLIO-18",
  divisionId: null,
  assigneeId: "admin-campaign",
  createdById: "admin-campaign",
  confidential: false,
  dueAt: "2026-08-30T17:00:00.000Z",
  firstResponseAt: null,
  resolvedAt: null,
  createdAt: "2026-08-21T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
  assignee: assignees[0],
  createdBy: assignees[0],
  voter: null,
  division: null,
  _count: { interactions: 11, tasks: 0, commitments: 0 },
};

const initialInteraction = {
  id: "interaction-1",
  channel: "INTERNAL",
  direction: "INTERNAL",
  summary: "El equipo verificó el reporte y preservó la evidencia disponible.",
  outcome: "Incidente remitido al responsable asignado.",
  sentiment: null,
  occurredAt: "2026-08-21T13:00:00.000Z",
  createdAt: "2026-08-21T13:01:00.000Z",
  actor: assignees[0],
};

const currentConsentNotice = {
  id: "case-notice-e2e",
  mode: "CAMPAIGN",
  purpose: "POLITICAL_COMMUNICATION",
  version: "campaign-2026-09-v1",
  title: "Autorización para seguimiento del caso",
  content:
    "La persona autoriza de manera previa, expresa e informada el contacto relacionado con este caso y conoce cómo ejercer sus derechos.",
  controllerName: "Campaña verificable",
  contactEmail: "privacidad@example.test",
  privacyPolicyUrl: null,
  activatedAt: "2026-09-04T12:00:00.000Z",
};

function consentStatus(
  state: "none" | "active" | "revoked",
  notice = currentConsentNotice,
) {
  const active = state === "active";
  const exists = state !== "none";
  return {
    issueCaseId: initialIncident.id,
    purpose: "POLITICAL_COMMUNICATION",
    subjectType: "OTHER",
    status: active ? "GRANTED" : state === "revoked" ? "REVOKED" : null,
    active,
    consentRecordId: active
      ? "consent-active"
      : state === "revoked"
        ? "consent-revoked"
        : null,
    collectionChannel: exists ? "PHONE" : null,
    noticeVersion: exists ? notice.version : null,
    grantedAt: exists ? "2026-08-21T12:30:00.000Z" : null,
    expiresAt: null,
    revokedAt: state === "revoked" ? "2026-08-21T14:30:00.000Z" : null,
    recordedAt: active
      ? "2026-08-21T12:30:00.000Z"
      : state === "revoked"
        ? "2026-08-21T14:30:00.000Z"
        : null,
    currentNotice: notice,
    requiresReconsent: false,
  };
}

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

function pageOf(items: (typeof initialIncident)[]) {
  return {
    items,
    pagination: {
      page: 1,
      limit: 12,
      total: items.length,
      totalPages: items.length ? 1 : 0,
    },
  };
}

function interactionPage(
  items: (typeof initialInteraction)[],
  page: number,
  total: number,
) {
  return {
    items,
    pagination: {
      page,
      limit: 10,
      total,
      totalPages: total > 0 ? Math.ceil(total / 10) : 0,
    },
  };
}

async function installSession(
  page: Page,
  session:
    | typeof adminSession
    | typeof complianceSession
    | typeof zoneCoordinatorSession,
) {
  await page.addInitScript(
    ({
      storageKey,
      authSession,
    }: {
      storageKey: string;
      authSession: unknown;
    }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: session,
    },
  );
}

function currentSessionResponse(
  authSession:
    | typeof adminSession
    | typeof complianceSession
    | typeof zoneCoordinatorSession,
) {
  return successful({
    user: {
      id: authSession.user.id,
      email: authSession.user.email,
      name: authSession.user.name,
      role: authSession.user.backendRole,
      tenant: authSession.tenant,
    },
  });
}

test("administra un incidente real con filtros, responsable y transición auditada", async ({
  page,
}) => {
  const authorizationHeaders: string[] = [];
  const requestedCaseUrls: URL[] = [];
  const requestedInteractionUrls: URL[] = [];
  const requestedConsentUrls: URL[] = [];
  const mutationBodies: Record<string, unknown>[] = [];
  const interactionMutationBodies: Record<string, unknown>[] = [];
  const consentMutationBodies: Record<string, unknown>[] = [];
  let incidents = [initialIncident];
  let interactionTotal = initialIncident._count.interactions;
  let consentState: "none" | "active" | "revoked" = "none";
  let servedConsentNotice = currentConsentNotice;
  const renewedConsentNotice = {
    ...currentConsentNotice,
    id: "case-notice-e2e-v2",
    version: "campaign-2026-09-v2",
    title: "Autorización actualizada para seguimiento del caso",
  };

  await installSession(page, adminSession);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (url.pathname === "/api/cases/assignees" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(assignees)),
      });
      return;
    }

    if (
      url.pathname === "/api/interactions/consents/status" &&
      method === "GET"
    ) {
      requestedConsentUrls.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful(consentStatus(consentState, servedConsentNotice)),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/interactions/consents/grants" &&
      method === "POST"
    ) {
      consentMutationBodies.push(request.postDataJSON());
      consentState = "active";
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(consentStatus(consentState, servedConsentNotice), 201),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/interactions/consents/revocations" &&
      method === "POST"
    ) {
      consentMutationBodies.push(request.postDataJSON());
      consentState = "revoked";
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(consentStatus(consentState, servedConsentNotice), 201),
        ),
      });
      return;
    }

    if (url.pathname === "/api/interactions" && method === "GET") {
      requestedInteractionUrls.push(url);
      const interactionPageNumber = Number(url.searchParams.get("page") ?? 1);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            interactionPage(
              [
                {
                  ...initialInteraction,
                  id: `interaction-page-${interactionPageNumber}`,
                },
              ],
              interactionPageNumber,
              interactionTotal,
            ),
          ),
        ),
      });
      return;
    }

    if (url.pathname === "/api/interactions" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      interactionMutationBodies.push(body);
      interactionTotal += 1;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              ...initialInteraction,
              ...body,
              id: "interaction-created",
              sentiment: null,
              occurredAt: "2026-08-21T14:00:00.000Z",
              createdAt: "2026-08-21T14:00:01.000Z",
            },
            201,
          ),
        ),
      });
      return;
    }

    if (url.pathname === "/api/cases" && method === "GET") {
      requestedCaseUrls.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(pageOf(incidents))),
      });
      return;
    }

    if (url.pathname === "/api/cases" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      const created = {
        ...initialIncident,
        ...body,
        id: "incident-2",
        reference: "PQRS-CAM-2026-BBB222",
        assigneeId: String(body.assigneeId),
        assignee: assignees[1],
        createdAt: "2026-08-21T15:00:00.000Z",
        updatedAt: "2026-08-21T15:00:00.000Z",
      } as typeof initialIncident;
      incidents = [created, ...incidents];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(created, 201)),
      });
      return;
    }

    if (url.pathname === "/api/cases/incident-2" && method === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      const updated = {
        ...incidents[0],
        ...body,
        updatedAt: "2026-08-21T16:00:00.000Z",
      } as typeof initialIncident;
      incidents = [updated, ...incidents.slice(1)];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(updated)),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Ruta no simulada: ${method} ${url.pathname}`,
      }),
    });
  });

  await page.goto("/dashboard/incidents");

  await expect(
    page.getByRole("heading", { name: "Incidentes y respuesta de crisis" }),
  ).toBeVisible();
  await expect(
    page.getByText(/no inventa análisis de sentimiento/i),
  ).toBeVisible();
  const moreNavigation = page.getByRole("button", {
    name: /Abrir .* opciones/i,
  });
  if (await moreNavigation.isVisible()) {
    await moreNavigation.click();
  }
  await expect(
    page.getByRole("link", { name: "Incidentes y crisis" }),
  ).toBeVisible();
  if (await moreNavigation.isVisible()) {
    await page.getByRole("button", { name: /Cerrar men/i }).click();
  }
  await expect(page.getByTestId("incident-card-incident-1")).toContainText(
    "Daño en material de puesto",
  );
  await expect(page.getByTestId("incident-card-incident-1")).toContainText(
    "Severidad Alta",
  );

  const initialCard = page.getByTestId("incident-card-incident-1");
  await initialCard.getByRole("button", { name: /Abrir bitácora/ }).click();
  const timelineDialog = page.getByRole("dialog", {
    name: "Bitácora del caso",
  });
  await expect(timelineDialog).toContainText(
    "El equipo verificó el reporte y preservó la evidencia disponible.",
  );
  await expect(timelineDialog.getByLabel("Percepción (opcional)")).toHaveCount(
    0,
  );
  await expect
    .poll(() => requestedInteractionUrls.length)
    .toBeGreaterThanOrEqual(1);
  await timelineDialog.getByRole("button", { name: "Siguiente" }).click();
  await expect
    .poll(() =>
      requestedInteractionUrls.some(
        (url) => url.searchParams.get("page") === "2",
      ),
    )
    .toBe(true);

  await expect(timelineDialog).toContainText("Sin autorización registrada");
  await timelineDialog.getByLabel("Dirección").selectOption("OUTBOUND");
  await expect(
    timelineDialog.getByRole("button", { name: "Guardar en bitácora" }),
  ).toBeDisabled();
  const consentChannel = timelineDialog.getByLabel("Canal de autorización");
  const consentConfirmation = timelineDialog.getByRole("checkbox", {
    name: /Confirmo que la persona autorizó/,
  });
  const grantConsentButton = timelineDialog.getByRole("button", {
    name: "Registrar autorización",
  });
  await expect(consentChannel).toHaveValue("");
  await consentChannel.selectOption("PHONE");
  await consentConfirmation.check();
  await expect(grantConsentButton).toBeEnabled();

  servedConsentNotice = renewedConsentNotice;
  await timelineDialog
    .getByRole("button", { name: "Actualizar historial" })
    .click();
  await expect(timelineDialog).toContainText(renewedConsentNotice.version);
  await expect(consentChannel).toHaveValue("");
  await expect(consentConfirmation).not.toBeChecked();
  await expect(grantConsentButton).toBeDisabled();

  await consentChannel.selectOption("PHONE");
  await consentConfirmation.check();
  await grantConsentButton.click();
  await expect(timelineDialog).toContainText("Autorización vigente");
  await expect(
    timelineDialog.getByRole("button", { name: "Guardar en bitácora" }),
  ).toBeEnabled();

  await timelineDialog
    .getByLabel("Resumen de la gestión")
    .fill("Se informó al contacto sobre la verificación del incidente.");
  await timelineDialog
    .getByRole("button", { name: "Guardar en bitácora" })
    .click();
  await expect(timelineDialog).toContainText(
    "Gestión registrada y vinculada al caso.",
  );
  await timelineDialog
    .getByLabel("Motivo de revocación")
    .fill("Solicitud expresa recibida por la persona contactada.");
  await timelineDialog
    .getByRole("button", { name: "Revocar autorización" })
    .click();
  await expect(timelineDialog).toContainText("Autorización revocada");
  await timelineDialog.getByLabel("Dirección").selectOption("OUTBOUND");
  await expect(
    timelineDialog.getByRole("button", { name: "Guardar en bitácora" }),
  ).toBeDisabled();
  await timelineDialog
    .getByRole("button", { name: "Cerrar bitácora del caso" })
    .click();
  await expect(initialCard).toContainText("Ver bitácora · 12");

  await page
    .getByRole("combobox", { name: "Filtrar incidentes por estado" })
    .selectOption("IN_PROGRESS");
  await expect
    .poll(() =>
      requestedCaseUrls.some(
        (url) => url.searchParams.get("status") === "IN_PROGRESS",
      ),
    )
    .toBe(true);

  await page
    .getByRole("combobox", { name: "Filtrar incidentes por estado" })
    .selectOption("");
  await page.getByPlaceholder(/Referencia, hecho/).fill("material");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect
    .poll(() =>
      requestedCaseUrls.some(
        (url) => url.searchParams.get("search") === "material",
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Reportar incidente" }).click();
  const dialog = page.getByRole("dialog", { name: "Reportar incidente" });
  await dialog
    .getByLabel("Hecho reportado")
    .fill("Amenaza al equipo territorial");
  await dialog
    .getByLabel("Descripción verificable")
    .fill(
      "Llamada recibida a las 14:00; el equipo activó el protocolo interno.",
    );
  await dialog.getByLabel("Categoría").selectOption("Seguridad");
  await dialog.getByLabel("Severidad / prioridad").selectOption("URGENT");
  await dialog.getByLabel("Responsable").selectOption("legal-team");
  await dialog.getByLabel("Vencimiento").fill("2026-08-22");
  await expect(
    dialog.getByText(
      /Es una clasificación operativa\. No restringe el acceso: la visibilidad sigue los permisos generales del rol y la asignación del incidente\./,
    ),
  ).toBeVisible();
  await dialog.getByLabel(/Aplicar etiqueta de manejo especial/).check();
  await dialog.getByRole("button", { name: "Registrar incidente" }).click();

  await expect(
    page.getByText("Incidente registrado con trazabilidad de auditoría."),
  ).toBeVisible();
  const createdCard = page.getByTestId("incident-card-incident-2");
  await expect(createdCard).toContainText("Amenaza al equipo territorial");
  await expect(createdCard).toContainText("Severidad Crítica");
  await expect(createdCard.getByText("Manejo especial")).toBeVisible();
  await expect(
    createdCard.getByTitle(
      "Clasificación operativa; el acceso sigue los permisos generales del rol y la asignación del incidente",
    ),
  ).toBeVisible();

  await createdCard
    .getByRole("combobox", { name: /Estado operativo/ })
    .selectOption("IN_PROGRESS");
  await createdCard.getByRole("button", { name: "Guardar respuesta" }).click();
  await expect(
    page.getByText("PQRS-CAM-2026-BBB222 actualizado y auditado."),
  ).toBeVisible();
  await expect(createdCard).toContainText("Respuesta en curso");

  expect(mutationBodies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: "Amenaza al equipo territorial",
        category: "Seguridad",
        priority: "URGENT",
        assigneeId: "legal-team",
        confidential: true,
      }),
      { status: "IN_PROGRESS" },
    ]),
  );
  expect(
    mutationBodies.every(
      (body) =>
        !("tenantId" in body) && !("tenant_id" in body) && !("mode" in body),
    ),
  ).toBe(true);
  expect(
    requestedCaseUrls.every(
      (url) =>
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("tenant_id") &&
        !url.searchParams.has("mode"),
    ),
  ).toBe(true);
  expect(
    requestedInteractionUrls.every(
      (url) =>
        url.searchParams.get("issueCaseId") === initialIncident.id &&
        url.searchParams.get("limit") === "10" &&
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("tenant_id") &&
        !url.searchParams.has("mode") &&
        !url.searchParams.has("voterId"),
    ),
  ).toBe(true);
  expect(interactionMutationBodies).toEqual([
    {
      issueCaseId: initialIncident.id,
      channel: "PHONE",
      direction: "OUTBOUND",
      summary: "Se informó al contacto sobre la verificación del incidente.",
    },
  ]);
  expect(consentMutationBodies).toEqual([
    {
      issueCaseId: initialIncident.id,
      collectionChannel: "PHONE",
      noticeVersion: renewedConsentNotice.version,
    },
    {
      issueCaseId: initialIncident.id,
      reason: "Solicitud expresa recibida por la persona contactada.",
    },
  ]);
  expect(
    consentMutationBodies.every(
      (body) =>
        !("legalBasis" in body) &&
        !("subjectRef" in body) &&
        !("voterId" in body) &&
        !("grantedAt" in body),
    ),
  ).toBe(true);
  expect(
    requestedConsentUrls.every(
      (url) =>
        url.searchParams.get("issueCaseId") === initialIncident.id &&
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("mode"),
    ),
  ).toBe(true);
  expect(
    interactionMutationBodies.every(
      (body) =>
        !(
          "tenantId" in body ||
          "tenant_id" in body ||
          "mode" in body ||
          "voterId" in body ||
          "externalContactRef" in body ||
          "sentiment" in body
        ),
    ),
  ).toBe(true);
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(7);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});

test("cumplimiento revisa incidentes sin permisos de mutación", async ({
  page,
}) => {
  const requestedPaths: string[] = [];
  let authSessionRequests = 0;

  await installSession(page, complianceSession);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "GET" && url.pathname === "/api/auth/me") {
      authSessionRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentSessionResponse(complianceSession)),
      });
      return;
    }

    requestedPaths.push(`${request.method()} ${url.pathname}`);

    if (request.method() === "GET" && url.pathname === "/api/cases") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(pageOf([initialIncident]))),
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/api/interactions") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful(interactionPage([initialInteraction], 1, 1)),
        ),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === "/api/interactions/consents/status"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(consentStatus("active"))),
      });
      return;
    }

    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Operación no permitida" }),
    });
  });

  await page.goto("/dashboard/incidents");

  await expect(
    page.getByRole("heading", { name: "Incidentes y respuesta de crisis" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Acceso de cumplimiento en modo consulta/),
  ).toBeVisible();
  await expect(page.getByTestId("incident-card-incident-1")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reportar incidente" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guardar respuesta" }),
  ).toHaveCount(0);
  await page
    .getByTestId("incident-card-incident-1")
    .getByRole("button", { name: /Abrir bitácora/ })
    .click();
  const timelineDialog = page.getByRole("dialog", {
    name: "Bitácora del caso",
  });
  await expect(timelineDialog).toContainText(initialInteraction.summary);
  await expect(
    timelineDialog.getByRole("heading", { name: "Registrar gestión" }),
  ).toHaveCount(0);
  await expect(
    timelineDialog.getByRole("button", { name: "Guardar en bitácora" }),
  ).toHaveCount(0);
  await expect(
    timelineDialog.getByRole("button", { name: "Registrar autorización" }),
  ).toHaveCount(0);
  await expect(
    timelineDialog.getByRole("button", { name: "Revocar autorización" }),
  ).toBeVisible();
  expect(requestedPaths.length).toBeGreaterThanOrEqual(1);
  expect(
    requestedPaths.every((path) =>
      [
        "GET /api/cases",
        "GET /api/interactions",
        "GET /api/interactions/consents/status",
      ].includes(path),
    ),
  ).toBe(true);
  expect(requestedPaths).toContain("GET /api/interactions");
  expect(requestedPaths).toContain("GET /api/interactions/consents/status");
  expect(requestedPaths.some((path) => path.startsWith("POST "))).toBe(false);
  expect(authSessionRequests).toBeGreaterThanOrEqual(1);
});

test("no expone incidentes al coordinador zonal sin permiso en la API", async ({
  page,
}) => {
  const requestedPaths: string[] = [];
  let authSessionRequests = 0;

  await installSession(page, zoneCoordinatorSession);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === "/api/auth/me") {
      authSessionRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentSessionResponse(zoneCoordinatorSession)),
      });
      return;
    }

    requestedPaths.push(pathname);
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Operación no permitida" }),
    });
  });

  await page.goto("/dashboard/incidents");

  await expect(
    page.getByRole("heading", { name: "Acceso Restringido" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Incidentes y crisis" }),
  ).toHaveCount(0);
  expect(requestedPaths).toEqual([]);
  expect(authSessionRequests).toBeGreaterThanOrEqual(1);
});
