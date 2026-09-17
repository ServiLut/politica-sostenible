-- Durable, tenant-scoped snapshots for internal post-election handover.
-- These records are evidence of what the application generated; they are not
-- proof of legal compliance, filing, receipt, or official electoral results.

CREATE TYPE "TransitionHandoverReportStatus" AS ENUM (
  'READY',
  'ATTENTION',
  'BLOCKED'
);

CREATE TYPE "TransitionHandoverPackageKind" AS ENUM (
  'INTERNAL_CAMPAIGN_CLOSEOUT_DRAFT',
  'EXCEPTIONAL_TERMINATION_DUTIES_DOSSIER'
);

CREATE TABLE "TransitionHandoverReport" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationProfileId" TEXT NOT NULL,
  "generatedById" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "status" "TransitionHandoverReportStatus" NOT NULL,
  "packageKind" "TransitionHandoverPackageKind" NOT NULL,
  "payload" JSONB NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TransitionHandoverReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransitionHandoverReport_sha256_check"
    CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "TransitionHandoverReport_generated_before_insert_check"
    CHECK ("generatedAt" <= "createdAt"),
  CONSTRAINT "TransitionHandoverReport_payload_object_check"
    CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "TransitionHandoverReport_payload_identity_check"
    CHECK (("payload"->>'reportId' = "id"::text) IS TRUE),
  CONSTRAINT "TransitionHandoverReport_payload_generated_at_check"
    CHECK (
      (
        ("payload"->>'generatedAt')::timestamptz AT TIME ZONE 'UTC'
        = "generatedAt"
      ) IS TRUE
    ),
  CONSTRAINT "TransitionHandoverReport_payload_status_check"
    CHECK (("payload"->>'status' = "status"::text) IS TRUE),
  CONSTRAINT "TransitionHandoverReport_payload_kind_check"
    CHECK (("payload"->>'packageKind' = "packageKind"::text) IS TRUE),
  CONSTRAINT "TransitionHandoverReport_payload_integrity_check"
    CHECK (
      (
        jsonb_typeof("payload"->'integrity') = 'object'
        AND "payload"#>>'{integrity,algorithm}' = 'SHA-256'
        AND "payload"#>>'{integrity,scope}' = 'REPORT_BODY_WITHOUT_INTEGRITY'
        AND "payload"#>>'{integrity,sha256}' = "sha256"
      ) IS TRUE
    ),
  CONSTRAINT "TransitionHandoverReport_non_certification_check"
    CHECK (
      (
        "payload"#>>'{lifecycle,complianceCertified}' = 'false'
        AND "payload"#>>'{lifecycle,authorityFilingCertified}' = 'false'
      ) IS TRUE
    ),
  CONSTRAINT "TransitionHandoverReport_no_tenant_payload_check"
    CHECK (NOT ("payload" ? 'tenantId'))
);

CREATE UNIQUE INDEX "TransitionHandoverReport_id_tenant_key"
  ON "TransitionHandoverReport"("id", "tenantId");
CREATE INDEX "TransitionHandoverReport_tenant_generated_idx"
  ON "TransitionHandoverReport"("tenantId", "generatedAt");
CREATE INDEX "TransitionHandoverReport_profile_generated_idx"
  ON "TransitionHandoverReport"("tenantId", "operationProfileId", "generatedAt");
CREATE INDEX "TransitionHandoverReport_generator_generated_idx"
  ON "TransitionHandoverReport"("tenantId", "generatedById", "generatedAt");

ALTER TABLE "TransitionHandoverReport"
  ADD CONSTRAINT "TransitionHandoverReport_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransitionHandoverReport"
  ADD CONSTRAINT "TransitionHandoverReport_profile_fkey"
  FOREIGN KEY ("operationProfileId", "tenantId")
  REFERENCES "OperationProfile"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransitionHandoverReport"
  ADD CONSTRAINT "TransitionHandoverReport_generator_fkey"
  FOREIGN KEY ("generatedById", "tenantId")
  REFERENCES "User"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "transition_handover_report_reject_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'TransitionHandoverReport is immutable; generate a new snapshot'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransitionHandoverReport_immutable"
  BEFORE UPDATE OR DELETE ON "TransitionHandoverReport"
  FOR EACH ROW EXECUTE FUNCTION "transition_handover_report_reject_mutation"();

CREATE TRIGGER "TransitionHandoverReport_no_truncate"
  BEFORE TRUNCATE ON "TransitionHandoverReport"
  FOR EACH STATEMENT EXECUTE FUNCTION "transition_handover_report_reject_mutation"();

ALTER TABLE "TransitionHandoverReport"
  ENABLE ALWAYS TRIGGER "TransitionHandoverReport_immutable";
ALTER TABLE "TransitionHandoverReport"
  ENABLE ALWAYS TRIGGER "TransitionHandoverReport_no_truncate";
