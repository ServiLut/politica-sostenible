-- Exceptional termination is intentionally separate from the ordinary
-- POST_ELECTION -> CLOSED transition. Existing CLOSED profiles predate this
-- mechanism and are therefore classified as normal closures.
BEGIN;

CREATE TYPE "OperationClosureType" AS ENUM (
  'CLOSED_NORMAL',
  'CLOSED_EXCEPTIONAL'
);

CREATE TYPE "OperationTerminationStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TYPE "OperationTerminationCause" AS ENUM (
  'CANDIDACY_WITHDRAWAL',
  'REGISTRATION_DENIED',
  'REGISTRATION_REVOKED',
  'DISQUALIFICATION',
  'SIGNATURE_THRESHOLD_NOT_MET',
  'ENDORSEMENT_WITHDRAWN',
  'ELECTION_CANCELLED',
  'OTHER'
);

ALTER TABLE "OperationProfile"
  ADD COLUMN "closureType" "OperationClosureType",
  ADD COLUMN "terminatedAt" TIMESTAMP(3),
  ADD COLUMN "terminationCause" "OperationTerminationCause",
  ADD COLUMN "terminationRequestId" TEXT;

UPDATE "OperationProfile"
SET "closureType" = 'CLOSED_NORMAL'
WHERE "stage" = 'CLOSED';

