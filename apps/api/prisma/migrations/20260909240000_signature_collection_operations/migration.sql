-- Aggregate and tenant-isolated custody ledger for citizen-support forms.
-- It intentionally has no signer/person identity, address, signature or image.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ElectronicSignature"
    GROUP BY "tenantId", "documentId", "signerId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ElectronicSignature contains duplicate tenant/document/signer records; deduplicate through an audited procedure before migrating';
  END IF;
END $$;

CREATE UNIQUE INDEX "ElectronicSignature_tenant_document_signer_key"
  ON "ElectronicSignature"("tenantId", "documentId", "signerId");

CREATE TYPE "SignatureCollectionPlanStatus" AS ENUM (
  'READY',
  'COLLECTING',
  'SUBMITTED',
  'AUTHORITY_RESULT_RECORDED'
);

CREATE TYPE "SignatureCollectionBatchStatus" AS ENUM (
  'PLANNED',
  'ISSUED',
  'PARTIALLY_RETURNED',
  'RETURNED',
  'INTERNAL_REVIEWED',
  'DELIVERED_TO_COMMITTEE',
  'SUBMITTED_TO_AUTHORITY',
  'AUTHORITY_RESULT_RECORDED',
  'QUARANTINED'
);

CREATE TYPE "SignatureCollectionCommandType" AS ENUM (
  'PLAN_CREATE',
  'BATCH_CREATE',
  'BATCH_ISSUE',
  'BATCH_RETURN',
  'BATCH_INTERNAL_REVIEW',
  'BATCH_DELIVER_TO_COMMITTEE',
  'BATCH_SUBMIT_TO_AUTHORITY',
  'BATCH_QUARANTINE',
  'BATCH_RELEASE_QUARANTINE',
  'AUTHORITY_RESULT_RECORD',
  'AUTHORITY_RESULT_REVIEW',
  'AUTHORITY_RESULT_LINK'
);

CREATE TYPE "SignatureCustodyEventType" AS ENUM (
  'PLANNED',
  'ISSUED',
  'PARTIAL_RETURN',
  'FINAL_RETURN',
  'INTERNAL_REVIEW',
  'DELIVERED_TO_COMMITTEE',
  'SUBMITTED_TO_AUTHORITY',
  'QUARANTINED',
  'QUARANTINE_RELEASED',
  'AUTHORITY_RESULT_LINKED'
);

CREATE TYPE "SignatureAuthorityOutcome" AS ENUM (
  'THRESHOLD_MET',
  'THRESHOLD_NOT_MET',
  'REGISTRATION_DENIED',
  'WITHDRAWN'
);

CREATE TYPE "SignatureAuthorityReviewDecision" AS ENUM ('APPROVE', 'REJECT');

CREATE TABLE "SignatureCollectionCommand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "SignatureCollectionCommandType" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "resourceType" VARCHAR(80) NOT NULL,
  "resourceId" TEXT NOT NULL,
  "resultSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignatureCollectionCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SignatureCollectionCommand_hash_check" CHECK ("payloadSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "SignatureCollectionCommand_resource_check" CHECK (
    length(btrim("resourceType")) BETWEEN 2 AND 80 AND length(btrim("resourceId")) > 0
  )
);

