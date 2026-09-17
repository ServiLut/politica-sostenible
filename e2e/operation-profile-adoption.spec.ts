import { createHash } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "adoption-signature",
].join(".");

type TestRole = "ADMIN" | "COMPLIANCE_OFFICER" | "AUDITOR";

function sessionFor(role: TestRole) {
  const id = role === "ADMIN" ? "admin-adoption" : role === "AUDITOR" ? "auditor-adoption" : "compliance-adoption";
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: { id: "tenant-adoption", name: "Campaña Existente", slug: "existente", type: "CANDIDACY" as const, operationStage: null },
    user: { id, email: `${id}@example.test`, name: id, role: role === "ADMIN" ? "AdminCampana" : "Auditor", backendRole: role },
  };
}

async function installSession(page: Page, role: TestRole) {
  const session = sessionFor(role);
  await page.addInitScript(({ authSession }) => {
    window.sessionStorage.setItem("politica-sostenible.auth-session", JSON.stringify(authSession));
  }, { authSession: session });
  return session;
}

function successful(data: unknown) {
  return { statusCode: 200, message: "Success", data };
}

const readiness = {
  stage: null,
  electionDate: null,
  votingStartDate: null,
  votingEndDate: null,
  votingWindowSourceUrl: null,
  votingWindowReference: null,
  generatedAt: "2026-09-09T15:00:00.000Z",
  overall: "BLOCKED",
  sections: { BEFORE_CAMPAIGN: [], CAMPAIGN: [], ELECTION_DAY: [], POST_ELECTION: [] },
};

const team = [{
  id: "admin-adoption",
  name: "Administración solicitante",
  email: "admin@example.test",
  role: "ADMIN",
  isActive: true,
  divisionId: null,
  division: null,
  createdAt: "2026-01-01T12:00:00.000Z",
}];

function pendingRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "adoption-request-1",
    tenantId: "tenant-adoption",
    clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
    payloadSha256: "a".repeat(64),
    status: "PENDING",
    operationType: "SINGLE_CANDIDACY",
    targetStage: "CAMPAIGN",
    electionType: "MAYORALTY",
    circumscriptionType: "MUNICIPAL",
    circumscriptionName: "Municipio de Medellín",
    circumscriptionCode: "05001",
    listType: null,
    electionDate: "2027-10-31T17:00:00.000Z",
    votingStartDate: "2027-10-31",
    votingEndDate: "2027-10-31",
    votingWindowSourceUrl: null,
    votingWindowReference: null,
    expectedTeamSize: 48,
    candidateCount: 1,
    maxTotalBudget: 500_000_000,
    maxPublicityLimit: 100_000_000,
    dataControllerName: "Campaña Existente",
    responsibleDataUserId: "admin-adoption",
    retentionPeriodDays: 730,
    revocationProcedure: "Solicitar revocación por el canal formal y validar la identidad de la persona.",
    effectiveAt: "2026-08-01T13:00:00.000Z",
    justification: "La operación comenzó antes de implementar la plataforma; el acta externa permite ubicar el inicio y será revisada de manera independiente.",
    evidenceReference: "expediente-2026/acta-inicio.pdf",
    evidenceSha256: "b".repeat(64),
    incompleteHistoryAcknowledged: true,
    expiresAt: "2026-09-12T15:00:00.000Z",
    expiredAt: null,
    requestedById: "admin-adoption",
    reviewedById: null,
    reviewedAt: null,
    reviewClientRequestId: null,
    reviewPayloadSha256: null,
    rejectionReason: null,
    operationProfileId: null,
    createdAt: "2026-09-09T15:00:00.000Z",
    updatedAt: "2026-09-09T15:00:00.000Z",
    requestedBy: { id: "admin-adoption", name: "Administración solicitante", role: "ADMIN" },
    reviewedBy: null,
    responsibleDataUser: { id: "admin-adoption", name: "Administración solicitante", role: "ADMIN" },
    ...overrides,
  };
}

