-- Durable, tenant-scoped capabilities and integrity continuity for offline
-- E-14 capture. Existing reports remain LEGACY_UNCLASSIFIED and are not
-- reclassified by this forward-only migration.
BEGIN;

ALTER TABLE "StoredObject"
ADD COLUMN "expectedSha256" CHAR(64),
ADD COLUMN "reportedSha256" CHAR(64);

ALTER TABLE "StoredObject"
ADD CONSTRAINT "StoredObject_expectedSha256_format_check"
CHECK (
  "expectedSha256" IS NULL OR
  "expectedSha256" ~ '^[0-9a-f]{64}$'
),
ADD CONSTRAINT "StoredObject_reportedSha256_format_check"
CHECK (
  "reportedSha256" IS NULL OR
  "reportedSha256" ~ '^[0-9a-f]{64}$'
),
ADD CONSTRAINT "StoredObject_sha256_pair_check"
CHECK (
  "reportedSha256" IS NULL OR
  "expectedSha256" = "reportedSha256"
);

CREATE TABLE "OfflineE14CaptureGrant" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "tokenHmac" CHAR(64) NOT NULL,
  "userAuthVersion" INTEGER NOT NULL,
  "roleAtIssue" "Role" NOT NULL,
  "captureContext" "WitnessCaptureContext" NOT NULL,
  "issuedStage" "PoliticalOperationStage" NOT NULL,
  "electionDate" DATE NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OfflineE14CaptureGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfflineE14Grant_window_check" CHECK ("expiresAt" > "issuedAt"),
  CONSTRAINT "OfflineE14Grant_auth_version_check" CHECK ("userAuthVersion" >= 0),
  CONSTRAINT "OfflineE14Grant_context_stage_check" CHECK (
    ("captureContext" = 'SIMULATION' AND "issuedStage" = 'SIMULATION') OR
    ("captureContext" = 'REAL' AND "issuedStage" = 'ELECTION_DAY')
  )
);

CREATE TABLE "OfflineE14CaptureGrantPlace" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "puestoId" TEXT NOT NULL,
  "expectedTables" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfflineE14CaptureGrantPlace_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfflineE14GrantPlace_tables_check" CHECK ("expectedTables" > 0)
);

CREATE UNIQUE INDEX "OfflineE14CaptureGrant_tokenHmac_key"
ON "OfflineE14CaptureGrant"("tokenHmac");

CREATE UNIQUE INDEX "OfflineE14CaptureGrant_id_tenantId_key"
ON "OfflineE14CaptureGrant"("id", "tenantId");

CREATE INDEX "OfflineE14Grant_tenant_actor_active_idx"
ON "OfflineE14CaptureGrant"("tenantId", "actorUserId", "revokedAt", "expiresAt");

CREATE INDEX "OfflineE14Grant_tenant_profile_expires_idx"
ON "OfflineE14CaptureGrant"("tenantId", "operationProfileId", "expiresAt");

CREATE UNIQUE INDEX "OfflineE14GrantPlace_tenant_grant_place_key"
ON "OfflineE14CaptureGrantPlace"("tenantId", "grantId", "puestoId");

CREATE INDEX "OfflineE14GrantPlace_tenant_place_grant_idx"
ON "OfflineE14CaptureGrantPlace"("tenantId", "puestoId", "grantId");

ALTER TABLE "OfflineE14CaptureGrant"
ADD CONSTRAINT "OfflineE14CaptureGrant_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "OfflineE14CaptureGrant_actorUserId_tenantId_fkey"
FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "OfflineE14CaptureGrant_operationProfileId_tenantId_fkey"
FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OfflineE14CaptureGrantPlace"
ADD CONSTRAINT "OfflineE14CaptureGrantPlace_grantId_tenantId_fkey"
FOREIGN KEY ("grantId", "tenantId") REFERENCES "OfflineE14CaptureGrant"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "OfflineE14CaptureGrantPlace_puestoId_tenantId_fkey"
FOREIGN KEY ("puestoId", "tenantId") REFERENCES "PoliticalDivision"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
