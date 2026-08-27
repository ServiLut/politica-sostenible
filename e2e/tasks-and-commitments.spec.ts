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

function successful<T>(data: T) {
  return { statusCode: 200, message: "Success", data };
}

test("gestiona tareas y compromisos sin enviar el tenant ni el modo", async ({
  page,
}) => {
  const mutationBodies: Array<Record<string, unknown>> = [];
  const authorizationHeaders: string[] = [];
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
        body: JSON.stringify(paginated(commitments)),
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
  await taskDialog.getByRole("button", { name: "Crear tarea" }).click();

  await expect(page.getByText("Tarea creada correctamente.")).toBeVisible();
  await expect(page.getByTestId("task-card-task-2")).toContainText(
    "Publicar informe de avance",
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

  expect(mutationBodies).toEqual(
    expect.arrayContaining([
      { status: "DONE" },
      {
        title: "Publicar informe de avance",
        description: "Consolidar y publicar los resultados del mes.",
        priority: "MEDIUM",
      },
      { status: "AT_RISK" },
      { progress: 70 },
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
