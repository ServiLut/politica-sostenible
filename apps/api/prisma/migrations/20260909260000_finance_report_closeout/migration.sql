BEGIN;

CREATE TYPE "FinanceReportKind" AS ENUM ('CANDIDATE', 'CONSOLIDATED');
CREATE TYPE "FinanceApprovalControl" AS ENUM ('CAMPAIGN_MANAGER', 'ACCOUNTANT', 'COMPLIANCE');
CREATE TYPE "FinanceApprovalDecision" AS ENUM ('APPROVE', 'RETURN_FOR_CORRECTION');
CREATE TYPE "FinanceBankMatchStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'EXCLUDED');
CREATE TYPE "FinanceExternalReviewDecision" AS ENUM ('APPROVE', 'REJECT');
CREATE TYPE "FinanceCloseoutCommandType" AS ENUM (
  'DOSSIER_CREATE',
  'BANK_STATEMENT_CREATE',
  'IN_KIND_CREATE',
  'PAYABLE_CREATE',
  'PAYABLE_SETTLE',
  'REPORT_VERSION_CREATE',
  'REPORT_APPROVAL_RECORD',
  'EXTERNAL_EVIDENCE_RECORD',
  'EXTERNAL_EVIDENCE_REVIEW'
);

CREATE TABLE "FinanceReportDossier" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "kind" "FinanceReportKind" NOT NULL,
  "subjectCode" VARCHAR(64) NOT NULL,
  "subjectName" VARCHAR(200) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReportDossier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceReportDossier_subject_nonempty_check" CHECK (btrim("subjectCode") <> '' AND btrim("subjectName") <> ''),
  CONSTRAINT "FinanceReportDossier_consolidated_check" CHECK (
    ("kind" = 'CONSOLIDATED' AND "subjectCode" = 'CONSOLIDATED') OR
    ("kind" = 'CANDIDATE' AND "subjectCode" <> 'CONSOLIDATED')
  )
);

CREATE TABLE "FinanceLedgerCut" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "dossierId" UUID NOT NULL,
  "periodStartsAt" DATE NOT NULL,
  "periodEndsAt" DATE NOT NULL,
  "cutoffAt" TIMESTAMP(3) NOT NULL,
  "entryCount" INTEGER NOT NULL,
  "totalIncome" DECIMAL(15,2) NOT NULL,
  "totalExpense" DECIMAL(15,2) NOT NULL,
  "balance" DECIMAL(15,2) NOT NULL,
  "ledgerSha256" CHAR(64) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceLedgerCut_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceLedgerCut_period_check" CHECK ("periodEndsAt" >= "periodStartsAt"),
  CONSTRAINT "FinanceLedgerCut_count_check" CHECK ("entryCount" >= 0),
  CONSTRAINT "FinanceLedgerCut_totals_check" CHECK ("totalIncome" >= 0 AND "totalExpense" >= 0 AND "balance" = "totalIncome" - "totalExpense"),
  CONSTRAINT "FinanceLedgerCut_hash_check" CHECK ("ledgerSha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "FinanceLedgerCutLine" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ledgerCutId" UUID NOT NULL,
  "financialEntryId" TEXT NOT NULL,
  "entryType" "EntryType" NOT NULL,
  "entryStatus" "FinanceStatus" NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "entryDate" DATE NOT NULL,
  "cneCode" "CneCode" NOT NULL,
  "descriptionSha256" CHAR(64) NOT NULL,
  "counterpartySha256" CHAR(64) NOT NULL,
  "evidencePresent" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceLedgerCutLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceLedgerCutLine_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "FinanceLedgerCutLine_status_check" CHECK ("entryStatus" IN ('APPROVED', 'REPORTED_CNE')),
  CONSTRAINT "FinanceLedgerCutLine_hash_check" CHECK ("descriptionSha256" ~ '^[0-9a-f]{64}$' AND "counterpartySha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "FinanceReportVersion" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "dossierId" UUID NOT NULL,
  "ledgerCutId" UUID NOT NULL,
  "basedOnVersionId" UUID,
  "versionNumber" INTEGER NOT NULL,
  "correctionReason" VARCHAR(2000),
  "preparationNote" VARCHAR(4000) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReportVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceReportVersion_number_check" CHECK ("versionNumber" > 0),
  CONSTRAINT "FinanceReportVersion_note_check" CHECK (char_length(btrim("preparationNote")) >= 10),
  CONSTRAINT "FinanceReportVersion_correction_check" CHECK (
    ("versionNumber" = 1 AND "basedOnVersionId" IS NULL AND "correctionReason" IS NULL) OR
    ("versionNumber" > 1 AND "basedOnVersionId" IS NOT NULL AND char_length(btrim("correctionReason")) >= 10)
  )
);

CREATE TABLE "FinanceReportApproval" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportVersionId" UUID NOT NULL,
  "control" "FinanceApprovalControl" NOT NULL,
  "decision" "FinanceApprovalDecision" NOT NULL,
  "rationale" VARCHAR(2000) NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReportApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceReportApproval_rationale_check" CHECK (char_length(btrim("rationale")) >= 10)
);

