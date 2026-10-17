import { expect, test, type Locator, type Page } from "@playwright/test";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "test-signature",
].join(".");

const people = Array.from({ length: 23 }, (_, index) => ({
  id: `responsible-${index + 1}`,
  name: `Responsable ${String(index + 1).padStart(2, "0")}`,
  role: "CAMPAIGN_MANAGER",
}));

const scenarios = [
  {
    module: "propuestas",
    path: "/dashboard/proposals",
    type: "CANDIDACY",
    endpoint: "/api/proposals",
    peopleEndpoint: "/api/proposals/responsibles",
    createButton: "Nueva propuesta",
    createPicker: "Responsable de la propuesta",
    editPicker: "Responsable de la propuesta",
    assignmentField: "ownerId",
  },
  {
    module: "casos",
    path: "/dashboard/cases",
    type: "PUBLIC_OFFICE",
    endpoint: "/api/cases",
    peopleEndpoint: "/api/cases/assignees",
    createButton: "Registrar solicitud interna",
    createPicker: "Responsable del nuevo caso",
    editPicker: "Responsable de QA-001",
    assignmentField: "assigneeId",
  },
  {
    module: "incidentes",
    path: "/dashboard/incidents",
    type: "CANDIDACY",
    endpoint: "/api/cases",
    peopleEndpoint: "/api/cases/assignees",
    createButton: "Reportar incidente",
    createPicker: "Responsable del nuevo incidente",
    editPicker: "Responsable de QA-001",
    assignmentField: "assigneeId",
  },
] as const;

type Scenario = (typeof scenarios)[number];

function success(data: unknown) {
  return { statusCode: 200, message: "Success", data };
}

async function prepare(page: Page, scenario: Scenario, role = "ADMIN") {
  const tenant = {
    id: "tenant-pagination",
    name: "Organización de prueba",
    slug: "responsables-prueba",
    type: scenario.type,
    operationStage: "CAMPAIGN",
  };
  const user = {
    id: "admin-pagination",
    name: "Administración de prueba",
    email: "pruebas@example.test",
    role,
    tenant,
  };
  await page.addInitScript(
    (value) => sessionStorage.setItem("politica-sostenible.auth-session", JSON.stringify(value)),
    {
      accessToken: jwt,
      expiresAt: null,
      tenant,
      user: { ...user, role: role === "ADMIN" ? "AdminCampana" : "Auditor", backendRole: role },
    },
  );

  let record: Record<string, unknown> = scenario.module === "propuestas"
    ? {
        id: "record-1", referenceCode: "QA-001", title: "Propuesta verificable",
        description: "Trabajo interno de prueba", category: "OTHER", targetGroup: null,
        status: "DRAFT", progressPercent: 0, isPublic: false, territory: null,
        estimatedCost: null, sourceUrl: null, ownerId: people[22].id, owner: people[22],
        createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "2026-10-01T12:00:00.000Z",
      }
    : {
        id: "record-1", reference: "QA-001", title: "Seguimiento verificable",
        description: "Trabajo interno de prueba", category: "Logística", sourceChannel: "INTERNAL",
        mode: scenario.type === "PUBLIC_OFFICE" ? "PUBLIC_OFFICE" : "CAMPAIGN",
        status: "OPEN", priority: "MEDIUM", voterId: null, externalContactRef: null,
        divisionId: null, assigneeId: people[22].id, assignee: people[22],
        createdById: user.id, createdBy: user, confidential: false, dueAt: null,
        firstResponseAt: null, resolvedAt: null, resolutionReady: false, voter: null, division: null,
        createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "2026-10-01T12:00:00.000Z",
        _count: { interactions: 0, tasks: 0, commitments: 0 },
      };
  const peopleRequests: Array<{ page: number; limit: number; search: string }> = [];
  const mutations: Record<string, unknown>[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname === "/api/auth/me") return route.fulfill({ json: success({ user }) });
    if (pathname === "/api/billing/capabilities") {
      return route.fulfill({ json: success({ plan: { code: "PRO", name: "Profesional" }, features: { import: true, export: true, mfa: true } }) });
    }
    if (pathname === scenario.peopleEndpoint) {
      expect(request.headers().authorization).toBe(`Bearer ${jwt}`);
      expect(url.searchParams.has("tenantId")).toBe(false);
      expect(url.searchParams.has("tenant_id")).toBe(false);
      const pageNumber = Number(url.searchParams.get("page") || 1);
      const limit = Number(url.searchParams.get("limit") || 10);
      const search = url.searchParams.get("search") || "";
      peopleRequests.push({ page: pageNumber, limit, search });
      const matching = people.filter((person) => person.name.toLocaleLowerCase("es-CO").includes(search.toLocaleLowerCase("es-CO")));
      return route.fulfill({ json: success({
        items: matching.slice((pageNumber - 1) * limit, pageNumber * limit),
        pagination: { page: pageNumber, limit, total: matching.length, totalPages: Math.ceil(matching.length / limit) },
      }) });
    }
    if (pathname === scenario.endpoint && request.method() === "GET") {
      return route.fulfill({ json: success({ items: [record], pagination: { page: 1, limit: scenario.module === "propuestas" ? 20 : 12, total: 1, totalPages: 1 } }) });
    }
    if (pathname === `${scenario.endpoint}/record-1` && request.method() === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutations.push(body);
      const assigned = people.find((person) => person.id === body[scenario.assignmentField]);
      record = {
        ...record, ...body,
        [scenario.module === "propuestas" ? "owner" : "assignee"]: assigned,
        updatedAt: "2026-10-15T12:00:00.000Z",
      };
      return route.fulfill({ json: success(record) });
    }
    return route.fulfill({ status: 404, json: { message: `Sin fixture: ${request.method()} ${pathname}` } });
  });
  await page.goto(scenario.path);
  return { peopleRequests, mutations };
}

