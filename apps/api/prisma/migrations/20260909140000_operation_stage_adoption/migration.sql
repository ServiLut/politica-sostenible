BEGIN;

CREATE TYPE "OperationStageAdoptionStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED'
);

CREATE TABLE "OperationStageAdoptionRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "status" "OperationStageAdoptionStatus" NOT NULL DEFAULT 'PENDING',
  "operationType" "PoliticalOperationType" NOT NULL,
  "targetStage" "PoliticalOperationStage" NOT NULL,
  "electionType" "ElectoralContestType" NOT NULL,
  "circumscriptionType" "ElectoralCircumscriptionType" NOT NULL,
  "circumscriptionName" VARCHAR(160) NOT NULL,
  "circumscriptionCode" VARCHAR(64),
  "listType" "CandidateListType",
  "electionDate" TIMESTAMP(3) NOT NULL,
  "expectedTeamSize" INTEGER NOT NULL,
  "candidateCount" INTEGER NOT NULL,
  "maxTotalBudget" DECIMAL(15,2) NOT NULL,
  "maxPublicityLimit" DECIMAL(15,2) NOT NULL,
  "dataControllerName" VARCHAR(200) NOT NULL,
  "responsibleDataUserId" TEXT NOT NULL,
  "retentionPeriodDays" INTEGER NOT NULL,
  "revocationProcedure" VARCHAR(2000) NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "justification" VARCHAR(4000) NOT NULL,
  "evidenceReference" VARCHAR(512) NOT NULL,
  "evidenceSha256" CHAR(64) NOT NULL,
  "incompleteHistoryAcknowledged" BOOLEAN NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "expiredAt" TIMESTAMP(3),
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewClientRequestId" UUID,
  "reviewPayloadSha256" CHAR(64),
  "rejectionReason" VARCHAR(2000),
  "operationProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationStageAdoptionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationStageAdoptionRequest_hashes_check" CHECK (
    "payloadSha256" ~ '^[0-9a-f]{64}$'
    AND "evidenceSha256" ~ '^[0-9a-f]{64}$'
    AND (
      "reviewPayloadSha256" IS NULL
      OR "reviewPayloadSha256" ~ '^[0-9a-f]{64}$'
    )
  ),
  CONSTRAINT "OperationStageAdoptionRequest_target_check" CHECK (
    "targetStage" IN (
      'SIGNATURE_COLLECTION',
      'CAMPAIGN',
      'ELECTION_PREPARATION',
      'SIMULATION',
      'ELECTION_DAY',
      'POST_ELECTION'
    )
  ),
  CONSTRAINT "OperationStageAdoptionRequest_acknowledgement_check" CHECK (
    "incompleteHistoryAcknowledged" = true
  ),
  CONSTRAINT "OperationStageAdoptionRequest_timing_check" CHECK (
    "effectiveAt" <= "createdAt"
    AND "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '7 days'
    AND ("reviewedAt" IS NULL OR "reviewedAt" >= "createdAt")
    AND ("expiredAt" IS NULL OR "expiredAt" >= "expiresAt")
  ),
  CONSTRAINT "OperationStageAdoptionRequest_profile_values_check" CHECK (
    "expectedTeamSize" BETWEEN 1 AND 100000
    AND "candidateCount" BETWEEN 1 AND 10000
    AND "retentionPeriodDays" BETWEEN 1 AND 3650
    AND "maxTotalBudget" > 0
    AND "maxPublicityLimit" > 0
    AND "maxPublicityLimit" <= "maxTotalBudget"
  ),
  CONSTRAINT "OperationStageAdoptionRequest_required_text_check" CHECK (
    length(btrim("circumscriptionName")) > 0
    AND length(btrim("dataControllerName")) > 0
    AND length(btrim("revocationProcedure")) >= 20
    AND length(btrim("justification")) >= 80
    AND length(btrim("evidenceReference")) >= 3
  ),
  CONSTRAINT "OperationStageAdoptionRequest_profile_coherence_check" CHECK (
    ("operationType" <> 'CORPORATION_CANDIDACY' OR "listType" IS NOT NULL)
    AND (
      "listType" IS NULL
      OR "operationType" IN ('CORPORATION_CANDIDACY', 'PARTY_MOVEMENT')
    )
    AND (
      "operationType" NOT IN (
        'PRE_CANDIDACY',
        'SINGLE_CANDIDACY',
        'SIGNATURE_COMMITTEE'
      )
      OR "candidateCount" = 1
    )
    AND (
      "operationType" <> 'CORPORATION_CANDIDACY'
      OR "electionType" IN (
        'SENATE',
        'HOUSE_OF_REPRESENTATIVES',
        'DEPARTMENTAL_ASSEMBLY',
        'MUNICIPAL_COUNCIL',
        'LOCAL_ADMINISTRATIVE_BOARD'
      )
    )
    AND (
      "operationType" <> 'SINGLE_CANDIDACY'
      OR "electionType" NOT IN (
        'SENATE',
        'HOUSE_OF_REPRESENTATIVES',
        'DEPARTMENTAL_ASSEMBLY',
        'MUNICIPAL_COUNCIL',
        'LOCAL_ADMINISTRATIVE_BOARD'
      )
    )
  ),
  CONSTRAINT "OperationStageAdoptionRequest_lifecycle_check" CHECK (
    (
      "status" = 'PENDING'
      AND "expiredAt" IS NULL
      AND "reviewedById" IS NULL
      AND "reviewedAt" IS NULL
      AND "reviewClientRequestId" IS NULL
      AND "reviewPayloadSha256" IS NULL
      AND "rejectionReason" IS NULL
      AND "operationProfileId" IS NULL
    ) OR (
      "status" = 'APPROVED'
      AND "expiredAt" IS NULL
      AND "reviewedById" IS NOT NULL
      AND "reviewedById" <> "requestedById"
      AND "reviewedAt" IS NOT NULL
      AND "reviewedAt" < "expiresAt"
      AND "reviewClientRequestId" IS NOT NULL
      AND "reviewPayloadSha256" IS NOT NULL
      AND "rejectionReason" IS NULL
      AND "operationProfileId" IS NOT NULL
    ) OR (
      "status" = 'REJECTED'
      AND "expiredAt" IS NULL
      AND "reviewedById" IS NOT NULL
      AND "reviewedById" <> "requestedById"
      AND "reviewedAt" IS NOT NULL
      AND "reviewedAt" < "expiresAt"
      AND "reviewClientRequestId" IS NOT NULL
      AND "reviewPayloadSha256" IS NOT NULL
      AND "rejectionReason" IS NOT NULL
      AND length(btrim("rejectionReason")) >= 20
      AND "operationProfileId" IS NULL
    ) OR (
      "status" = 'EXPIRED'
      AND "expiredAt" IS NOT NULL
      AND "reviewedById" IS NULL
      AND "reviewedAt" IS NULL
      AND "reviewClientRequestId" IS NULL
      AND "reviewPayloadSha256" IS NULL
      AND "rejectionReason" IS NULL
      AND "operationProfileId" IS NULL
    )
  )
);

