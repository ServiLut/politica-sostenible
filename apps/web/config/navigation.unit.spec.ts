import { expect, test } from "@playwright/test";
import {
  canAccessNavigationItem,
  dashboardConfig,
  getDefaultDashboardRoute,
  getNavigationGroupsForRole,
  getVisibleNavigationItems,
} from "./navigation";
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
    canAccessNavigationItem(item("/dashboard/war-room"), user, tenant, "ELECTION_DAY"),
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
    }, "ELECTION_DAY"),
  ).toBe(false);
});

test("la navegación usa lenguaje neutral y cuatro espacios de trabajo", () => {
  expect(dashboardConfig.map(({ title }) => title)).toEqual(
    expect.arrayContaining([
      "Personas",
      "Jornada territorial",
      "Bandeja operativa",
      "Operación electoral",
    ]),
  );
  expect(dashboardConfig.map(({ title }) => title)).not.toEqual(
    expect.arrayContaining(["Votantes", "Captura territorial", "Día D / E-14"]),
  );
  expect(
    [
      "ADMIN",
      "ZONE_COORDINATOR",
      "VOLUNTEER",
      "COMPLIANCE_OFFICER",
    ].map(
      (role) =>
        getNavigationGroupsForRole(role as Parameters<
          typeof getNavigationGroupsForRole
        >[0])[0].title,
    ),
  ).toEqual(["Dirección", "Coordinación", "Campo", "Revisión especializada"]);
});

test("la bandeja reemplaza duplicados del menú sin desautorizar sus rutas", () => {
  const user = {
    role: UserRole.AdminCampana,
    backendRole: "ADMIN" as const,
  };
  const tenant = { type: "CANDIDACY" as const };
  const visibleHrefs = getVisibleNavigationItems(user, tenant).map(
    ({ href }) => href,
  );

  expect(visibleHrefs).toContain("/dashboard/inbox");
  expect(visibleHrefs).not.toContain("/dashboard/incidents");
  expect(visibleHrefs).not.toContain("/dashboard/tasks");
  expect(visibleHrefs).not.toContain("/dashboard/war-room");
  expect(canAccessNavigationItem(item("/dashboard/incidents"), user, tenant)).toBe(
    true,
  );
  expect(canAccessNavigationItem(item("/dashboard/tasks"), user, tenant)).toBe(
    true,
  );
  expect(canAccessNavigationItem(item("/dashboard/war-room"), user, tenant, "ELECTION_DAY")).toBe(
    true,
  );
});

test("campo conserva sus acciones grandes y operación electoral solo aparece para roles dedicados", () => {
  const tenant = { type: "CANDIDACY" as const };
  const volunteerItems = getVisibleNavigationItems(
    {
      role: UserRole.Voluntario,
      backendRole: "VOLUNTEER",
    },
    tenant,
  );
  const witnessItems = getVisibleNavigationItems(
    {
      role: UserRole.Testigo,
      backendRole: "WITNESS",
    },
    tenant,
    "ELECTION_DAY"
  );

  expect(volunteerItems.map(({ title }) => title)).toEqual(
    expect.arrayContaining([
      "Jornada territorial",
      "Tareas y compromisos",
      "Agenda y eventos",
    ]),
  );
  expect(volunteerItems.map(({ href }) => href)).not.toContain(
    "/dashboard/war-room",
  );
  expect(witnessItems.map(({ href }) => href)).toContain("/dashboard/war-room");
});

test("cada rol abre primero su espacio de trabajo accionable", () => {
  expect(
    getDefaultDashboardRoute(
      {
        role: UserRole.AdminCampana,
        backendRole: "ADMIN",
      },
      { type: "CANDIDACY" },
    ),
  ).toBe("/dashboard/executive");
  expect(
    getDefaultDashboardRoute(
      {
        role: UserRole.Coordinador,
        backendRole: "CASE_WORKER",
      },
      { type: "PUBLIC_OFFICE" },
    ),
  ).toBe("/dashboard/inbox");
  expect(
    getDefaultDashboardRoute(
      {
        role: UserRole.GerenteFinanzas,
        backendRole: "FINANCE_MANAGER",
      },
      { type: "CANDIDACY" },
    ),
  ).toBe("/dashboard/finance");
  expect(
    getDefaultDashboardRoute(
      {
        role: UserRole.Testigo,
        backendRole: "WITNESS",
      },
      { type: "CANDIDACY" },
      "ELECTION_DAY"
    ),
  ).toBe("/dashboard/war-room");
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

test("war-room solo se muestra en las etapas permitidas", () => {
  const user = { role: UserRole.Testigo, backendRole: "WITNESS" as const };
  const tenant = { type: "CANDIDACY" as const };
  
  expect(getVisibleNavigationItems(user, tenant).some(i => i.href === "/dashboard/war-room")).toBe(false);
  expect(getVisibleNavigationItems(user, tenant, "PRE_CAMPAIGN").some(i => i.href === "/dashboard/war-room")).toBe(false);
  expect(getVisibleNavigationItems(user, tenant, "ELECTION_DAY").some(i => i.href === "/dashboard/war-room")).toBe(true);
});
