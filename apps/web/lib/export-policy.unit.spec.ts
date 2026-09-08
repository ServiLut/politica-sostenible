import { expect, test } from "@playwright/test";
import type { BackendUserRole } from "../types/saas-schema";
import { canExportData, EXPORT_ALLOWED_ROLES } from "./export-policy";

const allowedRoles: BackendUserRole[] = [
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMPLIANCE_OFFICER",
  "AUDITOR",
];

const deniedRoles: BackendUserRole[] = [
  "FINANCE_MANAGER",
  "COMMUNICATIONS_MANAGER",
  "CONSTITUENT_SERVICES_MANAGER",
  "CASE_WORKER",
  "ZONE_COORDINATOR",
  "WITNESS",
  "VOLUNTEER",
];

test("replica exactamente los roles autorizados por ExportController", () => {
  expect([...EXPORT_ALLOWED_ROLES]).toEqual(allowedRoles);

  for (const role of allowedRoles) {
    expect(canExportData(role), `${role} debe poder exportar`).toBe(true);
  }

  for (const role of deniedRoles) {
    expect(canExportData(role), `${role} no debe poder exportar`).toBe(false);
  }

  expect(canExportData(null)).toBe(false);
  expect(canExportData(undefined)).toBe(false);
});
