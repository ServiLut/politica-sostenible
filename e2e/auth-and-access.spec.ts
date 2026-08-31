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

test("el panel redirige a una persona no autenticada", async ({ page }) => {
  await page.goto("/dashboard/executive");
  await expect(page).toHaveURL(
    /\/iniciar-sesion\?next=%2Fdashboard%2Fexecutive$/,
  );
  await expect(
    page.getByRole("heading", { name: "Hola de nuevo" }),
  ).toBeVisible();
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
              commitments: { open: 0, atRisk: 0, overdue: 0, public: 0 },
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

test("el registro crea el tipo de organización y evidencia términos versionados", async ({
  page,
}) => {
  let registrationPayload: Record<string, unknown> | null = null;
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
  await page.getByLabel("Número de documento").fill("1012345678");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Email Corporativo").fill("ana@example.test");
  await page.getByLabel("Password").fill("clave-segura-2026");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Empezar ahora" }).click();

  await expect(
    page.getByRole("heading", { name: "Organización creada" }),
  ).toBeVisible();
  expect(registrationPayload).toMatchObject({
    email: "ana@example.test",
    name: "Ana Pérez",
    organizationName: "Concejo abierto",
    organizationType: "PUBLIC_OFFICE",
    termsAccepted: true,
    termsVersion: "2026.1",
  });
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
        alerts: [
          {
            code: "NO_CRITICAL_ALERTS",
            severity: "ok",
            title: "Controles críticos al día",
            detail: "No hay vencimientos ni decisiones críticas en este corte.",
            href: "/dashboard/tasks",
          },
        ],
        agenda: { upcomingEvents: [], priorityTasks: [] },
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
  await page.getByLabel("Email").fill("direccion@example.test");
  await page.getByLabel("Password").fill("una-clave-de-prueba");
  await page.getByRole("button", { name: "Entrar ahora" }).click();

  await expect(page).toHaveURL(/\/dashboard\/executive$/);
  await expect(
    page.getByRole("heading", { name: "Campaña verificable" }),
  ).toBeVisible();
  await expect(page.getByText("3 relaciones totales")).toBeVisible();
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(1);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});
