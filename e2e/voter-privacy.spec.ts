import { expect, test, type Page } from "@playwright/test";

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
    name: "Campana verificable",
    slug: "campana-verificable",
    type: "CANDIDACY",
  },
  user: {
    id: "admin-e2e",
    email: "admin@example.test",
    name: "Administracion territorial",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};

const existingRawPii = {
  documentId: "1012345678",
  phone: "3105550199",
  email: "dato.expuesto@example.test",
};

const createdRawPii = {
  documentId: "1098765432",
  phone: "3204447788",
  email: "laura.privada@example.test",
};

const firstPageVoter = {
  id: "voter-first-page",
  firstName: "Carlos",
  lastName: "Rojas",
  documentIdMasked: "******5678",
  phoneMasked: "******0199",
  mesa: 8,
  isSignatureValid: true,
  consentAccepted: true,
  consentTimestamp: "2026-08-19T14:00:00.000Z",
  createdAt: "2026-08-19T14:00:00.000Z",
  puesto: { name: "Colegio Central" },
  registrar: { name: "Equipo autorizado" },
  ...existingRawPii,
};

const secondPageVoter = {
  id: "voter-second-page",
  firstName: "Diana",
  lastName: "Torres",
  documentIdMasked: "******2222",
  phoneMasked: "******3333",
  mesa: 14,
  isSignatureValid: true,
  consentAccepted: true,
  consentTimestamp: "2026-08-20T14:00:00.000Z",
  createdAt: "2026-08-20T14:00:00.000Z",
  puesto: { name: "Escuela Norte" },
  registrar: { name: "Equipo autorizado" },
};

const createdVoter = {
  id: "voter-created",
  firstName: "Laura",
  lastName: "Mendez",
  documentIdMasked: "******5432",
  phoneMasked: "******7788",
  mesa: 12,
  isSignatureValid: true,
  consentAccepted: true,
  consentTimestamp: "2026-08-21T15:00:00.000Z",
  createdAt: "2026-08-21T15:00:00.000Z",
  puesto: null,
  registrar: { name: "Administracion territorial" },
  email: createdRawPii.email,
};

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

async function expectRawPiiAbsentFromDom(page: Page, values: string[]) {
  const dom = await page
    .locator("html")
    .evaluate((element) => element.outerHTML);

  for (const value of values) {
    expect(
      dom,
      `El DOM no debe contener el dato personal crudo: ${value}`,
    ).not.toContain(value);
  }
}

