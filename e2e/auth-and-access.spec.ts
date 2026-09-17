import { expect, test } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

test("la portada comunica capacidades verificables y enlaza las políticas", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { name: "Política Sostenible" }),
  ).toBeVisible();
  await expect(
    page.getByText("Campaña y ejercicio del cargo separados"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Iniciar sesión" }),
  ).toHaveAttribute("href", "/iniciar-sesion");

  await page.getByRole("link", { name: "Privacidad" }).click();
  await expect(page).toHaveURL(/\/privacidad$/);
  await expect(
    page.getByRole("heading", { name: /privacidad electoral por diseño/i }),
  ).toBeVisible();
});

test("la interfaz pública conserva contraste aunque el sistema prefiera modo oscuro", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const principles = page.getByRole("region", {
    name: "Principios esenciales",
  });
  await expect(principles).toBeVisible();
  await expect(principles).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(":root")).toHaveCSS("color-scheme", "light");
});

test("el panel redirige a una persona no autenticada", async ({ page }) => {
  await page.goto("/dashboard/executive");
  await expect(page).toHaveURL(
    /\/iniciar-sesion\?next=%2Fdashboard%2Fexecutive$/,
  );
  await expect(
    page.getByRole("heading", { name: "Hola de nuevo" }),
  ).toBeVisible();
});

test("el login devuelve a la persona al deep-link completo solicitado", async ({
  page,
}) => {
  const entityId = "task-login-return";
  const requestedPath = `/dashboard/tasks?view=tasks&entityId=${entityId}`;
  const currentUser = {
    id: "admin-deep-link",
    email: "deep-link@example.test",
    name: "Dirección operativa",
    role: "ADMIN",
    tenant: {
      id: "tenant-deep-link",
      name: "Campaña conectada",
      slug: "campana-conectada",
      type: "CANDIDACY",
      operationStage: "CAMPAIGN",
    },
  };
  const task = {
    id: entityId,
    mode: "CAMPAIGN",
    title: "Tarea recuperada después del login",
    description: "El destino conserva su contexto completo.",
    status: "TODO",
    priority: "HIGH",
    assigneeId: currentUser.id,
    issueCaseId: null,
    commitmentId: null,
    createdById: currentUser.id,
    dueAt: "2026-09-10T13:00:00.000Z",
    completedAt: null,
    createdAt: "2026-09-07T13:00:00.000Z",
    updatedAt: "2026-09-07T13:00:00.000Z",
    assignee: {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
    },
    createdBy: {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
    },
    issueCase: null,
    commitment: null,
  };
  let requestedEntityId: string | null = null;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let data: unknown;

    if (url.pathname === "/api/auth/login") {
      data = { access_token: jwt, user: currentUser };
    } else if (url.pathname === "/api/auth/me") {
      data = { user: currentUser };
    } else if (url.pathname === "/api/tasks/assignees") {
      data = [
        {
          id: currentUser.id,
          name: currentUser.name,
          role: currentUser.role,
          division: null,
        },
      ];
    } else if (url.pathname === "/api/tasks") {
      requestedEntityId = url.searchParams.get("entityId");
      data = {
        items: [task],
        pagination: { page: 1, limit: 6, total: 1, totalPages: 1 },
      };
    } else if (url.pathname === "/api/commitments") {
      data = {
        items: [],
        pagination: { page: 1, limit: 6, total: 0, totalPages: 1 },
        permissions: { canCreate: true, canReadInternal: true },
      };
    } else {
      await route.fulfill({ status: 404, body: "Ruta no simulada" });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ statusCode: 200, message: "Success", data }),
    });
  });

  await page.goto(requestedPath);
  await expect(page).toHaveURL(/\/iniciar-sesion\?/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(requestedPath);

  await page.getByLabel("Correo electrónico").fill(currentUser.email);
  await page.getByLabel("Contraseña").fill("una-clave-de-prueba");
  await page.getByRole("button", { name: "Entrar ahora" }).click();

  await expect(page).toHaveURL(
    /\/dashboard\/tasks\?view=tasks&entityId=task-login-return$/,
  );
  await expect(page.getByTestId(`task-card-${entityId}`)).toHaveAttribute(
    "aria-current",
    "true",
  );
  expect(requestedEntityId).toBe(entityId);
});