CREATE TABLE "SignatureCollectionPlan" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "initialCommandId" TEXT NOT NULL,
  "status" "SignatureCollectionPlanStatus" NOT NULL DEFAULT 'READY',
  "committeeMemberCount" INTEGER NOT NULL,
  "committeeEvidenceReference" VARCHAR(2048) NOT NULL,
  "committeeEvidenceSha256" CHAR(64) NOT NULL,
  "committeeRegisteredAt" DATE NOT NULL,
  "collectionStartsAt" DATE NOT NULL,
  "collectionClosesAt" DATE NOT NULL,
  "candidateRegistrationClosesAt" DATE NOT NULL,
  "requiredThreshold" INTEGER NOT NULL,
  "internalTarget" INTEGER NOT NULL,
  "thresholdSourceUrl" VARCHAR(2048) NOT NULL,
  "thresholdSourceReference" VARCHAR(500) NOT NULL,
  "thresholdSourceSha256" CHAR(64) NOT NULL,
  "fileOwnerUserId" TEXT NOT NULL,
  "custodyOwnerUserId" TEXT NOT NULL,
  "formHandlingRules" VARCHAR(6000) NOT NULL,
  "deliveryPlan" VARCHAR(4000) NOT NULL,
  "contingencyPlan" VARCHAR(4000) NOT NULL,
  "submissionDueAt" DATE NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SignatureCollectionPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SignatureCollectionPlan_committee_check" CHECK ("committeeMemberCount" = 3),
  CONSTRAINT "SignatureCollectionPlan_hashes_check" CHECK (
    "committeeEvidenceSha256" ~ '^[a-f0-9]{64}$'
    AND "thresholdSourceSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "SignatureCollectionPlan_https_check" CHECK (
    "committeeEvidenceReference" ~ '^https://[^[:space:]]+$'
    AND "thresholdSourceUrl" ~ '^https://[^[:space:]]+$'
  ),
  CONSTRAINT "SignatureCollectionPlan_dates_check" CHECK (
    "committeeRegisteredAt" < "collectionStartsAt"
    AND "collectionStartsAt" <= "collectionClosesAt"
    AND "collectionClosesAt" <= "submissionDueAt"
    AND "submissionDueAt" <= "candidateRegistrationClosesAt"
  ),
  CONSTRAINT "SignatureCollectionPlan_threshold_check" CHECK (
    "requiredThreshold" > 0 AND "internalTarget" >= "requiredThreshold"
  ),
  CONSTRAINT "SignatureCollectionPlan_owners_check" CHECK ("fileOwnerUserId" <> "custodyOwnerUserId"),
  CONSTRAINT "SignatureCollectionPlan_text_check" CHECK (
    length(btrim("thresholdSourceReference")) >= 5
    AND length(btrim("formHandlingRules")) >= 100
    AND length(btrim("deliveryPlan")) >= 50
    AND length(btrim("contingencyPlan")) >= 50
  ),
  CONSTRAINT "SignatureCollectionPlan_version_check" CHECK ("version" > 0)
);

