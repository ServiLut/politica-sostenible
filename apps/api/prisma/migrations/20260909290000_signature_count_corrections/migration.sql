-- Compensating corrections for aggregate signature-batch counts.
-- A proposal snapshots every count, and an independent decision either applies
-- all proposed absolute values atomically or leaves the batch untouched.

BEGIN;

ALTER TYPE "StorageObjectModule" ADD VALUE IF NOT EXISTS 'SIGNATURE_COLLECTION';

CREATE TYPE "SignatureCountCorrectionReviewControl" AS ENUM (
  'CUSTODY_COUNTS',
  'SUPPORT_CLASSIFICATION'
);

CREATE TYPE "SignatureCountCorrectionDecisionType" AS ENUM (
  'APPROVE',
  'REJECT'
);

CREATE TYPE "SignatureCountCorrectionCommandType" AS ENUM (
  'PROPOSE',
  'DECIDE'
);

CREATE TABLE "SignatureCountCorrectionCommand" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "SignatureCountCorrectionCommandType" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "resourceType" VARCHAR(80) NOT NULL,
  "resourceId" UUID NOT NULL,
  "resultSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SignatureCountCorrectionCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SignatureCountCorrectionCommand_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "SignatureCountCorrectionCommand_resource_check" CHECK (
    length(btrim("resourceType")) BETWEEN 2 AND 80
  )
);

