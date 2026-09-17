import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const panel = readFileSync(
  resolve(process.cwd(), "apps/web/components/finance/FinanceCloseoutPanel.tsx"),
  "utf8",
);
const page = readFileSync(
  resolve(process.cwd(), "apps/web/app/dashboard/finance/page.tsx"),
  "utf8",
);
const api = readFileSync(
  resolve(process.cwd(), "apps/web/lib/finance-closeout-api.ts"),
  "utf8",
);

test.describe("finance closeout user interface contract", () => {
  test("is mounted in real Finance and calls every closeout workflow", () => {
    expect(page).toContain("<FinanceCloseoutPanel");
    for (const operation of [
      "createFinanceDossier",
      "createFinanceBankStatement",
      "createFinanceInKindContribution",
      "createFinancePayable",
      "settleFinancePayable",
      "createFinanceReportVersion",
      "approveFinanceReportVersion",
      "recordFinanceExternalEvidence",
      "reviewFinanceExternalEvidence",
    ]) {
      expect(panel).toContain(operation);
    }
  });

  test("does not pretend to file with the authority", () => {
    expect(panel).toContain("no transmite datos ni prueba por si solo");
    expect(panel).toContain("no constituye un informe oficial");
    expect(api).toContain("EXTERNAL_EVIDENCE_RECORD");
    expect(panel).not.toMatch(/radicacion automatica|radicar automaticamente/iu);
  });

  test("presents immutable versions and all incompatible controls", () => {
    expect(panel).toContain("Crear correccion");
    expect(panel).toContain("Corte SHA-256");
    expect(panel).toContain('"CAMPAIGN_MANAGER", "ACCOUNTANT", "COMPLIANCE"');
    expect(panel).toContain('role === "AUDITOR"');
  });

  test("uploads evidence directly with a client-declared hash", () => {
    expect(panel).toContain("uploadFileDirectlyWithClientDeclaredHash");
    expect(panel).toContain("statementSha256: upload.sha256");
    expect(panel).toContain("evidenceSha256: upload.sha256");
  });

  test("keeps CLOSED visibly read-only and disables mutation controls", () => {
    expect(panel).toContain("Operacion cerrada");
    expect(panel).toContain("!readOnly");
    expect(panel).toContain("readOnly &&");
  });
});
