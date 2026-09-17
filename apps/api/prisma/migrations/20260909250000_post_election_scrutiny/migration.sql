BEGIN;

-- PostgreSQL 16 permits adding an enum label transactionally.  Nothing in
-- this migration stores SCRUTINY before COMMIT; the validation function that
-- compares the label is first executed by later application transactions.
ALTER TYPE "StorageObjectModule" ADD VALUE IF NOT EXISTS 'SCRUTINY';

CREATE TYPE "ScrutinyCommissionLevel" AS ENUM (
  'AUXILIARY',
  'MUNICIPAL',
  'DISTRICT',
  'DEPARTMENTAL',
  'GENERAL_NATIONAL'
);
CREATE TYPE "ScrutinyCommissionStatus" AS ENUM (
  'PLANNED',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED',
  'CANCELLED'
);
CREATE TYPE "ScrutinySessionEventType" AS ENUM (
  'OPENED',
  'SUSPENDED',
  'RESUMED',
  'CLOSED'
);
CREATE TYPE "ScrutinyCoverageStatus" AS ENUM (
  'PLANNED',
  'CONFIRMED',
  'CANCELLED'
);
CREATE TYPE "ScrutinyDocumentType" AS ENUM (
  'E14_CLAVEROS',
  'E16_CREDENTIAL',
  'E23',
  'E24',
  'E25',
  'E26',
  'GENERAL_ACT',
  'RESOLUTION',
  'APPEAL',
  'NOTICE',
  'DECLARATION_CREDENTIAL',
  'OTHER'
);
CREATE TYPE "ScrutinyEvidenceState" AS ENUM (
  'INTERNAL',
  'FILED',
  'DECIDED',
  'OFFICIAL'
);
CREATE TYPE "ScrutinyRequirementApplicability" AS ENUM (
  'PENDING',
  'REQUIRED',
  'NOT_APPLICABLE'
);
CREATE TYPE "ScrutinyDocumentReviewStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);
CREATE TYPE "ScrutinyDocumentReviewDecision" AS ENUM ('APPROVE', 'REJECT');
CREATE TYPE "ScrutinyCustodyEventType" AS ENUM (
  'RECEIVED',
  'VERIFIED',
  'TRANSFERRED',
  'SEALED',
  'UNSEALED',
  'DIGITIZED',
  'SUBMITTED',
  'RETURNED'
);
CREATE TYPE "ScrutinyDiscrepancySeverity" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);
CREATE TYPE "ScrutinyDiscrepancyStatus" AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'EXPLAINED',
  'DISMISSED'
);
CREATE TYPE "ScrutinyActionType" AS ENUM (
  'REQUEST',
  'CLAIM',
  'APPEAL',
  'NULLITY_REQUEST'
);
CREATE TYPE "ScrutinyStandingType" AS ENUM (
  'CANDIDATE',
  'ATTORNEY',
  'ACCREDITED_WITNESS',
  'PARTY_MOVEMENT',
  'OTHER'
);
CREATE TYPE "ScrutinyActionStatus" AS ENUM (
  'DRAFT',
  'APPROVED_INTERNAL',
  'FILED_EXTERNAL',
  'DECIDED_EXTERNAL',
  'APPEALED_EXTERNAL',
  'CLOSED',
  'WITHDRAWN'
);
CREATE TYPE "ScrutinyDecisionOutcome" AS ENUM (
  'GRANTED',
  'PARTIALLY_GRANTED',
  'DENIED',
  'REJECTED_INADMISSIBLE',
  'DISMISSED',
  'OTHER'
);
CREATE TYPE "ScrutinyDecisionReviewStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);
CREATE TYPE "ScrutinyDeclarationStatus" AS ENUM (
  'DRAFT_INTERNAL',
  'OFFICIAL',
  'REJECTED_INTERNAL'
);
CREATE TYPE "ScrutinyDeclarationReviewDecision" AS ENUM ('APPROVE', 'REJECT');
CREATE TYPE "ScrutinyCommandType" AS ENUM (
  'COMMISSION_CREATE',
  'REQUIREMENT_CONFIGURE',
  'SESSION_EVENT_RECORD',
  'COVERAGE_CREATE',
  'DOCUMENT_CREATE',
  'DOCUMENT_REVIEW',
  'CUSTODY_EVENT_RECORD',
  'DISCREPANCY_CREATE',
  'DISCREPANCY_RESOLVE',
  'ACTION_CREATE',
  'ACTION_VERSION_ADD',
  'ACTION_APPROVE',
  'ACTION_FILE',
  'DECISION_RECORD',
  'DECISION_REVIEW',
  'DECLARATION_CREATE',
  'DECLARATION_REVIEW'
);

CREATE TABLE "ScrutinyCommand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "ScrutinyCommandType" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "resourceType" VARCHAR(80) NOT NULL,
  "resourceId" TEXT NOT NULL,
  "resultSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScrutinyCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyCommand_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyCommand_resource_check" CHECK (
    length(btrim("resourceType")) BETWEEN 2 AND 80
    AND length(btrim("resourceId")) > 0
  )
);