test("la recuperación pública explica el restablecimiento administrado real", async ({
  page,
}) => {
  await page.goto("/iniciar-sesion");
  const recoveryLink = page.getByRole("link", {
    name: "¿Perdiste el acceso?",
  });
  await expect(recoveryLink).toHaveAttribute("href", "/olvide-mi-contrasena");
  await recoveryLink.click();
  await expect(
    page.getByRole("heading", {
      name: "Recupera el acceso con tu administrador",
    }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("una nueva contraseña");
  await expect(page.locator("main")).not.toContainText(/todavía|no existe/i);

  await page.goto("/reiniciar-contrasena");
  await expect(
    page.getByRole("heading", {
      name: "El acceso se restablece de forma administrada",
    }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText("Equipo y accesos");
  await expect(page.locator("main")).not.toContainText(/todavía|no existe/i);
});

test("cambiar la contraseña propia cierra los JWT y pide iniciar sesión nuevamente", async ({
  page,
}) => {
  let passwordBody: Record<string, unknown> | null = null;
  const currentUser = {
    id: "user-profile",
    email: "perfil@example.test",
    name: "Perfil seguro",
    role: "ADMIN",
    tenant: {
      id: "tenant-e2e",
      name: "Campaña verificable",
      slug: "campana-verificable",
      type: "CANDIDACY",
    },
  };

  await page.addInitScript(
    ({ storageKey, token, user }) => {
      const seedMarker = `${storageKey}.profile-seeded`;
      if (window.sessionStorage.getItem(seedMarker)) return;
      window.sessionStorage.setItem(seedMarker, "1");
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          accessToken: token,
          expiresAt: null,
          tenant: user.tenant,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: "AdminCampana",
            backendRole: user.role,
          },
        }),
      );
    },
    {
      storageKey: "politica-sostenible.auth-session",
      token: jwt,
      user: currentUser,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: { user: currentUser },
        }),
      });
      return;
    }
    if (
      pathname === "/api/auth/change-password" &&
      request.method() === "POST"
    ) {
      passwordBody = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 201,
          message: "Success",
          data: { message: "Contraseña actualizada" },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "Ruta no simulada" });
  });

  await page.goto("/dashboard/profile");
  await page.getByLabel("Contraseña actual").fill("Temporal-Acceso-2026!");
  await page
    .getByLabel("Nueva contraseña", { exact: true })
    .fill("Nueva-frase-segura-2026!");
  await page
    .getByLabel("Confirmar nueva contraseña")
    .fill("Nueva-frase-segura-2026!");
  await page.getByRole("button", { name: "Actualizar contraseña" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Cerraremos tus sesiones en todos los dispositivos",
  );
  await expect(page).toHaveURL(/\/iniciar-sesion\?passwordChanged=1$/);
  await expect(page.getByRole("status")).toContainText(
    "Inicia sesión nuevamente",
  );
  expect(passwordBody).toEqual({
    currentPassword: "Temporal-Acceso-2026!",
    newPassword: "Nueva-frase-segura-2026!",
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.sessionStorage.getItem("politica-sostenible.auth-session"),
      ),
    )
    .toBeNull();
});

