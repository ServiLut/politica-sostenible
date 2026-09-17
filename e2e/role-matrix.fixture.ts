export type BackendRole =
  | "ADMIN"
  | "CAMPAIGN_MANAGER"
  | "FINANCE_MANAGER"
  | "COMMUNICATIONS_MANAGER"
  | "CONSTITUENT_SERVICES_MANAGER"
  | "CASE_WORKER"
  | "COMPLIANCE_OFFICER"
  | "AUDITOR"
  | "ZONE_COORDINATOR"
  | "WITNESS"
  | "VOLUNTEER";

export type FrontendRole =
  | "AdminCampana"
  | "GerenteFinanzas"
  | "GerenteOps"
  | "Coordinador"
  | "Voluntario"
  | "Testigo"
  | "Auditor";

export type TenantType =
  | "CANDIDACY"
  | "PARTY"
  | "GSC"
  | "PUBLIC_OFFICE";

export type OperationStage =
  | "EXPLORATION"
  | "PRE_CAMPAIGN"
  | "SIGNATURE_COLLECTION"
  | "CAMPAIGN"
  | "ELECTION_PREPARATION"
  | "SIMULATION"
  | "ELECTION_DAY"
  | "POST_ELECTION"
  | "CLOSED";

export const FRONTEND_ROLE_BY_BACKEND_ROLE = {
  ADMIN: "AdminCampana",
  CAMPAIGN_MANAGER: "GerenteOps",
  FINANCE_MANAGER: "GerenteFinanzas",
  COMMUNICATIONS_MANAGER: "GerenteOps",
  CONSTITUENT_SERVICES_MANAGER: "Coordinador",
  CASE_WORKER: "Coordinador",
  COMPLIANCE_OFFICER: "Auditor",
  AUDITOR: "Auditor",
  ZONE_COORDINATOR: "Coordinador",
  WITNESS: "Testigo",
  VOLUNTEER: "Voluntario",
} as const satisfies Record<BackendRole, FrontendRole>;

export const ROLE_LABEL_BY_BACKEND_ROLE = {
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
} as const satisfies Record<BackendRole, string>;

export const ALL_BACKEND_ROLES = Object.freeze([
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
] as const satisfies readonly BackendRole[]);

type RoleMatrixScenario = {
  id: string;
  backendRole: BackendRole;
  tenantType: TenantType;
  operationStage: OperationStage | null;
  workspace: "Dirección" | "Coordinación" | "Campo" | "Revisión especializada";
  defaultPath: string;
  allowedProbe: string;
  forbiddenProbe: string;
  visiblePaths: readonly string[];
};

