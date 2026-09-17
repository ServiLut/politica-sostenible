BEGIN;

-- Calendar evidence is uploaded directly to private storage. NestJS only
-- consumes a previously confirmed StoredObject; no document bytes cross it.
ALTER TYPE "StorageObjectModule"
  ADD VALUE IF NOT EXISTS 'ELECTORAL_CALENDAR';

-- Multi-word Storage modules use a hyphen in the signed object path while the
-- PostgreSQL enum uses an underscore. Preserve the strict three-segment,
-- tenant-first scope check and normalize only that module segment.
ALTER TABLE "StoredObject"
  DROP CONSTRAINT "StoredObject_path_scope_check",
  ADD CONSTRAINT "StoredObject_path_scope_check" CHECK (
    split_part("path", '/', 1) = "tenantId"
    AND split_part("path", '/', 2) = replace(lower("module"::text), '_', '-')
    AND array_length(string_to_array("path", '/'), 1) = 3
    AND split_part("path", '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]{2,10}$'
  );

-- Task did not previously expose its tenant-scoped candidate key. The global
-- primary key makes this safe for existing rows and enables a composite FK.
CREATE UNIQUE INDEX "Task_id_tenant_key" ON "Task"("id", "tenantId");

CREATE TYPE "ElectoralCalendarReleaseStatus" AS ENUM (
  'STAGED', 'VALIDATED', 'ACTIVE', 'SUPERSEDED'
);
CREATE TYPE "ElectoralCalendarMilestoneCategory" AS ENUM (
  'REGISTRATION', 'SIGNATURES', 'CAMPAIGN', 'ELECTION_PREPARATION',
  'ELECTION_DAY', 'SCRUTINY', 'FINANCE', 'DATA_GOVERNANCE', 'INTERNAL'
);
CREATE TYPE "ElectoralCalendarMilestoneSemantics" AS ENUM (
  'INFORMATIONAL', 'INTERNAL_TARGET', 'EXTERNAL_DEADLINE'
);
CREATE TYPE "ElectoralCalendarDecisionAction" AS ENUM (
  'VALIDATE', 'ACTIVATE', 'SUPERSEDE'
);
CREATE TYPE "ElectoralCalendarResultOutcome" AS ENUM (
  'COMPLETED', 'NOT_APPLICABLE', 'MISSED', 'CANCELLED'
);
CREATE TYPE "ElectoralCalendarResultReviewDecision" AS ENUM (
  'APPROVE', 'REJECT'
);
CREATE TYPE "ElectoralCalendarCommandType" AS ENUM (
  'RELEASE_STAGE', 'RELEASE_VALIDATE', 'RELEASE_ACTIVATE',
  'MILESTONE_RESULT_RECORD', 'MILESTONE_RESULT_REVIEW'
);

CREATE TABLE "ElectoralCalendarCommand" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "ElectoralCalendarCommandType" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "resourceType" VARCHAR(80) NOT NULL,
  "resourceId" UUID NOT NULL,
  "resultSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ElectoralCalendarCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ElectoralCalendarCommand_hash_check"
    CHECK ("payloadSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ElectoralCalendarCommand_resource_check"
    CHECK (char_length(btrim("resourceType")) BETWEEN 2 AND 80)
);

CREATE TABLE "ElectoralCalendarRelease" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "initialCommandId" UUID NOT NULL,
  "basedOnReleaseId" UUID,
  "electionType" "ElectoralContestType" NOT NULL,
  "electionDate" DATE NOT NULL,
  "circumscriptionType" "ElectoralCircumscriptionType" NOT NULL,
  "circumscriptionName" VARCHAR(160) NOT NULL,
  "circumscriptionCode" VARCHAR(64),
  "roundCode" VARCHAR(64) NOT NULL,
  "versionLabel" VARCHAR(80) NOT NULL,
  "status" "ElectoralCalendarReleaseStatus" NOT NULL DEFAULT 'STAGED',
  "sourceAuthority" VARCHAR(300) NOT NULL,
  "sourceUrl" VARCHAR(2048) NOT NULL,
  "sourceReference" VARCHAR(1000) NOT NULL,
  "sourcePublishedAt" DATE NOT NULL,
  "sourceCutoffAt" TIMESTAMP(3) NOT NULL,
  "sourceSha256" CHAR(64) NOT NULL,
  "createdById" TEXT NOT NULL,
  "validatedById" TEXT,
  "validatedAt" TIMESTAMP(3),
  "activatedById" TEXT,
  "activatedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ElectoralCalendarRelease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ElectoralCalendarRelease_source_check" CHECK (
    "sourceUrl" ~ '^https://[^[:space:]]+$'
    AND "sourceSha256" ~ '^[a-f0-9]{64}$'
    AND char_length(btrim("sourceAuthority")) >= 2
    AND char_length(btrim("sourceReference")) >= 5
  ),
  CONSTRAINT "ElectoralCalendarRelease_scope_check" CHECK (
    char_length(btrim("circumscriptionName")) >= 2
    AND char_length(btrim("roundCode")) BETWEEN 1 AND 64
    AND char_length(btrim("versionLabel")) BETWEEN 1 AND 80
  ),
  CONSTRAINT "ElectoralCalendarRelease_dates_check" CHECK (
    "sourceCutoffAt" >= "sourcePublishedAt"::timestamp
  ),
  CONSTRAINT "ElectoralCalendarRelease_version_check" CHECK ("version" > 0),
  CONSTRAINT "ElectoralCalendarRelease_state_shape_check" CHECK (
    ("status" = 'STAGED' AND "validatedById" IS NULL AND "validatedAt" IS NULL
      AND "activatedById" IS NULL AND "activatedAt" IS NULL AND "supersededAt" IS NULL)
    OR
    ("status" = 'VALIDATED' AND "validatedById" IS NOT NULL AND "validatedAt" IS NOT NULL
      AND "activatedById" IS NULL AND "activatedAt" IS NULL AND "supersededAt" IS NULL
      AND "createdById" <> "validatedById")
    OR
    ("status" = 'ACTIVE' AND "validatedById" IS NOT NULL AND "validatedAt" IS NOT NULL
      AND "activatedById" IS NOT NULL AND "activatedAt" IS NOT NULL AND "supersededAt" IS NULL
      AND "createdById" <> "validatedById" AND "createdById" <> "activatedById")
    OR
    ("status" = 'SUPERSEDED' AND "validatedById" IS NOT NULL AND "validatedAt" IS NOT NULL
      AND "activatedById" IS NOT NULL AND "activatedAt" IS NOT NULL AND "supersededAt" IS NOT NULL
      AND "createdById" <> "validatedById" AND "createdById" <> "activatedById")
  )
);