test("el logout usa el JWT y nunca bloquea la salida local", async ({
  page,
}) => {
  const currentUser = {
    id: "user-logout",
    email: "logout@example.test",
    name: "Cuenta protegida",
    role: "ADMIN",
    tenant: {
      id: "tenant-logout",
      name: "Campaña segura",
      slug: "campana-segura",
      type: "CANDIDACY",
    },
  };
  let releaseLogout!: () => void;
  let observeLogout!: () => void;
  const logoutGate = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  const logoutObserved = new Promise<void>((resolve) => {
    observeLogout = resolve;
  });
  let logoutRequest:
    | { authorization: string | undefined; method: string }
    | undefined;

  await page.addInitScript(
    ({ storageKey, token, user }) => {
      const seedMarker = `${storageKey}.logout-seeded`;
      if (window.sessionStorage.getItem(seedMarker)) return;
      window.sessionStorage.setItem(seedMarker, "1");
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          accessToken: token,
          expiresAt: null,
          tenant: user.tenant,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: "AdminCampana",
            backendRole: user.role,
          },
        }),
      );
    },
    {
      storageKey: "politica-sostenible.auth-session",
      token: jwt,
      user: currentUser,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: { user: currentUser },
        }),
      });
      return;
    }

    if (pathname === "/api/auth/mfa/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: { enabled: false },
        }),
      });
      return;
    }

    if (pathname === "/api/auth/logout") {
      logoutRequest = {
        authorization: request.headers().authorization,
        method: request.method(),
      };
      observeLogout();
      await logoutGate;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 503,
          message: "Servicio temporalmente no disponible",
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Ruta no simulada" });
  });

  await page.goto("/dashboard/profile");
  await expect(
    page.getByRole("heading", { name: currentUser.name }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir opciones de usuario" }).click();
  const logoutButton = page.getByRole("button", {
    name: "Cerrar sesión",
  });
  await expect(logoutButton).toBeVisible();

  const clickPromise = logoutButton.click();
  await logoutObserved;

  try {
    expect(logoutRequest).toEqual({
      authorization: `Bearer ${jwt}`,
      method: "POST",
    });
    await expect(page).toHaveURL(/\/iniciar-sesion(?:\?|$)/);
    expect(new URL(page.url()).pathname).toBe("/iniciar-sesion");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.sessionStorage.getItem("politica-sostenible.auth-session"),
        ),
      )
      .toBeNull();
  } finally {
    releaseLogout();
  }

  await clickPromise;
});

test("administracion corrige el nombre de su organizacion sin enviar tenant", async ({
  page,
}) => {
  let organizationBody: Record<string, unknown> | null = null;
  let authorizationHeader: string | undefined;
  const currentUser = {
    id: "admin-organization",
    email: "admin@example.test",
    name: "Administradora",
    role: "ADMIN",
    tenant: {
      id: "tenant-authenticated",
      name: "Organizacion con nombre incorrecto",
      slug: "organizacion-estable",
      type: "CANDIDACY",
    },
  };

  await page.addInitScript(
    ({ storageKey, token, user }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          accessToken: token,
          expiresAt: null,
          tenant: user.tenant,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: "AdminCampana",
            backendRole: user.role,
          },
        }),
      );
    },
    {
      storageKey: "politica-sostenible.auth-session",
      token: jwt,
      user: currentUser,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: { user: currentUser },
        }),
      });
      return;
    }

    if (pathname === "/api/auth/organization" && request.method() === "PATCH") {
      organizationBody = request.postDataJSON() as Record<string, unknown>;
      authorizationHeader = request.headers().authorization;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: {
            tenant: {
              ...currentUser.tenant,
              name: "Movimiento Regi\u00f3n Viva",
            },
            changed: true,
          },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Ruta no simulada" });
  });

  await page.goto("/dashboard/profile");
  const organizationSection = page.getByRole("region", {
    name: /Nombre de la organizaci.n/,
  });
  await expect(organizationSection).toBeVisible();
  await page
    .getByLabel("Nombre visible")
    .fill("  Movimiento Regi\u00f3n Viva  ");
  await page.getByRole("button", { name: "Guardar nombre" }).click();

  await expect(organizationSection.getByRole("status")).toContainText(
    "actualizado correctamente",
  );
  await expect(page.getByLabel("Nombre visible")).toHaveValue(
    "Movimiento Regi\u00f3n Viva",
  );
  expect(organizationBody).toEqual({
    name: "Movimiento Regi\u00f3n Viva",
    expectedName: "Organizacion con nombre incorrecto",
  });
  expect(organizationBody).not.toHaveProperty("tenantId");
  expect(authorizationHeader).toBe(`Bearer ${jwt}`);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const session = window.sessionStorage.getItem(
          "politica-sostenible.auth-session",
        );
        return session ? JSON.parse(session).tenant.name : null;
      }),
    )
    .toBe("Movimiento Regi\u00f3n Viva");
});

