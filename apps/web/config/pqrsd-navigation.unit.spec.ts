import { expect, test } from "@playwright/test";
import {
  canAccessNavigationItem,
  dashboardConfig,
  getVisibleNavigationItems,
} from "./navigation";
import { UserRole } from "../types/saas-schema";

const item = dashboardConfig.find(({ href }) => href === "/dashboard/pqrsd");

test("PQRSD formal is discoverable for authorized PUBLIC_OFFICE roles", () => {
  expect(item).toBeDefined();
  if (!item) return;
  for (const backendRole of [
    "ADMIN",
    "CONSTITUENT_SERVICES_MANAGER",
    "CASE_WORKER",
    "COMPLIANCE_OFFICER",
    "AUDITOR",
  ] as const) {
    expect(
      canAccessNavigationItem(
        item,
        { role: UserRole.AdminCampana, backendRole },
        { type: "PUBLIC_OFFICE" },
      ),
    ).toBe(true);
  }
});

test("PQRSD formal never appears in campaign tenants or to campaign-only roles", () => {
  expect(item).toBeDefined();
  if (!item) return;
  expect(
    canAccessNavigationItem(
      item,
      { role: UserRole.AdminCampana, backendRole: "ADMIN" },
      { type: "CANDIDACY" },
    ),
  ).toBe(false);
  expect(
    canAccessNavigationItem(
      item,
      { role: UserRole.Voluntario, backendRole: "VOLUNTEER" },
      { type: "PUBLIC_OFFICE" },
    ),
  ).toBe(false);
});

test("PQRSD and lightweight CAS-GP remain separate destinations", () => {
  const hrefs = getVisibleNavigationItems(
    { role: UserRole.AdminCampana, backendRole: "ADMIN" },
    { type: "PUBLIC_OFFICE" },
  ).map(({ href }) => href);

  expect(hrefs).toContain("/dashboard/cases");
  expect(hrefs).toContain("/dashboard/pqrsd");
});
