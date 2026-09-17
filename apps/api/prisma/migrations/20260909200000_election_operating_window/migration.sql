-- A documented civil-date operating window for electoral activity.
-- Existing profiles and adoption requests remain single-day: start=end is
-- backfilled from the declared UTC civil components kept by electionDate.
-- Reinterpreting UTC midnight as a Bogota instant would shift YYYY-MM-DD back
-- one day, so only evaluated request instants are converted to Bogota dates.
-- Existing offline grants are revoked because they predate the exact window
-- snapshot contract and cannot be safely reclassified.
BEGIN;

ALTER TABLE "OperationProfile"
  ADD COLUMN "votingStartDate" DATE,
  ADD COLUMN "votingEndDate" DATE,
  ADD COLUMN "votingWindowSourceUrl" VARCHAR(2048),
  ADD COLUMN "votingWindowReference" VARCHAR(500);

ALTER TABLE "OperationStageAdoptionRequest"
  ADD COLUMN "votingStartDate" DATE,
  ADD COLUMN "votingEndDate" DATE,
  ADD COLUMN "votingWindowSourceUrl" VARCHAR(2048),
  ADD COLUMN "votingWindowReference" VARCHAR(500);

ALTER TABLE "OfflineE14CaptureGrant"
  ADD COLUMN "votingStartDate" DATE,
  ADD COLUMN "votingEndDate" DATE,
  ADD COLUMN "electionWindowSha256" CHAR(64);

-- CLOSED profiles and adoption payloads are application-immutable. This
-- forward-only structural backfill temporarily disables only their mutation
-- fences and restores them as ALWAYS triggers before commit.
ALTER TABLE "OperationProfile"
  DISABLE TRIGGER "OperationProfile_prevent_closed_mutation";
ALTER TABLE "OperationStageAdoptionRequest"
  DISABLE TRIGGER "OperationStageAdoptionRequest_enforce_update";

UPDATE "OperationProfile"
SET
  "votingStartDate" = "electionDate"::date,
  "votingEndDate" = "electionDate"::date;

UPDATE "OperationStageAdoptionRequest"
SET
  "votingStartDate" = "electionDate"::date,
  "votingEndDate" = "electionDate"::date;

UPDATE "OfflineE14CaptureGrant"
SET
  "votingStartDate" = "electionDate",
  "votingEndDate" = "electionDate",
  "electionWindowSha256" = repeat('0', 64),
  "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP);

ALTER TABLE "OperationProfile"
  ALTER COLUMN "votingStartDate" SET NOT NULL,
  ALTER COLUMN "votingEndDate" SET NOT NULL;

ALTER TABLE "OperationStageAdoptionRequest"
  ALTER COLUMN "votingStartDate" SET NOT NULL,
  ALTER COLUMN "votingEndDate" SET NOT NULL;

ALTER TABLE "OfflineE14CaptureGrant"
  ALTER COLUMN "votingStartDate" SET NOT NULL,
  ALTER COLUMN "votingEndDate" SET NOT NULL,
  ALTER COLUMN "electionWindowSha256" SET NOT NULL;

