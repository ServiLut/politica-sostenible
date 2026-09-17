import { createHash } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";

type TestRole = "ADMIN" | "AUDITOR";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "retention-signature",
].join(".");

function sessionFor(role: TestRole) {
  const id = role === "ADMIN" ? "admin-retention" : "auditor-retention";
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-retention",
      name: "Campaña Retención",
      slug: "retention",
      type: "CANDIDACY" as const,
      operationStage: "CLOSED" as const,
    },
    user: {
      id,
      email: `${id}@example.test`,
      name: role === "ADMIN" ? "Administración" : "Auditoría",
      role: role === "ADMIN" ? ("AdminCampana" as const) : ("Auditor" as const),
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

function successful(data: unknown) {
  return { statusCode: 200, message: "Success", data };
}

const profile = {
  id: "profile-retention",
  stage: "CLOSED" as const,
  closureType: "CLOSED_NORMAL" as const,
  electionDate: "2026-05-31T00:00:00.000Z",
  retentionPeriodDays: 30,
  retentionDueAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-07-15T12:00:00.000Z",
};

const executionCapability = {
  status: "NOT_IMPLEMENTED" as const,
  canExecute: false as const,
  destructiveActionsAvailable: false as const,
  blockers: [
    {
      code: "VALIDATED_LEGAL_POLICY_REQUIRED",
      message: "Falta una política jurídica validada.",
    },
    {
      code: "BACKUP_RESTORE_DRILL_REQUIRED",
      message: "Falta evidencia vigente de restauración.",
    },
    {
      code: "BULLMQ_EXECUTOR_NOT_IMPLEMENTED",
      message: "No existe un ejecutor BullMQ probado.",
    },
    {
      code: "STORAGE_DISPOSITION_NOT_IMPLEMENTED",
      message: "No existe disposición coordinada de Storage.",
    },
  ],
};

function pendingRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "disposition-1",
    operationProfileId: profile.id,
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    payloadSha256: "a".repeat(64),
    previewSha256: "b".repeat(64),
    profileSnapshotSha256: "c".repeat(64),
    expectedProfileUpdatedAt: profile.updatedAt,
    status: "PENDING" as const,
    scope: "DATA_SUBJECT_RECORDS" as const,
    cutoffAt: "2026-09-09T15:00:00.000Z",
    retentionDueAt: profile.retentionDueAt,
    previewSnapshot: {},
    justification:
      "La finalidad electoral terminó y el corte requiere una decisión formal, independiente y documentada antes de cualquier actuación futura.",
    legalReference: "Política jurídica interna 2026-01",
    evidenceReference: "https://evidence.example.test/retention/1",
    evidenceSha256: "d".repeat(64),
    requestedById: "admin-retention",
    reviewedById: null,
    reviewedAt: null,
    reviewClientRequestId: null,
    reviewPayloadSha256: null,
    rejectionReason: null,
    cancelledById: null,
    cancelledAt: null,
    cancellationClientRequestId: null,
    cancellationPayloadSha256: null,
    cancellationReason: null,
    createdAt: "2026-09-09T15:00:00.000Z",
    updatedAt: "2026-09-09T15:00:00.000Z",
    requestedBy: { id: "admin-retention", role: "ADMIN" },
    reviewedBy: null,
    cancelledBy: null,
    ...overrides,
  };
}

const preview = {
  kind: "RETENTION_GOVERNANCE_PREVIEW" as const,
  evaluatedAt: "2026-09-09T15:00:00.000Z",
  tenantId: "tenant-retention",
  operationProfileId: profile.id,
  profileUpdatedAt: profile.updatedAt,
  stage: "CLOSED" as const,
  closureType: "CLOSED_NORMAL" as const,
  scope: "DATA_SUBJECT_RECORDS" as const,
  cutoffAt: "2026-09-09T15:00:00.000Z",
  electionDate: profile.electionDate,
  retentionPeriodDays: 30,
  retentionDueAt: profile.retentionDueAt,
  counts: {
    voters: 10,
    consentRecords: 12,
    interactions: null,
    storedObjects: null,
    financialEntries: null,
    witnessReports: null,
    auditEvents: null,
    total: 22,
  },
  applicableHolds: [],
  previewSha256: "b".repeat(64),
  canRequest: true,
  governanceBlockers: [],
  executionCapability,
  disclaimer: "Solo conteos; no modifica datos.",
};

async function commonRoutes(
  route: Route,
  role: TestRole,
  requests: ReturnType<typeof pendingRequest>[],
) {
  const call = route.request();
  const path = new URL(call.url()).pathname;
  if (path === "/api/auth/me" && call.method() === "GET") {
    const session = sessionFor(role);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        successful({
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
  if (path === "/api/billing/capabilities" && call.method() === "GET") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        successful({
          plan: { code: "ENTERPRISE", name: "Enterprise" },
          features: { export: true, import: true, mfa: true },
        }),
      ),
    });
    return true;
  }
  if (path === "/api/retention-governance" && call.method() === "GET") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        successful({
          profile,
          requests,
          legalHolds: [],
          executionCapability,
        }),
      ),
    });
    return true;
  }
  if (
    path === "/api/retention-governance/preview" &&
    call.method() === "GET"
  ) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(successful(preview)),
    });
    return true;
  }
  return false;
}

