-- Legacy tenants keep nullable compliance fields until an authorized finance
-- manager completes the election-specific file. Application writes are
-- all-or-nothing and financial movements remain blocked while it is incomplete.
BEGIN;

CREATE TYPE "FinanceReportScope" AS ENUM ('CANDIDATE', 'POLITICAL_ORGANIZATION');

ALTER TABLE "CampaignSettings"
ADD COLUMN "electionName" VARCHAR(200),
ADD COLUMN "electionDate" TIMESTAMP(3),
ADD COLUMN "reportScope" "FinanceReportScope",
ADD COLUMN "officialLimitsReference" VARCHAR(250),
ADD COLUMN "officialLimitsUrl" VARCHAR(2048),
ADD COLUMN "reportDeadline" TIMESTAMP(3),
ADD COLUMN "financialManagerName" VARCHAR(200),
ADD COLUMN "financialManagerDocument" VARCHAR(32),
ADD COLUMN "accountantName" VARCHAR(200),
ADD COLUMN "accountantDocument" VARCHAR(32),
ADD COLUMN "uniqueAccountBank" VARCHAR(160),
ADD COLUMN "uniqueAccountLastFour" CHAR(4),
ADD COLUMN "cuentasClarasCode" VARCHAR(120);

-- A legacy reported movement may have no digital receipt. New confirmations
-- are fail-closed in the application and consume one confirmed private object.
ALTER TABLE "FinancialEntry"
ADD COLUMN "cneReportEvidenceUrl" TEXT;

CREATE UNIQUE INDEX "FinancialEntry_cneReportEvidenceUrl_key"
ON "FinancialEntry"("cneReportEvidenceUrl");

ALTER TABLE "CampaignSettings"
ADD CONSTRAINT "CampaignSettings_report_deadline_check"
CHECK (
  "electionDate" IS NULL
  OR "reportDeadline" IS NULL
  OR "reportDeadline" > "electionDate"
),
ADD CONSTRAINT "CampaignSettings_official_limits_https_check"
CHECK (
  "officialLimitsUrl" IS NULL
  OR "officialLimitsUrl" ~* '^https://[^[:space:]]+$'
),
ADD CONSTRAINT "CampaignSettings_account_last_four_check"
CHECK (
  "uniqueAccountLastFour" IS NULL
  OR "uniqueAccountLastFour" ~ '^[0-9]{4}$'
);

COMMIT;
