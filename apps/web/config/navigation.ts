import { BackendUserRole, Tenant, User, UserRole } from "../types/saas-schema";

export type NavigationGroupId =
  | "DIRECTION"
  | "COORDINATION"
  | "FIELD"
  | "REVIEW";

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
  | "settings"
  | "commitments";

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
  /**
   * Restringe solamente la aparicion en el menu. La autorizacion de la ruta
   * sigue dependiendo de allowedRoles/allowedBackendRoles en el layout y de
   * los guards de la API.
   */
  navigationBackendRoles?: BackendUserRole[];
  /**
   * Conserva una ruta especializada como respaldo para roles que no tienen
   * bandeja, sin duplicarla en el menu de quienes ya trabajan desde ella.
   */
  collapsedIntoInbox?: boolean;
  /** Stages during which this item should be visible in navigation. If omitted, the item is always visible. */
  allowedStages?: string[];
}

export const navigationGroups: ReadonlyArray<{
  id: NavigationGroupId;
  title: string;
}> = [
  { id: "DIRECTION", title: "Dirección" },
  { id: "COORDINATION", title: "Coordinación" },
  { id: "FIELD", title: "Campo" },
  { id: "REVIEW", title: "Revisión especializada" },
];

const PRIMARY_GROUP_BY_ROLE: Record<BackendUserRole, NavigationGroupId> = {
  ADMIN: "DIRECTION",
  CAMPAIGN_MANAGER: "DIRECTION",
  FINANCE_MANAGER: "REVIEW",
  COMMUNICATIONS_MANAGER: "COORDINATION",
  CONSTITUENT_SERVICES_MANAGER: "COORDINATION",
  CASE_WORKER: "COORDINATION",
  COMPLIANCE_OFFICER: "REVIEW",
  AUDITOR: "REVIEW",
  ZONE_COORDINATOR: "COORDINATION",
  WITNESS: "FIELD",
  VOLUNTEER: "FIELD",
};

const DEFAULT_ROUTE_PREFERENCES: Partial<
  Record<BackendUserRole, readonly string[]>
> = {
  FINANCE_MANAGER: ["/dashboard/finance"],
  COMMUNICATIONS_MANAGER: [
    "/dashboard/inbox",
    "/dashboard/communications",
  ],
  CONSTITUENT_SERVICES_MANAGER: ["/dashboard/inbox"],
  CASE_WORKER: ["/dashboard/inbox"],
  COMPLIANCE_OFFICER: ["/dashboard/inbox", "/dashboard/audit"],
  AUDITOR: ["/dashboard/audit", "/dashboard/inbox"],
  ZONE_COORDINATOR: [
    "/dashboard/inbox",
    "/dashboard/captura-territorial",
  ],
  WITNESS: ["/dashboard/war-room"],
  VOLUNTEER: [
    "/dashboard/captura-territorial",
    "/dashboard/tasks",
  ],
};

