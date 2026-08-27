DROP INDEX IF EXISTS "IssueCase_tenantId_reference_key";

CREATE UNIQUE INDEX "IssueCase_tenantId_mode_reference_key"
ON "IssueCase"("tenantId", "mode", "reference");
