import { expect, test, type Page, type Route } from "@playwright/test";

type TestRole = "CAMPAIGN_MANAGER" | "COMPLIANCE_OFFICER";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "signature-count-correction-e2e",
].join(".");

function sessionFor(role: TestRole) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-signature-correction-e2e",
      name: "Comité ciudadano verificable",
      slug: "signature-correction-e2e",
      type: "GSC" as const,
      operationStage: "SIGNATURE_COLLECTION" as const,
    },
    user: {
      id: role === "CAMPAIGN_MANAGER" ? "manager-e2e" : "compliance-e2e",
      email: `${role.toLowerCase()}@example.test`,
      name: role === "CAMPAIGN_MANAGER" ? "Gerencia solicitante" : "Cumplimiento independiente",
      role: role === "CAMPAIGN_MANAGER" ? "GerenteOps" : "Auditor",
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

const manager = {
  id: "manager-e2e",
  name: "Gerencia solicitante",
  role: "CAMPAIGN_MANAGER" as const,
  isActive: true,
};
const custodian = {
  id: "custodian-e2e",
  name: "Custodia territorial",
  role: "ZONE_COORDINATOR" as const,
  isActive: true,
};

const quarantinedBatch = {
  id: "batch-correction-e2e",
  code: "LOTE-CORR-01",
  physicalSealReference: "SELLO-001",
  territoryReference: "Zona operativa norte",
  expectedReturnAt: "2026-09-20T18:00:00.000Z",
  status: "QUARANTINED" as const,
  statusBeforeQuarantine: "RETURNED" as const,
  plannedForms: 20,
  issuedForms: 20,
  returnedForms: 18,
  annulledForms: 1,
  missingForms: 1,
  inCustodyForms: 0,
  reportedSupports: 15,
  internalAcceptedSupports: 14,
  internalRejectedSupports: 1,
  possibleDuplicateSupports: 0,
  currentCustodianUserId: custodian.id,
  currentCustodian: custodian,
  version: 4,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-09T12:00:00.000Z",
  custodyEvents: [],
};

const plan = {
  id: "plan-e2e",
  status: "COLLECTING" as const,
  committeeMemberCount: 3 as const,
  committeeEvidenceReference: "https://evidence.example.test/committee.pdf",
  committeeEvidenceSha256: "1".repeat(64),
  committeeRegisteredAt: "2026-08-01T00:00:00.000Z",
  collectionStartsAt: "2026-09-01T00:00:00.000Z",
  collectionClosesAt: "2026-10-01T00:00:00.000Z",
  candidateRegistrationClosesAt: "2026-10-10T00:00:00.000Z",
  requiredThreshold: 1_000,
  internalTarget: 1_500,
  thresholdSourceUrl: "https://authority.example.test/threshold",
  thresholdSourceReference: "Acto verificable de umbral",
  thresholdSourceSha256: "2".repeat(64),
  fileOwnerUserId: manager.id,
  custodyOwnerUserId: custodian.id,
  formHandlingRules:
    "Conservar folios, separar anulados y poner toda diferencia bajo cuarentena documentada.",
  deliveryPlan: "Entrega con conteo, sello y doble verificación.",
  contingencyPlan: "Aislar y documentar el lote antes de cualquier traslado.",
  submissionDueAt: "2026-10-05T00:00:00.000Z",
  version: 1,
  fileOwner: manager,
  custodyOwner: custodian,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

function signatureOverview() {
  return {
    operation: {
      id: "operation-e2e",
      stage: "SIGNATURE_COLLECTION",
      operationType: "SIGNATURE_COMMITTEE",
    },
    readOnly: false,
    plan,
    batches: [quarantinedBatch],
    authorityResults: [],
    operators: [manager, custodian],
    readiness: {
      entryReady: true,
      exitReady: false,
      custodyReconciled: false,
      certifiedValidSupports: null,
      requiredThreshold: plan.requiredThreshold,
      entryBlockers: [],
      exitBlockers: ["SIGNATURE_COUNT_CORRECTION_PENDING"],
    },
    summary: {
      batchCount: 1,
      plannedForms: 20,
      issuedForms: 20,
      returnedForms: 18,
      annulledForms: 1,
      missingForms: 1,
      inCustodyForms: 0,
      reportedSupports: 15,
      internalAcceptedSupports: 14,
      internalRejectedSupports: 1,
      possibleDuplicateSupports: 0,
      overdueBatches: 0,
      quarantinedBatches: 1,
      pendingCountCorrections: 1,
      remainingToTarget: 1_486,
      daysRemaining: 22,
      requiredDailyPace: 68,
    },
    evaluatedAt: "2026-09-09T12:00:00.000Z",
    authorityDisclaimer:
      "Los conteos internos no constituyen un resultado oficial.",
    privacyBoundary:
      "No se almacenan datos individuales de quienes brindan apoyo.",
  };
}

const countRows = [
  ["plannedForms", "Formularios planificados", 20, 20],
  ["issuedForms", "Formularios entregados", 20, 20],
  ["returnedForms", "Formularios devueltos", 18, 19],
  ["annulledForms", "Formularios anulados", 1, 1],
  ["missingForms", "Formularios faltantes", 1, 0],
  ["inCustodyForms", "Formularios en custodia", 0, 0],
  ["reportedSupports", "Apoyos reportados", 15, 15],
  ["internalAcceptedSupports", "Apoyos aceptados internamente", 14, 14],
  ["internalRejectedSupports", "Apoyos rechazados internamente", 1, 1],
  ["possibleDuplicateSupports", "Posibles duplicados", 0, 0],
] as const;

function proposal(decided: boolean) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    batchId: quarantinedBatch.id,
    batchCode: quarantinedBatch.code,
    snapshotBatchVersion: 4,
    snapshotStatus: "QUARANTINED",
    snapshotStatusBeforeQuarantine: "RETURNED",
    requiredReviewControl: "CUSTODY_COUNTS",
    requiredReviewerRole: "COMPLIANCE_OFFICER",
    reason: "Recuento físico respaldado por acta privada confirmada.",
    evidence: {
      id: "stored-e2e",
      contentType: "application/pdf",
      actualSize: 18,
      confirmedAt: "2026-09-09T12:00:00.000Z",
      status: "CONSUMED",
    },
    evidenceSha256: "a".repeat(64),
    requestedBy: manager,
    createdAt: "2026-09-09T12:00:00.000Z",
    differences: countRows.map(([field, label, before, proposed]) => ({
      field,
      label,
      before,
      proposed,
      change: proposed - before,
    })),
    decision: decided
      ? {
          id: "22222222-2222-4222-8222-222222222222",
          decision: "APPROVE",
          reviewReason:
            "La evidencia y las ecuaciones fueron verificadas independientemente.",
          reviewerRole: "COMPLIANCE_OFFICER",
          expectedBatchVersion: 4,
          batchVersionBefore: 4,
          batchVersionAfter: 5,
          createdAt: "2026-09-09T13:00:00.000Z",
          reviewedBy: {
            id: "compliance-e2e",
            name: "Cumplimiento independiente",
            role: "COMPLIANCE_OFFICER",
            isActive: true,
          },
        }
      : null,
    currentBatch: {
      ...quarantinedBatch,
      returnedForms: decided ? 19 : 18,
      missingForms: decided ? 0 : 1,
      version: decided ? 5 : 4,
    },
    snapshotStillCurrent: !decided,
    pending: !decided,
    canReview: !decided,
    batchRemainsQuarantined: true,
  };
}

