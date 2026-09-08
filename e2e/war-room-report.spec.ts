import { expect, test, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

type BackendRole = "ADMIN" | "WITNESS";

function sessionFor(role: BackendRole) {
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-e2e",
      name: "Campaña verificable",
      slug: "campana-verificable",
      type: "CANDIDACY",
    },
    user: {
      id: role === "ADMIN" ? "admin-e2e" : "witness-e2e",
      email: `${role.toLowerCase()}@example.test`,
      name: role === "ADMIN" ? "Dirección electoral" : "Testigo de mesa",
      role: role === "ADMIN" ? "AdminCampana" : "Testigo",
      backendRole: role,
    },
  };
}

const votingPlace = {
  id: "puesto-1",
  code: "11001001",
  name: "Colegio Democracia",
  type: "PUESTO" as const,
  parentId: "zona-1",
  parent: {
    id: "zona-1",
    code: "11001",
    name: "Zona Centro",
    type: "ZONA",
  },
  expectedTables: 20 as number | null,
};

const secondPageVotingPlace = {
  id: "puesto-51",
  code: "11001051",
  name: "Colegio Segunda Página",
  type: "PUESTO" as const,
  parentId: "zona-2",
  parent: {
    id: "zona-2",
    code: "11002",
    name: "Zona Norte",
    type: "ZONA",
  },
  expectedTables: 30 as number | null,
};

type ReportStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";
type CredentialType = "E15" | "E16";
type FormType = "DELEGADOS" | "CLAVEROS" | "TRANSMISION";
type ReclamationGround =
  | "VOTERS_EXCEED_AUTHORIZED"
  | "ARITHMETIC_ERROR"
  | "CANDIDATE_IDENTIFICATION_ERROR"
  | "INSUFFICIENT_JUROR_SIGNATURES"
  | "RECOUNT_REQUEST"
  | "UNAUTHORIZED_POLLING_PLACE"
  | "ELECTION_ON_UNAUTHORIZED_DATE"
  | "BALLOTS_DESTROYED_OR_LOST"
  | "OTHER_STATUTORY_GROUND";

interface MockReport {
  id: string;
  witnessId: string;
  puestoId: string;
  mesa: number;
  credentialType: CredentialType | null;
  credentialReference: string | null;
  checkedInAt: string | null;
  e14FormType: FormType | null;
  candidateVotes: number;
  blankVotes: number | null;
  nullVotes: number | null;
  unmarkedVotes: number | null;
  totalTableVotes: number;
  hasWrittenClaim: boolean | null;
  reclamationGround: ReclamationGround | null;
  reclamationDescription: string | null;
  observations: string | null;
  isSynced: boolean;
  status: ReportStatus;
  reviewerId: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
  puesto: { code: string; name: string; expectedTables: number | null };
  witness: { id: string; name: string };
  reviewer: { id: string; name: string } | null;
  hasEvidence: boolean;
  divergent: boolean;
}

function report(overrides: Partial<MockReport> = {}): MockReport {
  return {
    id: "report-1",
    witnessId: "other-witness",
    puestoId: votingPlace.id,
    mesa: 4,
    credentialType: "E15",
    credentialReference: "E15-BOG-001-0004",
    checkedInAt: "2026-08-21T12:00:00.000Z",
    e14FormType: "DELEGADOS",
    candidateVotes: 120,
    blankVotes: 5,
    nullVotes: 3,
    unmarkedVotes: 2,
    totalTableVotes: 250,
    hasWrittenClaim: false,
    reclamationGround: null,
    reclamationDescription: null,
    observations: "Lectura inicial",
    isSynced: false,
    status: "ACCEPTED",
    reviewerId: "reviewer-1",
    reviewReason: "Acta y cifras verificadas de forma independiente.",
    reviewedAt: "2026-08-21T14:10:00.000Z",
    supersededById: null,
    createdAt: "2026-08-21T14:00:00.000Z",
    updatedAt: "2026-08-21T14:10:00.000Z",
    puesto: {
      code: votingPlace.code,
      name: votingPlace.name,
      expectedTables: votingPlace.expectedTables,
    },
    witness: { id: "other-witness", name: "Testigo inicial" },
    reviewer: { id: "reviewer-1", name: "Revisión electoral" },
    hasEvidence: true,
    divergent: false,
    ...overrides,
  };
}

