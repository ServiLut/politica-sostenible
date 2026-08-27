-- Account status is tenant-scoped through User. Existing accounts remain active
-- during this incremental migration; future access checks fail closed on false.
ALTER TABLE "User"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "User_tenantId_isActive_role_idx"
ON "User"("tenantId", "isActive", "role");
