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
    name: "Entidad verificable",
    slug: "entidad-verificable",
    type: "PUBLIC_OFFICE",
  },
  user: {
    id: "user-e2e",
    email: "direccion@example.test",
    name: "Dirección operativa",
    role: "AdminCampana",
    backendRole: "ADMIN",
  },
};

function paginated<T>(items: T[]) {
  return {
    statusCode: 200,
    message: "Success",
    data: {
      items,
      pagination: {
        page: 1,
        limit: 9,
        total: items.length,
        totalPages: items.length > 0 ? 1 : 0,
      },
    },
  };
}

function commitmentPage<T>(
  items: T[],
  permissions = { canCreate: true, canReadInternal: true },
) {
  const response = paginated(items);
  return {
    ...response,
    data: { ...response.data, permissions },
  };
}

function successful<T>(data: T) {
  return { statusCode: 200, message: "Success", data };
}

test("gestiona tareas y compromisos sin enviar el tenant ni el modo", async ({
  page,
}) => {
  const mutationBodies: Array<Record<string, unknown>> = [];
  const authorizationHeaders: string[] = [];
  const assignees = [
    {
      id: "user-e2e",
      name: "Dirección operativa",
      role: "ADMIN",
      division: null,
    },
    {
      id: "team-member-e2e",
      name: "Andrea Territorio",
      role: "CASE_WORKER",
      division: {
        id: "division-e2e",
        name: "Comuna Centro",
        type: "ZONA",
      },
    },
  ];
  let tasks = [
    {
      id: "task-1",
      mode: "PUBLIC_OFFICE",
      title: "Verificar luminarias del barrio",
      description: "Confirmar el avance con la comunidad y el operador.",
      status: "TODO",
      priority: "HIGH",
      assigneeId: null,
      issueCaseId: null,
      commitmentId: "commitment-1",
      createdById: "user-e2e",
      dueAt: "2026-09-15T12:00:00.000Z",
      completedAt: null,
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
      assignee: null,
      createdBy: {
        id: "user-e2e",
        name: "Dirección operativa",
        role: "ADMIN",
      },
      issueCase: null,
      commitment: {
        id: "commitment-1",
        reference: "CMP-001",
        title: "Iluminación segura",
        status: "IN_PROGRESS",
      },
    },
  ];
  let commitments = [
    {
      id: "commitment-1",
      mode: "PUBLIC_OFFICE",
      reference: "CMP-001",
      title: "Iluminación segura",
      description: "Mejorar la iluminación de los corredores peatonales.",
      status: "IN_PROGRESS",
      ownerId: null,
      issueCaseId: null,
      targetDate: "2026-12-20T12:00:00.000Z",
      progress: 35,
      isPublic: true,
      evidencePath: null,
      completedAt: null,
      createdAt: "2026-08-10T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
      owner: null,
      issueCase: null,
      _count: { tasks: 1 },
      canUpdate: true,
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

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    authorizationHeaders.push(request.headers().authorization ?? "");

    if (pathname === "/api/tasks/assignees" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(assignees)),
      });
      return;
    }

    if (pathname === "/api/tasks" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated(tasks)),
      });
      return;
    }

    if (pathname === "/api/tasks" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      const created = {
        ...tasks[0],
        id: "task-2",
        title: String(body.title),
        description:
          typeof body.description === "string" ? body.description : null,
        priority: typeof body.priority === "string" ? body.priority : "MEDIUM",
        status: "TODO",
        assigneeId: String(body.assigneeId),
        assignee:
          assignees.find((assignee) => assignee.id === body.assigneeId) ?? null,
        commitmentId: null,
        commitment: null,
      };
      tasks = [created, ...tasks];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(created)),
      });
      return;
    }

    if (pathname === "/api/tasks/task-1" && method === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      tasks = tasks.map((task) =>
        task.id === "task-1" ? { ...task, ...body } : task,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful(tasks.find((task) => task.id === "task-1")),
        ),
      });
      return;
    }

    if (pathname === "/api/commitments" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(commitmentPage(commitments)),
      });
      return;
    }

    if (pathname === "/api/commitments" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      const created = {
        ...commitments[0],
        id: "commitment-2",
        reference: String(body.reference),
        title: String(body.title),
        description: String(body.description),
        targetDate:
          typeof body.targetDate === "string" ? body.targetDate : null,
        isPublic: Boolean(body.isPublic),
        ownerId: String(body.ownerId),
        owner:
          assignees.find((assignee) => assignee.id === body.ownerId) ?? null,
        progress: 0,
        status: "PROPOSED",
        _count: { tasks: 0 },
      };
      commitments = [created, ...commitments];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(created)),
      });
      return;
    }

    if (pathname === "/api/commitments/commitment-1" && method === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push(body);
      commitments = commitments.map((commitment) =>
        commitment.id === "commitment-1"
          ? { ...commitment, ...body }
          : commitment,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful(
            commitments.find((commitment) => commitment.id === "commitment-1"),
          ),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: `Ruta simulada no definida: ${method} ${pathname}`,
      }),
    });
  });

  await page.goto("/dashboard/tasks");

  await expect(
    page.getByRole("heading", { name: "Tareas y compromisos" }),
  ).toBeVisible();
  await expect(
    page.getByText("Gestión pública", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("task-card-task-1")).toContainText(
    "Verificar luminarias del barrio",
  );

  await page
    .getByRole("combobox", {
      name: "Estado de Verificar luminarias del barrio",
    })
    .selectOption("DONE");
  await expect(
    page.getByText("Estado de “Verificar luminarias del barrio” actualizado."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Nueva tarea" }).click();
  const taskDialog = page.getByRole("dialog", { name: "Crear tarea" });
  await taskDialog.getByLabel("Título").fill("Publicar informe de avance");
  await taskDialog
    .getByLabel(/Descripción/)
    .fill("Consolidar y publicar los resultados del mes.");
  await taskDialog
    .getByRole("combobox", { name: "Responsable" })
    .selectOption("team-member-e2e");
  await taskDialog.getByRole("button", { name: "Crear tarea" }).click();

  await expect(page.getByText("Tarea creada correctamente.")).toBeVisible();
  await expect(page.getByTestId("task-card-task-2")).toContainText(
    "Publicar informe de avance",
  );
  await expect(page.getByTestId("task-card-task-2")).toContainText(
    "Andrea Territorio",
  );

  await page.getByRole("tab", { name: /Compromisos/ }).click();
  const commitmentCard = page.getByTestId("commitment-card-commitment-1");
  await expect(commitmentCard).toContainText("Iluminación segura");

  await commitmentCard
    .getByRole("combobox", { name: "Estado de Iluminación segura" })
    .selectOption("AT_RISK");
  await expect(
    page.getByText("Estado de “Iluminación segura” actualizado."),
  ).toBeVisible();

  await commitmentCard.getByRole("spinbutton", { name: "Avance" }).fill("70");
  await commitmentCard.getByRole("button", { name: "Guardar" }).click();
  await expect(
    page.getByText("Avance de “Iluminación segura” actualizado."),
  ).toBeVisible();
  await expect(
    commitmentCard.getByRole("progressbar", {
      name: "Avance de Iluminación segura",
    }),
  ).toHaveAttribute("aria-valuenow", "70");

  await page.getByRole("button", { name: "Nuevo compromiso" }).click();
  const commitmentDialog = page.getByRole("dialog", {
    name: "Registrar compromiso",
  });
  await commitmentDialog.getByLabel("Referencia").fill("CMP-002");
  await commitmentDialog
    .getByLabel("Título")
    .fill("Recuperación del parque vecinal");
  await commitmentDialog
    .getByLabel("Descripción")
    .fill("Coordinar y verificar la recuperación del espacio público.");
  await commitmentDialog
    .getByRole("combobox", { name: "Responsable" })
    .selectOption("team-member-e2e");
  await commitmentDialog
    .getByRole("button", { name: "Registrar compromiso" })
    .click();

  await expect(
    page.getByText("Compromiso creado correctamente."),
  ).toBeVisible();
  await expect(page.getByTestId("commitment-card-commitment-2")).toContainText(
    "Andrea Territorio",
  );

  expect(mutationBodies).toEqual(
    expect.arrayContaining([
      { status: "DONE" },
      {
        title: "Publicar informe de avance",
        description: "Consolidar y publicar los resultados del mes.",
        priority: "MEDIUM",
        assigneeId: "team-member-e2e",
      },
      { status: "AT_RISK" },
      { progress: 70 },
      {
        reference: "CMP-002",
        title: "Recuperación del parque vecinal",
        description:
          "Coordinar y verificar la recuperación del espacio público.",
        isPublic: false,
        ownerId: "team-member-e2e",
      },
    ]),
  );
  expect(
    mutationBodies.every(
      (body) =>
        !("tenantId" in body) && !("tenant_id" in body) && !("mode" in body),
    ),
  ).toBe(true);
  expect(authorizationHeaders.length).toBeGreaterThanOrEqual(7);
  expect(authorizationHeaders.every((value) => value === `Bearer ${jwt}`)).toBe(
    true,
  );
});

test("crea trabajo desde un caso y conserva el vínculo autorizado", async ({
  page,
}) => {
  const linkedCase = {
    id: "case-connected",
    mode: "PUBLIC_OFFICE",
    reference: "PQRS-2026-041",
    title: "Falla recurrente de alumbrado",
    description: "La comunidad reporta luminarias apagadas en dos cuadras.",
    category: "Servicios públicos",
    sourceChannel: "WEB",
    status: "IN_PROGRESS",
    priority: "HIGH",
    voterId: null,
    externalContactRef: null,
    divisionId: null,
    assigneeId: "user-e2e",
    createdById: "user-e2e",
    confidential: true,
    dueAt: null,
    firstResponseAt: null,
    resolvedAt: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    assignee: {
      id: "user-e2e",
      name: "Dirección operativa",
      role: "ADMIN",
    },
    createdBy: {
      id: "user-e2e",
      name: "Dirección operativa",
      role: "ADMIN",
    },
    voter: null,
    division: null,
    _count: { interactions: 2, tasks: 0, commitments: 0 },
  };
  const assignees = [
    {
      id: "user-e2e",
      name: "Dirección operativa",
      role: "ADMIN",
      division: null,
    },
  ];
  const taskBodies: Array<Record<string, unknown>> = [];
  const commitmentBodies: Array<Record<string, unknown>> = [];
  const taskListUrls: URL[] = [];
  const commitmentListUrls: URL[] = [];
  let tasks: Array<Record<string, unknown>> = [];
  let commitments: Array<Record<string, unknown>> = [];

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
    const method = request.method();

    if (url.pathname === "/api/cases/assignees" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(assignees)),
      });
      return;
    }

    if (url.pathname === "/api/cases/case-connected" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(linkedCase)),
      });
      return;
    }

    if (url.pathname === "/api/cases" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated([linkedCase])),
      });
      return;
    }

    if (url.pathname === "/api/tasks/assignees" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(assignees)),
      });
      return;
    }

    if (url.pathname === "/api/tasks" && method === "GET") {
      taskListUrls.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated(tasks)),
      });
      return;
    }

    if (url.pathname === "/api/tasks" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      taskBodies.push(body);
      const created = {
        id: "task-connected",
        mode: "PUBLIC_OFFICE",
        title: String(body.title),
        description: null,
        status: "TODO",
        priority: body.priority,
        assigneeId: body.assigneeId,
        issueCaseId: body.issueCaseId,
        commitmentId: null,
        createdById: "user-e2e",
        dueAt: null,
        completedAt: null,
        createdAt: "2026-09-02T12:00:00.000Z",
        updatedAt: "2026-09-02T12:00:00.000Z",
        assignee: assignees[0],
        createdBy: assignees[0],
        issueCase: {
          id: linkedCase.id,
          reference: linkedCase.reference,
          title: linkedCase.title,
          status: linkedCase.status,
        },
        commitment: null,
      };
      tasks = [created];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(created)),
      });
      return;
    }

    if (url.pathname === "/api/commitments" && method === "GET") {
      commitmentListUrls.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(commitmentPage(commitments)),
      });
      return;
    }

    if (url.pathname === "/api/commitments" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      commitmentBodies.push(body);
      const created = {
        id: "commitment-connected",
        mode: "PUBLIC_OFFICE",
        reference: body.reference,
        title: body.title,
        description: body.description,
        status: "PROPOSED",
        ownerId: body.ownerId,
        issueCaseId: body.issueCaseId,
        targetDate: null,
        progress: 0,
        isPublic: false,
        evidencePath: null,
        completedAt: null,
        createdAt: "2026-09-02T12:00:00.000Z",
        updatedAt: "2026-09-02T12:00:00.000Z",
        owner: assignees[0],
        issueCase: {
          id: linkedCase.id,
          reference: linkedCase.reference,
          title: linkedCase.title,
          status: linkedCase.status,
        },
        _count: { tasks: 0 },
        canUpdate: true,
      };
      commitments = [created];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(successful(created)),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: `Ruta no simulada: ${method} ${url.pathname}` }),
    });
  });

  await page.goto("/dashboard/cases");
  const caseCard = page.getByTestId("case-card-case-connected");
  await expect(caseCard).toContainText("Falla recurrente de alumbrado");
  await expect(caseCard.getByText("Manejo especial")).toBeVisible();
  await expect(
    caseCard.getByTitle(
      "Clasificación operativa; el acceso sigue los permisos generales del rol y la asignación del caso",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Radicar PQRS" }).click();
  const caseDialog = page.getByRole("dialog", {
    name: "Radicar solicitud ciudadana",
  });
  await expect(
    caseDialog.getByText(
      /Es una clasificación operativa\. No restringe el acceso: la visibilidad sigue los permisos generales del rol y la asignación del caso\./,
    ),
  ).toBeVisible();
  await expect(
    caseDialog.getByLabel(/Aplicar etiqueta de manejo especial/),
  ).not.toBeChecked();
  await caseDialog.getByRole("button", { name: "Cerrar" }).click();
  await expect(
    caseCard.getByRole("link", {
      name: "Registrar compromiso vinculado a PQRS-2026-041",
    }),
  ).toHaveAttribute(
    "href",
    "/dashboard/tasks?create=commitment&issueCaseId=case-connected",
  );

  await caseCard
    .getByRole("link", { name: "Crear tarea vinculada a PQRS-2026-041" })
    .click();

  const taskDialog = page.getByRole("dialog", { name: "Crear tarea" });
  await expect(taskDialog).toBeVisible();
  await expect(taskDialog.getByTestId("linked-case-dialog-context")).toContainText(
    "PQRS-2026-041",
  );
  await taskDialog.getByLabel("Título").fill("Confirmar reparación en terreno");
  await taskDialog
    .getByRole("combobox", { name: "Responsable" })
    .selectOption("user-e2e");
  await taskDialog.getByRole("button", { name: "Crear tarea" }).click();

  await expect(
    page.getByText("Tarea creada y vinculada al caso PQRS-2026-041."),
  ).toBeVisible();
  expect(taskBodies).toEqual([
    expect.objectContaining({
      title: "Confirmar reparación en terreno",
      issueCaseId: "case-connected",
    }),
  ]);
  expect(
    taskListUrls.some(
      (url) => url.searchParams.get("issueCaseId") === "case-connected",
    ),
  ).toBe(true);

  await page
    .getByTestId("linked-case-context")
    .getByRole("button", { name: "Quitar vínculo" })
    .click();
  await expect(page).toHaveURL("/dashboard/tasks");

  await page.goto("/dashboard/cases");
  await page
    .getByTestId("case-card-case-connected")
    .getByRole("link", {
      name: "Registrar compromiso vinculado a PQRS-2026-041",
    })
    .click();

  const commitmentDialog = page.getByRole("dialog", {
    name: "Registrar compromiso",
  });
  await expect(commitmentDialog).toBeVisible();
  await commitmentDialog.getByLabel("Referencia").fill("CMP-PQRS-041");
  await commitmentDialog
    .getByLabel("Título")
    .fill("Restablecer alumbrado del sector");
  await commitmentDialog
    .getByLabel("Descripción")
    .fill("Coordinar la solución y dejar constancia verificable del cierre.");
  await commitmentDialog
    .getByRole("combobox", { name: "Responsable" })
    .selectOption("user-e2e");
  await commitmentDialog
    .getByRole("button", { name: "Registrar compromiso" })
    .click();

  await expect(
    page.getByText("Compromiso creado y vinculado al caso PQRS-2026-041."),
  ).toBeVisible();
  expect(commitmentBodies).toEqual([
    expect.objectContaining({
      reference: "CMP-PQRS-041",
      issueCaseId: "case-connected",
    }),
  ]);
  expect(
    commitmentListUrls.some(
      (url) => url.searchParams.get("issueCaseId") === "case-connected",
    ),
  ).toBe(true);
  expect(
    [...taskBodies, ...commitmentBodies].every(
      (body) => !("tenantId" in body) && !("tenant_id" in body),
    ),
  ).toBe(true);
});

