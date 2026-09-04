import { expect, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

function sessionFor(
  backendRole: "ADMIN" | "VOLUNTEER",
  role: "AdminCampana" | "Voluntario",
) {
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
      id: `user-${backendRole.toLowerCase()}`,
      email: `${backendRole.toLowerCase()}@example.test`,
      name: backendRole === "ADMIN" ? "Dirección de equipo" : "Voluntaria",
      role,
      backendRole,
    },
  };
}

function successful<T>(data: T, statusCode = 200) {
  return { statusCode, message: "Success", data };
}

test("administración invita y copia un enlace secreto sin enviar tenantId", async ({
  context,
  page,
}) => {
  const authorizationHeaders: string[] = [];
  const invitationBodies: Record<string, unknown>[] = [];
  const token = "s".repeat(43);
  let pendingInvitations: Array<Record<string, unknown>> = [];

  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3000",
  });
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("ADMIN", "AdminCampana"),
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (url.pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: "user-admin",
              email: "admin@example.test",
              name: "Direccion de equipo",
              role: "ADMIN",
              tenant: {
                id: "tenant-e2e",
                name: "Campana verificable",
                slug: "campana-verificable",
                type: "CANDIDACY",
              },
            },
          }),
        ),
      });
      return;
    }

    if (url.pathname === "/api/team/members") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [
              {
                id: "admin-e2e",
                name: "Dirección de equipo",
                email: "admin@example.test",
                role: "ADMIN",
                isActive: true,
                createdAt: "2026-08-21T12:00:00.000Z",
              },
            ],
            pagination: {
              page: 1,
              limit: 100,
              total: 1,
              totalPages: 1,
            },
          }),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/team/invitations" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: pendingInvitations,
            pagination: {
              page: 1,
              limit: 100,
              total: pendingInvitations.length,
              totalPages: pendingInvitations.length ? 1 : 0,
            },
          }),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/team/invitations" &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      invitationBodies.push(body);
      const invitation = {
        id: "invitation-e2e",
        email: body.email,
        role: body.role,
        expiresAt: "2026-08-24T12:00:00.000Z",
        createdAt: "2026-08-21T12:00:00.000Z",
      };
      pendingInvitations = [
        {
          ...invitation,
          invitedBy: { id: "admin-e2e", name: "Dirección de equipo" },
        },
      ];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              invitation,
              invitationUrl: `https://politica.example.test/aceptar-invitacion#token=${token}`,
              delivery: "MANUAL",
            },
            201,
          ),
        ),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Ruta no simulada" });
  });

  await page.goto("/dashboard/team");
  await expect(
    page.getByRole("heading", { name: "Equipo y accesos" }),
  ).toBeVisible();
  const moreNavigation = page.getByRole("button", {
    name: /Abrir .* opciones/i,
  });
  if (await moreNavigation.isVisible()) {
    await moreNavigation.click();
  }
  await expect(
    page.getByRole("link", { name: "Equipo y accesos" }),
  ).toBeVisible();
  if (await moreNavigation.isVisible()) {
    await page.getByRole("button", { name: /Cerrar men/i }).click();
  }
  await expect(
    page.locator("main").getByText("Dirección de equipo").first(),
  ).toBeVisible();

  await page.getByLabel("Correo electrónico").fill("persona@example.test");
  await page.getByLabel("Rol operativo").selectOption("VOLUNTEER");
  await page.getByRole("button", { name: "Crear invitación" }).click();

  await expect(page.getByLabel("Enlace secreto de invitación")).toHaveValue(
    `https://politica.example.test/aceptar-invitacion#token=${token}`,
  );
  expect(invitationBodies).toEqual([
    { email: "persona@example.test", role: "VOLUNTEER" },
  ]);
  expect(invitationBodies[0]).not.toHaveProperty("tenantId");

  await page.getByRole("button", { name: "Copiar enlace" }).click();
  await expect(
    page.getByRole("button", { name: "Enlace copiado" }),
  ).toBeVisible();
  await expect(page.getByText("persona@example.test").last()).toBeVisible();
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(5);
  expect(
    authorizationHeaders.every((header) => header === `Bearer ${jwt}`),
  ).toBe(true);
});

