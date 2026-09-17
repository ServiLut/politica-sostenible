import { expect, test, type Page, type Route } from "@playwright/test";

type TestRole =
  | "ADMIN"
  | "CAMPAIGN_MANAGER"
  | "ZONE_COORDINATOR"
  | "COMPLIANCE_OFFICER"
  | "AUDITOR";
type Stage = "SIGNATURE_COLLECTION" | "CLOSED";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "signature-collection-e2e",
].join(".");

function sessionFor(role: TestRole, stage: Stage) {
  const legacyRole =
    role === "ADMIN"
      ? "AdminCampana"
      : role === "CAMPAIGN_MANAGER"
        ? "GerenteOps"
        : role === "ZONE_COORDINATOR"
          ? "Coordinador"
          : "Auditor";
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-signatures-e2e",
      name: "Comité ciudadano verificable",
      slug: "signatures-e2e",
      type: "CANDIDACY" as const,
      operationStage: stage,
    },
    user: {
      id: `actor-${role}`,
      email: `${role.toLowerCase()}@example.test`,
      name: `Persona ${role}`,
      role: legacyRole,
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

const people = {
  manager: {
    id: "manager-1",
    name: "Responsable expediente",
    role: "CAMPAIGN_MANAGER" as const,
    isActive: true,
  },
  custodian: {
    id: "custodian-1",
    name: "Responsable custodia",
    role: "ZONE_COORDINATOR" as const,
    isActive: true,
  },
  recorder: {
    id: "actor-ADMIN",
    name: "Persona ADMIN",
    role: "ADMIN" as const,
    isActive: true,
  },
};

const plan = {
  id: "plan-1",
  status: "COLLECTING" as const,
  committeeMemberCount: 3 as const,
  committeeEvidenceReference: "https://evidence.example.test/committee.pdf",
  committeeEvidenceSha256: "1".repeat(64),
  committeeRegisteredAt: "2026-08-01T00:00:00.000Z",
  collectionStartsAt: "2026-09-01T00:00:00.000Z",
  collectionClosesAt: "2026-10-01T00:00:00.000Z",
  candidateRegistrationClosesAt: "2026-10-10T00:00:00.000Z",
  requiredThreshold: 1000,
  internalTarget: 1300,
  thresholdSourceUrl: "https://authority.example.test/threshold",
  thresholdSourceReference: "Resolución verificable 2026-01",
  thresholdSourceSha256: "2".repeat(64),
  fileOwnerUserId: people.manager.id,
  custodyOwnerUserId: people.custodian.id,
  formHandlingRules:
    "Conservar folios, separar anulados, registrar diferencias y escalar cualquier intervención mediante cuarentena.",
  deliveryPlan: "Entrega controlada con recibo, conteo y doble verificación.",
  contingencyPlan: "Sellar, aislar y documentar todo incidente antes de continuar.",
  submissionDueAt: "2026-10-05T00:00:00.000Z",
  version: 1,
  fileOwner: people.manager,
  custodyOwner: people.custodian,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

function batch(
  status:
    | "PLANNED"
    | "SUBMITTED_TO_AUTHORITY"
    | "AUTHORITY_RESULT_RECORDED" = "PLANNED",
) {
  const submitted = status !== "PLANNED";
  return {
    id: "batch-1",
    code: "LOTE-001",
    physicalSealReference: "SELLO-OPACO-01",
    territoryReference: "Zona operativa norte",
    expectedReturnAt: "2026-09-20T18:00:00.000Z",
    status,
    statusBeforeQuarantine: null,
    plannedForms: 20,
    issuedForms: submitted ? 20 : 0,
    returnedForms: submitted ? 20 : 0,
    annulledForms: 0,
    missingForms: 0,
    inCustodyForms: 0,
    reportedSupports: submitted ? 1100 : 0,
    internalAcceptedSupports: submitted ? 1040 : 0,
    internalRejectedSupports: submitted ? 50 : 0,
    possibleDuplicateSupports: submitted ? 10 : 0,
    currentCustodianUserId: submitted ? people.custodian.id : null,
    currentCustodian: submitted ? people.custodian : null,
    version: submitted ? 6 : 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-08T12:00:00.000Z",
    custodyEvents: [
      {
        id: "event-1",
        type: "BATCH_PLANNED",
        previousStatus: "PLANNED" as const,
        nextStatus: "PLANNED" as const,
        observation: "Lote físico planificado y folios reservados para custodia.",
        evidenceReference: null,
        evidenceSha256: null,
        createdAt: "2026-09-01T12:00:00.000Z",
        actor: people.manager,
        receiver: null,
      },
    ],
  };
}

const pendingAuthorityResult = {
  id: "result-1",
  authorityName: "Autoridad electoral competente",
  authorityActReference: "Acto certificado 2026-44",
  authorityActIssuedAt: "2026-10-08T00:00:00.000Z",
  evidenceReference: "https://authority.example.test/results/2026-44.pdf",
  evidenceSha256: "3".repeat(64),
  submittedSupports: 1100,
  validSupports: 1020,
  invalidSupports: 80,
  outcome: "THRESHOLD_MET" as const,
  createdAt: "2026-10-08T12:00:00.000Z",
  recordedBy: people.recorder,
  review: null,
};

function overview(
  stage: Stage,
  currentBatch = batch(),
  results: Array<typeof pendingAuthorityResult> = [],
) {
  const certified = results.some((result) => result.review)
    ? results[0]?.validSupports ?? null
    : null;
  return {
    operation: {
      id: "operation-1",
      stage,
      operationType: "SIGNATURE_COMMITTEE",
    },
    readOnly: stage === "CLOSED",
    plan,
    batches: [currentBatch],
    authorityResults: results,
    operators: [people.manager, people.custodian, people.recorder],
    readiness: {
      entryReady: true,
      exitReady: certified !== null,
      custodyReconciled: currentBatch.inCustodyForms === 0,
      certifiedValidSupports: certified,
      requiredThreshold: plan.requiredThreshold,
      entryBlockers: [],
      exitBlockers:
        certified === null
          ? ["Falta una constancia de autoridad aprobada por segunda persona."]
          : [],
    },
    summary: {
      batchCount: 1,
      plannedForms: currentBatch.plannedForms,
      issuedForms: currentBatch.issuedForms,
      returnedForms: currentBatch.returnedForms,
      annulledForms: currentBatch.annulledForms,
      missingForms: currentBatch.missingForms,
      inCustodyForms: currentBatch.inCustodyForms,
      reportedSupports: currentBatch.reportedSupports,
      internalAcceptedSupports: currentBatch.internalAcceptedSupports,
      internalRejectedSupports: currentBatch.internalRejectedSupports,
      possibleDuplicateSupports: currentBatch.possibleDuplicateSupports,
      overdueBatches: 0,
      quarantinedBatches: 0,
      pendingCountCorrections: 0,
      remainingToTarget: 260,
      daysRemaining: 22,
      requiredDailyPace: 12,
    },
    evaluatedAt: "2026-09-09T12:00:00.000Z",
    authorityDisclaimer:
      "Los conteos internos no son apoyos válidos ni un resultado oficial. Sólo la constancia de la autoridad aprobada se presenta como certificada.",
    privacyBoundary:
      "No se almacenan nombres, documentos, direcciones, imágenes ni firmas individuales de apoyantes.",
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
  currentBatch: ReturnType<typeof batch>,
  results: Array<typeof pendingAuthorityResult>,
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
    if (
      request.method() === "GET" &&
      path === "/api/signature-collection"
    ) {
      await fulfill(route, overview(stage, currentBatch, results));
      return;
    }
    if (
      request.method() === "GET" &&
      path === "/api/signature-collection/count-corrections"
    ) {
      await fulfill(route, {
        stage,
        readOnly: stage === "CLOSED",
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
          pendingCount: 0,
          readyForQuarantineRelease: true,
          blockers: [],
        },
        proposals: [],
        totalCount: 0,
        isTruncated: false,
      });
      return;
    }
    if (
      request.method() === "POST" &&
      path.startsWith("/api/signature-collection/")
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      onMutation?.(path, body);
      await fulfill(route, {
        resource: path.endsWith("/review")
          ? pendingAuthorityResult
          : currentBatch,
        command: {
          id: "command-e2e",
          clientRequestId: body.clientRequestId,
          payloadSha256: body.payloadSha256,
          type: path.endsWith("/review")
            ? "AUTHORITY_RESULT_REVIEW"
            : "BATCH_ISSUE",
          resourceType: path.endsWith("/review")
            ? "SignatureAuthorityResult"
            : "SignatureCollectionBatch",
          resourceId: path.endsWith("/review")
            ? pendingAuthorityResult.id
            : currentBatch.id,
          createdAt: "2026-09-09T12:00:00.000Z",
        },
        noOp: false,
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });
}

test("dirección opera custodia sin enviar tenant ni datos de apoyantes", async ({
  page,
}) => {
  await installSession(page, "ADMIN", "SIGNATURE_COLLECTION");
  const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
  const currentBatch = batch();
  await installRoutes(
    page,
    "ADMIN",
    "SIGNATURE_COLLECTION",
    currentBatch,
    [],
    (path, body) => mutations.push({ path, body }),
  );

  await page.goto("/dashboard/signatures");
  await expect(
    page.getByRole("heading", { name: "Recolección de firmas y apoyos" }),
  ).toBeVisible();
  await expect(page.getByText("Apoyos revisados internos")).toBeVisible();
  await expect(page.getByText("Válidos certificados")).toBeVisible();
  await expect(
    page.getByText("No se almacenan nombres, documentos", { exact: false }),
  ).toBeVisible();

  const signaturesNavigation = page.getByRole("link", {
    name: "Firmas y apoyos",
  });
  const navigationDrawerNeeded = !(await signaturesNavigation.isVisible());
  if (navigationDrawerNeeded) {
    await page.getByRole("button", { name: "Abrir más opciones" }).click();
  }
  await expect(signaturesNavigation).toBeVisible();
  if (navigationDrawerNeeded) {
    await signaturesNavigation.click();
    await expect(
      page.getByRole("button", { name: "Cerrar más opciones" }),
    ).toBeHidden();
  }

  await page.getByText("Confirmar entrega a custodia").click();
  const form = page.getByTestId("issue-batch-1");
  await form.getByLabel("Persona receptora").selectOption(people.custodian.id);
  await form
    .getByLabel("Declaración de custodia")
    .fill("Se contaron veinte formularios físicos y se verificó el sello opaco.");
  await form
    .getByLabel("Referencia HTTPS de evidencia")
    .fill("https://evidence.example.test/issues/batch-1");
  await form.getByLabel("SHA-256 de la evidencia").fill("a".repeat(64));
  await form.getByRole("button", { name: "Registrar entrega" }).click();

  await expect(page.getByTestId("signature-mutation-success")).toContainText(
    "confirmado con recibo command-e2e",
  );
  expect(mutations).toHaveLength(1);
  expect(mutations[0].path).toBe(
    "/api/signature-collection/batches/batch-1/issue",
  );
  expect(mutations[0].body).toMatchObject({
    expectedVersion: 1,
    issuedForms: 20,
    receiverUserId: people.custodian.id,
  });
  expect(mutations[0].body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(mutations[0].body).not.toHaveProperty("tenantId");
  expect(mutations[0].body).not.toHaveProperty("supporters");
  expect(mutations[0].body).not.toHaveProperty("documentNumber");
});

test("cumplimiento aplica cuatro ojos a una constancia de autoridad", async ({
  page,
}) => {
  await installSession(page, "COMPLIANCE_OFFICER", "SIGNATURE_COLLECTION");
  const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
  await installRoutes(
    page,
    "COMPLIANCE_OFFICER",
    "SIGNATURE_COLLECTION",
    batch("SUBMITTED_TO_AUTHORITY"),
    [pendingAuthorityResult],
    (path, body) => mutations.push({ path, body }),
  );

  await page.goto("/dashboard/signatures");
  await expect(page.getByText("Pendiente de segunda persona")).toBeVisible();
  await page.getByText("Revisar constancia").click();
  const form = page.getByTestId("authority-review-result-1");
  await form
    .getByLabel("Decisión")
    .selectOption("APPROVE");
  await form
    .getByRole("button", { name: "Registrar revisión inmutable" })
    .click();

  await expect(page.getByTestId("signature-mutation-success")).toContainText(
    "confirmado con recibo command-e2e",
  );
  expect(mutations).toHaveLength(1);
  expect(mutations[0].path).toBe(
    "/api/signature-collection/authority-results/result-1/review",
  );
  expect(mutations[0].body).toMatchObject({ decision: "APPROVE" });
  expect(mutations[0].body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(mutations[0].body).not.toHaveProperty("tenantId");
  expect(people.recorder.id).not.toBe("actor-COMPLIANCE_OFFICER");
});

test("CLOSED conserva trazabilidad y no ofrece ninguna mutación", async ({
  page,
}) => {
  await installSession(page, "AUDITOR", "CLOSED");
  let mutationCount = 0;
  await installRoutes(
    page,
    "AUDITOR",
    "CLOSED",
    batch("AUTHORITY_RESULT_RECORDED"),
    [],
    () => {
      mutationCount += 1;
    },
  );

  await page.goto("/dashboard/signatures");
  await expect(page.getByText("Expediente en solo lectura")).toBeVisible();
  await expect(page.getByText("LOTE-001")).toBeVisible();
  await page.getByText("Ver trazabilidad inmutable", { exact: false }).click();
  await expect(page.getByText("BATCH_PLANNED", { exact: true })).toBeVisible();
  await expect(page.getByText("Planificar lote físico")).toHaveCount(0);
  await expect(page.getByText("Confirmar entrega a custodia")).toHaveCount(0);
  await expect(page.getByText("Revisar constancia")).toHaveCount(0);
  expect(mutationCount).toBe(0);
});
