import { expect, test } from "@playwright/test";
import {
  canAccessNavigationItem,
  dashboardConfig,
  getVisibleNavigationItems,
} from "./navigation";
import { UserRole } from "../types/saas-schema";

const logistics = dashboardConfig.find(
  ({ href }) => href === "/dashboard/logistics",
);

test("logística es descubrible para operación y revisión en tenants de campaña", () => {
  expect(logistics).toBeDefined();
  if (!logistics) return;
  for (const [role, backendRole] of [
    [UserRole.AdminCampana, "ADMIN"],
    [UserRole.GerenteOps, "CAMPAIGN_MANAGER"],
    [UserRole.Coordinador, "ZONE_COORDINATOR"],
    [UserRole.Auditor, "COMPLIANCE_OFFICER"],
    [UserRole.Auditor, "AUDITOR"],
  ] as const) {
    expect(
      canAccessNavigationItem(
        logistics,
        { role, backendRole },
        { type: "CANDIDACY" },
      ),
    ).toBe(true);
  }
});

test("no expone logística electoral a oficina pública ni a voluntariado/testigos", () => {
  expect(logistics).toBeDefined();
  if (!logistics) return;
  expect(
    canAccessNavigationItem(
      logistics,
      { role: UserRole.AdminCampana, backendRole: "ADMIN" },
      { type: "PUBLIC_OFFICE" },
    ),
  ).toBe(false);
  for (const [role, backendRole] of [
    [UserRole.Voluntario, "VOLUNTEER"],
    [UserRole.Testigo, "WITNESS"],
  ] as const) {
    expect(
      canAccessNavigationItem(
        logistics,
        { role, backendRole },
        { type: "PARTY" },
      ),
    ).toBe(false);
  }
});

test("conserva el expediente visible en CLOSED; la página lo vuelve solo lectura", () => {
  const hrefs = getVisibleNavigationItems(
    { role: UserRole.Auditor, backendRole: "AUDITOR" },
    { type: "GSC" },
    "CLOSED",
  ).map(({ href }) => href);
  expect(hrefs).toContain("/dashboard/logistics");
});
