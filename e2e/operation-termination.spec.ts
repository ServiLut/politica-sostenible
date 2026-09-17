import { createHash } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "termination-signature",
].join(".");

type TestRole = "ADMIN" | "COMPLIANCE_OFFICER" | "AUDITOR";

function sessionFor(role: TestRole) {
  const id =
    role === "ADMIN"
      ? "admin-termination"
      : role === "AUDITOR"
        ? "auditor-termination"
        : "compliance-termination";
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-termination",
      name: "Campaña Sintética",
      slug: "termination",
      type: "CANDIDACY" as const,
      operationStage: "CAMPAIGN" as const,
    },
    user: {
      id,
      email: `${id}@example.test`,
      name: id,
      role: role === "ADMIN" ? "AdminCampana" : "Auditor",
      backendRole: role,
    },
  };
}

async function installSession(page: Page, role: TestRole) {
  const session = sessionFor(role);
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

function success(data: unknown) {
  return { statusCode: 200, message: "Success", data };
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-termination",
    tenantId: "tenant-termination",
    operationType: "SINGLE_CANDIDACY",
    stage: "CAMPAIGN",
    allowedNextStages: ["CAMPAIGN", "ELECTION_PREPARATION"],
    electionType: "MAYORALTY",
    circumscriptionType: "MUNICIPAL",
    circumscriptionName: "Municipio sintético",
    circumscriptionCode: "05001",
    listType: null,
    electionDate: "2026-10-25T05:00:00.000Z",
    votingStartDate: "2026-10-25",
    votingEndDate: "2026-10-25",
    votingWindowSourceUrl: null,
    votingWindowReference: null,
    expectedTeamSize: 20,
    candidateCount: 1,
    dataControllerName: "Campaña Sintética",
    responsibleDataUserId: "admin-termination",
    retentionPeriodDays: 730,
    revocationProcedure:
      "Solicitud formal al canal de privacidad y validación de identidad.",
    closureType: null,
    terminatedAt: null,
    terminationCause: null,
    terminationRequestId: null,
    responsibleDataUser: {
      id: "admin-termination",
      name: "Administración solicitante",
      role: "ADMIN",
    },
    budget: { maxTotalBudget: 500_000_000, maxPublicityLimit: 100_000_000 },
    derived: {
      workspace: "DAILY_OPERATION",
      scale: "MEDIUM",
      dayDEnabled: false,
      warRoomEnabled: false,
      signatureCollectionEnabled: false,
      candidateListEnabled: false,
      preferentialVoteEnabled: false,
      territoryScope: "MUNICIPALITY",
    },
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-09-09T14:00:00.000Z",
    ...overrides,
  };
}

function pendingRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "termination-request-1",
    tenantId: "tenant-termination",
    operationProfileId: "profile-termination",
    clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    payloadSha256: "a".repeat(64),
    profileSnapshotSha256: "b".repeat(64),
    operationCycleSha256: "c".repeat(64),
    expectedProfileUpdatedAt: "2026-09-09T14:00:00.000Z",
    status: "PENDING",
    cause: "REGISTRATION_REVOKED",
    otherCause: null,
    effectiveAt: "2026-09-09T12:00:00.000Z",
    explanation:
      "La autoridad electoral competente revocó la inscripción mediante acto definitivo y verificable, por lo cual la operación no puede continuar sin falsear la etapa real.",
    authorityName: "Consejo Nacional Electoral",
    officialActType: "Resolución",
    officialActReference: "CNE-2026-991",
    officialActIssuedAt: "2026-09-09T11:00:00.000Z",
    evidenceReference: "https://www.cne.gov.co/actos/CNE-2026-991.pdf",
    evidenceSha256: "d".repeat(64),
    consequencesAcknowledged: true,
    expiresAt: "2026-09-12T15:00:00.000Z",
    expiredAt: null,
    requestedById: "admin-termination",
    reviewedById: null,
    reviewedAt: null,
    reviewClientRequestId: null,
    reviewPayloadSha256: null,
    rejectionReason: null,
    communicationsCancelledCount: null,
    cancelledById: null,
    cancelledAt: null,
    cancellationClientRequestId: null,
    cancellationPayloadSha256: null,
    cancellationReason: null,
    createdAt: "2026-09-09T15:00:00.000Z",
    updatedAt: "2026-09-09T15:00:00.000Z",
    requestedBy: {
      id: "admin-termination",
      name: "Administración solicitante",
      role: "ADMIN",
    },
    reviewedBy: null,
    cancelledBy: null,
    ...overrides,
  };
}