CREATE TABLE "SignatureCollectionBatch" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "initialCommandId" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "physicalSealReference" VARCHAR(160),
  "territoryReference" VARCHAR(300) NOT NULL,
  "expectedReturnAt" TIMESTAMP(3) NOT NULL,
  "status" "SignatureCollectionBatchStatus" NOT NULL DEFAULT 'PLANNED',
  "statusBeforeQuarantine" "SignatureCollectionBatchStatus",
  "plannedForms" INTEGER NOT NULL,
  "issuedForms" INTEGER NOT NULL DEFAULT 0,
  "returnedForms" INTEGER NOT NULL DEFAULT 0,
  "annulledForms" INTEGER NOT NULL DEFAULT 0,
  "missingForms" INTEGER NOT NULL DEFAULT 0,
  "inCustodyForms" INTEGER NOT NULL DEFAULT 0,
  "reportedSupports" INTEGER NOT NULL DEFAULT 0,
  "internalAcceptedSupports" INTEGER NOT NULL DEFAULT 0,
  "internalRejectedSupports" INTEGER NOT NULL DEFAULT 0,
  "possibleDuplicateSupports" INTEGER NOT NULL DEFAULT 0,
  "currentCustodianUserId" TEXT,
  "issuedAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "internallyReviewedAt" TIMESTAMP(3),
  "deliveredToCommitteeAt" TIMESTAMP(3),
  "submittedToAuthorityAt" TIMESTAMP(3),
  "authorityResultRecordedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SignatureCollectionBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SignatureCollectionBatch_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._-]{1,63}$'),
  CONSTRAINT "SignatureCollectionBatch_text_check" CHECK (
    length(btrim("territoryReference")) >= 2
    AND ("physicalSealReference" IS NULL OR length(btrim("physicalSealReference")) >= 2)
  ),
  CONSTRAINT "SignatureCollectionBatch_return_date_check" CHECK ("expectedReturnAt" >= "createdAt"),
  CONSTRAINT "SignatureCollectionBatch_counts_check" CHECK (
    "plannedForms" > 0
    AND "issuedForms" BETWEEN 0 AND "plannedForms"
    AND "returnedForms" >= 0
    AND "annulledForms" >= 0
    AND "missingForms" >= 0
    AND "inCustodyForms" >= 0
    AND "reportedSupports" >= 0
    AND "internalAcceptedSupports" >= 0
    AND "internalRejectedSupports" >= 0
    AND "possibleDuplicateSupports" >= 0
    AND "returnedForms" + "annulledForms" + "missingForms" + "inCustodyForms" = "issuedForms"
    AND "internalAcceptedSupports" + "internalRejectedSupports" = "reportedSupports"
    AND "possibleDuplicateSupports" <= "internalRejectedSupports"
  ),
  CONSTRAINT "SignatureCollectionBatch_quarantine_check" CHECK (
    ("status" = 'QUARANTINED' AND "statusBeforeQuarantine" IS NOT NULL AND "statusBeforeQuarantine" <> 'QUARANTINED')
    OR ("status" <> 'QUARANTINED' AND "statusBeforeQuarantine" IS NULL)
  ),
  CONSTRAINT "SignatureCollectionBatch_state_check" CHECK (
    ("status" = 'PLANNED' AND "issuedForms" = 0 AND "issuedAt" IS NULL)
    OR ("status" = 'ISSUED' AND "issuedForms" > 0 AND "inCustodyForms" = "issuedForms" AND "issuedAt" IS NOT NULL)
    OR ("status" = 'PARTIALLY_RETURNED' AND "issuedForms" > 0 AND "inCustodyForms" > 0 AND "inCustodyForms" < "issuedForms" AND "issuedAt" IS NOT NULL)
    OR ("status" = 'RETURNED' AND "issuedForms" > 0 AND "inCustodyForms" = 0 AND "returnedAt" IS NOT NULL)
    OR ("status" = 'INTERNAL_REVIEWED' AND "inCustodyForms" = 0 AND "internallyReviewedAt" IS NOT NULL)
    OR ("status" = 'DELIVERED_TO_COMMITTEE' AND "inCustodyForms" = 0 AND "deliveredToCommitteeAt" IS NOT NULL)
    OR ("status" = 'SUBMITTED_TO_AUTHORITY' AND "inCustodyForms" = 0 AND "submittedToAuthorityAt" IS NOT NULL)
    OR ("status" = 'AUTHORITY_RESULT_RECORDED' AND "inCustodyForms" = 0 AND "authorityResultRecordedAt" IS NOT NULL)
    OR "status" = 'QUARANTINED'
  ),
  CONSTRAINT "SignatureCollectionBatch_version_check" CHECK ("version" > 0)
);

