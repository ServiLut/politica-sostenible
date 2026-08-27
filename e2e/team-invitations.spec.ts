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
  await expect(
    page.getByRole("link", { name: "Equipo y accesos" }),
  ).toBeVisible();
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
  page,
}) => {
  const patchBodies: Array<{
    path: string;
    body: Record<string, unknown>;
  }> = [];
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
  ];

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

    await route.fulfill({ status: 404, body: "Ruta no simulada" });
  });

  await page.goto("/dashboard/team");
  await expect(
    page.locator("main").getByText("Administracion principal").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Cuenta administradora protegida", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Rol de Administracion principal")).toHaveCount(
    0,
  );

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
