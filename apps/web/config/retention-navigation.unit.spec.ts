import { expect, test } from "@playwright/test";
import {
  canAccessNavigationItem,
  dashboardConfig,
  getVisibleNavigationItems,
} from "./navigation";
import { UserRole } from "../types/saas-schema";

test("el gobierno de retencion permanece disponible para control especializado durante todo el ciclo", () => {
  const retention = dashboardConfig.find(
    (item) => item.href === "/dashboard/retention",
  );
  expect(retention).toBeDefined();
  if (!retention) return;
  const tenant = { type: "CANDIDACY" as const };

  for (const backendRole of [
    "ADMIN",
    "COMPLIANCE_OFFICER",
    "AUDITOR",
  ] as const) {
    const user = {
      role:
        backendRole === "ADMIN" ? UserRole.AdminCampana : UserRole.Auditor,
      backendRole,
    };
    expect(canAccessNavigationItem(retention, user, tenant)).toBe(true);
    expect(
      getVisibleNavigationItems(user, tenant, "CAMPAIGN").map(
        ({ href }) => href,
      ),
    ).toContain(retention.href);
    expect(
      getVisibleNavigationItems(user, tenant, "CLOSED").map(
        ({ href }) => href,
      ),
    ).toContain(retention.href);
  }

  expect(
    canAccessNavigationItem(
      retention,
      { role: UserRole.Voluntario, backendRole: "VOLUNTEER" },
      tenant,
    ),
  ).toBe(false);
  expect(
    canAccessNavigationItem(
      retention,
      { role: UserRole.AdminCampana, backendRole: "ADMIN" },
      { type: "PUBLIC_OFFICE" },
    ),
  ).toBe(false);
});