CREATE TABLE "ScrutinyCommission" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "sourceReleaseId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "level" "ScrutinyCommissionLevel" NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "scopeDivisionId" TEXT,
  "scopeCode" VARCHAR(80) NOT NULL,
  "scopeName" VARCHAR(200) NOT NULL,
  "venue" VARCHAR(300) NOT NULL,
  "timeZone" VARCHAR(100) NOT NULL,
  "scheduledStartsAt" TIMESTAMP(3) NOT NULL,
  "scheduledEndsAt" TIMESTAMP(3) NOT NULL,
  "calendarSourceUrl" VARCHAR(2048) NOT NULL,
  "calendarSourceReference" VARCHAR(500) NOT NULL,
  "legalLeadUserId" TEXT NOT NULL,
  "escalationRoute" VARCHAR(4000) NOT NULL,
  "contingencyPlan" VARCHAR(4000) NOT NULL,
  "offlineDrillAt" TIMESTAMP(3),
  "status" "ScrutinyCommissionStatus" NOT NULL DEFAULT 'PLANNED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrutinyCommission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyCommission_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyCommission_code_check" CHECK (
    "code" ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
  ),
  CONSTRAINT "ScrutinyCommission_time_check" CHECK (
    "scheduledEndsAt" > "scheduledStartsAt"
  ),
  CONSTRAINT "ScrutinyCommission_timezone_check" CHECK (
    "timeZone" ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z][A-Za-z0-9._+-]*)+$'
  ),
  CONSTRAINT "ScrutinyCommission_source_check" CHECK (
    "calendarSourceUrl" ~ '^https://[^[:space:]]+$'
    AND length(btrim("calendarSourceReference")) >= 5
  ),
  CONSTRAINT "ScrutinyCommission_operational_text_check" CHECK (
    length(btrim("escalationRoute")) >= 50
    AND length(btrim("contingencyPlan")) >= 50
    AND "version" >= 1
  )
);

CREATE TABLE "ScrutinyDocumentRequirement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "documentType" "ScrutinyDocumentType" NOT NULL,
  "applicability" "ScrutinyRequirementApplicability" NOT NULL DEFAULT 'PENDING',
  "rationale" VARCHAR(2000) NOT NULL,
  "declaredById" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrutinyDocumentRequirement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyDocumentRequirement_rationale_check" CHECK (
    length(btrim("rationale")) >= 20 AND "version" >= 1
  )
);

CREATE TABLE "ScrutinyCommissionEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "ScrutinySessionEventType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" VARCHAR(2000) NOT NULL,
  "actorUserId" TEXT NOT NULL,
  CONSTRAINT "ScrutinyCommissionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyCommissionEvent_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyCommissionEvent_notes_check" CHECK (
    length(btrim("notes")) >= 10
  )
);

CREATE TABLE "ScrutinyDocument" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "storedObjectId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "ScrutinyDocumentType" NOT NULL,
  "evidenceState" "ScrutinyEvidenceState" NOT NULL,
  "storagePath" VARCHAR(512) NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "size" INTEGER NOT NULL,
  "contentType" VARCHAR(150) NOT NULL,
  "declaredIssuer" VARCHAR(300) NOT NULL,
  "authorityInstance" VARCHAR(300) NOT NULL,
  "versionLabel" VARCHAR(80) NOT NULL,
  "cutoffAt" TIMESTAMP(3) NOT NULL,
  "externalAt" TIMESTAMP(3),
  "externalChannel" VARCHAR(120),
  "externalReference" VARCHAR(300),
  "supersedesDocumentId" TEXT,
  "reviewStatus" "ScrutinyDocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewReason" VARCHAR(2000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrutinyDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyDocument_hashes_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
    AND "sha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyDocument_metadata_check" CHECK (
    "size" > 0
    AND length(btrim("storagePath")) >= 3
    AND length(btrim("contentType")) >= 3
    AND length(btrim("declaredIssuer")) >= 2
    AND length(btrim("authorityInstance")) >= 2
    AND length(btrim("versionLabel")) >= 1
    AND "version" >= 1
    AND ("supersedesDocumentId" IS NULL OR "supersedesDocumentId" <> "id")
  ),
  CONSTRAINT "ScrutinyDocument_external_state_check" CHECK (
    (
      "evidenceState" = 'INTERNAL'
      AND "externalAt" IS NULL
      AND "externalChannel" IS NULL
      AND "externalReference" IS NULL
    ) OR (
      "evidenceState" <> 'INTERNAL'
      AND "externalAt" IS NOT NULL
      AND length(btrim("externalChannel")) >= 2
      AND length(btrim("externalReference")) >= 2
    )
  ),
  CONSTRAINT "ScrutinyDocument_review_check" CHECK (
    (
      "reviewStatus" = 'PENDING'
      AND "reviewedById" IS NULL
      AND "reviewedAt" IS NULL
      AND "reviewReason" IS NULL
    ) OR (
      "reviewStatus" <> 'PENDING'
      AND "reviewedById" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
      AND length(btrim("reviewReason")) >= 20
      AND "reviewedById" <> "createdById"
    )
  )
);

CREATE TABLE "ScrutinyCommissionCoverage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "witnessId" TEXT NOT NULL,
  "credentialDocumentId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "credentialReference" VARCHAR(200) NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "shiftStartsAt" TIMESTAMP(3) NOT NULL,
  "shiftEndsAt" TIMESTAMP(3) NOT NULL,
  "status" "ScrutinyCoverageStatus" NOT NULL DEFAULT 'CONFIRMED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrutinyCommissionCoverage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyCommissionCoverage_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyCommissionCoverage_time_check" CHECK (
    "validUntil" > "validFrom"
    AND "shiftEndsAt" > "shiftStartsAt"
    AND "shiftStartsAt" >= "validFrom"
    AND "shiftEndsAt" <= "validUntil"
    AND "version" >= 1
  ),
  CONSTRAINT "ScrutinyCommissionCoverage_reference_check" CHECK (
    length(btrim("credentialReference")) >= 3
  )
);