CREATE TABLE "OperationTerminationRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "profileSnapshotSha256" CHAR(64) NOT NULL,
  "operationCycleSha256" CHAR(64) NOT NULL,
  "expectedProfileUpdatedAt" TIMESTAMP(3) NOT NULL,
  "status" "OperationTerminationStatus" NOT NULL,
  "cause" "OperationTerminationCause" NOT NULL,
  "otherCause" VARCHAR(300),
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "explanation" VARCHAR(6000) NOT NULL,
  "authorityName" VARCHAR(300) NOT NULL,
  "officialActType" VARCHAR(160) NOT NULL,
  "officialActReference" VARCHAR(300) NOT NULL,
  "officialActIssuedAt" TIMESTAMP(3) NOT NULL,
  "evidenceReference" VARCHAR(2048) NOT NULL,
  "evidenceSha256" CHAR(64) NOT NULL,
  "consequencesAcknowledged" BOOLEAN NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "expiredAt" TIMESTAMP(3),
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewClientRequestId" UUID,
  "reviewPayloadSha256" CHAR(64),
  "rejectionReason" VARCHAR(2000),
  "communicationsCancelledCount" INTEGER,
  "cancelledById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationClientRequestId" UUID,
  "cancellationPayloadSha256" CHAR(64),
  "cancellationReason" VARCHAR(2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationTerminationRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OperationTerminationRequest"
  ADD CONSTRAINT "OperationTerminationRequest_id_tenantId_key"
    UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "OperationTerminationRequest_tenant_client_key"
    UNIQUE ("tenantId", "clientRequestId"),
  ADD CONSTRAINT "OperationTerminationRequest_tenant_review_client_key"
    UNIQUE ("tenantId", "reviewClientRequestId"),
  ADD CONSTRAINT "OperationTerminationRequest_tenant_cancel_client_key"
    UNIQUE ("tenantId", "cancellationClientRequestId");

CREATE UNIQUE INDEX "OperationProfile_termination_request_tenant_key"
  ON "OperationProfile"("terminationRequestId", "tenantId");
CREATE INDEX "OperationProfile_tenant_closure_terminated_idx"
  ON "OperationProfile"("tenantId", "closureType", "terminatedAt");
CREATE INDEX "OperationTerminationRequest_tenant_profile_status_idx"
  ON "OperationTerminationRequest"("tenantId", "operationProfileId", "status", "createdAt");
CREATE INDEX "OperationTerminationRequest_tenant_status_expires_idx"
  ON "OperationTerminationRequest"("tenantId", "status", "expiresAt");
CREATE INDEX "OperationTerminationRequest_tenant_requester_idx"
  ON "OperationTerminationRequest"("tenantId", "requestedById", "createdAt");
CREATE INDEX "OperationTerminationRequest_tenant_reviewer_idx"
  ON "OperationTerminationRequest"("tenantId", "reviewedById", "reviewedAt");
CREATE INDEX "OperationTerminationRequest_tenant_canceller_idx"
  ON "OperationTerminationRequest"("tenantId", "cancelledById", "cancelledAt");
CREATE UNIQUE INDEX "OperationTerminationRequest_one_pending_per_profile"
  ON "OperationTerminationRequest"("tenantId", "operationProfileId")
  WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "OperationTerminationRequest_one_approved_per_profile"
  ON "OperationTerminationRequest"("tenantId", "operationProfileId")
  WHERE "status" = 'APPROVED';

ALTER TABLE "OperationTerminationRequest"
  ADD CONSTRAINT "OperationTerminationRequest_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OperationTerminationRequest_profile_fkey"
    FOREIGN KEY ("operationProfileId", "tenantId")
    REFERENCES "OperationProfile"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OperationTerminationRequest_requester_fkey"
    FOREIGN KEY ("requestedById", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OperationTerminationRequest_reviewer_fkey"
    FOREIGN KEY ("reviewedById", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "OperationTerminationRequest_canceller_fkey"
    FOREIGN KEY ("cancelledById", "tenantId")
    REFERENCES "User"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationProfile"
  ADD CONSTRAINT "OperationProfile_termination_request_fkey"
    FOREIGN KEY ("terminationRequestId", "tenantId")
    REFERENCES "OperationTerminationRequest"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "OperationTerminationRequest"
  ADD CONSTRAINT "OperationTerminationRequest_hashes_check" CHECK (
    "payloadSha256" ~ '^[0-9a-f]{64}$'
    AND "profileSnapshotSha256" ~ '^[0-9a-f]{64}$'
    AND "operationCycleSha256" ~ '^[0-9a-f]{64}$'
    AND "evidenceSha256" ~ '^[0-9a-f]{64}$'
    AND ("reviewPayloadSha256" IS NULL OR "reviewPayloadSha256" ~ '^[0-9a-f]{64}$')
    AND ("cancellationPayloadSha256" IS NULL OR "cancellationPayloadSha256" ~ '^[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "OperationTerminationRequest_payload_check" CHECK (
    length(btrim("explanation")) >= 120
    AND length(btrim("authorityName")) >= 3
    AND length(btrim("officialActType")) >= 3
    AND length(btrim("officialActReference")) >= 3
    AND "consequencesAcknowledged" = true
    AND "effectiveAt" <= "createdAt"
    AND "officialActIssuedAt" <= "createdAt"
    AND "expiresAt" > "createdAt"
  ),
  ADD CONSTRAINT "OperationTerminationRequest_cause_check" CHECK (
    ("cause" = 'OTHER' AND length(btrim("otherCause")) >= 50)
    OR ("cause" <> 'OTHER' AND "otherCause" IS NULL)
  ),
  ADD CONSTRAINT "OperationTerminationRequest_evidence_https_check" CHECK (
    "evidenceReference" ~ '^https://[^/@:[:space:]]+(?::[0-9]{1,5})?(?:[/?#]|$)'
    AND "evidenceReference" !~ '[[:space:]]'
    AND "evidenceReference" !~ '^https://[^/]*@'
  ),
  ADD CONSTRAINT "OperationTerminationRequest_lifecycle_check" CHECK (
    (
      "status" = 'PENDING'
      AND "expiredAt" IS NULL
      AND "reviewedById" IS NULL AND "reviewedAt" IS NULL
      AND "reviewClientRequestId" IS NULL AND "reviewPayloadSha256" IS NULL
      AND "rejectionReason" IS NULL
      AND "communicationsCancelledCount" IS NULL
      AND "cancelledById" IS NULL AND "cancelledAt" IS NULL
      AND "cancellationClientRequestId" IS NULL
      AND "cancellationPayloadSha256" IS NULL
      AND "cancellationReason" IS NULL
    ) OR (
      "status" = 'APPROVED'
      AND "expiredAt" IS NULL
      AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "reviewClientRequestId" IS NOT NULL AND "reviewPayloadSha256" IS NOT NULL
      AND "reviewedById" <> "requestedById"
      AND "reviewedAt" < "expiresAt"
      AND "rejectionReason" IS NULL
      AND "communicationsCancelledCount" IS NOT NULL
      AND "communicationsCancelledCount" >= 0
      AND "cancelledById" IS NULL AND "cancelledAt" IS NULL
      AND "cancellationClientRequestId" IS NULL
      AND "cancellationPayloadSha256" IS NULL
      AND "cancellationReason" IS NULL
    ) OR (
      "status" = 'REJECTED'
      AND "expiredAt" IS NULL
      AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "reviewClientRequestId" IS NOT NULL AND "reviewPayloadSha256" IS NOT NULL
      AND "reviewedById" <> "requestedById"
      AND "reviewedAt" < "expiresAt"
      AND length(btrim("rejectionReason")) >= 20
      AND "communicationsCancelledCount" IS NULL
      AND "cancelledById" IS NULL AND "cancelledAt" IS NULL
      AND "cancellationClientRequestId" IS NULL
      AND "cancellationPayloadSha256" IS NULL
      AND "cancellationReason" IS NULL
    ) OR (
      "status" = 'EXPIRED'
      AND "expiredAt" IS NOT NULL AND "expiredAt" >= "expiresAt"
      AND "reviewedById" IS NULL AND "reviewedAt" IS NULL
      AND "reviewClientRequestId" IS NULL AND "reviewPayloadSha256" IS NULL
      AND "rejectionReason" IS NULL
      AND "communicationsCancelledCount" IS NULL
      AND "cancelledById" IS NULL AND "cancelledAt" IS NULL
      AND "cancellationClientRequestId" IS NULL
      AND "cancellationPayloadSha256" IS NULL
      AND "cancellationReason" IS NULL
    ) OR (
      "status" = 'CANCELLED'
      AND "expiredAt" IS NULL
      AND "reviewedById" IS NULL AND "reviewedAt" IS NULL
      AND "reviewClientRequestId" IS NULL AND "reviewPayloadSha256" IS NULL
      AND "rejectionReason" IS NULL
      AND "communicationsCancelledCount" IS NULL
      AND "cancelledById" IS NOT NULL AND "cancelledAt" IS NOT NULL
      AND "cancellationClientRequestId" IS NOT NULL
      AND "cancellationPayloadSha256" IS NOT NULL
      AND length(btrim("cancellationReason")) >= 20
      AND "cancelledAt" < "expiresAt"
    )
  );

ALTER TABLE "OperationProfile"
  ADD CONSTRAINT "OperationProfile_closure_metadata_check" CHECK (
    (
      "stage" <> 'CLOSED'
      AND "closureType" IS NULL
      AND "terminatedAt" IS NULL
      AND "terminationCause" IS NULL
      AND "terminationRequestId" IS NULL
    ) OR (
      "stage" = 'CLOSED'
      AND "closureType" = 'CLOSED_NORMAL'
      AND "terminatedAt" IS NULL
      AND "terminationCause" IS NULL
      AND "terminationRequestId" IS NULL
    ) OR (
      "stage" = 'CLOSED'
      AND "closureType" = 'CLOSED_EXCEPTIONAL'
      AND "terminatedAt" IS NOT NULL
      AND "terminationCause" IS NOT NULL
      AND "terminationRequestId" IS NOT NULL
    )
  );

CREATE FUNCTION enforce_operation_termination_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'OperationTerminationRequest terminal rows are immutable';
  END IF;
  IF NEW."status" NOT IN ('APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED') THEN
    RAISE EXCEPTION 'OperationTerminationRequest invalid state transition';
  END IF;
  IF ROW(
    NEW."id", NEW."tenantId", NEW."operationProfileId",
    NEW."clientRequestId", NEW."payloadSha256",
    NEW."profileSnapshotSha256", NEW."operationCycleSha256",
    NEW."expectedProfileUpdatedAt", NEW."cause", NEW."otherCause",
    NEW."effectiveAt", NEW."explanation", NEW."authorityName",
    NEW."officialActType", NEW."officialActReference",
    NEW."officialActIssuedAt", NEW."evidenceReference",
    NEW."evidenceSha256", NEW."consequencesAcknowledged",
    NEW."expiresAt", NEW."requestedById", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."tenantId", OLD."operationProfileId",
    OLD."clientRequestId", OLD."payloadSha256",
    OLD."profileSnapshotSha256", OLD."operationCycleSha256",
    OLD."expectedProfileUpdatedAt", OLD."cause", OLD."otherCause",
    OLD."effectiveAt", OLD."explanation", OLD."authorityName",
    OLD."officialActType", OLD."officialActReference",
    OLD."officialActIssuedAt", OLD."evidenceReference",
    OLD."evidenceSha256", OLD."consequencesAcknowledged",
    OLD."expiresAt", OLD."requestedById", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'OperationTerminationRequest payload is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION guard_operation_termination_open_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "OperationProfile" profile
    WHERE profile."id" = NEW."operationProfileId"
      AND profile."tenantId" = NEW."tenantId"
      AND profile."stage" <> 'CLOSED'
      AND profile."closureType" IS NULL
      AND profile."updatedAt" = NEW."expectedProfileUpdatedAt"
  ) THEN
    RAISE EXCEPTION 'Termination requests require the exact current open profile';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "OperationTerminationRequest_requires_open_profile"
BEFORE INSERT ON "OperationTerminationRequest"
FOR EACH ROW EXECUTE FUNCTION guard_operation_termination_open_profile();

CREATE TRIGGER "OperationTerminationRequest_lifecycle_only_update"
BEFORE UPDATE ON "OperationTerminationRequest"
FOR EACH ROW EXECUTE FUNCTION enforce_operation_termination_update();

CREATE FUNCTION prevent_operation_termination_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'OperationTerminationRequest is append-only and cannot be deleted';
END;
$$;

CREATE TRIGGER "OperationTerminationRequest_prevent_delete"
BEFORE DELETE ON "OperationTerminationRequest"
FOR EACH ROW EXECUTE FUNCTION prevent_operation_termination_delete();

CREATE TRIGGER "OperationTerminationRequest_prevent_truncate"
BEFORE TRUNCATE ON "OperationTerminationRequest"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_operation_termination_delete();

CREATE FUNCTION prevent_closed_operation_profile_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."stage" = 'CLOSED' THEN
    RAISE EXCEPTION 'A CLOSED operation profile is immutable and cannot be reopened';
  END IF;
  IF OLD."closureType" IS NOT NULL
    OR OLD."terminatedAt" IS NOT NULL
    OR OLD."terminationCause" IS NOT NULL
    OR OLD."terminationRequestId" IS NOT NULL THEN
    RAISE EXCEPTION 'Operation closure classification is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "OperationProfile_prevent_closed_mutation"
BEFORE UPDATE ON "OperationProfile"
FOR EACH ROW EXECUTE FUNCTION prevent_closed_operation_profile_mutation();

CREATE FUNCTION validate_operation_profile_exceptional_closure()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."closureType" = 'CLOSED_EXCEPTIONAL' AND NOT EXISTS (
    SELECT 1
    FROM "OperationTerminationRequest" request
    WHERE request."id" = NEW."terminationRequestId"
      AND request."tenantId" = NEW."tenantId"
      AND request."operationProfileId" = NEW."id"
      AND request."status" = 'APPROVED'
      AND request."cause" = NEW."terminationCause"
      AND request."effectiveAt" = NEW."terminatedAt"
  ) THEN
    RAISE EXCEPTION 'Exceptional closure requires its matching approved request';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "OperationProfile_exceptional_closure_matches_request"
AFTER INSERT OR UPDATE ON "OperationProfile"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_operation_profile_exceptional_closure();

CREATE FUNCTION validate_approved_operation_termination()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'APPROVED' AND NOT EXISTS (
    SELECT 1
    FROM "OperationProfile" profile
    WHERE profile."id" = NEW."operationProfileId"
      AND profile."tenantId" = NEW."tenantId"
      AND profile."stage" = 'CLOSED'
      AND profile."closureType" = 'CLOSED_EXCEPTIONAL'
      AND profile."terminationRequestId" = NEW."id"
      AND profile."terminationCause" = NEW."cause"
      AND profile."terminatedAt" = NEW."effectiveAt"
  ) THEN
    RAISE EXCEPTION 'Approved termination requires its matching exceptional closure';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "OperationTerminationRequest_approval_matches_profile"
AFTER INSERT OR UPDATE ON "OperationTerminationRequest"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_approved_operation_termination();

ALTER TABLE "OperationTerminationRequest" ENABLE ALWAYS TRIGGER "OperationTerminationRequest_lifecycle_only_update";
ALTER TABLE "OperationTerminationRequest" ENABLE ALWAYS TRIGGER "OperationTerminationRequest_requires_open_profile";
ALTER TABLE "OperationTerminationRequest" ENABLE ALWAYS TRIGGER "OperationTerminationRequest_prevent_delete";
ALTER TABLE "OperationTerminationRequest" ENABLE ALWAYS TRIGGER "OperationTerminationRequest_prevent_truncate";
ALTER TABLE "OperationProfile" ENABLE ALWAYS TRIGGER "OperationProfile_prevent_closed_mutation";
ALTER TABLE "OperationProfile" ENABLE ALWAYS TRIGGER "OperationProfile_exceptional_closure_matches_request";
ALTER TABLE "OperationTerminationRequest" ENABLE ALWAYS TRIGGER "OperationTerminationRequest_approval_matches_profile";

COMMIT;
