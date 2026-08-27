import { BackendUserRole, Tenant, User, UserRole } from "../types/saas-schema";

export interface NavItem {
  title: string;
  href: string;
  icon?: string;
  allowedRoles: UserRole[];
  allowedBackendRoles: BackendUserRole[];
  allowedTenantTypes: Tenant["type"][];
  allowedBackendRolesByTenantType?: Partial<
    Record<Tenant["type"], BackendUserRole[]>
  >;
}

const CAMPAIGN_TENANTS: Tenant["type"][] = ["CANDIDACY", "PARTY", "GSC"];
const ALL_TENANTS: Tenant["type"][] = [...CAMPAIGN_TENANTS, "PUBLIC_OFFICE"];
const ALL_BACKEND_ROLES: BackendUserRole[] = [
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
];

export const dashboardConfig: NavItem[] = [
  {
    title: "Centro de comando",
    href: "/dashboard/executive",
    allowedRoles: [UserRole.AdminCampana, UserRole.GerenteOps],
    allowedBackendRoles: ["ADMIN", "CAMPAIGN_MANAGER"],
    allowedTenantTypes: CAMPAIGN_TENANTS,
  },
  {
    title: "Incidentes y crisis",
    href: "/dashboard/incidents",
    allowedRoles: [
      UserRole.AdminCampana,
      UserRole.GerenteOps,
      UserRole.Auditor,
    ],
    allowedBackendRoles: ["ADMIN", "CAMPAIGN_MANAGER", "COMPLIANCE_OFFICER"],
    allowedTenantTypes: CAMPAIGN_TENANTS,
  },
  {
    title: "Centro de gestión",
    href: "/dashboard/public-office",
    allowedRoles: [
      UserRole.AdminCampana,
      UserRole.Coordinador,
      UserRole.Auditor,
    ],
    allowedBackendRoles: [
      "ADMIN",
      "CONSTITUENT_SERVICES_MANAGER",
      "CASE_WORKER",
      "COMPLIANCE_OFFICER",
      "AUDITOR",
    ],
    allowedTenantTypes: ["PUBLIC_OFFICE"],
  },
  {
    title: "Territorio",
    href: "/dashboard/territory",
    allowedRoles: [
      UserRole.AdminCampana,
      UserRole.GerenteOps,
      UserRole.Coordinador,
      UserRole.Auditor,
    ],
    allowedBackendRoles: [
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "ZONE_COORDINATOR",
      "COMPLIANCE_OFFICER",
      "AUDITOR",
    ],
    allowedTenantTypes: CAMPAIGN_TENANTS,
  },
  {
    title: "Relacionamiento",
    href: "/dashboard/votantes",
    allowedRoles: [
      UserRole.AdminCampana,
      UserRole.GerenteOps,
      UserRole.Coordinador,
      UserRole.Auditor,
    ],
    allowedBackendRoles: [
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "ZONE_COORDINATOR",
      "COMPLIANCE_OFFICER",
      "AUDITOR",
    ],
    allowedTenantTypes: CAMPAIGN_TENANTS,
  },
  {
    title: "Atención ciudadana",
    href: "/dashboard/cases",
    allowedRoles: [
      UserRole.AdminCampana,
      UserRole.Coordinador,
      UserRole.Auditor,
    ],
    allowedBackendRoles: [
      "ADMIN",
      "CONSTITUENT_SERVICES_MANAGER",
      "CASE_WORKER",
      "COMPLIANCE_OFFICER",
      "AUDITOR",
    ],
    allowedTenantTypes: ["PUBLIC_OFFICE"],
  },
  {
    title: "Tareas y compromisos",
    href: "/dashboard/tasks",
    allowedRoles: Object.values(UserRole),
    allowedBackendRoles: ALL_BACKEND_ROLES,
    allowedTenantTypes: ALL_TENANTS,
  },
  {
    title: "Agenda y eventos",
    href: "/dashboard/events",
    allowedRoles: Object.values(UserRole),
    allowedBackendRoles: ALL_BACKEND_ROLES,
    allowedTenantTypes: ALL_TENANTS,
    allowedBackendRolesByTenantType: {
      CANDIDACY: [
        "ADMIN",
        "CAMPAIGN_MANAGER",
        "FINANCE_MANAGER",
        "COMMUNICATIONS_MANAGER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
        "ZONE_COORDINATOR",
        "WITNESS",
        "VOLUNTEER",
      ],
      PARTY: [
        "ADMIN",
        "CAMPAIGN_MANAGER",
        "FINANCE_MANAGER",
        "COMMUNICATIONS_MANAGER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
        "ZONE_COORDINATOR",
        "WITNESS",
        "VOLUNTEER",
      ],
      GSC: [
        "ADMIN",
        "CAMPAIGN_MANAGER",
        "FINANCE_MANAGER",
        "COMMUNICATIONS_MANAGER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
        "ZONE_COORDINATOR",
        "WITNESS",
        "VOLUNTEER",
      ],
      PUBLIC_OFFICE: [
        "ADMIN",
        "CONSTITUENT_SERVICES_MANAGER",
        "COMMUNICATIONS_MANAGER",
        "CASE_WORKER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
      ],
    },
  },
  {
    title: "Equipo y accesos",
    href: "/dashboard/team",
    allowedRoles: [UserRole.AdminCampana],
    allowedBackendRoles: ["ADMIN"],
    allowedTenantTypes: ALL_TENANTS,
  },
  {
    title: "Comunicaciones",
    href: "/dashboard/communications",
    allowedRoles: [
      UserRole.AdminCampana,
      UserRole.GerenteOps,
      UserRole.Coordinador,
      UserRole.Auditor,
    ],
    allowedBackendRoles: [
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "COMMUNICATIONS_MANAGER",
      "CONSTITUENT_SERVICES_MANAGER",
      "CASE_WORKER",
      "COMPLIANCE_OFFICER",
      "AUDITOR",
    ],
    allowedTenantTypes: ALL_TENANTS,
    allowedBackendRolesByTenantType: {
      CANDIDACY: [
        "ADMIN",
        "CAMPAIGN_MANAGER",
        "COMMUNICATIONS_MANAGER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
      ],
      PARTY: [
        "ADMIN",
        "CAMPAIGN_MANAGER",
        "COMMUNICATIONS_MANAGER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
      ],
      GSC: [
        "ADMIN",
        "CAMPAIGN_MANAGER",
        "COMMUNICATIONS_MANAGER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
      ],
      PUBLIC_OFFICE: [
        "ADMIN",
        "CONSTITUENT_SERVICES_MANAGER",
        "COMMUNICATIONS_MANAGER",
        "CASE_WORKER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
      ],
    },
  },
  {
    title: "Auditoría",
    href: "/dashboard/audit",
    allowedRoles: [UserRole.AdminCampana, UserRole.Auditor],
    allowedBackendRoles: ["ADMIN", "COMPLIANCE_OFFICER", "AUDITOR"],
    allowedTenantTypes: ALL_TENANTS,
  },
  {
    title: "Finanzas",
    href: "/dashboard/finance",
    allowedRoles: [
      UserRole.AdminCampana,
      UserRole.GerenteOps,
      UserRole.GerenteFinanzas,
      UserRole.Auditor,
    ],
    allowedBackendRoles: [
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "FINANCE_MANAGER",
      "COMPLIANCE_OFFICER",
      "AUDITOR",
    ],
    allowedTenantTypes: CAMPAIGN_TENANTS,
  },
  {
    title: "Día D / E-14",
    href: "/dashboard/war-room",
    allowedRoles: [
      UserRole.AdminCampana,
      UserRole.GerenteOps,
      UserRole.Coordinador,
      UserRole.Testigo,
      UserRole.Auditor,
    ],
    allowedBackendRoles: [
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "ZONE_COORDINATOR",
      "WITNESS",
      "AUDITOR",
    ],
    allowedTenantTypes: CAMPAIGN_TENANTS,
  },
];

export function canAccessNavigationItem(
  item: NavItem,
  user: Pick<User, "role" | "backendRole">,
  tenant: Pick<Tenant, "type">,
) {
  const tenantSpecificRoles =
    item.allowedBackendRolesByTenantType?.[tenant.type];
  return (
    item.allowedRoles.includes(user.role) &&
    item.allowedBackendRoles.includes(user.backendRole) &&
    (!tenantSpecificRoles || tenantSpecificRoles.includes(user.backendRole)) &&
    item.allowedTenantTypes.includes(tenant.type)
  );
}

export function matchesNavigationPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getDefaultDashboardRoute(
  user: Pick<User, "role" | "backendRole">,
  tenant: Pick<Tenant, "type">,
) {
  return (
    dashboardConfig.find((item) => canAccessNavigationItem(item, user, tenant))
      ?.href ?? "/"
  );
}