CREATE TABLE "ElectoralCalendarMilestone" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "releaseId" UUID NOT NULL,
  "stableKey" VARCHAR(80) NOT NULL,
  "category" "ElectoralCalendarMilestoneCategory" NOT NULL,
  "semantics" "ElectoralCalendarMilestoneSemantics" NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "applicabilityRule" VARCHAR(2000) NOT NULL,
  "originalTextSummary" VARCHAR(3000) NOT NULL,
  "localDate" DATE NOT NULL,
  "localTime" VARCHAR(5),
  "timeZone" VARCHAR(100) NOT NULL,
  "occursAtUtc" TIMESTAMP(3),
  "responsibleUserId" TEXT,
  "backupUserId" TEXT,
  "alertOffsetsDays" INTEGER[] NOT NULL,
  "stageGateRequired" BOOLEAN NOT NULL DEFAULT false,
  "resultEvidenceRequired" BOOLEAN NOT NULL DEFAULT false,
  "linkedTaskId" TEXT,
  "linkedEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ElectoralCalendarMilestone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ElectoralCalendarMilestone_text_check" CHECK (
    "stableKey" ~ '^[A-Z0-9][A-Z0-9._-]{0,79}$'
    AND char_length(btrim("title")) >= 3
    AND char_length(btrim("applicabilityRule")) >= 5
    AND char_length(btrim("originalTextSummary")) >= 5
  ),
  CONSTRAINT "ElectoralCalendarMilestone_time_check" CHECK (
    char_length(btrim("timeZone")) BETWEEN 3 AND 100
    AND (
      ("localTime" IS NULL AND "occursAtUtc" IS NULL)
      OR
      ("localTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "occursAtUtc" IS NOT NULL)
    )
  ),
  CONSTRAINT "ElectoralCalendarMilestone_owner_check" CHECK (
    ("responsibleUserId" IS NULL OR "backupUserId" IS NULL OR "responsibleUserId" <> "backupUserId")
    AND (
      "semantics" <> 'EXTERNAL_DEADLINE'
      OR ("responsibleUserId" IS NOT NULL AND "backupUserId" IS NOT NULL
          AND "responsibleUserId" <> "backupUserId")
    )
  ),
  CONSTRAINT "ElectoralCalendarMilestone_alerts_check" CHECK (
    cardinality("alertOffsetsDays") BETWEEN 1 AND 6
    AND "alertOffsetsDays" <@ ARRAY[0, 1, 3, 7, 15, 30]::INTEGER[]
  ),
  CONSTRAINT "ElectoralCalendarMilestone_gate_check" CHECK (
    NOT "stageGateRequired" OR "semantics" = 'EXTERNAL_DEADLINE'
  )
);