CREATE TABLE "ScrutinyCustodyEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "ScrutinyCustodyEventType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fromCustodian" VARCHAR(200),
  "toCustodian" VARCHAR(200) NOT NULL,
  "notes" VARCHAR(2000) NOT NULL,
  "actorUserId" TEXT NOT NULL,
  CONSTRAINT "ScrutinyCustodyEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyCustodyEvent_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyCustodyEvent_text_check" CHECK (
    length(btrim("toCustodian")) >= 2
    AND length(btrim("notes")) >= 10
  )
);

CREATE TABLE "ScrutinyDiscrepancy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "sourceDocumentId" TEXT NOT NULL,
  "comparisonDocumentId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "scopeReference" VARCHAR(300) NOT NULL,
  "candidacyReference" VARCHAR(300) NOT NULL,
  "sourceValue" INTEGER NOT NULL,
  "comparisonValue" INTEGER NOT NULL,
  "classification" VARCHAR(120) NOT NULL,
  "severity" "ScrutinyDiscrepancySeverity" NOT NULL,
  "status" "ScrutinyDiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
  "responsibleUserId" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "resolution" VARCHAR(3000),
  "resolutionDocumentId" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrutinyDiscrepancy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyDiscrepancy_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyDiscrepancy_values_check" CHECK (
    "sourceValue" >= 0
    AND "comparisonValue" >= 0
    AND "sourceDocumentId" <> "comparisonDocumentId"
    AND "version" >= 1
  ),
  CONSTRAINT "ScrutinyDiscrepancy_resolution_check" CHECK (
    (
      "status" IN ('OPEN', 'UNDER_REVIEW')
      AND "resolution" IS NULL
      AND "resolutionDocumentId" IS NULL
      AND "resolvedById" IS NULL
      AND "resolvedAt" IS NULL
    ) OR (
      "status" IN ('EXPLAINED', 'DISMISSED')
      AND length(btrim("resolution")) >= 30
      AND "resolutionDocumentId" IS NOT NULL
      AND "resolvedById" IS NOT NULL
      AND "resolvedAt" IS NOT NULL
    )
  )
);

CREATE TABLE "ScrutinyAction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "parentActionId" TEXT,
  "accreditedCoverageId" TEXT,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "ScrutinyActionType" NOT NULL,
  "standingType" "ScrutinyStandingType" NOT NULL,
  "standingBasis" VARCHAR(1000) NOT NULL,
  "legalGroundCode" VARCHAR(120) NOT NULL,
  "legalGroundVersion" VARCHAR(100) NOT NULL,
  "legalGroundSourceUrl" VARCHAR(2048) NOT NULL,
  "facts" VARCHAR(8000) NOT NULL,
  "legalBasis" VARCHAR(8000) NOT NULL,
  "affectedReferences" JSONB NOT NULL,
  "authority" VARCHAR(300) NOT NULL,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "deadlineRule" VARCHAR(2000) NOT NULL,
  "timeZone" VARCHAR(100) NOT NULL,
  "status" "ScrutinyActionStatus" NOT NULL DEFAULT 'DRAFT',
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "draftedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvalNote" VARCHAR(2000),
  "filedById" TEXT,
  "filedAt" TIMESTAMP(3),
  "filingChannel" VARCHAR(120),
  "filingReference" VARCHAR(300),
  "filingDocumentId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrutinyAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyAction_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyAction_parent_check" CHECK (
    (("type" = 'APPEAL') = ("parentActionId" IS NOT NULL))
    AND ("parentActionId" IS NULL OR "parentActionId" <> "id")
  ),
  CONSTRAINT "ScrutinyAction_source_check" CHECK (
    "legalGroundSourceUrl" ~ '^https://[^[:space:]]+$'
    AND "timeZone" ~ '^[A-Za-z][A-Za-z0-9._+-]*(/[A-Za-z][A-Za-z0-9._+-]*)+$'
  ),
  CONSTRAINT "ScrutinyAction_content_check" CHECK (
    length(btrim("standingBasis")) >= 10
    AND length(btrim("facts")) >= 30
    AND length(btrim("legalBasis")) >= 30
    AND length(btrim("deadlineRule")) >= 20
    AND jsonb_typeof("affectedReferences") = 'array'
    AND jsonb_array_length("affectedReferences") BETWEEN 1 AND 200
    AND "currentVersion" >= 1
    AND "version" >= 1
  ),
  CONSTRAINT "ScrutinyAction_approval_check" CHECK (
    (
      "status" = 'DRAFT'
      AND "approvedById" IS NULL
      AND "approvedAt" IS NULL
      AND "approvalNote" IS NULL
    ) OR (
      "status" <> 'DRAFT'
      AND "status" <> 'WITHDRAWN'
      AND "approvedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND length(btrim("approvalNote")) >= 20
      AND "approvedById" <> "draftedById"
    ) OR (
      "status" = 'WITHDRAWN'
    )
  ),
  CONSTRAINT "ScrutinyAction_filing_check" CHECK (
    (
      "status" IN ('DRAFT', 'APPROVED_INTERNAL', 'WITHDRAWN')
      AND "filedById" IS NULL
      AND "filedAt" IS NULL
      AND "filingChannel" IS NULL
      AND "filingReference" IS NULL
      AND "filingDocumentId" IS NULL
    ) OR (
      "status" IN ('FILED_EXTERNAL', 'DECIDED_EXTERNAL', 'APPEALED_EXTERNAL', 'CLOSED')
      AND "filedById" IS NOT NULL
      AND "filedAt" IS NOT NULL
      AND length(btrim("filingChannel")) >= 2
      AND length(btrim("filingReference")) >= 2
      AND "filingDocumentId" IS NOT NULL
      AND "filedById" <> "draftedById"
      AND "filedById" <> "approvedById"
    )
  )
);