CREATE TABLE "FinanceBankStatement" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "storageObjectId" TEXT NOT NULL,
  "bankName" VARCHAR(160) NOT NULL,
  "accountLastFour" CHAR(4) NOT NULL,
  "periodStartsAt" DATE NOT NULL,
  "periodEndsAt" DATE NOT NULL,
  "openingBalance" DECIMAL(15,2) NOT NULL,
  "closingBalance" DECIMAL(15,2) NOT NULL,
  "totalDebit" DECIMAL(15,2) NOT NULL,
  "totalCredit" DECIMAL(15,2) NOT NULL,
  "lineCount" INTEGER NOT NULL,
  "statementSha256" CHAR(64) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceBankStatement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceBankStatement_period_check" CHECK ("periodEndsAt" >= "periodStartsAt"),
  CONSTRAINT "FinanceBankStatement_account_check" CHECK ("accountLastFour" ~ '^[0-9]{4}$'),
  CONSTRAINT "FinanceBankStatement_totals_check" CHECK (
    "totalDebit" >= 0 AND "totalCredit" >= 0 AND "lineCount" > 0 AND
    "closingBalance" = "openingBalance" + "totalCredit" - "totalDebit"
  ),
  CONSTRAINT "FinanceBankStatement_hash_check" CHECK ("statementSha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "FinanceBankStatementLine" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "bankStatementId" UUID NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "occurredAt" DATE NOT NULL,
  "bankReference" VARCHAR(160) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "debit" DECIMAL(15,2) NOT NULL,
  "credit" DECIMAL(15,2) NOT NULL,
  "matchStatus" "FinanceBankMatchStatus" NOT NULL,
  "matchedEntryId" TEXT,
  "exclusionReason" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceBankStatementLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceBankStatementLine_number_check" CHECK ("lineNumber" > 0),
  CONSTRAINT "FinanceBankStatementLine_amount_check" CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0)),
  CONSTRAINT "FinanceBankStatementLine_match_shape_check" CHECK (
    ("matchStatus" = 'MATCHED' AND "matchedEntryId" IS NOT NULL AND "exclusionReason" IS NULL) OR
    ("matchStatus" = 'UNMATCHED' AND "matchedEntryId" IS NULL AND "exclusionReason" IS NULL) OR
    ("matchStatus" = 'EXCLUDED' AND "matchedEntryId" IS NULL AND char_length(btrim("exclusionReason")) >= 10)
  )
);

CREATE TABLE "FinanceInKindContribution" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "incomeEntryId" TEXT NOT NULL,
  "expenseEntryId" TEXT NOT NULL,
  "storageObjectId" TEXT NOT NULL,
  "contributorName" VARCHAR(200) NOT NULL,
  "contributorDocument" VARCHAR(32) NOT NULL,
  "contributionDate" DATE NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "value" DECIMAL(15,2) NOT NULL,
  "valuationMethod" VARCHAR(1000) NOT NULL,
  "valuationSourceReference" VARCHAR(2048) NOT NULL,
  "valuationSha256" CHAR(64) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceInKindContribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceInKindContribution_distinct_entries_check" CHECK ("incomeEntryId" <> "expenseEntryId"),
  CONSTRAINT "FinanceInKindContribution_value_check" CHECK ("value" > 0),
  CONSTRAINT "FinanceInKindContribution_text_check" CHECK (btrim("contributorName") <> '' AND btrim("contributorDocument") <> '' AND char_length(btrim("valuationMethod")) >= 10),
  CONSTRAINT "FinanceInKindContribution_hash_check" CHECK ("valuationSha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "FinancePayable" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "expenseEntryId" TEXT NOT NULL,
  "storageObjectId" TEXT NOT NULL,
  "creditorName" VARCHAR(200) NOT NULL,
  "creditorTaxId" VARCHAR(32) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "incurredAt" DATE NOT NULL,
  "dueAt" DATE NOT NULL,
  "originalAmount" DECIMAL(15,2) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancePayable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancePayable_dates_check" CHECK ("dueAt" >= "incurredAt"),
  CONSTRAINT "FinancePayable_amount_check" CHECK ("originalAmount" > 0),
  CONSTRAINT "FinancePayable_text_check" CHECK (btrim("creditorName") <> '' AND btrim("creditorTaxId") <> '' AND char_length(btrim("description")) >= 5)
);

