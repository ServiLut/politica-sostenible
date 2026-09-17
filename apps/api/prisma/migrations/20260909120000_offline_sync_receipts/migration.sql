-- CreateEnum
BEGIN;

CREATE TYPE "OfflineSyncOperationType" AS ENUM ('VOTER_CAPTURE', 'E14_REPORT');

-- AlterTable
ALTER TABLE "ConsentRecord"
ADD COLUMN "capturedAt" TIMESTAMP(3),
ADD COLUMN "receivedAt" TIMESTAMP(3),
ADD COLUMN "syncSourceIpHash" TEXT;

-- CreateTable
CREATE TABLE "OfflineSyncReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientOperationId" UUID NOT NULL,
    "operationType" "OfflineSyncOperationType" NOT NULL,
    "payloadHmac" CHAR(64) NOT NULL,
    "resourceType" VARCHAR(64) NOT NULL,
    "resourceId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineSyncReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfflineSyncReceipt_tenantId_clientOperationId_key"
ON "OfflineSyncReceipt"("tenantId", "clientOperationId");

-- CreateIndex
CREATE INDEX "OfflineSyncReceipt_tenantId_actorUserId_receivedAt_idx"
ON "OfflineSyncReceipt"("tenantId", "actorUserId", "receivedAt");

-- CreateIndex
CREATE INDEX "OfflineSyncReceipt_tenantId_operationType_receivedAt_idx"
ON "OfflineSyncReceipt"("tenantId", "operationType", "receivedAt");

-- AddForeignKey
ALTER TABLE "OfflineSyncReceipt"
ADD CONSTRAINT "OfflineSyncReceipt_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSyncReceipt"
ADD CONSTRAINT "OfflineSyncReceipt_actorUserId_tenantId_fkey"
FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