test("presenta un compromiso compartido con el equipo como solo lectura", async ({
  page,
}) => {
  let patchRequests = 0;
  const publicCommitment = {
    id: "commitment-public",
    mode: "PUBLIC_OFFICE",
    reference: "CMP-PUBLIC",
    title: "Informe público global",
    description: "Es visible, pero pertenece a otro ámbito de gestión.",
    status: "IN_PROGRESS",
    targetDate: null,
    progress: 40,
    isPublic: true,
    completedAt: null,
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
    _count: { tasks: 0 },
    canUpdate: false,
  };

  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: {
        ...session,
        user: {
          id: "case-worker-e2e",
          email: "gestor@example.test",
          name: "Gestor de caso",
          role: "Coordinador",
          backendRole: "CASE_WORKER",
        },
      },
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/api/tasks") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated([])),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/commitments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          commitmentPage([publicCommitment], {
            canCreate: true,
            canReadInternal: true,
          }),
        ),
      });
      return;
    }

    if (request.method() === "PATCH") patchRequests += 1;
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Operación fuera de alcance" }),
    });
  });

  await page.goto("/dashboard/tasks");
  await page.getByRole("tab", { name: /Compromisos/ }).click();

  const card = page.getByTestId("commitment-card-commitment-public");
  await expect(card).toContainText("solo lectura");
  await expect(card).toContainText("Todo el equipo");
  await expect(
    card.getByRole("combobox", { name: "Estado de Informe público global" }),
  ).toBeDisabled();
  await expect(card.getByRole("spinbutton", { name: "Avance" })).toBeDisabled();
  await expect(card.getByRole("button", { name: "Guardar" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Nuevo compromiso" }),
  ).toBeVisible();
  expect(patchRequests).toBe(0);
});

