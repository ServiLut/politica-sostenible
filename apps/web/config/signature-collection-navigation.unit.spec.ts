import { expect, test } from "@playwright/test";
import {
  canAccessNavigationItem,
  dashboardConfig,
  getVisibleNavigationItems,
} from "./navigation";
import { UserRole } from "../types/saas-schema";

const signatures = dashboardConfig.find(
  ({ href }) => href === "/dashboard/signatures",
);

test("firmas es descubrible en el ciclo pertinente por roles operativos y de control", () => {
  expect(signatures).toBeDefined();
  const tenant = { type: "GSC" as const };
  for (const backendRole of [
    "ADMIN",
    "CAMPAIGN_MANAGER",
    "ZONE_COORDINATOR",
    "COMPLIANCE_OFFICER",
    "AUDITOR",
  ] as const) {
    expect(
      canAccessNavigationItem(
        signatures!,
        { role: UserRole.AdminCampana, backendRole },
        tenant,
      ),
    ).toBe(true);
  }
  expect(
    getVisibleNavigationItems(
      { role: UserRole.AdminCampana, backendRole: "ADMIN" },
      tenant,
      "SIGNATURE_COLLECTION",
    ).map(({ href }) => href),
  ).toContain("/dashboard/signatures");
});

test("firmas no se ofrece a voluntariado ni a ejercicio del cargo", () => {
  expect(
    canAccessNavigationItem(
      signatures!,
      { role: UserRole.Voluntario, backendRole: "VOLUNTEER" },
      { type: "CANDIDACY" },
    ),
  ).toBe(false);
  expect(
    canAccessNavigationItem(
      signatures!,
      { role: UserRole.AdminCampana, backendRole: "ADMIN" },
      { type: "PUBLIC_OFFICE" },
    ),
  ).toBe(false);
});

test("exploración no muestra una herramienta que exige expediente preelectoral", () => {
  expect(
    getVisibleNavigationItems(
      { role: UserRole.AdminCampana, backendRole: "ADMIN" },
      { type: "CANDIDACY" },
      "EXPLORATION",
    ).map(({ href }) => href),
  ).not.toContain("/dashboard/signatures");
});