function reportPage(items: MockReport[], page = 1, totalPages = 1) {
  const accepted = items.filter((item) => item.status === "ACCEPTED");
  return {
    items,
    pagination: {
      page,
      limit: 25,
      total: totalPages > 1 ? 26 : items.length,
      totalPages,
    },
    summary: {
      totalReports: items.length,
      pendingReports: items.filter((item) => item.status === "PENDING").length,
      acceptedReports: accepted.length,
      rejectedReports: items.filter((item) => item.status === "REJECTED")
        .length,
      supersededReports: items.filter((item) => item.status === "SUPERSEDED")
        .length,
      pendingDivergences: items.filter(
        (item) => item.status === "PENDING" && item.divergent,
      ).length,
      acceptedCandidateVotes: accepted.reduce(
        (sum, item) => sum + item.candidateVotes,
        0,
      ),
      acceptedTotalVotes: accepted.reduce(
        (sum, item) => sum + item.totalTableVotes,
        0,
      ),
      coverage: {
        configuredPlaces: 2,
        totalPlaces: 2,
        acceptedTables: accepted.length,
        expectedTables: 50,
        percentage: accepted.length * 2,
      },
    },
  };
}

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

async function storeSession(page: Page, role: BackendRole) {
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor(role),
    },
  );
}

