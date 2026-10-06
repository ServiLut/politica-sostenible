-- Durable, tenant-scoped person imports. Existing data and migrations are unchanged.
BEGIN;
ALTER TYPE "StorageObjectModule" ADD VALUE 'PERSON_IMPORT';
CREATE TYPE "PersonImportStatus" AS ENUM ('QUEUED','VALIDATING','READY','IMPORT_QUEUED','IMPORTING','COMPLETED','FAILED');
CREATE TYPE "PersonImportRowStatus" AS ENUM ('READY','INVALID','SKIPPED','IMPORTED');
CREATE TABLE "PersonImportJob" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "requestedById" TEXT NOT NULL,
 "fileName" VARCHAR(180) NOT NULL, "clientRequestId" UUID NOT NULL,
 "payloadSha256" CHAR(64) NOT NULL, "sourceArtifactPath" VARCHAR(512) NOT NULL,
 "expectedContentSha256" CHAR(64) NOT NULL, "noticeVersion" VARCHAR(160) NOT NULL,
 "status" "PersonImportStatus" NOT NULL DEFAULT 'QUEUED', "importRequestedAt" TIMESTAMP(3),
 "totalRows" INTEGER NOT NULL DEFAULT 0, "validRows" INTEGER NOT NULL DEFAULT 0,
 "errorRows" INTEGER NOT NULL DEFAULT 0, "skippedRows" INTEGER NOT NULL DEFAULT 0,
 "importedRows" INTEGER NOT NULL DEFAULT 0, "validatedThrough" INTEGER NOT NULL DEFAULT 0,
 "attempts" INTEGER NOT NULL DEFAULT 0, "leaseToken" UUID, "leaseExpiresAt" TIMESTAMP(3),
 "lastErrorCode" VARCHAR(80), "lastErrorMessage" VARCHAR(500), "completedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PersonImportJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PersonImportRowResult" (
 "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "jobId" TEXT NOT NULL,
 "rowNumber" INTEGER NOT NULL, "documentId" VARCHAR(100), "proofPath" VARCHAR(512),
 "values" JSONB NOT NULL, "errors" JSONB NOT NULL,
 "status" "PersonImportRowStatus" NOT NULL, "voterId" TEXT,
 CONSTRAINT "PersonImportRowResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PersonImportJob_id_tenantId_key" ON "PersonImportJob"("id","tenantId");
CREATE UNIQUE INDEX "PersonImportJob_tenantId_clientRequestId_key" ON "PersonImportJob"("tenantId","clientRequestId");
CREATE UNIQUE INDEX "PersonImportJob_tenantId_sourceArtifactPath_key" ON "PersonImportJob"("tenantId","sourceArtifactPath");
CREATE INDEX "PersonImportJob_tenantId_status_createdAt_id_idx" ON "PersonImportJob"("tenantId","status","createdAt","id");
CREATE UNIQUE INDEX "PersonImportRowResult_tenantId_jobId_rowNumber_key" ON "PersonImportRowResult"("tenantId","jobId","rowNumber");
CREATE INDEX "PersonImportRowResult_tenantId_jobId_status_rowNumber_idx" ON "PersonImportRowResult"("tenantId","jobId","status","rowNumber");
CREATE INDEX "PersonImportRowResult_tenantId_jobId_documentId_idx" ON "PersonImportRowResult"("tenantId","jobId","documentId");
CREATE INDEX "PersonImportRowResult_tenantId_jobId_proofPath_idx" ON "PersonImportRowResult"("tenantId","jobId","proofPath");
ALTER TABLE "PersonImportJob" ADD CONSTRAINT "PersonImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonImportJob" ADD CONSTRAINT "PersonImportJob_requestedById_tenantId_fkey" FOREIGN KEY ("requestedById","tenantId") REFERENCES "User"("id","tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonImportJob" ADD CONSTRAINT "PersonImportJob_tenantId_sourceArtifactPath_fkey" FOREIGN KEY ("tenantId","sourceArtifactPath") REFERENCES "StoredObject"("tenantId","path") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonImportRowResult" ADD CONSTRAINT "PersonImportRowResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonImportRowResult" ADD CONSTRAINT "PersonImportRowResult_jobId_tenantId_fkey" FOREIGN KEY ("jobId","tenantId") REFERENCES "PersonImportJob"("id","tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