test("la entrada del panel respeta la ruta disponible para el rol", async ({
  page,
}) => {
  const publicOfficeUser = {
    id: "case-worker-e2e",
    email: "atencion@example.test",
    name: "Equipo de atención",
    role: "CASE_WORKER",
    tenant: {
      id: "tenant-public-office-e2e",
      name: "Despacho ciudadano",
      slug: "despacho-ciudadano",
      type: "PUBLIC_OFFICE",
    },
  };

  await page.addInitScript(
    ({ storageKey, token, user }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          accessToken: token,
          expiresAt: 1_893_456_000_000,
          tenant: user.tenant,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: "Coordinador",
            backendRole: user.role,
          },
        }),
      );
    },
    {
      storageKey: "politica-sostenible.auth-session",
      token: jwt,
      user: publicOfficeUser,
    },
  );

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const data =
      pathname === "/api/auth/me"
        ? { user: publicOfficeUser }
        : {
            generatedAt: "2026-08-31T14:00:00.000Z",
            tenant: {
              ...publicOfficeUser.tenant,
              mode: "PUBLIC_OFFICE",
            },
            activation: {
              ready: false,
              completedSteps: 0,
              totalSteps: 1,
              steps: [],
            },
            metrics: {
              team: { active: 1, pendingInvitations: 0 },
              cases: { open: 0, overdue: 0, urgent: 0 },
              tasks: { open: 0, overdue: 0 },
              commitments: {
                open: 0,
                atRisk: 0,
                overdue: 0,
                teamVisible: 0,
              },
              events: { upcoming: 0 },
              communications: { pendingApproval: 0 },
            },
            alerts: [],
            agenda: { upcomingEvents: [], priorityTasks: [] },
          };

    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ statusCode: 200, message: "Success", data }),
    });
  });

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard\/public-office$/);
  await expect(
    page.getByRole("heading", { name: "Centro de gestión pública" }),
  ).toBeVisible();
});

test("las rutas públicas de demostración quedaron fuera de producción", async ({
  page,
}) => {
  await page.goto("/crm-demo");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Política Sostenible" }),
  ).toBeVisible();
});

test("el registro permite omitir el documento y evidencia términos versionados", async ({
  page,
}) => {
  let registrationPayload: Record<string, unknown> | null = null;
  await page.route("**/api/auth/registration-policy", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        statusCode: 200,
        message: "Success",
        data: {
          enabled: true,
          invitationAcceptanceEnabled: true,
          mode: "SELF_SERVICE",
          message: "El registro público de organizaciones está habilitado.",
          termsVersion: "registro-2026.9",
        },
      }),
    });
  });
  await page.route("**/api/auth/register", async (route) => {
    registrationPayload = route.request().postDataJSON() as Record<
      string,
      unknown
    >;
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({
        statusCode: 201,
        message: "Success",
        data: {
          message: "Usuario y organización registrados exitosamente",
          tenantId: "tenant-e2e",
          userId: "user-e2e",
        },
      }),
    });
  });

  await page.goto("/registro");
  await page.getByLabel("Nombre de la organización").fill("Concejo abierto");
  await page.getByLabel("Tipo de operación").selectOption("PUBLIC_OFFICE");
  await page.getByLabel("Nombre", { exact: true }).fill("Ana");
  await page.getByLabel("Apellido", { exact: true }).fill("Pérez");
  await expect(
    page.getByLabel("Número de documento (opcional)", { exact: true }),
  ).not.toHaveAttribute("required", "");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Correo corporativo").fill("ana@example.test");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("clave-segura-2026");
  await page
    .getByLabel("Confirmar contraseña")
    .fill("clave-segura-distinta-2026");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Empezar ahora" }).click();
  await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
  expect(registrationPayload).toBeNull();

  await page.getByLabel("Confirmar contraseña").fill("clave-segura-2026");
  await page.getByRole("button", { name: "Empezar ahora" }).click();

  await expect(
    page.getByRole("heading", { name: "Organización creada" }),
  ).toBeVisible();
  expect(registrationPayload).toMatchObject({
    email: "ana@example.test",
    name: "Ana Pérez",
    organizationName: "Concejo abierto",
    organizationType: "PUBLIC_OFFICE",
    password: "clave-segura-2026",
    passwordConfirmation: "clave-segura-2026",
    termsAccepted: true,
    termsVersion: "registro-2026.9",
  });
  expect(registrationPayload).not.toHaveProperty("documentId");
  expect(registrationPayload).not.toHaveProperty("tenantId");
});

