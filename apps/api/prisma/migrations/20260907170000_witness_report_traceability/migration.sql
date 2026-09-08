-- Historical reports remain readable with null traceability fields. All new
-- reports written by the API populate the complete Colombian electoral file.
BEGIN;

CREATE TYPE "WitnessCredentialType" AS ENUM ('E15', 'E16');
CREATE TYPE "E14FormType" AS ENUM ('DELEGADOS', 'CLAVEROS', 'TRANSMISION');
CREATE TYPE "WitnessReclamationGround" AS ENUM (
  'VOTERS_EXCEED_AUTHORIZED',
  'ARITHMETIC_ERROR',
  'CANDIDATE_IDENTIFICATION_ERROR',
  'INSUFFICIENT_JUROR_SIGNATURES',
  'RECOUNT_REQUEST',
  'UNAUTHORIZED_POLLING_PLACE',
  'ELECTION_ON_UNAUTHORIZED_DATE',
  'BALLOTS_DESTROYED_OR_LOST',
  'OTHER_STATUTORY_GROUND'
);

ALTER TABLE "WitnessReport"
ADD COLUMN "credentialType" "WitnessCredentialType",
ADD COLUMN "credentialReference" VARCHAR(120),
ADD COLUMN "checkedInAt" TIMESTAMP(3),
ADD COLUMN "e14FormType" "E14FormType",
ADD COLUMN "blankVotes" INTEGER,
ADD COLUMN "nullVotes" INTEGER,
ADD COLUMN "unmarkedVotes" INTEGER,
ADD COLUMN "hasWrittenClaim" BOOLEAN,
ADD COLUMN "reclamationGround" "WitnessReclamationGround",
ADD COLUMN "reclamationDescription" VARCHAR(2000);

ALTER TABLE "WitnessReport"
ADD CONSTRAINT "WitnessReport_traceability_all_or_none_check"
CHECK (
  (
    "credentialType" IS NULL
    AND "credentialReference" IS NULL
    AND "checkedInAt" IS NULL
    AND "e14FormType" IS NULL
    AND "blankVotes" IS NULL
    AND "nullVotes" IS NULL
    AND "unmarkedVotes" IS NULL
    AND "hasWrittenClaim" IS NULL
  )
  OR
  (
    "credentialType" IS NOT NULL
    AND "credentialReference" IS NOT NULL
    AND LENGTH(BTRIM("credentialReference")) > 0
    AND "checkedInAt" IS NOT NULL
    AND "e14FormType" IS NOT NULL
    AND "blankVotes" IS NOT NULL
    AND "nullVotes" IS NOT NULL
    AND "unmarkedVotes" IS NOT NULL
    AND "hasWrittenClaim" IS NOT NULL
  )
),
ADD CONSTRAINT "WitnessReport_vote_breakdown_nonnegative_check"
CHECK (
  ("blankVotes" IS NULL OR "blankVotes" BETWEEN 0 AND 99999)
  AND ("nullVotes" IS NULL OR "nullVotes" BETWEEN 0 AND 99999)
  AND ("unmarkedVotes" IS NULL OR "unmarkedVotes" BETWEEN 0 AND 99999)
),
ADD CONSTRAINT "WitnessReport_vote_breakdown_total_check"
CHECK (
  "blankVotes" IS NULL
  OR "nullVotes" IS NULL
  OR "unmarkedVotes" IS NULL
  OR "candidateVotes" + "blankVotes" + "nullVotes" + "unmarkedVotes" <= "totalTableVotes"
),
ADD CONSTRAINT "WitnessReport_written_claim_check"
CHECK (
  (
    ("hasWrittenClaim" IS NULL OR "hasWrittenClaim" = FALSE)
    AND "reclamationGround" IS NULL
    AND "reclamationDescription" IS NULL
  )
  OR
  (
    "hasWrittenClaim" = TRUE
    AND "reclamationGround" IS NOT NULL
    AND "reclamationDescription" IS NOT NULL
    AND LENGTH(BTRIM("reclamationDescription")) >= 20
    AND (
      "reclamationGround" <> 'OTHER_STATUTORY_GROUND'
      OR "reclamationDescription" ~* '(art([íi]culo)?\.?|ley|decreto|numeral)[[:space:]]+'
    )
  )
);

CREATE INDEX "WitnessReport_tenantId_credentialType_credentialReference_idx"
ON "WitnessReport"("tenantId", "credentialType", "credentialReference");

CREATE INDEX "WitnessReport_tenantId_hasWrittenClaim_createdAt_idx"
ON "WitnessReport"("tenantId", "hasWrittenClaim", "createdAt");

COMMIT;