test("la persona invitada activa su cuenta con términos versionados", async ({
  page,
}) => {
  const token = "a".repeat(43);
  let acceptanceBody: Record<string, unknown> | null = null;

  await page.route("**/api/auth/invitations/accept", async (route) => {
    acceptanceBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(
        successful(
          { message: "Invitacion aceptada. Ya puedes iniciar sesion." },
          201,
        ),
      ),
    });
  });

  await page.goto(`/aceptar-invitacion#token=${token}`);
  await expect(
    page.getByRole("heading", { name: "Activa tu acceso" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/aceptar-invitacion$/);

  await page.getByLabel("Nombre completo").fill("Ana Pérez");
  await page.getByLabel("Número de documento").fill("1012345678");
  await page.getByLabel("Teléfono (opcional)").fill("+573001234567");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("clave-segura-2026");
  await page.getByLabel("Confirmar contraseña").fill("clave-segura-2026");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Activar acceso" }).click();

  await expect(
    page.getByRole("heading", { name: "Acceso activado" }),
  ).toBeVisible();
  expect(acceptanceBody).toEqual({
    token,
    password: "clave-segura-2026",
    name: "Ana Pérez",
    documentId: "1012345678",
    phone: "+573001234567",
    termsAccepted: true,
    termsVersion: "2026.1",
  });
  expect(acceptanceBody).not.toHaveProperty("email");
  expect(acceptanceBody).not.toHaveProperty("tenantId");
  expect(acceptanceBody).not.toHaveProperty("role");
});

