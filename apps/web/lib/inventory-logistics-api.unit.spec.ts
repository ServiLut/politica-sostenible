import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  canonicalInventoryCommandPayload,
  computeInventoryCommandSha256,
  createInventoryWarehouse,
  dispatchInventory,
  importInventoryItems,
  receiveInventoryStock,
  receiveInventoryTransfer,
  reconcileInventoryTransfer,
  reportInventoryIncident,
  returnInventoryTransfer,
} from "./inventory-logistics-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("el hash web usa el mismo JSON estable y enlaza el tipo de comando", async () => {
  const input = {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    lines: [
      { quantity: 2, stockBalanceId: "balance-b" },
      { stockBalanceId: "balance-a", quantity: 1 },
    ],
    purpose: "Entrega controlada para jornada electoral",
  };
  const canonical = canonicalInventoryCommandPayload("DISPATCH", input);
  await expect(computeInventoryCommandSha256("DISPATCH", input)).resolves.toBe(
    createHash("sha256").update(canonical).digest("hex"),
  );
  await expect(
    computeInventoryCommandSha256("RECEIVE", input),
  ).resolves.not.toBe(createHash("sha256").update(canonical).digest("hex"));
});

test("normaliza antes de hashear y usa exclusivamente endpoints Nest", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    url: string;
    init?: RequestInit;
    body: Record<string, unknown>;
  }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      init,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return successful({
      command: {
        id: "command-a",
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        payloadSha256: "a".repeat(64),
        type: "WAREHOUSE_CREATE",
        resourceType: "test",
        resourceId: "test",
        createdAt: new Date().toISOString(),
      },
      noOp: false,
    });
  };
  try {
    await createInventoryWarehouse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      code: " central ",
      name: " Bodega central ",
    });
    await importInventoryItems({
      clientRequestId: "22222222-2222-4222-8222-222222222222",
      items: [
        {
          sku: " kit.01 ",
          name: " Kit mesa ",
          unit: " unidad ",
          trackingMode: "LOT",
          minimumStock: 1,
        },
      ],
    });
    await receiveInventoryStock({
      clientRequestId: "33333333-3333-4333-8333-333333333333",
      warehouseId: "warehouse-a",
      itemId: "item-a",
      quantity: 10,
      lotNumber: " lote-a ",
      reason: "Ingreso físico controlado",
      custodyDeclaration: "Conteo físico y custodia aceptados por responsable.",
      occurredAt: "2026-09-09T10:00:00.000Z",
    });
    await dispatchInventory({
      clientRequestId: "44444444-4444-4444-8444-444444444444",
      code: " despacho-01 ",
      sourceWarehouseId: "warehouse-a",
      destinationDivisionId: "place-a",
      destinationLabel: "Puesto A",
      destinationTableNumber: 1,
      custodianUserId: "operator-a",
      purpose: "Entrega controlada de kit para la mesa electoral.",
      custodyDeclaration:
        "La persona custodio recibe la totalidad del kit relacionado.",
      occurredAt: "2026-09-09T11:00:00.000Z",
      lines: [{ stockBalanceId: "balance-a", quantity: 1 }],
    });
    await receiveInventoryTransfer("transfer-a", {
      clientRequestId: "55555555-5555-4555-8555-555555555555",
      expectedTransferUpdatedAt: "2026-09-09T11:00:00.000Z",
      custodyDeclaration:
        "Se verificó el contenido completo al recibir el despacho.",
      occurredAt: "2026-09-09T12:00:00.000Z",
      lines: [
        {
          lineId: "line-a",
          usableQuantity: 1,
          damagedQuantity: 0,
          missingQuantity: 0,
        },
      ],
    });
    await returnInventoryTransfer("transfer-a", {
      clientRequestId: "66666666-6666-4666-8666-666666666666",
      expectedTransferUpdatedAt: "2026-09-09T12:00:00.000Z",
      custodyDeclaration:
        "Se devuelve el elemento a la bodega de origen sin novedad.",
      occurredAt: "2026-09-09T13:00:00.000Z",
      lines: [{ lineId: "line-a", quantity: 1 }],
    });
    await reconcileInventoryTransfer("transfer-a", {
      clientRequestId: "77777777-7777-4777-8777-777777777777",
      expectedTransferUpdatedAt: "2026-09-09T13:00:00.000Z",
      reconciliationNote:
        "Conteo final verificado contra despacho, recepción y devolución.",
      occurredAt: "2026-09-09T14:00:00.000Z",
      lines: [
        {
          lineId: "line-a",
          consumedQuantity: 0,
          missingQuantity: 0,
          damagedQuantity: 0,
        },
      ],
    });
    await reportInventoryIncident("transfer-a", {
      clientRequestId: "88888888-8888-4888-8888-888888888888",
      expectedTransferUpdatedAt: "2026-09-09T13:00:00.000Z",
      type: "CUSTODY_BREACH",
      description: "El sello llegó abierto y se aisló el contenido completo.",
      evidenceReference: " https://evidence.example.test/one ",
      evidenceSha256: "A".repeat(64),
      occurredAt: "2026-09-09T13:30:00.000Z",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(calls.map(({ url }) => url)).toEqual([
    "/api/inventory-logistics/warehouses",
    "/api/inventory-logistics/items/import",
    "/api/inventory-logistics/stock/receive",
    "/api/inventory-logistics/dispatches",
    "/api/inventory-logistics/dispatches/transfer-a/receive",
    "/api/inventory-logistics/dispatches/transfer-a/return",
    "/api/inventory-logistics/dispatches/transfer-a/reconcile",
    "/api/inventory-logistics/dispatches/transfer-a/incidents",
  ]);
  expect(calls.every(({ init }) => init?.method === "POST")).toBe(true);
  for (const { body } of calls) {
    expect(body).not.toHaveProperty("tenantId");
    expect(body.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
  }
  expect(calls[0].body).toMatchObject({
    code: "CENTRAL",
    name: "Bodega central",
  });
  expect(calls[1].body).toMatchObject({
    items: [expect.objectContaining({ sku: "KIT.01", unit: "UNIDAD" })],
  });
  expect(calls[2].body).toMatchObject({ lotNumber: "LOTE-A" });
  expect(calls[3].body).toMatchObject({ code: "DESPACHO-01" });
  expect(calls[7].body).toMatchObject({
    evidenceReference: "https://evidence.example.test/one",
    evidenceSha256: "a".repeat(64),
  });
});