test("pagina, minimiza, registra consentimiento y revoca sin identificadores internos", async ({
  page,
}) => {
  const listRequests: URL[] = [];
  const searchRequests: Array<{
    url: URL;
    body: Record<string, unknown>;
  }> = [];
  const detailRequests: string[] = [];
  const mutationRequests: Array<{
    method: string;
    pathname: string;
    body: Record<string, unknown>;
  }> = [];
  const divisionRequests: URL[] = [];
  const authorizationHeaders: string[] = [];
  let voterCreated = false;
  let protectedDetail = {
    id: firstPageVoter.id,
    firstName: firstPageVoter.firstName,
    lastName: firstPageVoter.lastName,
    documentId: existingRawPii.documentId,
    phone: existingRawPii.phone,
    email: existingRawPii.email,
    mesa: firstPageVoter.mesa,
    consentAccepted: true,
    consentTimestamp: firstPageVoter.consentTimestamp,
    termsVersion: "2026.1",
    createdAt: firstPageVoter.createdAt,
    updatedAt: firstPageVoter.createdAt,
    puesto: { id: "puesto-central", name: firstPageVoter.puesto.name },
    registrar: firstPageVoter.registrar,
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

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method();
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (pathname === "/api/voters" && method === "GET") {
      listRequests.push(url);
      const requestedPage = Number(url.searchParams.get("page"));
      const items =
        requestedPage === 2
          ? [secondPageVoter]
          : voterCreated
            ? [createdVoter, firstPageVoter]
            : [firstPageVoter];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items,
            pagination: {
              page: requestedPage,
              limit: 25,
              total: voterCreated ? 27 : 26,
              totalPages: 2,
            },
          }),
        ),
      });
      return;
    }

    if (pathname === "/api/voters/search" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      searchRequests.push({ url, body });
      const requestedPage = Number(body.page);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [firstPageVoter],
            pagination: {
              page: requestedPage,
              limit: Number(body.limit),
              total: 1,
              totalPages: 1,
            },
          }),
        ),
      });
      return;
    }

    if (pathname === "/api/voters" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationRequests.push({ method, pathname, body });
      voterCreated = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful({ id: createdVoter.id }, 201)),
      });
      return;
    }

    if (pathname === "/api/campaigns/divisions" && method === "GET") {
      divisionRequests.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [
              {
                id: "puesto-central",
                code: "P-001",
                name: "Colegio Central",
                type: "PUESTO",
                parentId: "zona-centro",
                parent: null,
              },
              {
                id: "puesto-norte",
                code: "P-002",
                name: "Escuela Norte",
                type: "PUESTO",
                parentId: "zona-norte",
                parent: null,
              },
            ],
            pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
          }),
        ),
      });
      return;
    }

    if (pathname === `/api/voters/${firstPageVoter.id}` && method === "GET") {
      detailRequests.push(`${method} ${pathname}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(protectedDetail)),
      });
      return;
    }

    if (pathname === `/api/voters/${firstPageVoter.id}` && method === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationRequests.push({ method, pathname, body });
      const nextPuesto =
        body.puestoId === "puesto-norte"
          ? { id: "puesto-norte", name: "Escuela Norte" }
          : body.puestoId === null
            ? null
            : protectedDetail.puesto;
      const changedFields = { ...body };
      delete changedFields.puestoId;
      protectedDetail = {
        ...protectedDetail,
        ...changedFields,
        puesto: nextPuesto,
        updatedAt: "2026-08-21T16:30:00.000Z",
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(protectedDetail)),
      });
      return;
    }

    if (
      pathname === `/api/voters/${firstPageVoter.id}/export` &&
      method === "GET"
    ) {
      detailRequests.push(`${method} ${pathname}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "content-disposition": `attachment; filename="registro-${firstPageVoter.id}.json"`,
        },
        body: JSON.stringify(
          successful({
            schemaVersion: "politica-sostenible.voter-export.v1",
            exportedAt: "2026-08-21T17:00:00.000Z",
            voter: {
              id: protectedDetail.id,
              documentId: protectedDetail.documentId,
              firstName: protectedDetail.firstName,
              lastName: protectedDetail.lastName,
              phone: protectedDetail.phone,
              email: protectedDetail.email,
              mesa: protectedDetail.mesa,
              consentAccepted: protectedDetail.consentAccepted,
              consentTimestamp: protectedDetail.consentTimestamp,
              termsVersion: protectedDetail.termsVersion,
              createdAt: protectedDetail.createdAt,
              updatedAt: protectedDetail.updatedAt,
              puesto: protectedDetail.puesto
                ? { name: protectedDetail.puesto.name }
                : null,
            },
          }),
        ),
      });
      return;
    }

    if (
      pathname === "/api/voters/voter-created/consents/revoke" &&
      method === "POST"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationRequests.push({ method, pathname, body });
      createdVoter.consentAccepted = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            voterId: createdVoter.id,
            consentAccepted: false,
            status: "REVOKED",
            revokedAt: "2026-08-21T16:00:00.000Z",
          }),
        ),
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

  await page.goto("/dashboard/votantes");

  await expect(
    page.getByRole("heading", { name: "Relacionamiento territorial" }),
  ).toBeVisible();
  await expect(page.getByText(firstPageVoter.documentIdMasked)).toBeVisible();
  await expect(page.getByText(firstPageVoter.phoneMasked)).toBeVisible();
  await expect(page.getByText("Pagina 1 de 2")).toBeVisible();
  await expectRawPiiAbsentFromDom(page, Object.values(existingRawPii));
  expect(detailRequests).toEqual([]);

  const searchInput = page.getByPlaceholder(
    "Buscar por nombre, documento o celular",
  );
  await searchInput.fill(existingRawPii.documentId);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect.poll(() => searchRequests.length).toBe(1);
  expect(searchRequests[0].url.search).toBe("");
  expect(searchRequests[0].body).toEqual({
    page: 1,
    limit: 25,
    search: existingRawPii.documentId,
  });
  await expect(page.getByText(firstPageVoter.documentIdMasked)).toBeVisible();

  await searchInput.fill("");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect.poll(() => listRequests.length).toBeGreaterThan(1);

  const protectedRow = page.getByRole("row", { name: /Carlos Rojas/ });
  await protectedRow
    .getByRole("button", { name: /Ver datos protegidos/ })
    .click();
  const detailDialog = page.getByRole("dialog", {
    name: "Datos personales autorizados",
  });
  await expect(detailDialog).toContainText(existingRawPii.documentId);
  await expect(detailDialog).toContainText(existingRawPii.phone);
  await expect(detailDialog).toContainText(existingRawPii.email);
  expect(detailRequests).toEqual([`GET /api/voters/${firstPageVoter.id}`]);

  await detailDialog.getByRole("button", { name: "Corregir datos" }).click();
  await detailDialog.getByLabel("Celular").fill("teléfono inválido");
  await detailDialog
    .getByRole("button", { name: "Guardar corrección" })
    .click();
  await expect(detailDialog.getByRole("alert")).toContainText(
    "El teléfono no tiene un formato válido.",
  );
  expect(mutationRequests).toHaveLength(0);

  await detailDialog.getByLabel("Celular").fill("3105550200");
  await detailDialog
    .getByLabel("Correo electrónico")
    .fill("carlos.corregido@example.test");
  await detailDialog
    .getByLabel("Puesto de votación")
    .selectOption("puesto-norte");
  await detailDialog
    .getByRole("button", { name: "Guardar corrección" })
    .click();
  await expect(detailDialog).toContainText(
    "Corrección guardada con trazabilidad de auditoría.",
  );
  await expect(detailDialog).toContainText("3105550200");
  await expect(detailDialog).toContainText("Escuela Norte");

  const downloadPromise = page.waitForEvent("download");
  await detailDialog
    .getByRole("button", { name: "Exportar ficha JSON" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    `registro-personal-${firstPageVoter.id}.json`,
  );
  const downloadStream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of downloadStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
  expect(exported).toEqual(
    expect.objectContaining({
      schemaVersion: "politica-sostenible.voter-export.v1",
      exportedAt: "2026-08-21T17:00:00.000Z",
      voter: expect.objectContaining({
        id: firstPageVoter.id,
        documentId: existingRawPii.documentId,
        phone: "3105550200",
      }),
    }),
  );
  expect(exported).not.toHaveProperty("data");
  expect(exported).not.toHaveProperty("statusCode");
  const exportedVoter = exported.voter as Record<string, unknown>;
  expect(exportedVoter).not.toHaveProperty("registrar");
  expect(exportedVoter.puesto).toEqual({ name: "Escuela Norte" });
  expect(exportedVoter.puesto).not.toHaveProperty("id");
  expect(JSON.stringify(exported)).not.toMatch(
    /tenantId|registrarId|consentIp|signatureImageUrl/,
  );
  await expect(detailDialog).toContainText(
    "Ficha JSON generada para la consulta autorizada.",
  );
  await detailDialog
    .getByRole("button", { name: "Cerrar detalle personal" })
    .click();
  await expectRawPiiAbsentFromDom(page, [
    ...Object.values(existingRawPii),
    "3105550200",
    "carlos.corregido@example.test",
  ]);

  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("Diana Torres")).toBeVisible();
  await expect(page.getByText("Pagina 2 de 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(page.getByText("Carlos Rojas")).toBeVisible();

  await page.getByRole("button", { name: "Nueva vinculacion" }).click();
  const createDialog = page.getByRole("dialog", {
    name: "Nueva vinculacion consentida",
  });
  await createDialog.getByLabel("Nombres").fill(createdVoter.firstName);
  await createDialog.getByLabel("Apellidos").fill(createdVoter.lastName);
  await createDialog.getByLabel("Documento").fill(createdRawPii.documentId);
  await createDialog.getByLabel("Celular").fill(createdRawPii.phone);
  await createDialog.getByLabel("Correo opcional").fill(createdRawPii.email);
  await createDialog
    .getByLabel("Mesa opcional")
    .fill(String(createdVoter.mesa));

  await createDialog
    .getByRole("button", { name: "Guardar con trazabilidad" })
    .click();
  await expect(
    createDialog.getByRole("alert").getByText(/autorizacion explicita/),
  ).toBeVisible();
  expect(mutationRequests).toHaveLength(1);

  await createDialog
    .getByRole("checkbox", { name: /Confirmo que la persona recibio/ })
    .check();
  await createDialog
    .getByRole("button", { name: "Guardar con trazabilidad" })
    .click();

  await expect(
    page.getByText(
      "Solicitud recibida. Fue procesada sin revelar si el documento ya existía.",
    ),
  ).toBeVisible();
  await expect(page.getByText(createdVoter.documentIdMasked)).toBeVisible();
  await expect(page.getByText(createdVoter.phoneMasked)).toBeVisible();
  await expectRawPiiAbsentFromDom(page, Object.values(createdRawPii));

  const createdRow = page.getByRole("row", { name: /Laura Mendez/ });
  await createdRow.getByRole("button", { name: "Revocar" }).click();
  const revokeDialog = page.getByRole("dialog", {
    name: "Revocar consentimiento",
  });
  const revokeButton = revokeDialog.getByRole("button", {
    name: "Confirmar revocacion",
  });
  await revokeDialog
    .getByLabel("Motivo verificado")
    .fill("Solicitud telefonica verificada con la titular");
  await expect(revokeButton).toBeDisabled();
  await revokeDialog
    .getByRole("checkbox", {
      name: /Confirmo que verifique una solicitud expresa/,
    })
    .check();
  await expect(revokeButton).toBeEnabled();
  await revokeButton.click();

  await expect(
    page.getByText(
      "Consentimiento revocado; el historial legal fue conservado.",
    ),
  ).toBeVisible();
  await expect(createdRow).toContainText("Revocado");

  expect(mutationRequests).toEqual([
    {
      method: "PATCH",
      pathname: `/api/voters/${firstPageVoter.id}`,
      body: {
        phone: "3105550200",
        email: "carlos.corregido@example.test",
        puestoId: "puesto-norte",
      },
    },
    {
      method: "POST",
      pathname: "/api/voters",
      body: {
        documentId: createdRawPii.documentId,
        firstName: createdVoter.firstName,
        lastName: createdVoter.lastName,
        consentAccepted: true,
        termsVersion: "2026.1",
        phone: createdRawPii.phone,
        email: createdRawPii.email,
        mesa: createdVoter.mesa,
      },
    },
    {
      method: "POST",
      pathname: "/api/voters/voter-created/consents/revoke",
      body: {
        reason: "Solicitud telefonica verificada con la titular",
      },
    },
  ]);
  expect(
    mutationRequests.every(
      ({ body }) =>
        !("tenantId" in body) &&
        !("tenant_id" in body) &&
        !("registrarId" in body) &&
        !("consentAccepted" in body && !body.consentAccepted),
    ),
  ).toBe(true);
  expect(detailRequests).toEqual([
    `GET /api/voters/${firstPageVoter.id}`,
    `GET /api/voters/${firstPageVoter.id}/export`,
  ]);
  expect(listRequests.some((url) => url.searchParams.get("page") === "1")).toBe(
    true,
  );
  expect(listRequests.some((url) => url.searchParams.get("page") === "2")).toBe(
    true,
  );
  expect(
    listRequests.every(
      (url) =>
        url.searchParams.get("limit") === "25" &&
        !url.searchParams.has("search") &&
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("tenant_id"),
    ),
  ).toBe(true);
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(6);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
  expect(divisionRequests).toHaveLength(1);
  expect(divisionRequests[0].searchParams.get("type")).toBe("PUESTO");
  expect(divisionRequests[0].searchParams.get("page")).toBe("1");
  expect(divisionRequests[0].searchParams.get("limit")).toBe("100");
});