test("administracion cambia rol y desactiva una cuenta sin poder tocarse a si misma", async ({
  context,
  page,
}) => {
  const patchBodies: Array<{
    path: string;
    body: Record<string, unknown>;
  }> = [];
  const accessResetRequests: Array<{
    path: string;
    body: string | null;
  }> = [];
  const temporaryPassword = "Temporal-Acceso-2026!";
  const temporaryPasswordExpiresAt = "2026-09-03T18:30:00.000Z";
  const members = [
    {
      id: "user-admin",
      name: "Administracion principal",
      email: "admin@example.test",
      role: "ADMIN",
      isActive: true,
      createdAt: "2026-08-21T12:00:00.000Z",
    },
    {
      id: "member-north",
      name: "Coordinacion Norte",
      email: "norte@example.test",
      role: "VOLUNTEER",
      isActive: true,
      createdAt: "2026-08-21T12:30:00.000Z",
    },
    {
      id: "member-admin-secondary",
      name: "Administracion secundaria",
      email: "admin2@example.test",
      role: "ADMIN",
      isActive: true,
      createdAt: "2026-08-21T12:45:00.000Z",
    },
  ];

  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3000",
  });

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("ADMIN", "AdminCampana"),
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: "user-admin",
              email: "admin@example.test",
              name: "Administracion principal",
              role: "ADMIN",
              tenant: {
                id: "tenant-e2e",
                name: "Campana verificable",
                slug: "campana-verificable",
                type: "CANDIDACY",
              },
            },
          }),
        ),
      });
      return;
    }

    if (path === "/api/team/members" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: members,
            pagination: {
              page: 1,
              limit: 100,
              total: members.length,
              totalPages: 1,
            },
          }),
        ),
      });
      return;
    }

    if (path === "/api/team/invitations" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [],
            pagination: {
              page: 1,
              limit: 100,
              total: 0,
              totalPages: 0,
            },
          }),
        ),
      });
      return;
    }

    if (
      path === "/api/team/members/member-north/role" &&
      request.method() === "PATCH"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      patchBodies.push({ path, body });
      members[1].role = String(body.role);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            id: members[1].id,
            role: members[1].role,
            isActive: members[1].isActive,
          }),
        ),
      });
      return;
    }

    if (
      path === "/api/team/members/member-north/status" &&
      request.method() === "PATCH"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      patchBodies.push({ path, body });
      members[1].isActive = Boolean(body.isActive);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            id: members[1].id,
            role: members[1].role,
            isActive: members[1].isActive,
          }),
        ),
      });
      return;
    }

    if (
      path === "/api/team/members/member-north/access-reset" &&
      request.method() === "POST"
    ) {
      accessResetRequests.push({ path, body: request.postData() });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            {
              memberId: "member-north",
              temporaryPassword,
              temporaryPasswordExpiresAt,
            },
            201,
          ),
        ),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Ruta no simulada" });
  });

  await page.goto("/dashboard/team");
  await expect(
    page.locator("main").getByText("Administracion principal").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Cuenta administradora protegida", { exact: false }),
  ).toHaveCount(2);
  await expect(page.getByLabel("Rol de Administracion principal")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", {
      name: "Restablecer acceso de Administracion principal",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Restablecer acceso de Administracion secundaria",
    }),
  ).toHaveCount(0);

  await page
    .getByRole("button", {
      name: "Restablecer acceso de Coordinacion Norte",
    })
    .click();
  const resetDialog = page.getByRole("dialog");
  await expect(
    resetDialog.getByRole("heading", {
      name: "Restablecer acceso de Coordinacion Norte",
    }),
  ).toBeVisible();
  await expect(resetDialog).toContainText(
    "Confirma primero la identidad de la persona",
  );
  await expect(resetDialog).toHaveCSS("overflow-y", "auto");
  await expect(
    resetDialog.getByRole("button", { name: "Confirmar restablecimiento" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    resetDialog.getByRole("button", { name: "Cancelar" }),
  ).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(resetDialog).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("");

  await page
    .getByRole("button", {
      name: "Restablecer acceso de Coordinacion Norte",
    })
    .click();
  await resetDialog
    .getByRole("button", { name: "Confirmar restablecimiento" })
    .click();
  const temporaryPasswordField = resetDialog.getByLabel(
    "Nueva contraseña generada",
  );
  await expect(temporaryPasswordField).toHaveValue(temporaryPassword);
  await expect(resetDialog).toContainText("hora de Colombia");
  await expect(resetDialog).toContainText(
    "solo podrá abrir Mi perfil hasta crear su contraseña personal",
  );
  expect(accessResetRequests).toEqual([
    {
      path: "/api/team/members/member-north/access-reset",
      body: null,
    },
  ]);
  await resetDialog
    .getByRole("button", { name: "Copiar contraseña" })
    .click();
  await expect(
    resetDialog.getByRole("button", { name: "Contraseña copiada" }),
  ).toBeVisible();
  await resetDialog
    .getByRole("button", { name: "Ya la entregué; cerrar" })
    .click();
  await expect(temporaryPasswordField).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("");
  const htmlAfterClosingReset = await page
    .locator("html")
    .evaluate((element) => element.outerHTML);
  expect(htmlAfterClosingReset).not.toContain(temporaryPassword);

  await page
    .getByLabel("Rol de Coordinacion Norte")
    .selectOption("CAMPAIGN_MANAGER");
  await expect(page.getByLabel("Rol de Coordinacion Norte")).toHaveValue(
    "CAMPAIGN_MANAGER",
  );
  await page
    .getByRole("button", { name: "Desactivar a Coordinacion Norte" })
    .click();
  await expect(page.getByText("Cuenta desactivada")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reactivar a Coordinacion Norte" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Restablecer acceso de Coordinacion Norte",
    }),
  ).toHaveCount(0);

  expect(patchBodies).toEqual([
    {
      path: "/api/team/members/member-north/role",
      body: { role: "CAMPAIGN_MANAGER" },
    },
    {
      path: "/api/team/members/member-north/status",
      body: { isActive: false },
    },
  ]);
  for (const request of patchBodies) {
    expect(request.body).not.toHaveProperty("tenantId");
    expect(request.body).not.toHaveProperty("actorUserId");
  }
});