test("oculta la creación de tareas a un rol de solo lectura", async ({
  page,
}) => {
  await page.addInitScript(
    ({ storageKey, authSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(authSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      authSession: {
        ...session,
        user: {
          id: "auditor-e2e",
          email: "auditoria@example.test",
          name: "Auditoría independiente",
          role: "Auditor",
          backendRole: "AUDITOR",
        },
      },
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/api/tasks") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated([])),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/commitments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          commitmentPage([], {
            canCreate: false,
            canReadInternal: true,
          }),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: `Ruta no simulada: ${pathname}` }),
    });
  });

  await page.goto("/dashboard/tasks");
  await expect(
    page.getByRole("heading", { name: "Tareas y compromisos" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Nueva tarea" })).toHaveCount(
    0,
  );
});

test("gestión pública no ofrece tareas ni carga asignables al responsable de comunicaciones", async ({
  page,
}) => {
  let assigneeRequests = 0;
  const authSession = {
    ...session,
    user: {
      id: "communications-public-e2e",
      email: "comunicaciones.publica@example.test",
      name: "Comunicaciones institucionales",
      role: "GerenteOps",
      backendRole: "COMMUNICATIONS_MANAGER",
    },
  };

  await page.addInitScript(
    ({ storageKey, storedSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(storedSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      storedSession: authSession,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: authSession.user.id,
              email: authSession.user.email,
              name: authSession.user.name,
              role: authSession.user.backendRole,
              tenant: authSession.tenant,
            },
          }),
        ),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/tasks/assignees") {
      assigneeRequests += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ message: "Rol fuera de alcance" }),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/tasks") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated([])),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/commitments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          commitmentPage([], {
            canCreate: false,
            canReadInternal: true,
          }),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: `Ruta no simulada: ${pathname}` }),
    });
  });

  await page.goto("/dashboard/tasks");

  await expect(
    page.getByRole("heading", { name: "Tareas y compromisos" }),
  ).toBeVisible();
  await expect(page.getByText("No hay tareas con estos filtros")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nueva tarea" })).toHaveCount(
    0,
  );
  expect(assigneeRequests).toBe(0);
});