test("un testigo pagina puestos, radica un E-14 privado y no altera métricas aceptadas", async ({
  page,
}) => {
  const apiBodies: Record<string, unknown>[] = [];
  const storageMethods: string[] = [];
  const requestedPlacePages: string[] = [];
  const fileBuffer = Buffer.from("%PDF-1.4 acta e2e verificable");
  const confirmedPath =
    "tenant-e2e/e14/123e4567-e89b-42d3-a456-426614174000.pdf";
  let reports = [report()];

  await storeSession(page, "WITNESS");

  await page.route("**/storage/v1/object/upload/sign/**", async (route) => {
    storageMethods.push(route.request().method());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ Key: `private-files/${confirmedPath}` }),
    });
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === "/api/campaigns/divisions" && method === "GET") {
      expect(url.searchParams.get("type")).toBe("PUESTO");
      expect(url.searchParams.get("limit")).toBe("50");
      const requestedPage = url.searchParams.get("page") ?? "1";
      requestedPlacePages.push(requestedPage);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items:
              requestedPage === "1" ? [votingPlace] : [secondPageVotingPlace],
            pagination: {
              page: Number(requestedPage),
              limit: 50,
              total: 51,
              totalPages: 2,
            },
          }),
        ),
      });
      return;
    }

    if (pathname === "/api/witnesses" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(reportPage(reports))),
      });
      return;
    }

    if (pathname === "/api/storage/upload-url" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      apiBodies.push(body);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              bucket: "private-files",
              path: confirmedPath,
              uploadUrl: `http://127.0.0.1:3000/mock-supabase/storage/v1/object/upload/sign/private-files/${confirmedPath}`,
              uploadToken: "signed-upload-token",
              method: "PUT",
              headers: { "Content-Type": "application/pdf" },
              metadata: {
                fileName: "e14-mesa-12.pdf",
                contentType: "application/pdf",
                size: fileBuffer.length,
              },
            },
            201,
          ),
        ),
      });
      return;
    }

    if (pathname === "/api/storage/complete" && method === "POST") {
      apiBodies.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({ confirmed: true, path: confirmedPath }),
        ),
      });
      return;
    }

    if (pathname === "/api/witnesses" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      apiBodies.push(body);
      const created = report({
        id: "report-2",
        witnessId: "witness-e2e",
        puestoId: String(body.puestoId),
        mesa: Number(body.mesa),
        credentialType: body.credentialType as CredentialType,
        credentialReference: String(body.credentialReference),
        checkedInAt: String(body.checkedInAt),
        e14FormType: body.e14FormType as FormType,
        candidateVotes: Number(body.candidateVotes),
        blankVotes: Number(body.blankVotes),
        nullVotes: Number(body.nullVotes),
        unmarkedVotes: Number(body.unmarkedVotes),
        totalTableVotes: Number(body.totalTableVotes),
        hasWrittenClaim: Boolean(body.hasWrittenClaim),
        reclamationGround:
          (body.reclamationGround as ReclamationGround | undefined) ?? null,
        reclamationDescription:
          body.reclamationDescription === undefined
            ? null
            : String(body.reclamationDescription),
        observations: String(body.observations),
        status: "PENDING",
        reviewerId: null,
        reviewReason: null,
        reviewedAt: null,
        puesto: {
          code: secondPageVotingPlace.code,
          name: secondPageVotingPlace.name,
          expectedTables: secondPageVotingPlace.expectedTables,
        },
        witness: { id: "witness-e2e", name: "Testigo de mesa" },
        reviewer: null,
      });
      reports = [created, ...reports];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(created, 201)),
      });
      return;
    }

    await route.fulfill({
      status: pathname === "/api/auth/me" ? 503 : 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Ruta no simulada: ${method} ${pathname}`,
      }),
    });
  });

  await page.goto("/dashboard/war-room");
  await expect(
    page.getByRole("heading", { name: "Control de reportes E-14" }),
  ).toBeVisible();
  await expect(page.getByTestId("reports-metric")).toHaveText("1");
  await expect(page.getByTestId("candidate-votes-metric")).toHaveText("120");

  await page
    .getByRole("navigation", { name: "Paginación de puestos" })
    .getByRole("button", { name: "Siguiente" })
    .click();
  await expect(
    page.getByTestId(`place-card-${secondPageVotingPlace.id}`),
  ).toContainText(secondPageVotingPlace.name);
  expect(requestedPlacePages).toContain("2");

  await page.getByRole("button", { name: "Registrar E-14" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Registrar reporte de mesa",
  });
  await dialog
    .getByLabel("Puesto de votación")
    .selectOption(secondPageVotingPlace.id);
  await dialog.getByLabel("Tipo de credencial").selectOption("E15");
  await dialog.getByLabel("Referencia de credencial").fill("E15-BOG-001-0012");
  await dialog.getByLabel("Hora de presencia").fill("2026-08-21T07:00");
  await dialog
    .getByLabel("Ejemplar del formulario E-14")
    .selectOption("DELEGADOS");
  await dialog.getByLabel("Número de mesa").fill("12");
  await dialog.getByLabel("Votos del candidato").fill("80");
  await dialog.getByLabel("Votos en blanco").fill("5");
  await dialog.getByLabel("Votos nulos").fill("3");
  await dialog.getByLabel("Votos no marcados").fill("2");
  await dialog.getByLabel("Votos totales de la mesa").fill("85");
  await dialog.getByLabel(/Se presentó reclamación escrita/).check();
  await dialog
    .getByLabel("Causal de reclamación")
    .selectOption("ARITHMETIC_ERROR");
  await dialog
    .getByLabel("Descripción de la reclamación")
    .fill("El total escrito no coincide con la suma visible de los renglones.");
  await dialog.getByLabel(/Observaciones/).fill("Acta revisada por el testigo");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "e14-mesa-12.pdf",
    mimeType: "application/pdf",
    buffer: fileBuffer,
  });
  await dialog.getByRole("button", { name: "Enviar reporte" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "no puede superar el total de la mesa",
  );
  expect(storageMethods).toEqual([]);

  await dialog.getByLabel("Votos totales de la mesa").fill("180");
  await dialog.getByRole("button", { name: "Enviar reporte" }).click();

  await expect(
    page.getByText(/guardado como lectura interna pendiente/i),
  ).toBeVisible();
  await expect(page.getByTestId("report-row-report-2")).toContainText(
    "Mesa 12",
  );
  await expect(page.getByTestId("report-status-report-2")).toHaveText(
    "Pendiente",
  );
  await expect(page.getByTestId("reports-metric")).toHaveText("1");
  await expect(page.getByTestId("candidate-votes-metric")).toHaveText("120");
  await expect(page.getByTestId("total-votes-metric")).toHaveText("250");

  expect(storageMethods).toEqual(["PUT"]);
  expect(apiBodies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        puestoId: secondPageVotingPlace.id,
        mesa: 12,
        credentialType: "E15",
        credentialReference: "E15-BOG-001-0012",
        checkedInAt: expect.stringMatching(/^2026-08-21T/),
        e14FormType: "DELEGADOS",
        candidateVotes: 80,
        blankVotes: 5,
        nullVotes: 3,
        unmarkedVotes: 2,
        totalTableVotes: 180,
        hasWrittenClaim: true,
        reclamationGround: "ARITHMETIC_ERROR",
        reclamationDescription:
          "El total escrito no coincide con la suma visible de los renglones.",
        observations: "Acta revisada por el testigo",
        e14ImageUrl: confirmedPath,
      }),
    ]),
  );
  expect(
    apiBodies.every((body) => !("tenantId" in body) && !("witnessId" in body)),
  ).toBe(true);
});

test("dirección configura cobertura, concilia con cuatro ojos y pagina reportes", async ({
  page,
}) => {
  const pending = report({
    id: "pending-report",
    status: "PENDING",
    reviewerId: null,
    reviewReason: null,
    reviewedAt: null,
    reviewer: null,
    divergent: true,
  });
  const secondPageReport = report({
    id: "second-page-report",
    mesa: 9,
    status: "REJECTED",
    candidateVotes: 70,
    totalTableVotes: 190,
    reviewerId: "admin-e2e",
    reviewReason: "La imagen no permite confirmar la lectura registrada.",
    reviewedAt: "2026-08-21T16:00:00.000Z",
    reviewer: { id: "admin-e2e", name: "Dirección electoral" },
  });
  let firstPageReports = [pending];
  const profileBodies: Record<string, unknown>[] = [];
  const reviewBodies: Record<string, unknown>[] = [];
  const requestedReportPages: string[] = [];

  await storeSession(page, "ADMIN");

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === "/api/campaigns/divisions" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [votingPlace],
            pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
          }),
        ),
      });
      return;
    }

    if (pathname === "/api/witnesses" && method === "GET") {
      const requestedPage = url.searchParams.get("page") ?? "1";
      requestedReportPages.push(requestedPage);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            reportPage(
              requestedPage === "1" ? firstPageReports : [secondPageReport],
              Number(requestedPage),
              2,
            ),
          ),
        ),
      });
      return;
    }

    if (
      pathname === `/api/witnesses/places/${votingPlace.id}/profile` &&
      method === "PUT"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      profileBodies.push(body);
      votingPlace.expectedTables = Number(body.expectedTables);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful({ ...votingPlace })),
      });
      return;
    }

    if (
      pathname === "/api/witnesses/pending-report/review" &&
      method === "PATCH"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      reviewBodies.push(body);
      const accepted = report({
        ...pending,
        status: "ACCEPTED",
        reviewerId: "admin-e2e",
        reviewReason: String(body.reviewReason),
        reviewedAt: "2026-08-21T17:00:00.000Z",
        reviewer: { id: "admin-e2e", name: "Dirección electoral" },
        divergent: false,
      });
      firstPageReports = [accepted];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(accepted)),
      });
      return;
    }

    await route.fulfill({
      status: pathname === "/api/auth/me" ? 503 : 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Ruta no simulada: ${method} ${pathname}`,
      }),
    });
  });

  await page.goto("/dashboard/war-room");
  await expect(page.getByTestId("report-status-pending-report")).toHaveText(
    "Pendiente",
  );
  await expect(page.getByText("Lecturas divergentes")).toBeVisible();

  await page
    .getByRole("button", {
      name: `Configurar mesas esperadas de ${votingPlace.name}`,
    })
    .click();
  const profileDialog = page.getByRole("dialog", {
    name: "Configurar mesas esperadas",
  });
  await profileDialog.getByLabel("Mesas esperadas").fill("24");
  await profileDialog.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(
    page.getByText(/Perfil electoral actualizado: 24/),
  ).toBeVisible();
  expect(profileBodies).toEqual([{ expectedTables: 24 }]);

  await page.getByRole("button", { name: "Revisar" }).click();
  const reviewDialog = page.getByRole("dialog", {
    name: "Revisar reporte E-14",
  });
  await expect(reviewDialog).toContainText(/lectura/i);
  await reviewDialog
    .getByLabel("Decisión de conciliación")
    .selectOption("ACCEPTED");
  await reviewDialog
    .getByLabel("Motivo de la decisión")
    .fill("Acta contrastada visualmente por una persona independiente.");
  await reviewDialog.getByRole("button", { name: "Guardar decisión" }).click();

  await expect(page.getByTestId("report-status-pending-report")).toHaveText(
    "Aceptado",
  );
  await expect(page.getByTestId("report-row-pending-report")).toContainText(
    "Dirección electoral",
  );
  await expect(page.getByTestId("reports-metric")).toHaveText("1");
  await expect(page.getByTestId("candidate-votes-metric")).toHaveText("120");
  expect(reviewBodies).toEqual([
    {
      status: "ACCEPTED",
      reviewReason:
        "Acta contrastada visualmente por una persona independiente.",
    },
  ]);

  await page
    .getByRole("navigation", { name: "Paginación de reportes E-14" })
    .getByRole("button", { name: "Siguiente" })
    .click();
  await expect(page.getByTestId("report-row-second-page-report")).toContainText(
    "Mesa 9",
  );
  expect(requestedReportPages).toContain("2");
});

