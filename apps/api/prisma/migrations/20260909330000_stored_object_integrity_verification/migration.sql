-- Independently verify bytes after the browser uploads directly to private
-- Storage. NestJS receives identifiers only; the background worker streams the
-- object and records a bounded SHA-256 verification result per tenant.
BEGIN;

CREATE TYPE "StorageIntegrityStatus" AS ENUM (
  'NOT_PROVIDED',
  'PENDING',
  'VERIFIED',
  'FAILED'
);

ALTER TABLE "StoredObject"
  ADD COLUMN "integrityStatus" "StorageIntegrityStatus" NOT NULL DEFAULT 'NOT_PROVIDED',
  ADD COLUMN "calculatedSha256" CHAR(64),
  ADD COLUMN "observedSize" INTEGER,
  ADD COLUMN "observedContentType" VARCHAR(150),
  ADD COLUMN "integrityCheckedAt" TIMESTAMP(3),
  ADD COLUMN "integrityVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "integrityFailureCode" VARCHAR(64),
  ADD COLUMN "integrityVerificationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "integrityVerificationStartedAt" TIMESTAMP(3),
  ADD COLUMN "integrityVerificationLeaseId" UUID;

-- Existing confirmed/consumed rows carrying a client-declared digest are not
-- grandfathered as verified. Recovery will enqueue and independently check
-- them before future protected consumption/download/signing.
UPDATE "StoredObject"
SET "integrityStatus" = 'PENDING'
WHERE "expectedSha256" IS NOT NULL
  AND "reportedSha256" = "expectedSha256"
  AND "status" IN ('CONFIRMED', 'CONSUMED');

ALTER TABLE "StoredObject"
  ADD CONSTRAINT "StoredObject_calculatedSha256_format_check"
    CHECK (
      "calculatedSha256" IS NULL
      OR "calculatedSha256" ~ '^[0-9a-f]{64}$'
    ),
  ADD CONSTRAINT "StoredObject_integrity_attempts_check"
    CHECK ("integrityVerificationAttempts" >= 0),
  ADD CONSTRAINT "StoredObject_observed_size_check"
    CHECK ("observedSize" IS NULL OR "observedSize" > 0),
  ADD CONSTRAINT "StoredObject_integrity_failure_code_check"
    CHECK (
      "integrityFailureCode" IS NULL
      OR "integrityFailureCode" IN (
        'SHA256_MISMATCH',
        'SIZE_MISMATCH',
        'TRUNCATED_DOWNLOAD',
        'CONTENT_TYPE_MISMATCH',
        'CONTENT_SIGNATURE_MISMATCH',
        'CONTENT_ENCODING_UNSUPPORTED',
        'OBJECT_NOT_FOUND',
        'STORAGE_UNAVAILABLE',
        'DOWNLOAD_TIMEOUT',
        'DOWNLOAD_HTTP_ERROR',
        'INVALID_RECORD',
        'INTERNAL_ERROR'
      )
    ),
  ADD CONSTRAINT "StoredObject_integrity_state_check"
    CHECK (
      (
        "integrityStatus" = 'NOT_PROVIDED'
        AND "calculatedSha256" IS NULL
        AND "observedSize" IS NULL
        AND "observedContentType" IS NULL
        AND "integrityCheckedAt" IS NULL
        AND "integrityVerifiedAt" IS NULL
        AND "integrityFailureCode" IS NULL
        AND "integrityVerificationStartedAt" IS NULL
        AND "integrityVerificationLeaseId" IS NULL
      )
      OR
      (
        "integrityStatus" = 'PENDING'
        AND "expectedSha256" IS NOT NULL
        AND "reportedSha256" = "expectedSha256"
        AND "status" IN ('CONFIRMED', 'CONSUMED')
        AND "calculatedSha256" IS NULL
        AND "observedSize" IS NULL
        AND "observedContentType" IS NULL
        AND "integrityCheckedAt" IS NULL
        AND "integrityVerifiedAt" IS NULL
        AND (
          ("integrityVerificationStartedAt" IS NULL AND "integrityVerificationLeaseId" IS NULL)
          OR
          ("integrityVerificationStartedAt" IS NOT NULL AND "integrityVerificationLeaseId" IS NOT NULL)
        )
      )
      OR
      (
        "integrityStatus" = 'VERIFIED'
        AND "expectedSha256" IS NOT NULL
        AND "reportedSha256" = "expectedSha256"
        AND "calculatedSha256" = "expectedSha256"
        AND "observedSize" = "expectedSize"
        AND "observedContentType" = lower("contentType")
        AND "integrityCheckedAt" IS NOT NULL
        AND "integrityVerifiedAt" = "integrityCheckedAt"
        AND "integrityFailureCode" IS NULL
        AND "integrityVerificationStartedAt" IS NULL
        AND "integrityVerificationLeaseId" IS NULL
      )
      OR
      (
        "integrityStatus" = 'FAILED'
        AND "expectedSha256" IS NOT NULL
        AND "reportedSha256" = "expectedSha256"
        AND "integrityCheckedAt" IS NOT NULL
        AND "integrityVerifiedAt" IS NULL
        AND "integrityFailureCode" IS NOT NULL
        AND "integrityVerificationStartedAt" IS NULL
        AND "integrityVerificationLeaseId" IS NULL
      )
    );