test("asigna un puesto disponible en una pagina territorial posterior", async ({
  page,
}) => {
  const divisionRequests: string[] = [];
  let assignmentBody: Record<string, unknown> | null = null;
  const targetMember = {
    id: "witness-territory",
    name: "Testigo territorial",
    email: "testigo.territorial@example.test",
    role: "WITNESS",
    isActive: true,
    divisionId: null,
    division: null,
    createdAt: "2026-09-02T12:00:00.000Z",
  };

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("ADMIN", "AdminCampana"),
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
              id: "user-admin",
              email: "admin@example.test",
              name: "Administracion principal",
              role: "ADMIN",
              tenant: {
                id: "tenant-e2e",
                name: "Campana verificable",
                slug: "campana-verificable",
                type: "CANDIDACY",
              },
            },
          }),
        ),
      });
      return;
    }

    if (url.pathname === "/api/team/members" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [targetMember],
            pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
          }),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/team/invitations" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [],
            pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
          }),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/campaigns/divisions" &&
      request.method() === "GET"
    ) {
      const requestedPage = Number(url.searchParams.get("page"));
      divisionRequests.push(
        `${url.searchParams.get("type")}:${requestedPage}:${url.searchParams.get("limit")}`,
      );
      const division =
        requestedPage === 1
          ? {
              id: "puesto-page-one",
              code: "P-001",
              name: "Puesto primera pagina",
              type: "PUESTO",
            }
          : {
              id: "puesto-page-two",
              code: "P-101",
              name: "Puesto segunda pagina",
              type: "PUESTO",
            };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items: [division],
            pagination: {
              page: requestedPage,
              limit: 100,
              total: 2,
              totalPages: 2,
            },
          }),
        ),
      });
      return;
    }

    if (
      url.pathname === "/api/team/members/witness-territory/division" &&
      request.method() === "PATCH"
    ) {
      assignmentBody = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            id: targetMember.id,
            role: targetMember.role,
            isActive: true,
            divisionId: "puesto-page-two",
            division: {
              id: "puesto-page-two",
              code: "P-101",
              name: "Puesto segunda pagina",
              type: "PUESTO",
            },
          }),
        ),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Ruta no simulada" });
  });

  await page.goto("/dashboard/team");
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  const divisionDialog = page.getByRole("dialog", {
    name: "Asignar a Testigo territorial",
  });
  const divisionSelect = divisionDialog.getByLabel(
    "División compatible con Testigo electoral",
  );
  await expect(divisionSelect).toContainText("Puesto segunda pagina");
  expect(new Set(divisionRequests)).toEqual(
    new Set(["PUESTO:1:100", "PUESTO:2:100"]),
  );
  await divisionSelect.selectOption("puesto-page-two");
  await divisionDialog.getByRole("button", { name: "Guardar alcance" }).click();
  await expect(divisionDialog).toHaveCount(0);
  await expect(
    page.getByText("Puesto segunda pagina · PUESTO", { exact: true }),
  ).toBeVisible();
  expect(assignmentBody).toEqual({ divisionId: "puesto-page-two" });
});