test("cumplimiento abre el detalle protegido sin adquirir permisos de creación", async ({
  page,
}) => {
  const complianceSession = {
    ...session,
    user: {
      ...session.user,
      id: "compliance-e2e",
      email: "cumplimiento@example.test",
      name: "Oficial de cumplimiento",
      backendRole: "COMPLIANCE_OFFICER",
    },
  };
  const requestedPaths: string[] = [];
  let divisionAttempts = 0;

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: complianceSession,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requestedPaths.push(`${request.method()} ${pathname}`);

    if (request.method() === "GET" && pathname === "/api/voters") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [firstPageVoter],
            pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
          }),
        ),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      pathname === `/api/voters/${firstPageVoter.id}`
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            id: firstPageVoter.id,
            firstName: firstPageVoter.firstName,
            lastName: firstPageVoter.lastName,
            ...existingRawPii,
            mesa: firstPageVoter.mesa,
            consentAccepted: true,
            consentTimestamp: firstPageVoter.consentTimestamp,
            termsVersion: "2026.1",
            createdAt: firstPageVoter.createdAt,
            updatedAt: firstPageVoter.createdAt,
            puesto: { id: "puesto-central", name: "Colegio Central" },
            registrar: firstPageVoter.registrar,
          }),
        ),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/campaigns/divisions") {
      divisionAttempts += 1;
      if (divisionAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            statusCode: 503,
            message: "Territorio temporalmente no disponible",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [
              {
                id: "puesto-central",
                code: "P-001",
                name: "Colegio Central",
                type: "PUESTO",
                parentId: "zona-centro",
                parent: null,
              },
            ],
            pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
          }),
        ),
      });
      return;
    }

    await route.fulfill({ status: 403, body: "{}" });
  });

  await page.goto("/dashboard/votantes");
  await expectRawPiiAbsentFromDom(page, Object.values(existingRawPii));
  await expect(
    page.getByRole("button", { name: "Nueva vinculacion" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Ver datos protegidos de Carlos Rojas/ })
    .click();
  const detailDialog = page.getByRole("dialog", {
    name: "Datos personales autorizados",
  });
  await expect(detailDialog).toContainText(existingRawPii.documentId);
  await expect(
    detailDialog.getByRole("button", { name: "Corregir datos" }),
  ).toBeVisible();
  await detailDialog.getByRole("button", { name: "Corregir datos" }).click();
  const puestoSelect = detailDialog.getByLabel("Puesto de votación");
  await expect(detailDialog.getByRole("alert")).toContainText(
    "No fue posible consultar los puestos autorizados",
  );
  await expect(puestoSelect).toBeDisabled();
  await detailDialog
    .getByRole("button", { name: "Reintentar puestos" })
    .click();
  await expect(puestoSelect).toBeEnabled();
  await expect(puestoSelect).toContainText("P-001 · Colegio Central");
  await expect(puestoSelect).toHaveValue("puesto-central");
  expect(divisionAttempts).toBe(2);
  expect(
    new Set(
      requestedPaths.filter((path) => path.startsWith("GET /api/voters")),
    ),
  ).toEqual(
    new Set(["GET /api/voters", `GET /api/voters/${firstPageVoter.id}`]),
  );
});

test("los roles operativos conservan el listado enmascarado sin acceso al detalle", async ({
  page,
}) => {
  const volunteerSession = {
    ...session,
    user: {
      ...session.user,
      id: "volunteer-e2e",
      email: "voluntario@example.test",
      name: "Equipo voluntario",
      backendRole: "ZONE_COORDINATOR",
    },
  };
  const requestedPaths: string[] = [];

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: volunteerSession,
    },
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requestedPaths.push(`${request.method()} ${pathname}`);
    if (request.method() === "GET" && pathname === "/api/voters") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [firstPageVoter],
            pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
          }),
        ),
      });
      return;
    }
    await route.fulfill({ status: 403, body: "{}" });
  });

  await page.goto("/dashboard/votantes");
  await expect(page.getByText(firstPageVoter.documentIdMasked)).toBeVisible();
  await expect(page.getByText(firstPageVoter.phoneMasked)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Ver datos protegidos/ }),
  ).toHaveCount(0);
  await expectRawPiiAbsentFromDom(page, Object.values(existingRawPii));
  expect(requestedPaths).toContain("GET /api/voters");
  expect(
    requestedPaths.every(
      (path) => path === "GET /api/voters" || path === "GET /api/auth/me",
    ),
  ).toBe(true);
});