CREATE TABLE "FinancePayableSettlement" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payableId" UUID NOT NULL,
  "bankStatementLineId" UUID NOT NULL,
  "storageObjectId" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "paidAt" DATE NOT NULL,
  "paymentReference" VARCHAR(160) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancePayableSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancePayableSettlement_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "FinancePayableSettlement_reference_check" CHECK (char_length(btrim("paymentReference")) >= 3)
);

CREATE TABLE "FinanceExternalFilingEvidence" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "reportVersionId" UUID NOT NULL,
  "storageObjectId" TEXT NOT NULL,
  "authorityName" VARCHAR(200) NOT NULL,
  "channel" VARCHAR(120) NOT NULL,
  "externalReference" VARCHAR(160) NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "evidenceSha256" CHAR(64) NOT NULL,
  "recordedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceExternalFilingEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceExternalFilingEvidence_text_check" CHECK (btrim("authorityName") <> '' AND btrim("channel") <> '' AND char_length(btrim("externalReference")) >= 3),
  CONSTRAINT "FinanceExternalFilingEvidence_hash_check" CHECK ("evidenceSha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "FinanceExternalFilingEvidenceReview" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "evidenceId" UUID NOT NULL,
  "decision" "FinanceExternalReviewDecision" NOT NULL,
  "reviewNote" VARCHAR(2000) NOT NULL,
  "reviewedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceExternalFilingEvidenceReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceExternalFilingEvidenceReview_note_check" CHECK (char_length(btrim("reviewNote")) >= 10)
);