CREATE TABLE "ElectoralCalendarReleaseDecision" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "releaseId" UUID NOT NULL,
  "commandId" UUID NOT NULL,
  "action" "ElectoralCalendarDecisionAction" NOT NULL,
  "sourceReviewedAcknowledged" BOOLEAN NOT NULL,
  "diffReviewedAcknowledged" BOOLEAN NOT NULL,
  "affectedTasksResolvedAcknowledged" BOOLEAN NOT NULL,
  "rationale" VARCHAR(2000) NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ElectoralCalendarReleaseDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ElectoralCalendarDecision_rationale_check"
    CHECK (char_length(btrim("rationale")) >= 10),
  CONSTRAINT "ElectoralCalendarDecision_ack_check" CHECK (
    ("action" = 'VALIDATE' AND "sourceReviewedAcknowledged")
    OR
    ("action" IN ('ACTIVATE', 'SUPERSEDE')
      AND "sourceReviewedAcknowledged"
      AND "diffReviewedAcknowledged"
      AND "affectedTasksResolvedAcknowledged")
  )
);

CREATE TABLE "ElectoralCalendarMilestoneResult" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "releaseId" UUID NOT NULL,
  "milestoneId" UUID NOT NULL,
  "commandId" UUID NOT NULL,
  "outcome" "ElectoralCalendarResultOutcome" NOT NULL,
  "explanation" VARCHAR(3000) NOT NULL,
  "evidenceStoredObjectId" TEXT,
  "evidencePath" VARCHAR(512),
  "evidenceSha256" CHAR(64),
  "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ElectoralCalendarMilestoneResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ElectoralCalendarResult_explanation_check"
    CHECK (char_length(btrim("explanation")) >= 10),
  CONSTRAINT "ElectoralCalendarResult_evidence_shape_check" CHECK (
    ("evidenceStoredObjectId" IS NULL AND "evidencePath" IS NULL AND "evidenceSha256" IS NULL)
    OR
    ("evidenceStoredObjectId" IS NOT NULL AND "evidencePath" IS NOT NULL
      AND "evidenceSha256" ~ '^[a-f0-9]{64}$')
  )
);

CREATE TABLE "ElectoralCalendarResultReview" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "resultId" UUID NOT NULL,
  "commandId" UUID NOT NULL,
  "decision" "ElectoralCalendarResultReviewDecision" NOT NULL,
  "rationale" VARCHAR(2000) NOT NULL,
  "reviewedById" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ElectoralCalendarResultReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ElectoralCalendarReview_rationale_check"
    CHECK (char_length(btrim("rationale")) >= 10)
);

CREATE UNIQUE INDEX "ElectoralCalendarCommand_id_tenant_key"
  ON "ElectoralCalendarCommand"("id", "tenantId");
CREATE UNIQUE INDEX "ElectoralCalendarCommand_tenant_client_key"
  ON "ElectoralCalendarCommand"("tenantId", "clientRequestId");
CREATE INDEX "ElectoralCalendarCommand_profile_created_idx"
  ON "ElectoralCalendarCommand"("tenantId", "operationProfileId", "createdAt");

CREATE UNIQUE INDEX "ElectoralCalendarRelease_id_tenant_key"
  ON "ElectoralCalendarRelease"("id", "tenantId");
CREATE UNIQUE INDEX "ElectoralCalendarRelease_command_tenant_key"
  ON "ElectoralCalendarRelease"("initialCommandId", "tenantId");
CREATE UNIQUE INDEX "ElectoralCalendarRelease_version_scope_key"
  ON "ElectoralCalendarRelease"(
    "tenantId", "operationProfileId", "electionType", "electionDate", "roundCode", "versionLabel"
  );
CREATE UNIQUE INDEX "ElectoralCalendarRelease_one_active_round_key"
  ON "ElectoralCalendarRelease"("tenantId", "operationProfileId", "roundCode")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "ElectoralCalendarRelease_scope_status_idx"
  ON "ElectoralCalendarRelease"("tenantId", "operationProfileId", "roundCode", "status");