test("ADMIN evalúa y registra una solicitud sin tenant ni capacidad destructiva", async ({
  page,
}) => {
  await installSession(page, "ADMIN");
  const requests: ReturnType<typeof pendingRequest>[] = [];
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/**", async (route) => {
    if (await commonRoutes(route, "ADMIN", requests)) return;
    const call = route.request();
    const path = new URL(call.url()).pathname;
    if (
      path === "/api/retention-governance/dispositions" &&
      call.method() === "POST"
    ) {
      submitted = call.postDataJSON() as Record<string, unknown>;
      requests.push(
        pendingRequest({
          clientRequestId: submitted.clientRequestId,
          payloadSha256: submitted.payloadSha256,
          previewSha256: submitted.expectedPreviewSha256,
          cutoffAt: submitted.cutoffAt,
          justification: submitted.justification,
          legalReference: submitted.legalReference,
          evidenceReference: submitted.evidenceReference,
          evidenceSha256: submitted.evidenceSha256,
        }),
      );
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful({ request: requests[0], created: true, noOp: false }),
        ),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/retention");
  await expect(
    page.getByRole("heading", {
      name: "Gobierno de retención y conservación legal",
    }),
  ).toBeVisible();
  await expect(page.getByText("Ejecución deliberadamente bloqueada")).toBeVisible();

  await page.getByLabel("Fecha y hora de corte").fill("2026-09-09T10:00");
  await page.getByRole("button", { name: "Evaluar corte" }).click();
  await expect(page.getByText("Total contado")).toBeVisible();
  await expect(page.getByText("22", { exact: true })).toBeVisible();

  await page
    .getByLabel("Justificación (mínimo 100 caracteres)")
    .fill(
      "La finalidad electoral terminó y este corte requiere una decisión formal, independiente y documentada antes de cualquier actuación futura.",
    );
  await page
    .getByLabel("Referencia jurídica aplicable")
    .fill("Política jurídica interna 2026-01");
  await page
    .getByLabel("URL HTTPS de evidencia durable")
    .fill("https://evidence.example.test/retention/1");
  await page.getByLabel("SHA-256 de la evidencia").fill("d".repeat(64));
  for (const acknowledgement of await page
    .locator('input[name^="ack-"]')
    .all()) {
    await acknowledgement.check();
  }
  await page
    .getByRole("button", { name: "Registrar solicitud no destructiva" })
    .click();

  await expect(
    page.getByText(/nada fue eliminado ni programado/i),
  ).toBeVisible();
  expect(submitted).not.toBeNull();
  expect(submitted).not.toHaveProperty("tenantId");
  expect(submitted).toMatchObject({
    expectedPreviewSha256: "b".repeat(64),
    expectedProfileUpdatedAt: profile.updatedAt,
    legalPolicyRequiredAcknowledged: true,
    backupRestoreRequiredAcknowledged: true,
    executorUnavailableAcknowledged: true,
  });
  const canonical = JSON.stringify({
    clientRequestId: String(submitted?.clientRequestId).toLowerCase(),
    expectedPreviewSha256: "b".repeat(64),
    expectedProfileUpdatedAt: profile.updatedAt,
    scope: "DATA_SUBJECT_RECORDS",
    cutoffAt: submitted?.cutoffAt,
    justification: submitted?.justification,
    legalReference: submitted?.legalReference,
    evidenceReference: submitted?.evidenceReference,
    evidenceSha256: submitted?.evidenceSha256,
    legalPolicyRequiredAcknowledged: true,
    backupRestoreRequiredAcknowledged: true,
    executorUnavailableAcknowledged: true,
  });
  expect(submitted?.payloadSha256).toBe(
    createHash("sha256").update(canonical).digest("hex"),
  );
});

test("AUDITOR en móvil revisa con cuatro ojos y solo aprueba como no ejecutada", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installSession(page, "AUDITOR");
  let current = pendingRequest();
  const reviews: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    if (await commonRoutes(route, "AUDITOR", [current])) return;
    const call = route.request();
    const path = new URL(call.url()).pathname;
    if (path.endsWith("/disposition-1/review") && call.method() === "POST") {
      const body = call.postDataJSON() as Record<string, unknown>;
      reviews.push(body);
      current = pendingRequest({
        status: "APPROVED_NOT_EXECUTED",
        reviewedById: "auditor-retention",
        reviewedAt: "2026-09-09T16:00:00.000Z",
        reviewClientRequestId: body.clientReviewId,
        reviewPayloadSha256: body.reviewPayloadSha256,
        reviewedBy: { id: "auditor-retention", role: "AUDITOR" },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            request: current,
            reviewed: true,
            approved: true,
            noOp: false,
            executionCapability,
          }),
        ),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });

  await page.goto("/dashboard/retention");
  await page.getByRole("button", { name: "Revisar solicitud" }).click();
  await expect(
    page.getByRole("heading", { name: "Revisión con cuatro ojos" }),
  ).toBeVisible();
  await page
    .getByText(/Reconozco que el estado final será/)
    .locator("input")
    .check();
  await page
    .getByRole("button", { name: "Aprobar como no ejecutada" })
    .click();

  await expect(
    page.getByText(/Aprobación registrada como NO EJECUTADA/),
  ).toBeVisible();
  expect(reviews).toHaveLength(1);
  expect(reviews[0]).not.toHaveProperty("tenantId");
  expect(reviews[0]).toMatchObject({
    decision: "APPROVE",
    approvedNotExecutedAcknowledged: true,
    expectedPayloadSha256: "a".repeat(64),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
