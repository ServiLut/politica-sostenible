-- Operational electoral inventory and custody ledger.
-- Existing balances are preserved in an explicitly legacy warehouse. Existing
-- movements remain unclassified: this migration never invents verified custody.

BEGIN;

ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'RECEIPT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'DISPATCH';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_RECEIPT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'RETURN_OUT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'RETURN_IN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'RECONCILIATION_OUT';

CREATE TYPE "InventoryRecordOrigin" AS ENUM ('LEGACY_UNCLASSIFIED', 'API');
CREATE TYPE "InventoryTrackingMode" AS ENUM ('NONE', 'LOT', 'SERIAL');
CREATE TYPE "InventoryStockCondition" AS ENUM ('AVAILABLE', 'QUARANTINED', 'DAMAGED', 'EXPIRED');
CREATE TYPE "InventoryTransferStatus" AS ENUM (
  'DISPATCHED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'RECEIVED_WITH_INCIDENT',
  'PARTIALLY_RETURNED',
  'RETURNED',
  'RECONCILED'
);
CREATE TYPE "InventoryCustodyEventType" AS ENUM (
  'STOCK_RECEIVED',
  'DISPATCHED',
  'RECEIVED',
  'RETURNED',
  'RECONCILED',
  'INCIDENT_REPORTED'
);
CREATE TYPE "InventoryIncidentType" AS ENUM ('MISSING', 'DAMAGED', 'EXPIRED', 'CUSTODY_BREACH', 'OTHER');
CREATE TYPE "InventoryCommandType" AS ENUM (
  'WAREHOUSE_CREATE',
  'ITEM_IMPORT',
  'STOCK_RECEIVE',
  'DISPATCH',
  'RECEIVE',
  'RETURN',
  'RECONCILE',
  'INCIDENT_REPORT'
);

ALTER TABLE "InventoryItem"
  ADD COLUMN "description" VARCHAR(1000),
  ADD COLUMN "unit" VARCHAR(40),
  ADD COLUMN "trackingMode" "InventoryTrackingMode",
  ADD COLUMN "minimumStock" INTEGER,
  ADD COLUMN "recordOrigin" "InventoryRecordOrigin",
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdById" TEXT;

UPDATE "InventoryItem"
SET "recordOrigin" = 'LEGACY_UNCLASSIFIED'
WHERE "recordOrigin" IS NULL;

ALTER TABLE "InventoryItem"
  ALTER COLUMN "recordOrigin" SET NOT NULL;

CREATE TABLE "InventoryWarehouse" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "address" VARCHAR(500),
  "responsibleUserId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "recordOrigin" "InventoryRecordOrigin" NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryWarehouse_pkey" PRIMARY KEY ("id")
);

INSERT INTO "InventoryWarehouse" (
  "id", "tenantId", "code", "name", "address", "responsibleUserId",
  "isActive", "recordOrigin", "createdById", "createdAt", "updatedAt"
)
SELECT
  'legacy-wh-' || md5(items."tenantId"),
  items."tenantId",
  'LEGACY',
  'Bodega heredada sin custodia verificada',
  NULL,
  NULL,
  true,
  'LEGACY_UNCLASSIFIED',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "InventoryItem" items
GROUP BY items."tenantId";

CREATE TABLE "InventoryStockBalance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "trackingKey" VARCHAR(180) NOT NULL,
  "lotNumber" VARCHAR(120),
  "serialNumber" VARCHAR(160),
  "expiresAt" TIMESTAMP(3),
  "condition" "InventoryStockCondition" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "responsibleUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryStockBalance_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "InventoryItem" WHERE "quantity" < 0) THEN
    RAISE EXCEPTION 'InventoryItem contains a negative legacy balance; migration cannot reinterpret it safely';
  END IF;
END $$;

INSERT INTO "InventoryStockBalance" (
  "id", "tenantId", "itemId", "warehouseId", "trackingKey", "condition",
  "quantity", "createdAt", "updatedAt"
)
SELECT
  'legacy-stock-' || md5(item."tenantId" || ':' || item."id"),
  item."tenantId",
  item."id",
  'legacy-wh-' || md5(item."tenantId"),
  'UNTRACKED',
  'AVAILABLE',
  item."quantity",
  item."createdAt",
  CURRENT_TIMESTAMP