CREATE INDEX "StoredObject_tenant_integrity_started_idx"
  ON "StoredObject"("tenantId", "integrityStatus", "integrityVerificationStartedAt");

CREATE INDEX "StoredObject_tenant_integrity_created_id_idx"
  ON "StoredObject"("tenantId", "integrityStatus", "createdAt", "id");

CREATE INDEX "StoredObject_tenant_uploader_id_idx"
  ON "StoredObject"("tenantId", "uploaderId", "id");

CREATE FUNCTION "stored_object_integrity_guard"()
RETURNS trigger AS $$
BEGIN
  IF NEW."module" IN (
       'FINANCE', 'E14', 'SCRUTINY', 'ELECTORAL_CALENDAR',
       'SIGNATURE_COLLECTION', 'PQRSD'
     )
     AND NEW."status" IN ('CONFIRMED', 'CONSUMED')
     AND NEW."expectedSha256" IS NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD."status" IS DISTINCT FROM NEW."status"
     ) THEN
    RAISE EXCEPTION 'Evidence StoredObjects require a digest before confirmation or consumption'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'CONSUMED'
     AND NEW."expectedSha256" IS NOT NULL
     AND NEW."integrityStatus" <> 'VERIFIED'
     AND (TG_OP = 'INSERT' OR OLD."status" IS DISTINCT FROM 'CONSUMED') THEN
    RAISE EXCEPTION 'A digest-bound StoredObject cannot be consumed before independent byte verification'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."integrityStatus" = 'VERIFIED'
     AND ROW(
       NEW."integrityStatus", NEW."calculatedSha256", NEW."observedSize",
       NEW."observedContentType", NEW."integrityCheckedAt",
       NEW."integrityVerifiedAt", NEW."integrityFailureCode"
     ) IS DISTINCT FROM ROW(
       OLD."integrityStatus", OLD."calculatedSha256", OLD."observedSize",
       OLD."observedContentType", OLD."integrityCheckedAt",
       OLD."integrityVerifiedAt", OLD."integrityFailureCode"
     ) THEN
    RAISE EXCEPTION 'A verified StoredObject integrity result is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StoredObject_integrity_guard"
  BEFORE INSERT OR UPDATE ON "StoredObject"
  FOR EACH ROW EXECUTE FUNCTION "stored_object_integrity_guard"();
ALTER TABLE "StoredObject" ENABLE ALWAYS TRIGGER "StoredObject_integrity_guard";

COMMIT;