CREATE TABLE "SignatureCustodyEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "type" "SignatureCustodyEventType" NOT NULL,
  "previousStatus" "SignatureCollectionBatchStatus" NOT NULL,
  "nextStatus" "SignatureCollectionBatchStatus" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "receiverUserId" TEXT,
  "territoryReference" VARCHAR(300) NOT NULL,
  "physicalSealReference" VARCHAR(160),
  "observation" VARCHAR(2000) NOT NULL,
  "evidenceReference" VARCHAR(2048),
  "evidenceSha256" CHAR(64),
  "plannedForms" INTEGER NOT NULL,
  "issuedForms" INTEGER NOT NULL,
  "returnedForms" INTEGER NOT NULL,
  "annulledForms" INTEGER NOT NULL,
  "missingForms" INTEGER NOT NULL,
  "inCustodyForms" INTEGER NOT NULL,
  "reportedSupports" INTEGER NOT NULL,
  "internalAcceptedSupports" INTEGER NOT NULL,
  "internalRejectedSupports" INTEGER NOT NULL,
  "possibleDuplicateSupports" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignatureCustodyEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SignatureCustodyEvent_evidence_check" CHECK (
    ("evidenceReference" IS NULL AND "evidenceSha256" IS NULL)
    OR ("evidenceReference" ~ '^https://[^[:space:]]+$' AND "evidenceSha256" ~ '^[a-f0-9]{64}$')
  ),
  CONSTRAINT "SignatureCustodyEvent_counts_check" CHECK (
    "plannedForms" > 0 AND "issuedForms" >= 0 AND "returnedForms" >= 0
    AND "annulledForms" >= 0 AND "missingForms" >= 0 AND "inCustodyForms" >= 0
    AND "reportedSupports" >= 0 AND "internalAcceptedSupports" >= 0
    AND "internalRejectedSupports" >= 0 AND "possibleDuplicateSupports" >= 0
    AND "returnedForms" + "annulledForms" + "missingForms" + "inCustodyForms" = "issuedForms"
    AND "internalAcceptedSupports" + "internalRejectedSupports" = "reportedSupports"
    AND "possibleDuplicateSupports" <= "internalRejectedSupports"
  )
);

CREATE TABLE "SignatureAuthorityResult" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "authorityName" VARCHAR(300) NOT NULL,
  "authorityActReference" VARCHAR(500) NOT NULL,
  "authorityActIssuedAt" DATE NOT NULL,
  "evidenceReference" VARCHAR(2048) NOT NULL,
  "evidenceSha256" CHAR(64) NOT NULL,
  "submittedSupports" INTEGER NOT NULL,
  "validSupports" INTEGER NOT NULL,
  "invalidSupports" INTEGER NOT NULL,
  "outcome" "SignatureAuthorityOutcome" NOT NULL,
  "recordedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignatureAuthorityResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SignatureAuthorityResult_evidence_check" CHECK (
    "evidenceReference" ~ '^https://[^[:space:]]+$' AND "evidenceSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "SignatureAuthorityResult_counts_check" CHECK (
    "submittedSupports" >= 0 AND "validSupports" >= 0 AND "invalidSupports" >= 0
    AND "validSupports" + "invalidSupports" = "submittedSupports"
  ),
  CONSTRAINT "SignatureAuthorityResult_text_check" CHECK (
    length(btrim("authorityName")) >= 3 AND length(btrim("authorityActReference")) >= 3
  )
);

CREATE TABLE "SignatureAuthorityResultReview" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "resultId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "decision" "SignatureAuthorityReviewDecision" NOT NULL,
  "reason" VARCHAR(2000),
  "reviewedById" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignatureAuthorityResultReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SignatureAuthorityResultReview_reason_check" CHECK (
    ("decision" = 'APPROVE' AND "reason" IS NULL)
    OR ("decision" = 'REJECT' AND length(btrim("reason")) >= 20)
  )
);

CREATE UNIQUE INDEX "SignatureCollectionCommand_id_tenant_key" ON "SignatureCollectionCommand"("id", "tenantId");
CREATE UNIQUE INDEX "SignatureCollectionCommand_tenant_client_key" ON "SignatureCollectionCommand"("tenantId", "clientRequestId");
CREATE INDEX "SignatureCollectionCommand_tenant_type_created_idx" ON "SignatureCollectionCommand"("tenantId", "type", "createdAt");
CREATE INDEX "SignatureCollectionCommand_tenant_resource_idx" ON "SignatureCollectionCommand"("tenantId", "resourceType", "resourceId");