FROM "InventoryItem" item;

CREATE TABLE "InventoryCommand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "InventoryCommandType" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "resourceType" VARCHAR(80) NOT NULL,
  "resourceId" TEXT,
  "resultSummary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCommand_payload_sha_check" CHECK ("payloadSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "InventoryCommand_resource_type_check" CHECK (length(btrim("resourceType")) BETWEEN 2 AND 80)
);

CREATE TABLE "InventoryTransfer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "sourceWarehouseId" TEXT NOT NULL,
  "destinationWarehouseId" TEXT,
  "destinationDivisionId" TEXT,
  "destinationLabel" VARCHAR(300) NOT NULL,
  "destinationTableNumber" INTEGER,
  "custodianUserId" TEXT NOT NULL,
  "status" "InventoryTransferStatus" NOT NULL,
  "purpose" VARCHAR(1000) NOT NULL,
  "dispatchDeclaration" VARCHAR(1000) NOT NULL,
  "dispatchedById" TEXT NOT NULL,
  "dispatchedAt" TIMESTAMP(3) NOT NULL,
  "expectedReturnAt" TIMESTAMP(3),
  "reconciledById" TEXT,
  "reconciledAt" TIMESTAMP(3),
  "reconciliationNote" VARCHAR(2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransfer_destination_check" CHECK (
    length(btrim("destinationLabel")) >= 3
    AND ("destinationTableNumber" IS NULL OR ("destinationDivisionId" IS NOT NULL AND "destinationTableNumber" > 0))
  ),
  CONSTRAINT "InventoryTransfer_text_check" CHECK (
    length(btrim("purpose")) >= 20 AND length(btrim("dispatchDeclaration")) >= 20
  ),
  CONSTRAINT "InventoryTransfer_dates_check" CHECK (
    "expectedReturnAt" IS NULL OR "expectedReturnAt" >= "dispatchedAt"
  ),
  CONSTRAINT "InventoryTransfer_reconciliation_check" CHECK (
    ("status" = 'RECONCILED' AND "reconciledById" IS NOT NULL AND "reconciledAt" IS NOT NULL AND length(btrim("reconciliationNote")) >= 20)
    OR
    ("status" <> 'RECONCILED' AND "reconciledById" IS NULL AND "reconciledAt" IS NULL AND "reconciliationNote" IS NULL)
  )
);

CREATE TABLE "InventoryTransferLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "sourceStockBalanceId" TEXT NOT NULL,
  "trackingKey" VARCHAR(180) NOT NULL,
  "lotNumber" VARCHAR(120),
  "serialNumber" VARCHAR(160),
  "expiresAt" TIMESTAMP(3),
  "dispatchedQuantity" INTEGER NOT NULL,
  "receivedUsableQuantity" INTEGER NOT NULL DEFAULT 0,
  "receivedDamagedQuantity" INTEGER NOT NULL DEFAULT 0,
  "transitMissingQuantity" INTEGER NOT NULL DEFAULT 0,
  "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
  "consumedQuantity" INTEGER NOT NULL DEFAULT 0,
  "custodyMissingQuantity" INTEGER NOT NULL DEFAULT 0,
  "custodyDamagedQuantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryTransferLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransferLine_quantities_check" CHECK (
    "dispatchedQuantity" > 0
    AND "receivedUsableQuantity" >= 0
    AND "receivedDamagedQuantity" >= 0
    AND "transitMissingQuantity" >= 0
    AND "returnedQuantity" >= 0
    AND "consumedQuantity" >= 0
    AND "custodyMissingQuantity" >= 0
    AND "custodyDamagedQuantity" >= 0
    AND "receivedUsableQuantity" + "receivedDamagedQuantity" + "transitMissingQuantity" <= "dispatchedQuantity"
    AND "returnedQuantity" + "consumedQuantity" + "custodyMissingQuantity" + "custodyDamagedQuantity" <= "receivedUsableQuantity"
  )
);