CREATE TABLE "ScrutinyActionVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "number" INTEGER NOT NULL,
  "text" VARCHAR(12000) NOT NULL,
  "textSha256" CHAR(64) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScrutinyActionVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyActionVersion_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
    AND "textSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyActionVersion_content_check" CHECK (
    "number" >= 1 AND length(btrim("text")) >= 50
  )
);

CREATE TABLE "ScrutinyActionDecision" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "decisionDocumentId" TEXT NOT NULL,
  "notificationDocumentId" TEXT,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "outcome" "ScrutinyDecisionOutcome" NOT NULL,
  "authority" VARCHAR(300) NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL,
  "notifiedAt" TIMESTAMP(3),
  "reasoning" VARCHAR(4000) NOT NULL,
  "reviewStatus" "ScrutinyDecisionReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" VARCHAR(2000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "recordedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrutinyActionDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyActionDecision_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyActionDecision_notification_check" CHECK (
    (("notifiedAt" IS NULL) = ("notificationDocumentId" IS NULL))
  ),
  CONSTRAINT "ScrutinyActionDecision_review_check" CHECK (
    (
      "reviewStatus" = 'PENDING'
      AND "reviewedById" IS NULL
      AND "reviewedAt" IS NULL
      AND "reviewNote" IS NULL
    ) OR (
      "reviewStatus" <> 'PENDING'
      AND "reviewedById" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
      AND length(btrim("reviewNote")) >= 20
      AND "reviewedById" <> "recordedById"
    )
  ),
  CONSTRAINT "ScrutinyActionDecision_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "ScrutinyDeclaration" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "commissionId" TEXT,
  "officialDocumentId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "scopeReference" VARCHAR(300) NOT NULL,
  "authority" VARCHAR(300) NOT NULL,
  "authorityReference" VARCHAR(300) NOT NULL,
  "declaredAt" TIMESTAMP(3) NOT NULL,
  "status" "ScrutinyDeclarationStatus" NOT NULL DEFAULT 'DRAFT_INTERNAL',
  "recordedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" VARCHAR(2000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrutinyDeclaration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyDeclaration_hash_check" CHECK (
    "payloadSha256" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ScrutinyDeclaration_review_check" CHECK (
    (
      "status" = 'DRAFT_INTERNAL'
      AND "reviewedById" IS NULL
      AND "reviewedAt" IS NULL
      AND "reviewNote" IS NULL
    ) OR (
      "status" <> 'DRAFT_INTERNAL'
      AND "reviewedById" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
      AND length(btrim("reviewNote")) >= 20
      AND "reviewedById" <> "recordedById"
    )
  ),
  CONSTRAINT "ScrutinyDeclaration_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "ScrutinyDeclaredResultLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "declarationId" TEXT NOT NULL,
  "optionCode" VARCHAR(100) NOT NULL,
  "optionLabel" VARCHAR(300) NOT NULL,
  "votes" INTEGER,
  "seats" INTEGER,
  "declaredStatus" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScrutinyDeclaredResultLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinyDeclaredResultLine_values_check" CHECK (
    ("votes" IS NULL OR "votes" >= 0)
    AND ("seats" IS NULL OR "seats" >= 0)
    AND ("votes" IS NOT NULL OR "seats" IS NOT NULL)
    AND length(btrim("optionCode")) >= 1
    AND length(btrim("optionLabel")) >= 1
    AND length(btrim("declaredStatus")) >= 2
  )
);

-- Every operational identity is both globally addressable and tenant-bound.
ALTER TABLE "ScrutinyCommand"
  ADD CONSTRAINT "ScrutinyCommand_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyCommand_tenant_client_key" UNIQUE ("tenantId", "clientRequestId");
ALTER TABLE "ScrutinyCommission"
  ADD CONSTRAINT "ScrutinyCommission_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyCommission_tenant_client_key" UNIQUE ("tenantId", "clientRequestId"),
  ADD CONSTRAINT "ScrutinyCommission_profile_code_key" UNIQUE ("tenantId", "operationProfileId", "code");
ALTER TABLE "ScrutinyDocumentRequirement"
  ADD CONSTRAINT "ScrutinyDocumentRequirement_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyDocumentRequirement_commission_type_key" UNIQUE ("tenantId", "commissionId", "documentType");
ALTER TABLE "ScrutinyCommissionEvent"
  ADD CONSTRAINT "ScrutinyCommissionEvent_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyCommissionEvent_tenant_client_key" UNIQUE ("tenantId", "clientRequestId");
