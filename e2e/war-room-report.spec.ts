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
    id: "witness-e2e",
    email: "testigo@example.test",
    name: "Testigo de mesa",
    role: "Testigo",
    backendRole: "WITNESS",
  },
};

const votingPlace = {
  id: "puesto-1",
  code: "11001001",
  name: "Colegio Democracia",
  type: "PUESTO",
  parentId: "zona-1",
  parent: {
    id: "zona-1",
    code: "11001",
    name: "Zona Centro",
    type: "ZONA",
  },
};

const confirmedPath =
  "tenant-e2e/e14/123e4567-e89b-42d3-a456-426614174000-e14-mesa-12.pdf";

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

test("registra un E-14 privado y sólo muestra métricas reportadas", async ({
  page,
}) => {
  const apiAuthorizationHeaders: string[] = [];
  const apiBodies: Record<string, unknown>[] = [];
  const storageMethods: string[] = [];
  const fileBuffer = Buffer.from("%PDF-1.4 acta e2e verificable");
  let reports = [
    {
      id: "report-1",
      puestoId: votingPlace.id,
      mesa: 4,
      candidateVotes: 120,
      totalTableVotes: 250,
      observations: "Reporte inicial",
      e14ImageUrl: "tenant-e2e/e14/report-1.pdf",
      createdAt: "2026-08-21T14:00:00.000Z",
      puesto: votingPlace,
      witness: { name: "Testigo inicial" },
    },
  ];

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: session,
    },
  );

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
    apiAuthorizationHeaders.push(request.headers().authorization ?? "");

    if (pathname === "/api/campaigns/divisions" && method === "GET") {
      expect(url.searchParams.get("type")).toBe("PUESTO");
      expect(url.searchParams.get("limit")).toBe("100");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [votingPlace],
            pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
          }),
        ),
      });
      return;
    }

    if (pathname === "/api/witnesses" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(reports)),
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
      const body = request.postDataJSON() as Record<string, unknown>;
      apiBodies.push(body);
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
      const created = {
        id: "report-2",
        puestoId: String(body.puestoId),
        mesa: Number(body.mesa),
        candidateVotes: Number(body.candidateVotes),
        totalTableVotes: Number(body.totalTableVotes),
        observations: String(body.observations),
        e14ImageUrl: String(body.e14ImageUrl),
        createdAt: "2026-08-21T15:00:00.000Z",
        puesto: votingPlace,
        witness: { name: "Testigo de mesa" },
      };
      reports = [created, ...reports];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(created, 201)),
      });
      return;
    }

    await route.fulfill({
      status: 404,
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
  await expect(page.getByTestId("total-votes-metric")).toHaveText("250");
  await expect(page.getByText("Cobertura no disponible.")).toBeVisible();
  await expect(page.getByText(/oponente/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Registrar E-14" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Registrar reporte de mesa",
  });
  await dialog.getByLabel("Número de mesa").fill("12");
  await dialog.getByLabel("Votos del candidato").fill("80");
  await dialog.getByLabel("Votos totales de la mesa").fill("180");
  await dialog.getByLabel(/Observaciones/).fill("Acta revisada por el testigo");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "e14-mesa-12.pdf",
    mimeType: "application/pdf",
    buffer: fileBuffer,
  });
  await dialog.getByRole("button", { name: "Enviar reporte" }).click();

  await expect(
    page.getByText("Reporte E-14 registrado con soporte privado confirmado."),
  ).toBeVisible();
  await expect(page.getByTestId("report-row-report-2")).toContainText(
    "Mesa 12",
  );
  await expect(page.getByTestId("reports-metric")).toHaveText("2");
  await expect(page.getByTestId("candidate-votes-metric")).toHaveText("200");
  await expect(page.getByTestId("total-votes-metric")).toHaveText("430");

  expect(storageMethods).toEqual(["PUT"]);
  expect(apiBodies).toEqual(
    expect.arrayContaining([
      {
        module: "e14",
        fileName: "e14-mesa-12.pdf",
        contentType: "application/pdf",
        size: fileBuffer.length,
      },
      {
        module: "e14",
        path: confirmedPath,
        metadata: {
          fileName: "e14-mesa-12.pdf",
          contentType: "application/pdf",
          size: fileBuffer.length,
        },
      },
      {
        puestoId: votingPlace.id,
        mesa: 12,
        candidateVotes: 80,
        totalTableVotes: 180,
        observations: "Acta revisada por el testigo",
        e14ImageUrl: confirmedPath,
      },
    ]),
  );
  expect(
    apiBodies.every((body) => !("tenantId" in body) && !("witnessId" in body)),
  ).toBe(true);
  expect(apiAuthorizationHeaders.length).toBeGreaterThanOrEqual(7);
  expect(
    apiAuthorizationHeaders.every((value) => value === `Bearer ${jwt}`),
  ).toBe(true);
});