CREATE TABLE "InventoryCustodyEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "transferId" TEXT,
  "commandId" TEXT NOT NULL,
  "type" "InventoryCustodyEventType" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "fromUserId" TEXT,
  "toUserId" TEXT,
  "declaration" VARCHAR(2000) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCustodyEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCustodyEvent_declaration_check" CHECK (length(btrim("declaration")) >= 20),
  CONSTRAINT "InventoryCustodyEvent_occurrence_check" CHECK ("occurredAt" <= "createdAt" + INTERVAL '5 minutes')
);

CREATE TABLE "InventoryIncident" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "transferLineId" TEXT,
  "commandId" TEXT NOT NULL,
  "type" "InventoryIncidentType" NOT NULL,
  "quantity" INTEGER,
  "description" VARCHAR(2000) NOT NULL,
  "evidenceReference" VARCHAR(2048),
  "evidenceSha256" CHAR(64),
  "reportedById" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryIncident_quantity_check" CHECK ("quantity" IS NULL OR "quantity" > 0),
  CONSTRAINT "InventoryIncident_description_check" CHECK (length(btrim("description")) >= 20),
  CONSTRAINT "InventoryIncident_evidence_check" CHECK (
    ("evidenceReference" IS NULL AND "evidenceSha256" IS NULL)
    OR
    ("evidenceReference" ~ '^https://[^[:space:]]+$' AND "evidenceSha256" ~ '^[a-f0-9]{64}$')
  ),
  CONSTRAINT "InventoryIncident_occurrence_check" CHECK ("occurredAt" <= "createdAt" + INTERVAL '5 minutes')
);

ALTER TABLE "InventoryMovement"
  ADD COLUMN "recordOrigin" "InventoryRecordOrigin",
  ADD COLUMN "commandId" TEXT,
  ADD COLUMN "warehouseId" TEXT,
  ADD COLUMN "stockBalanceId" TEXT,
  ADD COLUMN "transferId" TEXT,
  ADD COLUMN "transferLineId" TEXT,
  ADD COLUMN "delta" INTEGER,
  ADD COLUMN "balanceBefore" INTEGER,
  ADD COLUMN "balanceAfter" INTEGER,
  ADD COLUMN "occurredAt" TIMESTAMP(3),
  ADD COLUMN "custodyFromUserId" TEXT,
  ADD COLUMN "custodyToUserId" TEXT;

UPDATE "InventoryMovement"
SET "recordOrigin" = 'LEGACY_UNCLASSIFIED'
WHERE "recordOrigin" IS NULL;

ALTER TABLE "InventoryMovement"
  ALTER COLUMN "recordOrigin" SET NOT NULL;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_api_receipt_check" CHECK (
    "recordOrigin" = 'LEGACY_UNCLASSIFIED'
    OR (
      "recordOrigin" = 'API'
      AND "commandId" IS NOT NULL
      AND "warehouseId" IS NOT NULL
      AND "stockBalanceId" IS NOT NULL
      AND "delta" IS NOT NULL
      AND "delta" <> 0
      AND "quantity" = abs("delta")
      AND "balanceBefore" IS NOT NULL
      AND "balanceBefore" >= 0
      AND "balanceAfter" IS NOT NULL
      AND "balanceAfter" = "balanceBefore" + "delta"
      AND "balanceAfter" >= 0
      AND "occurredAt" IS NOT NULL
    )
  );

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_api_catalog_check" CHECK (
    "recordOrigin" = 'LEGACY_UNCLASSIFIED'
    OR (
      "recordOrigin" = 'API'
      AND "sku" IS NOT NULL
      AND "sku" ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'
      AND "unit" IS NOT NULL
      AND length(btrim("unit")) BETWEEN 1 AND 40
      AND "trackingMode" IS NOT NULL
      AND "minimumStock" IS NOT NULL
      AND "minimumStock" >= 0
      AND "quantity" = 0
      AND "warehouse" IS NULL
    )
  );

ALTER TABLE "InventoryWarehouse"
  ADD CONSTRAINT "InventoryWarehouse_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  ADD CONSTRAINT "InventoryWarehouse_name_check" CHECK (length(btrim("name")) BETWEEN 3 AND 160);