ALTER TABLE "OperationProfile"
  ADD CONSTRAINT "OperationProfile_voting_window_dates_check" CHECK (
    "votingStartDate" <= "electionDate"::date
    AND "electionDate"::date <= "votingEndDate"
    AND ("votingEndDate" - "votingStartDate") BETWEEN 0 AND 13
  ),
  ADD CONSTRAINT "OperationProfile_voting_window_source_pair_check" CHECK (
    ("votingWindowSourceUrl" IS NULL) = ("votingWindowReference" IS NULL)
    AND (
      "votingWindowReference" IS NULL
      OR length(btrim("votingWindowReference")) BETWEEN 10 AND 500
    )
    AND (
      "votingStartDate" = "votingEndDate"
      OR "votingWindowSourceUrl" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "OperationProfile_voting_window_source_https_check" CHECK (
    "votingWindowSourceUrl" IS NULL
    OR (
      "votingWindowSourceUrl" ~* '^https://[^/@:[:space:]]+(?::[0-9]{1,5})?(?:[/?#]|$)'
      AND "votingWindowSourceUrl" !~ '[[:space:]]'
      AND "votingWindowSourceUrl" !~* '^https://[^/]*@'
    )
  );

ALTER TABLE "OperationStageAdoptionRequest"
  ADD CONSTRAINT "OperationStageAdoptionRequest_voting_window_dates_check" CHECK (
    "votingStartDate" <= "electionDate"::date
    AND "electionDate"::date <= "votingEndDate"
    AND ("votingEndDate" - "votingStartDate") BETWEEN 0 AND 13
  ),
  ADD CONSTRAINT "OperationStageAdoptionRequest_voting_window_source_pair_check" CHECK (
    ("votingWindowSourceUrl" IS NULL) = ("votingWindowReference" IS NULL)
    AND (
      "votingWindowReference" IS NULL
      OR length(btrim("votingWindowReference")) BETWEEN 10 AND 500
    )
    AND (
      "votingStartDate" = "votingEndDate"
      OR "votingWindowSourceUrl" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "OperationStageAdoptionRequest_voting_window_source_https_check" CHECK (
    "votingWindowSourceUrl" IS NULL
    OR (
      "votingWindowSourceUrl" ~* '^https://[^/@:[:space:]]+(?::[0-9]{1,5})?(?:[/?#]|$)'
      AND "votingWindowSourceUrl" !~ '[[:space:]]'
      AND "votingWindowSourceUrl" !~* '^https://[^/]*@'
    )
  );

ALTER TABLE "OfflineE14CaptureGrant"
  ADD CONSTRAINT "OfflineE14Grant_election_window_check" CHECK (
    "votingStartDate" <= "electionDate"
    AND "electionDate" <= "votingEndDate"
    AND ("votingEndDate" - "votingStartDate") BETWEEN 0 AND 13
  ),
  ADD CONSTRAINT "OfflineE14Grant_window_sha256_check" CHECK (
    "electionWindowSha256" ~ '^[0-9a-f]{64}$'
  );

CREATE INDEX "OperationProfile_tenant_voting_window_idx"
  ON "OperationProfile"("tenantId", "votingStartDate", "votingEndDate");
CREATE INDEX "OfflineE14Grant_tenant_window_idx"
  ON "OfflineE14CaptureGrant"(
    "tenantId",
    "operationProfileId",
    "votingStartDate",
    "votingEndDate"
  );

CREATE OR REPLACE FUNCTION "enforce_operation_stage_adoption_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    OLD."id", OLD."tenantId", OLD."clientRequestId", OLD."payloadSha256",
    OLD."operationType", OLD."targetStage", OLD."electionType",
    OLD."circumscriptionType", OLD."circumscriptionName",
    OLD."circumscriptionCode", OLD."listType", OLD."electionDate",
    OLD."votingStartDate", OLD."votingEndDate",
    OLD."votingWindowSourceUrl", OLD."votingWindowReference",
    OLD."expectedTeamSize", OLD."candidateCount", OLD."maxTotalBudget",
    OLD."maxPublicityLimit", OLD."dataControllerName",
    OLD."responsibleDataUserId", OLD."retentionPeriodDays",
    OLD."revocationProcedure", OLD."effectiveAt", OLD."justification",
    OLD."evidenceReference", OLD."evidenceSha256",
    OLD."incompleteHistoryAcknowledged", OLD."expiresAt",
    OLD."requestedById", OLD."createdAt"
  ) IS DISTINCT FROM ROW(
    NEW."id", NEW."tenantId", NEW."clientRequestId", NEW."payloadSha256",
    NEW."operationType", NEW."targetStage", NEW."electionType",
    NEW."circumscriptionType", NEW."circumscriptionName",
    NEW."circumscriptionCode", NEW."listType", NEW."electionDate",
    NEW."votingStartDate", NEW."votingEndDate",
    NEW."votingWindowSourceUrl", NEW."votingWindowReference",
    NEW."expectedTeamSize", NEW."candidateCount", NEW."maxTotalBudget",
    NEW."maxPublicityLimit", NEW."dataControllerName",
    NEW."responsibleDataUserId", NEW."retentionPeriodDays",
    NEW."revocationProcedure", NEW."effectiveAt", NEW."justification",
    NEW."evidenceReference", NEW."evidenceSha256",
    NEW."incompleteHistoryAcknowledged", NEW."expiresAt",
    NEW."requestedById", NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'El contenido de una solicitud de adopcion es inmutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = NEW."status" THEN
    IF OLD IS DISTINCT FROM NEW THEN
      RAISE EXCEPTION 'No se puede mutar una solicitud sin cambiar su estado'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" <> 'PENDING'
     OR NEW."status" NOT IN ('APPROVED', 'REJECTED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Transicion de solicitud de adopcion no permitida: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE "OperationProfile"
  ENABLE ALWAYS TRIGGER "OperationProfile_prevent_closed_mutation";
ALTER TABLE "OperationStageAdoptionRequest"
  ENABLE ALWAYS TRIGGER "OperationStageAdoptionRequest_enforce_update";

COMMIT;
