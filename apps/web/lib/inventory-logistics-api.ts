import { apiRequest } from "@/lib/api-client";
import type {
  BackendUserRole,
  PoliticalOperationStage,
} from "@/types/saas-schema";

export type InventoryTrackingMode = "NONE" | "LOT" | "SERIAL";
export type InventoryRecordOrigin = "LEGACY_UNCLASSIFIED" | "API";
export type InventoryStockCondition =
  | "AVAILABLE"
  | "QUARANTINED"
  | "DAMAGED"
  | "EXPIRED";
export type InventoryTransferStatus =
  | "DISPATCHED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "RECEIVED_WITH_INCIDENT"
  | "PARTIALLY_RETURNED"
  | "RETURNED"
  | "RECONCILED";
export type InventoryIncidentType =
  | "MISSING"
  | "DAMAGED"
  | "EXPIRED"
  | "CUSTODY_BREACH"
  | "OTHER";

export const INVENTORY_COMMAND_TYPES = [
  "WAREHOUSE_CREATE",
  "ITEM_IMPORT",
  "STOCK_RECEIVE",
  "DISPATCH",
  "RECEIVE",
  "RETURN",
  "RECONCILE",
  "INCIDENT_REPORT",
] as const;
export type InventoryCommandType = (typeof INVENTORY_COMMAND_TYPES)[number];

export interface InventoryPerson {
  id: string;
  name: string;
  role: BackendUserRole;
}

