-- Versioned, tenant-scoped privacy notices. No generic notice is seeded: each
-- organisation must deliberately activate its own notice before collecting data.
CREATE TABLE "ConsentNotice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "mode" "PoliticalOperationMode" NOT NULL,
  "purpose" "ConsentPurpose" NOT NULL,
  "version" VARCHAR(32) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "content" TEXT NOT NULL,
  "controllerName" VARCHAR(200) NOT NULL,
  "contactEmail" VARCHAR(254) NOT NULL,
  "privacyPolicyUrl" VARCHAR(2048),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConsentNotice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsentNotice_active_state_check" CHECK (
    ("isActive" = true AND "retiredAt" IS NULL)
    OR ("isActive" = false AND "retiredAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ConsentNotice_id_tenantId_key"
ON "ConsentNotice"("id", "tenantId");

CREATE UNIQUE INDEX "ConsentNotice_tenantId_mode_purpose_version_key"
ON "ConsentNotice"("tenantId", "mode", "purpose", "version");

CREATE UNIQUE INDEX "ConsentNotice_one_active_per_scope_key"
ON "ConsentNotice"("tenantId", "mode", "purpose")
WHERE "isActive" = true;

CREATE INDEX "ConsentNotice_tenantId_mode_purpose_isActive_idx"
ON "ConsentNotice"("tenantId", "mode", "purpose", "isActive");

CREATE INDEX "ConsentNotice_tenantId_createdById_createdAt_idx"
ON "ConsentNotice"("tenantId", "createdById", "createdAt");

ALTER TABLE "ConsentNotice"
ADD CONSTRAINT "ConsentNotice_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsentNotice"
ADD CONSTRAINT "ConsentNotice_createdById_tenantId_fkey"
FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing boolean flags predate tenant-owned notices and therefore cannot
-- prove that the person saw the text an organisation will configure here.
-- Keep the append-only ConsentRecord history, but fail closed until a fresh
-- grant is captured against the newly activated notice.
UPDATE "Voter"
SET "consentAccepted" = false
WHERE "consentAccepted" = true;