CREATE TABLE "FinanceCloseoutCommand" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "payloadSha256" CHAR(64) NOT NULL,
  "type" "FinanceCloseoutCommandType" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "resourceType" VARCHAR(80) NOT NULL,
  "resourceId" VARCHAR(128) NOT NULL,
  "resultSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCloseoutCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceCloseoutCommand_hash_check" CHECK ("payloadSha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "FinanceReportDossier_id_tenantId_key" ON "FinanceReportDossier"("id", "tenantId");
CREATE UNIQUE INDEX "FinanceReportDossier_scope_key" ON "FinanceReportDossier"("tenantId", "operationProfileId", "kind", "subjectCode");
CREATE INDEX "FinanceReportDossier_tenant_profile_kind_idx" ON "FinanceReportDossier"("tenantId", "operationProfileId", "kind");
CREATE UNIQUE INDEX "FinanceLedgerCut_id_tenantId_key" ON "FinanceLedgerCut"("id", "tenantId");
CREATE INDEX "FinanceLedgerCut_tenant_profile_cutoff_idx" ON "FinanceLedgerCut"("tenantId", "operationProfileId", "cutoffAt");
CREATE INDEX "FinanceLedgerCut_tenant_dossier_idx" ON "FinanceLedgerCut"("tenantId", "dossierId", "createdAt");
CREATE UNIQUE INDEX "FinanceLedgerCutLine_id_tenantId_key" ON "FinanceLedgerCutLine"("id", "tenantId");
CREATE UNIQUE INDEX "FinanceLedgerCutLine_entry_key" ON "FinanceLedgerCutLine"("tenantId", "ledgerCutId", "financialEntryId");
CREATE INDEX "FinanceLedgerCutLine_tenant_entry_idx" ON "FinanceLedgerCutLine"("tenantId", "financialEntryId");
CREATE UNIQUE INDEX "FinanceReportVersion_id_tenantId_key" ON "FinanceReportVersion"("id", "tenantId");
CREATE UNIQUE INDEX "FinanceReportVersion_number_key" ON "FinanceReportVersion"("tenantId", "dossierId", "versionNumber");
CREATE UNIQUE INDEX "FinanceReportVersion_cut_key" ON "FinanceReportVersion"("ledgerCutId", "tenantId");
CREATE INDEX "FinanceReportVersion_tenant_profile_idx" ON "FinanceReportVersion"("tenantId", "operationProfileId", "createdAt");
CREATE UNIQUE INDEX "FinanceReportApproval_id_tenantId_key" ON "FinanceReportApproval"("id", "tenantId");
CREATE UNIQUE INDEX "FinanceReportApproval_control_key" ON "FinanceReportApproval"("tenantId", "reportVersionId", "control");
CREATE INDEX "FinanceReportApproval_actor_idx" ON "FinanceReportApproval"("tenantId", "actorUserId", "createdAt");
CREATE UNIQUE INDEX "FinanceBankStatement_id_tenantId_key" ON "FinanceBankStatement"("id", "tenantId");
CREATE UNIQUE INDEX "FinanceBankStatement_storage_key" ON "FinanceBankStatement"("storageObjectId", "tenantId");
CREATE INDEX "FinanceBankStatement_period_idx" ON "FinanceBankStatement"("tenantId", "operationProfileId", "periodStartsAt", "periodEndsAt");
CREATE UNIQUE INDEX "FinanceBankStatementLine_id_tenantId_key" ON "FinanceBankStatementLine"("id", "tenantId");
CREATE UNIQUE INDEX "FinanceBankStatementLine_number_key" ON "FinanceBankStatementLine"("tenantId", "bankStatementId", "lineNumber");
CREATE INDEX "FinanceBankStatementLine_entry_idx" ON "FinanceBankStatementLine"("tenantId", "matchedEntryId");
CREATE UNIQUE INDEX "FinanceBankStatementLine_one_match_per_entry_key" ON "FinanceBankStatementLine"("tenantId", "matchedEntryId") WHERE "matchedEntryId" IS NOT NULL;
CREATE INDEX "FinanceBankStatementLine_match_idx" ON "FinanceBankStatementLine"("tenantId", "matchStatus", "occurredAt");
CREATE UNIQUE INDEX "FinanceInKindContribution_id_tenantId_key" ON "FinanceInKindContribution"("id", "tenantId");
CREATE UNIQUE INDEX "FinanceInKindContribution_income_key" ON "FinanceInKindContribution"("tenantId", "incomeEntryId");
CREATE UNIQUE INDEX "FinanceInKindContribution_expense_key" ON "FinanceInKindContribution"("tenantId", "expenseEntryId");
CREATE UNIQUE INDEX "FinanceInKindContribution_storage_key" ON "FinanceInKindContribution"("storageObjectId", "tenantId");
CREATE INDEX "FinanceInKindContribution_profile_date_idx" ON "FinanceInKindContribution"("tenantId", "operationProfileId", "contributionDate");
CREATE UNIQUE INDEX "FinancePayable_id_tenantId_key" ON "FinancePayable"("id", "tenantId");
CREATE UNIQUE INDEX "FinancePayable_expense_key" ON "FinancePayable"("tenantId", "expenseEntryId");
CREATE UNIQUE INDEX "FinancePayable_storage_key" ON "FinancePayable"("storageObjectId", "tenantId");
CREATE INDEX "FinancePayable_due_idx" ON "FinancePayable"("tenantId", "operationProfileId", "dueAt");
CREATE UNIQUE INDEX "FinancePayableSettlement_id_tenantId_key" ON "FinancePayableSettlement"("id", "tenantId");
CREATE UNIQUE INDEX "FinancePayableSettlement_bank_line_key" ON "FinancePayableSettlement"("tenantId", "bankStatementLineId");
CREATE UNIQUE INDEX "FinancePayableSettlement_storage_key" ON "FinancePayableSettlement"("storageObjectId", "tenantId");
CREATE INDEX "FinancePayableSettlement_payable_idx" ON "FinancePayableSettlement"("tenantId", "payableId", "paidAt");
CREATE UNIQUE INDEX "FinanceExternalFilingEvidence_id_tenantId_key" ON "FinanceExternalFilingEvidence"("id", "tenantId");
CREATE UNIQUE INDEX "FinanceExternalFilingEvidence_version_key" ON "FinanceExternalFilingEvidence"("reportVersionId", "tenantId");
CREATE UNIQUE INDEX "FinanceExternalFilingEvidence_storage_key" ON "FinanceExternalFilingEvidence"("storageObjectId", "tenantId");
CREATE INDEX "FinanceExternalFilingEvidence_profile_idx" ON "FinanceExternalFilingEvidence"("tenantId", "operationProfileId", "submittedAt");
CREATE UNIQUE INDEX "FinanceExternalFilingEvidenceReview_id_tenantId_key" ON "FinanceExternalFilingEvidenceReview"("id", "tenantId");
CREATE UNIQUE INDEX "FinanceExternalFilingEvidenceReview_evidence_key" ON "FinanceExternalFilingEvidenceReview"("evidenceId", "tenantId");
CREATE INDEX "FinanceExternalFilingEvidenceReview_reviewer_idx" ON "FinanceExternalFilingEvidenceReview"("tenantId", "reviewedById", "createdAt");
CREATE UNIQUE INDEX "FinanceCloseoutCommand_id_tenantId_key" ON "FinanceCloseoutCommand"("id", "tenantId");
CREATE UNIQUE INDEX "FinanceCloseoutCommand_tenant_client_key" ON "FinanceCloseoutCommand"("tenantId", "clientRequestId");
CREATE INDEX "FinanceCloseoutCommand_actor_idx" ON "FinanceCloseoutCommand"("tenantId", "actorUserId", "createdAt");

ALTER TABLE "FinanceReportDossier" ADD CONSTRAINT "FinanceReportDossier_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportDossier" ADD CONSTRAINT "FinanceReportDossier_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportDossier" ADD CONSTRAINT "FinanceReportDossier_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerCut" ADD CONSTRAINT "FinanceLedgerCut_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerCut" ADD CONSTRAINT "FinanceLedgerCut_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerCut" ADD CONSTRAINT "FinanceLedgerCut_dossier_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "FinanceReportDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerCut" ADD CONSTRAINT "FinanceLedgerCut_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerCutLine" ADD CONSTRAINT "FinanceLedgerCutLine_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerCutLine" ADD CONSTRAINT "FinanceLedgerCutLine_cut_fkey" FOREIGN KEY ("ledgerCutId", "tenantId") REFERENCES "FinanceLedgerCut"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerCutLine" ADD CONSTRAINT "FinanceLedgerCutLine_entry_fkey" FOREIGN KEY ("financialEntryId", "tenantId") REFERENCES "FinancialEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportVersion" ADD CONSTRAINT "FinanceReportVersion_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportVersion" ADD CONSTRAINT "FinanceReportVersion_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportVersion" ADD CONSTRAINT "FinanceReportVersion_dossier_fkey" FOREIGN KEY ("dossierId", "tenantId") REFERENCES "FinanceReportDossier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportVersion" ADD CONSTRAINT "FinanceReportVersion_cut_fkey" FOREIGN KEY ("ledgerCutId", "tenantId") REFERENCES "FinanceLedgerCut"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportVersion" ADD CONSTRAINT "FinanceReportVersion_based_on_fkey" FOREIGN KEY ("basedOnVersionId", "tenantId") REFERENCES "FinanceReportVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportVersion" ADD CONSTRAINT "FinanceReportVersion_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportApproval" ADD CONSTRAINT "FinanceReportApproval_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportApproval" ADD CONSTRAINT "FinanceReportApproval_version_fkey" FOREIGN KEY ("reportVersionId", "tenantId") REFERENCES "FinanceReportVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReportApproval" ADD CONSTRAINT "FinanceReportApproval_actor_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBankStatement" ADD CONSTRAINT "FinanceBankStatement_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBankStatement" ADD CONSTRAINT "FinanceBankStatement_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBankStatement" ADD CONSTRAINT "FinanceBankStatement_storage_fkey" FOREIGN KEY ("storageObjectId", "tenantId") REFERENCES "StoredObject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBankStatement" ADD CONSTRAINT "FinanceBankStatement_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBankStatementLine" ADD CONSTRAINT "FinanceBankStatementLine_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBankStatementLine" ADD CONSTRAINT "FinanceBankStatementLine_statement_fkey" FOREIGN KEY ("bankStatementId", "tenantId") REFERENCES "FinanceBankStatement"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBankStatementLine" ADD CONSTRAINT "FinanceBankStatementLine_entry_fkey" FOREIGN KEY ("matchedEntryId", "tenantId") REFERENCES "FinancialEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInKindContribution" ADD CONSTRAINT "FinanceInKindContribution_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInKindContribution" ADD CONSTRAINT "FinanceInKindContribution_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInKindContribution" ADD CONSTRAINT "FinanceInKindContribution_income_fkey" FOREIGN KEY ("incomeEntryId", "tenantId") REFERENCES "FinancialEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInKindContribution" ADD CONSTRAINT "FinanceInKindContribution_expense_fkey" FOREIGN KEY ("expenseEntryId", "tenantId") REFERENCES "FinancialEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInKindContribution" ADD CONSTRAINT "FinanceInKindContribution_storage_fkey" FOREIGN KEY ("storageObjectId", "tenantId") REFERENCES "StoredObject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInKindContribution" ADD CONSTRAINT "FinanceInKindContribution_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayable" ADD CONSTRAINT "FinancePayable_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayable" ADD CONSTRAINT "FinancePayable_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayable" ADD CONSTRAINT "FinancePayable_expense_fkey" FOREIGN KEY ("expenseEntryId", "tenantId") REFERENCES "FinancialEntry"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayable" ADD CONSTRAINT "FinancePayable_storage_fkey" FOREIGN KEY ("storageObjectId", "tenantId") REFERENCES "StoredObject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayable" ADD CONSTRAINT "FinancePayable_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayableSettlement" ADD CONSTRAINT "FinancePayableSettlement_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayableSettlement" ADD CONSTRAINT "FinancePayableSettlement_payable_fkey" FOREIGN KEY ("payableId", "tenantId") REFERENCES "FinancePayable"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayableSettlement" ADD CONSTRAINT "FinancePayableSettlement_bank_line_fkey" FOREIGN KEY ("bankStatementLineId", "tenantId") REFERENCES "FinanceBankStatementLine"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayableSettlement" ADD CONSTRAINT "FinancePayableSettlement_storage_fkey" FOREIGN KEY ("storageObjectId", "tenantId") REFERENCES "StoredObject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayableSettlement" ADD CONSTRAINT "FinancePayableSettlement_creator_fkey" FOREIGN KEY ("createdById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceExternalFilingEvidence" ADD CONSTRAINT "FinanceExternalFilingEvidence_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceExternalFilingEvidence" ADD CONSTRAINT "FinanceExternalFilingEvidence_profile_fkey" FOREIGN KEY ("operationProfileId", "tenantId") REFERENCES "OperationProfile"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceExternalFilingEvidence" ADD CONSTRAINT "FinanceExternalFilingEvidence_version_fkey" FOREIGN KEY ("reportVersionId", "tenantId") REFERENCES "FinanceReportVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceExternalFilingEvidence" ADD CONSTRAINT "FinanceExternalFilingEvidence_storage_fkey" FOREIGN KEY ("storageObjectId", "tenantId") REFERENCES "StoredObject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceExternalFilingEvidence" ADD CONSTRAINT "FinanceExternalFilingEvidence_recorder_fkey" FOREIGN KEY ("recordedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceExternalFilingEvidenceReview" ADD CONSTRAINT "FinanceExternalFilingEvidenceReview_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceExternalFilingEvidenceReview" ADD CONSTRAINT "FinanceExternalFilingEvidenceReview_evidence_fkey" FOREIGN KEY ("evidenceId", "tenantId") REFERENCES "FinanceExternalFilingEvidence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceExternalFilingEvidenceReview" ADD CONSTRAINT "FinanceExternalFilingEvidenceReview_reviewer_fkey" FOREIGN KEY ("reviewedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseoutCommand" ADD CONSTRAINT "FinanceCloseoutCommand_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseoutCommand" ADD CONSTRAINT "FinanceCloseoutCommand_actor_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "finance_closeout_assert_open_operation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_stage "PoliticalOperationStage";
BEGIN
  SELECT "stage" INTO current_stage
  FROM "OperationProfile"
  WHERE "tenantId" = NEW."tenantId"
  FOR SHARE;

  IF current_stage IS NULL THEN
    RAISE EXCEPTION 'Finance closeout requires an operation profile' USING ERRCODE = '23514';
  END IF;
  IF current_stage = 'CLOSED' THEN
    RAISE EXCEPTION 'A CLOSED operation cannot receive finance closeout mutations' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "finance_closeout_reject_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; corrections require a new version or event', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION "finance_ledger_cut_line_validate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_entry "FinancialEntry"%ROWTYPE;
  cut_row "FinanceLedgerCut"%ROWTYPE;
BEGIN
  SELECT * INTO source_entry FROM "FinancialEntry"
  WHERE "id" = NEW."financialEntryId" AND "tenantId" = NEW."tenantId"
  FOR SHARE;
  SELECT * INTO cut_row FROM "FinanceLedgerCut"
  WHERE "id" = NEW."ledgerCutId" AND "tenantId" = NEW."tenantId"
  FOR SHARE;
  IF source_entry."id" IS NULL OR cut_row."id" IS NULL THEN
    RAISE EXCEPTION 'Ledger cut source is outside the tenant' USING ERRCODE = '23514';
  END IF;
  IF source_entry."createdAt" > cut_row."cutoffAt" OR source_entry."date"::date < cut_row."periodStartsAt" OR source_entry."date"::date > cut_row."periodEndsAt" THEN
    RAISE EXCEPTION 'Financial entry is outside the immutable cut boundaries' USING ERRCODE = '23514';
  END IF;
  IF source_entry."type" <> NEW."entryType" OR source_entry."status" <> NEW."entryStatus" OR source_entry."amount" <> NEW."amount" OR source_entry."date"::date <> NEW."entryDate" OR source_entry."cneCode" <> NEW."cneCode" OR (source_entry."evidenceUrl" IS NOT NULL) <> NEW."evidencePresent" THEN
    RAISE EXCEPTION 'Ledger cut snapshot does not match its source entry' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "finance_bank_line_validate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  statement_row "FinanceBankStatement"%ROWTYPE;
  source_entry "FinancialEntry"%ROWTYPE;
BEGIN
  SELECT * INTO statement_row FROM "FinanceBankStatement"
  WHERE "id" = NEW."bankStatementId" AND "tenantId" = NEW."tenantId"
  FOR SHARE;
  IF NEW."occurredAt" < statement_row."periodStartsAt" OR NEW."occurredAt" > statement_row."periodEndsAt" THEN
    RAISE EXCEPTION 'Bank line is outside the statement period' USING ERRCODE = '23514';
  END IF;
  IF NEW."matchStatus" = 'MATCHED' THEN
    SELECT * INTO source_entry FROM "FinancialEntry"
    WHERE "id" = NEW."matchedEntryId" AND "tenantId" = NEW."tenantId"
    FOR SHARE;
    IF source_entry."id" IS NULL OR source_entry."status" NOT IN ('APPROVED', 'REPORTED_CNE') THEN
      RAISE EXCEPTION 'Matched finance entry must be approved in the same tenant' USING ERRCODE = '23514';
    END IF;
    IF (NEW."debit" > 0 AND (source_entry."type" <> 'EXPENSE' OR source_entry."amount" <> NEW."debit")) OR
       (NEW."credit" > 0 AND (source_entry."type" <> 'INCOME' OR source_entry."amount" <> NEW."credit")) THEN
      RAISE EXCEPTION 'Bank line direction or amount does not match the finance entry' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "finance_in_kind_validate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  income_row "FinancialEntry"%ROWTYPE;
  expense_row "FinancialEntry"%ROWTYPE;
BEGIN
  SELECT * INTO income_row FROM "FinancialEntry" WHERE "id" = NEW."incomeEntryId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  SELECT * INTO expense_row FROM "FinancialEntry" WHERE "id" = NEW."expenseEntryId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  IF income_row."id" IS NULL OR expense_row."id" IS NULL OR income_row."type" <> 'INCOME' OR expense_row."type" <> 'EXPENSE' OR
     income_row."status" NOT IN ('APPROVED', 'REPORTED_CNE') OR expense_row."status" NOT IN ('APPROVED', 'REPORTED_CNE') OR
     income_row."amount" <> NEW."value" OR expense_row."amount" <> NEW."value" THEN
    RAISE EXCEPTION 'In-kind contribution requires an approved equal-value income and expense pair' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "finance_payable_validate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expense_row "FinancialEntry"%ROWTYPE;
BEGIN
  SELECT * INTO expense_row FROM "FinancialEntry" WHERE "id" = NEW."expenseEntryId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  IF expense_row."id" IS NULL OR expense_row."type" <> 'EXPENSE' OR expense_row."status" NOT IN ('APPROVED', 'REPORTED_CNE') OR expense_row."amount" <> NEW."originalAmount" THEN
    RAISE EXCEPTION 'Payable requires an approved equal-value expense in the same tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "finance_payable_settlement_validate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payable_row "FinancePayable"%ROWTYPE;
  bank_line "FinanceBankStatementLine"%ROWTYPE;
  settled_total DECIMAL(15,2);
BEGIN
  SELECT * INTO payable_row FROM "FinancePayable" WHERE "id" = NEW."payableId" AND "tenantId" = NEW."tenantId" FOR UPDATE;
  SELECT * INTO bank_line FROM "FinanceBankStatementLine" WHERE "id" = NEW."bankStatementLineId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  IF bank_line."id" IS NULL OR bank_line."matchStatus" <> 'MATCHED' OR bank_line."debit" <> NEW."amount" OR bank_line."occurredAt" <> NEW."paidAt" THEN
    RAISE EXCEPTION 'Settlement requires an equal matched debit line on the payment date' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(SUM("amount"), 0) INTO settled_total FROM "FinancePayableSettlement" WHERE "tenantId" = NEW."tenantId" AND "payableId" = NEW."payableId";
  IF settled_total + NEW."amount" > payable_row."originalAmount" THEN
    RAISE EXCEPTION 'Payable settlement exceeds outstanding amount' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "finance_report_approval_validate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_role "Role";
  version_creator TEXT;
BEGIN
  SELECT "role" INTO actor_role FROM "User" WHERE "id" = NEW."actorUserId" AND "tenantId" = NEW."tenantId" AND "isActive" = TRUE FOR SHARE;
  SELECT "createdById" INTO version_creator FROM "FinanceReportVersion" WHERE "id" = NEW."reportVersionId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  IF version_creator = NEW."actorUserId" THEN
    RAISE EXCEPTION 'Report creator cannot approve their own version' USING ERRCODE = '23514';
  END IF;
  IF (NEW."control" = 'CAMPAIGN_MANAGER' AND actor_role <> 'CAMPAIGN_MANAGER') OR
     (NEW."control" = 'ACCOUNTANT' AND actor_role <> 'FINANCE_MANAGER') OR
     (NEW."control" = 'COMPLIANCE' AND actor_role <> 'COMPLIANCE_OFFICER') THEN
    RAISE EXCEPTION 'Approval control does not match the active user role' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "FinanceReportApproval" WHERE "tenantId" = NEW."tenantId" AND "reportVersionId" = NEW."reportVersionId" AND "actorUserId" = NEW."actorUserId") THEN
    RAISE EXCEPTION 'One person cannot occupy two report controls' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "FinanceReportApproval" WHERE "tenantId" = NEW."tenantId" AND "reportVersionId" = NEW."reportVersionId" AND "decision" = 'RETURN_FOR_CORRECTION') THEN
    RAISE EXCEPTION 'Returned version is sealed; create a correction version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "finance_external_evidence_validate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approval_count INTEGER;
  storage_row "StoredObject"%ROWTYPE;
BEGIN
  SELECT COUNT(*) INTO approval_count FROM "FinanceReportApproval"
  WHERE "tenantId" = NEW."tenantId" AND "reportVersionId" = NEW."reportVersionId" AND "decision" = 'APPROVE';
  IF approval_count <> 3 THEN
    RAISE EXCEPTION 'External evidence requires all three independent internal approvals' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "FinanceReportApproval" WHERE "tenantId" = NEW."tenantId" AND "reportVersionId" = NEW."reportVersionId" AND "decision" = 'RETURN_FOR_CORRECTION') OR
     EXISTS (SELECT 1 FROM "FinanceReportVersion" WHERE "tenantId" = NEW."tenantId" AND "basedOnVersionId" = NEW."reportVersionId") THEN
    RAISE EXCEPTION 'External evidence can only attach to the latest approved version' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO storage_row FROM "StoredObject" WHERE "id" = NEW."storageObjectId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  IF storage_row."id" IS NULL OR storage_row."module" <> 'FINANCE' OR storage_row."status" <> 'CONFIRMED' OR storage_row."consumedAt" IS NOT NULL OR storage_row."expectedSha256" <> NEW."evidenceSha256" OR storage_row."reportedSha256" <> NEW."evidenceSha256" THEN
    RAISE EXCEPTION 'External evidence must be an unconsumed confirmed finance StorageObject with matching SHA-256' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "finance_external_review_validate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  reviewer_role "Role";
  recorder_id TEXT;