async function commonRoute(route: Route, role: TestRole, adoption: ReturnType<typeof pendingRequest> | null, configured = false) {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (request.method() === "GET" && path === "/api/auth/me") {
    const session = sessionFor(role);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successful({ user: { id: session.user.id, email: session.user.email, name: session.user.name, role, tenant: session.tenant } })) });
    return true;
  }
  if (request.method() === "GET" && path === "/api/operation-profile") {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successful(configured ? { configured: true, profile: { ...pendingRequest(), id: "profile-created", stage: "CAMPAIGN", allowedNextStages: ["CAMPAIGN", "ELECTION_PREPARATION"], budget: { maxTotalBudget: 500_000_000, maxPublicityLimit: 100_000_000 }, derived: { workspace: "DAILY_OPERATION", scale: "MEDIUM", dayDEnabled: false, warRoomEnabled: false, signatureCollectionEnabled: false, candidateListEnabled: false, preferentialVoteEnabled: false, territoryScope: "MUNICIPALITY" } } } : { configured: false, profile: null })) });
    return true;
  }
  if (request.method() === "GET" && path === "/api/operation-profile/readiness") {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successful(readiness)) });
    return true;
  }
  if (request.method() === "GET" && path === "/api/operation-profile/adoption") {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successful({ configured, profile: configured ? { id: "profile-created", stage: "CAMPAIGN" } : null, request: adoption })) });
    return true;
  }
  if (request.method() === "GET" && path === "/api/team/members") {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successful({ items: team, pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })) });
    return true;
  }
  return false;
}

