-- Extend the legacy event record into a tenant- and mode-scoped operational agenda.
CREATE TYPE "CampaignEventStatus" AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE "CampaignEvent"
  ADD COLUMN "mode" "PoliticalOperationMode",
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "status" "CampaignEventStatus" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "capacity" INTEGER,
  ADD COLUMN "responsibleId" TEXT;

UPDATE "CampaignEvent" AS event
SET
  "mode" = tenant."defaultMode",
  "endsAt" = event."date" + INTERVAL '1 hour'
FROM "Tenant" AS tenant
WHERE event."tenantId" = tenant."id";

ALTER TABLE "CampaignEvent"
  ALTER COLUMN "mode" SET NOT NULL,
  ALTER COLUMN "endsAt" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "CampaignEvent"
  ADD CONSTRAINT "CampaignEvent_time_order_check"
    CHECK ("endsAt" > "date"),
  ADD CONSTRAINT "CampaignEvent_capacity_check"
    CHECK ("capacity" IS NULL OR "capacity" > 0),
  ADD CONSTRAINT "CampaignEvent_responsibleId_tenantId_fkey"
    FOREIGN KEY ("responsibleId", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

DROP INDEX IF EXISTS "CampaignEvent_tenantId_date_idx";

CREATE INDEX "CampaignEvent_tenantId_mode_date_idx"
  ON "CampaignEvent"("tenantId", "mode", "date");
CREATE INDEX "CampaignEvent_tenantId_mode_status_date_idx"
  ON "CampaignEvent"("tenantId", "mode", "status", "date");
CREATE INDEX "CampaignEvent_tenantId_responsibleId_date_idx"
  ON "CampaignEvent"("tenantId", "responsibleId", "date");