const readiness = {
  stage: "CAMPAIGN",
  electionDate: "2026-10-25T05:00:00.000Z",
  votingStartDate: "2026-10-25",
  votingEndDate: "2026-10-25",
  votingWindowSourceUrl: null,
  votingWindowReference: null,
  generatedAt: "2026-09-09T15:00:00.000Z",
  overall: "ATTENTION",
  closure: null,
  sections: {
    BEFORE_CAMPAIGN: [],
    CAMPAIGN: [],
    ELECTION_DAY: [],
    POST_ELECTION: [],
  },
};

function approvedDossier() {
  return {
    kind: "EXCEPTIONAL_TERMINATION_SURVIVING_DUTIES",
    generatedAt: "2026-09-09T15:30:00.000Z",
    complianceCertified: false,
    authorityFilingCertified: false,
    communicationsCancelledOnApproval: 2,
    obligations: [
      {
        code: "SURVIVING_FINANCE",
        category: "FINANCE",
        status: "ACTION_REQUIRED",
        count: 3,
        label: "Finanzas, libros y reportes",
        detail: "Tres movimientos siguen pendientes; no hay certificación.",
        href: "/dashboard/finance",
      },
      {
        code: "SURVIVING_DATA_RIGHTS",
        category: "DATA_RIGHTS",
        status: "PRESERVE",
        count: 1,
        label: "Retención y derechos de titulares",
        detail: "El canal de derechos debe continuar.",
        href: "/dashboard/settings",
      },
    ],
    disclaimer: "No acredita cumplimiento ni radicación ante autoridad.",
  };
}

async function commonRoute(
  route: Route,
  role: TestRole,
  request: ReturnType<typeof pendingRequest> | null,
  currentProfile = profile(),
) {
  const call = route.request();
  const path = new URL(call.url()).pathname;
  if (call.method() === "GET" && path === "/api/auth/me") {
    const session = sessionFor(role);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        success({
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            role,
            tenant: session.tenant,
          },
        }),
      ),
    });
    return true;
  }
  if (call.method() === "GET" && path === "/api/operation-profile") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        success({ configured: true, profile: currentProfile }),
      ),
    });
    return true;
  }
  if (call.method() === "GET" && path === "/api/operation-profile/readiness") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(success(readiness)),
    });
    return true;
  }
  if (call.method() === "GET" && path === "/api/operation-profile/adoption") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        success({
          configured: true,
          profile: { id: currentProfile.id, stage: currentProfile.stage },
          request: null,
        }),
      ),
    });
    return true;
  }
  if (
    call.method() === "GET" &&
    path === "/api/operation-profile/termination"
  ) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        success({
          profile: {
            id: currentProfile.id,
            stage: currentProfile.stage,
            updatedAt: currentProfile.updatedAt,
            votingStartDate: currentProfile.votingStartDate,
            votingEndDate: currentProfile.votingEndDate,
            votingWindowSourceUrl: currentProfile.votingWindowSourceUrl,
            votingWindowReference: currentProfile.votingWindowReference,
            closureType: currentProfile.closureType,
            terminatedAt: currentProfile.terminatedAt,
            terminationCause: currentProfile.terminationCause,
          },
          request,
          dossier: request?.status === "APPROVED" ? approvedDossier() : null,
        }),
      ),
    });
    return true;
  }
  if (call.method() === "GET" && path === "/api/team/members") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        success({
          items: [
            {
              id: "admin-termination",
              name: "Administración solicitante",
              email: "admin@example.test",
              role: "ADMIN",
              isActive: true,
              divisionId: null,
              division: null,
              createdAt: "2026-01-01T12:00:00.000Z",
            },
          ],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
        }),
      ),
    });
    return true;
  }
  return false;
}

