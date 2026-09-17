-- Formal PQRSD for PUBLIC_OFFICE tenants. This migration is deliberately
-- atomic: every enum, table, constraint, trigger and policy rolls back as one.
BEGIN;

ALTER TYPE "StorageObjectModule" ADD VALUE IF NOT EXISTS 'PQRSD';

-- CreateEnum
CREATE TYPE "PqrsdRulePackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PqrsdRuleReviewDecision" AS ENUM ('APPROVE_ACTIVATE', 'REJECT');

-- CreateEnum
CREATE TYPE "PqrsdDayComputationMethod" AS ENUM ('CALENDAR_DAYS', 'WORKING_DAYS');

-- CreateEnum
CREATE TYPE "PqrsdTermStartRule" AS ENUM ('RECEIPT_DATE', 'NEXT_CALENDAR_DATE', 'NEXT_WORKING_DATE', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "PqrsdCalendarExceptionType" AS ENUM ('NON_WORKING', 'WORKING_OVERRIDE');

-- CreateEnum
CREATE TYPE "PqrsdDossierStatus" AS ENUM ('RECEIVED', 'CLASSIFICATION_PENDING', 'CLASSIFIED', 'ASSIGNED', 'IN_PROGRESS', 'TRANSFER_PENDING', 'WAITING_ON_PETITIONER', 'EXTENSION_PROPOSED', 'DRAFT_RESPONSE', 'RETURNED_FOR_CHANGES', 'REVIEWED', 'AUTHORIZED', 'DELIVERY_PENDING', 'DELIVERED', 'CLOSED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PqrsdRiskLevel" AS ENUM ('NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "PqrsdCompetence" AS ENUM ('COMPETENT', 'TRANSFER_REQUIRED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "PqrsdReviewDecision" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "PqrsdDocumentType" AS ENUM ('INTAKE_ATTACHMENT', 'RECEIPT_ACKNOWLEDGEMENT', 'CLASSIFICATION_SUPPORT', 'TRANSFER_SUPPORT', 'TRANSFER_PROOF', 'EXTENSION_SUPPORT', 'RESPONSE_ATTACHMENT', 'AUTHORIZATION_ARTIFACT', 'DELIVERY_PROOF', 'CLOSURE_SUPPORT', 'REOPENING_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "PqrsdDeadlineCalculationStatus" AS ENUM ('CALCULATED', 'MANUAL_REVIEWED', 'CALCULATION_REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "PqrsdResponseReviewDecision" AS ENUM ('APPROVE', 'RETURN_FOR_CHANGES');

-- CreateEnum
CREATE TYPE "PqrsdAuthorizationDecision" AS ENUM ('AUTHORIZE', 'RETURN_FOR_CHANGES');

-- CreateEnum
CREATE TYPE "PqrsdDeliveryOutcome" AS ENUM ('PENDING_CONFIRMATION', 'DELIVERED', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "PqrsdClosureCause" AS ENUM ('RESPONSE_DELIVERED', 'TRANSFER_COMPLETED', 'WITHDRAWN', 'DUPLICATE', 'NO_ACTION_LEGAL_BASIS', 'OTHER');

-- CreateEnum
CREATE TYPE "PqrsdCommandType" AS ENUM ('RULE_PACKAGE_CREATE', 'RULE_PACKAGE_REVIEW', 'DOSSIER_CREATE', 'DOCUMENT_ATTACH', 'DOCUMENT_REVIEW', 'ACKNOWLEDGEMENT_RECORD', 'CLASSIFICATION_PROPOSE', 'CLASSIFICATION_REVIEW', 'ASSIGNMENT_RECORD', 'TRANSFER_PROPOSE', 'TRANSFER_REVIEW', 'TRANSFER_ATTEMPT_RECORD', 'EXTENSION_PROPOSE', 'EXTENSION_REVIEW', 'RESPONSE_VERSION_CREATE', 'RESPONSE_REVIEW', 'RESPONSE_AUTHORIZE', 'DELIVERY_ATTEMPT_RECORD', 'DOSSIER_CLOSE', 'DOSSIER_REOPEN');

-- CreateTable
CREATE TABLE "PqrsdRulePackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scopeKey" VARCHAR(120) NOT NULL,
    "versionLabel" VARCHAR(80) NOT NULL,
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "sourceReference" VARCHAR(500) NOT NULL,
    "sourceSha256" CHAR(64) NOT NULL,
    "timeZone" VARCHAR(100) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "nonWorkingWeekdays" INTEGER[] NOT NULL,
    "computationMethodNote" VARCHAR(1000) NOT NULL,
    "status" "PqrsdRulePackageStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "PqrsdRulePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdRuleDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "classificationKey" VARCHAR(120) NOT NULL,
    "label" VARCHAR(240) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "dayMethod" "PqrsdDayComputationMethod" NOT NULL,
    "startRule" "PqrsdTermStartRule" NOT NULL,
    "legalBasis" VARCHAR(2000) NOT NULL,
    "highRisk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdRuleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdCalendarException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "type" "PqrsdCalendarExceptionType" NOT NULL,
    "label" VARCHAR(240) NOT NULL,
    "sourceReference" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdCalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdRulePackageDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "decision" "PqrsdRuleReviewDecision" NOT NULL,
    "rationale" VARCHAR(2000) NOT NULL,
    "actorId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdRulePackageDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdDossier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" VARCHAR(80) NOT NULL,
    "rulePackageId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedTimeZone" VARCHAR(100) NOT NULL,
    "receivedChannel" VARCHAR(120) NOT NULL,
    "externalReceiptNumber" VARCHAR(160),
    "subject" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "acknowledgementRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "PqrsdDossierStatus" NOT NULL DEFAULT 'RECEIVED',
    "riskLevel" "PqrsdRiskLevel" NOT NULL DEFAULT 'NORMAL',
    "currentPrimaryAssigneeId" TEXT,
    "currentBackupAssigneeId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PqrsdDossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdPetitionerSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "fullName" VARCHAR(240) NOT NULL,
    "documentType" VARCHAR(40),
    "documentNumber" VARCHAR(80),
    "email" VARCHAR(320),
    "phone" VARCHAR(60),
    "postalAddress" VARCHAR(500),
    "preferredChannel" VARCHAR(80) NOT NULL,
    "maskedFullName" VARCHAR(240) NOT NULL,
    "maskedDocumentNumber" VARCHAR(80),
    "maskedEmail" VARCHAR(320),
    "maskedPhone" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdPetitionerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "storedObjectId" TEXT NOT NULL,
    "type" "PqrsdDocumentType" NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "storagePath" VARCHAR(512) NOT NULL,
    "contentType" VARCHAR(150) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "sourceReference" VARCHAR(1000),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdDocumentReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "decision" "PqrsdReviewDecision" NOT NULL,
    "rationale" VARCHAR(1500) NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdDocumentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdReceiptAcknowledgement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "acknowledgementNumber" VARCHAR(160) NOT NULL,
    "channel" VARCHAR(100) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdReceiptAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdDetailAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "purpose" VARCHAR(1000) NOT NULL,
    "actorId" TEXT NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdDetailAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdClassificationVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "ruleDefinitionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "categoryKey" VARCHAR(120) NOT NULL,
    "categoryLabel" VARCHAR(240) NOT NULL,
    "competence" "PqrsdCompetence" NOT NULL,
    "department" VARCHAR(240) NOT NULL,
    "competentAuthority" VARCHAR(500) NOT NULL,
    "rationale" VARCHAR(2000) NOT NULL,
    "proposedById" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdClassificationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdClassificationReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "decision" "PqrsdReviewDecision" NOT NULL,
    "rationale" VARCHAR(1500) NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdClassificationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdDeadlineVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "ruleDefinitionId" TEXT NOT NULL,
    "extensionProposalId" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "calculationStatus" "PqrsdDeadlineCalculationStatus" NOT NULL,
    "startLocalDate" DATE NOT NULL,
    "startExplanation" VARCHAR(1500) NOT NULL,
    "originalDueLocalDate" DATE,
    "currentDueLocalDate" DATE,
    "dueAt" TIMESTAMP(3),
    "includedDays" JSONB NOT NULL,
    "excludedDays" JSONB NOT NULL,
    "calculationTrace" JSONB NOT NULL,
    "changeReason" VARCHAR(1500) NOT NULL,
    "changeAuthority" VARCHAR(1000) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdDeadlineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdAssignmentEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "primaryAssigneeId" TEXT NOT NULL,
    "backupAssigneeId" TEXT NOT NULL,
    "reason" VARCHAR(1500) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdAssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "destination" VARCHAR(500) NOT NULL,
    "destinationReference" VARCHAR(500),
    "reason" VARCHAR(2000) NOT NULL,
    "legalAuthority" VARCHAR(1500) NOT NULL,
    "dueLocalDate" DATE NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "timeZone" VARCHAR(100) NOT NULL,
    "supportDocumentId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdTransferReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "decision" "PqrsdReviewDecision" NOT NULL,
    "rationale" VARCHAR(1500) NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdTransferReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdTransferAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "outcome" "PqrsdDeliveryOutcome" NOT NULL,
    "externalReference" VARCHAR(500),
    "evidenceDocumentId" TEXT,
    "failureReason" VARCHAR(1500),
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdTransferAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdExtensionProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "requestedDueLocalDate" DATE NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "legalAuthority" VARCHAR(1500) NOT NULL,
    "supportDocumentId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdExtensionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdExtensionReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "decision" "PqrsdReviewDecision" NOT NULL,
    "rationale" VARCHAR(1500) NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdExtensionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdResponseVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "contentSha256" CHAR(64) NOT NULL,
    "attachmentDocumentId" TEXT,
    "draftedById" TEXT NOT NULL,
    "draftedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdResponseVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdResponseReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "decision" "PqrsdResponseReviewDecision" NOT NULL,
    "rationale" VARCHAR(2000) NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdResponseReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdResponseAuthorization" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "decision" "PqrsdAuthorizationDecision" NOT NULL,
    "rationale" VARCHAR(2000) NOT NULL,
    "authorizationReference" VARCHAR(500),
    "authorizationDocumentId" TEXT,
    "authorizerId" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdResponseAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "channel" VARCHAR(120) NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "outcome" "PqrsdDeliveryOutcome" NOT NULL,
    "externalReference" VARCHAR(500),
    "evidenceDocumentId" TEXT,
    "failureReason" VARCHAR(1500),
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdClosure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "cause" "PqrsdClosureCause" NOT NULL,
    "rationale" VARCHAR(2000) NOT NULL,
    "legalAuthority" VARCHAR(1500) NOT NULL,
    "supportDocumentId" TEXT,
    "actorId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdReopening" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "closureId" TEXT NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "legalAuthority" VARCHAR(1500) NOT NULL,
    "supportDocumentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reopenedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdReopening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdStatusEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "fromStatus" "PqrsdDossierStatus",
    "toStatus" "PqrsdDossierStatus" NOT NULL,
    "reason" VARCHAR(1500) NOT NULL,
    "authority" VARCHAR(1000) NOT NULL,
    "actorId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsdCommand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "commandId" UUID NOT NULL,
    "commandType" "PqrsdCommandType" NOT NULL,
    "payloadSha256" CHAR(64) NOT NULL,
    "resultSnapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "versionBefore" INTEGER,
    "versionAfter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsdCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PqrsdRulePackage_tenantId_scopeKey_status_effectiveFrom_idx" ON "PqrsdRulePackage"("tenantId", "scopeKey", "status", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PqrsdRulePackage_tenantId_createdById_createdAt_idx" ON "PqrsdRulePackage"("tenantId", "createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdRulePackage_id_tenantId_key" ON "PqrsdRulePackage"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdRulePackage_tenantId_scopeKey_versionLabel_key" ON "PqrsdRulePackage"("tenantId", "scopeKey", "versionLabel");

-- CreateIndex
CREATE INDEX "PqrsdRuleDefinition_tenantId_packageId_idx" ON "PqrsdRuleDefinition"("tenantId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdRuleDefinition_id_tenantId_key" ON "PqrsdRuleDefinition"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdRuleDefinition_tenantId_packageId_classificationKey_key" ON "PqrsdRuleDefinition"("tenantId", "packageId", "classificationKey");

-- CreateIndex
CREATE INDEX "PqrsdCalendarException_tenantId_packageId_localDate_idx" ON "PqrsdCalendarException"("tenantId", "packageId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdCalendarException_id_tenantId_key" ON "PqrsdCalendarException"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdCalendarException_tenantId_packageId_localDate_key" ON "PqrsdCalendarException"("tenantId", "packageId", "localDate");

-- CreateIndex
CREATE INDEX "PqrsdRulePackageDecision_tenantId_actorId_decidedAt_idx" ON "PqrsdRulePackageDecision"("tenantId", "actorId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdRulePackageDecision_id_tenantId_key" ON "PqrsdRulePackageDecision"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdRulePackageDecision_tenantId_packageId_key" ON "PqrsdRulePackageDecision"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "PqrsdDossier_tenantId_status_updatedAt_idx" ON "PqrsdDossier"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "PqrsdDossier_tenantId_currentPrimaryAssigneeId_status_idx" ON "PqrsdDossier"("tenantId", "currentPrimaryAssigneeId", "status");

-- CreateIndex
CREATE INDEX "PqrsdDossier_tenantId_currentBackupAssigneeId_status_idx" ON "PqrsdDossier"("tenantId", "currentBackupAssigneeId", "status");

-- CreateIndex
CREATE INDEX "PqrsdDossier_tenantId_rulePackageId_idx" ON "PqrsdDossier"("tenantId", "rulePackageId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDossier_id_tenantId_key" ON "PqrsdDossier"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDossier_tenantId_reference_key" ON "PqrsdDossier"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "PqrsdPetitionerSnapshot_tenantId_createdAt_idx" ON "PqrsdPetitionerSnapshot"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdPetitionerSnapshot_id_tenantId_key" ON "PqrsdPetitionerSnapshot"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdPetitionerSnapshot_dossierId_tenantId_key" ON "PqrsdPetitionerSnapshot"("dossierId", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdDocument_tenantId_dossierId_type_createdAt_idx" ON "PqrsdDocument"("tenantId", "dossierId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDocument_id_tenantId_key" ON "PqrsdDocument"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDocument_storedObjectId_tenantId_key" ON "PqrsdDocument"("storedObjectId", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdDocumentReview_tenantId_reviewerId_reviewedAt_idx" ON "PqrsdDocumentReview"("tenantId", "reviewerId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDocumentReview_id_tenantId_key" ON "PqrsdDocumentReview"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDocumentReview_tenantId_documentId_key" ON "PqrsdDocumentReview"("tenantId", "documentId");

-- CreateIndex
CREATE INDEX "PqrsdReceiptAcknowledgement_tenantId_dossierId_issuedAt_idx" ON "PqrsdReceiptAcknowledgement"("tenantId", "dossierId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdReceiptAcknowledgement_id_tenantId_key" ON "PqrsdReceiptAcknowledgement"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdReceiptAcknowledgement_tenantId_dossierId_acknowledgem_key" ON "PqrsdReceiptAcknowledgement"("tenantId", "dossierId", "acknowledgementNumber");

-- CreateIndex
CREATE INDEX "PqrsdDetailAccess_tenantId_dossierId_accessedAt_idx" ON "PqrsdDetailAccess"("tenantId", "dossierId", "accessedAt");

-- CreateIndex
CREATE INDEX "PqrsdDetailAccess_tenantId_actorId_accessedAt_idx" ON "PqrsdDetailAccess"("tenantId", "actorId", "accessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDetailAccess_id_tenantId_key" ON "PqrsdDetailAccess"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdClassificationVersion_tenantId_dossierId_proposedAt_idx" ON "PqrsdClassificationVersion"("tenantId", "dossierId", "proposedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdClassificationVersion_id_tenantId_key" ON "PqrsdClassificationVersion"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdClassificationVersion_tenantId_dossierId_versionNumber_key" ON "PqrsdClassificationVersion"("tenantId", "dossierId", "versionNumber");

-- CreateIndex
CREATE INDEX "PqrsdClassificationReview_tenantId_reviewerId_reviewedAt_idx" ON "PqrsdClassificationReview"("tenantId", "reviewerId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdClassificationReview_id_tenantId_key" ON "PqrsdClassificationReview"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdClassificationReview_classificationId_tenantId_key" ON "PqrsdClassificationReview"("classificationId", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdDeadlineVersion_tenantId_dossierId_currentDueLocalDate_idx" ON "PqrsdDeadlineVersion"("tenantId", "dossierId", "currentDueLocalDate");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDeadlineVersion_id_tenantId_key" ON "PqrsdDeadlineVersion"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDeadlineVersion_tenantId_dossierId_versionNumber_key" ON "PqrsdDeadlineVersion"("tenantId", "dossierId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDeadlineVersion_extensionProposalId_tenantId_key" ON "PqrsdDeadlineVersion"("extensionProposalId", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdAssignmentEvent_tenantId_dossierId_effectiveAt_idx" ON "PqrsdAssignmentEvent"("tenantId", "dossierId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdAssignmentEvent_id_tenantId_key" ON "PqrsdAssignmentEvent"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdTransfer_tenantId_dossierId_proposedAt_idx" ON "PqrsdTransfer"("tenantId", "dossierId", "proposedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdTransfer_id_tenantId_key" ON "PqrsdTransfer"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdTransferReview_tenantId_reviewerId_reviewedAt_idx" ON "PqrsdTransferReview"("tenantId", "reviewerId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdTransferReview_id_tenantId_key" ON "PqrsdTransferReview"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdTransferReview_transferId_tenantId_key" ON "PqrsdTransferReview"("transferId", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdTransferAttempt_tenantId_transferId_attemptedAt_idx" ON "PqrsdTransferAttempt"("tenantId", "transferId", "attemptedAt");

-- CreateIndex
CREATE INDEX "PqrsdTransferAttempt_tenantId_dossierId_outcome_idx" ON "PqrsdTransferAttempt"("tenantId", "dossierId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdTransferAttempt_id_tenantId_key" ON "PqrsdTransferAttempt"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdExtensionProposal_tenantId_dossierId_proposedAt_idx" ON "PqrsdExtensionProposal"("tenantId", "dossierId", "proposedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdExtensionProposal_id_tenantId_key" ON "PqrsdExtensionProposal"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdExtensionReview_tenantId_reviewerId_reviewedAt_idx" ON "PqrsdExtensionReview"("tenantId", "reviewerId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdExtensionReview_id_tenantId_key" ON "PqrsdExtensionReview"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdExtensionReview_extensionId_tenantId_key" ON "PqrsdExtensionReview"("extensionId", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdResponseVersion_tenantId_dossierId_draftedAt_idx" ON "PqrsdResponseVersion"("tenantId", "dossierId", "draftedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdResponseVersion_id_tenantId_key" ON "PqrsdResponseVersion"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdResponseVersion_tenantId_dossierId_versionNumber_key" ON "PqrsdResponseVersion"("tenantId", "dossierId", "versionNumber");

-- CreateIndex
CREATE INDEX "PqrsdResponseReview_tenantId_reviewerId_reviewedAt_idx" ON "PqrsdResponseReview"("tenantId", "reviewerId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdResponseReview_id_tenantId_key" ON "PqrsdResponseReview"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdResponseReview_responseId_tenantId_key" ON "PqrsdResponseReview"("responseId", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdResponseAuthorization_tenantId_authorizerId_authorized_idx" ON "PqrsdResponseAuthorization"("tenantId", "authorizerId", "authorizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdResponseAuthorization_id_tenantId_key" ON "PqrsdResponseAuthorization"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdResponseAuthorization_responseId_tenantId_key" ON "PqrsdResponseAuthorization"("responseId", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdDeliveryAttempt_tenantId_dossierId_attemptedAt_idx" ON "PqrsdDeliveryAttempt"("tenantId", "dossierId", "attemptedAt");

-- CreateIndex
CREATE INDEX "PqrsdDeliveryAttempt_tenantId_outcome_attemptedAt_idx" ON "PqrsdDeliveryAttempt"("tenantId", "outcome", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdDeliveryAttempt_id_tenantId_key" ON "PqrsdDeliveryAttempt"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdClosure_tenantId_dossierId_closedAt_idx" ON "PqrsdClosure"("tenantId", "dossierId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdClosure_id_tenantId_key" ON "PqrsdClosure"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdClosure_tenantId_dossierId_sequence_key" ON "PqrsdClosure"("tenantId", "dossierId", "sequence");

-- CreateIndex
CREATE INDEX "PqrsdReopening_tenantId_dossierId_reopenedAt_idx" ON "PqrsdReopening"("tenantId", "dossierId", "reopenedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdReopening_id_tenantId_key" ON "PqrsdReopening"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdReopening_tenantId_closureId_key" ON "PqrsdReopening"("tenantId", "closureId");

-- CreateIndex
CREATE INDEX "PqrsdStatusEvent_tenantId_dossierId_occurredAt_idx" ON "PqrsdStatusEvent"("tenantId", "dossierId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdStatusEvent_id_tenantId_key" ON "PqrsdStatusEvent"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PqrsdCommand_tenantId_commandType_createdAt_idx" ON "PqrsdCommand"("tenantId", "commandType", "createdAt");

-- CreateIndex
CREATE INDEX "PqrsdCommand_tenantId_actorId_createdAt_idx" ON "PqrsdCommand"("tenantId", "actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdCommand_id_tenantId_key" ON "PqrsdCommand"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PqrsdCommand_tenantId_commandId_key" ON "PqrsdCommand"("tenantId", "commandId");

-- AddForeignKey
ALTER TABLE "PqrsdRulePackage" ADD CONSTRAINT "PqrsdRulePackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdRulePackage" ADD CONSTRAINT "PqrsdRulePackage_createdById_tenantId_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdRuleDefinition" ADD CONSTRAINT "PqrsdRuleDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdRuleDefinition" ADD CONSTRAINT "PqrsdRuleDefinition_packageId_tenantId_fkey" FOREIGN KEY ("packageId", "tenantId") REFERENCES "PqrsdRulePackage"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdCalendarException" ADD CONSTRAINT "PqrsdCalendarException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdCalendarException" ADD CONSTRAINT "PqrsdCalendarException_packageId_tenantId_fkey" FOREIGN KEY ("packageId", "tenantId") REFERENCES "PqrsdRulePackage"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdRulePackageDecision" ADD CONSTRAINT "PqrsdRulePackageDecision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdRulePackageDecision" ADD CONSTRAINT "PqrsdRulePackageDecision_packageId_tenantId_fkey" FOREIGN KEY ("packageId", "tenantId") REFERENCES "PqrsdRulePackage"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdRulePackageDecision" ADD CONSTRAINT "PqrsdRulePackageDecision_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDossier" ADD CONSTRAINT "PqrsdDossier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDossier" ADD CONSTRAINT "PqrsdDossier_rulePackageId_tenantId_fkey" FOREIGN KEY ("rulePackageId", "tenantId") REFERENCES "PqrsdRulePackage"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDossier" ADD CONSTRAINT "PqrsdDossier_createdById_tenantId_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDossier" ADD CONSTRAINT "PqrsdDossier_currentPrimaryAssigneeId_tenantId_fkey" FOREIGN KEY ("currentPrimaryAssigneeId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDossier" ADD CONSTRAINT "PqrsdDossier_currentBackupAssigneeId_tenantId_fkey" FOREIGN KEY ("currentBackupAssigneeId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdPetitionerSnapshot" ADD CONSTRAINT "PqrsdPetitionerSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdPetitionerSnapshot" ADD CONSTRAINT "PqrsdPetitionerSnapshot_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDocument" ADD CONSTRAINT "PqrsdDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDocument" ADD CONSTRAINT "PqrsdDocument_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDocument" ADD CONSTRAINT "PqrsdDocument_storedObjectId_tenantId_fkey" FOREIGN KEY ("storedObjectId", "tenantId") REFERENCES "StoredObject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDocument" ADD CONSTRAINT "PqrsdDocument_createdById_tenantId_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDocumentReview" ADD CONSTRAINT "PqrsdDocumentReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDocumentReview" ADD CONSTRAINT "PqrsdDocumentReview_documentId_tenantId_fkey" FOREIGN KEY ("documentId", "tenantId") REFERENCES "PqrsdDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDocumentReview" ADD CONSTRAINT "PqrsdDocumentReview_reviewerId_tenantId_fkey" FOREIGN KEY ("reviewerId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdReceiptAcknowledgement" ADD CONSTRAINT "PqrsdReceiptAcknowledgement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdReceiptAcknowledgement" ADD CONSTRAINT "PqrsdReceiptAcknowledgement_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdReceiptAcknowledgement" ADD CONSTRAINT "PqrsdReceiptAcknowledgement_documentId_tenantId_fkey" FOREIGN KEY ("documentId", "tenantId") REFERENCES "PqrsdDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdReceiptAcknowledgement" ADD CONSTRAINT "PqrsdReceiptAcknowledgement_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDetailAccess" ADD CONSTRAINT "PqrsdDetailAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDetailAccess" ADD CONSTRAINT "PqrsdDetailAccess_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDetailAccess" ADD CONSTRAINT "PqrsdDetailAccess_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClassificationVersion" ADD CONSTRAINT "PqrsdClassificationVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClassificationVersion" ADD CONSTRAINT "PqrsdClassificationVersion_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClassificationVersion" ADD CONSTRAINT "PqrsdClassificationVersion_ruleDefinitionId_tenantId_fkey" FOREIGN KEY ("ruleDefinitionId", "tenantId") REFERENCES "PqrsdRuleDefinition"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClassificationVersion" ADD CONSTRAINT "PqrsdClassificationVersion_proposedById_tenantId_fkey" FOREIGN KEY ("proposedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClassificationReview" ADD CONSTRAINT "PqrsdClassificationReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClassificationReview" ADD CONSTRAINT "PqrsdClassificationReview_classificationId_tenantId_fkey" FOREIGN KEY ("classificationId", "tenantId") REFERENCES "PqrsdClassificationVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClassificationReview" ADD CONSTRAINT "PqrsdClassificationReview_reviewerId_tenantId_fkey" FOREIGN KEY ("reviewerId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeadlineVersion" ADD CONSTRAINT "PqrsdDeadlineVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeadlineVersion" ADD CONSTRAINT "PqrsdDeadlineVersion_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeadlineVersion" ADD CONSTRAINT "PqrsdDeadlineVersion_classificationId_tenantId_fkey" FOREIGN KEY ("classificationId", "tenantId") REFERENCES "PqrsdClassificationVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeadlineVersion" ADD CONSTRAINT "PqrsdDeadlineVersion_packageId_tenantId_fkey" FOREIGN KEY ("packageId", "tenantId") REFERENCES "PqrsdRulePackage"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeadlineVersion" ADD CONSTRAINT "PqrsdDeadlineVersion_ruleDefinitionId_tenantId_fkey" FOREIGN KEY ("ruleDefinitionId", "tenantId") REFERENCES "PqrsdRuleDefinition"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeadlineVersion" ADD CONSTRAINT "PqrsdDeadlineVersion_extensionProposalId_tenantId_fkey" FOREIGN KEY ("extensionProposalId", "tenantId") REFERENCES "PqrsdExtensionProposal"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeadlineVersion" ADD CONSTRAINT "PqrsdDeadlineVersion_createdById_tenantId_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdAssignmentEvent" ADD CONSTRAINT "PqrsdAssignmentEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdAssignmentEvent" ADD CONSTRAINT "PqrsdAssignmentEvent_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdAssignmentEvent" ADD CONSTRAINT "PqrsdAssignmentEvent_primaryAssigneeId_tenantId_fkey" FOREIGN KEY ("primaryAssigneeId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdAssignmentEvent" ADD CONSTRAINT "PqrsdAssignmentEvent_backupAssigneeId_tenantId_fkey" FOREIGN KEY ("backupAssigneeId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdAssignmentEvent" ADD CONSTRAINT "PqrsdAssignmentEvent_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransfer" ADD CONSTRAINT "PqrsdTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransfer" ADD CONSTRAINT "PqrsdTransfer_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransfer" ADD CONSTRAINT "PqrsdTransfer_supportDocumentId_tenantId_fkey" FOREIGN KEY ("supportDocumentId", "tenantId") REFERENCES "PqrsdDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransfer" ADD CONSTRAINT "PqrsdTransfer_proposedById_tenantId_fkey" FOREIGN KEY ("proposedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransferReview" ADD CONSTRAINT "PqrsdTransferReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransferReview" ADD CONSTRAINT "PqrsdTransferReview_transferId_tenantId_fkey" FOREIGN KEY ("transferId", "tenantId") REFERENCES "PqrsdTransfer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransferReview" ADD CONSTRAINT "PqrsdTransferReview_reviewerId_tenantId_fkey" FOREIGN KEY ("reviewerId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransferAttempt" ADD CONSTRAINT "PqrsdTransferAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransferAttempt" ADD CONSTRAINT "PqrsdTransferAttempt_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransferAttempt" ADD CONSTRAINT "PqrsdTransferAttempt_transferId_tenantId_fkey" FOREIGN KEY ("transferId", "tenantId") REFERENCES "PqrsdTransfer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransferAttempt" ADD CONSTRAINT "PqrsdTransferAttempt_evidenceDocumentId_tenantId_fkey" FOREIGN KEY ("evidenceDocumentId", "tenantId") REFERENCES "PqrsdDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdTransferAttempt" ADD CONSTRAINT "PqrsdTransferAttempt_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdExtensionProposal" ADD CONSTRAINT "PqrsdExtensionProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdExtensionProposal" ADD CONSTRAINT "PqrsdExtensionProposal_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdExtensionProposal" ADD CONSTRAINT "PqrsdExtensionProposal_supportDocumentId_tenantId_fkey" FOREIGN KEY ("supportDocumentId", "tenantId") REFERENCES "PqrsdDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdExtensionProposal" ADD CONSTRAINT "PqrsdExtensionProposal_proposedById_tenantId_fkey" FOREIGN KEY ("proposedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdExtensionReview" ADD CONSTRAINT "PqrsdExtensionReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdExtensionReview" ADD CONSTRAINT "PqrsdExtensionReview_extensionId_tenantId_fkey" FOREIGN KEY ("extensionId", "tenantId") REFERENCES "PqrsdExtensionProposal"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdExtensionReview" ADD CONSTRAINT "PqrsdExtensionReview_reviewerId_tenantId_fkey" FOREIGN KEY ("reviewerId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseVersion" ADD CONSTRAINT "PqrsdResponseVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseVersion" ADD CONSTRAINT "PqrsdResponseVersion_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseVersion" ADD CONSTRAINT "PqrsdResponseVersion_attachmentDocumentId_tenantId_fkey" FOREIGN KEY ("attachmentDocumentId", "tenantId") REFERENCES "PqrsdDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseVersion" ADD CONSTRAINT "PqrsdResponseVersion_draftedById_tenantId_fkey" FOREIGN KEY ("draftedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseReview" ADD CONSTRAINT "PqrsdResponseReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseReview" ADD CONSTRAINT "PqrsdResponseReview_responseId_tenantId_fkey" FOREIGN KEY ("responseId", "tenantId") REFERENCES "PqrsdResponseVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseReview" ADD CONSTRAINT "PqrsdResponseReview_reviewerId_tenantId_fkey" FOREIGN KEY ("reviewerId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseAuthorization" ADD CONSTRAINT "PqrsdResponseAuthorization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseAuthorization" ADD CONSTRAINT "PqrsdResponseAuthorization_responseId_tenantId_fkey" FOREIGN KEY ("responseId", "tenantId") REFERENCES "PqrsdResponseVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseAuthorization" ADD CONSTRAINT "PqrsdResponseAuthorization_authorizationDocumentId_tenantI_fkey" FOREIGN KEY ("authorizationDocumentId", "tenantId") REFERENCES "PqrsdDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdResponseAuthorization" ADD CONSTRAINT "PqrsdResponseAuthorization_authorizerId_tenantId_fkey" FOREIGN KEY ("authorizerId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeliveryAttempt" ADD CONSTRAINT "PqrsdDeliveryAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeliveryAttempt" ADD CONSTRAINT "PqrsdDeliveryAttempt_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeliveryAttempt" ADD CONSTRAINT "PqrsdDeliveryAttempt_responseId_tenantId_fkey" FOREIGN KEY ("responseId", "tenantId") REFERENCES "PqrsdResponseVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeliveryAttempt" ADD CONSTRAINT "PqrsdDeliveryAttempt_evidenceDocumentId_tenantId_fkey" FOREIGN KEY ("evidenceDocumentId", "tenantId") REFERENCES "PqrsdDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdDeliveryAttempt" ADD CONSTRAINT "PqrsdDeliveryAttempt_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClosure" ADD CONSTRAINT "PqrsdClosure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClosure" ADD CONSTRAINT "PqrsdClosure_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClosure" ADD CONSTRAINT "PqrsdClosure_supportDocumentId_tenantId_fkey" FOREIGN KEY ("supportDocumentId", "tenantId") REFERENCES "PqrsdDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdClosure" ADD CONSTRAINT "PqrsdClosure_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdReopening" ADD CONSTRAINT "PqrsdReopening_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdReopening" ADD CONSTRAINT "PqrsdReopening_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdReopening" ADD CONSTRAINT "PqrsdReopening_closureId_tenantId_fkey" FOREIGN KEY ("closureId", "tenantId") REFERENCES "PqrsdClosure"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdReopening" ADD CONSTRAINT "PqrsdReopening_supportDocumentId_tenantId_fkey" FOREIGN KEY ("supportDocumentId", "tenantId") REFERENCES "PqrsdDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdReopening" ADD CONSTRAINT "PqrsdReopening_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdStatusEvent" ADD CONSTRAINT "PqrsdStatusEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdStatusEvent" ADD CONSTRAINT "PqrsdStatusEvent_dossierId_tenantId_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "PqrsdDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdStatusEvent" ADD CONSTRAINT "PqrsdStatusEvent_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdCommand" ADD CONSTRAINT "PqrsdCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsdCommand" ADD CONSTRAINT "PqrsdCommand_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legal/configuration integrity. No jurisdictional term is supplied by code:
-- every duration and working-day definition must be present in an approved
-- package, and a scope can have only one active package.
ALTER TABLE "PqrsdRulePackage"
  ADD CONSTRAINT "PqrsdRulePackage_https_source_check"
    CHECK ("sourceUrl" ~ '^https://'),
  ADD CONSTRAINT "PqrsdRulePackage_sha256_check"
    CHECK ("sourceSha256" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "PqrsdRulePackage_effective_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  ADD CONSTRAINT "PqrsdRulePackage_weekdays_check"
    CHECK ("nonWorkingWeekdays" <@ ARRAY[0,1,2,3,4,5,6]::integer[]),
  ADD CONSTRAINT "PqrsdRulePackage_revision_check" CHECK ("revision" > 0);

CREATE UNIQUE INDEX "PqrsdRulePackage_one_active_scope_key"
  ON "PqrsdRulePackage" ("tenantId", "scopeKey")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "PqrsdRuleDefinition"
  ADD CONSTRAINT "PqrsdRuleDefinition_duration_check"
    CHECK ("durationDays" BETWEEN 1 AND 365);

ALTER TABLE "PqrsdDossier"
  ADD CONSTRAINT "PqrsdDossier_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "PqrsdDossier_assignees_distinct_check"
    CHECK ("currentPrimaryAssigneeId" IS NULL OR "currentBackupAssigneeId" IS NULL OR "currentPrimaryAssigneeId" <> "currentBackupAssigneeId");

ALTER TABLE "PqrsdAssignmentEvent"
  ADD CONSTRAINT "PqrsdAssignmentEvent_assignees_distinct_check"
    CHECK ("primaryAssigneeId" <> "backupAssigneeId");

ALTER TABLE "PqrsdDocument"
  ADD CONSTRAINT "PqrsdDocument_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "PqrsdDocument_size_check" CHECK ("sizeBytes" > 0);

ALTER TABLE "PqrsdResponseVersion"
  ADD CONSTRAINT "PqrsdResponseVersion_sha256_check" CHECK ("contentSha256" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "PqrsdResponseVersion_number_check" CHECK ("versionNumber" > 0);

ALTER TABLE "PqrsdDeadlineVersion"
  ADD CONSTRAINT "PqrsdDeadlineVersion_number_check" CHECK ("versionNumber" > 0),
  ADD CONSTRAINT "PqrsdDeadlineVersion_complete_calculation_check" CHECK (
    ("calculationStatus" = 'CALCULATION_REQUIRES_REVIEW' AND "currentDueLocalDate" IS NULL AND "dueAt" IS NULL)
    OR
    ("calculationStatus" IN ('CALCULATED', 'MANUAL_REVIEWED') AND "originalDueLocalDate" IS NOT NULL AND "currentDueLocalDate" IS NOT NULL AND "dueAt" IS NOT NULL)
  );

ALTER TABLE "PqrsdTransferAttempt"
  ADD CONSTRAINT "PqrsdTransferAttempt_delivery_evidence_check" CHECK (
    "outcome" <> 'DELIVERED' OR ("evidenceDocumentId" IS NOT NULL AND "externalReference" IS NOT NULL)
  );

ALTER TABLE "PqrsdDeliveryAttempt"
  ADD CONSTRAINT "PqrsdDeliveryAttempt_delivery_evidence_check" CHECK (
    "outcome" <> 'DELIVERED' OR ("evidenceDocumentId" IS NOT NULL AND "externalReference" IS NOT NULL)
  );

ALTER TABLE "PqrsdCommand"
  ADD CONSTRAINT "PqrsdCommand_sha256_check" CHECK ("payloadSha256" ~ '^[a-f0-9]{64}$');

-- Every PQRSD record belongs exclusively to a PUBLIC_OFFICE tenant. This does
-- not consult OperationProfile, which is intentionally campaign-only.
CREATE FUNCTION pqrsd_assert_public_office_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Tenant" t
    WHERE t."id" = NEW."tenantId" AND t."type" = 'PUBLIC_OFFICE'
  ) THEN
    RAISE EXCEPTION 'PQRSD is restricted to PUBLIC_OFFICE tenants'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PqrsdRulePackage_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdRulePackage" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdRuleDefinition_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdRuleDefinition" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdCalendarException_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdCalendarException" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdRulePackageDecision_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdRulePackageDecision" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdDossier_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdDossier" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdPetitionerSnapshot_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdPetitionerSnapshot" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdDocument_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdDocument" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdDocumentReview_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdDocumentReview" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdReceiptAcknowledgement_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdReceiptAcknowledgement" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdDetailAccess_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdDetailAccess" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdClassificationVersion_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdClassificationVersion" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdClassificationReview_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdClassificationReview" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdDeadlineVersion_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdDeadlineVersion" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdAssignmentEvent_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdAssignmentEvent" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdTransfer_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdTransfer" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdTransferReview_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdTransferReview" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdTransferAttempt_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdTransferAttempt" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdExtensionProposal_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdExtensionProposal" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdExtensionReview_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdExtensionReview" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdResponseVersion_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdResponseVersion" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdResponseReview_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdResponseReview" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdResponseAuthorization_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdResponseAuthorization" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdDeliveryAttempt_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdDeliveryAttempt" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdClosure_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdClosure" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdReopening_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdReopening" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdStatusEvent_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdStatusEvent" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();
CREATE TRIGGER "PqrsdCommand_public_office_tenant"
  BEFORE INSERT OR UPDATE ON "PqrsdCommand" FOR EACH ROW EXECUTE FUNCTION pqrsd_assert_public_office_tenant();

-- Independent review controls are enforced again at the database boundary.
CREATE FUNCTION pqrsd_enforce_four_eyes() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  origin_actor TEXT;
  review_actor TEXT;
  review_decision TEXT;
BEGIN
  IF TG_TABLE_NAME = 'PqrsdRulePackageDecision' THEN
    SELECT p."createdById" INTO origin_actor FROM "PqrsdRulePackage" p
      WHERE p."id" = NEW."packageId" AND p."tenantId" = NEW."tenantId";
  ELSIF TG_TABLE_NAME = 'PqrsdDocumentReview' THEN
    SELECT d."createdById" INTO origin_actor FROM "PqrsdDocument" d
      WHERE d."id" = NEW."documentId" AND d."tenantId" = NEW."tenantId";
  ELSIF TG_TABLE_NAME = 'PqrsdClassificationReview' THEN
    SELECT c."proposedById" INTO origin_actor FROM "PqrsdClassificationVersion" c
      WHERE c."id" = NEW."classificationId" AND c."tenantId" = NEW."tenantId";
  ELSIF TG_TABLE_NAME = 'PqrsdTransferReview' THEN
    SELECT t."proposedById" INTO origin_actor FROM "PqrsdTransfer" t
      WHERE t."id" = NEW."transferId" AND t."tenantId" = NEW."tenantId";
  ELSIF TG_TABLE_NAME = 'PqrsdExtensionReview' THEN
    SELECT e."proposedById" INTO origin_actor FROM "PqrsdExtensionProposal" e
      WHERE e."id" = NEW."extensionId" AND e."tenantId" = NEW."tenantId";
  ELSIF TG_TABLE_NAME = 'PqrsdResponseReview' THEN
    SELECT r."draftedById" INTO origin_actor FROM "PqrsdResponseVersion" r
      WHERE r."id" = NEW."responseId" AND r."tenantId" = NEW."tenantId";
  ELSIF TG_TABLE_NAME = 'PqrsdResponseAuthorization' THEN
    SELECT r."draftedById", rv."reviewerId", rv."decision"::text
      INTO origin_actor, review_actor, review_decision
      FROM "PqrsdResponseVersion" r
      LEFT JOIN "PqrsdResponseReview" rv
        ON rv."responseId" = r."id" AND rv."tenantId" = r."tenantId"
      WHERE r."id" = NEW."responseId" AND r."tenantId" = NEW."tenantId";
    IF NEW."decision" = 'AUTHORIZE' AND (review_actor IS NULL OR review_decision <> 'APPROVE') THEN
      RAISE EXCEPTION 'response authorization requires an approved independent review'
        USING ERRCODE = '23514';
    END IF;
    IF NEW."authorizerId" = review_actor THEN
      RAISE EXCEPTION 'response reviewer and authorizer must be different users'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF origin_actor IS NULL THEN
    RAISE EXCEPTION 'review origin does not exist in this tenant'
      USING ERRCODE = '23503';
  END IF;

  IF COALESCE(
    to_jsonb(NEW) ->> 'actorId',
    to_jsonb(NEW) ->> 'reviewerId',
    to_jsonb(NEW) ->> 'authorizerId'
  ) = origin_actor THEN
    RAISE EXCEPTION 'independent review requires a different user'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PqrsdRulePackageDecision_four_eyes" BEFORE INSERT ON "PqrsdRulePackageDecision"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_enforce_four_eyes();
CREATE TRIGGER "PqrsdDocumentReview_four_eyes" BEFORE INSERT ON "PqrsdDocumentReview"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_enforce_four_eyes();
CREATE TRIGGER "PqrsdClassificationReview_four_eyes" BEFORE INSERT ON "PqrsdClassificationReview"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_enforce_four_eyes();
CREATE TRIGGER "PqrsdTransferReview_four_eyes" BEFORE INSERT ON "PqrsdTransferReview"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_enforce_four_eyes();
CREATE TRIGGER "PqrsdExtensionReview_four_eyes" BEFORE INSERT ON "PqrsdExtensionReview"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_enforce_four_eyes();
CREATE TRIGGER "PqrsdResponseReview_four_eyes" BEFORE INSERT ON "PqrsdResponseReview"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_enforce_four_eyes();
CREATE TRIGGER "PqrsdResponseAuthorization_four_eyes" BEFORE INSERT ON "PqrsdResponseAuthorization"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_enforce_four_eyes();

-- DELIVERED is a verified fact, never an optimistic API label.
CREATE FUNCTION pqrsd_validate_delivery_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  evidence_approved BOOLEAN;
  authorization_valid BOOLEAN;
  transfer_approved BOOLEAN;
BEGIN
  IF NEW."outcome" <> 'DELIVERED' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM "PqrsdDocument" d
    JOIN "PqrsdDocumentReview" dr
      ON dr."documentId" = d."id" AND dr."tenantId" = d."tenantId" AND dr."decision" = 'APPROVE'
    WHERE d."id" = NEW."evidenceDocumentId" AND d."tenantId" = NEW."tenantId"
      AND d."dossierId" = NEW."dossierId"
      AND d."type" IN ('TRANSFER_PROOF', 'DELIVERY_PROOF')
  ) INTO evidence_approved;

  IF NOT evidence_approved THEN
    RAISE EXCEPTION 'DELIVERED requires independently approved evidence from the same dossier'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'PqrsdDeliveryAttempt' THEN
    SELECT EXISTS (
      SELECT 1 FROM "PqrsdResponseAuthorization" a
      WHERE a."responseId" = NEW."responseId" AND a."tenantId" = NEW."tenantId"
        AND a."decision" = 'AUTHORIZE'
    ) INTO authorization_valid;
    IF NOT authorization_valid THEN
      RAISE EXCEPTION 'DELIVERED requires an authorized response version'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM "PqrsdTransferReview" r
      WHERE r."transferId" = NEW."transferId" AND r."tenantId" = NEW."tenantId"
        AND r."decision" = 'APPROVE'
    ) INTO transfer_approved;
    IF NOT transfer_approved THEN
      RAISE EXCEPTION 'completed transfer requires an approved transfer proposal'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PqrsdDeliveryAttempt_verified" BEFORE INSERT ON "PqrsdDeliveryAttempt"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_validate_delivery_evidence();
CREATE TRIGGER "PqrsdTransferAttempt_verified" BEFORE INSERT ON "PqrsdTransferAttempt"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_validate_delivery_evidence();

-- Aggregate mutations are optimistic and preserve identity/content. CLOSED is
-- a hard fence; only the explicit reopening transaction can cross it.
CREATE FUNCTION pqrsd_guard_dossier_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."tenantId" <> OLD."tenantId"
    OR NEW."reference" <> OLD."reference"
    OR NEW."rulePackageId" <> OLD."rulePackageId"
    OR NEW."receivedAt" <> OLD."receivedAt"
    OR NEW."receivedTimeZone" <> OLD."receivedTimeZone"
    OR NEW."receivedChannel" <> OLD."receivedChannel"
    OR NEW."subject" <> OLD."subject"
    OR NEW."description" <> OLD."description"
    OR NEW."createdById" <> OLD."createdById"
    OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'immutable PQRSD dossier intake fields cannot be changed'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'PQRSD optimistic version must advance exactly once'
      USING ERRCODE = '40001';
  END IF;
  IF OLD."status" = 'CLOSED' AND (
    NEW."status" <> 'REOPENED'
    OR COALESCE(current_setting('app.pqrsd_reopen_authorized', true), '') <> 'on'
  ) THEN
    RAISE EXCEPTION 'closed PQRSD dossier is read-only; use authorized reopening'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PqrsdDossier_guard_update" BEFORE UPDATE ON "PqrsdDossier"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_guard_dossier_update();

CREATE FUNCTION pqrsd_guard_rule_package_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."tenantId" <> OLD."tenantId"
    OR NEW."scopeKey" <> OLD."scopeKey" OR NEW."versionLabel" <> OLD."versionLabel"
    OR NEW."sourceUrl" <> OLD."sourceUrl" OR NEW."sourceReference" <> OLD."sourceReference"
    OR NEW."sourceSha256" <> OLD."sourceSha256" OR NEW."timeZone" <> OLD."timeZone"
    OR NEW."effectiveFrom" <> OLD."effectiveFrom"
    OR NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo"
    OR NEW."nonWorkingWeekdays" IS DISTINCT FROM OLD."nonWorkingWeekdays"
    OR NEW."computationMethodNote" <> OLD."computationMethodNote"
    OR NEW."createdById" <> OLD."createdById" OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'reviewed rule-package content is immutable; create a new version'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."revision" <> OLD."revision" + 1 THEN
    RAISE EXCEPTION 'rule-package optimistic revision must advance exactly once'
      USING ERRCODE = '40001';
  END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('ACTIVE', 'REJECTED'))
    OR (OLD."status" = 'ACTIVE' AND NEW."status" = 'SUPERSEDED')
  ) THEN
    RAISE EXCEPTION 'invalid rule-package status transition'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."status" = 'ACTIVE' AND NEW."activatedAt" IS NULL THEN
    RAISE EXCEPTION 'active rule package requires activation timestamp'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."status" IN ('ACTIVE', 'REJECTED') AND NOT EXISTS (
    SELECT 1 FROM "PqrsdRulePackageDecision" d
    WHERE d."packageId" = NEW."id" AND d."tenantId" = NEW."tenantId"
      AND (
        (NEW."status" = 'ACTIVE' AND d."decision" = 'APPROVE_ACTIVATE')
        OR (NEW."status" = 'REJECTED' AND d."decision" = 'REJECT')
      )
  ) THEN
    RAISE EXCEPTION 'rule-package transition requires matching independent decision'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."status" = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM "PqrsdRuleDefinition" r
    WHERE r."packageId" = NEW."id" AND r."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'active rule package requires at least one explicit rule'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PqrsdRulePackage_guard_update" BEFORE UPDATE ON "PqrsdRulePackage"
  FOR EACH ROW EXECUTE FUNCTION pqrsd_guard_rule_package_update();

-- Immutable evidence ledgers. Corrections are new versions/events, not edits.
CREATE FUNCTION pqrsd_reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PQRSD evidence ledger is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "PqrsdRuleDefinition_append_only" BEFORE UPDATE OR DELETE ON "PqrsdRuleDefinition" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdRuleDefinition_no_truncate" BEFORE TRUNCATE ON "PqrsdRuleDefinition" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdCalendarException_append_only" BEFORE UPDATE OR DELETE ON "PqrsdCalendarException" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdCalendarException_no_truncate" BEFORE TRUNCATE ON "PqrsdCalendarException" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdRulePackageDecision_append_only" BEFORE UPDATE OR DELETE ON "PqrsdRulePackageDecision" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdRulePackageDecision_no_truncate" BEFORE TRUNCATE ON "PqrsdRulePackageDecision" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdPetitionerSnapshot_append_only" BEFORE UPDATE OR DELETE ON "PqrsdPetitionerSnapshot" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdPetitionerSnapshot_no_truncate" BEFORE TRUNCATE ON "PqrsdPetitionerSnapshot" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDocument_append_only" BEFORE UPDATE OR DELETE ON "PqrsdDocument" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDocument_no_truncate" BEFORE TRUNCATE ON "PqrsdDocument" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDocumentReview_append_only" BEFORE UPDATE OR DELETE ON "PqrsdDocumentReview" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDocumentReview_no_truncate" BEFORE TRUNCATE ON "PqrsdDocumentReview" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdReceiptAcknowledgement_append_only" BEFORE UPDATE OR DELETE ON "PqrsdReceiptAcknowledgement" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdReceiptAcknowledgement_no_truncate" BEFORE TRUNCATE ON "PqrsdReceiptAcknowledgement" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDetailAccess_append_only" BEFORE UPDATE OR DELETE ON "PqrsdDetailAccess" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDetailAccess_no_truncate" BEFORE TRUNCATE ON "PqrsdDetailAccess" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdClassificationVersion_append_only" BEFORE UPDATE OR DELETE ON "PqrsdClassificationVersion" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdClassificationVersion_no_truncate" BEFORE TRUNCATE ON "PqrsdClassificationVersion" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdClassificationReview_append_only" BEFORE UPDATE OR DELETE ON "PqrsdClassificationReview" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdClassificationReview_no_truncate" BEFORE TRUNCATE ON "PqrsdClassificationReview" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDeadlineVersion_append_only" BEFORE UPDATE OR DELETE ON "PqrsdDeadlineVersion" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDeadlineVersion_no_truncate" BEFORE TRUNCATE ON "PqrsdDeadlineVersion" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdAssignmentEvent_append_only" BEFORE UPDATE OR DELETE ON "PqrsdAssignmentEvent" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdAssignmentEvent_no_truncate" BEFORE TRUNCATE ON "PqrsdAssignmentEvent" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdTransfer_append_only" BEFORE UPDATE OR DELETE ON "PqrsdTransfer" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdTransfer_no_truncate" BEFORE TRUNCATE ON "PqrsdTransfer" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdTransferReview_append_only" BEFORE UPDATE OR DELETE ON "PqrsdTransferReview" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdTransferReview_no_truncate" BEFORE TRUNCATE ON "PqrsdTransferReview" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdTransferAttempt_append_only" BEFORE UPDATE OR DELETE ON "PqrsdTransferAttempt" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdTransferAttempt_no_truncate" BEFORE TRUNCATE ON "PqrsdTransferAttempt" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdExtensionProposal_append_only" BEFORE UPDATE OR DELETE ON "PqrsdExtensionProposal" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdExtensionProposal_no_truncate" BEFORE TRUNCATE ON "PqrsdExtensionProposal" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdExtensionReview_append_only" BEFORE UPDATE OR DELETE ON "PqrsdExtensionReview" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdExtensionReview_no_truncate" BEFORE TRUNCATE ON "PqrsdExtensionReview" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdResponseVersion_append_only" BEFORE UPDATE OR DELETE ON "PqrsdResponseVersion" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdResponseVersion_no_truncate" BEFORE TRUNCATE ON "PqrsdResponseVersion" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdResponseReview_append_only" BEFORE UPDATE OR DELETE ON "PqrsdResponseReview" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdResponseReview_no_truncate" BEFORE TRUNCATE ON "PqrsdResponseReview" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdResponseAuthorization_append_only" BEFORE UPDATE OR DELETE ON "PqrsdResponseAuthorization" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdResponseAuthorization_no_truncate" BEFORE TRUNCATE ON "PqrsdResponseAuthorization" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDeliveryAttempt_append_only" BEFORE UPDATE OR DELETE ON "PqrsdDeliveryAttempt" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDeliveryAttempt_no_truncate" BEFORE TRUNCATE ON "PqrsdDeliveryAttempt" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdClosure_append_only" BEFORE UPDATE OR DELETE ON "PqrsdClosure" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdClosure_no_truncate" BEFORE TRUNCATE ON "PqrsdClosure" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdReopening_append_only" BEFORE UPDATE OR DELETE ON "PqrsdReopening" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdReopening_no_truncate" BEFORE TRUNCATE ON "PqrsdReopening" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdStatusEvent_append_only" BEFORE UPDATE OR DELETE ON "PqrsdStatusEvent" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdStatusEvent_no_truncate" BEFORE TRUNCATE ON "PqrsdStatusEvent" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdCommand_append_only" BEFORE UPDATE OR DELETE ON "PqrsdCommand" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdCommand_no_truncate" BEFORE TRUNCATE ON "PqrsdCommand" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();

CREATE TRIGGER "PqrsdRulePackage_no_delete" BEFORE DELETE ON "PqrsdRulePackage" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdRulePackage_no_truncate" BEFORE TRUNCATE ON "PqrsdRulePackage" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDossier_no_delete" BEFORE DELETE ON "PqrsdDossier" FOR EACH ROW EXECUTE FUNCTION pqrsd_reject_ledger_mutation();
CREATE TRIGGER "PqrsdDossier_no_truncate" BEFORE TRUNCATE ON "PqrsdDossier" FOR EACH STATEMENT EXECUTE FUNCTION pqrsd_reject_ledger_mutation();

COMMIT;