function correctionOverview(proposals: ReturnType<typeof proposal>[]) {
  const pendingCount = proposals.filter(({ pending }) => pending).length;
  return {
    stage: "SIGNATURE_COLLECTION",
    readOnly: false,
    controls: {
      absoluteValuesOnly: true,
      independentDecisionRequired: true,
      releaseIsSeparate: true,
      batchRemainsQuarantinedAfterApproval: true,
      supporterPersonalDataAccepted: false,
      custodyReviewerRole: "COMPLIANCE_OFFICER",
      supportReviewerRole: "AUDITOR",
    },
    readiness: {
      pendingCount,
      readyForQuarantineRelease: pendingCount === 0,
      blockers: pendingCount ? ["SIGNATURE_COUNT_CORRECTION_PENDING"] : [],
    },
    proposals,
    totalCount: proposals.length,
    isTruncated: false,
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

async function baseRoutes(
  page: Page,
  role: TestRole,
  corrections: () => ReturnType<typeof correctionOverview>,
  mutation: (path: string, body: Record<string, unknown>, route: Route) => Promise<boolean>,
) {
  const session = sessionFor(role);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/api/auth/me") {
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
    if (request.method() === "GET" && path === "/api/signature-collection") {
      await fulfill(route, signatureOverview());
      return;
    }
    if (
      request.method() === "GET" &&
      path === "/api/signature-collection/count-corrections"
    ) {
      await fulfill(route, corrections());
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    if (await mutation(path, body, route)) return;
    await route.fulfill({ status: 404, body: "{}" });
  });
}

test("gerencia propone diez valores absolutos con evidencia directa y sin tenant en el body", async ({
  page,
}) => {
  await installSession(page, "CAMPAIGN_MANAGER");
  let registered = false;
  let proposalBody: Record<string, unknown> | null = null;
  const storagePath =
    "tenant-signature-correction-e2e/signature-collection/33333333-3333-4333-8333-333333333333.pdf";
  await page.route("**/mock-supabase/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await baseRoutes(
    page,
    "CAMPAIGN_MANAGER",
    () => correctionOverview(registered ? [proposal(false)] : []),
    async (path, body, route) => {
      if (path === "/api/storage/upload-url") {
        await fulfill(route, {
          bucket: "private-campaign-files",
          path: storagePath,
          uploadUrl: "http://127.0.0.1:3000/mock-supabase/upload",
          uploadToken: "signed-e2e",
          method: "PUT",
          headers: { "Content-Type": body.contentType },
          metadata: {
            fileName: body.fileName,
            contentType: body.contentType,
            size: body.size,
            contentSha256: body.contentSha256,
          },
        });
        return true;
      }
      if (path === "/api/storage/complete") {
        await fulfill(route, {
          confirmed: true,
          path: storagePath,
          module: "signature-collection",
        });
        return true;
      }
      if (
        path ===
        `/api/signature-collection/batches/${quarantinedBatch.id}/count-corrections`
      ) {
        proposalBody = body;
        registered = true;
        await fulfill(route, {
          resource: proposal(false),
          command: {
            id: "command-proposal-e2e",
            clientRequestId: body.clientRequestId,
            payloadSha256: body.payloadSha256,
            type: "PROPOSE",
            resourceType: "SignatureCountCorrectionProposal",
            resourceId: proposal(false).id,
            createdAt: "2026-09-09T12:00:00.000Z",
          },
          noOp: false,
        });
        return true;
      }
      return false;
    },
  );

  await page.goto("/dashboard/signatures");
  const form = page.getByTestId("signature-count-correction-proposal-form");
  await expect(form).toBeVisible();
  await form.getByLabel("Formularios devueltos").fill("19");
  await form.getByLabel("Formularios faltantes").fill("0");
  await form.getByLabel("Razón verificable").fill(
    "Recuento físico respaldado por acta privada confirmada.",
  );
  await form.getByLabel(/Evidencia privada/).setInputFiles({
    name: "acta-recuento.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("evidencia-integra"),
  });
  await form.getByRole("button", { name: "Registrar propuesta inmutable" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Los conteos siguen intactos",
  );
  expect(proposalBody).not.toBeNull();
  expect(proposalBody).not.toHaveProperty("tenantId");
  expect(proposalBody).toMatchObject({
    expectedVersion: 4,
    evidenceStoragePath: storagePath,
    proposedPlannedForms: 20,
    proposedIssuedForms: 20,
    proposedReturnedForms: 19,
    proposedAnnulledForms: 1,
    proposedMissingForms: 0,
    proposedInCustodyForms: 0,
    proposedReportedSupports: 15,
    proposedInternalAcceptedSupports: 14,
    proposedInternalRejectedSupports: 1,
    proposedPossibleDuplicateSupports: 0,
  });
  expect(proposalBody?.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(proposalBody?.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
});

test("cumplimiento decide con cuatro ojos y la interfaz conserva QUARANTINED", async ({
  page,
}) => {
  await installSession(page, "COMPLIANCE_OFFICER");
  let decided = false;
  let decisionBody: Record<string, unknown> | null = null;
  await baseRoutes(
    page,
    "COMPLIANCE_OFFICER",
    () => correctionOverview([proposal(decided)]),
    async (path, body, route) => {
      if (
        path ===
        `/api/signature-collection/count-corrections/${proposal(false).id}/decision`
      ) {
        decisionBody = body;
        decided = true;
        await fulfill(route, {
          resource: proposal(true),
          command: {
            id: "command-decision-e2e",
            clientRequestId: body.clientRequestId,
            payloadSha256: body.payloadSha256,
            type: "DECIDE",
            resourceType: "SignatureCountCorrectionDecision",
            resourceId: "22222222-2222-4222-8222-222222222222",
            createdAt: "2026-09-09T13:00:00.000Z",
          },
          noOp: false,
        });
        return true;
      }
      return false;
    },
  );

  await page.goto("/dashboard/signatures");
  const form = page.getByTestId(
    `signature-correction-decision-${proposal(false).id}`,
  );
  await expect(form).toBeVisible();
  await form.getByLabel("Decisión terminal").selectOption("APPROVE");
  await form.getByLabel("Motivación independiente").fill(
    "La evidencia y las ecuaciones fueron verificadas independientemente.",
  );
  await form.getByRole("button", { name: "Registrar decisión inmutable" }).click();

  await expect(page.getByRole("status")).toContainText(
    "El lote permanece en cuarentena",
  );
  await expect(page.getByTestId(`signature-correction-${proposal(false).id}`)).toContainText(
    "Versión 4 → 5. Estado actual: QUARANTINED",
  );
  expect(decisionBody).not.toHaveProperty("tenantId");
  expect(decisionBody).toMatchObject({
    expectedVersion: 4,
    decision: "APPROVE",
  });
  expect(decisionBody?.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
});