ALTER TABLE "ScrutinyDocument"
  ADD CONSTRAINT "ScrutinyDocument_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyDocument_tenant_client_key" UNIQUE ("tenantId", "clientRequestId"),
  ADD CONSTRAINT "ScrutinyDocument_stored_object_key" UNIQUE ("storedObjectId", "tenantId"),
  ADD CONSTRAINT "ScrutinyDocument_storage_path_key" UNIQUE ("tenantId", "storagePath"),
  ADD CONSTRAINT "ScrutinyDocument_supersedes_key" UNIQUE ("supersedesDocumentId", "tenantId");
ALTER TABLE "ScrutinyCommissionCoverage"
  ADD CONSTRAINT "ScrutinyCommissionCoverage_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyCommissionCoverage_tenant_client_key" UNIQUE ("tenantId", "clientRequestId"),
  ADD CONSTRAINT "ScrutinyCommissionCoverage_shift_key" UNIQUE (
    "tenantId", "commissionId", "witnessId", "shiftStartsAt", "shiftEndsAt"
  );
ALTER TABLE "ScrutinyCustodyEvent"
  ADD CONSTRAINT "ScrutinyCustodyEvent_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyCustodyEvent_tenant_client_key" UNIQUE ("tenantId", "clientRequestId");
ALTER TABLE "ScrutinyDiscrepancy"
  ADD CONSTRAINT "ScrutinyDiscrepancy_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyDiscrepancy_tenant_client_key" UNIQUE ("tenantId", "clientRequestId");
ALTER TABLE "ScrutinyAction"
  ADD CONSTRAINT "ScrutinyAction_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyAction_tenant_client_key" UNIQUE ("tenantId", "clientRequestId");
ALTER TABLE "ScrutinyActionVersion"
  ADD CONSTRAINT "ScrutinyActionVersion_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyActionVersion_tenant_client_key" UNIQUE ("tenantId", "clientRequestId"),
  ADD CONSTRAINT "ScrutinyActionVersion_action_number_key" UNIQUE ("tenantId", "actionId", "number");
ALTER TABLE "ScrutinyActionDecision"
  ADD CONSTRAINT "ScrutinyActionDecision_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyActionDecision_tenant_client_key" UNIQUE ("tenantId", "clientRequestId"),
  ADD CONSTRAINT "ScrutinyActionDecision_action_key" UNIQUE ("actionId", "tenantId");
ALTER TABLE "ScrutinyDeclaration"
  ADD CONSTRAINT "ScrutinyDeclaration_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyDeclaration_tenant_client_key" UNIQUE ("tenantId", "clientRequestId");
ALTER TABLE "ScrutinyDeclaredResultLine"
  ADD CONSTRAINT "ScrutinyDeclaredResultLine_id_tenant_key" UNIQUE ("id", "tenantId"),
  ADD CONSTRAINT "ScrutinyDeclaredResultLine_option_key" UNIQUE ("tenantId", "declarationId", "optionCode");

CREATE UNIQUE INDEX "ScrutinyDeclaration_one_official_scope_key"
  ON "ScrutinyDeclaration" ("tenantId", "operationProfileId", "scopeReference")
  WHERE "status" = 'OFFICIAL';
CREATE INDEX "ScrutinyCommission_tenant_status_schedule_idx"
  ON "ScrutinyCommission" ("tenantId", "status", "scheduledStartsAt");
CREATE INDEX "ScrutinyRequirement_tenant_applicability_idx"
  ON "ScrutinyDocumentRequirement" ("tenantId", "applicability", "documentType");
CREATE INDEX "ScrutinyEvent_tenant_commission_received_idx"
  ON "ScrutinyCommissionEvent" ("tenantId", "commissionId", "receivedAt");
CREATE INDEX "ScrutinyDocument_tenant_commission_type_state_idx"
  ON "ScrutinyDocument" ("tenantId", "commissionId", "type", "evidenceState", "reviewStatus");
CREATE INDEX "ScrutinyCoverage_tenant_commission_time_idx"
  ON "ScrutinyCommissionCoverage" ("tenantId", "commissionId", "status", "shiftStartsAt", "shiftEndsAt");
CREATE INDEX "ScrutinyCustody_tenant_document_received_idx"
  ON "ScrutinyCustodyEvent" ("tenantId", "documentId", "receivedAt");
CREATE INDEX "ScrutinyDiscrepancy_tenant_status_severity_idx"
  ON "ScrutinyDiscrepancy" ("tenantId", "status", "severity", "dueAt");
CREATE INDEX "ScrutinyAction_tenant_status_deadline_idx"
  ON "ScrutinyAction" ("tenantId", "status", "deadlineAt");
CREATE INDEX "ScrutinyAction_tenant_parent_idx"
  ON "ScrutinyAction" ("tenantId", "parentActionId");
CREATE INDEX "ScrutinyDecision_tenant_review_idx"
  ON "ScrutinyActionDecision" ("tenantId", "reviewStatus", "decidedAt");
CREATE INDEX "ScrutinyDeclaration_tenant_status_declared_idx"
  ON "ScrutinyDeclaration" ("tenantId", "status", "declaredAt");

