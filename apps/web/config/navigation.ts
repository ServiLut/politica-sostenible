import { BackendUserRole, Tenant, User, UserRole } from "../types/saas-schema";

export type NavigationGroupId =
  | "OPERATE"
  | "RELATIONSHIPS"
  | "CONTROL"
  | "ORGANIZATION";

export type NavigationIcon =
  | "dashboard"
  | "siren"
  | "publicOffice"
  | "territory"
  | "relationships"
  | "cases"
  | "tasks"
  | "events"
  | "team"
  | "communications"
  | "audit"
  | "finance"
  | "election"
  | "settings";

export interface NavItem {
  title: string;
  mobileTitle: string;
  href: string;
  icon: NavigationIcon;
  group: NavigationGroupId;
  allowedRoles: UserRole[];
  allowedBackendRoles: BackendUserRole[];
  allowedTenantTypes: Tenant["type"][];
  allowedBackendRolesByTenantType?: Partial<
    Record<Tenant["type"], BackendUserRole[]>
  >;
}

export const navigationGroups: ReadonlyArray<{
  id: NavigationGroupId;
  title: string;
}> = [
  { id: "OPERATE", title: "Operar hoy" },
  { id: "RELATIONSHIPS", title: "Territorio y relaciones" },
  { id: "CONTROL", title: "Control y evidencia" },
  { id: "ORGANIZATION", title: "Organización" },
];

const BACKEND_ROLE_LABELS: Record<BackendUserRole, string> = {
  ADMIN: "Administración",
  CAMPAIGN_MANAGER: "Gerencia de campaña",
  FINANCE_MANAGER: "Gerencia financiera",
  COMMUNICATIONS_MANAGER: "Comunicaciones",
  CONSTITUENT_SERVICES_MANAGER: "Dirección de atención ciudadana",
  CASE_WORKER: "Gestión de casos",
  COMPLIANCE_OFFICER: "Cumplimiento",
  AUDITOR: "Auditoría",
  ZONE_COORDINATOR: "Coordinación territorial",
  WITNESS: "Testigo electoral",
  VOLUNTEER: "Voluntariado",
};

const TENANT_TYPE_LABELS: Record<Tenant["type"], string> = {
  CANDIDACY: "Candidatura",
  PARTY: "Partido o movimiento",
  GSC: "Grupo ciudadano",
  PUBLIC_OFFICE: "Ejercicio del cargo",
};

export function getRoleLabel(role: BackendUserRole) {
  return BACKEND_ROLE_LABELS[role];
}

export function getTenantTypeLabel(type: Tenant["type"]) {
  return TENANT_TYPE_LABELS[type];
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
    mobileTitle: "Inicio",
    href: "/dashboard/executive",
    icon: "dashboard",
    group: "OPERATE",
    allowedRoles: [UserRole.AdminCampana, UserRole.GerenteOps],
    allowedBackendRoles: ["ADMIN", "CAMPAIGN_MANAGER"],
    allowedTenantTypes: CAMPAIGN_TENANTS,
  },
  {
    title: "Incidentes y crisis",
    mobileTitle: "Crisis",
    href: "/dashboard/incidents",
    icon: "siren",
    group: "OPERATE",
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
    mobileTitle: "Inicio",
    href: "/dashboard/public-office",
    icon: "publicOffice",
    group: "OPERATE",
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
    title: "Captura territorial",
    mobileTitle: "Capturar",
    href: "/dashboard/captura-territorial",
    icon: "relationships",
    group: "OPERATE",
    allowedRoles: [UserRole.Coordinador, UserRole.Voluntario],
    allowedBackendRoles: ["ZONE_COORDINATOR", "VOLUNTEER"],
    allowedTenantTypes: CAMPAIGN_TENANTS,
  },
  {
    title: "Territorio",
    mobileTitle: "Territorio",
    href: "/dashboard/territory",
    icon: "territory",
    group: "RELATIONSHIPS",
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
    mobileTitle: "Personas",
    href: "/dashboard/votantes",
    icon: "relationships",
    group: "RELATIONSHIPS",
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
    mobileTitle: "Atención",
    href: "/dashboard/cases",
    icon: "cases",
    group: "OPERATE",
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
    mobileTitle: "Tareas",
    href: "/dashboard/tasks",
    icon: "tasks",
    group: "OPERATE",
    allowedRoles: Object.values(UserRole),
    allowedBackendRoles: ALL_BACKEND_ROLES,
    allowedTenantTypes: ALL_TENANTS,
  },
  {
    title: "Agenda y eventos",
    mobileTitle: "Agenda",
    href: "/dashboard/events",
    icon: "events",
    group: "OPERATE",
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
    mobileTitle: "Equipo",
    href: "/dashboard/team",
    icon: "team",
    group: "ORGANIZATION",
    allowedRoles: [UserRole.AdminCampana],
    allowedBackendRoles: ["ADMIN"],
    allowedTenantTypes: ALL_TENANTS,
  },
  {
    title: "Aviso de privacidad",
    mobileTitle: "Privacidad",
    href: "/dashboard/settings",
    icon: "settings",
    group: "ORGANIZATION",
    allowedRoles: [UserRole.AdminCampana, UserRole.Auditor],
    allowedBackendRoles: ["ADMIN", "COMPLIANCE_OFFICER"],
    allowedTenantTypes: ALL_TENANTS,
  },
  {
    title: "Aprobación de comunicaciones",
    mobileTitle: "Aprobación de comunicaciones",
    href: "/dashboard/communications",
    icon: "communications",
    group: "RELATIONSHIPS",
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
    mobileTitle: "Auditoría",
    href: "/dashboard/audit",
    icon: "audit",
    group: "CONTROL",
    allowedRoles: [UserRole.AdminCampana, UserRole.Auditor],
    allowedBackendRoles: ["ADMIN", "COMPLIANCE_OFFICER", "AUDITOR"],
    allowedTenantTypes: ALL_TENANTS,
  },
  {
    title: "Finanzas",
    mobileTitle: "Finanzas",
    href: "/dashboard/finance",
    icon: "finance",
    group: "CONTROL",
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
    mobileTitle: "E-14",
    href: "/dashboard/war-room",
    icon: "election",
    group: "CONTROL",
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
      "COMPLIANCE_OFFICER",
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
