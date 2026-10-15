import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Synthetic HTTP fixtures: these exercise the real frontend, not production APIs.
const token = ["e30", Buffer.from(JSON.stringify({ exp: 2_000_000_000 })).toString("base64url"), "ui-test"].join(".");
const tenant = { id: "quality-tenant", slug: "quality", name: "Equipo de prueba de interfaz", type: "CANDIDACY", operationStage: "ELECTION_DAY" };
const user = { id: "quality-admin", name: "Administración de prueba", email: "quality@example.test", role: "ADMIN", tenant };
const success = (data: unknown) => ({ statusCode: 200, message: "Success", data });
const pageOf = (items: unknown[], page = 1, limit = 9, total = items.length) => ({ items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });

async function installSession(page: Page) {
  await page.addInitScript(({ token, tenant, user }) => {
    sessionStorage.setItem("politica-sostenible.auth-session", JSON.stringify({
      accessToken: token, expiresAt: null, tenant,
      user: { ...user, role: "AdminCampana", backendRole: user.role },
    }));
  }, { token, tenant, user });
}

async function eventsFixture(page: Page, count = 1) {
  await installSession(page);
  const events = Array.from({ length: count }, (_, i) => ({
    id: `event-${i + 1}`, name: `Actividad de prueba ${i + 1}`, mode: "CAMPAIGN",
    description: "Descripción completa de la actividad de prueba.",
    startsAt: "2026-11-01T14:00:00.000Z", endsAt: "2026-11-03T16:00:00.000Z",
    status: "DRAFT", location: "Lugar de prueba", capacity: null,
    responsibleId: null, responsible: null,
    createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "2026-10-01T12:00:00.000Z",
  }));
  const reads: URL[] = [];
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    let data: unknown;
    if (url.pathname === "/api/auth/me") data = { user };
    else if (url.pathname === "/api/billing/capabilities") data = { plan: { code: "PRO", name: "Profesional" }, features: { export: true, import: true, mfa: true } };
    else if (url.pathname === "/api/events/responsibles") data = pageOf([], 1, 10);
    else if (url.pathname === "/api/events" && request.method() === "GET") {
      reads.push(url);
      const selected = events.filter(event => (!url.searchParams.get("status") || event.status === url.searchParams.get("status")) && (!url.searchParams.get("search") || event.name.includes(url.searchParams.get("search")!)));
      const currentPage = Number(url.searchParams.get("page") || 1);
      data = pageOf(selected.slice((currentPage - 1) * 9, currentPage * 9), currentPage, 9, selected.length);
    } else if (url.pathname.startsWith("/api/events/") && request.method() === "GET") {
      data = events.find(event => url.pathname === `/api/events/${event.id}`);
    } else if (/\/api\/events\/event-\d+\/status$/.test(url.pathname)) {
      const body = request.postDataJSON();
      writes.push(body);
      const event = events.find(event => url.pathname.includes(`/${event.id}/`))!;
      event.status = body.status;
      data = event;
    } else if (url.pathname === "/api/events" && request.method() === "POST") {
      const body = request.postDataJSON();
      writes.push(body);
      const created = { ...events[0], ...body, id: "ckl0z7u4f0000qzrmn831i7rp", status: "DRAFT" };
      events.push(created);
      data = created;
    } else {
      await route.fulfill({ status: 404, json: { message: `Unmocked ${request.method()} ${url.pathname}` } });
      return;
    }
    await route.fulfill({ status: 200, json: success(data) });
  });
  return { reads, writes };
}

test("agenda: cambiar el último evento de una página reconcilia filtro, total y paginación", async ({ page }) => {
  const { reads, writes } = await eventsFixture(page, 10);
  await page.goto("/dashboard/events");
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("DRAFT");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByTestId("event-card-event-10")).toBeVisible();
  await page.getByRole("combobox", { name: "Siguiente estado de Actividad de prueba 10", exact: true }).selectOption("SCHEDULED");
  await expect(page.getByText("Estado de “Actividad de prueba 10” actualizado a Programado.")).toBeVisible();
  await expect(page.getByTestId("event-card-event-10")).toHaveCount(0);
  await expect(page.getByText("Página 1 de 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Siguiente", exact: true })).toBeDisabled();
  expect(reads.at(-1)?.searchParams.get("status")).toBe("DRAFT");
  expect(reads.at(-1)?.searchParams.get("page")).toBe("1");
  expect(writes).toEqual([{ status: "SCHEDULED" }]);
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("SCHEDULED");
  await expect(page.getByTestId("event-card-event-10")).toBeVisible();
  await expect(page.getByTestId("event-card-event-1")).toHaveCount(0);
});