-- Composite foreign keys make cross-tenant references impossible even when an
-- application bug supplies a valid id from another organization.
ALTER TABLE "ScrutinyCommand"
  ADD CONSTRAINT "ScrutinyCommand_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCommand_actor_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyCommission"
  ADD CONSTRAINT "ScrutinyCommission_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCommission_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCommission_release_fkey" FOREIGN KEY ("sourceReleaseId", "tenantId") REFERENCES "ElectoralCatalogRelease"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCommission_scope_fkey" FOREIGN KEY ("scopeDivisionId", "tenantId") REFERENCES "PoliticalDivision"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCommission_legal_lead_fkey" FOREIGN KEY ("legalLeadUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCommission_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyDocumentRequirement"
  ADD CONSTRAINT "ScrutinyRequirement_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyRequirement_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyRequirement_commission_fkey" FOREIGN KEY ("commissionId", "tenantId") REFERENCES "ScrutinyCommission"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyRequirement_actor_fkey" FOREIGN KEY ("declaredById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyCommissionEvent"
  ADD CONSTRAINT "ScrutinyEvent_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyEvent_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyEvent_commission_fkey" FOREIGN KEY ("commissionId", "tenantId") REFERENCES "ScrutinyCommission"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyEvent_actor_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyDocument"
  ADD CONSTRAINT "ScrutinyDocument_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDocument_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDocument_commission_fkey" FOREIGN KEY ("commissionId", "tenantId") REFERENCES "ScrutinyCommission"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDocument_stored_object_fkey" FOREIGN KEY ("storedObjectId", "tenantId") REFERENCES "StoredObject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDocument_supersedes_fkey" FOREIGN KEY ("supersedesDocumentId", "tenantId") REFERENCES "ScrutinyDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDocument_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDocument_reviewer_fkey" FOREIGN KEY ("reviewedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyCommissionCoverage"
  ADD CONSTRAINT "ScrutinyCoverage_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCoverage_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCoverage_commission_fkey" FOREIGN KEY ("commissionId", "tenantId") REFERENCES "ScrutinyCommission"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCoverage_witness_fkey" FOREIGN KEY ("witnessId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCoverage_credential_fkey" FOREIGN KEY ("credentialDocumentId", "tenantId") REFERENCES "ScrutinyDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCoverage_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyCustodyEvent"
  ADD CONSTRAINT "ScrutinyCustody_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCustody_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCustody_document_fkey" FOREIGN KEY ("documentId", "tenantId") REFERENCES "ScrutinyDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyCustody_actor_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyDiscrepancy"
  ADD CONSTRAINT "ScrutinyDiscrepancy_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDiscrepancy_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDiscrepancy_commission_fkey" FOREIGN KEY ("commissionId", "tenantId") REFERENCES "ScrutinyCommission"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDiscrepancy_source_document_fkey" FOREIGN KEY ("sourceDocumentId", "tenantId") REFERENCES "ScrutinyDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDiscrepancy_comparison_document_fkey" FOREIGN KEY ("comparisonDocumentId", "tenantId") REFERENCES "ScrutinyDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDiscrepancy_resolution_document_fkey" FOREIGN KEY ("resolutionDocumentId", "tenantId") REFERENCES "ScrutinyDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDiscrepancy_responsible_fkey" FOREIGN KEY ("responsibleUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDiscrepancy_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDiscrepancy_resolver_fkey" FOREIGN KEY ("resolvedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyAction"
  ADD CONSTRAINT "ScrutinyAction_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyAction_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyAction_commission_fkey" FOREIGN KEY ("commissionId", "tenantId") REFERENCES "ScrutinyCommission"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyAction_parent_fkey" FOREIGN KEY ("parentActionId", "tenantId") REFERENCES "ScrutinyAction"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyAction_coverage_fkey" FOREIGN KEY ("accreditedCoverageId", "tenantId") REFERENCES "ScrutinyCommissionCoverage"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyAction_drafter_fkey" FOREIGN KEY ("draftedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyAction_approver_fkey" FOREIGN KEY ("approvedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyAction_filer_fkey" FOREIGN KEY ("filedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyAction_filing_document_fkey" FOREIGN KEY ("filingDocumentId", "tenantId") REFERENCES "ScrutinyDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyActionVersion"
  ADD CONSTRAINT "ScrutinyActionVersion_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyActionVersion_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyActionVersion_action_fkey" FOREIGN KEY ("actionId", "tenantId") REFERENCES "ScrutinyAction"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyActionVersion_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyActionDecision"
  ADD CONSTRAINT "ScrutinyDecision_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDecision_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDecision_action_fkey" FOREIGN KEY ("actionId", "tenantId") REFERENCES "ScrutinyAction"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDecision_document_fkey" FOREIGN KEY ("decisionDocumentId", "tenantId") REFERENCES "ScrutinyDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDecision_notification_fkey" FOREIGN KEY ("notificationDocumentId", "tenantId") REFERENCES "ScrutinyDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDecision_recorder_fkey" FOREIGN KEY ("recordedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDecision_reviewer_fkey" FOREIGN KEY ("reviewedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyDeclaration"
  ADD CONSTRAINT "ScrutinyDeclaration_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDeclaration_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDeclaration_commission_fkey" FOREIGN KEY ("commissionId", "tenantId") REFERENCES "ScrutinyCommission"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDeclaration_document_fkey" FOREIGN KEY ("officialDocumentId", "tenantId") REFERENCES "ScrutinyDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDeclaration_recorder_fkey" FOREIGN KEY ("recordedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyDeclaration_reviewer_fkey" FOREIGN KEY ("reviewedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScrutinyDeclaredResultLine"
  ADD CONSTRAINT "ScrutinyResultLine_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyResultLine_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ScrutinyResultLine_declaration_fkey" FOREIGN KEY ("declarationId", "tenantId") REFERENCES "ScrutinyDeclaration"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutable ledgers cannot be rewritten or truncated by application code.
CREATE FUNCTION "scrutiny_reject_append_only_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is an append-only scrutiny ledger', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "scrutiny_reject_delete_or_truncate"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% scrutiny records cannot be deleted or truncated', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ScrutinyCommand_append_only_update_delete"
  BEFORE UPDATE OR DELETE ON "ScrutinyCommand"
  FOR EACH ROW EXECUTE FUNCTION "scrutiny_reject_append_only_mutation"();
CREATE TRIGGER "ScrutinyCommand_append_only_truncate"
  BEFORE TRUNCATE ON "ScrutinyCommand"
  FOR EACH STATEMENT EXECUTE FUNCTION "scrutiny_reject_append_only_mutation"();

CREATE TRIGGER "ScrutinyCommissionEvent_append_only_update_delete"
  BEFORE UPDATE OR DELETE ON "ScrutinyCommissionEvent"
  FOR EACH ROW EXECUTE FUNCTION "scrutiny_reject_append_only_mutation"();
CREATE TRIGGER "ScrutinyCommissionEvent_append_only_truncate"
  BEFORE TRUNCATE ON "ScrutinyCommissionEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "scrutiny_reject_append_only_mutation"();

CREATE TRIGGER "ScrutinyCustodyEvent_append_only_update_delete"
  BEFORE UPDATE OR DELETE ON "ScrutinyCustodyEvent"
  FOR EACH ROW EXECUTE FUNCTION "scrutiny_reject_append_only_mutation"();
CREATE TRIGGER "ScrutinyCustodyEvent_append_only_truncate"
  BEFORE TRUNCATE ON "ScrutinyCustodyEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "scrutiny_reject_append_only_mutation"();

CREATE TRIGGER "ScrutinyActionVersion_append_only_update_delete"
  BEFORE UPDATE OR DELETE ON "ScrutinyActionVersion"
  FOR EACH ROW EXECUTE FUNCTION "scrutiny_reject_append_only_mutation"();
CREATE TRIGGER "ScrutinyActionVersion_append_only_truncate"
  BEFORE TRUNCATE ON "ScrutinyActionVersion"
  FOR EACH STATEMENT EXECUTE FUNCTION "scrutiny_reject_append_only_mutation"();

CREATE TRIGGER "ScrutinyDeclaredResultLine_append_only_update_delete"
  BEFORE UPDATE OR DELETE ON "ScrutinyDeclaredResultLine"
  FOR EACH ROW EXECUTE FUNCTION "scrutiny_reject_append_only_mutation"();
CREATE TRIGGER "ScrutinyDeclaredResultLine_append_only_truncate"
  BEFORE TRUNCATE ON "ScrutinyDeclaredResultLine"
  FOR EACH STATEMENT EXECUTE FUNCTION "scrutiny_reject_append_only_mutation"();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ScrutinyCommission',
    'ScrutinyDocumentRequirement',
    'ScrutinyDocument',
    'ScrutinyCommissionCoverage',
    'ScrutinyDiscrepancy',
    'ScrutinyAction',
    'ScrutinyActionDecision',
    'ScrutinyDeclaration'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION "scrutiny_reject_delete_or_truncate"()',
      table_name || '_no_delete_truncate',
      table_name
    );
  END LOOP;