export function getNavigationGroupsForRole(role: BackendUserRole) {
  const primaryGroup = PRIMARY_GROUP_BY_ROLE[role];
  return [
    ...navigationGroups.filter((group) => group.id === primaryGroup),
    ...navigationGroups.filter((group) => group.id !== primaryGroup),
  ];
}

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
    group: "DIRECTION",
    allowedRoles: [UserRole.AdminCampana, UserRole.GerenteOps],
    allowedBackendRoles: ["ADMIN", "CAMPAIGN_MANAGER"],
    allowedTenantTypes: CAMPAIGN_TENANTS,
  },
  {
    title: "Incidentes y crisis",
    mobileTitle: "Crisis",
    href: "/dashboard/incidents",
    icon: "siren",
    group: "COORDINATION",
    allowedRoles: [
      UserRole.AdminCampana,
      UserRole.GerenteOps,
      UserRole.Auditor,
    ],
    allowedBackendRoles: ["ADMIN", "CAMPAIGN_MANAGER", "COMPLIANCE_OFFICER"],
    allowedTenantTypes: CAMPAIGN_TENANTS,
    collapsedIntoInbox: true,
  },
  {
    title: "Centro de gestión",
    mobileTitle: "Inicio",
    href: "/dashboard/public-office",
    icon: "publicOffice",
    group: "DIRECTION",
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
    title: "Jornada territorial",
    mobileTitle: "Jornada",
    href: "/dashboard/captura-territorial",
    icon: "relationships",
    group: "FIELD",
    allowedRoles: [UserRole.Coordinador, UserRole.Voluntario],
    allowedBackendRoles: ["ZONE_COORDINATOR", "VOLUNTEER"],
    allowedTenantTypes: CAMPAIGN_TENANTS,
  },
  {
    title: "Bandeja operativa",
    mobileTitle: "Bandeja",
    href: "/dashboard/inbox",
    icon: "cases",
    group: "COORDINATION",
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
        "ZONE_COORDINATOR",
        "COMMUNICATIONS_MANAGER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
      ],
      PARTY: [
        "ADMIN",
        "CAMPAIGN_MANAGER",
        "ZONE_COORDINATOR",
        "COMMUNICATIONS_MANAGER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
      ],
      GSC: [
        "ADMIN",
        "CAMPAIGN_MANAGER",
        "ZONE_COORDINATOR",
        "COMMUNICATIONS_MANAGER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
      ],
      PUBLIC_OFFICE: [
        "ADMIN",
        "CONSTITUENT_SERVICES_MANAGER",
        "CASE_WORKER",
        "COMMUNICATIONS_MANAGER",
        "COMPLIANCE_OFFICER",
        "AUDITOR",
      ],
    },
  },
  {
    title: "Territorio",
    mobileTitle: "Territorio",
    href: "/dashboard/territory",
    icon: "territory",
    group: "COORDINATION",
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
    title: "Personas",
    mobileTitle: "Personas",
    href: "/dashboard/votantes",
    icon: "relationships",
    group: "COORDINATION",
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
    group: "COORDINATION",
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
    collapsedIntoInbox: true,
  },
  {
    title: "Tareas y compromisos",
    mobileTitle: "Tareas",
    href: "/dashboard/tasks",
    icon: "tasks",
    group: "COORDINATION",
    allowedRoles: Object.values(UserRole),
    allowedBackendRoles: ALL_BACKEND_ROLES,
    allowedTenantTypes: ALL_TENANTS,
    collapsedIntoInbox: true,
  },
  {
    title: "Agenda y eventos",
    mobileTitle: "Agenda",
    href: "/dashboard/events",
    icon: "events",
    group: "COORDINATION",
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
    group: "DIRECTION",
    allowedRoles: [UserRole.AdminCampana],
    allowedBackendRoles: ["ADMIN"],
    allowedTenantTypes: ALL_TENANTS,
  },
  {
    title: "Aviso de privacidad",
    mobileTitle: "Privacidad",
    href: "/dashboard/settings",
    icon: "settings",
    group: "REVIEW",
    allowedRoles: [UserRole.AdminCampana, UserRole.Auditor],
    allowedBackendRoles: ["ADMIN", "COMPLIANCE_OFFICER"],
    allowedTenantTypes: ALL_TENANTS,
  },
  {
    title: "Aprobación de comunicaciones",
    mobileTitle: "Aprobación de comunicaciones",
    href: "/dashboard/communications",
    icon: "communications",
    group: "REVIEW",
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
    group: "REVIEW",
    allowedRoles: [UserRole.AdminCampana, UserRole.Auditor],
    allowedBackendRoles: ["ADMIN", "COMPLIANCE_OFFICER", "AUDITOR"],
    allowedTenantTypes: ALL_TENANTS,
  },
  {
    title: "Finanzas",
    mobileTitle: "Finanzas",
    href: "/dashboard/finance",
    icon: "finance",
    group: "REVIEW",
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
    title: "Operación electoral",
    mobileTitle: "Elección",
    href: "/dashboard/war-room",
    icon: "election",
    group: "FIELD",
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
    navigationBackendRoles: ["WITNESS", "COMPLIANCE_OFFICER", "AUDITOR"],
    allowedStages: ['ELECTION_PREPARATION', 'SIMULATION', 'ELECTION_DAY', 'POST_ELECTION'],
  },
  {
    title: "Programa político",
    mobileTitle: "Programa",
    href: "/dashboard/proposals",
    icon: "commitments",
    group: "DIRECTION",
    allowedRoles: Object.values(UserRole),
    allowedBackendRoles: ["ADMIN", "CAMPAIGN_MANAGER", "COMPLIANCE_OFFICER", "AUDITOR"],
    allowedTenantTypes: ["CANDIDACY", "PARTY"],
  },
];

export function canAccessNavigationItem(
  item: NavItem,
  user: Pick<User, "role" | "backendRole">,
  tenant: Pick<Tenant, "type">,
  stage?: string
) {
  const tenantSpecificRoles =
    item.allowedBackendRolesByTenantType?.[tenant.type];
  const hasStageAccess = !item.allowedStages || (stage && item.allowedStages.includes(stage));
  return (
    item.allowedRoles.includes(user.role) &&
    item.allowedBackendRoles.includes(user.backendRole) &&
    (!tenantSpecificRoles || tenantSpecificRoles.includes(user.backendRole)) &&
    item.allowedTenantTypes.includes(tenant.type) &&
    Boolean(hasStageAccess)
  );
}

export function matchesNavigationPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getVisibleNavigationItems(
  user: Pick<User, "role" | "backendRole">,
  tenant: Pick<Tenant, "type">,
  stage?: string
) {
  const accessibleItems = dashboardConfig.filter((item) =>
    canAccessNavigationItem(item, user, tenant, stage),
  );
  const hasOperationalInbox = accessibleItems.some(
    (item) => item.href === "/dashboard/inbox",
  );

  return accessibleItems.filter(
    (item) =>
      (!item.navigationBackendRoles ||
        item.navigationBackendRoles.includes(user.backendRole)) &&
      !(item.collapsedIntoInbox && hasOperationalInbox),
  );
}

export function getDefaultDashboardRoute(
  user: Pick<User, "role" | "backendRole">,
  tenant: Pick<Tenant, "type">,
  stage?: string
) {
  const visibleItems = getVisibleNavigationItems(user, tenant, stage);
  const preferredRoutes = DEFAULT_ROUTE_PREFERENCES[user.backendRole] ?? [];
  const preferredItem = preferredRoutes
    .map((href) => visibleItems.find((item) => item.href === href))
    .find((item): item is NavItem => Boolean(item));
  if (preferredItem) return preferredItem.href;

  const orderedGroups = getNavigationGroupsForRole(user.backendRole);
  return (
    orderedGroups
      .flatMap((group) =>
        visibleItems.filter((item) => item.group === group.id),
      )
      .at(0)?.href ?? "/"
  );
}
