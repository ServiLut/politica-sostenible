import type { BackendUserRole } from "@/types/saas-schema";

export const EXPORT_ALLOWED_ROLES = [
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMPLIANCE_OFFICER",
  "AUDITOR",
] as const satisfies readonly BackendUserRole[];

const EXPORT_ALLOWED_ROLE_SET = new Set<BackendUserRole>(
  EXPORT_ALLOWED_ROLES,
);

export function canExportData(
  role: BackendUserRole | null | undefined,
): boolean {
  return role !== null && role !== undefined && EXPORT_ALLOWED_ROLE_SET.has(role);
}
