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
    id: "admin-e2e",
    email: "admin@example.test",
    name: "Dirección territorial",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};

const municipality = {
  id: "municipio-11001",
  code: "11001",
  name: "Bogotá, D.C.",
  type: "MUNICIPIO",
  parentId: null,
  parent: null,
};

const pollingPlace = {
  id: "puesto-rnec-1001",
  code: "RNEC_DIVIPOLE:11/001/01/01",
  name: "Colegio Distrital Verificable",
  type: "PUESTO",
  parentId: "zona-rnec-01",
  parent: {
    id: "zona-rnec-01",
    code: "RNEC_DIVIPOLE:11/001/01",
    name: "Zona 01",
    type: "ZONA",
  },
  expectedTables: 12,
  sourceNamespace: "RNEC_DIVIPOLE",
  sourceReleaseId: "release-rnec-2026",
  sourceLocationCode: "1001",
  votingDate: "2026-05-31T00:00:00.000Z",
  timeZone: "America/Bogota",
  address: null,
  commune: "Localidad 1",
  latitude: null,
  longitude: null,
  operationalStatus: {
    code: "OUTSIDE_LOGICAL_VOTING_DATE",
    operationalNow: false,
    votingDate: "2026-05-31",
    evaluatedLocalDate: "2026-09-09",
    timeZone: "America/Bogota",
  },
};

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

test("una zona creada queda visible inmediatamente sin actualización manual", async ({
  page,
}) => {
  let createdZone: Record<string, unknown> | null = null;
  const postBodies: Record<string, unknown>[] = [];
  const heatmapRequests: Array<{
    level: string | null;
    metric: string | null;
    parentId: string | null;
  }> = [];

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: session,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              role: session.user.backendRole,
              tenant: session.tenant,
            },
          }),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/campaigns/territory-heatmap" &&
      request.method() === "GET"
    ) {
      const level = url.searchParams.get("level");
      const parentId = url.searchParams.get("parentId");
      heatmapRequests.push({
        level,
        metric: url.searchParams.get("metric"),
        parentId,
      });
      const drilled = level === "MUNICIPIO" && parentId === "departamento-05";
      const items = drilled
        ? [
            {
              id: "municipio-05001",
              code: "05001",
              name: "Medellín",
              type: "MUNICIPIO",
              parentId: "departamento-05",
              hasChildren: false,
              nextLevel: null,
              value: 50,
              displayValue: "50 %",
              suppressed: false,
              intensity: 50,
              bucket: 3,
              operationalContext: {
                expectedTables: 100,
                acceptedTables: 50,
              },
              geo: {
                latitude: 6.2442,
                longitude: -75.5812,
                basis: "CENTROID",
                locatedPollingPlaces: 80,
                totalPollingPlaces: 100,
              },
            },
          ]
        : [
            {
              id: "departamento-05",
              code: "05",
              name: "Antioquia",
              type: "DEPARTAMENTO",
              parentId: null,
              hasChildren: true,
              nextLevel: "MUNICIPIO",
              value: 65,
              displayValue: "65 %",
              suppressed: false,
              intensity: 65,
              bucket: 4,
              operationalContext: {
                expectedTables: 200,
                acceptedTables: 130,
              },
              geo: {
                latitude: 6.2518,
                longitude: -75.5636,
                basis: "CENTROID",
                locatedPollingPlaces: 180,
                totalPollingPlaces: 200,
              },
            },
          ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            generatedAt: "2026-09-09T12:00:00.000Z",
            level: drilled ? "MUNICIPIO" : "DEPARTAMENTO",
            metric: {
              code: "E14_COVERAGE",
              label: "Cobertura E-14",
              unit: "PERCENT",
            },
            parent: drilled
              ? {
                  id: "departamento-05",
                  code: "05",
                  name: "Antioquia",
                  type: "DEPARTAMENTO",
                }
              : null,
            breadcrumbs: drilled
              ? [
                  {
                    id: "departamento-05",
                    code: "05",
                    name: "Antioquia",
                    type: "DEPARTAMENTO",
                  },
                ]
              : [],
            privacy: {
              minimumReportableCount: null,
              rule: "Solo se presentan agregados operativos autorizados.",
            },
            items,
          }),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/campaigns/divisions" &&
      request.method() === "GET"
    ) {
      const requestedType = url.searchParams.get("type");
      const items =
        requestedType === "MUNICIPIO"
          ? [municipality]
          : requestedType === "PUESTO"
            ? [pollingPlace]
            : requestedType === "ZONA" && createdZone
              ? [createdZone]
              : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items,
            evaluatedAt: "2026-09-09T12:00:00.000Z",
            pagination: {
              page: 1,
              limit: Number(url.searchParams.get("limit") ?? 24),
              total: items.length,
              totalPages: items.length ? 1 : 0,
            },
          }),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/campaigns/divisions" &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      postBodies.push(body);
      createdZone = {
        id: "zona-centro",
        ...body,
        parent: municipality,
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(createdZone, 201)),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Not mocked" });
  });

  await page.goto("/dashboard/territory");
  await expect(
    page.getByRole("heading", { name: "Organización territorial" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mapa de calor operativo" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: /^Antioquia: 65 %;.*abrir siguiente nivel$/,
    })
    .click();
  await expect(
    page.getByRole("img", { name: /^Medellín: 50 %;/ }),
  ).toBeVisible();
  expect(heatmapRequests).toEqual(
    expect.arrayContaining([
      {
        level: "DEPARTAMENTO",
        metric: "E14_COVERAGE",
        parentId: null,
      },
      {
        level: "MUNICIPIO",
        metric: "E14_COVERAGE",
        parentId: "departamento-05",
      },
    ]),
  );

  await page.getByRole("button", { name: "Puestos", exact: true }).click();
  const pollingPlaceCard = page
    .getByRole("article")
    .filter({ hasText: "Colegio Distrital Verificable" });
  await expect(pollingPlaceCard).toBeVisible();
  await expect(pollingPlaceCard).toContainText("Código fuente: 1001");
  await expect(pollingPlaceCard).toContainText("Jornada: 2026-05-31");
  await expect(pollingPlaceCard).toContainText(
    "Zona horaria: America/Bogota",
  );
  await expect(pollingPlaceCard).toContainText(
    "Dirección: Sin dirección publicada",
  );
  await expect(
    page.getByText(/No corresponde al día local 2026-09-09/),
  ).toBeVisible();

  await page.getByLabel("Código", { exact: true }).fill("ZC-01");
  await page.getByLabel("Nombre", { exact: true }).fill("Zona Centro");
  await page
    .getByRole("combobox", { name: "Territorio padre" })
    .selectOption(municipality.id);
  await page.getByRole("button", { name: "Crear", exact: true }).click();

  await expect(
    page.getByText("Zona Centro quedó disponible para asignaciones."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Zona Centro" }),
  ).toBeVisible();
  expect(postBodies).toEqual([
    {
      type: "ZONA",
      code: "ZC-01",
      name: "Zona Centro",
      parentId: municipality.id,
    },
  ]);
});