test("administración solicita adopción con todos los datos, hash e idempotencia sin activar etapa", async ({ page }) => {
  await installSession(page, "ADMIN");
  const bodies: Array<Record<string, unknown>> = [];
  let adoption: ReturnType<typeof pendingRequest> | null = null;
  await page.route("**/api/**", async (route) => {
    if (await commonRoute(route, "ADMIN", adoption)) return;
    const request = route.request();
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/operation-profile/adoption") {
      const body = request.postDataJSON() as Record<string, unknown>;
      bodies.push(body);
      adoption = pendingRequest({ clientRequestId: body.clientRequestId, payloadSha256: body.payloadSha256, targetStage: body.targetStage, electionDate: body.electionDate, votingStartDate: body.votingStartDate, votingEndDate: body.votingEndDate, votingWindowSourceUrl: body.votingWindowSourceUrl ?? null, votingWindowReference: body.votingWindowReference ?? null, evidenceSha256: body.evidenceSha256, evidenceReference: body.evidenceReference, justification: body.justification });
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(successful({ request: adoption, created: true, noOp: false })) });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/operation-profile");
  await page.getByRole("button", { name: /Adopción excepcional/ }).click();
  const stageSelect = page.getByLabel("Etapa operativa");
  await expect(stageSelect.getByRole("option", { name: "Exploración" })).toHaveCount(0);
  for (const stage of ["Recolección de firmas", "Campaña", "Preparación electoral", "Simulación", "Jornada electoral", "Poselectoral"]) {
    await expect(stageSelect.getByRole("option", { name: stage })).toHaveCount(1);
  }
  await stageSelect.selectOption("CAMPAIGN");
  await page.getByLabel("Tipo de elección").selectOption("MAYORALTY");
  await page.getByLabel("Fecha electoral").fill("2027-10-31");
  await page.getByLabel("Nombre de la circunscripción").fill("Municipio de Medellín");
  await page.getByLabel("Código de circunscripción (opcional)").fill("05001");
  await page.getByLabel("Tamaño esperado del equipo").fill("48");
  await page.getByLabel("Presupuesto total máximo (COP)").fill("500000000");
  await page.getByLabel("Límite máximo de publicidad (COP)").fill("100000000");
  await page.getByLabel("Responsable del tratamiento").fill("Campaña Existente");
  await page.getByLabel("Persona responsable").selectOption("admin-adoption");
  await page.getByLabel("Conservación de datos (días)").fill("730");
  await page.getByLabel("Procedimiento de revocación, supresión o corrección").fill("Solicitar revocación por el canal formal y validar la identidad de la persona.");
  await page.getByLabel("Inicio real de la etapa").fill("2026-08-01T08:00");
  await page.getByLabel("Referencia externa de evidencia").fill("expediente-2026/acta-inicio.pdf");
  await page.getByLabel("SHA-256 declarado de la evidencia").fill("b".repeat(64));
  await page.getByLabel("Justificación verificable de la adopción").fill("La operación comenzó antes de implementar la plataforma; el acta externa permite ubicar el inicio y será revisada de manera independiente.");
  await page.getByText(/Reconozco expresamente/).click();
  await page.getByLabel(/Escribe ADOPTAR HISTORIA INCOMPLETA/).fill("ADOPTAR HISTORIA INCOMPLETA");
  await page.getByRole("button", { name: "Solicitar revisión independiente" }).click();
  const submitDialog = page.getByRole("alertdialog", {
    name: "Enviar adopción de historia incompleta",
  });
  await expect(submitDialog).toBeVisible();
  await submitDialog
    .getByRole("button", { name: "Enviar solicitud", exact: true })
    .click();

  await expect(page.getByText(/Caduca en 72 horas/)).toBeVisible();
  expect(bodies).toHaveLength(1);
  const body = bodies[0];
  expect(body).not.toHaveProperty("tenantId");
  expect(body.targetStage).toBe("CAMPAIGN");
  expect(body.incompleteHistoryAcknowledged).toBe(true);
  const { payloadSha256, ...withoutHash } = body;
  const canonical = JSON.stringify({
    clientRequestId: String(withoutHash.clientRequestId).toLowerCase(), operationType: withoutHash.operationType, targetStage: withoutHash.targetStage,
    electionType: withoutHash.electionType, circumscriptionType: withoutHash.circumscriptionType, circumscriptionName: withoutHash.circumscriptionName,
    circumscriptionCode: withoutHash.circumscriptionCode ?? null, listType: withoutHash.listType ?? null, electionDate: new Date(String(withoutHash.electionDate)).toISOString(),
    votingStartDate: withoutHash.votingStartDate, votingEndDate: withoutHash.votingEndDate,
    votingWindowSourceUrl: withoutHash.votingWindowSourceUrl ?? null, votingWindowReference: withoutHash.votingWindowReference ?? null,
    expectedTeamSize: withoutHash.expectedTeamSize, candidateCount: withoutHash.candidateCount, maxTotalBudget: String(withoutHash.maxTotalBudget),
    maxPublicityLimit: String(withoutHash.maxPublicityLimit), dataControllerName: withoutHash.dataControllerName,
    responsibleDataUserId: withoutHash.responsibleDataUserId, retentionPeriodDays: withoutHash.retentionPeriodDays,
    revocationProcedure: withoutHash.revocationProcedure, effectiveAt: withoutHash.effectiveAt, justification: withoutHash.justification,
    evidenceReference: withoutHash.evidenceReference, evidenceSha256: withoutHash.evidenceSha256,
    incompleteHistoryAcknowledged: withoutHash.incompleteHistoryAcknowledged,
  });
  expect(payloadSha256).toBe(createHash("sha256").update(canonical).digest("hex"));
  await expect(page.getByRole("button", { name: "Confirmar aprobación independiente" })).toHaveCount(0);
});

