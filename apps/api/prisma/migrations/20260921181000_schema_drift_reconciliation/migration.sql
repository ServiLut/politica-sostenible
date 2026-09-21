-- Reconcile additive schema.prisma changes absent from the prior migration chain.
-- Generated with pinned Prisma 7.9.1 against the isolated preserved-data clone.
BEGIN;

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateTable
CREATE TABLE "TerritoryLeader" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "roleDescription" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(150),
    "socialNetworkUrl" VARCHAR(500),
    "politicalAffinity" VARCHAR(100),
    "observations" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerritoryLeader_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TerritoryLeader_tenantId_divisionId_idx" ON "TerritoryLeader"("tenantId", "divisionId");

-- CreateIndex
CREATE INDEX "TerritoryLeader_name_idx" ON "TerritoryLeader" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryLeader_id_tenantId_key" ON "TerritoryLeader"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_id_tenantId_key" ON "AuditEvent"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CampaignEvent_name_idx" ON "CampaignEvent" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CampaignEvent_description_idx" ON "CampaignEvent" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CampaignEvent_location_idx" ON "CampaignEvent" USING GIN ("location" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Commitment_issueCaseId_idx" ON "Commitment"("issueCaseId");

-- CreateIndex
CREATE INDEX "CommunicationApproval_title_idx" ON "CommunicationApproval" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CommunicationApproval_purpose_idx" ON "CommunicationApproval" USING GIN ("purpose" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CommunicationApproval_requestedById_idx" ON "CommunicationApproval"("requestedById");

-- CreateIndex
CREATE INDEX "CommunicationApproval_decidedById_idx" ON "CommunicationApproval"("decidedById");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationApproval_id_tenantId_key" ON "CommunicationApproval"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ConsentRecord_capturedById_idx" ON "ConsentRecord"("capturedById");

-- CreateIndex
CREATE UNIQUE INDEX "ElectronicSignature_id_tenantId_key" ON "ElectronicSignature"("id", "tenantId");

-- CreateIndex
CREATE INDEX "FinanceReportDossier_createdById_idx" ON "FinanceReportDossier"("createdById");

-- CreateIndex
CREATE INDEX "FinancialEntry_description_idx" ON "FinancialEntry" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "FinancialEntry_vendorName_idx" ON "FinancialEntry" USING GIN ("vendorName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "FinancialEntry_vendorTaxId_idx" ON "FinancialEntry" USING GIN ("vendorTaxId" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "FinancialEntry_reporterId_idx" ON "FinancialEntry"("reporterId");

-- CreateIndex
CREATE INDEX "Interaction_actorId_idx" ON "Interaction"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_id_tenantId_key" ON "Interaction"("id", "tenantId");

-- CreateIndex
CREATE INDEX "IssueCase_reference_idx" ON "IssueCase" USING GIN ("reference" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "IssueCase_title_idx" ON "IssueCase" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "IssueCase_description_idx" ON "IssueCase" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "IssueCase_category_idx" ON "IssueCase" USING GIN ("category" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "IssueCase_externalContactRef_idx" ON "IssueCase" USING GIN ("externalContactRef" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "IssueCase_createdById_idx" ON "IssueCase"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineE14CaptureGrantPlace_id_tenantId_key" ON "OfflineE14CaptureGrantPlace"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineSyncReceipt_id_tenantId_key" ON "OfflineSyncReceipt"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OperationProfile_createdById_idx" ON "OperationProfile"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PointLog_id_tenantId_key" ON "PointLog"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PoliticalProposal_referenceCode_idx" ON "PoliticalProposal" USING GIN ("referenceCode" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "PoliticalProposal_title_idx" ON "PoliticalProposal" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "PoliticalProposal_description_idx" ON "PoliticalProposal" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "PoliticalProposal_targetGroup_idx" ON "PoliticalProposal" USING GIN ("targetGroup" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "PoliticalProposal_territory_idx" ON "PoliticalProposal" USING GIN ("territory" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "PoliticalProposal_ownerId_idx" ON "PoliticalProposal"("ownerId");

-- CreateIndex
CREATE INDEX "PoliticalProposal_createdById_idx" ON "PoliticalProposal"("createdById");

-- CreateIndex
CREATE INDEX "PqrsdDocument_createdById_idx" ON "PqrsdDocument"("createdById");

-- CreateIndex
CREATE INDEX "PqrsdDossier_createdById_idx" ON "PqrsdDossier"("createdById");

-- CreateIndex
CREATE INDEX "ScrutinyCommission_name_idx" ON "ScrutinyCommission" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ScrutinyCommission_code_idx" ON "ScrutinyCommission" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ScrutinyCommission_scopeName_idx" ON "ScrutinyCommission" USING GIN ("scopeName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ScrutinyCommission_createdById_idx" ON "ScrutinyCommission"("createdById");

-- CreateIndex
CREATE INDEX "ScrutinyCommission_scopeDivisionId_idx" ON "ScrutinyCommission"("scopeDivisionId");

-- CreateIndex
CREATE INDEX "ScrutinyDocument_externalReference_idx" ON "ScrutinyDocument" USING GIN ("externalReference" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");

-- CreateIndex
CREATE INDEX "Tenant_parentTenantId_idx" ON "Tenant"("parentTenantId");

-- CreateIndex
CREATE INDEX "Voter_firstName_idx" ON "Voter" USING GIN ("firstName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Voter_lastName_idx" ON "Voter" USING GIN ("lastName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "WitnessAssignment_createdById_idx" ON "WitnessAssignment"("createdById");

-- AddForeignKey
ALTER TABLE "TerritoryLeader" ADD CONSTRAINT "TerritoryLeader_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerritoryLeader" ADD CONSTRAINT "TerritoryLeader_divisionId_tenantId_fkey" FOREIGN KEY ("divisionId", "tenantId") REFERENCES "PoliticalDivision"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "StoredObject_tenant_integrity_created_id_idx" RENAME TO "StoredObject_tenantId_integrityStatus_createdAt_id_idx";

-- RenameIndex
ALTER INDEX "StoredObject_tenant_integrity_started_idx" RENAME TO "StoredObject_tenantId_integrityStatus_integrityVerification_idx";

-- RenameIndex
ALTER INDEX "StoredObject_tenant_uploader_id_idx" RENAME TO "StoredObject_tenantId_uploaderId_id_idx";


COMMIT;
