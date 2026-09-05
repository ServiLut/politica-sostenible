-- Tenant-owned political operation configuration. Existing organizations are
-- intentionally left unconfigured so onboarding and privacy gates fail closed.
CREATE TYPE "PoliticalOperationType" AS ENUM (
  'PRE_CANDIDACY',
  'SINGLE_CANDIDACY',
  'CORPORATION_CANDIDACY',
  'PARTY_MOVEMENT',
  'SIGNATURE_COMMITTEE',
  'TERRITORIAL_TEAM'
);

CREATE TYPE "PoliticalOperationStage" AS ENUM (
  'EXPLORATION',
  'PRE_CAMPAIGN',
  'SIGNATURE_COLLECTION',
  'CAMPAIGN',
  'ELECTION_PREPARATION',
  'SIMULATION',
  'ELECTION_DAY',
  'POST_ELECTION',
  'CLOSED'
);

CREATE TYPE "ElectoralContestType" AS ENUM (
  'PRESIDENCY',
  'GOVERNORSHIP',
  'MAYORALTY',
  'SENATE',
  'HOUSE_OF_REPRESENTATIVES',
  'DEPARTMENTAL_ASSEMBLY',
  'MUNICIPAL_COUNCIL',
  'LOCAL_ADMINISTRATIVE_BOARD',
  'INTERNAL_ELECTION',
  'OTHER'
);

CREATE TYPE "ElectoralCircumscriptionType" AS ENUM (
  'NATIONAL',
  'DEPARTMENTAL',
  'MUNICIPAL',
  'LOCAL',
  'SPECIAL',
  'INTERNAL'
);

CREATE TYPE "CandidateListType" AS ENUM ('CLOSED', 'OPEN_PREFERENTIAL');

CREATE TABLE "OperationProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationType" "PoliticalOperationType" NOT NULL,
  "stage" "PoliticalOperationStage" NOT NULL,
  "electionType" "ElectoralContestType" NOT NULL,
  "circumscriptionType" "ElectoralCircumscriptionType" NOT NULL,
  "circumscriptionName" VARCHAR(160) NOT NULL,
  "circumscriptionCode" VARCHAR(64),
  "listType" "CandidateListType",
  "electionDate" TIMESTAMP(3) NOT NULL,
  "expectedTeamSize" INTEGER NOT NULL,
  "candidateCount" INTEGER NOT NULL DEFAULT 1,
  "dataControllerName" VARCHAR(200) NOT NULL,
  "responsibleDataUserId" TEXT NOT NULL,
  "retentionPeriodDays" INTEGER NOT NULL,
  "revocationProcedure" VARCHAR(2000) NOT NULL,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationProfile_team_size_check"
    CHECK ("expectedTeamSize" BETWEEN 1 AND 100000),
  CONSTRAINT "OperationProfile_candidate_count_check"
    CHECK ("candidateCount" BETWEEN 1 AND 10000),
  CONSTRAINT "OperationProfile_retention_period_check"
    CHECK ("retentionPeriodDays" BETWEEN 1 AND 3650),
  CONSTRAINT "OperationProfile_required_text_check"
    CHECK (
      length(btrim("circumscriptionName")) > 0
      AND length(btrim("dataControllerName")) > 0
      AND length(btrim("revocationProcedure")) > 0
    ),
  CONSTRAINT "OperationProfile_list_required_for_corporation_check"
    CHECK (
      "operationType" <> 'CORPORATION_CANDIDACY'
      OR "listType" IS NOT NULL
    ),
  CONSTRAINT "OperationProfile_list_scope_check"
    CHECK (
      "listType" IS NULL
      OR "operationType" IN ('CORPORATION_CANDIDACY', 'PARTY_MOVEMENT')
    ),
  CONSTRAINT "OperationProfile_single_candidate_count_check"
    CHECK (
      "operationType" NOT IN (
        'PRE_CANDIDACY',
        'SINGLE_CANDIDACY',
        'SIGNATURE_COMMITTEE'
      )
      OR "candidateCount" = 1
    )
);

CREATE UNIQUE INDEX "OperationProfile_tenantId_key"
ON "OperationProfile"("tenantId");

CREATE UNIQUE INDEX "OperationProfile_id_tenantId_key"
ON "OperationProfile"("id", "tenantId");

CREATE INDEX "OperationProfile_tenantId_operationType_stage_idx"
ON "OperationProfile"("tenantId", "operationType", "stage");

CREATE INDEX "OperationProfile_tenantId_electionDate_idx"
ON "OperationProfile"("tenantId", "electionDate");

CREATE INDEX "OperationProfile_tenantId_responsibleDataUserId_idx"
ON "OperationProfile"("tenantId", "responsibleDataUserId");

ALTER TABLE "OperationProfile"
ADD CONSTRAINT "OperationProfile_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationProfile"
ADD CONSTRAINT "OperationProfile_responsibleDataUserId_tenantId_fkey"
FOREIGN KEY ("responsibleDataUserId", "tenantId") REFERENCES "User"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationProfile"
ADD CONSTRAINT "OperationProfile_createdById_tenantId_fkey"
FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationProfile"
ADD CONSTRAINT "OperationProfile_updatedById_tenantId_fkey"
FOREIGN KEY ("updatedById", "tenantId") REFERENCES "User"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