CREATE TABLE "SignatureCountCorrectionProposal" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "commandId" UUID NOT NULL,
  "snapshotBatchVersion" INTEGER NOT NULL,
  "snapshotStatus" "SignatureCollectionBatchStatus" NOT NULL,
  "snapshotStatusBeforeQuarantine" "SignatureCollectionBatchStatus" NOT NULL,

  "snapshotPlannedForms" INTEGER NOT NULL,
  "snapshotIssuedForms" INTEGER NOT NULL,
  "snapshotReturnedForms" INTEGER NOT NULL,
  "snapshotAnnulledForms" INTEGER NOT NULL,
  "snapshotMissingForms" INTEGER NOT NULL,
  "snapshotInCustodyForms" INTEGER NOT NULL,
  "snapshotReportedSupports" INTEGER NOT NULL,
  "snapshotInternalAcceptedSupports" INTEGER NOT NULL,
  "snapshotInternalRejectedSupports" INTEGER NOT NULL,
  "snapshotPossibleDuplicateSupports" INTEGER NOT NULL,

  "proposedPlannedForms" INTEGER NOT NULL,
  "proposedIssuedForms" INTEGER NOT NULL,
  "proposedReturnedForms" INTEGER NOT NULL,
  "proposedAnnulledForms" INTEGER NOT NULL,
  "proposedMissingForms" INTEGER NOT NULL,
  "proposedInCustodyForms" INTEGER NOT NULL,
  "proposedReportedSupports" INTEGER NOT NULL,
  "proposedInternalAcceptedSupports" INTEGER NOT NULL,
  "proposedInternalRejectedSupports" INTEGER NOT NULL,
  "proposedPossibleDuplicateSupports" INTEGER NOT NULL,

  "requiredReviewControl" "SignatureCountCorrectionReviewControl" NOT NULL,
  "reason" VARCHAR(2000) NOT NULL,
  "evidenceStorageObjectId" TEXT NOT NULL,
  "evidenceSha256" CHAR(64) NOT NULL,
  "requestedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SignatureCountCorrectionProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SignatureCountCorrectionProposal_snapshot_version_check" CHECK (
    "snapshotBatchVersion" > 0
  ),
  CONSTRAINT "SignatureCountCorrectionProposal_status_check" CHECK (
    "snapshotStatus" = 'QUARANTINED'
    AND "snapshotStatusBeforeQuarantine" <> 'QUARANTINED'
  ),
  CONSTRAINT "SignatureCountCorrectionProposal_reason_hash_check" CHECK (
    length(btrim("reason")) BETWEEN 20 AND 2000
    AND "evidenceSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "SignatureCountCorrectionProposal_snapshot_counts_check" CHECK (
    "snapshotPlannedForms" BETWEEN 1 AND 1000000000
    AND "snapshotIssuedForms" BETWEEN 0 AND "snapshotPlannedForms"
    AND "snapshotReturnedForms" BETWEEN 0 AND 1000000000
    AND "snapshotAnnulledForms" BETWEEN 0 AND 1000000000
    AND "snapshotMissingForms" BETWEEN 0 AND 1000000000
    AND "snapshotInCustodyForms" BETWEEN 0 AND 1000000000
    AND "snapshotReportedSupports" BETWEEN 0 AND 1000000000
    AND "snapshotInternalAcceptedSupports" BETWEEN 0 AND 1000000000
    AND "snapshotInternalRejectedSupports" BETWEEN 0 AND 1000000000
    AND "snapshotPossibleDuplicateSupports" BETWEEN 0 AND 1000000000
    AND "snapshotReturnedForms" + "snapshotAnnulledForms" + "snapshotMissingForms" + "snapshotInCustodyForms" = "snapshotIssuedForms"
    AND "snapshotInternalAcceptedSupports" + "snapshotInternalRejectedSupports" = "snapshotReportedSupports"
    AND "snapshotPossibleDuplicateSupports" <= "snapshotInternalRejectedSupports"
  ),
  CONSTRAINT "SignatureCountCorrectionProposal_proposed_counts_check" CHECK (
    "proposedPlannedForms" BETWEEN 1 AND 1000000000
    AND "proposedIssuedForms" BETWEEN 0 AND "proposedPlannedForms"
    AND "proposedReturnedForms" BETWEEN 0 AND 1000000000
    AND "proposedAnnulledForms" BETWEEN 0 AND 1000000000
    AND "proposedMissingForms" BETWEEN 0 AND 1000000000
    AND "proposedInCustodyForms" BETWEEN 0 AND 1000000000
    AND "proposedReportedSupports" BETWEEN 0 AND 1000000000
    AND "proposedInternalAcceptedSupports" BETWEEN 0 AND 1000000000
    AND "proposedInternalRejectedSupports" BETWEEN 0 AND 1000000000
    AND "proposedPossibleDuplicateSupports" BETWEEN 0 AND 1000000000
    AND "proposedReturnedForms" + "proposedAnnulledForms" + "proposedMissingForms" + "proposedInCustodyForms" = "proposedIssuedForms"
    AND "proposedInternalAcceptedSupports" + "proposedInternalRejectedSupports" = "proposedReportedSupports"
    AND "proposedPossibleDuplicateSupports" <= "proposedInternalRejectedSupports"
  ),
  CONSTRAINT "SignatureCountCorrectionProposal_changed_check" CHECK (
    ROW(
      "snapshotPlannedForms", "snapshotIssuedForms", "snapshotReturnedForms",
      "snapshotAnnulledForms", "snapshotMissingForms", "snapshotInCustodyForms",
      "snapshotReportedSupports", "snapshotInternalAcceptedSupports",
      "snapshotInternalRejectedSupports", "snapshotPossibleDuplicateSupports"
    ) IS DISTINCT FROM ROW(
      "proposedPlannedForms", "proposedIssuedForms", "proposedReturnedForms",
      "proposedAnnulledForms", "proposedMissingForms", "proposedInCustodyForms",
      "proposedReportedSupports", "proposedInternalAcceptedSupports",
      "proposedInternalRejectedSupports", "proposedPossibleDuplicateSupports"
    )
  ),
  CONSTRAINT "SignatureCountCorrectionProposal_review_matrix_check" CHECK (
    (
      "requiredReviewControl" = 'SUPPORT_CLASSIFICATION'
      AND ROW(
        "snapshotReportedSupports", "snapshotInternalAcceptedSupports",
        "snapshotInternalRejectedSupports", "snapshotPossibleDuplicateSupports"
      ) IS DISTINCT FROM ROW(
        "proposedReportedSupports", "proposedInternalAcceptedSupports",
        "proposedInternalRejectedSupports", "proposedPossibleDuplicateSupports"
      )
    ) OR (
      "requiredReviewControl" = 'CUSTODY_COUNTS'
      AND ROW(
        "snapshotReportedSupports", "snapshotInternalAcceptedSupports",
        "snapshotInternalRejectedSupports", "snapshotPossibleDuplicateSupports"
      ) IS NOT DISTINCT FROM ROW(
        "proposedReportedSupports", "proposedInternalAcceptedSupports",
        "proposedInternalRejectedSupports", "proposedPossibleDuplicateSupports"
      )
    )
  )
);