CREATE INDEX "ElectoralCalendarRelease_source_hash_idx"
  ON "ElectoralCalendarRelease"("tenantId", "sourceSha256");

CREATE UNIQUE INDEX "ElectoralCalendarMilestone_id_tenant_key"
  ON "ElectoralCalendarMilestone"("id", "tenantId");
CREATE UNIQUE INDEX "ElectoralCalendarMilestone_release_key"
  ON "ElectoralCalendarMilestone"("tenantId", "releaseId", "stableKey");
CREATE INDEX "ElectoralCalendarMilestone_release_date_idx"
  ON "ElectoralCalendarMilestone"("tenantId", "releaseId", "localDate");
CREATE INDEX "ElectoralCalendarMilestone_owner_date_idx"
  ON "ElectoralCalendarMilestone"("tenantId", "responsibleUserId", "localDate");
CREATE INDEX "ElectoralCalendarMilestone_gate_idx"
  ON "ElectoralCalendarMilestone"("tenantId", "category", "stageGateRequired");

CREATE UNIQUE INDEX "ElectoralCalendarDecision_id_tenant_key"
  ON "ElectoralCalendarReleaseDecision"("id", "tenantId");
CREATE UNIQUE INDEX "ElectoralCalendarDecision_command_tenant_key"
  ON "ElectoralCalendarReleaseDecision"("commandId", "tenantId");
CREATE UNIQUE INDEX "ElectoralCalendarDecision_release_action_key"
  ON "ElectoralCalendarReleaseDecision"("tenantId", "releaseId", "action");
CREATE INDEX "ElectoralCalendarDecision_release_created_idx"
  ON "ElectoralCalendarReleaseDecision"("tenantId", "releaseId", "createdAt");

CREATE UNIQUE INDEX "ElectoralCalendarResult_id_tenant_key"
  ON "ElectoralCalendarMilestoneResult"("id", "tenantId");
CREATE UNIQUE INDEX "ElectoralCalendarResult_command_tenant_key"
  ON "ElectoralCalendarMilestoneResult"("commandId", "tenantId");
CREATE UNIQUE INDEX "ElectoralCalendarResult_storage_tenant_key"
  ON "ElectoralCalendarMilestoneResult"("evidenceStoredObjectId", "tenantId");
CREATE INDEX "ElectoralCalendarResult_milestone_recorded_idx"
  ON "ElectoralCalendarMilestoneResult"("tenantId", "milestoneId", "recordedAt");

CREATE UNIQUE INDEX "ElectoralCalendarReview_id_tenant_key"
  ON "ElectoralCalendarResultReview"("id", "tenantId");
CREATE UNIQUE INDEX "ElectoralCalendarReview_result_tenant_key"
  ON "ElectoralCalendarResultReview"("resultId", "tenantId");
CREATE UNIQUE INDEX "ElectoralCalendarReview_command_tenant_key"
  ON "ElectoralCalendarResultReview"("commandId", "tenantId");
CREATE INDEX "ElectoralCalendarReview_reviewer_idx"
  ON "ElectoralCalendarResultReview"("tenantId", "reviewedById", "reviewedAt");

