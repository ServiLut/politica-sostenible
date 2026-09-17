-- Durable, tenant-scoped receipt support for encrypted offline campaign
-- incident reports. Existing VOTER/E14 contracts remain unchanged.

BEGIN;

-- PostgreSQL enum extension is intentionally incremental: never recreate an
-- enum already referenced by durable receipts.
ALTER TYPE "OfflineSyncOperationType" ADD VALUE 'INCIDENT_REPORT';

ALTER TABLE "IssueCase"
  ADD COLUMN "occurredOn" DATE;

ALTER TABLE "OfflineSyncReceipt"
  ADD COLUMN "payloadSha256" CHAR(64);

ALTER TABLE "OfflineSyncReceipt"
  ADD CONSTRAINT "OfflineSyncReceipt_payload_sha256_check" CHECK (
    "payloadSha256" IS NULL OR "payloadSha256" ~ '^[a-f0-9]{64}$'
  );

CREATE INDEX "IssueCase_tenantId_mode_occurredOn_idx"
  ON "IssueCase"("tenantId", "mode", "occurredOn");

-- A receipt is evidence that a queued mutation was accepted. It must never be
-- rewritten or removed by application roles after a client verifies it.
CREATE OR REPLACE FUNCTION "offline_sync_receipt_reject_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'OfflineSyncReceipt is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "OfflineSyncReceipt_no_update"
  BEFORE UPDATE ON "OfflineSyncReceipt"
  FOR EACH ROW EXECUTE FUNCTION "offline_sync_receipt_reject_mutation"();

CREATE TRIGGER "OfflineSyncReceipt_no_delete"
  BEFORE DELETE ON "OfflineSyncReceipt"
  FOR EACH ROW EXECUTE FUNCTION "offline_sync_receipt_reject_mutation"();

CREATE TRIGGER "OfflineSyncReceipt_no_truncate"
  BEFORE TRUNCATE ON "OfflineSyncReceipt"
  FOR EACH STATEMENT EXECUTE FUNCTION "offline_sync_receipt_reject_mutation"();

ALTER TABLE "OfflineSyncReceipt"
  ENABLE ALWAYS TRIGGER "OfflineSyncReceipt_no_update";
ALTER TABLE "OfflineSyncReceipt"
  ENABLE ALWAYS TRIGGER "OfflineSyncReceipt_no_delete";
ALTER TABLE "OfflineSyncReceipt"
  ENABLE ALWAYS TRIGGER "OfflineSyncReceipt_no_truncate";

COMMIT;
