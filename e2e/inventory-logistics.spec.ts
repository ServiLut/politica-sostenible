import { expect, test, type Page, type Route } from "@playwright/test";

type TestRole =
  | "ADMIN"
  | "CAMPAIGN_MANAGER"
  | "ZONE_COORDINATOR"
  | "COMPLIANCE_OFFICER"
  | "AUDITOR";

const jwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(JSON.stringify({ exp: 1_893_456_000 })).toString("base64url"),
  "inventory-signature",
].join(".");

function sessionFor(
  role: TestRole,
  stage:
    | "ELECTION_PREPARATION"
    | "ELECTION_DAY"
    | "POST_ELECTION"
    | "CLOSED" = "ELECTION_PREPARATION",
) {
  const legacyRole =
    role === "ADMIN"
      ? "AdminCampana"
      : role === "CAMPAIGN_MANAGER"
        ? "GerenteOps"
        : role === "ZONE_COORDINATOR"
          ? "Coordinador"
          : "Auditor";
  return {
    accessToken: jwt,
    expiresAt: null,
    tenant: {
      id: "tenant-inventory-e2e",
      name: "Campaña Logística Verificable",
      slug: "inventory-e2e",
      type: "CANDIDACY" as const,
      operationStage: stage,
    },
    user: {
      id: role === "ZONE_COORDINATOR" ? "operator-a" : `user-${role}`,
      email: `${role.toLowerCase()}@example.test`,
      name: `Persona ${role}`,
      role: legacyRole,
      backendRole: role,
    },
  };
}

async function installSession(
  page: Page,
  role: TestRole,
  stage?: Parameters<typeof sessionFor>[1],
) {
  const session = sessionFor(role, stage);
  await page.addInitScript(
    ({ value }) => {
      window.sessionStorage.setItem(
        "politica-sostenible.auth-session",
        JSON.stringify(value),
      );
    },
    { value: session },
  );
  return session;
}

const warehouse = (id: string, code: string, name: string) => ({
  id,
  code,
  name,
  address: null,
  isActive: true,
  recordOrigin: "API" as const,
  responsibleUser: {
    id: "operator-a",
    name: "Custodio territorial",
    role: "ZONE_COORDINATOR" as const,
  },
  createdAt: "2026-09-09T10:00:00.000Z",
  updatedAt: "2026-09-09T10:00:00.000Z",
});

const item = {
  id: "item-a",
  name: "Kit electoral de mesa",
  sku: "KIT-MESA-01",
  description: "Kit sellado para instalación de mesa",
  unit: "KIT",
  trackingMode: "LOT" as const,
  minimumStock: 2,
  recordOrigin: "API" as const,
  isActive: true,
  createdAt: "2026-09-09T10:00:00.000Z",
  updatedAt: "2026-09-09T10:00:00.000Z",
};

const source = warehouse("warehouse-source", "CENTRAL", "Bodega central");
const destination = warehouse(
  "warehouse-destination",
  "RETORNO",
  "Bodega de retorno",
);
const balance = {
  id: "balance-a",
  itemId: item.id,
  warehouseId: source.id,
  trackingKey: "LOT:LOTE-2026-A",
  lotNumber: "LOTE-2026-A",
  serialNumber: null,
  expiresAt: "2027-01-01T00:00:00.000Z",
  condition: "AVAILABLE" as const,
  quantity: 10,
  responsibleUserId: "operator-a",
  item,
  warehouse: source,
  responsibleUser: source.responsibleUser,
  createdAt: "2026-09-09T10:00:00.000Z",
  updatedAt: "2026-09-09T10:00:00.000Z",
};