END $$;

-- The previous statement-level trigger does not cover row DELETE separately.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ScrutinyCommission',
    'ScrutinyDocumentRequirement',
    'ScrutinyDocument',
    'ScrutinyCommissionCoverage',
    'ScrutinyDiscrepancy',
    'ScrutinyAction',
    'ScrutinyActionDecision',
    'ScrutinyDeclaration'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION "scrutiny_reject_delete_or_truncate"()',
      table_name || '_no_delete_row',
      table_name
    );
  END LOOP;
END $$;

CREATE FUNCTION "scrutiny_validate_document_artifact"() RETURNS trigger AS $$
DECLARE
  stored "StoredObject"%ROWTYPE;
BEGIN
  SELECT * INTO stored
  FROM "StoredObject"
  WHERE "id" = NEW."storedObjectId" AND "tenantId" = NEW."tenantId";

  IF NOT FOUND
     OR stored."module" <> 'SCRUTINY'
     OR stored."status" <> 'CONSUMED'
     OR stored."consumedByType" <> 'ScrutinyDocument'
     OR stored."consumedById" <> NEW."id"
     OR stored."path" <> NEW."storagePath"
     OR stored."expectedSha256" IS DISTINCT FROM NEW."sha256"
     OR stored."reportedSha256" IS DISTINCT FROM NEW."sha256"
     OR stored."actualSize" IS DISTINCT FROM NEW."size"
     OR stored."contentType" <> NEW."contentType"
  THEN
    RAISE EXCEPTION 'scrutiny document requires its exact confirmed and consumed Storage artifact'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ScrutinyDocument_validate_artifact"
  BEFORE INSERT ON "ScrutinyDocument"
  FOR EACH ROW EXECUTE FUNCTION "scrutiny_validate_document_artifact"();