test("el inicio de sesión conserva el contrato y envía Bearer a la API", async ({
  page,
}) => {
  const authorizationHeaders: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/auth/login") {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: {
            access_token: jwt,
            user: {
              id: "user-e2e",
              email: "direccion@example.test",
              name: "Dirección de campaña",
              role: "ADMIN",
              tenant: {
                id: "tenant-e2e",
                name: "Campaña verificable",
                slug: "campana-verificable",
                type: "CANDIDACY",
                operationStage: "CAMPAIGN",
              },
            },
          },
        }),
      });
      return;
    }

    authorizationHeaders.push(request.headers().authorization ?? "");
    const dataByPath: Record<string, unknown> = {
      "/api/command-center/briefing": {
        generatedAt: "2026-08-27T14:00:00.000Z",
        tenant: {
          id: "tenant-e2e",
          name: "Campaña verificable",
          type: "CANDIDACY",
          mode: "CAMPAIGN",
        },
        activation: {
          ready: true,
          completedSteps: 5,
          totalSteps: 5,
          steps: [
            {
              code: "TERRITORY_BASE",
              title: "Cargar la base territorial",
              detail: "Sincroniza departamentos y municipios desde DANE.",
              href: "/dashboard/territory",
              complete: true,
            },
          ],
        },
        metrics: {
          people: { total: 3, consented: 3, consentCoverage: 100 },
          team: { active: 4, pendingInvitations: 0 },
          territory: {
            departments: 1,
            municipalities: 5,
            zones: 2,
            pollingPlaces: 4,
          },
          tasks: { open: 1, overdue: 0 },
          events: { upcoming: 1 },
          finance: {
            income: "500000.00",
            expenses: "100000.00",
            balance: "400000.00",
            pending: 0,
            overdue: 0,
          },
          electionDay: { reports: 0, syncedReports: 0 },
          communications: { pendingApproval: 0 },
        },
        territorialCoverage: [
          {
            name: "Zona Centro",
            code: "Z-01",
            voterCount: 3,
            goal: 5,
            coveragePercent: 60,
          },
        ],
        overdueItemsCount: 0,
        teamActivationRate: 100,
        complianceStatus: {
          hasActiveConsentNotice: true,
          hasConfiguredOperationProfile: true,
          hasConfiguredCampaignSettings: true,
          hasNonAdminTeamMember: true,
        },
        alerts: [
          {
            code: "NO_CRITICAL_ALERTS",
            severity: "ok",
            title: "Controles críticos al día",
            detail: "No hay vencimientos ni decisiones críticas en este corte.",
            href: "/dashboard/tasks",
          },
        ],
        agenda: {
          upcomingEvents: [
            {
              id: "event-e2e",
              name: "Consejo territorial",
              startsAt: "2026-09-10T14:00:00.000Z",
              endsAt: "2026-09-10T16:00:00.000Z",
              status: "SCHEDULED",
            },
          ],
          priorityTasks: [
            {
              id: "task-e2e",
              title: "Cerrar cobertura de testigos",
              status: "IN_PROGRESS",
              priority: "URGENT",
              dueAt: "2026-09-10T12:00:00.000Z",
            },
          ],
        },
      },
    };

    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        statusCode: 200,
        message: "Success",
        data: dataByPath[pathname] ?? [],
      }),
    });
  });

  await page.goto("/iniciar-sesion");
  await page.getByLabel("Correo electrónico").fill("direccion@example.test");
  await page.getByLabel("Contraseña").fill("una-clave-de-prueba");
  await page.getByRole("button", { name: "Entrar ahora" }).click();

  await expect(page).toHaveURL(/\/dashboard\/executive$/);
  await expect(
    page.getByRole("heading", { name: "Cuadro de Mando" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cumplimiento de Metas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Abrir Cumplimiento de Metas" }),
  ).toHaveAttribute("href", "/dashboard/territory");
  await expect(
    page.getByRole("link", { name: "Abrir actas aceptadas" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Se habilita desde la preparación electoral, según la etapa configurada.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Riesgos que necesitan responsable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Etapa actual: Campaña" }),
  ).toBeVisible();
  const currentStage = page
    .locator('li[aria-current="step"]')
    .filter({ hasText: "Campaña" });
  await expect(currentStage).toBeVisible();
  await expect(page.getByText("Controles críticos al día")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Consejo territorial/ }),
  ).toHaveAttribute("href", "/dashboard/events");
  await expect(
    page.getByRole("link", { name: /Cerrar cobertura de testigos/ }),
  ).toHaveAttribute("href", "/dashboard/tasks?view=tasks&entityId=task-e2e");
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(1);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});