BEGIN
  SELECT "role" INTO reviewer_role FROM "User" WHERE "id" = NEW."reviewedById" AND "tenantId" = NEW."tenantId" AND "isActive" = TRUE FOR SHARE;
  SELECT "recordedById" INTO recorder_id FROM "FinanceExternalFilingEvidence" WHERE "id" = NEW."evidenceId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  IF reviewer_role <> 'AUDITOR' OR recorder_id = NEW."reviewedById" THEN
    RAISE EXCEPTION 'External evidence review requires an independent active auditor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceLedgerCutLine_validate" BEFORE INSERT ON "FinanceLedgerCutLine" FOR EACH ROW EXECUTE FUNCTION "finance_ledger_cut_line_validate"();
CREATE TRIGGER "FinanceBankStatementLine_validate" BEFORE INSERT ON "FinanceBankStatementLine" FOR EACH ROW EXECUTE FUNCTION "finance_bank_line_validate"();
CREATE TRIGGER "FinanceInKindContribution_validate" BEFORE INSERT ON "FinanceInKindContribution" FOR EACH ROW EXECUTE FUNCTION "finance_in_kind_validate"();
CREATE TRIGGER "FinancePayable_validate" BEFORE INSERT ON "FinancePayable" FOR EACH ROW EXECUTE FUNCTION "finance_payable_validate"();
CREATE TRIGGER "FinancePayableSettlement_validate" BEFORE INSERT ON "FinancePayableSettlement" FOR EACH ROW EXECUTE FUNCTION "finance_payable_settlement_validate"();
CREATE TRIGGER "FinanceReportApproval_validate" BEFORE INSERT ON "FinanceReportApproval" FOR EACH ROW EXECUTE FUNCTION "finance_report_approval_validate"();
CREATE TRIGGER "FinanceExternalFilingEvidence_validate" BEFORE INSERT ON "FinanceExternalFilingEvidence" FOR EACH ROW EXECUTE FUNCTION "finance_external_evidence_validate"();
CREATE TRIGGER "FinanceExternalFilingEvidenceReview_validate" BEFORE INSERT ON "FinanceExternalFilingEvidenceReview" FOR EACH ROW EXECUTE FUNCTION "finance_external_review_validate"();

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'FinanceReportDossier', 'FinanceLedgerCut', 'FinanceLedgerCutLine',
    'FinanceReportVersion', 'FinanceReportApproval', 'FinanceBankStatement',
    'FinanceBankStatementLine', 'FinanceInKindContribution', 'FinancePayable',
    'FinancePayableSettlement', 'FinanceExternalFilingEvidence',
    'FinanceExternalFilingEvidenceReview', 'FinanceCloseoutCommand'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION "finance_closeout_assert_open_operation"()', table_name || '_open_operation', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION "finance_closeout_reject_mutation"()', table_name || '_immutable', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION "finance_closeout_reject_mutation"()', table_name || '_no_truncate', table_name);
  END LOOP;
END;
$$;

COMMIT;
