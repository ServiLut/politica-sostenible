import { expect, test } from "@playwright/test";
import {
  canAccessNavigationItem,
  dashboardConfig,
  getVisibleNavigationItems,
} from "./navigation";
import { UserRole } from "../types/saas-schema";

const integrity = dashboardConfig.find(
  ({ href }) => href === "/dashboard/integrity-signatures",
);

test("el sello de metadatos es descubrible para firmantes y revisores autorizados", () => {
  expect(integrity).toBeDefined();
  if (!integrity) return;

  for (const [role, backendRole] of [
    [UserRole.AdminCampana, "ADMIN"],
    [UserRole.GerenteOps, "CAMPAIGN_MANAGER"],
    [UserRole.GerenteFinanzas, "FINANCE_MANAGER"],
    [UserRole.Coordinador, "ZONE_COORDINATOR"],
    [UserRole.Testigo, "WITNESS"],
    [UserRole.Auditor, "COMPLIANCE_OFFICER"],
    [UserRole.Auditor, "AUDITOR"],
  ] as const) {
    expect(
      canAccessNavigationItem(
        integrity,
        { role, backendRole },
        { type: "CANDIDACY" },
      ),
    ).toBe(true);
  }
});

test("no expone integridad electoral a oficina pública ni a roles sin acceso", () => {
  expect(integrity).toBeDefined();
  if (!integrity) return;

  expect(
    canAccessNavigationItem(
      integrity,
      { role: UserRole.AdminCampana, backendRole: "ADMIN" },
      { type: "PUBLIC_OFFICE" },
    ),
  ).toBe(false);
  expect(
    canAccessNavigationItem(
      integrity,
      { role: UserRole.Voluntario, backendRole: "VOLUNTEER" },
      { type: "CANDIDACY" },
    ),
  ).toBe(false);
});

test("conserva la verificación visible después del cierre", () => {
  const hrefs = getVisibleNavigationItems(
    { role: UserRole.Auditor, backendRole: "AUDITOR" },
    { type: "CANDIDACY" },
    "CLOSED",
  ).map(({ href }) => href);

  expect(hrefs).toContain("/dashboard/integrity-signatures");
});