function transfer(
  status:
    | "DISPATCHED"
    | "RECEIVED"
    | "RECEIVED_WITH_INCIDENT"
    | "RECONCILED" = "DISPATCHED",
) {
  return {
    id: "transfer-a",
    code: "DESPACHO-001",
    sourceWarehouseId: source.id,
    destinationWarehouseId: destination.id,
    destinationDivisionId: null,
    destinationLabel: "Bodega de retorno",
    destinationTableNumber: null,
    custodianUserId: "operator-a",
    status,
    purpose: "Entrega controlada del kit de mesa para simulacro electoral.",
    dispatchDeclaration:
      "El custodio recibió físicamente los elementos y verificó su conteo.",
    dispatchedById: "user-ADMIN",
    dispatchedAt: "2026-09-09T11:00:00.000Z",
    expectedReturnAt: "2026-09-10T18:00:00.000Z",
    reconciledAt: status === "RECONCILED" ? "2026-09-10T19:00:00.000Z" : null,
    reconciliationNote:
      status === "RECONCILED" ? "Conteo final completo." : null,
    createdAt: "2026-09-09T11:00:00.000Z",
    updatedAt: "2026-09-09T11:00:00.000Z",
    sourceWarehouse: source,
    destinationWarehouse: destination,
    destinationDivision: null,
    custodian: { ...source.responsibleUser, isActive: true },
    dispatchedBy: {
      id: "user-ADMIN",
      name: "Persona ADMIN",
      role: "ADMIN" as const,
    },
    reconciledBy: null,
    lines: [
      {
        id: "line-a",
        itemId: item.id,
        sourceStockBalanceId: balance.id,
        trackingKey: balance.trackingKey,
        lotNumber: balance.lotNumber,
        serialNumber: null,
        expiresAt: balance.expiresAt,
        dispatchedQuantity: 2,
        receivedUsableQuantity: status === "DISPATCHED" ? 0 : 2,
        receivedDamagedQuantity: 0,
        transitMissingQuantity: 0,
        returnedQuantity: status === "RECONCILED" ? 2 : 0,
        consumedQuantity: 0,
        custodyMissingQuantity: 0,
        custodyDamagedQuantity: 0,
        item,
        sourceStockBalance: balance,
      },
    ],
    custodyEvents: [
      {
        id: "event-dispatch",
        type: "DISPATCHED" as const,
        occurredAt: "2026-09-09T11:00:00.000Z",
        declaration:
          "El custodio recibió físicamente los elementos y verificó su conteo.",
        actor: {
          id: "user-ADMIN",
          name: "Persona ADMIN",
          role: "ADMIN" as const,
        },
        fromUser: source.responsibleUser,
        toUser: source.responsibleUser,
        createdAt: "2026-09-09T11:00:00.000Z",
      },
    ],
    incidents: [],
  };
}

function overview(
  stage: "ELECTION_PREPARATION" | "ELECTION_DAY" | "POST_ELECTION" | "CLOSED",
  currentTransfer = transfer(),
) {
  return {
    operation: {
      stage,
      closureType: stage === "CLOSED" ? "CLOSED_EXCEPTIONAL" : null,
      terminatedAt: stage === "CLOSED" ? "2026-09-09T15:00:00.000Z" : null,
    },
    readOnly: stage === "CLOSED",
    inventoryLimitApplied: 100,
    summary: {
      warehouseCount: 2,
      itemCountReturned: 1,
      balanceCountReturned: 1,
      availableUnits: 10,
      lowStockItemCount: 0,
      expiredBalanceCount: 0,
      activeTransferCount: currentTransfer.status === "RECONCILED" ? 0 : 1,
      openIncidentCount: 0,
    },
    warnings: [],
    warehouses: [source, destination],
    items: [item],
    balances: [balance],
    transfers: [currentTransfer],
    incidents: [],
    operators: [
      source.responsibleUser,
      { id: "user-ADMIN", name: "Persona ADMIN", role: "ADMIN" as const },
    ],
  };
}

function successful(data: unknown) {
  return { statusCode: 200, message: "Success", data };
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status >= 400 ? data : successful(data)),
  });
}

async function installRoutes(
  page: Page,
  role: TestRole,
  stage: Parameters<typeof overview>[0],
  onMutation?: (path: string, body: Record<string, unknown>) => unknown,
) {
  let currentTransfer = transfer();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "GET" && path === "/api/auth/me") {
      const session = sessionFor(role, stage);
      await fulfill(route, {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role,
          tenant: session.tenant,
        },
      });
      return;
    }
    if (request.method() === "GET" && path === "/api/billing/capabilities") {
      await fulfill(route, {
        plan: { code: "ENTERPRISE", name: "Enterprise" },
        features: { export: true, import: true, mfa: true },
      });
      return;
    }
    if (request.method() === "GET" && path === "/api/inventory-logistics") {
      await fulfill(route, overview(stage, currentTransfer));
      return;
    }
    if (request.method() === "GET" && path === "/api/campaigns/divisions") {
      await fulfill(route, {
        items: [
          {
            id: "place-a",
            code: "11001001001",
            name: "Colegio oficial de prueba",
            type: "PUESTO",
            parentId: "zone-a",
            parent: { id: "zone-a", code: "01", name: "Zona 01", type: "ZONA" },
            expectedTables: 12,
          },
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });
      return;
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      const result = onMutation?.(path, body);
      if (path.endsWith("/receive")) currentTransfer = transfer("RECEIVED");
      await fulfill(
        route,
        result ?? {
          warehouse: source,
          transfer: currentTransfer,
          command: {
            id: "command-e2e",
            clientRequestId: body.clientRequestId,
            payloadSha256: body.payloadSha256,
            type: path.endsWith("/receive") ? "RECEIVE" : "WAREHOUSE_CREATE",
            resourceType: path.endsWith("/receive")
              ? "InventoryTransfer"
              : "InventoryWarehouse",
            resourceId: path.endsWith("/receive")
              ? currentTransfer.id
              : source.id,
            createdAt: "2026-09-09T12:00:00.000Z",
          },
          noOp: false,
        },
      );
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });
}