async function selectFromThirdPage(trigger: Locator) {
  await trigger.click();
  const picker = trigger.locator("..");
  await expect(picker.getByRole("status").filter({ hasText: /^Página / })).toHaveText("Página 1 · 23 resultados");
  await picker.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(picker.getByRole("status").filter({ hasText: /^Página / })).toHaveText("Página 2 · 23 resultados");
  await picker.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(picker.getByRole("status").filter({ hasText: /^Página / })).toHaveText("Página 3 · 23 resultados");
  await picker.getByRole("button", { name: /Responsable 21/ }).click();
  await expect(trigger).toHaveText("Responsable 21");
}

for (const scenario of scenarios) {
  test(`${scenario.module}: selecciona una persona después de las primeras veinte al crear`, async ({ page }) => {
    const { peopleRequests } = await prepare(page, scenario);
    await page.getByRole("button", { name: scenario.createButton, exact: true }).click();
    const dialog = page.getByRole("dialog");
    const trigger = dialog.getByRole("button", { name: scenario.createPicker, exact: true });
    await selectFromThirdPage(trigger);
    expect(peopleRequests.map((request) => request.page)).toEqual([1, 2, 3]);
    expect(peopleRequests.every((request) => request.limit === 10)).toBe(true);

    // Changing another field must keep the selected person's visible name.
    await dialog.getByRole("textbox").first().fill("Registro con responsable elegido");
    await expect(trigger).toHaveText("Responsable 21");
    await trigger.click();
    await trigger.locator("..").getByRole("textbox", { name: "Buscar usuario para asignar" }).fill("Responsable 23");
    await expect(trigger.locator("..").getByRole("status").filter({ hasText: /^Página / })).toHaveText("Página 1 · 1 resultados");
    expect(peopleRequests.at(-1)).toEqual({ page: 1, limit: 10, search: "Responsable 23" });
    await expect(trigger).toHaveText("Responsable 21");
  });

  test(`${scenario.module}: muestra el responsable actual fuera de la primera página y conserva el elegido al guardar`, async ({ page }) => {
    const { mutations } = await prepare(page, scenario);
    if (scenario.module === "propuestas") {
      await page.getByRole("button", { name: "Editar propuesta Propuesta verificable", exact: true }).click();
    } else if (scenario.module === "incidentes") {
      await page.getByText("Gestionar incidente", { exact: true }).click();
    }
    const trigger = page.getByRole("button", { name: scenario.editPicker, exact: true });
    await expect(trigger).toHaveText("Responsable 23");
    await selectFromThirdPage(trigger);
    const saveLabel = scenario.module === "propuestas"
      ? "Guardar"
      : scenario.module === "incidentes"
        ? "Guardar respuesta"
        : "Guardar seguimiento";
    await page.getByRole("button", { name: saveLabel, exact: true }).click();
    await expect.poll(() => mutations.length).toBe(1);
    expect(mutations[0][scenario.assignmentField]).toBe(people[20].id);
    expect(mutations[0]).not.toHaveProperty("tenantId");
    expect(mutations[0]).not.toHaveProperty("tenant_id");
    await page.reload();
    if (scenario.module === "propuestas") {
      await page.getByRole("button", { name: "Editar propuesta Propuesta verificable", exact: true }).click();
    } else if (scenario.module === "incidentes") {
      await page.getByText("Gestionar incidente", { exact: true }).click();
    }
    await expect(page.getByRole("button", { name: scenario.editPicker, exact: true })).toHaveText("Responsable 21");
  });

  test(`${scenario.module}: auditoría conserva la consulta sin controles para reasignar`, async ({ page }) => {
    const { peopleRequests, mutations } = await prepare(page, scenario, "AUDITOR");
    await expect(page.getByRole("heading", { name: scenario.module === "propuestas" ? "Propuesta verificable" : "Seguimiento verificable", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: scenario.createButton, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: scenario.editPicker, exact: true })).toHaveCount(0);
    expect(peopleRequests).toEqual([]);
    expect(mutations).toEqual([]);
  });
}