ALTER TABLE "InventoryStockBalance"
  ADD CONSTRAINT "InventoryStockBalance_quantity_check" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "InventoryStockBalance_tracking_key_check" CHECK (length(btrim("trackingKey")) BETWEEN 3 AND 180),
  ADD CONSTRAINT "InventoryStockBalance_serial_quantity_check" CHECK ("serialNumber" IS NULL OR "quantity" <= 1);

CREATE UNIQUE INDEX "InventoryWarehouse_id_tenantId_key" ON "InventoryWarehouse"("id", "tenantId");
CREATE UNIQUE INDEX "InventoryWarehouse_tenantId_code_key" ON "InventoryWarehouse"("tenantId", "code");
CREATE INDEX "InventoryWarehouse_tenantId_isActive_name_idx" ON "InventoryWarehouse"("tenantId", "isActive", "name");
CREATE INDEX "InventoryWarehouse_tenantId_responsibleUserId_idx" ON "InventoryWarehouse"("tenantId", "responsibleUserId");

CREATE UNIQUE INDEX "InventoryStockBalance_id_tenantId_key" ON "InventoryStockBalance"("id", "tenantId");
CREATE UNIQUE INDEX "InventoryStockBalance_tenant_item_warehouse_tracking_key" ON "InventoryStockBalance"("tenantId", "itemId", "warehouseId", "trackingKey");
CREATE UNIQUE INDEX "InventoryStockBalance_active_serial_key" ON "InventoryStockBalance"("tenantId", "itemId", "serialNumber") WHERE "serialNumber" IS NOT NULL AND "quantity" > 0;
CREATE INDEX "InventoryStockBalance_tenant_warehouse_condition_item_idx" ON "InventoryStockBalance"("tenantId", "warehouseId", "condition", "itemId");
CREATE INDEX "InventoryStockBalance_tenant_item_serial_idx" ON "InventoryStockBalance"("tenantId", "itemId", "serialNumber");
CREATE INDEX "InventoryStockBalance_tenant_expires_idx" ON "InventoryStockBalance"("tenantId", "expiresAt");

CREATE UNIQUE INDEX "InventoryCommand_id_tenantId_key" ON "InventoryCommand"("id", "tenantId");
CREATE UNIQUE INDEX "InventoryCommand_tenantId_clientRequestId_key" ON "InventoryCommand"("tenantId", "clientRequestId");
CREATE INDEX "InventoryCommand_tenantId_type_createdAt_idx" ON "InventoryCommand"("tenantId", "type", "createdAt");
CREATE INDEX "InventoryCommand_tenantId_actorUserId_createdAt_idx" ON "InventoryCommand"("tenantId", "actorUserId", "createdAt");

CREATE UNIQUE INDEX "InventoryTransfer_id_tenantId_key" ON "InventoryTransfer"("id", "tenantId");
CREATE UNIQUE INDEX "InventoryTransfer_commandId_tenantId_key" ON "InventoryTransfer"("commandId", "tenantId");
CREATE UNIQUE INDEX "InventoryTransfer_tenantId_code_key" ON "InventoryTransfer"("tenantId", "code");
CREATE INDEX "InventoryTransfer_tenantId_status_dispatchedAt_idx" ON "InventoryTransfer"("tenantId", "status", "dispatchedAt");
CREATE INDEX "InventoryTransfer_tenantId_custodianUserId_status_idx" ON "InventoryTransfer"("tenantId", "custodianUserId", "status");
CREATE INDEX "InventoryTransfer_tenant_destination_table_idx" ON "InventoryTransfer"("tenantId", "destinationDivisionId", "destinationTableNumber");

CREATE UNIQUE INDEX "InventoryTransferLine_id_tenantId_key" ON "InventoryTransferLine"("id", "tenantId");
CREATE UNIQUE INDEX "InventoryTransferLine_tenant_transfer_source_key" ON "InventoryTransferLine"("tenantId", "transferId", "sourceStockBalanceId");
CREATE INDEX "InventoryTransferLine_tenantId_itemId_transferId_idx" ON "InventoryTransferLine"("tenantId", "itemId", "transferId");

