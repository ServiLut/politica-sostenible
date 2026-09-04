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
    id: "tenant-e2e",
    name: "Campaña verificable",
    slug: "campana-verificable",
    type: "CANDIDACY",
  },
  user: {
    id: "admin-a",
    email: "direccion@example.test",
    name: "Dirección editorial",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};

function envelope<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

test("solicita y decide comunicaciones con cuatro ojos sin publicar", async ({
  page,
}) => {
  const authorizationHeaders: string[] = [];
  const requestedUrls: URL[] = [];
  const caseSearchUrls: URL[] = [];
  const postBodies: Array<Record<string, unknown>> = [];
  const decisionBodies: Array<Record<string, unknown>> = [];
  let approvals = [
    {
      id: "approval-other",
      mode: "CAMPAIGN",
      issueCaseId: null,
      channel: "SOCIAL_MEDIA",
      title: "Balance territorial",
      content: { message: "Resultados verificados de la jornada territorial." },
      contentHash: "a".repeat(64),
      purpose: "Rendición pública de cuentas",
      containsSensitiveData: false,
      status: "PENDING",
      requestedById: "communications-b",
      decidedById: null,
      decisionReason: null,
      decidedAt: null,
      createdAt: "2026-08-21T15:00:00.000Z",
      updatedAt: "2026-08-21T15:00:00.000Z",
      requestedBy: {
        id: "communications-b",
        name: "Equipo de comunicaciones",
        role: "COMMUNICATIONS_MANAGER",
      },
      decidedBy: null,
      issueCase: null,
    },
  ];
  const relatedCase = {
    id: "case-authorized",
    mode: "CAMPAIGN",
    reference: "CASO-2026-018",
    title: "Solicitud sobre encuentro comunitario",
    description: "Solicitud recibida por el equipo territorial.",
    category: "Participación",
    sourceChannel: "WEB",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    voterId: null,
    externalContactRef: null,
    divisionId: null,
    assigneeId: "admin-a",
    createdById: "admin-a",
    confidential: false,
    dueAt: null,
    firstResponseAt: null,
    resolvedAt: null,
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
    assignee: null,
    createdBy: null,
    voter: null,
    division: null,
    _count: { interactions: 1, tasks: 0, commitments: 0 },
  };

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: session,
    },
  );

  await page.route("**/api/cases**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    caseSearchUrls.push(url);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          items: [relatedCase],
          pagination: {
            page: Number(url.searchParams.get("page") ?? 1),
            limit: 6,
            total: 1,
            totalPages: 1,
          },
        }),
      ),
    });
  });

  await page.route("**/api/communications/approvals**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    authorizationHeaders.push(request.headers().authorization ?? "");
    requestedUrls.push(url);

    if (url.pathname === "/api/communications/approvals" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            items: approvals,
            pagination: {
              page: 1,
              limit: 10,
              total: approvals.length,
              totalPages: approvals.length ? 1 : 0,
            },
          }),
        ),
      });
      return;
    }

    if (url.pathname === "/api/communications/approvals" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      postBodies.push(body);
      const created = {
        id: "approval-own",
        mode: "CAMPAIGN",
        issueCaseId:
          typeof body.issueCaseId === "string" ? body.issueCaseId : null,
        channel: body.channel,
        title: body.title,
        content: { message: body.message },
        contentHash: "b".repeat(64),
        purpose: body.purpose,
        containsSensitiveData: body.containsSensitiveData,
        status: "PENDING",
        requestedById: "admin-a",
        decidedById: null,
        decisionReason: null,
        decidedAt: null,
        createdAt: "2026-08-21T16:00:00.000Z",
        updatedAt: "2026-08-21T16:00:00.000Z",
        requestedBy: {
          id: "admin-a",
          name: "Dirección editorial",
          role: "ADMIN",
        },
        decidedBy: null,
        issueCase:
          body.issueCaseId === relatedCase.id
            ? {
                id: relatedCase.id,
                reference: relatedCase.reference,
                status: relatedCase.status,
              }
            : null,
      };
      approvals = [created, ...approvals];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(envelope(created, 201)),
      });
      return;
    }

    if (
      url.pathname ===
        "/api/communications/approvals/approval-other/decision" &&
      method === "PATCH"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      decisionBodies.push(body);
      approvals = approvals.map((approval) =>
        approval.id === "approval-other"
          ? {
              ...approval,
              status: String(body.status),
              decisionReason: String(body.decisionReason),
              decidedById: "admin-a",
              decidedAt: "2026-08-21T16:30:00.000Z",
              decidedBy: {
                id: "admin-a",
                name: "Dirección editorial",
                role: "ADMIN",
              },
            }
          : approval,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope(
            approvals.find((approval) => approval.id === "approval-other"),
          ),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Ruta inesperada: ${method} ${url.pathname}`,
      }),
    });
  });

  await page.goto("/dashboard/communications");

  await expect(
    page.getByRole("heading", { name: "Aprobación de comunicaciones" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Este módulo no envía, programa ni publica/),
  ).toBeVisible();
  await expect(
    page.getByTestId("communication-card-approval-other"),
  ).toContainText("Resultados verificados");

  await page.getByRole("button", { name: "Nueva solicitud" }).click();
  const requestDialog = page.getByRole("dialog", {
    name: "Solicitar revisión",
  });
  await requestDialog.getByLabel("Título").fill("Convocatoria ciudadana");
  await requestDialog
    .getByLabel("Mensaje a revisar")
    .fill("Invitamos a participar en el encuentro público del sábado.");
  await requestDialog.getByLabel("Canal").selectOption("WHATSAPP");
  await expect(requestDialog.getByLabel(/ID interno del caso/i)).toHaveCount(0);
  await requestDialog
    .getByLabel("Buscar caso autorizado")
    .fill("encuentro comunitario");
  await requestDialog.getByRole("button", { name: "Buscar casos" }).click();
  await requestDialog
    .getByRole("radio", {
      name: /CASO-2026-018.*Solicitud sobre encuentro comunitario/,
    })
    .check();
  await expect(
    requestDialog.getByTestId("selected-communication-case"),
  ).toContainText("CASO-2026-018");
  await requestDialog
    .getByLabel("Finalidad legítima")
    .fill("Informar sobre un espacio abierto de participación");
  await requestDialog
    .getByLabel(/El mensaje contiene datos personales sensibles/)
    .check();
  await requestDialog
    .getByRole("button", { name: "Enviar a revisión" })
    .click();

  await expect(
    page.getByText(
      "Solicitud enviada a revisión. No se publicó ningún mensaje.",
    ),
  ).toBeVisible();
  const ownCard = page.getByTestId("communication-card-approval-own");
  await expect(ownCard).toContainText("Convocatoria ciudadana");
  await expect(ownCard).toContainText("Requiere revisión de otra persona");
  await expect(ownCard.getByRole("button", { name: /Aprobar/ })).toHaveCount(0);

  await page
    .getByRole("button", { name: "Aprobar Balance territorial" })
    .click();
  const decisionDialog = page.getByRole("dialog", {
    name: "Aprobar comunicación",
  });
  await decisionDialog
    .getByLabel("Motivo de la decisión")
    .fill("Fuentes, tono y finalidad verificados por revisión independiente.");
  await decisionDialog
    .getByRole("button", { name: "Confirmar decisión" })
    .click();

  await expect(
    page.getByText(
      "Comunicación aprobada. La plataforma no la publicó ni la envió.",
    ),
  ).toBeVisible();
  const reviewedCard = page.getByTestId("communication-card-approval-other");
  await expect(reviewedCard).toContainText("Aprobada");
  await expect(reviewedCard).toContainText(
    "Fuentes, tono y finalidad verificados por revisión independiente.",
  );

  expect(postBodies).toEqual([
    {
      title: "Convocatoria ciudadana",
      message: "Invitamos a participar en el encuentro público del sábado.",
      channel: "WHATSAPP",
      purpose: "Informar sobre un espacio abierto de participación",
      containsSensitiveData: true,
      issueCaseId: "case-authorized",
    },
  ]);
  expect(
    Object.keys(postBodies[0]).some((key) =>
      ["tenantId", "tenant_id", "mode", "contentHash", "status"].includes(key),
    ),
  ).toBe(false);
  expect(decisionBodies).toEqual([
    {
      status: "APPROVED",
      decisionReason:
        "Fuentes, tono y finalidad verificados por revisión independiente.",
    },
  ]);
  expect(
    requestedUrls.every(
      (url) =>
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("tenant_id") &&
        !url.searchParams.has("mode"),
    ),
  ).toBe(true);
  expect(
    caseSearchUrls.some(
      (url) => url.searchParams.get("search") === "encuentro comunitario",
    ),
  ).toBe(true);
  expect(
    caseSearchUrls.every(
      (url) =>
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("tenant_id") &&
        !url.searchParams.has("mode"),
    ),
  ).toBe(true);
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(5);
  expect(
    authorizationHeaders.every((header) => header === `Bearer ${jwt}`),
  ).toBe(true);
});
