-- E-14 captures from exercises must never contaminate real electoral results.
-- Existing data cannot be inferred safely, so it is explicitly quarantined.
BEGIN;

CREATE TYPE "WitnessCaptureContext" AS ENUM (
  'SIMULATION',
  'REAL',
  'LEGACY_UNCLASSIFIED'
);

ALTER TABLE "WitnessReport"
ADD COLUMN "captureContext" "WitnessCaptureContext";

UPDATE "WitnessReport"
SET "captureContext" = 'LEGACY_UNCLASSIFIED'
WHERE "captureContext" IS NULL;

ALTER TABLE "WitnessReport"
ALTER COLUMN "captureContext" SET NOT NULL;

-- A simulated and a real accepted reading may coexist for the same table.
DROP INDEX "WitnessReport_one_accepted_per_table_key";

CREATE UNIQUE INDEX "WitnessReport_one_accepted_per_context_table_key"
ON "WitnessReport"("tenantId", "captureContext", "puestoId", "mesa")
WHERE "status" = 'ACCEPTED';

CREATE INDEX "WitnessReport_tenant_context_status_created_idx"
ON "WitnessReport"("tenantId", "captureContext", "status", "createdAt");

CREATE INDEX "WitnessReport_tenant_context_table_status_created_idx"
ON "WitnessReport"(
  "tenantId",
  "captureContext",
  "puestoId",
  "mesa",
  "status",
  "createdAt"
);

-- The composite relation prevents a report from superseding an act from a
-- different context, even if application code regresses.
CREATE UNIQUE INDEX "WitnessReport_id_tenantId_captureContext_key"
ON "WitnessReport"("id", "tenantId", "captureContext");

ALTER TABLE "WitnessReport"
DROP CONSTRAINT "WitnessReport_supersededById_tenantId_fkey";

ALTER TABLE "WitnessReport"
ADD CONSTRAINT "WitnessReport_supersededById_tenantId_captureContext_fkey"
FOREIGN KEY ("supersededById", "tenantId", "captureContext")
REFERENCES "WitnessReport"("id", "tenantId", "captureContext")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Capture context is historical provenance. There is no supported update,
-- including SIMULATION -> REAL promotion.
CREATE FUNCTION "prevent_witness_capture_context_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."captureContext" IS DISTINCT FROM OLD."captureContext" THEN
    RAISE EXCEPTION 'WitnessReport.captureContext is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "WitnessReport_captureContext_immutable"
BEFORE UPDATE OF "captureContext" ON "WitnessReport"
FOR EACH ROW
EXECUTE FUNCTION "prevent_witness_capture_context_change"();

COMMIT;