test("administración descubre la ruta y confirma una bodega sin tenant en el body", async ({
  page,
}) => {
  await installSession(page, "ADMIN");
  const mutations: Array<{ path: string; body: Record<string, unknown> }> = [];
  await installRoutes(page, "ADMIN", "ELECTION_PREPARATION", (path, body) => {
    mutations.push({ path, body });
    return undefined;
  });
  await page.goto("/dashboard/logistics");
  await expect(
    page.getByRole("heading", { name: "Inventario, despacho y custodia" }),
  ).toBeVisible();
  const logisticsNavigation = page.getByRole("link", {
    name: "Logística electoral",
  });
  const navigationDrawerNeeded = !(await logisticsNavigation.isVisible());
  if (navigationDrawerNeeded) {
    await page.getByRole("button", { name: "Abrir más opciones" }).click();
  }
  await expect(logisticsNavigation).toBeVisible();
  if (navigationDrawerNeeded) {
    await logisticsNavigation.click();
    await expect(
      page.getByRole("button", { name: "Cerrar menú" }),
    ).toBeHidden();
  }
  await page.getByText("Nueva bodega responsable").click();
  const form = page.getByTestId("create-warehouse-form");
  await form.getByLabel("Código").fill("norte");
  await form.getByLabel("Nombre").fill("Bodega norte");
  await form.getByLabel("Responsable").selectOption("operator-a");
  await form.getByRole("button", { name: "Crear bodega" }).click();
  await expect(page.getByTestId("inventory-mutation-success")).toContainText(
    "confirmado con recibo command-e2e",
  );
  expect(mutations).toHaveLength(1);
  expect(mutations[0].path).toBe("/api/inventory-logistics/warehouses");
  expect(mutations[0].body).toMatchObject({
    code: "NORTE",
    name: "Bodega norte",
    responsibleUserId: "operator-a",
  });
  expect(mutations[0].body).not.toHaveProperty("tenantId");
  expect(mutations[0].body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
});

test("coordinación asignada confirma recepción y no ve controles administrativos", async ({
  page,
}) => {
  await installSession(page, "ZONE_COORDINATOR", "ELECTION_DAY");
  const mutations: Array<Record<string, unknown>> = [];
  await installRoutes(
    page,
    "ZONE_COORDINATOR",
    "ELECTION_DAY",
    (_path, body) => {
      mutations.push(body);
      return undefined;
    },
  );
  await page.goto("/dashboard/logistics");
  await expect(page.getByText("Nueva bodega responsable")).toHaveCount(0);
  await page.getByText("Confirmar recepción").click();
  const form = page.getByTestId("receive-transfer-a");
  await form.getByLabel("Útil Kit electoral de mesa").fill("2");
  await form
    .getByLabel("Declaración")
    .fill("Recibo dos unidades completas y verifico el sello del lote.");
  await form.getByRole("button", { name: "Registrar recepción" }).click();
  await expect(page.getByTestId("inventory-mutation-success")).toContainText(
    "Recepción confirmada",
  );
  expect(mutations).toHaveLength(1);
  expect(mutations[0]).toMatchObject({
    expectedTransferUpdatedAt: "2026-09-09T11:00:00.000Z",
    lines: [
      {
        lineId: "line-a",
        usableQuantity: 2,
        damagedQuantity: 0,
        missingQuantity: 0,
      },
    ],
  });
  expect(mutations[0]).not.toHaveProperty("tenantId");
});

test("CLOSED conserva el expediente y elimina toda posibilidad de mutación", async ({
  page,
}) => {
  await installSession(page, "AUDITOR", "CLOSED");
  let mutations = 0;
  await installRoutes(page, "AUDITOR", "CLOSED", () => {
    mutations += 1;
  });
  await page.goto("/dashboard/logistics");
  await expect(page.getByText("Expediente en solo lectura")).toBeVisible();
  await expect(
    page.getByText("cerrada excepcionalmente", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("DESPACHO-001")).toBeVisible();
  await page.getByText("Ver trazabilidad e incidencias").click();
  await expect(page.getByText("DISPATCHED", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirmar recepción")).toHaveCount(0);
  await expect(page.getByText("Reportar incidencia")).toHaveCount(0);
  expect(mutations).toBe(0);
});