test("ADMIN solicita cierre sin cambiar etapa y envía hash exacto sin tenant", async ({
  page,
}) => {
  await installSession(page, "ADMIN");
  let current: ReturnType<typeof pendingRequest> | null = null;
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/**", async (route) => {
    if (await commonRoute(route, "ADMIN", current)) return;
    const call = route.request();
    if (
      call.method() === "POST" &&
      new URL(call.url()).pathname === "/api/operation-profile/termination"
    ) {
      sent = call.postDataJSON() as Record<string, unknown>;
      current = pendingRequest({
        clientRequestId: sent.clientRequestId,
        payloadSha256: sent.payloadSha256,
        cause: sent.cause,
        effectiveAt: sent.effectiveAt,
        explanation: sent.explanation,
        authorityName: sent.authorityName,
        officialActType: sent.officialActType,
        officialActReference: sent.officialActReference,
        officialActIssuedAt: sent.officialActIssuedAt,
        evidenceReference: sent.evidenceReference,
        evidenceSha256: sent.evidenceSha256,
      });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            request: current,
            dossier: null,
            created: true,
            noOp: false,
          }),
        ),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/operation-profile");
  await expect(
    page.getByRole("heading", {
      name: "Terminación excepcional de la operación",
    }),
  ).toBeVisible();
  await page.getByLabel("Causal formal").selectOption("REGISTRATION_REVOKED");
  await page.getByLabel("Fecha y hora efectiva").fill("2026-09-09T07:00");
  await page
    .getByLabel("Autoridad u órgano competente")
    .fill("Consejo Nacional Electoral");
  await page.getByLabel("Tipo de acto o decisión").fill("Resolución");
  await page.getByLabel("Número o referencia verificable").fill("CNE-2026-991");
  await page.getByLabel("Expedición del acto").fill("2026-09-09T06:00");
  await page
    .getByLabel("Explicación extensa y verificable")
    .fill(
      "La autoridad electoral competente revocó formalmente la inscripción mediante un acto definitivo verificable y la campaña no puede continuar sin falsear la etapa real del ciclo.",
    );
  await page
    .getByLabel("Referencia HTTPS durable de evidencia")
    .fill("https://www.cne.gov.co/actos/CNE-2026-991.pdf");
  await page.getByLabel("SHA-256 de la evidencia").fill("d".repeat(64));
  await page.getByText(/Declaro que el cierre no borra datos/).click();
  await page
    .getByLabel("Escribe SOLICITAR CIERRE EXCEPCIONAL")
    .fill("SOLICITAR CIERRE EXCEPCIONAL");
  await page
    .getByRole("button", { name: "Solicitar revisión de cierre excepcional" })
    .click();
  const requestDialog = page.getByRole("dialog", {
    name: "Enviar solicitud de cierre excepcional",
  });
  await expect(requestDialog).toBeVisible();
  await requestDialog
    .getByRole("button", { name: "Enviar solicitud", exact: true })
    .click();

  await expect(
    page.getByText(/La etapa no cambió y requiere revisión independiente/),
  ).toBeVisible();
  expect(sent).not.toBeNull();
  expect(sent).not.toHaveProperty("tenantId");
  expect(sent?.expectedProfileUpdatedAt).toBe("2026-09-09T14:00:00.000Z");
  const { payloadSha256, ...withoutHash } = sent ?? {};
  const canonical = JSON.stringify({
    clientRequestId: String(withoutHash.clientRequestId).toLowerCase(),
    expectedProfileUpdatedAt: withoutHash.expectedProfileUpdatedAt,
    cause: withoutHash.cause,
    otherCause: null,
    effectiveAt: withoutHash.effectiveAt,
    explanation: withoutHash.explanation,
    authorityName: withoutHash.authorityName,
    officialActType: withoutHash.officialActType,
    officialActReference: withoutHash.officialActReference,
    officialActIssuedAt: withoutHash.officialActIssuedAt,
    evidenceReference: withoutHash.evidenceReference,
    evidenceSha256: withoutHash.evidenceSha256,
    consequencesAcknowledged: true,
  });
  expect(payloadSha256).toBe(
    createHash("sha256").update(canonical).digest("hex"),
  );
});

test("AUDITOR en móvil aprueba con cuatro ojos y ve obligaciones sin falso cumplimiento", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await installSession(page, "AUDITOR");
  let currentRequest = pendingRequest();
  let currentProfile = profile();
  const reviews: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async (route) => {
    if (await commonRoute(route, "AUDITOR", currentRequest, currentProfile))
      return;
    const call = route.request();
    if (
      call.method() === "POST" &&
      new URL(call.url()).pathname.endsWith("/review")
    ) {
      const body = call.postDataJSON() as Record<string, unknown>;
      reviews.push(body);
      currentProfile = profile({
        stage: "CLOSED",
        allowedNextStages: ["CLOSED"],
        closureType: "CLOSED_EXCEPTIONAL",
        terminatedAt: currentRequest.effectiveAt,
        terminationCause: currentRequest.cause,
        terminationRequestId: currentRequest.id,
        updatedAt: "2026-09-09T15:30:00.000Z",
      });
      currentRequest = pendingRequest({
        status: "APPROVED",
        reviewedById: session.user.id,
        reviewedBy: {
          id: session.user.id,
          name: session.user.name,
          role: "AUDITOR",
        },
        reviewedAt: "2026-09-09T15:30:00.000Z",
        reviewClientRequestId: body.clientReviewId,
        reviewPayloadSha256: body.reviewPayloadSha256,
        communicationsCancelledCount: 2,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            request: currentRequest,
            profile: {
              id: currentProfile.id,
              stage: "CLOSED",
              updatedAt: currentProfile.updatedAt,
              votingStartDate: currentProfile.votingStartDate,
              votingEndDate: currentProfile.votingEndDate,
              votingWindowSourceUrl: currentProfile.votingWindowSourceUrl,
              votingWindowReference: currentProfile.votingWindowReference,
              closureType: "CLOSED_EXCEPTIONAL",
              terminatedAt: currentProfile.terminatedAt,
              terminationCause: currentProfile.terminationCause,
            },
            dossier: approvedDossier(),
            reviewed: true,
            approved: true,
            noOp: false,
          }),
        ),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/operation-profile");
  await page.getByText(/Verifiqué independientemente/).click();
  await page
    .getByLabel("Escribe APROBAR CIERRE EXCEPCIONAL")
    .fill("APROBAR CIERRE EXCEPCIONAL");
  await page
    .getByRole("button", { name: "Confirmar decisión independiente" })
    .click();
  const reviewDialog = page.getByRole("alertdialog", {
    name: "Cerrar la operación",
  });
  await expect(reviewDialog).toBeVisible();
  await reviewDialog
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "Expediente de obligaciones supervivientes",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("No acredita cumplimiento ni radicación ante autoridad."),
  ).toBeVisible();
  await expect(page.getByText("Finanzas, libros y reportes")).toBeVisible();
  expect(reviews).toHaveLength(1);
  expect(reviews[0]).not.toHaveProperty("tenantId");
  expect(reviews[0]?.expectedPayloadSha256).toBe("a".repeat(64));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            sessionStorage.getItem("politica-sostenible.auth-session") ?? "{}",
          ).tenant?.operationStage,
      ),
    )
    .toBe("CLOSED");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("la misma persona no recibe controles de revisión", async ({ page }) => {
  const session = await installSession(page, "AUDITOR");
  const own = pendingRequest({
    requestedById: session.user.id,
    requestedBy: {
      id: session.user.id,
      name: session.user.name,
      role: "AUDITOR",
    },
  });
  await page.route("**/api/**", async (route) => {
    if (await commonRoute(route, "AUDITOR", own)) return;
    await route.fulfill({ status: 403, body: "{}" });
  });
  await page.goto("/dashboard/operation-profile");
  await expect(
    page.getByText(/No puedes revisar tu propia solicitud/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar decisión independiente" }),
  ).toHaveCount(0);
});

test("ADMIN cancela solamente su solicitud pendiente con recibo idempotente", async ({
  page,
}) => {
  await installSession(page, "ADMIN");
  let current = pendingRequest();
  let cancellation: Record<string, unknown> | null = null;
  await page.route("**/api/**", async (route) => {
    if (await commonRoute(route, "ADMIN", current)) return;
    const call = route.request();
    if (
      call.method() === "POST" &&
      new URL(call.url()).pathname.endsWith(
        "/operation-profile/termination/termination-request-1/cancel",
      )
    ) {
      cancellation = call.postDataJSON() as Record<string, unknown>;
      current = pendingRequest({
        status: "CANCELLED",
        cancelledById: "admin-termination",
        cancelledBy: {
          id: "admin-termination",
          name: "Administración solicitante",
          role: "ADMIN",
        },
        cancelledAt: "2026-09-09T16:00:00.000Z",
        cancellationClientRequestId: cancellation.clientCancellationId,
        cancellationPayloadSha256: cancellation.cancellationPayloadSha256,
        cancellationReason: cancellation.reason,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          success({
            request: current,
            dossier: null,
            cancelled: true,
            noOp: false,
          }),
        ),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/operation-profile");
  await page
    .getByLabel("Razón de cancelación")
    .fill("El acto fue sustituido y requiere un expediente actualizado.");
  await page
    .getByLabel("Escribe CANCELAR SOLICITUD")
    .fill("CANCELAR SOLICITUD");
  await page
    .getByRole("button", { name: "Cancelar solicitud pendiente" })
    .click();
  const cancellationDialog = page.getByRole("alertdialog", {
    name: "Cancelar solicitud pendiente",
  });
  await expect(cancellationDialog).toBeVisible();
  await cancellationDialog
    .getByRole("button", { name: "Cancelar solicitud", exact: true })
    .click();

  await expect(
    page.getByText("Solicitud cancelada. La etapa operativa no cambió."),
  ).toBeVisible();
  await expect(
    page.locator('span[role="status"]').filter({ hasText: "Cancelada" }),
  ).toBeVisible();
  expect(cancellation).not.toBeNull();
  expect(cancellation).not.toHaveProperty("tenantId");
  const canonical = JSON.stringify({
    requestId: "termination-request-1",
    clientCancellationId: String(
      cancellation?.clientCancellationId,
    ).toLowerCase(),
    expectedPayloadSha256: "a".repeat(64),
    reason: "El acto fue sustituido y requiere un expediente actualizado.",
  });
  expect(cancellation?.cancellationPayloadSha256).toBe(
    createHash("sha256").update(canonical).digest("hex"),
  );
  await expect(
    page.getByRole("button", {
      name: "Crear una nueva solicitud con evidencia actualizada",
    }),
  ).toBeVisible();
});