CREATE TABLE "SignatureCountCorrectionDecision" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proposalId" UUID NOT NULL,
  "commandId" UUID NOT NULL,
  "decision" "SignatureCountCorrectionDecisionType" NOT NULL,
  "reviewReason" VARCHAR(2000) NOT NULL,
  "reviewedById" TEXT NOT NULL,
  "reviewerRole" "Role" NOT NULL,
  "expectedBatchVersion" INTEGER NOT NULL,
  "batchVersionBefore" INTEGER NOT NULL,
  "batchVersionAfter" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SignatureCountCorrectionDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SignatureCountCorrectionDecision_reason_check" CHECK (
    length(btrim("reviewReason")) BETWEEN 20 AND 2000
  ),
  CONSTRAINT "SignatureCountCorrectionDecision_version_check" CHECK (
    "expectedBatchVersion" > 0
    AND "batchVersionBefore" = "expectedBatchVersion"
    AND (
      ("decision" = 'APPROVE' AND "batchVersionAfter" = "batchVersionBefore" + 1)
      OR ("decision" = 'REJECT' AND "batchVersionAfter" = "batchVersionBefore")
    )
  ),
  CONSTRAINT "SignatureCountCorrectionDecision_role_check" CHECK (
    "reviewerRole" IN ('COMPLIANCE_OFFICER', 'AUDITOR')
  )
);

CREATE UNIQUE INDEX "SignatureCountCorrectionCommand_id_tenant_key"
  ON "SignatureCountCorrectionCommand"("id", "tenantId");
CREATE UNIQUE INDEX "SignatureCountCorrectionCommand_tenant_client_key"
  ON "SignatureCountCorrectionCommand"("tenantId", "clientRequestId");
CREATE INDEX "SignatureCountCorrectionCommand_tenant_actor_created_idx"
  ON "SignatureCountCorrectionCommand"("tenantId", "actorUserId", "createdAt");

CREATE UNIQUE INDEX "SignatureCountCorrectionProposal_id_tenant_key"
  ON "SignatureCountCorrectionProposal"("id", "tenantId");
CREATE UNIQUE INDEX "SignatureCountCorrectionProposal_command_tenant_key"
  ON "SignatureCountCorrectionProposal"("commandId", "tenantId");
CREATE UNIQUE INDEX "SignatureCountCorrectionProposal_storage_tenant_key"
  ON "SignatureCountCorrectionProposal"("evidenceStorageObjectId", "tenantId");
CREATE INDEX "SignatureCountCorrectionProposal_tenant_batch_created_idx"
  ON "SignatureCountCorrectionProposal"("tenantId", "batchId", "createdAt");
CREATE INDEX "SignatureCountCorrectionProposal_tenant_control_created_idx"
  ON "SignatureCountCorrectionProposal"("tenantId", "requiredReviewControl", "createdAt");

CREATE UNIQUE INDEX "SignatureCountCorrectionDecision_id_tenant_key"
  ON "SignatureCountCorrectionDecision"("id", "tenantId");
CREATE UNIQUE INDEX "SignatureCountCorrectionDecision_proposal_tenant_key"
  ON "SignatureCountCorrectionDecision"("proposalId", "tenantId");