CREATE UNIQUE INDEX "InventoryCustodyEvent_id_tenantId_key" ON "InventoryCustodyEvent"("id", "tenantId");
CREATE UNIQUE INDEX "InventoryCustodyEvent_tenantId_commandId_key" ON "InventoryCustodyEvent"("tenantId", "commandId");
CREATE INDEX "InventoryCustodyEvent_tenant_transfer_occurred_idx" ON "InventoryCustodyEvent"("tenantId", "transferId", "occurredAt");
CREATE INDEX "InventoryCustodyEvent_tenant_actor_occurred_idx" ON "InventoryCustodyEvent"("tenantId", "actorUserId", "occurredAt");

CREATE UNIQUE INDEX "InventoryIncident_id_tenantId_key" ON "InventoryIncident"("id", "tenantId");
CREATE INDEX "InventoryIncident_tenant_transfer_occurred_idx" ON "InventoryIncident"("tenantId", "transferId", "occurredAt");
CREATE INDEX "InventoryIncident_tenant_type_occurred_idx" ON "InventoryIncident"("tenantId", "type", "occurredAt");
CREATE INDEX "InventoryIncident_tenantId_commandId_idx" ON "InventoryIncident"("tenantId", "commandId");

CREATE UNIQUE INDEX "InventoryMovement_id_tenantId_key" ON "InventoryMovement"("id", "tenantId");
CREATE INDEX "InventoryMovement_tenantId_commandId_idx" ON "InventoryMovement"("tenantId", "commandId");
CREATE INDEX "InventoryMovement_tenantId_warehouseId_occurredAt_idx" ON "InventoryMovement"("tenantId", "warehouseId", "occurredAt");
CREATE INDEX "InventoryMovement_tenantId_transferId_occurredAt_idx" ON "InventoryMovement"("tenantId", "transferId", "occurredAt");
CREATE INDEX "InventoryItem_tenantId_isActive_trackingMode_idx" ON "InventoryItem"("tenantId", "isActive", "trackingMode");
CREATE INDEX "InventoryItem_tenantId_createdById_idx" ON "InventoryItem"("tenantId", "createdById");