CREATE UNIQUE INDEX "OperationStageAdoptionRequest_id_tenantId_key"
  ON "OperationStageAdoptionRequest"("id", "tenantId");
CREATE UNIQUE INDEX "OperationStageAdoptionRequest_tenant_client_key"
  ON "OperationStageAdoptionRequest"("tenantId", "clientRequestId");
CREATE UNIQUE INDEX "OperationStageAdoptionRequest_tenant_review_client_key"
  ON "OperationStageAdoptionRequest"("tenantId", "reviewClientRequestId");
CREATE UNIQUE INDEX "OperationStageAdoptionRequest_profile_tenant_key"
  ON "OperationStageAdoptionRequest"("operationProfileId", "tenantId");
CREATE UNIQUE INDEX "OperationStageAdoptionRequest_one_pending_per_tenant"
  ON "OperationStageAdoptionRequest"("tenantId")
  WHERE "status" = 'PENDING';
CREATE INDEX "OperationStageAdoptionRequest_tenant_status_expires_idx"
  ON "OperationStageAdoptionRequest"("tenantId", "status", "expiresAt");
CREATE INDEX "OperationStageAdoptionRequest_tenant_requester_created_idx"
  ON "OperationStageAdoptionRequest"("tenantId", "requestedById", "createdAt");