export interface InventoryWarehouse {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  recordOrigin: InventoryRecordOrigin;
  responsibleUser: InventoryPerson | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unit: string | null;
  trackingMode: InventoryTrackingMode | null;
  minimumStock: number | null;
  recordOrigin: InventoryRecordOrigin;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBalance {
  id: string;
  itemId: string;
  warehouseId: string;
  trackingKey: string;
  lotNumber: string | null;
  serialNumber: string | null;
  expiresAt: string | null;
  condition: InventoryStockCondition;
  quantity: number;
  responsibleUserId: string | null;
  item: InventoryItem;
  warehouse: InventoryWarehouse;
  responsibleUser: InventoryPerson | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransferLine {
  id: string;
  itemId: string;
  sourceStockBalanceId: string;
  trackingKey: string;
  lotNumber: string | null;
  serialNumber: string | null;
  expiresAt: string | null;
  dispatchedQuantity: number;
  receivedUsableQuantity: number;
  receivedDamagedQuantity: number;
  transitMissingQuantity: number;
  returnedQuantity: number;
  consumedQuantity: number;
  custodyMissingQuantity: number;
  custodyDamagedQuantity: number;
  item: InventoryItem;
  sourceStockBalance: InventoryBalance;
}

export interface InventoryCustodyEvent {
  id: string;
  type:
    | "STOCK_RECEIVED"
    | "DISPATCHED"
    | "RECEIVED"
    | "RETURNED"
    | "RECONCILED"
    | "INCIDENT_REPORTED";
  occurredAt: string;
  declaration: string;
  actor: InventoryPerson;
  fromUser: InventoryPerson | null;
  toUser: InventoryPerson | null;
  createdAt: string;
}

export interface InventoryIncident {
  id: string;
  transferId: string;
  transferLineId: string | null;
  type: InventoryIncidentType;
  quantity: number | null;
  description: string;
  evidenceReference: string | null;
  evidenceSha256: string | null;
  occurredAt: string;
  reportedBy?: InventoryPerson;
  createdAt: string;
}

export interface InventoryTransfer {
  id: string;
  code: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string | null;
  destinationDivisionId: string | null;
  destinationLabel: string;
  destinationTableNumber: number | null;
  custodianUserId: string;
  status: InventoryTransferStatus;
  purpose: string;
  dispatchDeclaration: string;
  dispatchedById: string;
  dispatchedAt: string;
  expectedReturnAt: string | null;
  reconciledAt: string | null;
  reconciliationNote: string | null;
  createdAt: string;
  updatedAt: string;
  sourceWarehouse: InventoryWarehouse;
  destinationWarehouse: InventoryWarehouse | null;
  destinationDivision: {
    id: string;
    code: string;
    name: string;
    type: "PUESTO";
    expectedTables: number | null;
    isActive: boolean;
  } | null;
  custodian: InventoryPerson & { isActive: boolean };
  dispatchedBy: InventoryPerson;
  reconciledBy: InventoryPerson | null;
  lines: InventoryTransferLine[];
  custodyEvents: InventoryCustodyEvent[];
  incidents: InventoryIncident[];
}

export interface InventoryOverview {
  operation: {
    stage: PoliticalOperationStage;
    closureType: "CLOSED_NORMAL" | "CLOSED_EXCEPTIONAL" | null;
    terminatedAt: string | null;
  };
  readOnly: boolean;
  inventoryLimitApplied: number;
  summary: {
    warehouseCount: number;
    itemCountReturned: number;
    balanceCountReturned: number;
    availableUnits: number;
    lowStockItemCount: number;
    expiredBalanceCount: number;
    activeTransferCount: number;
    openIncidentCount: number;
  };
  warnings: string[];
  warehouses: InventoryWarehouse[];
  items: InventoryItem[];
  balances: InventoryBalance[];
  transfers: InventoryTransfer[];
  incidents: InventoryIncident[];
  operators: InventoryPerson[];
}

export interface InventoryCommandReceipt {
  id: string;
  clientRequestId: string;
  payloadSha256: string;
  type: InventoryCommandType;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
}

export type InventoryCommandResponse<T extends object> = T & {
  command: InventoryCommandReceipt;
  noOp: boolean;
};

export interface InventoryCommandIdentity {
  clientRequestId: string;
}

export type WarehouseCreateInput = InventoryCommandIdentity & {
  code: string;
  name: string;
  address?: string;
  responsibleUserId?: string;
};

export type ItemImportInput = InventoryCommandIdentity & {
  items: Array<{
    sku: string;
    name: string;
    description?: string;
    unit: string;
    trackingMode: InventoryTrackingMode;
    minimumStock: number;
  }>;
};

export type StockReceiveInput = InventoryCommandIdentity & {
  warehouseId: string;
  itemId: string;
  quantity: number;
  lotNumber?: string;
  serialNumber?: string;
  expiresAt?: string;
  responsibleUserId?: string;
  reason: string;
  custodyDeclaration: string;
  occurredAt: string;
};

export type DispatchInput = InventoryCommandIdentity & {
  code: string;
  sourceWarehouseId: string;
  destinationWarehouseId?: string;
  destinationDivisionId?: string;
  destinationLabel: string;
  destinationTableNumber?: number;
  custodianUserId: string;
  purpose: string;
  custodyDeclaration: string;
  occurredAt: string;
  expectedReturnAt?: string;
  lines: Array<{ stockBalanceId: string; quantity: number }>;
};

export type TransferReceiveInput = InventoryCommandIdentity & {
  expectedTransferUpdatedAt: string;
  custodyDeclaration: string;
  occurredAt: string;
  lines: Array<{
    lineId: string;
    usableQuantity: number;
    damagedQuantity: number;
    missingQuantity: number;
  }>;
};

export type TransferReturnInput = InventoryCommandIdentity & {
  expectedTransferUpdatedAt: string;
  custodyDeclaration: string;
  occurredAt: string;
  lines: Array<{ lineId: string; quantity: number }>;
};

export type TransferReconcileInput = InventoryCommandIdentity & {
  expectedTransferUpdatedAt: string;
  reconciliationNote: string;
  occurredAt: string;
  lines: Array<{
    lineId: string;
    consumedQuantity: number;
    missingQuantity: number;
    damagedQuantity: number;
  }>;
};

export type IncidentReportInput = InventoryCommandIdentity & {
  expectedTransferUpdatedAt: string;
  lineId?: string;
  type: InventoryIncidentType;
  quantity?: number;
  description: string;
  evidenceReference?: string;
  evidenceSha256?: string;
  occurredAt: string;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalInventoryCommandPayload(
  type: InventoryCommandType,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export async function computeInventoryCommandSha256(
  type: InventoryCommandType,
  input: object,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonicalInventoryCommandPayload(type, input),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function postCommand<T extends object>(
  path: string,
  type: InventoryCommandType,
  input: object,
): Promise<InventoryCommandResponse<T>> {
  const payloadSha256 = await computeInventoryCommandSha256(type, input);
  return apiRequest(path, {
    method: "POST",
    body: JSON.stringify({ ...input, payloadSha256 }),
  });
}

export function getInventoryOverview(
  signal?: AbortSignal,
): Promise<InventoryOverview> {
  return apiRequest("inventory-logistics?limit=100", { signal });
}

export function getInventoryTransfer(
  transferId: string,
  signal?: AbortSignal,
): Promise<InventoryTransfer> {
  return apiRequest(`inventory-logistics/transfers/${transferId}`, { signal });
}

export function createInventoryWarehouse(input: WarehouseCreateInput) {
  const normalized: WarehouseCreateInput = {
    clientRequestId: input.clientRequestId.toLowerCase(),
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    ...(input.address?.trim() ? { address: input.address.trim() } : {}),
    ...(input.responsibleUserId?.trim()
      ? { responsibleUserId: input.responsibleUserId.trim() }
      : {}),
  };
  return postCommand<{ warehouse: InventoryWarehouse }>(
    "inventory-logistics/warehouses",
    "WAREHOUSE_CREATE",
    normalized,
  );
}

export function importInventoryItems(input: ItemImportInput) {
  const normalized: ItemImportInput = {
    clientRequestId: input.clientRequestId.toLowerCase(),
    items: input.items.map((item) => ({
      sku: item.sku.trim().toUpperCase(),
      name: item.name.trim(),
      ...(item.description?.trim()
        ? { description: item.description.trim() }
        : {}),
      unit: item.unit.trim().toUpperCase(),
      trackingMode: item.trackingMode,
      minimumStock: item.minimumStock,
    })),
  };
  return postCommand<{
    items: InventoryItem[];
    createdCount: number;
    unchangedCount: number;
  }>("inventory-logistics/items/import", "ITEM_IMPORT", normalized);
}

export function receiveInventoryStock(input: StockReceiveInput) {
  const normalized: StockReceiveInput = {
    clientRequestId: input.clientRequestId.toLowerCase(),
    warehouseId: input.warehouseId.trim(),
    itemId: input.itemId.trim(),
    quantity: input.quantity,
    ...(input.lotNumber?.trim()
      ? { lotNumber: input.lotNumber.trim().toUpperCase() }
      : {}),
    ...(input.serialNumber?.trim()
      ? { serialNumber: input.serialNumber.trim().toUpperCase() }
      : {}),
    ...(input.expiresAt?.trim() ? { expiresAt: input.expiresAt.trim() } : {}),
    ...(input.responsibleUserId?.trim()
      ? { responsibleUserId: input.responsibleUserId.trim() }
      : {}),
    reason: input.reason.trim(),
    custodyDeclaration: input.custodyDeclaration.trim(),
    occurredAt: input.occurredAt.trim(),
  };
  return postCommand<{ balance: InventoryBalance }>(
    "inventory-logistics/stock/receive",
    "STOCK_RECEIVE",
    normalized,
  );
}

export function dispatchInventory(input: DispatchInput) {
  const normalized: DispatchInput = {
    clientRequestId: input.clientRequestId.toLowerCase(),
    code: input.code.trim().toUpperCase(),
    sourceWarehouseId: input.sourceWarehouseId.trim(),
    ...(input.destinationWarehouseId?.trim()
      ? { destinationWarehouseId: input.destinationWarehouseId.trim() }
      : {}),
    ...(input.destinationDivisionId?.trim()
      ? { destinationDivisionId: input.destinationDivisionId.trim() }
      : {}),
    destinationLabel: input.destinationLabel.trim(),
    ...(input.destinationTableNumber !== undefined
      ? { destinationTableNumber: input.destinationTableNumber }
      : {}),
    custodianUserId: input.custodianUserId.trim(),
    purpose: input.purpose.trim(),
    custodyDeclaration: input.custodyDeclaration.trim(),
    occurredAt: input.occurredAt.trim(),
    ...(input.expectedReturnAt?.trim()
      ? { expectedReturnAt: input.expectedReturnAt.trim() }
      : {}),
    lines: input.lines.map((line) => ({
      stockBalanceId: line.stockBalanceId.trim(),
      quantity: line.quantity,
    })),
  };
  return postCommand<{ transfer: InventoryTransfer }>(
    "inventory-logistics/dispatches",
    "DISPATCH",
    normalized,
  );
}

export function receiveInventoryTransfer(
  transferId: string,
  input: TransferReceiveInput,
) {
  const normalized: TransferReceiveInput = {
    clientRequestId: input.clientRequestId.toLowerCase(),
    expectedTransferUpdatedAt: input.expectedTransferUpdatedAt.trim(),
    custodyDeclaration: input.custodyDeclaration.trim(),
    occurredAt: input.occurredAt.trim(),
    lines: input.lines.map((line) => ({
      lineId: line.lineId.trim(),
      usableQuantity: line.usableQuantity,
      damagedQuantity: line.damagedQuantity,
      missingQuantity: line.missingQuantity,
    })),
  };
  return postCommand<{ transfer: InventoryTransfer }>(
    `inventory-logistics/dispatches/${transferId}/receive`,
    "RECEIVE",
    normalized,
  );
}

export function returnInventoryTransfer(
  transferId: string,
  input: TransferReturnInput,
) {
  const normalized: TransferReturnInput = {
    clientRequestId: input.clientRequestId.toLowerCase(),
    expectedTransferUpdatedAt: input.expectedTransferUpdatedAt.trim(),
    custodyDeclaration: input.custodyDeclaration.trim(),
    occurredAt: input.occurredAt.trim(),
    lines: input.lines.map((line) => ({
      lineId: line.lineId.trim(),
      quantity: line.quantity,
    })),
  };
  return postCommand<{ transfer: InventoryTransfer }>(
    `inventory-logistics/dispatches/${transferId}/return`,
    "RETURN",
    normalized,
  );
}

export function reconcileInventoryTransfer(
  transferId: string,
  input: TransferReconcileInput,
) {
  const normalized: TransferReconcileInput = {
    clientRequestId: input.clientRequestId.toLowerCase(),
    expectedTransferUpdatedAt: input.expectedTransferUpdatedAt.trim(),
    reconciliationNote: input.reconciliationNote.trim(),
    occurredAt: input.occurredAt.trim(),
    lines: input.lines.map((line) => ({
      lineId: line.lineId.trim(),
      consumedQuantity: line.consumedQuantity,
      missingQuantity: line.missingQuantity,
      damagedQuantity: line.damagedQuantity,
    })),
  };
  return postCommand<{ transfer: InventoryTransfer }>(
    `inventory-logistics/dispatches/${transferId}/reconcile`,
    "RECONCILE",
    normalized,
  );
}

export function reportInventoryIncident(
  transferId: string,
  input: IncidentReportInput,
) {
  const normalized: IncidentReportInput = {
    clientRequestId: input.clientRequestId.toLowerCase(),
    expectedTransferUpdatedAt: input.expectedTransferUpdatedAt.trim(),
    ...(input.lineId?.trim() ? { lineId: input.lineId.trim() } : {}),
    type: input.type,
    ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
    description: input.description.trim(),
    ...(input.evidenceReference?.trim()
      ? { evidenceReference: input.evidenceReference.trim() }
      : {}),
    ...(input.evidenceSha256?.trim()
      ? { evidenceSha256: input.evidenceSha256.trim().toLowerCase() }
      : {}),
    occurredAt: input.occurredAt.trim(),
  };
  return postCommand<{ incident: InventoryIncident }>(
    `inventory-logistics/dispatches/${transferId}/incidents`,
    "INCIDENT_REPORT",
    normalized,
  );
}
