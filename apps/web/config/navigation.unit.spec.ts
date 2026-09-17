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

test("partidos y grupos ciudadanos no acceden al consolidado de candidatura", () => {
  const user = {
    role: UserRole.Testigo,
    backendRole: "WITNESS" as const,
  };
  const warRoom = item("/dashboard/war-room");

  for (const type of ["PARTY", "GSC"] as const) {
    const tenant = { type };
    expect(canAccessNavigationItem(warRoom, user, tenant)).toBe(false);
    expect(
      getVisibleNavigationItems(user, tenant, "ELECTION_DAY").map(
        ({ href }) => href,
      ),
    ).not.toContain("/dashboard/war-room");
  }
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
    ["ADMIN", "ZONE_COORDINATOR", "VOLUNTEER", "COMPLIANCE_OFFICER"].map(
      (role) =>
        getNavigationGroupsForRole(
          role as Parameters<typeof getNavigationGroupsForRole>[0],
        )[0].title,
    ),
  ).toEqual(["Dirección", "Coordinación", "Campo", "Revisión especializada"]);
});

test("dirección descubre la operación electoral cuando la etapa la habilita", () => {
  const user = {
    role: UserRole.AdminCampana,
    backendRole: "ADMIN" as const,
  };
  const tenant = { type: "CANDIDACY" as const };
  const campaignHrefs = getVisibleNavigationItems(user, tenant, "CAMPAIGN").map(
    ({ href }) => href,
  );
  const preparationHrefs = getVisibleNavigationItems(
    user,
    tenant,
    "ELECTION_PREPARATION",
  ).map(({ href }) => href);

  expect(campaignHrefs).toContain("/dashboard/inbox");
  expect(campaignHrefs).toContain("/dashboard/incidents");
  expect(campaignHrefs).toContain("/dashboard/tasks");
  expect(campaignHrefs).not.toContain("/dashboard/war-room");
  expect(preparationHrefs).toContain("/dashboard/war-room");
  expect(
    canAccessNavigationItem(item("/dashboard/incidents"), user, tenant),
  ).toBe(true);
  expect(canAccessNavigationItem(item("/dashboard/tasks"), user, tenant)).toBe(
    true,
  );
  expect(
    canAccessNavigationItem(item("/dashboard/war-room"), user, tenant),
  ).toBe(true);
});

test("auditoría mantiene visible el acceso a incidentes para revisión", () => {
  const user = {
    role: UserRole.Auditor,
    backendRole: "AUDITOR" as const,
  };
  const tenant = { type: "CANDIDACY" as const };

  expect(
    canAccessNavigationItem(item("/dashboard/incidents"), user, tenant),
  ).toBe(true);
  expect(
    getVisibleNavigationItems(user, tenant).map(({ href }) => href),
  ).toContain("/dashboard/incidents");
});

test("comunicaciones y coordinación pueden iniciar tareas desde la navegación", () => {
  const tenant = { type: "CANDIDACY" as const };

  for (const backendRole of [
    "COMMUNICATIONS_MANAGER",
    "ZONE_COORDINATOR",
  ] as const) {
    expect(
      getVisibleNavigationItems(
        { role: UserRole.AdminCampana, backendRole },
        tenant,
      ).map(({ href }) => href),
    ).toContain("/dashboard/tasks");
  }
});

