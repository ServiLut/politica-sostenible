BEGIN;

-- Non-destructive post-election retention governance. This migration only
-- creates decision records and preservation holds; it contains no purge path.
CREATE TYPE "RetentionDispositionStatus" AS ENUM (
  'PENDING',
  'APPROVED_NOT_EXECUTED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "RetentionDataScope" AS ENUM (
  'DATA_SUBJECT_RECORDS',
  'COMMUNICATION_INTERACTIONS',
  'STORED_OBJECTS',
  'FINANCIAL_RECORDS',
  'ELECTORAL_EVIDENCE',
  'AUDIT_TRAIL',
  'ALL_TENANT_RECORDS'
);

CREATE TABLE "RetentionDispositionRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "previewSha256" CHAR(64) NOT NULL,
  "profileSnapshotSha256" CHAR(64) NOT NULL,
  "expectedProfileUpdatedAt" TIMESTAMP(3) NOT NULL,
  "status" "RetentionDispositionStatus" NOT NULL,
  "scope" "RetentionDataScope" NOT NULL,
  "cutoffAt" TIMESTAMP(3) NOT NULL,
  "retentionDueAt" TIMESTAMP(3) NOT NULL,
  "previewSnapshot" JSONB NOT NULL,
  "justification" VARCHAR(6000) NOT NULL,
  "legalReference" VARCHAR(2000) NOT NULL,
  "evidenceReference" VARCHAR(2048) NOT NULL,
  "evidenceSha256" CHAR(64) NOT NULL,
  "legalPolicyRequiredAcknowledged" BOOLEAN NOT NULL,
  "backupRestoreRequiredAcknowledged" BOOLEAN NOT NULL,
  "executorUnavailableAcknowledged" BOOLEAN NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewClientRequestId" UUID,
  "reviewPayloadSha256" CHAR(64),
  "rejectionReason" VARCHAR(2000),
  "cancelledById" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationClientRequestId" UUID,
  "cancellationPayloadSha256" CHAR(64),
  "cancellationReason" VARCHAR(2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionDispositionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetentionLegalHold" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "scope" "RetentionDataScope" NOT NULL,
  "reason" VARCHAR(6000) NOT NULL,
  "legalAuthority" VARCHAR(300) NOT NULL,
  "legalReference" VARCHAR(2000) NOT NULL,
  "evidenceReference" VARCHAR(2048) NOT NULL,
  "evidenceSha256" CHAR(64) NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RetentionLegalHold_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetentionLegalHoldRevocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "legalHoldId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "reason" VARCHAR(6000) NOT NULL,
  "legalAuthority" VARCHAR(300) NOT NULL,
  "legalReference" VARCHAR(2000) NOT NULL,
  "evidenceReference" VARCHAR(2048) NOT NULL,
  "evidenceSha256" CHAR(64) NOT NULL,
  "revokedById" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RetentionLegalHoldRevocation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RetentionDispositionRequest"
  ADD CONSTRAINT "RetentionDispositionRequest_id_tenantId_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "RetentionDispositionRequest_tenant_client_key" UNIQUE ("tenantId", "clientRequestId"),
  ADD CONSTRAINT "RetentionDispositionRequest_tenant_review_client_key" UNIQUE ("tenantId", "reviewClientRequestId"),
  ADD CONSTRAINT "RetentionDispositionRequest_tenant_cancel_client_key" UNIQUE ("tenantId", "cancellationClientRequestId");

ALTER TABLE "RetentionLegalHold"
  ADD CONSTRAINT "RetentionLegalHold_id_tenantId_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "RetentionLegalHold_tenant_client_key" UNIQUE ("tenantId", "clientRequestId");

ALTER TABLE "RetentionLegalHoldRevocation"
  ADD CONSTRAINT "RetentionLegalHoldRevocation_id_tenantId_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "RetentionLegalHoldRevocation_hold_tenant_key" UNIQUE ("legalHoldId", "tenantId"),
  ADD CONSTRAINT "RetentionLegalHoldRevocation_tenant_client_key" UNIQUE ("tenantId", "clientRequestId");

CREATE INDEX "RetentionDispositionRequest_tenant_profile_status_idx"
  ON "RetentionDispositionRequest"("tenantId", "operationProfileId", "status", "createdAt");
CREATE INDEX "RetentionDispositionRequest_tenant_scope_cutoff_idx"
  ON "RetentionDispositionRequest"("tenantId", "scope", "cutoffAt");
CREATE INDEX "RetentionDispositionRequest_tenant_requester_idx"
  ON "RetentionDispositionRequest"("tenantId", "requestedById", "createdAt");
CREATE INDEX "RetentionDispositionRequest_tenant_reviewer_idx"
  ON "RetentionDispositionRequest"("tenantId", "reviewedById", "reviewedAt");
CREATE UNIQUE INDEX "RetentionDispositionRequest_one_pending_per_scope"
  ON "RetentionDispositionRequest"("tenantId", "operationProfileId", "scope")
  WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "RetentionDispositionRequest_one_approved_unexecuted_per_scope"
  ON "RetentionDispositionRequest"("tenantId", "operationProfileId", "scope")
  WHERE "status" = 'APPROVED_NOT_EXECUTED';

CREATE INDEX "RetentionLegalHold_tenant_profile_scope_idx"
  ON "RetentionLegalHold"("tenantId", "operationProfileId", "scope", "effectiveAt");
CREATE INDEX "RetentionLegalHold_tenant_creator_idx"
  ON "RetentionLegalHold"("tenantId", "createdById", "createdAt");
CREATE INDEX "RetentionLegalHoldRevocation_tenant_actor_idx"
  ON "RetentionLegalHoldRevocation"("tenantId", "revokedById", "revokedAt");

ALTER TABLE "RetentionDispositionRequest"
  ADD CONSTRAINT "RetentionDispositionRequest_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RetentionDispositionRequest_profile_fkey"
    FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RetentionDispositionRequest_requester_fkey"
    FOREIGN KEY ("requestedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RetentionDispositionRequest_reviewer_fkey"
    FOREIGN KEY ("reviewedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RetentionDispositionRequest_canceller_fkey"
    FOREIGN KEY ("cancelledById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RetentionLegalHold"
  ADD CONSTRAINT "RetentionLegalHold_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RetentionLegalHold_profile_fkey"
    FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RetentionLegalHold_creator_fkey"
    FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RetentionLegalHoldRevocation"
  ADD CONSTRAINT "RetentionLegalHoldRevocation_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RetentionLegalHoldRevocation_hold_fkey"
    FOREIGN KEY ("legalHoldId", "tenantId") REFERENCES "RetentionLegalHold"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RetentionLegalHoldRevocation_actor_fkey"
    FOREIGN KEY ("revokedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RetentionDispositionRequest"
  ADD CONSTRAINT "RetentionDispositionRequest_hashes_check" CHECK (
    "payloadSha256" ~ '^[0-9a-f]{64}$'
    AND "previewSha256" ~ '^[0-9a-f]{64}$'
    AND "profileSnapshotSha256" ~ '^[0-9a-f]{64}$'
    AND "evidenceSha256" ~ '^[0-9a-f]{64}$'
    AND ("reviewPayloadSha256" IS NULL OR "reviewPayloadSha256" ~ '^[0-9a-f]{64}$')
    AND ("cancellationPayloadSha256" IS NULL OR "cancellationPayloadSha256" ~ '^[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "RetentionDispositionRequest_payload_check" CHECK (
    length(btrim("justification")) >= 100
    AND length(btrim("legalReference")) >= 10
    AND "cutoffAt" >= "retentionDueAt"
    AND jsonb_typeof("previewSnapshot") = 'object'
    AND "legalPolicyRequiredAcknowledged" = true
    AND "backupRestoreRequiredAcknowledged" = true
    AND "executorUnavailableAcknowledged" = true
  ),
  ADD CONSTRAINT "RetentionDispositionRequest_evidence_https_check" CHECK (
    "evidenceReference" ~ '^https://[^/@:[:space:]]+(?::[0-9]{1,5})?(?:[/?#]|$)'
    AND "evidenceReference" !~ '[[:space:]]'
    AND "evidenceReference" !~ '^https://[^/]*@'
  ),
  ADD CONSTRAINT "RetentionDispositionRequest_lifecycle_check" CHECK (
    (
      "status" = 'PENDING'
      AND "reviewedById" IS NULL AND "reviewedAt" IS NULL
      AND "reviewClientRequestId" IS NULL AND "reviewPayloadSha256" IS NULL
      AND "rejectionReason" IS NULL
      AND "cancelledById" IS NULL AND "cancelledAt" IS NULL
      AND "cancellationClientRequestId" IS NULL
      AND "cancellationPayloadSha256" IS NULL
      AND "cancellationReason" IS NULL
    ) OR (
      "status" = 'APPROVED_NOT_EXECUTED'
      AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "reviewClientRequestId" IS NOT NULL AND "reviewPayloadSha256" IS NOT NULL
      AND "reviewedById" <> "requestedById"
      AND "rejectionReason" IS NULL
      AND "cancelledById" IS NULL AND "cancelledAt" IS NULL
      AND "cancellationClientRequestId" IS NULL
      AND "cancellationPayloadSha256" IS NULL
      AND "cancellationReason" IS NULL
    ) OR (
      "status" = 'REJECTED'
      AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "reviewClientRequestId" IS NOT NULL AND "reviewPayloadSha256" IS NOT NULL
      AND "reviewedById" <> "requestedById"
      AND length(btrim("rejectionReason")) >= 20
      AND "cancelledById" IS NULL AND "cancelledAt" IS NULL
      AND "cancellationClientRequestId" IS NULL
      AND "cancellationPayloadSha256" IS NULL
      AND "cancellationReason" IS NULL
    ) OR (
      "status" = 'CANCELLED'
      AND "reviewedById" IS NULL AND "reviewedAt" IS NULL
      AND "reviewClientRequestId" IS NULL AND "reviewPayloadSha256" IS NULL
      AND "rejectionReason" IS NULL
      AND "cancelledById" = "requestedById" AND "cancelledAt" IS NOT NULL
      AND "cancellationClientRequestId" IS NOT NULL
      AND "cancellationPayloadSha256" IS NOT NULL
      AND length(btrim("cancellationReason")) >= 20
    )
  );

ALTER TABLE "RetentionLegalHold"
  ADD CONSTRAINT "RetentionLegalHold_hashes_check" CHECK (
    "payloadSha256" ~ '^[0-9a-f]{64}$'
    AND "evidenceSha256" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "RetentionLegalHold_payload_check" CHECK (
    length(btrim("reason")) >= 50
    AND length(btrim("legalAuthority")) >= 3
    AND length(btrim("legalReference")) >= 10
    AND "effectiveAt" <= "createdAt"
  ),
  ADD CONSTRAINT "RetentionLegalHold_evidence_https_check" CHECK (
    "evidenceReference" ~ '^https://[^/@:[:space:]]+(?::[0-9]{1,5})?(?:[/?#]|$)'
    AND "evidenceReference" !~ '[[:space:]]'
    AND "evidenceReference" !~ '^https://[^/]*@'
  );

ALTER TABLE "RetentionLegalHoldRevocation"
  ADD CONSTRAINT "RetentionLegalHoldRevocation_hashes_check" CHECK (
    "payloadSha256" ~ '^[0-9a-f]{64}$'
    AND "evidenceSha256" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "RetentionLegalHoldRevocation_payload_check" CHECK (
    length(btrim("reason")) >= 50
    AND length(btrim("legalAuthority")) >= 3
    AND length(btrim("legalReference")) >= 10
  ),
  ADD CONSTRAINT "RetentionLegalHoldRevocation_evidence_https_check" CHECK (
    "evidenceReference" ~ '^https://[^/@:[:space:]]+(?::[0-9]{1,5})?(?:[/?#]|$)'
    AND "evidenceReference" !~ '[[:space:]]'
    AND "evidenceReference" !~ '^https://[^/]*@'
  );

CREATE FUNCTION enforce_retention_disposition_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'RetentionDispositionRequest terminal rows are immutable';
  END IF;
  IF NEW."status" NOT IN ('APPROVED_NOT_EXECUTED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'RetentionDispositionRequest invalid state transition';
  END IF;
  IF ROW(
    NEW."id", NEW."tenantId", NEW."operationProfileId",
    NEW."clientRequestId", NEW."payloadSha256", NEW."previewSha256",
    NEW."profileSnapshotSha256", NEW."expectedProfileUpdatedAt",
    NEW."scope", NEW."cutoffAt", NEW."retentionDueAt",
    NEW."previewSnapshot", NEW."justification", NEW."legalReference",
    NEW."evidenceReference", NEW."evidenceSha256",
    NEW."legalPolicyRequiredAcknowledged",
    NEW."backupRestoreRequiredAcknowledged",
    NEW."executorUnavailableAcknowledged", NEW."requestedById",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."tenantId", OLD."operationProfileId",
    OLD."clientRequestId", OLD."payloadSha256", OLD."previewSha256",
    OLD."profileSnapshotSha256", OLD."expectedProfileUpdatedAt",
    OLD."scope", OLD."cutoffAt", OLD."retentionDueAt",
    OLD."previewSnapshot", OLD."justification", OLD."legalReference",
    OLD."evidenceReference", OLD."evidenceSha256",
    OLD."legalPolicyRequiredAcknowledged",
    OLD."backupRestoreRequiredAcknowledged",
    OLD."executorUnavailableAcknowledged", OLD."requestedById",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'RetentionDispositionRequest payload is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION guard_retention_disposition_profile_and_holds()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_due_at TIMESTAMP(3);
BEGIN
  SELECT profile."electionDate" + (profile."retentionPeriodDays" * INTERVAL '1 day')
  INTO profile_due_at
  FROM "OperationProfile" profile
  WHERE profile."id" = NEW."operationProfileId"
    AND profile."tenantId" = NEW."tenantId"
    AND profile."stage" = 'CLOSED'
    AND profile."closureType" = 'CLOSED_NORMAL'
    AND profile."updatedAt" = NEW."expectedProfileUpdatedAt";

  IF profile_due_at IS NULL OR profile_due_at <> NEW."retentionDueAt" THEN
    RAISE EXCEPTION 'Ordinary disposition requires the exact CLOSED_NORMAL profile and retention date';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RetentionLegalHold" hold
    LEFT JOIN "RetentionLegalHoldRevocation" revocation
      ON revocation."legalHoldId" = hold."id"
      AND revocation."tenantId" = hold."tenantId"
    WHERE hold."tenantId" = NEW."tenantId"
      AND hold."operationProfileId" = NEW."operationProfileId"
      AND revocation."id" IS NULL
      AND (
        hold."scope" = 'ALL_TENANT_RECORDS'
        OR NEW."scope" = 'ALL_TENANT_RECORDS'
        OR hold."scope" = NEW."scope"
      )
  ) THEN
    RAISE EXCEPTION 'Active legal hold blocks this retention disposition scope';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION prevent_retention_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only and cannot be %', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE FUNCTION validate_retention_hold_revocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "RetentionLegalHold" hold
    WHERE hold."id" = NEW."legalHoldId"
      AND hold."tenantId" = NEW."tenantId"
      AND hold."createdById" <> NEW."revokedById"
      AND hold."effectiveAt" <= NEW."revokedAt"
  ) THEN
    RAISE EXCEPTION 'Legal hold revocation requires a different actor and a valid effective hold';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "RetentionDispositionRequest_lifecycle_only_update"
BEFORE UPDATE ON "RetentionDispositionRequest"
FOR EACH ROW EXECUTE FUNCTION enforce_retention_disposition_update();

CREATE TRIGGER "RetentionDispositionRequest_requires_closed_normal_profile"
BEFORE INSERT OR UPDATE ON "RetentionDispositionRequest"
FOR EACH ROW
WHEN (NEW."status" IN ('PENDING', 'APPROVED_NOT_EXECUTED'))
EXECUTE FUNCTION guard_retention_disposition_profile_and_holds();

CREATE TRIGGER "RetentionDispositionRequest_prevent_delete"
BEFORE DELETE ON "RetentionDispositionRequest"
FOR EACH ROW EXECUTE FUNCTION prevent_retention_immutable_mutation();
CREATE TRIGGER "RetentionDispositionRequest_prevent_truncate"
BEFORE TRUNCATE ON "RetentionDispositionRequest"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_retention_immutable_mutation();

CREATE TRIGGER "RetentionLegalHold_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "RetentionLegalHold"
FOR EACH ROW EXECUTE FUNCTION prevent_retention_immutable_mutation();
CREATE TRIGGER "RetentionLegalHold_prevent_truncate"
BEFORE TRUNCATE ON "RetentionLegalHold"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_retention_immutable_mutation();

CREATE TRIGGER "RetentionLegalHoldRevocation_validate"
BEFORE INSERT ON "RetentionLegalHoldRevocation"
FOR EACH ROW EXECUTE FUNCTION validate_retention_hold_revocation();
CREATE TRIGGER "RetentionLegalHoldRevocation_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "RetentionLegalHoldRevocation"
FOR EACH ROW EXECUTE FUNCTION prevent_retention_immutable_mutation();
CREATE TRIGGER "RetentionLegalHoldRevocation_prevent_truncate"
BEFORE TRUNCATE ON "RetentionLegalHoldRevocation"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_retention_immutable_mutation();

ALTER TABLE "RetentionDispositionRequest" ENABLE ALWAYS TRIGGER "RetentionDispositionRequest_lifecycle_only_update";
ALTER TABLE "RetentionDispositionRequest" ENABLE ALWAYS TRIGGER "RetentionDispositionRequest_requires_closed_normal_profile";
ALTER TABLE "RetentionDispositionRequest" ENABLE ALWAYS TRIGGER "RetentionDispositionRequest_prevent_delete";
ALTER TABLE "RetentionDispositionRequest" ENABLE ALWAYS TRIGGER "RetentionDispositionRequest_prevent_truncate";
ALTER TABLE "RetentionLegalHold" ENABLE ALWAYS TRIGGER "RetentionLegalHold_prevent_update_delete";
ALTER TABLE "RetentionLegalHold" ENABLE ALWAYS TRIGGER "RetentionLegalHold_prevent_truncate";
ALTER TABLE "RetentionLegalHoldRevocation" ENABLE ALWAYS TRIGGER "RetentionLegalHoldRevocation_validate";
ALTER TABLE "RetentionLegalHoldRevocation" ENABLE ALWAYS TRIGGER "RetentionLegalHoldRevocation_prevent_update_delete";
ALTER TABLE "RetentionLegalHoldRevocation" ENABLE ALWAYS TRIGGER "RetentionLegalHoldRevocation_prevent_truncate";

COMMIT;
