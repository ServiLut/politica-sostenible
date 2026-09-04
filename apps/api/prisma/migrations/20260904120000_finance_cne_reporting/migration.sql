-- REPORTED_CNE means a human confirmed an external Cuentas Claras filing.
-- The platform does not submit to the CNE and therefore requires the external
-- reference plus an authenticated actor and server timestamp.
ALTER TABLE "FinancialEntry"
ADD COLUMN "cneReportedById" TEXT,
ADD COLUMN "cneReportedAt" TIMESTAMP(3),
ADD COLUMN "cneReportReference" VARCHAR(120);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "FinancialEntry"
    WHERE "status" = 'REPORTED_CNE'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Existen movimientos REPORTED_CNE sin radicado verificable; complete una reconciliacion manual antes de migrar';
  END IF;
END;
$$;

ALTER TABLE "FinancialEntry"
ADD CONSTRAINT "FinancialEntry_cneReportedById_tenantId_fkey"
FOREIGN KEY ("cneReportedById", "tenantId")
REFERENCES "User"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialEntry"
ADD CONSTRAINT "FinancialEntry_cne_reporting_state_check"
CHECK (
  (
    "status" = 'REPORTED_CNE'
    AND "cneReportedById" IS NOT NULL
    AND "cneReportedAt" IS NOT NULL
    AND char_length(btrim("cneReportReference")) BETWEEN 5 AND 120
  )
  OR
  (
    "status" <> 'REPORTED_CNE'
    AND "cneReportedById" IS NULL
    AND "cneReportedAt" IS NULL
    AND "cneReportReference" IS NULL
  )
);

CREATE INDEX "FinancialEntry_tenantId_cneReportedById_cneReportedAt_idx"
ON "FinancialEntry"("tenantId", "cneReportedById", "cneReportedAt");