export const ROLE_MATRIX_SCENARIOS = [
  {
    id: "admin-candidacy",
    backendRole: "ADMIN",
    tenantType: "CANDIDACY",
    operationStage: "ELECTION_DAY",
    workspace: "Dirección",
    defaultPath: "/dashboard/executive",
    allowedProbe: "/dashboard/team",
    forbiddenProbe: "/dashboard/public-office",
    visiblePaths: [
      "/dashboard/executive",
      "/dashboard/incidents",
      "/dashboard/inbox",
      "/dashboard/territory",
      "/dashboard/electoral-calendar",
      "/dashboard/signatures",
      "/dashboard/logistics",
      "/dashboard/witness-planning",
      "/dashboard/scrutiny",
      "/dashboard/electoral-catalog",
      "/dashboard/votantes",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/team",
      "/dashboard/operation-profile",
      "/dashboard/retention",
      "/dashboard/settings",
      "/dashboard/communications",
      "/dashboard/audit",
      "/dashboard/finance",
      "/dashboard/integrity-signatures",
      "/dashboard/war-room",
      "/dashboard/proposals",
      "/dashboard/billing",
    ],
  },
  {
    id: "admin-public-office",
    backendRole: "ADMIN",
    tenantType: "PUBLIC_OFFICE",
    operationStage: null,
    workspace: "Dirección",
    defaultPath: "/dashboard/public-office",
    allowedProbe: "/dashboard/team",
    forbiddenProbe: "/dashboard/war-room",
    visiblePaths: [
      "/dashboard/public-office",
      "/dashboard/inbox",
      "/dashboard/cases",
      "/dashboard/pqrsd",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/team",
      "/dashboard/settings",
      "/dashboard/communications",
      "/dashboard/audit",
      "/dashboard/billing",
    ],
  },
  {
    id: "campaign-manager",
    backendRole: "CAMPAIGN_MANAGER",
    tenantType: "CANDIDACY",
    operationStage: "ELECTION_DAY",
    workspace: "Dirección",
    defaultPath: "/dashboard/executive",
    allowedProbe: "/dashboard/executive",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/executive",
      "/dashboard/incidents",
      "/dashboard/inbox",
      "/dashboard/territory",
      "/dashboard/electoral-calendar",
      "/dashboard/signatures",
      "/dashboard/logistics",
      "/dashboard/witness-planning",
      "/dashboard/scrutiny",
      "/dashboard/votantes",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/operation-profile",
      "/dashboard/communications",
      "/dashboard/finance",
      "/dashboard/integrity-signatures",
      "/dashboard/war-room",
      "/dashboard/proposals",
    ],
  },
  {
    id: "finance-manager",
    backendRole: "FINANCE_MANAGER",
    tenantType: "CANDIDACY",
    operationStage: "ELECTION_DAY",
    workspace: "Revisión especializada",
    defaultPath: "/dashboard/finance",
    allowedProbe: "/dashboard/finance",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/electoral-calendar",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/operation-profile",
      "/dashboard/finance",
      "/dashboard/integrity-signatures",
    ],
  },
  {
    id: "communications-candidacy",
    backendRole: "COMMUNICATIONS_MANAGER",
    tenantType: "CANDIDACY",
    operationStage: "ELECTION_DAY",
    workspace: "Coordinación",
    defaultPath: "/dashboard/inbox",
    allowedProbe: "/dashboard/communications",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/inbox",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/operation-profile",
      "/dashboard/communications",
    ],
  },
  {
    id: "communications-public-office",
    backendRole: "COMMUNICATIONS_MANAGER",
    tenantType: "PUBLIC_OFFICE",
    operationStage: null,
    workspace: "Coordinación",
    defaultPath: "/dashboard/inbox",
    allowedProbe: "/dashboard/communications",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/inbox",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/communications",
    ],
  },
  {
    id: "constituent-services-manager",
    backendRole: "CONSTITUENT_SERVICES_MANAGER",
    tenantType: "PUBLIC_OFFICE",
    operationStage: null,
    workspace: "Coordinación",
    defaultPath: "/dashboard/inbox",
    allowedProbe: "/dashboard/cases",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/public-office",
      "/dashboard/inbox",
      "/dashboard/cases",
      "/dashboard/pqrsd",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/communications",
    ],
  },
  {
    id: "case-worker",
    backendRole: "CASE_WORKER",
    tenantType: "PUBLIC_OFFICE",
    operationStage: null,
    workspace: "Coordinación",
    defaultPath: "/dashboard/public-office",
    allowedProbe: "/dashboard/pqrsd",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/public-office",
      "/dashboard/inbox",
      "/dashboard/cases",
      "/dashboard/pqrsd",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/communications",
    ],
  },
  {
    id: "compliance-candidacy",
    backendRole: "COMPLIANCE_OFFICER",
    tenantType: "CANDIDACY",
    operationStage: "ELECTION_DAY",
    workspace: "Revisión especializada",
    defaultPath: "/dashboard/inbox",
    allowedProbe: "/dashboard/settings",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/incidents",
      "/dashboard/inbox",
      "/dashboard/territory",
      "/dashboard/electoral-calendar",
      "/dashboard/signatures",
      "/dashboard/logistics",
      "/dashboard/witness-planning",
      "/dashboard/scrutiny",
      "/dashboard/electoral-catalog",
      "/dashboard/votantes",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/operation-profile",
      "/dashboard/retention",
      "/dashboard/settings",
      "/dashboard/communications",
      "/dashboard/audit",
      "/dashboard/finance",
      "/dashboard/integrity-signatures",
      "/dashboard/war-room",
      "/dashboard/proposals",
    ],
  },
  {
    id: "compliance-public-office",
    backendRole: "COMPLIANCE_OFFICER",
    tenantType: "PUBLIC_OFFICE",
    operationStage: null,
    workspace: "Revisión especializada",
    defaultPath: "/dashboard/inbox",
    allowedProbe: "/dashboard/settings",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/public-office",
      "/dashboard/inbox",
      "/dashboard/cases",
      "/dashboard/pqrsd",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/settings",
      "/dashboard/communications",
      "/dashboard/audit",
    ],
  },
  {
    id: "auditor-candidacy",
    backendRole: "AUDITOR",
    tenantType: "CANDIDACY",
    operationStage: "ELECTION_DAY",
    workspace: "Revisión especializada",
    defaultPath: "/dashboard/audit",
    allowedProbe: "/dashboard/audit",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/incidents",
      "/dashboard/inbox",
      "/dashboard/territory",
      "/dashboard/electoral-calendar",
      "/dashboard/signatures",
      "/dashboard/logistics",
      "/dashboard/witness-planning",
      "/dashboard/scrutiny",
      "/dashboard/electoral-catalog",
      "/dashboard/votantes",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/operation-profile",
      "/dashboard/retention",
      "/dashboard/communications",
      "/dashboard/audit",
      "/dashboard/finance",
      "/dashboard/integrity-signatures",
      "/dashboard/war-room",
      "/dashboard/proposals",
    ],
  },
  {
    id: "auditor-public-office",
    backendRole: "AUDITOR",
    tenantType: "PUBLIC_OFFICE",
    operationStage: null,
    workspace: "Revisión especializada",
    defaultPath: "/dashboard/audit",
    allowedProbe: "/dashboard/audit",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/public-office",
      "/dashboard/inbox",
      "/dashboard/cases",
      "/dashboard/pqrsd",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/communications",
      "/dashboard/audit",
    ],
  },
  {
    id: "zone-coordinator",
    backendRole: "ZONE_COORDINATOR",
    tenantType: "CANDIDACY",
    operationStage: "ELECTION_DAY",
    workspace: "Coordinación",
    defaultPath: "/dashboard/inbox",
    allowedProbe: "/dashboard/captura-territorial",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/captura-territorial",
      "/dashboard/inbox",
      "/dashboard/territory",
      "/dashboard/electoral-calendar",
      "/dashboard/signatures",
      "/dashboard/logistics",
      "/dashboard/witness-planning",
      "/dashboard/scrutiny",
      "/dashboard/votantes",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/operation-profile",
      "/dashboard/integrity-signatures",
      "/dashboard/war-room",
    ],
  },
  {
    id: "witness",
    backendRole: "WITNESS",
    tenantType: "CANDIDACY",
    operationStage: "ELECTION_DAY",
    workspace: "Campo",
    defaultPath: "/dashboard/war-room",
    allowedProbe: "/dashboard/war-room",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/electoral-calendar",
      "/dashboard/witness-planning",
      "/dashboard/scrutiny",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/operation-profile",
      "/dashboard/integrity-signatures",
      "/dashboard/war-room",
    ],
  },
  {
    id: "volunteer",
    backendRole: "VOLUNTEER",
    tenantType: "CANDIDACY",
    operationStage: "ELECTION_DAY",
    workspace: "Campo",
    defaultPath: "/dashboard/captura-territorial",
    allowedProbe: "/dashboard/captura-territorial",
    forbiddenProbe: "/dashboard/team",
    visiblePaths: [
      "/dashboard/captura-territorial",
      "/dashboard/tasks",
      "/dashboard/events",
      "/dashboard/operation-profile",
    ],
  },
] as const satisfies readonly RoleMatrixScenario[];

export function assertRoleMatrixFixtureIsComplete() {
  const coveredRoles = new Set(
    ROLE_MATRIX_SCENARIOS.map(({ backendRole }) => backendRole),
  );
  const missingRoles = ALL_BACKEND_ROLES.filter(
    (backendRole) => !coveredRoles.has(backendRole),
  );
  const duplicatedScenarioIds = ROLE_MATRIX_SCENARIOS.map(({ id }) => id).filter(
    (id, index, values) => values.indexOf(id) !== index,
  );

  if (missingRoles.length > 0 || duplicatedScenarioIds.length > 0) {
    throw new Error(
      `Matriz de roles inválida: faltantes=${missingRoles.join(",") || "ninguno"}; idsDuplicados=${duplicatedScenarioIds.join(",") || "ninguno"}`,
    );
  }
}