test("equipo e invitaciones recorren todas las paginas autorizadas", async ({
  page,
}) => {
  const requestedPages: string[] = [];

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("ADMIN", "AdminCampana"),
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
              id: "user-admin",
              email: "admin@example.test",
              name: "Administracion principal",
              role: "ADMIN",
              tenant: {
                id: "tenant-e2e",
                name: "Campana verificable",
                slug: "campana-verificable",
                type: "CANDIDACY",
              },
            },
          }),
        ),
      });
      return;
    }

    if (
      request.method() === "GET" &&
      (url.pathname === "/api/team/members" ||
        url.pathname === "/api/team/invitations")
    ) {
      const pageNumber = Number(url.searchParams.get("page"));
      requestedPages.push(
        `${url.pathname}:${pageNumber}:${url.searchParams.get("limit")}`,
      );
      const isMembers = url.pathname === "/api/team/members";
      const items = isMembers
        ? pageNumber === 1
          ? [
              {
                id: "user-admin",
                name: "Administracion principal",
                email: "admin@example.test",
                role: "ADMIN",
                isActive: true,
                divisionId: null,
                division: null,
                createdAt: "2026-08-21T12:00:00.000Z",
              },
            ]
          : [
              {
                id: "member-page-two",
                name: "Coordinacion segunda pagina",
                email: "segunda@example.test",
                role: "VOLUNTEER",
                isActive: true,
                divisionId: null,
                division: null,
                createdAt: "2026-08-21T12:30:00.000Z",
              },
            ]
        : pageNumber === 1
          ? [
              {
                id: "invitation-page-one",
                email: "primera-invitacion@example.test",
                role: "VOLUNTEER",
                expiresAt: "2026-09-10T12:00:00.000Z",
                createdAt: "2026-09-02T12:00:00.000Z",
                invitedBy: { id: "user-admin", name: "Administracion principal" },
              },
            ]
          : [
              {
                id: "invitation-page-two",
                email: "segunda-invitacion@example.test",
                role: "WITNESS",
                expiresAt: "2026-09-10T12:00:00.000Z",
                createdAt: "2026-09-02T12:05:00.000Z",
                invitedBy: { id: "user-admin", name: "Administracion principal" },
              },
            ];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            items,
            pagination: {
              page: pageNumber,
              limit: 100,
              total: 2,
              totalPages: 2,
            },
          }),
        ),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Ruta no simulada" });
  });

  await page.goto("/dashboard/team");
  await expect(
    page.getByText("Coordinacion segunda pagina", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("segunda-invitacion@example.test", { exact: true }),
  ).toBeVisible();
  expect(new Set(requestedPages)).toEqual(
    new Set([
      "/api/team/invitations:1:100",
      "/api/team/invitations:2:100",
      "/api/team/members:1:100",
      "/api/team/members:2:100",
    ]),
  );
});

test("refresca el rol vigente antes de construir la navegacion", async ({
  page,
}) => {
  let teamRequests = 0;
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("ADMIN", "AdminCampana"),
    },
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: "user-admin",
              email: "admin@example.test",
              name: "Rol actualizado",
              role: "VOLUNTEER",
              tenant: {
                id: "tenant-e2e",
                name: "Campana verificable",
                slug: "campana-verificable",
                type: "CANDIDACY",
              },
            },
          }),
        ),
      });
      return;
    }
    if (path.startsWith("/api/team/")) teamRequests += 1;
    await route.fulfill({ status: 403, body: "Forbidden" });
  });

  await page.goto("/dashboard/team");
  await expect(
    page.getByRole("heading", { name: "Acceso Restringido" }),
  ).toBeVisible();
  expect(teamRequests).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const serialized = window.sessionStorage.getItem(
          "politica-sostenible.auth-session",
        );
        return serialized ? JSON.parse(serialized).user.backendRole : null;
      }),
    )
    .toBe("VOLUNTEER");
});

test("limpia y redirige una sesion cuya cuenta fue desactivada", async ({
  page,
}) => {
  let teamRequests = 0;
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("ADMIN", "AdminCampana"),
    },
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 401,
          error: { message: "Token invalido o expirado" },
        }),
      });
      return;
    }
    if (path.startsWith("/api/team/")) teamRequests += 1;
    await route.fulfill({ status: 401, body: "Unauthorized" });
  });

  await page.goto("/dashboard/team");
  await expect(page).toHaveURL(/\/iniciar-sesion\?next=/);
  expect(teamRequests).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.sessionStorage.getItem("politica-sostenible.auth-session"),
      ),
    )
    .toBeNull();
});

test("un rol no administrador no ve ni abre la gestión de equipo", async ({
  page,
}) => {
  let teamRequests = 0;
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: sessionFor("VOLUNTEER", "Voluntario"),
    },
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: "user-volunteer",
              email: "volunteer@example.test",
              name: "Voluntaria",
              role: "VOLUNTEER",
              tenant: {
                id: "tenant-e2e",
                name: "Campana verificable",
                slug: "campana-verificable",
                type: "CANDIDACY",
              },
            },
          }),
        ),
      });
      return;
    }

    if (path.startsWith("/api/team/")) teamRequests += 1;
    await route.fulfill({ status: 403, body: "Forbidden" });
  });

  await page.goto("/dashboard/team");
  await expect(
    page.getByRole("heading", { name: "Acceso Restringido" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Equipo y accesos" }),
  ).toHaveCount(0);
  expect(teamRequests).toBe(0);
});
