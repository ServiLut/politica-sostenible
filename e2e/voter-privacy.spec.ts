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
  const mutationRequests: Array<{
    method: string;
    pathname: string;
    body: Record<string, unknown>;
  }> = [];
  const authorizationHeaders: string[] = [];
  let voterCreated = false;

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
  expect(mutationRequests).toHaveLength(0);

  await createDialog
    .getByRole("checkbox", { name: /Confirmo que la persona recibio/ })
    .check();
  await createDialog
    .getByRole("button", { name: "Guardar con trazabilidad" })
    .click();

  await expect(
    page.getByText("Registro creado con evidencia de consentimiento."),
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
        !("registrarId" in body),
    ),
  ).toBe(true);
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
        !url.searchParams.has("tenantId") &&
        !url.searchParams.has("tenant_id"),
    ),
  ).toBe(true);
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(6);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});