CREATE UNIQUE INDEX "SignatureCollectionPlan_id_tenant_key" ON "SignatureCollectionPlan"("id", "tenantId");
CREATE UNIQUE INDEX "SignatureCollectionPlan_profile_tenant_key" ON "SignatureCollectionPlan"("operationProfileId", "tenantId");
CREATE UNIQUE INDEX "SignatureCollectionPlan_command_tenant_key" ON "SignatureCollectionPlan"("initialCommandId", "tenantId");
CREATE INDEX "SignatureCollectionPlan_tenant_status_due_idx" ON "SignatureCollectionPlan"("tenantId", "status", "submissionDueAt");
CREATE INDEX "SignatureCollectionPlan_file_owner_idx" ON "SignatureCollectionPlan"("tenantId", "fileOwnerUserId");
CREATE INDEX "SignatureCollectionPlan_custody_owner_idx" ON "SignatureCollectionPlan"("tenantId", "custodyOwnerUserId");

CREATE UNIQUE INDEX "SignatureCollectionBatch_id_tenant_key" ON "SignatureCollectionBatch"("id", "tenantId");
CREATE UNIQUE INDEX "SignatureCollectionBatch_tenant_plan_code_key" ON "SignatureCollectionBatch"("tenantId", "planId", "code");
CREATE UNIQUE INDEX "SignatureCollectionBatch_command_tenant_key" ON "SignatureCollectionBatch"("initialCommandId", "tenantId");
CREATE INDEX "SignatureCollectionBatch_tenant_profile_status_idx" ON "SignatureCollectionBatch"("tenantId", "operationProfileId", "status");
CREATE INDEX "SignatureCollectionBatch_tenant_plan_status_idx" ON "SignatureCollectionBatch"("tenantId", "planId", "status", "expectedReturnAt");
CREATE INDEX "SignatureCollectionBatch_custodian_idx" ON "SignatureCollectionBatch"("tenantId", "currentCustodianUserId");

CREATE UNIQUE INDEX "SignatureCustodyEvent_id_tenant_key" ON "SignatureCustodyEvent"("id", "tenantId");
CREATE UNIQUE INDEX "SignatureCustodyEvent_command_tenant_key" ON "SignatureCustodyEvent"("commandId", "tenantId");
CREATE INDEX "SignatureCustodyEvent_tenant_batch_created_idx" ON "SignatureCustodyEvent"("tenantId", "batchId", "createdAt");
CREATE INDEX "SignatureCustodyEvent_tenant_actor_created_idx" ON "SignatureCustodyEvent"("tenantId", "actorUserId", "createdAt");

CREATE UNIQUE INDEX "SignatureAuthorityResult_id_tenant_key" ON "SignatureAuthorityResult"("id", "tenantId");
CREATE UNIQUE INDEX "SignatureAuthorityResult_command_tenant_key" ON "SignatureAuthorityResult"("commandId", "tenantId");
CREATE INDEX "SignatureAuthorityResult_tenant_plan_created_idx" ON "SignatureAuthorityResult"("tenantId", "planId", "createdAt");

CREATE UNIQUE INDEX "SignatureAuthorityResultReview_id_tenant_key" ON "SignatureAuthorityResultReview"("id", "tenantId");
CREATE UNIQUE INDEX "SignatureAuthorityResultReview_result_tenant_key" ON "SignatureAuthorityResultReview"("resultId", "tenantId");
CREATE UNIQUE INDEX "SignatureAuthorityResultReview_command_tenant_key" ON "SignatureAuthorityResultReview"("commandId", "tenantId");
CREATE INDEX "SignatureAuthorityResultReview_tenant_reviewer_idx" ON "SignatureAuthorityResultReview"("tenantId", "reviewedById", "reviewedAt");

