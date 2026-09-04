import { expect, test } from "@playwright/test";
import { canAccessNavigationItem, dashboardConfig } from "./navigation";
import { UserRole } from "../types/saas-schema";

function item(href: string) {
  const result = dashboardConfig.find((candidate) => candidate.href === href);
  if (!result) throw new Error(`Ruta no configurada: ${href}`);
  return result;
}

test("cumplimiento puede conciliar E-14 pero no administrar accesos", () => {
  const user = {
    role: UserRole.Auditor,
    backendRole: "COMPLIANCE_OFFICER" as const,
  };
  const tenant = { type: "CANDIDACY" as const };

  expect(
    canAccessNavigationItem(item("/dashboard/war-room"), user, tenant),
  ).toBe(true);
  expect(canAccessNavigationItem(item("/dashboard/team"), user, tenant)).toBe(
    false,
  );
});

test("una organización de gestión pública nunca muestra operación E-14", () => {
  const user = {
    role: UserRole.AdminCampana,
    backendRole: "ADMIN" as const,
  };

  expect(
    canAccessNavigationItem(item("/dashboard/war-room"), user, {
      type: "PUBLIC_OFFICE",
    }),
  ).toBe(false);
});

test("administracion configura privacidad y cumplimiento puede verificarla", () => {
  const tenant = { type: "CANDIDACY" as const };
  const privacy = item("/dashboard/settings");

  expect(
    canAccessNavigationItem(
      privacy,
      {
        role: UserRole.AdminCampana,
        backendRole: "ADMIN" as const,
      },
      tenant,
    ),
  ).toBe(true);
  expect(
    canAccessNavigationItem(
      privacy,
      {
        role: UserRole.Auditor,
        backendRole: "COMPLIANCE_OFFICER" as const,
      },
      tenant,
    ),
  ).toBe(true);
  expect(
    canAccessNavigationItem(
      privacy,
      {
        role: UserRole.Voluntario,
        backendRole: "VOLUNTEER" as const,
      },
      tenant,
    ),
  ).toBe(false);
});