ALTER TABLE "InventoryWarehouse" ADD CONSTRAINT "InventoryWarehouse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryWarehouse" ADD CONSTRAINT "InventoryWarehouse_responsibleUserId_tenantId_fkey" FOREIGN KEY ("responsibleUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryWarehouse" ADD CONSTRAINT "InventoryWarehouse_createdById_tenantId_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_createdById_tenantId_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryStockBalance" ADD CONSTRAINT "InventoryStockBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryStockBalance" ADD CONSTRAINT "InventoryStockBalance_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryStockBalance" ADD CONSTRAINT "InventoryStockBalance_warehouseId_tenantId_fkey" FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "InventoryWarehouse"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryStockBalance" ADD CONSTRAINT "InventoryStockBalance_responsibleUserId_tenantId_fkey" FOREIGN KEY ("responsibleUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryCommand" ADD CONSTRAINT "InventoryCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCommand" ADD CONSTRAINT "InventoryCommand_actorUserId_tenantId_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_commandId_tenantId_fkey" FOREIGN KEY ("commandId", "tenantId") REFERENCES "InventoryCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_sourceWarehouseId_tenantId_fkey" FOREIGN KEY ("sourceWarehouseId", "tenantId") REFERENCES "InventoryWarehouse"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_destinationWarehouseId_tenantId_fkey" FOREIGN KEY ("destinationWarehouseId", "tenantId") REFERENCES "InventoryWarehouse"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_destinationDivisionId_tenantId_fkey" FOREIGN KEY ("destinationDivisionId", "tenantId") REFERENCES "PoliticalDivision"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_custodianUserId_tenantId_fkey" FOREIGN KEY ("custodianUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_dispatchedById_tenantId_fkey" FOREIGN KEY ("dispatchedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_reconciledById_tenantId_fkey" FOREIGN KEY ("reconciledById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_transferId_tenantId_fkey" FOREIGN KEY ("transferId", "tenantId") REFERENCES "InventoryTransfer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_sourceStockBalanceId_tenantId_fkey" FOREIGN KEY ("sourceStockBalanceId", "tenantId") REFERENCES "InventoryStockBalance"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryCustodyEvent" ADD CONSTRAINT "InventoryCustodyEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCustodyEvent" ADD CONSTRAINT "InventoryCustodyEvent_transferId_tenantId_fkey" FOREIGN KEY ("transferId", "tenantId") REFERENCES "InventoryTransfer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCustodyEvent" ADD CONSTRAINT "InventoryCustodyEvent_commandId_tenantId_fkey" FOREIGN KEY ("commandId", "tenantId") REFERENCES "InventoryCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "InventoryCustodyEvent" ADD CONSTRAINT "InventoryCustodyEvent_actorUserId_tenantId_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCustodyEvent" ADD CONSTRAINT "InventoryCustodyEvent_fromUserId_tenantId_fkey" FOREIGN KEY ("fromUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCustodyEvent" ADD CONSTRAINT "InventoryCustodyEvent_toUserId_tenantId_fkey" FOREIGN KEY ("toUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryIncident" ADD CONSTRAINT "InventoryIncident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryIncident" ADD CONSTRAINT "InventoryIncident_transferId_tenantId_fkey" FOREIGN KEY ("transferId", "tenantId") REFERENCES "InventoryTransfer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryIncident" ADD CONSTRAINT "InventoryIncident_transferLineId_tenantId_fkey" FOREIGN KEY ("transferLineId", "tenantId") REFERENCES "InventoryTransferLine"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryIncident" ADD CONSTRAINT "InventoryIncident_commandId_tenantId_fkey" FOREIGN KEY ("commandId", "tenantId") REFERENCES "InventoryCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "InventoryIncident" ADD CONSTRAINT "InventoryIncident_reportedById_tenantId_fkey" FOREIGN KEY ("reportedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_commandId_tenantId_fkey" FOREIGN KEY ("commandId", "tenantId") REFERENCES "InventoryCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseId_tenantId_fkey" FOREIGN KEY ("warehouseId", "tenantId") REFERENCES "InventoryWarehouse"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_stockBalanceId_tenantId_fkey" FOREIGN KEY ("stockBalanceId", "tenantId") REFERENCES "InventoryStockBalance"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_transferId_tenantId_fkey" FOREIGN KEY ("transferId", "tenantId") REFERENCES "InventoryTransfer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_transferLineId_tenantId_fkey" FOREIGN KEY ("transferLineId", "tenantId") REFERENCES "InventoryTransferLine"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_custodyFromUserId_tenantId_fkey" FOREIGN KEY ("custodyFromUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_custodyToUserId_tenantId_fkey" FOREIGN KEY ("custodyToUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "validate_inventory_stock_tracking"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item_tracking "InventoryTrackingMode";
BEGIN
  SELECT "trackingMode"
  INTO item_tracking
  FROM "InventoryItem"
  WHERE "id" = NEW."itemId" AND "tenantId" = NEW."tenantId"
  FOR KEY SHARE;

  IF item_tracking IS NULL THEN
    IF NEW."trackingKey" <> 'UNTRACKED' OR NEW."lotNumber" IS NOT NULL OR NEW."serialNumber" IS NOT NULL THEN
      RAISE EXCEPTION 'Legacy inventory balances cannot claim verified lot or serial tracking';
    END IF;
    RETURN NEW;
  END IF;

  IF item_tracking = 'NONE' AND (
    NEW."trackingKey" <> 'UNTRACKED' OR NEW."lotNumber" IS NOT NULL OR NEW."serialNumber" IS NOT NULL OR NEW."expiresAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Untracked inventory cannot include lot, serial, or expiry metadata';
  ELSIF item_tracking = 'LOT' AND (
    NEW."lotNumber" IS NULL OR NEW."serialNumber" IS NOT NULL OR NEW."trackingKey" <> 'LOT:' || upper(btrim(NEW."lotNumber"))
  ) THEN
    RAISE EXCEPTION 'Lot-tracked inventory requires its canonical lot tracking key';
  ELSIF item_tracking = 'SERIAL' AND (
    NEW."serialNumber" IS NULL OR NEW."trackingKey" <> 'SERIAL:' || upper(btrim(NEW."serialNumber")) OR NEW."quantity" > 1
  ) THEN
    RAISE EXCEPTION 'Serialized inventory requires its canonical serial tracking key and quantity at most one';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER "InventoryStockBalance_validate_tracking"
BEFORE INSERT OR UPDATE ON "InventoryStockBalance"
FOR EACH ROW EXECUTE FUNCTION "validate_inventory_stock_tracking"();

CREATE FUNCTION "enforce_inventory_transfer_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."tenantId" <> NEW."tenantId"
    OR OLD."commandId" <> NEW."commandId"
    OR OLD."code" <> NEW."code"
    OR OLD."sourceWarehouseId" <> NEW."sourceWarehouseId"
    OR OLD."destinationWarehouseId" IS DISTINCT FROM NEW."destinationWarehouseId"
    OR OLD."destinationDivisionId" IS DISTINCT FROM NEW."destinationDivisionId"
    OR OLD."destinationLabel" <> NEW."destinationLabel"
    OR OLD."destinationTableNumber" IS DISTINCT FROM NEW."destinationTableNumber"
    OR OLD."custodianUserId" <> NEW."custodianUserId"
    OR OLD."purpose" <> NEW."purpose"
    OR OLD."dispatchDeclaration" <> NEW."dispatchDeclaration"
    OR OLD."dispatchedById" <> NEW."dispatchedById"
    OR OLD."dispatchedAt" <> NEW."dispatchedAt"
    OR OLD."expectedReturnAt" IS DISTINCT FROM NEW."expectedReturnAt"
    OR OLD."createdAt" <> NEW."createdAt"
  THEN
    RAISE EXCEPTION 'InventoryTransfer identity and dispatch evidence are immutable';
  END IF;

  IF OLD."status" = 'RECONCILED' THEN
    RAISE EXCEPTION 'A reconciled InventoryTransfer is immutable';
  END IF;

  IF NOT (
    (OLD."status" = 'DISPATCHED' AND NEW."status" IN ('PARTIALLY_RECEIVED', 'RECEIVED', 'RECEIVED_WITH_INCIDENT'))
    OR (OLD."status" = 'PARTIALLY_RECEIVED' AND NEW."status" IN ('PARTIALLY_RECEIVED', 'RECEIVED', 'RECEIVED_WITH_INCIDENT'))
    OR (OLD."status" IN ('RECEIVED', 'RECEIVED_WITH_INCIDENT') AND NEW."status" IN ('PARTIALLY_RETURNED', 'RETURNED', 'RECONCILED'))
    OR (OLD."status" = 'PARTIALLY_RETURNED' AND NEW."status" IN ('PARTIALLY_RETURNED', 'RETURNED', 'RECONCILED'))
    OR (OLD."status" = 'RETURNED' AND NEW."status" = 'RECONCILED')
  ) THEN
    RAISE EXCEPTION 'Invalid InventoryTransfer status transition from % to %', OLD."status", NEW."status";
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER "InventoryTransfer_enforce_transition"
BEFORE UPDATE ON "InventoryTransfer"
FOR EACH ROW EXECUTE FUNCTION "enforce_inventory_transfer_transition"();

CREATE FUNCTION "enforce_inventory_transfer_line_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  transfer_status "InventoryTransferStatus";
BEGIN
  IF OLD."tenantId" <> NEW."tenantId"
    OR OLD."transferId" <> NEW."transferId"
    OR OLD."itemId" <> NEW."itemId"
    OR OLD."sourceStockBalanceId" <> NEW."sourceStockBalanceId"
    OR OLD."trackingKey" <> NEW."trackingKey"
    OR OLD."lotNumber" IS DISTINCT FROM NEW."lotNumber"
    OR OLD."serialNumber" IS DISTINCT FROM NEW."serialNumber"
    OR OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt"
    OR OLD."dispatchedQuantity" <> NEW."dispatchedQuantity"
    OR OLD."createdAt" <> NEW."createdAt"
  THEN
    RAISE EXCEPTION 'InventoryTransferLine dispatch identity is immutable';
  END IF;

  IF NEW."receivedUsableQuantity" < OLD."receivedUsableQuantity"
    OR NEW."receivedDamagedQuantity" < OLD."receivedDamagedQuantity"
    OR NEW."transitMissingQuantity" < OLD."transitMissingQuantity"
    OR NEW."returnedQuantity" < OLD."returnedQuantity"
    OR NEW."consumedQuantity" < OLD."consumedQuantity"
    OR NEW."custodyMissingQuantity" < OLD."custodyMissingQuantity"
    OR NEW."custodyDamagedQuantity" < OLD."custodyDamagedQuantity"
  THEN
    RAISE EXCEPTION 'InventoryTransferLine custody counters are monotonic';
  END IF;

  SELECT "status" INTO transfer_status
  FROM "InventoryTransfer"
  WHERE "id" = OLD."transferId" AND "tenantId" = OLD."tenantId";
  IF transfer_status = 'RECONCILED' THEN
    RAISE EXCEPTION 'Lines of a reconciled InventoryTransfer are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "InventoryTransferLine_enforce_update"
BEFORE UPDATE ON "InventoryTransferLine"
FOR EACH ROW EXECUTE FUNCTION "enforce_inventory_transfer_line_update"();

CREATE FUNCTION "prevent_inventory_ledger_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only and cannot be %', TG_TABLE_NAME, TG_OP;
END $$;

CREATE TRIGGER "InventoryMovement_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "InventoryMovement"
FOR EACH ROW EXECUTE FUNCTION "prevent_inventory_ledger_mutation"();
CREATE TRIGGER "InventoryMovement_prevent_truncate"
BEFORE TRUNCATE ON "InventoryMovement"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_inventory_ledger_mutation"();

CREATE TRIGGER "InventoryCommand_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "InventoryCommand"
FOR EACH ROW EXECUTE FUNCTION "prevent_inventory_ledger_mutation"();
CREATE TRIGGER "InventoryCommand_prevent_truncate"
BEFORE TRUNCATE ON "InventoryCommand"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_inventory_ledger_mutation"();

CREATE TRIGGER "InventoryCustodyEvent_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "InventoryCustodyEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_inventory_ledger_mutation"();
CREATE TRIGGER "InventoryCustodyEvent_prevent_truncate"
BEFORE TRUNCATE ON "InventoryCustodyEvent"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_inventory_ledger_mutation"();

CREATE TRIGGER "InventoryIncident_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "InventoryIncident"
FOR EACH ROW EXECUTE FUNCTION "prevent_inventory_ledger_mutation"();
CREATE TRIGGER "InventoryIncident_prevent_truncate"
BEFORE TRUNCATE ON "InventoryIncident"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_inventory_ledger_mutation"();

ALTER TABLE "InventoryMovement" ENABLE ALWAYS TRIGGER "InventoryMovement_prevent_update_delete";
ALTER TABLE "InventoryMovement" ENABLE ALWAYS TRIGGER "InventoryMovement_prevent_truncate";
ALTER TABLE "InventoryCommand" ENABLE ALWAYS TRIGGER "InventoryCommand_prevent_update_delete";
ALTER TABLE "InventoryCommand" ENABLE ALWAYS TRIGGER "InventoryCommand_prevent_truncate";
ALTER TABLE "InventoryCustodyEvent" ENABLE ALWAYS TRIGGER "InventoryCustodyEvent_prevent_update_delete";
ALTER TABLE "InventoryCustodyEvent" ENABLE ALWAYS TRIGGER "InventoryCustodyEvent_prevent_truncate";
ALTER TABLE "InventoryIncident" ENABLE ALWAYS TRIGGER "InventoryIncident_prevent_update_delete";
ALTER TABLE "InventoryIncident" ENABLE ALWAYS TRIGGER "InventoryIncident_prevent_truncate";
ALTER TABLE "InventoryStockBalance" ENABLE ALWAYS TRIGGER "InventoryStockBalance_validate_tracking";
ALTER TABLE "InventoryTransfer" ENABLE ALWAYS TRIGGER "InventoryTransfer_enforce_transition";
ALTER TABLE "InventoryTransferLine" ENABLE ALWAYS TRIGGER "InventoryTransferLine_enforce_update";

COMMIT;
