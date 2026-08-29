-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('CANDIDACY', 'PARTY', 'GSC', 'PUBLIC_OFFICE');

-- CreateEnum
CREATE TYPE "PoliticalOperationMode" AS ENUM ('CAMPAIGN', 'PUBLIC_OFFICE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CAMPAIGN_MANAGER', 'FINANCE_MANAGER', 'COMMUNICATIONS_MANAGER', 'CONSTITUENT_SERVICES_MANAGER', 'CASE_WORKER', 'COMPLIANCE_OFFICER', 'AUDITOR', 'ZONE_COORDINATOR', 'WITNESS', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "DivisionType" AS ENUM ('COUNTRY', 'DEPARTAMENTO', 'MUNICIPIO', 'ZONA', 'PUESTO');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REPORTED_CNE');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StorageObjectModule" AS ENUM ('FINANCE', 'E14');

-- CreateEnum
CREATE TYPE "StoredObjectStatus" AS ENUM ('ISSUED', 'CONFIRMED', 'CONSUMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CneCode" AS ENUM ('PUBLICIDAD_VALLAS', 'TRANSPORTE', 'SEDE_CAMPANA', 'ACTOS_PUBLICOS', 'OTROS');

-- CreateEnum
CREATE TYPE "ConsentSubjectType" AS ENUM ('VOTER', 'CITIZEN', 'VOLUNTEER', 'USER', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('POLITICAL_COMMUNICATION', 'VOLUNTEER_MANAGEMENT', 'EVENT_MANAGEMENT', 'CONSTITUENT_CASE_MANAGEMENT', 'SERVICE_FOLLOW_UP', 'ANALYTICS');

-- CreateEnum
CREATE TYPE "ConsentLegalBasis" AS ENUM ('EXPLICIT_CONSENT', 'LEGAL_OBLIGATION', 'PUBLIC_TASK', 'CONTRACT');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED', 'EXPIRED', 'DENIED');

-- CreateEnum
CREATE TYPE "ConsentCollectionChannel" AS ENUM ('WEB_FORM', 'PAPER', 'PHONE', 'IN_PERSON', 'IMPORT');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('IN_PERSON', 'PHONE', 'SMS', 'WHATSAPP', 'EMAIL', 'SOCIAL_MEDIA', 'WEB', 'LETTER', 'INTERNAL');

-- CreateEnum
CREATE TYPE "InteractionDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "InteractionSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IssueCaseStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_CITIZEN', 'WAITING_ON_EXTERNAL_ENTITY', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignEventStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('PROPOSED', 'PLANNED', 'IN_PROGRESS', 'AT_RISK', 'FULFILLED', 'NOT_FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommunicationApprovalStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SERVICE', 'SYSTEM', 'ANONYMOUS');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TenantType" NOT NULL DEFAULT 'CANDIDACY',
    "defaultMode" "PoliticalOperationMode" NOT NULL DEFAULT 'CAMPAIGN',
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "maxTotalBudget" DECIMAL(15,2) NOT NULL,
    "maxPublicityLimit" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredObject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "module" "StorageObjectModule" NOT NULL,
    "contentType" VARCHAR(150) NOT NULL,
    "expectedSize" INTEGER NOT NULL,
    "actualSize" INTEGER,
    "etag" VARCHAR(255),
    "status" "StoredObjectStatus" NOT NULL DEFAULT 'ISSUED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "consumedByType" VARCHAR(64),
    "consumedById" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VOLUNTEER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "documentId" TEXT NOT NULL,
    "phone" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "divisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliticalDivision" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DivisionType" NOT NULL,
    "parentId" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "PoliticalDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voter" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "tenantId" TEXT NOT NULL,
    "puestoId" TEXT,
    "mesa" INTEGER,
    "registrarId" TEXT NOT NULL,
    "isSignatureValid" BOOLEAN NOT NULL DEFAULT false,
    "signatureImageUrl" TEXT,
    "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "consentIp" TEXT,
    "consentTimestamp" TIMESTAMP(3),
    "termsVersion" TEXT DEFAULT '2026.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEntry" (
    "id" TEXT NOT NULL,
    "type" "EntryType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "cneCode" "CneCode" NOT NULL,
    "description" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorTaxId" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "reporterId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" VARCHAR(500),
    "status" "FinanceStatus" NOT NULL DEFAULT 'PENDING',
    "auditLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WitnessReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "witnessId" TEXT NOT NULL,
    "puestoId" TEXT NOT NULL,
    "mesa" INTEGER NOT NULL,
    "e14ImageUrl" TEXT NOT NULL,
    "candidateVotes" INTEGER NOT NULL,
    "totalTableVotes" INTEGER NOT NULL,
    "observations" TEXT,
    "isSynced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WitnessReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "status" "CampaignEventStatus" NOT NULL DEFAULT 'DRAFT',
    "capacity" INTEGER,
    "responsibleId" TEXT,
    "mode" "PoliticalOperationMode" NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "warehouse" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "type" "MovementType" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "PoliticalOperationMode" NOT NULL,
    "subjectType" "ConsentSubjectType" NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "voterId" TEXT,
    "purpose" "ConsentPurpose" NOT NULL,
    "legalBasis" "ConsentLegalBasis" NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "collectionChannel" "ConsentCollectionChannel" NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "proofPath" TEXT,
    "sourceIpHash" TEXT,
    "capturedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revocationReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "PoliticalOperationMode" NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceChannel" "CommunicationChannel" NOT NULL,
    "status" "IssueCaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "WorkPriority" NOT NULL DEFAULT 'MEDIUM',
    "voterId" TEXT,
    "externalContactRef" TEXT,
    "divisionId" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "PoliticalOperationMode" NOT NULL,
    "issueCaseId" TEXT,
    "voterId" TEXT,
    "externalContactRef" TEXT,
    "actorId" TEXT,
    "consentRecordId" TEXT,
    "channel" "CommunicationChannel" NOT NULL,
    "direction" "InteractionDirection" NOT NULL,
    "summary" TEXT NOT NULL,
    "outcome" TEXT,
    "sentiment" "InteractionSentiment",
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "PoliticalOperationMode" NOT NULL,
    "issueCaseId" TEXT,
    "commitmentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "WorkPriority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "PoliticalOperationMode" NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "ownerId" TEXT,
    "issueCaseId" TEXT,
    "targetDate" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "evidencePath" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "PoliticalOperationMode" NOT NULL,
    "issueCaseId" TEXT,
    "channel" "CommunicationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "containsSensitiveData" BOOLEAN NOT NULL DEFAULT false,
    "status" "CommunicationApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decisionReason" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "PoliticalOperationMode" NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "requestId" TEXT,
    "sourceIpHash" TEXT,
    "userAgent" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSettings_tenantId_key" ON "CampaignSettings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredObject_path_key" ON "StoredObject"("path");

-- CreateIndex
CREATE INDEX "StoredObject_tenantId_status_expiresAt_idx" ON "StoredObject"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StoredObject_tenantId_uploaderId_createdAt_idx" ON "StoredObject"("tenantId", "uploaderId", "createdAt");

-- CreateIndex
CREATE INDEX "StoredObject_tenantId_module_consumedAt_idx" ON "StoredObject"("tenantId", "module", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoredObject_id_tenantId_key" ON "StoredObject"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");

-- CreateIndex
CREATE INDEX "User_tenantId_isActive_role_idx" ON "User"("tenantId", "isActive", "role");

-- CreateIndex
CREATE INDEX "User_tenantId_divisionId_idx" ON "User"("tenantId", "divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_tenantId_key" ON "User"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_documentId_tenantId_key" ON "User"("documentId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvitation_tokenHash_key" ON "TeamInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "TeamInvitation_tenantId_email_acceptedAt_expiresAt_idx" ON "TeamInvitation"("tenantId", "email", "acceptedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "TeamInvitation_tenantId_invitedById_createdAt_idx" ON "TeamInvitation"("tenantId", "invitedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvitation_id_tenantId_key" ON "TeamInvitation"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PoliticalDivision_tenantId_type_idx" ON "PoliticalDivision"("tenantId", "type");

-- CreateIndex
CREATE INDEX "PoliticalDivision_tenantId_parentId_idx" ON "PoliticalDivision"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "PoliticalDivision_id_tenantId_key" ON "PoliticalDivision"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PoliticalDivision_tenantId_code_type_key" ON "PoliticalDivision"("tenantId", "code", "type");

-- CreateIndex
CREATE INDEX "Voter_tenantId_puestoId_idx" ON "Voter"("tenantId", "puestoId");

-- CreateIndex
CREATE INDEX "Voter_tenantId_registrarId_idx" ON "Voter"("tenantId", "registrarId");

-- CreateIndex
CREATE UNIQUE INDEX "Voter_id_tenantId_key" ON "Voter"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Voter_documentId_tenantId_key" ON "Voter"("documentId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEntry_evidenceUrl_key" ON "FinancialEntry"("evidenceUrl");

-- CreateIndex
CREATE INDEX "FinancialEntry_tenantId_type_date_idx" ON "FinancialEntry"("tenantId", "type", "date");

-- CreateIndex
CREATE INDEX "FinancialEntry_tenantId_status_date_idx" ON "FinancialEntry"("tenantId", "status", "date");

-- CreateIndex
CREATE INDEX "FinancialEntry_tenantId_reviewedById_reviewedAt_idx" ON "FinancialEntry"("tenantId", "reviewedById", "reviewedAt");

-- CreateIndex
CREATE INDEX "FinancialEntry_tenantId_cneCode_idx" ON "FinancialEntry"("tenantId", "cneCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEntry_id_tenantId_key" ON "FinancialEntry"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WitnessReport_e14ImageUrl_key" ON "WitnessReport"("e14ImageUrl");

-- CreateIndex
CREATE INDEX "WitnessReport_tenantId_witnessId_createdAt_idx" ON "WitnessReport"("tenantId", "witnessId", "createdAt");

-- CreateIndex
CREATE INDEX "WitnessReport_tenantId_isSynced_idx" ON "WitnessReport"("tenantId", "isSynced");

-- CreateIndex
CREATE UNIQUE INDEX "WitnessReport_id_tenantId_key" ON "WitnessReport"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WitnessReport_tenantId_puestoId_mesa_key" ON "WitnessReport"("tenantId", "puestoId", "mesa");

-- CreateIndex
CREATE INDEX "CampaignEvent_tenantId_mode_date_idx" ON "CampaignEvent"("tenantId", "mode", "date");

-- CreateIndex
CREATE INDEX "CampaignEvent_tenantId_mode_status_date_idx" ON "CampaignEvent"("tenantId", "mode", "status", "date");

-- CreateIndex
CREATE INDEX "CampaignEvent_tenantId_responsibleId_date_idx" ON "CampaignEvent"("tenantId", "responsibleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignEvent_id_tenantId_key" ON "CampaignEvent"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PointLog_tenantId_userId_createdAt_idx" ON "PointLog"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "PointLog_tenantId_eventId_idx" ON "PointLog"("tenantId", "eventId");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_name_idx" ON "InventoryItem"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_id_tenantId_key" ON "InventoryItem"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_tenantId_sku_key" ON "InventoryItem"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "InventoryMovement_tenantId_itemId_createdAt_idx" ON "InventoryMovement"("tenantId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_tenantId_userId_createdAt_idx" ON "InventoryMovement"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_mode_subjectRef_purpose_status_idx" ON "ConsentRecord"("tenantId", "mode", "subjectRef", "purpose", "status");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_voterId_idx" ON "ConsentRecord"("tenantId", "voterId");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_expiresAt_idx" ON "ConsentRecord"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_id_tenantId_key" ON "ConsentRecord"("id", "tenantId");

-- CreateIndex
CREATE INDEX "IssueCase_tenantId_mode_status_priority_idx" ON "IssueCase"("tenantId", "mode", "status", "priority");

-- CreateIndex
CREATE INDEX "IssueCase_tenantId_assigneeId_dueAt_idx" ON "IssueCase"("tenantId", "assigneeId", "dueAt");

-- CreateIndex
CREATE INDEX "IssueCase_tenantId_voterId_idx" ON "IssueCase"("tenantId", "voterId");

-- CreateIndex
CREATE INDEX "IssueCase_tenantId_divisionId_idx" ON "IssueCase"("tenantId", "divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueCase_id_tenantId_key" ON "IssueCase"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueCase_tenantId_mode_reference_key" ON "IssueCase"("tenantId", "mode", "reference");

-- CreateIndex
CREATE INDEX "Interaction_tenantId_mode_occurredAt_idx" ON "Interaction"("tenantId", "mode", "occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_tenantId_issueCaseId_occurredAt_idx" ON "Interaction"("tenantId", "issueCaseId", "occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_tenantId_voterId_occurredAt_idx" ON "Interaction"("tenantId", "voterId", "occurredAt");

-- CreateIndex
CREATE INDEX "Task_tenantId_mode_status_dueAt_idx" ON "Task"("tenantId", "mode", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_tenantId_assigneeId_status_idx" ON "Task"("tenantId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "Task_tenantId_issueCaseId_idx" ON "Task"("tenantId", "issueCaseId");

-- CreateIndex
CREATE INDEX "Task_tenantId_commitmentId_idx" ON "Task"("tenantId", "commitmentId");

-- CreateIndex
CREATE INDEX "Commitment_tenantId_mode_status_targetDate_idx" ON "Commitment"("tenantId", "mode", "status", "targetDate");

-- CreateIndex
CREATE INDEX "Commitment_tenantId_ownerId_idx" ON "Commitment"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Commitment_id_tenantId_key" ON "Commitment"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Commitment_tenantId_reference_key" ON "Commitment"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "CommunicationApproval_tenantId_mode_status_createdAt_idx" ON "CommunicationApproval"("tenantId", "mode", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationApproval_tenantId_scheduledAt_idx" ON "CommunicationApproval"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "CommunicationApproval_tenantId_issueCaseId_idx" ON "CommunicationApproval"("tenantId", "issueCaseId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_occurredAt_idx" ON "AuditEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_resourceType_resourceId_occurredAt_idx" ON "AuditEvent"("tenantId", "resourceType", "resourceId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_actorUserId_occurredAt_idx" ON "AuditEvent"("tenantId", "actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_requestId_idx" ON "AuditEvent"("tenantId", "requestId");

-- AddForeignKey
ALTER TABLE "CampaignSettings" ADD CONSTRAINT "CampaignSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_uploaderId_tenantId_fkey" FOREIGN KEY ("uploaderId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_divisionId_tenantId_fkey" FOREIGN KEY ("divisionId", "tenantId") REFERENCES "PoliticalDivision"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_invitedById_tenantId_fkey" FOREIGN KEY ("invitedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliticalDivision" ADD CONSTRAINT "PoliticalDivision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoliticalDivision" ADD CONSTRAINT "PoliticalDivision_parentId_tenantId_fkey" FOREIGN KEY ("parentId", "tenantId") REFERENCES "PoliticalDivision"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voter" ADD CONSTRAINT "Voter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voter" ADD CONSTRAINT "Voter_puestoId_tenantId_fkey" FOREIGN KEY ("puestoId", "tenantId") REFERENCES "PoliticalDivision"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voter" ADD CONSTRAINT "Voter_registrarId_tenantId_fkey" FOREIGN KEY ("registrarId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_reporterId_tenantId_fkey" FOREIGN KEY ("reporterId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_reviewedById_tenantId_fkey" FOREIGN KEY ("reviewedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WitnessReport" ADD CONSTRAINT "WitnessReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WitnessReport" ADD CONSTRAINT "WitnessReport_puestoId_tenantId_fkey" FOREIGN KEY ("puestoId", "tenantId") REFERENCES "PoliticalDivision"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WitnessReport" ADD CONSTRAINT "WitnessReport_witnessId_tenantId_fkey" FOREIGN KEY ("witnessId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_responsibleId_tenantId_fkey" FOREIGN KEY ("responsibleId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLog" ADD CONSTRAINT "PointLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLog" ADD CONSTRAINT "PointLog_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLog" ADD CONSTRAINT "PointLog_eventId_tenantId_fkey" FOREIGN KEY ("eventId", "tenantId") REFERENCES "CampaignEvent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_tenantId_fkey" FOREIGN KEY ("itemId", "tenantId") REFERENCES "InventoryItem"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_voterId_tenantId_fkey" FOREIGN KEY ("voterId", "tenantId") REFERENCES "Voter"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_capturedById_tenantId_fkey" FOREIGN KEY ("capturedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueCase" ADD CONSTRAINT "IssueCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueCase" ADD CONSTRAINT "IssueCase_voterId_tenantId_fkey" FOREIGN KEY ("voterId", "tenantId") REFERENCES "Voter"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueCase" ADD CONSTRAINT "IssueCase_divisionId_tenantId_fkey" FOREIGN KEY ("divisionId", "tenantId") REFERENCES "PoliticalDivision"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueCase" ADD CONSTRAINT "IssueCase_assigneeId_tenantId_fkey" FOREIGN KEY ("assigneeId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueCase" ADD CONSTRAINT "IssueCase_createdById_tenantId_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_issueCaseId_tenantId_fkey" FOREIGN KEY ("issueCaseId", "tenantId") REFERENCES "IssueCase"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_voterId_tenantId_fkey" FOREIGN KEY ("voterId", "tenantId") REFERENCES "Voter"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_consentRecordId_tenantId_fkey" FOREIGN KEY ("consentRecordId", "tenantId") REFERENCES "ConsentRecord"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_issueCaseId_tenantId_fkey" FOREIGN KEY ("issueCaseId", "tenantId") REFERENCES "IssueCase"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_commitmentId_tenantId_fkey" FOREIGN KEY ("commitmentId", "tenantId") REFERENCES "Commitment"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_tenantId_fkey" FOREIGN KEY ("assigneeId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_tenantId_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_ownerId_tenantId_fkey" FOREIGN KEY ("ownerId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_issueCaseId_tenantId_fkey" FOREIGN KEY ("issueCaseId", "tenantId") REFERENCES "IssueCase"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationApproval" ADD CONSTRAINT "CommunicationApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationApproval" ADD CONSTRAINT "CommunicationApproval_issueCaseId_tenantId_fkey" FOREIGN KEY ("issueCaseId", "tenantId") REFERENCES "IssueCase"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationApproval" ADD CONSTRAINT "CommunicationApproval_requestedById_tenantId_fkey" FOREIGN KEY ("requestedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationApproval" ADD CONSTRAINT "CommunicationApproval_decidedById_tenantId_fkey" FOREIGN KEY ("decidedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_tenantId_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database invariants that Prisma cannot currently express in schema.prisma.
-- Keep these checks covered by the migration-backed PostgreSQL CI job.
ALTER TABLE "CampaignEvent"
ADD CONSTRAINT "CampaignEvent_time_order_check"
CHECK ("endsAt" > "date");

ALTER TABLE "CampaignEvent"
ADD CONSTRAINT "CampaignEvent_capacity_check"
CHECK ("capacity" IS NULL OR "capacity" > 0);

ALTER TABLE "CampaignSettings"
ADD CONSTRAINT "CampaignSettings_limits_check"
CHECK (
  "maxTotalBudget" > 0
  AND "maxPublicityLimit" > 0
  AND "maxPublicityLimit" <= "maxTotalBudget"
);

ALTER TABLE "FinancialEntry"
ADD CONSTRAINT "FinancialEntry_positive_amount_check"
CHECK ("amount" > 0);

ALTER TABLE "FinancialEntry"
ADD CONSTRAINT "FinancialEntry_four_eyes_check"
CHECK ("reviewedById" IS NULL OR "reviewedById" <> "reporterId");

ALTER TABLE "FinancialEntry"
ADD CONSTRAINT "FinancialEntry_approval_evidence_check"
CHECK ("status" NOT IN ('APPROVED', 'REPORTED_CNE') OR "evidenceUrl" IS NOT NULL);

ALTER TABLE "FinancialEntry"
ADD CONSTRAINT "FinancialEntry_review_state_check"
CHECK (
  (
    "status" = 'PENDING'
    AND "reviewedById" IS NULL
    AND "reviewedAt" IS NULL
    AND "reviewReason" IS NULL
  )
  OR
  (
    "status" IN ('APPROVED', 'REJECTED', 'REPORTED_CNE')
    AND "reviewedById" IS NOT NULL
    AND "reviewedAt" IS NOT NULL
    AND char_length(btrim("reviewReason")) BETWEEN 10 AND 500
  )
);

ALTER TABLE "WitnessReport"
ADD CONSTRAINT "WitnessReport_vote_totals_check"
CHECK (
  "candidateVotes" >= 0
  AND "totalTableVotes" >= 0
  AND "candidateVotes" <= "totalTableVotes"
);

ALTER TABLE "StoredObject"
ADD CONSTRAINT "StoredObject_sizes_check"
CHECK (
  "expectedSize" > 0
  AND ("actualSize" IS NULL OR "actualSize" > 0)
);

ALTER TABLE "StoredObject"
ADD CONSTRAINT "StoredObject_path_scope_check"
CHECK (
  split_part("path", '/', 1) = "tenantId"
  AND split_part("path", '/', 2) = lower("module"::text)
  AND array_length(string_to_array("path", '/'), 1) = 3
  AND split_part("path", '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]{2,10}$'
);

ALTER TABLE "StoredObject"
ADD CONSTRAINT "StoredObject_state_check"
CHECK (
  (
    "status" IN ('ISSUED', 'EXPIRED')
    AND "confirmedAt" IS NULL
    AND "consumedAt" IS NULL
    AND "consumedByType" IS NULL
    AND "consumedById" IS NULL
  )
  OR
  (
    "status" = 'CONFIRMED'
    AND "confirmedAt" IS NOT NULL
    AND "actualSize" IS NOT NULL
    AND "consumedAt" IS NULL
    AND "consumedByType" IS NULL
    AND "consumedById" IS NULL
  )
  OR
  (
    "status" = 'CONSUMED'
    AND "confirmedAt" IS NOT NULL
    AND "actualSize" IS NOT NULL
    AND "consumedAt" IS NOT NULL
    AND "consumedByType" IS NOT NULL
    AND "consumedById" IS NOT NULL
  )
);