test("un revisor no recibe acción para su propio reporte pendiente", async ({
  page,
}) => {
  await storeSession(page, "ADMIN");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/campaigns/divisions") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [votingPlace],
            pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
          }),
        ),
      });
      return;
    }
    if (url.pathname === "/api/witnesses") {
      const own = report({
        id: "own-report",
        witnessId: "admin-e2e",
        witness: { id: "admin-e2e", name: "Dirección electoral" },
        status: "PENDING",
        reviewerId: null,
        reviewReason: null,
        reviewedAt: null,
        reviewer: null,
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(reportPage([own]))),
      });
      return;
    }
    await route.fulfill({ status: 503, body: "Unavailable" });
  });

  await page.goto("/dashboard/war-room");
  const row = page.getByTestId("report-row-own-report");
  await expect(row.getByText("Requiere otro revisor")).toBeVisible();
  await expect(row.getByRole("button", { name: "Revisar" })).toHaveCount(0);
});

test("un reporte legado solo puede salir de la cola mediante rechazo motivado", async ({
  page,
}) => {
  await storeSession(page, "ADMIN");
  const reviewBodies: Record<string, unknown>[] = [];
  let legacy = report({
    id: "legacy-report",
    witnessId: "legacy-witness",
    witness: { id: "legacy-witness", name: "Testigo histórico" },
    credentialType: null,
    credentialReference: null,
    checkedInAt: null,
    e14FormType: null,
    blankVotes: null,
    nullVotes: null,
    unmarkedVotes: null,
    hasWrittenClaim: null,
    reclamationGround: null,
    reclamationDescription: null,
    status: "PENDING",
    reviewerId: null,
    reviewReason: null,
    reviewedAt: null,
    reviewer: null,
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/campaigns/divisions") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [votingPlace],
            pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
          }),
        ),
      });
      return;
    }
    if (url.pathname === "/api/witnesses" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(reportPage([legacy]))),
      });
      return;
    }
    if (
      url.pathname === "/api/witnesses/legacy-report/review" &&
      request.method() === "PATCH"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      reviewBodies.push(body);
      legacy = report({
        ...legacy,
        status: "REJECTED",
        reviewerId: "admin-e2e",
        reviewReason: String(body.reviewReason),
        reviewedAt: "2026-08-21T17:00:00.000Z",
        reviewer: { id: "admin-e2e", name: "Dirección electoral" },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(legacy)),
      });
      return;
    }
    await route.fulfill({ status: 503, body: "Unavailable" });
  });

  await page.goto("/dashboard/war-room");
  await page.getByRole("button", { name: "Revisar" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Revisar reporte E-14",
  });
  await expect(dialog).toContainText("el backend no permite aceptarlo");
  const decision = dialog.getByLabel("Decisión de conciliación");
  await expect(decision).toHaveValue("REJECTED");
  await expect(
    decision.locator('option[value="ACCEPTED"]'),
  ).toHaveAttribute("disabled", "");
  await dialog
    .getByLabel("Motivo de la decisión")
    .fill("Rechazado porque el reporte histórico no tiene trazabilidad.");
  await dialog.getByRole("button", { name: "Guardar decisión" }).click();

  await expect(page.getByTestId("report-status-legacy-report")).toHaveText(
    "Rechazado",
  );
  expect(reviewBodies).toEqual([
    {
      status: "REJECTED",
      reviewReason:
        "Rechazado porque el reporte histórico no tiene trazabilidad.",
    },
  ]);
});