ALTER TABLE "SignatureCollectionCommand" ADD CONSTRAINT "SignatureCollectionCommand_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCollectionCommand" ADD CONSTRAINT "SignatureCollectionCommand_actor_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignatureCollectionPlan" ADD CONSTRAINT "SignatureCollectionPlan_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCollectionPlan" ADD CONSTRAINT "SignatureCollectionPlan_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCollectionPlan" ADD CONSTRAINT "SignatureCollectionPlan_command_fkey" FOREIGN KEY ("initialCommandId", "tenantId") REFERENCES "SignatureCollectionCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCollectionPlan" ADD CONSTRAINT "SignatureCollectionPlan_file_owner_fkey" FOREIGN KEY ("fileOwnerUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCollectionPlan" ADD CONSTRAINT "SignatureCollectionPlan_custody_owner_fkey" FOREIGN KEY ("custodyOwnerUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCollectionPlan" ADD CONSTRAINT "SignatureCollectionPlan_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignatureCollectionBatch" ADD CONSTRAINT "SignatureCollectionBatch_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCollectionBatch" ADD CONSTRAINT "SignatureCollectionBatch_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCollectionBatch" ADD CONSTRAINT "SignatureCollectionBatch_plan_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES "SignatureCollectionPlan"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCollectionBatch" ADD CONSTRAINT "SignatureCollectionBatch_command_fkey" FOREIGN KEY ("initialCommandId", "tenantId") REFERENCES "SignatureCollectionCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCollectionBatch" ADD CONSTRAINT "SignatureCollectionBatch_custodian_fkey" FOREIGN KEY ("currentCustodianUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignatureCustodyEvent" ADD CONSTRAINT "SignatureCustodyEvent_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCustodyEvent" ADD CONSTRAINT "SignatureCustodyEvent_batch_fkey" FOREIGN KEY ("batchId", "tenantId") REFERENCES "SignatureCollectionBatch"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCustodyEvent" ADD CONSTRAINT "SignatureCustodyEvent_command_fkey" FOREIGN KEY ("commandId", "tenantId") REFERENCES "SignatureCollectionCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCustodyEvent" ADD CONSTRAINT "SignatureCustodyEvent_actor_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureCustodyEvent" ADD CONSTRAINT "SignatureCustodyEvent_receiver_fkey" FOREIGN KEY ("receiverUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignatureAuthorityResult" ADD CONSTRAINT "SignatureAuthorityResult_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureAuthorityResult" ADD CONSTRAINT "SignatureAuthorityResult_plan_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES "SignatureCollectionPlan"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureAuthorityResult" ADD CONSTRAINT "SignatureAuthorityResult_command_fkey" FOREIGN KEY ("commandId", "tenantId") REFERENCES "SignatureCollectionCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureAuthorityResult" ADD CONSTRAINT "SignatureAuthorityResult_recorder_fkey" FOREIGN KEY ("recordedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SignatureAuthorityResultReview" ADD CONSTRAINT "SignatureAuthorityResultReview_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureAuthorityResultReview" ADD CONSTRAINT "SignatureAuthorityResultReview_result_fkey" FOREIGN KEY ("resultId", "tenantId") REFERENCES "SignatureAuthorityResult"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureAuthorityResultReview" ADD CONSTRAINT "SignatureAuthorityResultReview_command_fkey" FOREIGN KEY ("commandId", "tenantId") REFERENCES "SignatureCollectionCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SignatureAuthorityResultReview" ADD CONSTRAINT "SignatureAuthorityResultReview_reviewer_fkey" FOREIGN KEY ("reviewedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_signature_collection_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'SignatureCollectionCommand',
    'SignatureCustodyEvent',
    'SignatureAuthorityResult',
    'SignatureAuthorityResultReview'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_signature_collection_ledger_mutation()',
      table_name || '_prevent_update_delete',
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION prevent_signature_collection_ledger_mutation()',
      table_name || '_prevent_truncate',
      table_name
    );
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', table_name, table_name || '_prevent_update_delete');
    EXECUTE format('ALTER TABLE %I ENABLE ALWAYS TRIGGER %I', table_name, table_name || '_prevent_truncate');
  END LOOP;
END $$;

COMMIT;