test("campaña ofrece tareas y carga asignables al responsable de comunicaciones", async ({
  page,
}) => {
  let assigneeRequests = 0;
  const authSession = {
    ...session,
    tenant: {
      ...session.tenant,
      type: "CANDIDACY",
    },
    user: {
      id: "communications-campaign-e2e",
      email: "comunicaciones.campana@example.test",
      name: "Comunicaciones de campaña",
      role: "GerenteOps",
      backendRole: "COMMUNICATIONS_MANAGER",
    },
  };
  const assignees = [
    {
      id: authSession.user.id,
      name: authSession.user.name,
      role: authSession.user.backendRole,
      division: null,
    },
  ];

  await page.addInitScript(
    ({ storageKey, storedSession }) => {
      window.sessionStorage.setItem(storageKey, JSON.stringify(storedSession));
    },
    {
      storageKey: "politica-sostenible.auth-session",
      storedSession: authSession,
    },
  );

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/api/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          successful({
            user: {
              id: authSession.user.id,
              email: authSession.user.email,
              name: authSession.user.name,
              role: authSession.user.backendRole,
              tenant: authSession.tenant,
            },
          }),
        ),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/tasks/assignees") {
      assigneeRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(successful(assignees)),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/tasks") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(paginated([])),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/commitments") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          commitmentPage([], {
            canCreate: false,
            canReadInternal: true,
          }),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: `Ruta no simulada: ${pathname}` }),
    });
  });

  await page.goto("/dashboard/tasks");

  const createButton = page.getByRole("button", { name: "Nueva tarea" });
  await expect(createButton).toBeVisible();
  await createButton.click();

  const dialog = page.getByRole("dialog", { name: "Crear tarea" });
  await expect(
    dialog.getByRole("combobox", { name: "Responsable" }),
  ).toContainText("Comunicaciones de campaña");
  expect(assigneeRequests).toBeGreaterThan(0);
});