test("valida el filtro de mesa antes de la red y permite recuperarse de un rechazo del servidor", async ({
  page,
}) => {
  const witnessRequests: string[] = [];
  await storeSession(page, "ADMIN");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/campaigns/divisions") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [votingPlace],
            pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
          }),
        ),
      });
      return;
    }

    if (url.pathname === "/api/witnesses") {
      witnessRequests.push(url.search);
      if (url.searchParams.get("mesa") === "12") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 400,
            error: "Bad Request",
            message: ["mesa must not be greater than 99999"],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(reportPage([report()]))),
      });
      return;
    }

    await route.fulfill({ status: 503, body: "Unavailable" });
  });

  await page.goto("/dashboard/war-room");
  await expect(page.getByTestId("reports-metric")).toHaveText("1");
  expect(witnessRequests).toHaveLength(1);

  let filters = page.getByRole("form", { name: "Filtrar reportes E-14" });
  const mesaInput = filters.getByLabel("Mesa");
  await expect(mesaInput).toHaveAttribute("max", "99999");
  await mesaInput.fill("100000");
  await filters.getByRole("button", { name: "Filtrar" }).click();

  await expect(filters.getByRole("alert")).toHaveText(
    "La mesa debe ser un número entero entre 1 y 99.999.",
  );
  await expect(mesaInput).toHaveAttribute("aria-invalid", "true");
  expect(witnessRequests).toHaveLength(1);

  await mesaInput.fill("12");
  await expect(filters.getByRole("alert")).toHaveCount(0);
  await filters.getByRole("button", { name: "Filtrar" }).click();

  await expect(
    page.getByText(
      "Los filtros electorales no son válidos. Corrígelos o límpialos para volver a consultar.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("mesa must not be greater than 99999"),
  ).toHaveCount(0);
  filters = page.getByRole("form", { name: "Filtrar reportes E-14" });
  await expect(filters.getByLabel("Mesa")).toHaveValue("12");

  await page.getByRole("button", { name: "Reintentar sin filtros" }).click();
  await expect.poll(() => witnessRequests.length).toBe(3);
  expect(witnessRequests[1]).toContain("mesa=12");
  expect(witnessRequests[2]).not.toContain("mesa=");
  await expect(page.getByTestId("reports-metric")).toHaveText("1");
  await expect(
    page.getByText("No pudimos cargar el control electoral"),
  ).toHaveCount(0);
});