CREATE UNIQUE INDEX "SignatureCountCorrectionDecision_command_tenant_key"
  ON "SignatureCountCorrectionDecision"("commandId", "tenantId");
CREATE INDEX "SignatureCountCorrectionDecision_tenant_reviewer_created_idx"
  ON "SignatureCountCorrectionDecision"("tenantId", "reviewedById", "createdAt");

ALTER TABLE "SignatureCountCorrectionCommand"
  ADD CONSTRAINT "SignatureCountCorrectionCommand_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCountCorrectionCommand"
  ADD CONSTRAINT "SignatureCountCorrectionCommand_actor_fkey"
  FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignatureCountCorrectionProposal"
  ADD CONSTRAINT "SignatureCountCorrectionProposal_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCountCorrectionProposal"
  ADD CONSTRAINT "SignatureCountCorrectionProposal_profile_fkey"
  FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCountCorrectionProposal"
  ADD CONSTRAINT "SignatureCountCorrectionProposal_batch_fkey"
  FOREIGN KEY ("batchId", "tenantId") REFERENCES "SignatureCollectionBatch"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCountCorrectionProposal"
  ADD CONSTRAINT "SignatureCountCorrectionProposal_command_fkey"
  FOREIGN KEY ("commandId", "tenantId") REFERENCES "SignatureCountCorrectionCommand"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCountCorrectionProposal"
  ADD CONSTRAINT "SignatureCountCorrectionProposal_storage_fkey"
  FOREIGN KEY ("evidenceStorageObjectId", "tenantId") REFERENCES "StoredObject"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCountCorrectionProposal"
  ADD CONSTRAINT "SignatureCountCorrectionProposal_requester_fkey"
  FOREIGN KEY ("requestedById", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignatureCountCorrectionDecision"
  ADD CONSTRAINT "SignatureCountCorrectionDecision_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCountCorrectionDecision"
  ADD CONSTRAINT "SignatureCountCorrectionDecision_proposal_fkey"
  FOREIGN KEY ("proposalId", "tenantId") REFERENCES "SignatureCountCorrectionProposal"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCountCorrectionDecision"
  ADD CONSTRAINT "SignatureCountCorrectionDecision_command_fkey"
  FOREIGN KEY ("commandId", "tenantId") REFERENCES "SignatureCountCorrectionCommand"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCountCorrectionDecision"
  ADD CONSTRAINT "SignatureCountCorrectionDecision_reviewer_fkey"
  FOREIGN KEY ("reviewedById", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "signature_count_correction_assert_open_operation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_stage "PoliticalOperationStage";
  current_type "PoliticalOperationType";
BEGIN
  SELECT "stage", "operationType" INTO current_stage, current_type
  FROM "OperationProfile"
  WHERE "tenantId" = NEW."tenantId"
  FOR SHARE;

  IF current_stage IS NULL OR current_type <> 'SIGNATURE_COMMITTEE' THEN
    RAISE EXCEPTION 'Signature count correction requires a signature-committee operation profile'
      USING ERRCODE = '23514';
  END IF;
  IF current_stage = 'CLOSED' THEN
    RAISE EXCEPTION 'A CLOSED operation cannot receive signature count corrections'
      USING ERRCODE = '23514';
  END IF;
  IF current_stage <> 'SIGNATURE_COLLECTION' THEN
    RAISE EXCEPTION 'Signature count correction is only available during SIGNATURE_COLLECTION'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "signature_count_correction_reject_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; create a new compensating proposal', TG_TABLE_NAME
    USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION "signature_count_correction_validate_proposal"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_row "SignatureCollectionBatch"%ROWTYPE;
  storage_row "StoredObject"%ROWTYPE;
  requester_role "Role";
BEGIN
  SELECT * INTO batch_row
  FROM "SignatureCollectionBatch"
  WHERE "id" = NEW."batchId" AND "tenantId" = NEW."tenantId"
  FOR UPDATE;

  IF batch_row."id" IS NULL
     OR batch_row."operationProfileId" <> NEW."operationProfileId"
     OR batch_row."status" <> 'QUARANTINED'
     OR batch_row."statusBeforeQuarantine" IS NULL THEN
    RAISE EXCEPTION 'Count correction requires a quarantined batch in the same tenant and profile'
      USING ERRCODE = '23514';
  END IF;

  IF batch_row."version" <> NEW."snapshotBatchVersion"
     OR batch_row."status" <> NEW."snapshotStatus"
     OR batch_row."statusBeforeQuarantine" <> NEW."snapshotStatusBeforeQuarantine"
     OR ROW(
       batch_row."plannedForms", batch_row."issuedForms", batch_row."returnedForms",
       batch_row."annulledForms", batch_row."missingForms", batch_row."inCustodyForms",
       batch_row."reportedSupports", batch_row."internalAcceptedSupports",
       batch_row."internalRejectedSupports", batch_row."possibleDuplicateSupports"
     ) IS DISTINCT FROM ROW(
       NEW."snapshotPlannedForms", NEW."snapshotIssuedForms", NEW."snapshotReturnedForms",
       NEW."snapshotAnnulledForms", NEW."snapshotMissingForms", NEW."snapshotInCustodyForms",
       NEW."snapshotReportedSupports", NEW."snapshotInternalAcceptedSupports",
       NEW."snapshotInternalRejectedSupports", NEW."snapshotPossibleDuplicateSupports"
     ) THEN
    RAISE EXCEPTION 'Correction snapshot does not exactly match the locked batch'
      USING ERRCODE = '40001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "SignatureCountCorrectionProposal" proposal
    LEFT JOIN "SignatureCountCorrectionDecision" decision
      ON decision."proposalId" = proposal."id" AND decision."tenantId" = proposal."tenantId"
    WHERE proposal."tenantId" = NEW."tenantId"
      AND proposal."batchId" = NEW."batchId"
      AND decision."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Batch already has an unresolved count-correction proposal'
      USING ERRCODE = '23505';
  END IF;

  SELECT "role" INTO requester_role
  FROM "User"
  WHERE "id" = NEW."requestedById" AND "tenantId" = NEW."tenantId" AND "isActive" = TRUE
  FOR SHARE;
  IF requester_role NOT IN ('ADMIN', 'CAMPAIGN_MANAGER', 'ZONE_COORDINATOR') THEN
    RAISE EXCEPTION 'Count-correction requester lacks the operational role'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO storage_row
  FROM "StoredObject"
  WHERE "id" = NEW."evidenceStorageObjectId" AND "tenantId" = NEW."tenantId"
  FOR UPDATE;
  IF storage_row."id" IS NULL
     OR storage_row."uploaderId" <> NEW."requestedById"
     OR storage_row."module"::text <> 'SIGNATURE_COLLECTION'
     OR storage_row."status" <> 'CONFIRMED'
     OR storage_row."consumedAt" IS NOT NULL
     OR storage_row."expectedSha256" <> NEW."evidenceSha256"
     OR storage_row."reportedSha256" <> NEW."evidenceSha256" THEN
    RAISE EXCEPTION 'Correction evidence must be a matching confirmed, unconsumed StorageObject'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."snapshotStatusBeforeQuarantine" = 'PLANNED'
     AND NEW."proposedIssuedForms" <> 0 THEN
    RAISE EXCEPTION 'A correction cannot make a planned batch look issued'
      USING ERRCODE = '23514';
  ELSIF NEW."snapshotStatusBeforeQuarantine" = 'ISSUED'
     AND (NEW."proposedIssuedForms" = 0 OR NEW."proposedInCustodyForms" <> NEW."proposedIssuedForms") THEN
    RAISE EXCEPTION 'Proposed counts are incompatible with the prior ISSUED state'
      USING ERRCODE = '23514';
  ELSIF NEW."snapshotStatusBeforeQuarantine" = 'PARTIALLY_RETURNED'
     AND (
       NEW."proposedIssuedForms" = 0
       OR NEW."proposedInCustodyForms" = 0
       OR NEW."proposedInCustodyForms" >= NEW."proposedIssuedForms"
     ) THEN
    RAISE EXCEPTION 'Proposed counts are incompatible with the prior PARTIALLY_RETURNED state'
      USING ERRCODE = '23514';
  ELSIF NEW."snapshotStatusBeforeQuarantine" IN (
      'RETURNED', 'INTERNAL_REVIEWED', 'DELIVERED_TO_COMMITTEE',
      'SUBMITTED_TO_AUTHORITY', 'AUTHORITY_RESULT_RECORDED'
    ) AND NEW."proposedInCustodyForms" <> 0 THEN
    RAISE EXCEPTION 'Proposed counts are incompatible with the prior completed-custody state'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "signature_count_correction_apply_decision"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  proposal_row "SignatureCountCorrectionProposal"%ROWTYPE;
  batch_row "SignatureCollectionBatch"%ROWTYPE;
  actual_reviewer_role "Role";
BEGIN
  SELECT * INTO proposal_row
  FROM "SignatureCountCorrectionProposal"
  WHERE "id" = NEW."proposalId" AND "tenantId" = NEW."tenantId"
  FOR UPDATE;
  IF proposal_row."id" IS NULL THEN
    RAISE EXCEPTION 'Count-correction proposal does not exist in this tenant'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "SignatureCountCorrectionDecision"
    WHERE "tenantId" = NEW."tenantId" AND "proposalId" = NEW."proposalId"
  ) THEN
    RAISE EXCEPTION 'Count-correction proposal already has a terminal decision'
      USING ERRCODE = '23505';
  END IF;

  SELECT "role" INTO actual_reviewer_role
  FROM "User"
  WHERE "id" = NEW."reviewedById" AND "tenantId" = NEW."tenantId" AND "isActive" = TRUE
  FOR SHARE;
  IF actual_reviewer_role IS NULL
     OR NEW."reviewedById" = proposal_row."requestedById"
     OR NEW."reviewerRole" <> actual_reviewer_role
     OR (
       proposal_row."requiredReviewControl" = 'CUSTODY_COUNTS'
       AND actual_reviewer_role <> 'COMPLIANCE_OFFICER'
     ) OR (
       proposal_row."requiredReviewControl" = 'SUPPORT_CLASSIFICATION'
       AND actual_reviewer_role <> 'AUDITOR'
     ) THEN
    RAISE EXCEPTION 'Decision requires a distinct active reviewer with the matrix role'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO batch_row
  FROM "SignatureCollectionBatch"
  WHERE "id" = proposal_row."batchId" AND "tenantId" = NEW."tenantId"
  FOR UPDATE;
  IF batch_row."id" IS NULL
     OR batch_row."status" <> 'QUARANTINED'
     OR batch_row."statusBeforeQuarantine" <> proposal_row."snapshotStatusBeforeQuarantine"
     OR NEW."expectedBatchVersion" <> proposal_row."snapshotBatchVersion"
     OR batch_row."version" <> NEW."expectedBatchVersion"
     OR ROW(
       batch_row."plannedForms", batch_row."issuedForms", batch_row."returnedForms",
       batch_row."annulledForms", batch_row."missingForms", batch_row."inCustodyForms",
       batch_row."reportedSupports", batch_row."internalAcceptedSupports",
       batch_row."internalRejectedSupports", batch_row."possibleDuplicateSupports"
     ) IS DISTINCT FROM ROW(
       proposal_row."snapshotPlannedForms", proposal_row."snapshotIssuedForms",
       proposal_row."snapshotReturnedForms", proposal_row."snapshotAnnulledForms",
       proposal_row."snapshotMissingForms", proposal_row."snapshotInCustodyForms",
       proposal_row."snapshotReportedSupports", proposal_row."snapshotInternalAcceptedSupports",
       proposal_row."snapshotInternalRejectedSupports", proposal_row."snapshotPossibleDuplicateSupports"
     ) THEN
    RAISE EXCEPTION 'Batch changed after the correction proposal; a new snapshot is required'
      USING ERRCODE = '40001';
  END IF;

  NEW."reviewerRole" := actual_reviewer_role;
  NEW."batchVersionBefore" := batch_row."version";
  IF NEW."decision" = 'APPROVE' THEN
    UPDATE "SignatureCollectionBatch"
    SET
      "plannedForms" = proposal_row."proposedPlannedForms",
      "issuedForms" = proposal_row."proposedIssuedForms",
      "returnedForms" = proposal_row."proposedReturnedForms",
      "annulledForms" = proposal_row."proposedAnnulledForms",
      "missingForms" = proposal_row."proposedMissingForms",
      "inCustodyForms" = proposal_row."proposedInCustodyForms",
      "reportedSupports" = proposal_row."proposedReportedSupports",
      "internalAcceptedSupports" = proposal_row."proposedInternalAcceptedSupports",
      "internalRejectedSupports" = proposal_row."proposedInternalRejectedSupports",
      "possibleDuplicateSupports" = proposal_row."proposedPossibleDuplicateSupports",
      "version" = batch_row."version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = batch_row."id" AND "tenantId" = NEW."tenantId";
    NEW."batchVersionAfter" := batch_row."version" + 1;
  ELSE
    NEW."batchVersionAfter" := batch_row."version";
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "signature_count_correction_guard_batch_release"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'QUARANTINED'
     AND NEW."status" <> 'QUARANTINED'
     AND EXISTS (
       SELECT 1
       FROM "SignatureCountCorrectionProposal" proposal
       LEFT JOIN "SignatureCountCorrectionDecision" decision
         ON decision."proposalId" = proposal."id"
        AND decision."tenantId" = proposal."tenantId"
       WHERE proposal."tenantId" = OLD."tenantId"
         AND proposal."batchId" = OLD."id"
         AND decision."id" IS NULL
     ) THEN
    RAISE EXCEPTION 'Batch quarantine cannot be released with an unresolved count correction'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "SignatureCountCorrectionProposal_validate"
BEFORE INSERT ON "SignatureCountCorrectionProposal"
FOR EACH ROW EXECUTE FUNCTION "signature_count_correction_validate_proposal"();

CREATE TRIGGER "SignatureCountCorrectionDecision_apply"
BEFORE INSERT ON "SignatureCountCorrectionDecision"
FOR EACH ROW EXECUTE FUNCTION "signature_count_correction_apply_decision"();

CREATE TRIGGER "SignatureCollectionBatch_count_correction_release_guard"
BEFORE UPDATE OF "status" ON "SignatureCollectionBatch"
FOR EACH ROW EXECUTE FUNCTION "signature_count_correction_guard_batch_release"();

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'SignatureCountCorrectionCommand',
    'SignatureCountCorrectionProposal',
    'SignatureCountCorrectionDecision'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION "signature_count_correction_assert_open_operation"()',
      table_name || '_open_operation', table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION "signature_count_correction_reject_mutation"()',
      table_name || '_immutable', table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION "signature_count_correction_reject_mutation"()',
      table_name || '_no_truncate', table_name
    );
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', table_name, table_name || '_open_operation');
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', table_name, table_name || '_immutable');
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', table_name, table_name || '_no_truncate');
  END LOOP;
END $$;

ALTER TABLE "SignatureCountCorrectionProposal"
  ENABLE ALWAYS TRIGGER "SignatureCountCorrectionProposal_validate";
ALTER TABLE "SignatureCountCorrectionDecision"
  ENABLE ALWAYS TRIGGER "SignatureCountCorrectionDecision_apply";
ALTER TABLE "SignatureCollectionBatch"
  ENABLE ALWAYS TRIGGER "SignatureCollectionBatch_count_correction_release_guard";

COMMIT;