test("una contraseña temporal obliga a cambiarla y bloquea la navegación", async ({
  page,
}) => {
  const temporaryPasswordExpiresAt = "2026-09-03T18:30:00.000Z";
  const temporaryUser = {
    id: "member-temporary",
    email: "temporal@example.test",
    name: "Acceso temporal",
    role: "VOLUNTEER",
    mustChangePassword: true,
    temporaryPasswordExpiresAt,
    tenant: {
      id: "tenant-e2e",
      name: "Campaña verificable",
      slug: "campana-verificable",
      type: "CANDIDACY",
    },
  };
  let protectedModuleRequests = 0;

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/login") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: { access_token: jwt, user: temporaryUser },
        }),
      });
      return;
    }
    if (pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: { user: temporaryUser },
        }),
      });
      return;
    }
    if (pathname.startsWith("/api/auth/mfa/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 200,
          message: "Success",
          data: { enabled: false },
        }),
      });
      return;
    }

    protectedModuleRequests += 1;
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 403,
        message: "Debes cambiar la contraseña temporal antes de continuar",
        code: "PASSWORD_CHANGE_REQUIRED",
      }),
    });
  });

  await page.goto("/iniciar-sesion?next=/dashboard/team");
  await page.getByLabel("Correo electrónico").fill(temporaryUser.email);
  await page.getByLabel("Contraseña").fill("Temporal-Acceso-2026!");
  await page.getByRole("button", { name: "Entrar ahora" }).click();

  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  const mandatoryChangeAlert = page.locator('section[role="alert"]');
  await expect(mandatoryChangeAlert).toContainText(
    "Debes crear tu contraseña personal ahora",
  );
  await expect(mandatoryChangeAlert).toContainText(
    "todos los demás módulos permanecerán bloqueados",
  );
  await expect(page.getByText("Cambio de clave obligatorio")).toBeVisible();
  await expect(page.locator("aside nav")).toHaveCount(0);

  await page.goto("/dashboard/team");
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  expect(protectedModuleRequests).toBe(0);
});