test("agenda: el formulario conserva datos ante errores y permite encontrar lo creado bajo otro filtro", async ({ page }) => {
  const { writes } = await eventsFixture(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/dashboard/events");
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("COMPLETED");
  await expect(page.getByRole("button", { name: "Limpiar filtros" })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo evento" }).click();
  const dialog = page.getByRole("dialog", { name: "Crear evento" });
  await dialog.getByLabel("Nombre", { exact: true }).fill("   ");
  await dialog.getByLabel("Inicio", { exact: true }).fill("2026-11-01T09:00");
  await dialog.getByLabel("Fin", { exact: true }).fill("2026-11-02T10:00");
  await dialog.getByRole("button", { name: "Crear borrador" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Escribe un nombre");
  expect(writes).toHaveLength(0);
  await expect(dialog.getByLabel("Inicio", { exact: true })).toHaveValue("2026-11-01T09:00");
  await dialog.getByLabel("Nombre", { exact: true }).fill("Encuentro guardado bajo filtro incompatible");
  await dialog.getByRole("button", { name: "Crear borrador" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Estado", exact: true })).toHaveValue("COMPLETED");
  await page.getByRole("button", { name: "Ver evento guardado" }).click();
  await expect(page.getByTestId("event-card-ckl0z7u4f0000qzrmn831i7rp")).toBeVisible();
  await expect(page).toHaveURL(/entityId=ckl0z7u4f0000qzrmn831i7rp/);
  await expect(page.getByRole("region", { name: "Filtros de agenda" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver toda la agenda" })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).not.toHaveProperty("tenant_id");
  expect(writes[0]).not.toHaveProperty("tenantId");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("agenda: la tarjeta distingue los días de un evento largo y permite leer su descripción", async ({ page }) => {
  await eventsFixture(page);
  await page.goto("/dashboard/events");
  const card = page.getByTestId("event-card-event-1");
  await expect(card).toContainText(/01 nov 2026.*03 nov 2026/s);
  await card.getByText("Ver descripción", { exact: true }).click();
  await expect(card.getByText("Descripción completa de la actividad de prueba.")).toBeVisible();
});

for (const width of [320, 390, 768, 1440]) {
  test(`tabla de personas ${width}px: columnas alcanzables, datos legibles y una sola región principal`, async ({ page }, testInfo) => {
    await installSession(page);
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/me") return route.fulfill({ json: success({ user }) });
      if (url.pathname === "/api/billing/capabilities") return route.fulfill({ json: success({ plan: { code: "PRO", name: "Profesional" }, features: { import: true, export: true, mfa: true } }) });
      if (url.pathname === "/api/voters") return route.fulfill({ json: success(pageOf([{
        id: "voter-quality", firstName: "Persona de prueba con nombre compuesto", lastName: "Apellido de prueba suficientemente largo",
        documentIdMasked: "******0001", phoneMasked: "******0002", mesa: 3,
        consentAccepted: false, consentCurrent: false, consentRequiresReconsent: false,
        consentState: "MISSING", consentRecordStatus: null, consentNoticeVersion: null,
        currentConsentNoticeVersion: null, consentTimestamp: null, createdAt: "2026-10-01T12:00:00.000Z",
        puesto: { name: "Puesto de prueba con una denominación extensa" }, registrar: { name: "Equipo de prueba" },
      }], 1, 20)) });
      await route.fulfill({ status: 404, json: { message: "No configurado para este ensayo" } });
    });
    await page.goto("/dashboard/votantes");
    await expect(page.getByRole("cell", { name: /^Persona de prueba/ })).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    expect(await page.evaluate(() => document.querySelectorAll('[id="dashboard-content"]').length)).toBe(1);
    const viewport = page.getByRole("region", { name: "Personas registradas: tabla con desplazamiento horizontal" });
    const overflow = await viewport.evaluate(e => e.scrollWidth > e.clientWidth + 2);
    if (overflow) {
      const next = page.getByRole("button", { name: "Ver columnas siguientes: Personas registradas" });
      const previous = page.getByRole("button", { name: "Ver columnas anteriores: Personas registradas" });
      await expect(previous).toBeDisabled();
      for (let i = 0; i < 8; i++) {
        const { remaining, target } = await viewport.evaluate(e => ({
          remaining: e.scrollWidth - e.clientWidth - e.scrollLeft,
          target: Math.min(e.scrollWidth - e.clientWidth, e.scrollLeft + Math.max(160, e.clientWidth * 0.75)),
        }));
        if (remaining <= 2) break;
        await next.click();
        await expect.poll(() => viewport.evaluate((e, target) => Math.abs(e.scrollLeft - target), target)).toBeLessThanOrEqual(1);
        await expect(previous).toBeEnabled();
      }
      await expect(next).toBeDisabled();
      await expect(previous).toBeEnabled();
      for (let i = 0; i < 8; i++) {
        const { left, target } = await viewport.evaluate(e => ({
          left: e.scrollLeft,
          target: Math.max(0, e.scrollLeft - Math.max(160, e.clientWidth * 0.75)),
        }));
        if (left <= 2) break;
        await previous.click();
        await expect.poll(() => viewport.evaluate((e, target) => Math.abs(e.scrollLeft - target), target)).toBeLessThanOrEqual(1);
        await expect(next).toBeEnabled();
      }
      await expect(previous).toBeDisabled();
    } else {
      await expect(page.getByRole("button", { name: "Ver columnas siguientes: Personas registradas" })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const output = resolve(".artifacts/frontend-estricto-20261008");
    await mkdir(output, { recursive: true });
    await viewport.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, `local-table-${testInfo.project.name}-${width}.png`), fullPage: true });
  });
}