test("gestión pública mantiene visibles casos y tareas junto a la bandeja", () => {
  const visibleHrefs = getVisibleNavigationItems(
    {
      role: UserRole.AdminCampana,
      backendRole: "CONSTITUENT_SERVICES_MANAGER",
    },
    { type: "PUBLIC_OFFICE" },
  ).map(({ href }) => href);

  expect(visibleHrefs).toEqual(
    expect.arrayContaining([
      "/dashboard/inbox",
      "/dashboard/cases",
      "/dashboard/tasks",
    ]),
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
    "ELECTION_DAY",
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
  ).toBe("/dashboard/public-office");
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
      "ELECTION_DAY",
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

test("todos los roles de campaña pueden consultar el perfil operativo sin exponerlo a gestión pública", () => {
  const operationProfile = item("/dashboard/operation-profile");
  const backendRoles = [
    "ADMIN",
    "CAMPAIGN_MANAGER",
    "FINANCE_MANAGER",
    "COMMUNICATIONS_MANAGER",
    "CONSTITUENT_SERVICES_MANAGER",
    "CASE_WORKER",
    "COMPLIANCE_OFFICER",
    "AUDITOR",
    "ZONE_COORDINATOR",
    "WITNESS",
    "VOLUNTEER",
  ] as const;

  for (const backendRole of backendRoles) {
    expect(
      canAccessNavigationItem(
        { ...operationProfile },
        { role: UserRole.AdminCampana, backendRole },
        { type: "CANDIDACY" },
      ),
    ).toBe(true);
  }

  expect(
    canAccessNavigationItem(
      operationProfile,
      { role: UserRole.AdminCampana, backendRole: "ADMIN" },
      { type: "PUBLIC_OFFICE" },
    ),
  ).toBe(false);
});

test("war-room solo se muestra en las etapas permitidas", () => {
  const user = { role: UserRole.Testigo, backendRole: "WITNESS" as const };
  const tenant = { type: "CANDIDACY" as const };

  expect(
    getVisibleNavigationItems(user, tenant).some(
      (i) => i.href === "/dashboard/war-room",
    ),
  ).toBe(false);
  expect(
    getVisibleNavigationItems(user, tenant, "PRE_CAMPAIGN").some(
      (i) => i.href === "/dashboard/war-room",
    ),
  ).toBe(false);
  expect(
    getVisibleNavigationItems(user, tenant, "ELECTION_DAY").some(
      (i) => i.href === "/dashboard/war-room",
    ),
  ).toBe(true);
  expect(
    getVisibleNavigationItems(user, tenant, "CLOSED").some(
      (i) => i.href === "/dashboard/war-room",
    ),
  ).toBe(true);
});

test("el expediente de cierre solo aparece después de la elección y para control especializado", () => {
  const tenant = { type: "CANDIDACY" as const };
  const admin = {
    role: UserRole.AdminCampana,
    backendRole: "ADMIN" as const,
  };
  const volunteer = {
    role: UserRole.Voluntario,
    backendRole: "VOLUNTEER" as const,
  };
  const closeout = item("/dashboard/transition");

  expect(
    getVisibleNavigationItems(admin, tenant, "ELECTION_DAY").map(
      ({ href }) => href,
    ),
  ).not.toContain(closeout.href);
  expect(
    getVisibleNavigationItems(admin, tenant, "POST_ELECTION").map(
      ({ href }) => href,
    ),
  ).toContain(closeout.href);
  expect(
    getVisibleNavigationItems(admin, tenant, "CLOSED").map(({ href }) => href),
  ).toContain(closeout.href);
  expect(canAccessNavigationItem(closeout, volunteer, tenant)).toBe(false);
  expect(
    canAccessNavigationItem(closeout, admin, { type: "PUBLIC_OFFICE" }),
  ).toBe(false);
});

test("el catálogo electoral queda limitado a revisión especializada de organizaciones de campaña", () => {
  const catalog = item("/dashboard/electoral-catalog");
  const tenant = { type: "CANDIDACY" as const };

  for (const backendRole of [
    "ADMIN",
    "COMPLIANCE_OFFICER",
    "AUDITOR",
  ] as const) {
    expect(
      canAccessNavigationItem(
        catalog,
        {
          role:
            backendRole === "ADMIN" ? UserRole.AdminCampana : UserRole.Auditor,
          backendRole,
        },
        tenant,
      ),
    ).toBe(true);
  }

  expect(
    canAccessNavigationItem(
      catalog,
      { role: UserRole.GerenteOps, backendRole: "CAMPAIGN_MANAGER" },
      tenant,
    ),
  ).toBe(false);
  expect(
    canAccessNavigationItem(
      catalog,
      { role: UserRole.AdminCampana, backendRole: "ADMIN" },
      { type: "PUBLIC_OFFICE" },
    ),
  ).toBe(false);
});