for (const decision of ["APPROVE", "REJECT"] as const) {
  test(`cumplimiento ${decision === "APPROVE" ? "aprueba y sincroniza" : "rechaza con razón"} mediante cuatro ojos`, async ({ page }) => {
    const session = await installSession(page, "COMPLIANCE_OFFICER");
    let adoption = pendingRequest();
    let configured = false;
    const reviews: Array<Record<string, unknown>> = [];
    await page.route("**/api/**", async (route) => {
      if (await commonRoute(route, "COMPLIANCE_OFFICER", adoption, configured)) return;
      const request = route.request();
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/review")) {
        const body = request.postDataJSON() as Record<string, unknown>;
        reviews.push(body);
        configured = decision === "APPROVE";
        adoption = pendingRequest({
          status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedById: session.user.id,
          reviewedBy: { id: session.user.id, name: session.user.name, role: "COMPLIANCE_OFFICER" },
          reviewedAt: "2026-09-09T16:00:00.000Z",
          reviewClientRequestId: body.clientReviewId,
          reviewPayloadSha256: body.reviewPayloadSha256,
          rejectionReason: body.rejectionReason ?? null,
          operationProfileId: decision === "APPROVE" ? "profile-created" : null,
        });
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(successful({ request: adoption, reviewed: true, approved: configured, noOp: false, ...(configured ? { profile: { id: "profile-created", tenantId: "tenant-adoption", stage: "CAMPAIGN" } } : {}) })) });
        return;
      }
      await route.fulfill({ status: 404, body: "{}" });
    });

    await page.goto("/dashboard/operation-profile");
    await expect(page.getByText("Administración solicitante", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("a".repeat(64), { exact: true })).toBeVisible();
    if (decision === "REJECT") {
      await page.getByRole("button", { name: "Rechazar solicitud" }).click();
      await page.getByLabel("Razón concreta del rechazo").fill("El acta no permite verificar de forma suficiente la fecha efectiva declarada.");
    }
    await page.getByText(/Comparé fuera del sistema/).click();
    await page.getByLabel(/Escribe (APROBAR|RECHAZAR) ADOPCION/).fill(decision === "APPROVE" ? "APROBAR ADOPCION" : "RECHAZAR ADOPCION");
    await page.getByRole("button", { name: decision === "APPROVE" ? "Confirmar aprobación independiente" : "Confirmar rechazo independiente" }).click();
    const reviewDialog = page.getByRole(
      decision === "APPROVE" ? "alertdialog" : "dialog",
      {
        name:
          decision === "APPROVE"
            ? "Aprobar adopción de etapa"
            : "Rechazar adopción de etapa",
      },
    );
    await expect(reviewDialog).toBeVisible();
    await reviewDialog
      .getByRole("button", {
        name:
          decision === "APPROVE"
            ? "Confirmar aprobación"
            : "Confirmar rechazo",
        exact: true,
      })
      .click();

    await expect(page.getByText(decision === "APPROVE" ? "Adopción aprobada: perfil, etapa y alistamiento se están recargando." : "Solicitud rechazada con razón auditable.")).toBeVisible();
    expect(reviews).toHaveLength(1);
    expect(reviews[0].expectedPayloadSha256).toBe("a".repeat(64));
    expect(reviews[0].decision).toBe(decision);
    expect(reviews[0].reviewPayloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(reviews[0]).not.toHaveProperty("tenantId");
    if (decision === "APPROVE") {
      await expect.poll(() => page.evaluate(() => JSON.parse(window.sessionStorage.getItem("politica-sostenible.auth-session") ?? "{}").tenant?.operationStage)).toBe("CAMPAIGN");
    }
  });
}

test("auditor solicitante no recibe controles para revisar su propia solicitud", async ({ page }) => {
  await installSession(page, "AUDITOR");
  const ownRequest = pendingRequest({ requestedById: "auditor-adoption", requestedBy: { id: "auditor-adoption", name: "Auditor solicitante", role: "AUDITOR" } });
  await page.route("**/api/**", async (route) => {
    if (await commonRoute(route, "AUDITOR", ownRequest)) return;
    await route.fulfill({ status: 403, body: "{}" });
  });
  await page.goto("/dashboard/operation-profile");
  await expect(page.getByText(/No puedes revisar tu propia solicitud/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar aprobación independiente" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar perfil" })).toHaveCount(0);
});