ALTER TABLE "ElectoralCalendarCommand"
  ADD CONSTRAINT "ElectoralCalendarCommand_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarCommand_profile_fkey"
  FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarCommand_actor_fkey"
  FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectoralCalendarRelease"
  ADD CONSTRAINT "ElectoralCalendarRelease_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarRelease_profile_fkey"
  FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarRelease_command_fkey"
  FOREIGN KEY ("initialCommandId", "tenantId") REFERENCES "ElectoralCalendarCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarRelease_based_on_fkey"
  FOREIGN KEY ("basedOnReleaseId", "tenantId") REFERENCES "ElectoralCalendarRelease"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarRelease_creator_fkey"
  FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarRelease_validator_fkey"
  FOREIGN KEY ("validatedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarRelease_activator_fkey"
  FOREIGN KEY ("activatedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectoralCalendarMilestone"
  ADD CONSTRAINT "ElectoralCalendarMilestone_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarMilestone_profile_fkey"
  FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarMilestone_release_fkey"
  FOREIGN KEY ("releaseId", "tenantId") REFERENCES "ElectoralCalendarRelease"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarMilestone_owner_fkey"
  FOREIGN KEY ("responsibleUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarMilestone_backup_fkey"
  FOREIGN KEY ("backupUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarMilestone_task_fkey"
  FOREIGN KEY ("linkedTaskId", "tenantId") REFERENCES "Task"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarMilestone_event_fkey"
  FOREIGN KEY ("linkedEventId", "tenantId") REFERENCES "CampaignEvent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectoralCalendarReleaseDecision"
  ADD CONSTRAINT "ElectoralCalendarDecision_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarDecision_profile_fkey"
  FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarDecision_release_fkey"
  FOREIGN KEY ("releaseId", "tenantId") REFERENCES "ElectoralCalendarRelease"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarDecision_command_fkey"
  FOREIGN KEY ("commandId", "tenantId") REFERENCES "ElectoralCalendarCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarDecision_actor_fkey"
  FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectoralCalendarMilestoneResult"
  ADD CONSTRAINT "ElectoralCalendarResult_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarResult_profile_fkey"
  FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarResult_release_fkey"
  FOREIGN KEY ("releaseId", "tenantId") REFERENCES "ElectoralCalendarRelease"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarResult_milestone_fkey"
  FOREIGN KEY ("milestoneId", "tenantId") REFERENCES "ElectoralCalendarMilestone"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarResult_command_fkey"
  FOREIGN KEY ("commandId", "tenantId") REFERENCES "ElectoralCalendarCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarResult_storage_fkey"
  FOREIGN KEY ("evidenceStoredObjectId", "tenantId") REFERENCES "StoredObject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarResult_recorder_fkey"
  FOREIGN KEY ("recordedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectoralCalendarResultReview"
  ADD CONSTRAINT "ElectoralCalendarReview_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarReview_profile_fkey"
  FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarReview_result_fkey"
  FOREIGN KEY ("resultId", "tenantId") REFERENCES "ElectoralCalendarMilestoneResult"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarReview_command_fkey"
  FOREIGN KEY ("commandId", "tenantId") REFERENCES "ElectoralCalendarCommand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ElectoralCalendarReview_reviewer_fkey"
  FOREIGN KEY ("reviewedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "electoral_calendar_append_only_guard"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ElectoralCalendarCommand_append_only"
  BEFORE UPDATE OR DELETE ON "ElectoralCalendarCommand"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
CREATE TRIGGER "ElectoralCalendarMilestone_append_only"
  BEFORE UPDATE OR DELETE ON "ElectoralCalendarMilestone"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
CREATE TRIGGER "ElectoralCalendarReleaseDecision_append_only"
  BEFORE UPDATE OR DELETE ON "ElectoralCalendarReleaseDecision"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
CREATE TRIGGER "ElectoralCalendarMilestoneResult_append_only"
  BEFORE UPDATE OR DELETE ON "ElectoralCalendarMilestoneResult"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
CREATE TRIGGER "ElectoralCalendarResultReview_append_only"
  BEFORE UPDATE OR DELETE ON "ElectoralCalendarResultReview"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
CREATE TRIGGER "ElectoralCalendarCommand_no_truncate"
  BEFORE TRUNCATE ON "ElectoralCalendarCommand"
  FOR EACH STATEMENT EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
CREATE TRIGGER "ElectoralCalendarMilestone_no_truncate"
  BEFORE TRUNCATE ON "ElectoralCalendarMilestone"
  FOR EACH STATEMENT EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
CREATE TRIGGER "ElectoralCalendarReleaseDecision_no_truncate"
  BEFORE TRUNCATE ON "ElectoralCalendarReleaseDecision"
  FOR EACH STATEMENT EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
CREATE TRIGGER "ElectoralCalendarMilestoneResult_no_truncate"
  BEFORE TRUNCATE ON "ElectoralCalendarMilestoneResult"
  FOR EACH STATEMENT EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
CREATE TRIGGER "ElectoralCalendarResultReview_no_truncate"
  BEFORE TRUNCATE ON "ElectoralCalendarResultReview"
  FOR EACH STATEMENT EXECUTE FUNCTION "electoral_calendar_append_only_guard"();

ALTER TABLE "ElectoralCalendarCommand" ENABLE ALWAYS TRIGGER "ElectoralCalendarCommand_append_only";
ALTER TABLE "ElectoralCalendarCommand" ENABLE ALWAYS TRIGGER "ElectoralCalendarCommand_no_truncate";
ALTER TABLE "ElectoralCalendarMilestone" ENABLE ALWAYS TRIGGER "ElectoralCalendarMilestone_append_only";
ALTER TABLE "ElectoralCalendarMilestone" ENABLE ALWAYS TRIGGER "ElectoralCalendarMilestone_no_truncate";
ALTER TABLE "ElectoralCalendarReleaseDecision" ENABLE ALWAYS TRIGGER "ElectoralCalendarReleaseDecision_append_only";
ALTER TABLE "ElectoralCalendarReleaseDecision" ENABLE ALWAYS TRIGGER "ElectoralCalendarReleaseDecision_no_truncate";
ALTER TABLE "ElectoralCalendarMilestoneResult" ENABLE ALWAYS TRIGGER "ElectoralCalendarMilestoneResult_append_only";
ALTER TABLE "ElectoralCalendarMilestoneResult" ENABLE ALWAYS TRIGGER "ElectoralCalendarMilestoneResult_no_truncate";
ALTER TABLE "ElectoralCalendarResultReview" ENABLE ALWAYS TRIGGER "ElectoralCalendarResultReview_append_only";
ALTER TABLE "ElectoralCalendarResultReview" ENABLE ALWAYS TRIGGER "ElectoralCalendarResultReview_no_truncate";

CREATE OR REPLACE FUNCTION "electoral_calendar_release_insert_guard"()
RETURNS TRIGGER AS $$
DECLARE
  command_row "ElectoralCalendarCommand"%ROWTYPE;
  baseline_row "ElectoralCalendarRelease"%ROWTYPE;
BEGIN
  IF NEW."status" <> 'STAGED' THEN
    RAISE EXCEPTION 'calendar releases must be inserted as STAGED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO command_row FROM "ElectoralCalendarCommand"
    WHERE "id" = NEW."initialCommandId" AND "tenantId" = NEW."tenantId";
  IF NOT FOUND OR command_row."type" <> 'RELEASE_STAGE'
     OR command_row."actorUserId" <> NEW."createdById"
     OR command_row."operationProfileId" <> NEW."operationProfileId"
     OR command_row."resourceId" <> NEW."id" THEN
    RAISE EXCEPTION 'release command does not match calendar package' USING ERRCODE = '23514';
  END IF;

  IF NEW."basedOnReleaseId" IS NOT NULL THEN
    SELECT * INTO baseline_row FROM "ElectoralCalendarRelease"
      WHERE "id" = NEW."basedOnReleaseId" AND "tenantId" = NEW."tenantId";
    IF NOT FOUND OR baseline_row."operationProfileId" <> NEW."operationProfileId"
       OR baseline_row."electionType" <> NEW."electionType"
       OR baseline_row."electionDate" <> NEW."electionDate"
       OR baseline_row."roundCode" <> NEW."roundCode" THEN
      RAISE EXCEPTION 'baseline release is outside this election/round/profile' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ElectoralCalendarRelease_insert_guard"
  BEFORE INSERT ON "ElectoralCalendarRelease"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_release_insert_guard"();

CREATE OR REPLACE FUNCTION "electoral_calendar_release_transition_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(
    NEW."tenantId", NEW."operationProfileId", NEW."initialCommandId", NEW."basedOnReleaseId",
    NEW."electionType", NEW."electionDate", NEW."circumscriptionType",
    NEW."circumscriptionName", NEW."circumscriptionCode", NEW."roundCode", NEW."versionLabel",
    NEW."sourceAuthority", NEW."sourceUrl", NEW."sourceReference", NEW."sourcePublishedAt",
    NEW."sourceCutoffAt", NEW."sourceSha256", NEW."createdById", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."tenantId", OLD."operationProfileId", OLD."initialCommandId", OLD."basedOnReleaseId",
    OLD."electionType", OLD."electionDate", OLD."circumscriptionType",
    OLD."circumscriptionName", OLD."circumscriptionCode", OLD."roundCode", OLD."versionLabel",
    OLD."sourceAuthority", OLD."sourceUrl", OLD."sourceReference", OLD."sourcePublishedAt",
    OLD."sourceCutoffAt", OLD."sourceSha256", OLD."createdById", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'calendar release contents are immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = 'STAGED' AND NEW."status" = 'VALIDATED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "ElectoralCalendarReleaseDecision" d
      WHERE d."tenantId" = NEW."tenantId" AND d."releaseId" = NEW."id"
        AND d."action" = 'VALIDATE' AND d."actorUserId" = NEW."validatedById"
    ) THEN
      RAISE EXCEPTION 'VALIDATED requires its append-only decision' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD."status" = 'VALIDATED' AND NEW."status" = 'ACTIVE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "ElectoralCalendarReleaseDecision" d
      WHERE d."tenantId" = NEW."tenantId" AND d."releaseId" = NEW."id"
        AND d."action" = 'ACTIVATE' AND d."actorUserId" = NEW."activatedById"
    ) OR NOT EXISTS (
      SELECT 1 FROM "ElectoralCalendarMilestone" m
      WHERE m."tenantId" = NEW."tenantId" AND m."releaseId" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'ACTIVE requires decision and at least one milestone' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD."status" = 'ACTIVE' AND NEW."status" = 'SUPERSEDED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "ElectoralCalendarReleaseDecision" d
      WHERE d."tenantId" = NEW."tenantId" AND d."releaseId" = NEW."id"
        AND d."action" = 'SUPERSEDE'
    ) THEN
      RAISE EXCEPTION 'SUPERSEDED requires its append-only decision' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid calendar release transition % -> %', OLD."status", NEW."status"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ElectoralCalendarRelease_transition_guard"
  BEFORE UPDATE ON "ElectoralCalendarRelease"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_release_transition_guard"();
CREATE TRIGGER "ElectoralCalendarRelease_no_delete"
  BEFORE DELETE ON "ElectoralCalendarRelease"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
CREATE TRIGGER "ElectoralCalendarRelease_no_truncate"
  BEFORE TRUNCATE ON "ElectoralCalendarRelease"
  FOR EACH STATEMENT EXECUTE FUNCTION "electoral_calendar_append_only_guard"();
ALTER TABLE "ElectoralCalendarRelease" ENABLE ALWAYS TRIGGER "ElectoralCalendarRelease_insert_guard";
ALTER TABLE "ElectoralCalendarRelease" ENABLE ALWAYS TRIGGER "ElectoralCalendarRelease_transition_guard";
ALTER TABLE "ElectoralCalendarRelease" ENABLE ALWAYS TRIGGER "ElectoralCalendarRelease_no_delete";
ALTER TABLE "ElectoralCalendarRelease" ENABLE ALWAYS TRIGGER "ElectoralCalendarRelease_no_truncate";

CREATE OR REPLACE FUNCTION "electoral_calendar_decision_guard"()
RETURNS TRIGGER AS $$
DECLARE
  release_row "ElectoralCalendarRelease"%ROWTYPE;
  command_row "ElectoralCalendarCommand"%ROWTYPE;
BEGIN
  SELECT * INTO release_row FROM "ElectoralCalendarRelease"
    WHERE "id" = NEW."releaseId" AND "tenantId" = NEW."tenantId" FOR UPDATE;
  IF NOT FOUND OR release_row."operationProfileId" <> NEW."operationProfileId"
     OR release_row."createdById" = NEW."actorUserId" THEN
    RAISE EXCEPTION 'calendar decision violates profile or four-eyes control' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO command_row FROM "ElectoralCalendarCommand"
    WHERE "id" = NEW."commandId" AND "tenantId" = NEW."tenantId";
  IF NOT FOUND OR command_row."actorUserId" <> NEW."actorUserId"
     OR command_row."operationProfileId" <> NEW."operationProfileId"
     OR command_row."resourceId" <> NEW."releaseId"
     OR (NEW."action" = 'VALIDATE' AND command_row."type" <> 'RELEASE_VALIDATE')
     OR (NEW."action" IN ('ACTIVATE', 'SUPERSEDE') AND command_row."type" <> 'RELEASE_ACTIVATE') THEN
    RAISE EXCEPTION 'decision command does not match release or actor' USING ERRCODE = '23514';
  END IF;
  IF (NEW."action" = 'VALIDATE' AND release_row."status" <> 'STAGED')
     OR (NEW."action" = 'ACTIVATE' AND release_row."status" <> 'VALIDATED')
     OR (NEW."action" = 'SUPERSEDE' AND release_row."status" <> 'ACTIVE') THEN
    RAISE EXCEPTION 'decision does not match current release state' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ElectoralCalendarReleaseDecision_insert_guard"
  BEFORE INSERT ON "ElectoralCalendarReleaseDecision"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_decision_guard"();
ALTER TABLE "ElectoralCalendarReleaseDecision" ENABLE ALWAYS TRIGGER "ElectoralCalendarReleaseDecision_insert_guard";

CREATE OR REPLACE FUNCTION "electoral_calendar_result_guard"()
RETURNS TRIGGER AS $$
DECLARE
  milestone_row "ElectoralCalendarMilestone"%ROWTYPE;
  release_status "ElectoralCalendarReleaseStatus";
  object_row "StoredObject"%ROWTYPE;
  command_row "ElectoralCalendarCommand"%ROWTYPE;
BEGIN
  SELECT * INTO milestone_row FROM "ElectoralCalendarMilestone"
    WHERE "id" = NEW."milestoneId" AND "tenantId" = NEW."tenantId" FOR UPDATE;
  IF NOT FOUND OR milestone_row."operationProfileId" <> NEW."operationProfileId"
     OR milestone_row."releaseId" <> NEW."releaseId" THEN
    RAISE EXCEPTION 'result is outside the milestone release/profile' USING ERRCODE = '23514';
  END IF;
  SELECT "status" INTO release_status FROM "ElectoralCalendarRelease"
    WHERE "id" = NEW."releaseId" AND "tenantId" = NEW."tenantId";
  IF release_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'only an ACTIVE internal calendar accepts results' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO command_row FROM "ElectoralCalendarCommand"
    WHERE "id" = NEW."commandId" AND "tenantId" = NEW."tenantId";
  IF NOT FOUND OR command_row."type" <> 'MILESTONE_RESULT_RECORD'
     OR command_row."operationProfileId" <> NEW."operationProfileId"
     OR command_row."actorUserId" <> NEW."recordedById"
     OR command_row."resourceId" <> NEW."id" THEN
    RAISE EXCEPTION 'result command does not match result, profile or actor' USING ERRCODE = '23514';
  END IF;
  IF milestone_row."resultEvidenceRequired" AND NEW."evidenceStoredObjectId" IS NULL THEN
    RAISE EXCEPTION 'this milestone requires confirmed documentary evidence' USING ERRCODE = '23514';
  END IF;
  IF NEW."evidenceStoredObjectId" IS NOT NULL THEN
    SELECT * INTO object_row FROM "StoredObject"
      WHERE "id" = NEW."evidenceStoredObjectId" AND "tenantId" = NEW."tenantId" FOR UPDATE;
    IF NOT FOUND OR object_row."module" <> 'ELECTORAL_CALENDAR'
       OR object_row."status" <> 'CONFIRMED' OR object_row."consumedAt" IS NOT NULL
       OR object_row."path" <> NEW."evidencePath"
       OR object_row."expectedSha256" <> NEW."evidenceSha256"
       OR object_row."reportedSha256" <> NEW."evidenceSha256" THEN
      RAISE EXCEPTION 'calendar evidence is not a matching confirmed StoredObject' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ElectoralCalendarMilestoneResult_insert_guard"
  BEFORE INSERT ON "ElectoralCalendarMilestoneResult"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_result_guard"();
ALTER TABLE "ElectoralCalendarMilestoneResult" ENABLE ALWAYS TRIGGER "ElectoralCalendarMilestoneResult_insert_guard";

CREATE OR REPLACE FUNCTION "electoral_calendar_review_guard"()
RETURNS TRIGGER AS $$
DECLARE
  result_row "ElectoralCalendarMilestoneResult"%ROWTYPE;
  command_row "ElectoralCalendarCommand"%ROWTYPE;
BEGIN
  SELECT * INTO result_row FROM "ElectoralCalendarMilestoneResult"
    WHERE "id" = NEW."resultId" AND "tenantId" = NEW."tenantId" FOR UPDATE;
  IF NOT FOUND OR result_row."operationProfileId" <> NEW."operationProfileId"
     OR result_row."recordedById" = NEW."reviewedById" THEN
    RAISE EXCEPTION 'result review violates profile or four-eyes control' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO command_row FROM "ElectoralCalendarCommand"
    WHERE "id" = NEW."commandId" AND "tenantId" = NEW."tenantId";
  IF NOT FOUND OR command_row."type" <> 'MILESTONE_RESULT_REVIEW'
     OR command_row."operationProfileId" <> NEW."operationProfileId"
     OR command_row."actorUserId" <> NEW."reviewedById"
     OR command_row."resourceId" <> NEW."resultId" THEN
    RAISE EXCEPTION 'review command does not match result, profile or actor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ElectoralCalendarResultReview_insert_guard"
  BEFORE INSERT ON "ElectoralCalendarResultReview"
  FOR EACH ROW EXECUTE FUNCTION "electoral_calendar_review_guard"();
ALTER TABLE "ElectoralCalendarResultReview" ENABLE ALWAYS TRIGGER "ElectoralCalendarResultReview_insert_guard";

COMMIT;
