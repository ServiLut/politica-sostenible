-- Preserve the applied 45th migration and every row, index and foreign key.
-- Prisma keeps the logical tenantId field; these two new operational tables
-- expose the mandatory physical tenant_id column required by the architecture.
BEGIN;
ALTER TABLE "PersonImportJob" RENAME COLUMN "tenantId" TO "tenant_id";
ALTER TABLE "PersonImportRowResult" RENAME COLUMN "tenantId" TO "tenant_id";
COMMIT;