CREATE INDEX "OperationStageAdoptionRequest_tenant_reviewer_reviewed_idx"
  ON "OperationStageAdoptionRequest"("tenantId", "reviewedById", "reviewedAt");
CREATE INDEX "OperationStageAdoptionRequest_tenant_responsible_idx"
  ON "OperationStageAdoptionRequest"("tenantId", "responsibleDataUserId");

ALTER TABLE "OperationStageAdoptionRequest"
  ADD CONSTRAINT "OperationStageAdoptionRequest_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationStageAdoptionRequest"
  ADD CONSTRAINT "OperationStageAdoptionRequest_requester_fkey"
  FOREIGN KEY ("requestedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationStageAdoptionRequest"
  ADD CONSTRAINT "OperationStageAdoptionRequest_reviewer_fkey"
  FOREIGN KEY ("reviewedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationStageAdoptionRequest"
  ADD CONSTRAINT "OperationStageAdoptionRequest_responsible_fkey"
  FOREIGN KEY ("responsibleDataUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationStageAdoptionRequest"
  ADD CONSTRAINT "OperationStageAdoptionRequest_profile_fkey"
  FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION "guard_adoption_request_without_profile"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'Toda solicitud de adopcion debe iniciar en estado PENDING'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "OperationProfile"
    WHERE "tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'No se puede solicitar adopcion cuando ya existe un perfil operativo'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION "guard_profile_without_pending_adoption"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "OperationStageAdoptionRequest"
    WHERE "tenantId" = NEW."tenantId"
      AND "status" = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'No se puede crear el perfil mientras exista una adopcion pendiente'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "OperationStageAdoptionRequest_guard_profile_absence"
BEFORE INSERT ON "OperationStageAdoptionRequest"
FOR EACH ROW
EXECUTE FUNCTION "guard_adoption_request_without_profile"();

CREATE TRIGGER "OperationProfile_guard_pending_adoption"
BEFORE INSERT ON "OperationProfile"
FOR EACH ROW
EXECUTE FUNCTION "guard_profile_without_pending_adoption"();

ALTER TABLE "OperationStageAdoptionRequest"
  ENABLE ALWAYS TRIGGER "OperationStageAdoptionRequest_guard_profile_absence";
ALTER TABLE "OperationProfile"
  ENABLE ALWAYS TRIGGER "OperationProfile_guard_pending_adoption";

CREATE FUNCTION "enforce_operation_stage_adoption_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    OLD."id", OLD."tenantId", OLD."clientRequestId", OLD."payloadSha256",
    OLD."operationType", OLD."targetStage", OLD."electionType",
    OLD."circumscriptionType", OLD."circumscriptionName",
    OLD."circumscriptionCode", OLD."listType", OLD."electionDate",
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

CREATE FUNCTION "prevent_operation_stage_adoption_history_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'El historial de adopcion de etapa es inmutable: % no esta permitido', TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "OperationStageAdoptionRequest_enforce_update"
BEFORE UPDATE ON "OperationStageAdoptionRequest"
FOR EACH ROW
EXECUTE FUNCTION "enforce_operation_stage_adoption_update"();
CREATE TRIGGER "OperationStageAdoptionRequest_prevent_delete"
BEFORE DELETE ON "OperationStageAdoptionRequest"
FOR EACH ROW
EXECUTE FUNCTION "prevent_operation_stage_adoption_history_delete"();
CREATE TRIGGER "OperationStageAdoptionRequest_prevent_truncate"
BEFORE TRUNCATE ON "OperationStageAdoptionRequest"
FOR EACH STATEMENT
EXECUTE FUNCTION "prevent_operation_stage_adoption_history_delete"();

ALTER TABLE "OperationStageAdoptionRequest"
  ENABLE ALWAYS TRIGGER "OperationStageAdoptionRequest_enforce_update";
ALTER TABLE "OperationStageAdoptionRequest"
  ENABLE ALWAYS TRIGGER "OperationStageAdoptionRequest_prevent_delete";
ALTER TABLE "OperationStageAdoptionRequest"
  ENABLE ALWAYS TRIGGER "OperationStageAdoptionRequest_prevent_truncate";

COMMIT;