CREATE FUNCTION "scrutiny_document_immutable_artifact"() RETURNS trigger AS $$
BEGIN
  IF ROW(
    NEW."id", NEW."tenantId", NEW."operationProfileId", NEW."commissionId",
    NEW."storedObjectId", NEW."clientRequestId", NEW."payloadSha256",
    NEW."type", NEW."evidenceState", NEW."storagePath", NEW."sha256",
    NEW."size", NEW."contentType", NEW."declaredIssuer",
    NEW."authorityInstance", NEW."versionLabel", NEW."cutoffAt",
    NEW."externalAt", NEW."externalChannel", NEW."externalReference",
    NEW."supersedesDocumentId", NEW."createdById", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."tenantId", OLD."operationProfileId", OLD."commissionId",
    OLD."storedObjectId", OLD."clientRequestId", OLD."payloadSha256",
    OLD."type", OLD."evidenceState", OLD."storagePath", OLD."sha256",
    OLD."size", OLD."contentType", OLD."declaredIssuer",
    OLD."authorityInstance", OLD."versionLabel", OLD."cutoffAt",
    OLD."externalAt", OLD."externalChannel", OLD."externalReference",
    OLD."supersedesDocumentId", OLD."createdById", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'scrutiny document artifact metadata is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF OLD."reviewStatus" <> 'PENDING' THEN
    RAISE EXCEPTION 'a scrutiny document review is final'
      USING ERRCODE = '55000';
  END IF;
  IF NEW."reviewStatus" = 'PENDING' OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'invalid scrutiny document review transition'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ScrutinyDocument_immutable_artifact_update"
  BEFORE UPDATE ON "ScrutinyDocument"
  FOR EACH ROW EXECUTE FUNCTION "scrutiny_document_immutable_artifact"();

CREATE FUNCTION "scrutiny_action_status_transition"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    IF OLD."status" <> 'DRAFT'
       OR NEW."currentVersion" <> OLD."currentVersion" + 1
       OR NEW."version" <> OLD."version" + 1
    THEN
      RAISE EXCEPTION 'only a draft may receive a new immutable text version'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('APPROVED_INTERNAL', 'WITHDRAWN'))
    OR (OLD."status" = 'APPROVED_INTERNAL' AND NEW."status" IN ('FILED_EXTERNAL', 'WITHDRAWN'))
    OR (OLD."status" = 'FILED_EXTERNAL' AND NEW."status" IN ('DECIDED_EXTERNAL', 'APPEALED_EXTERNAL', 'CLOSED'))
    OR (OLD."status" = 'DECIDED_EXTERNAL' AND NEW."status" IN ('APPEALED_EXTERNAL', 'CLOSED'))
    OR (OLD."status" = 'APPEALED_EXTERNAL' AND NEW."status" = 'CLOSED')
  ) OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'invalid scrutiny action status transition'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ScrutinyAction_status_transition"
  BEFORE UPDATE ON "ScrutinyAction"
  FOR EACH ROW EXECUTE FUNCTION "scrutiny_action_status_transition"();

CREATE FUNCTION "scrutiny_decision_review_transition"() RETURNS trigger AS $$
BEGIN
  IF OLD."reviewStatus" <> 'PENDING' OR NEW."reviewStatus" = 'PENDING' THEN
    RAISE EXCEPTION 'invalid or repeated scrutiny decision review'
      USING ERRCODE = '55000';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'invalid scrutiny decision review version'
      USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW."id", NEW."tenantId", NEW."operationProfileId", NEW."actionId",
    NEW."decisionDocumentId", NEW."notificationDocumentId",
    NEW."clientRequestId", NEW."payloadSha256", NEW."outcome",
    NEW."authority", NEW."decidedAt", NEW."notifiedAt", NEW."reasoning",
    NEW."recordedById", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."tenantId", OLD."operationProfileId", OLD."actionId",
    OLD."decisionDocumentId", OLD."notificationDocumentId",
    OLD."clientRequestId", OLD."payloadSha256", OLD."outcome",
    OLD."authority", OLD."decidedAt", OLD."notifiedAt", OLD."reasoning",
    OLD."recordedById", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'scrutiny decision evidence is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ScrutinyDecision_review_transition"
  BEFORE UPDATE ON "ScrutinyActionDecision"
  FOR EACH ROW EXECUTE FUNCTION "scrutiny_decision_review_transition"();

CREATE FUNCTION "scrutiny_declaration_review_transition"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'DRAFT_INTERNAL'
     OR NEW."status" NOT IN ('OFFICIAL', 'REJECTED_INTERNAL')
     OR NEW."version" <> OLD."version" + 1
  THEN
    RAISE EXCEPTION 'invalid or repeated scrutiny declaration review'
      USING ERRCODE = '55000';
  END IF;
  IF ROW(
    NEW."id", NEW."tenantId", NEW."operationProfileId", NEW."commissionId",
    NEW."officialDocumentId", NEW."clientRequestId", NEW."payloadSha256",
    NEW."scopeReference", NEW."authority", NEW."authorityReference",
    NEW."declaredAt", NEW."recordedById", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."tenantId", OLD."operationProfileId", OLD."commissionId",
    OLD."officialDocumentId", OLD."clientRequestId", OLD."payloadSha256",
    OLD."scopeReference", OLD."authority", OLD."authorityReference",
    OLD."declaredAt", OLD."recordedById", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'scrutiny declaration evidence is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ScrutinyDeclaration_review_transition"
  BEFORE UPDATE ON "ScrutinyDeclaration"
  FOR EACH ROW EXECUTE FUNCTION "scrutiny_declaration_review_transition"();

COMMIT;
