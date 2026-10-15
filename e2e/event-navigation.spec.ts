import { expect, test, type Page } from "@playwright/test";

// Controlled API fixtures test the frontend; backend scope has separate unit tests.
const token = ["e30", Buffer.from(JSON.stringify({ exp: 2_000_000_000 })).toString("base64url"), "event-navigation"].join(".");
const tenant = { id: "navigation-tenant", name: "Organización de prueba", slug: "navigation", type: "CANDIDACY", operationStage: "SIMULATION" };
const user = { id: "navigation-admin", name: "Administración de prueba", email: "navigation@example.test", role: "ADMIN", tenant };
const event = {
  id: "ckl0z7u4f0000qzrmn831i7rn", name: "Reunión de coordinación", mode: "CAMPAIGN",
  startsAt: "2026-11-01T14:00:00.000Z", endsAt: "2026-11-01T16:00:00.000Z",
  description: "Evento exacto, aunque existan otros con el mismo nombre.", location: "Sede 2",
  status: "SCHEDULED", capacity: 20, responsibleId: "user-12",
  responsible: { id: "user-12", name: "Responsable 12", role: "CAMPAIGN_MANAGER" },
  createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "2026-10-01T12:00:00.000Z",
};

async function fixture(page: Page, failFirst = false, draft = false) {
  const reads: string[] = [];
  let failed = false;
  await page.addInitScript(({ token, tenant, user }) => {
    sessionStorage.setItem("politica-sostenible.auth-session", JSON.stringify({
      accessToken: token, expiresAt: null, tenant,
      user: { ...user, role: "AdminCampana", backendRole: "ADMIN" },
    }));
  }, { token, tenant, user });
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    expect(url.searchParams.has("tenantId")).toBe(false);
    reads.push(url.pathname + url.search);
    let data: unknown;
    if (url.pathname === "/api/auth/me") data = { user };
    else if (url.pathname === "/api/billing/capabilities") data = { plan: { code: "PRO", name: "Profesional" }, features: { export: true, import: true, mfa: true } };
    else if (url.pathname === "/api/events/responsibles") {
      const currentPage = Number(url.searchParams.get("page") ?? 1);
      const people = Array.from({ length: 12 }, (_, i) => ({ id: `user-${i + 1}`, name: `Responsable ${i + 1}`, role: "CAMPAIGN_MANAGER" }));
      data = { items: people.slice((currentPage - 1) * 10, currentPage * 10), pagination: { page: currentPage, limit: 10, total: 12, totalPages: 2 } };
    } else if (url.pathname === `/api/events/${event.id}`) {
      if (failFirst && !failed) {
        failed = true;
        await route.fulfill({ status: 503, json: { message: "Servicio temporalmente ocupado. Intenta nuevamente." } });
        return;
      }
      data = request.method() === "DELETE" ? { id: event.id, deleted: true } : { ...event, status: draft ? "DRAFT" : event.status };
    } else if (url.pathname === "/api/events") {
      data = { items: [{ ...event, id: "cmexampleevent000000000001", location: "Sede 1" }], pagination: { page: 1, limit: 9, total: 1, totalPages: 1 } };
    } else {
      await route.fulfill({ status: 404, json: { message: "Evento no encontrado" } });
      return;
    }
    await route.fulfill({ status: 200, json: { statusCode: 200, message: "Success", data } });
  });
  return reads;
}

test("abre el evento por ID sin buscar homónimos ni recorrer páginas", async ({ page }) => {
  const reads = await fixture(page);
  await page.goto(`/dashboard/events?entityId=${event.id}`);
  await expect(page.getByTestId(`event-card-${event.id}`)).toBeVisible();
  await expect(page.getByText("Sede 2", { exact: true })).toBeVisible();
  expect(reads.filter(url => url.startsWith("/api/events"))).toEqual([`/api/events/${event.id}`]);
  await expect(page.getByRole("navigation", { name: "Paginación", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Filtros de agenda" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Ver toda la agenda" }).click();
  await expect(page).toHaveURL(/\/dashboard\/events$/);
  await expect(page.getByText("Sede 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Filtros de agenda" })).toBeVisible();
});

test("el enlace recupera un fallo y un ID inexistente no muestra otro evento", async ({ page }) => {
  const reads = await fixture(page, true);
  await page.goto(`/dashboard/events?entityId=${event.id}`);
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos abrir este evento" })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar evento" }).click();
  await expect(page.getByTestId(`event-card-${event.id}`)).toBeVisible();
  expect(reads.filter(url => url === `/api/events/${event.id}`)).toHaveLength(2);
  await page.goto("/dashboard/events?entityId=ckl0z7u4f0000qzrmn831i7ro");
  await expect(page.getByRole("alert").filter({ hasText: "Evento no encontrado" })).toBeVisible();
  await expect(page.getByTestId(`event-card-${event.id}`)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver toda la agenda" })).toBeVisible();
});

test("rechaza enlaces mal formados sin consultar rutas reservadas", async ({ page }) => {
  const reads = await fixture(page);
  for (const query of ["entityId=responsibles", "entityId=", `entityId=${event.id}&entityId=${event.id}`]) {
    await page.goto(`/dashboard/events?${query}`);
    await expect(page.getByRole("alert").filter({ hasText: "El enlace del evento no es válido" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver toda la agenda" })).toBeVisible();
  }
  expect(reads.filter(url => url.startsWith("/api/events"))).toEqual([]);
});

test("elimina el borrador seleccionado y regresa a una agenda válida", async ({ page }) => {
  const reads = await fixture(page, false, true);
  await page.goto(`/dashboard/events?entityId=${event.id}`);
  await page.getByRole("button", { name: `Eliminar ${event.name}`, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar borrador", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/events$/);
  await expect(page.getByText("Sede 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos abrir" })).toHaveCount(0);
  // One GET and one DELETE; no request for the deleted resource afterwards.
  expect(reads.filter(url => url === `/api/events/${event.id}`)).toHaveLength(2);
});

test("editar conserva el nombre del responsable y permite recorrer más de diez", async ({ page }) => {
  const reads = await fixture(page);
  await page.goto(`/dashboard/events?entityId=${event.id}`);
  await page.getByRole("button", { name: `Editar ${event.name}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editar evento" });
  const picker = dialog.getByRole("button", { name: "Responsable del evento", exact: true });
  await expect(picker).toContainText("Responsable 12");
  await picker.click();
  await expect(dialog.getByText("Página 1 · 12 resultados")).toBeVisible();
  await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(dialog.getByText("Página 2 · 12 resultados")).toBeVisible();
  await dialog.getByRole("button", { name: /^Responsable 11/ }).click();
  await expect(picker).toContainText("Responsable 11");
  expect(reads.some(url => url.includes("/api/events/responsibles?") && url.includes("page=2"))).toBe(true);
});
