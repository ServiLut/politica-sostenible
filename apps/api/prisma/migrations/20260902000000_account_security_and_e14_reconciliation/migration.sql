-- Account security fields introduced after the immutable production baseline.
ALTER TABLE "User"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "temporaryPasswordExpiresAt" TIMESTAMP(3),
ALTER COLUMN "documentId" DROP NOT NULL;

-- E-14 reports now follow an independently reviewed reconciliation lifecycle.
CREATE TYPE "WitnessReportStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED'
);

ALTER TABLE "PoliticalDivision"
ADD COLUMN "expectedTables" INTEGER;

ALTER TABLE "WitnessReport"
ADD COLUMN "status" "WitnessReportStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "reviewerId" TEXT,
ADD COLUMN "reviewReason" VARCHAR(1000),
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "supersededById" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Existing reports predate the lifecycle and remain pending until independently reviewed.
UPDATE "WitnessReport"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

ALTER TABLE "WitnessReport"
ALTER COLUMN "updatedAt" SET NOT NULL;

-- The old constraint allowed only one submission. Reconciliation requires independent
-- submissions, while the partial index below guarantees one accepted result per table.
DROP INDEX "WitnessReport_tenantId_puestoId_mesa_key";

CREATE INDEX "WitnessReport_tenantId_status_createdAt_idx"
ON "WitnessReport"("tenantId", "status", "createdAt");

CREATE INDEX "WitnessReport_tenantId_puestoId_mesa_status_createdAt_idx"
ON "WitnessReport"("tenantId", "puestoId", "mesa", "status", "createdAt");

CREATE INDEX "WitnessReport_tenantId_reviewerId_reviewedAt_idx"
ON "WitnessReport"("tenantId", "reviewerId", "reviewedAt");

CREATE INDEX "WitnessReport_tenantId_supersededById_idx"
ON "WitnessReport"("tenantId", "supersededById");

CREATE UNIQUE INDEX "WitnessReport_one_accepted_per_table_key"
ON "WitnessReport"("tenantId", "puestoId", "mesa")
WHERE "status" = 'ACCEPTED';

ALTER TABLE "WitnessReport"
ADD CONSTRAINT "WitnessReport_reviewerId_tenantId_fkey"
FOREIGN KEY ("reviewerId", "tenantId")
REFERENCES "User"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WitnessReport"
ADD CONSTRAINT "WitnessReport_supersededById_tenantId_fkey"
FOREIGN KEY ("supersededById", "tenantId")
REFERENCES "WitnessReport"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WitnessReport"
DROP CONSTRAINT "WitnessReport_vote_totals_check";

ALTER TABLE "WitnessReport"
ADD CONSTRAINT "WitnessReport_vote_totals_check"
CHECK (
  "mesa" > 0
  AND "candidateVotes" >= 0
  AND "totalTableVotes" >= 0
  AND "candidateVotes" <= "totalTableVotes"
);

ALTER TABLE "WitnessReport"
ADD CONSTRAINT "WitnessReport_four_eyes_check"
CHECK ("reviewerId" IS NULL OR "reviewerId" <> "witnessId");

ALTER TABLE "WitnessReport"
ADD CONSTRAINT "WitnessReport_review_state_check"
CHECK (
  (
    "status" = 'PENDING'
    AND "reviewerId" IS NULL
    AND "reviewReason" IS NULL
    AND "reviewedAt" IS NULL
    AND "supersededById" IS NULL
  )
  OR
  (
    "status" IN ('ACCEPTED', 'REJECTED')
    AND "reviewerId" IS NOT NULL
    AND "reviewReason" IS NOT NULL
    AND char_length(btrim("reviewReason")) BETWEEN 10 AND 1000
    AND "reviewedAt" IS NOT NULL
    AND "supersededById" IS NULL
  )
  OR
  (
    "status" = 'SUPERSEDED'
    AND "reviewerId" IS NOT NULL
    AND "reviewReason" IS NOT NULL
    AND char_length(btrim("reviewReason")) BETWEEN 10 AND 1000
    AND "reviewedAt" IS NOT NULL
    AND "supersededById" IS NOT NULL
  )
);

ALTER TABLE "PoliticalDivision"
ADD CONSTRAINT "PoliticalDivision_expected_tables_check"
CHECK (
  "expectedTables" IS NULL
  OR (
    "type" = 'PUESTO'
    AND "expectedTables" BETWEEN 1 AND 99999
  )
);
