import type { BackendUserRole } from "@/types/saas-schema";

export interface RoleActionGuidance {
  linkLabel: "Configurar" | "Consultar" | "Resolver" | "Revisar" | null;
  advice: string | null;
}

const ACTIVATION_RESOLVERS: Readonly<
  Record<string, { roles: ReadonlySet<BackendUserRole>; advice: string }>
> = {
  TERRITORY_BASE: {
    roles: new Set(["ADMIN"]),
    advice: "Solicita a Administración que cargue la base territorial.",
  },
  TEAM_READY: {
    roles: new Set(["ADMIN"]),
    advice: "Solicita a Administración que asigne el equipo inicial.",
  },
  FIRST_CONSENTED_RELATIONSHIP: {
    roles: new Set([
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "ZONE_COORDINATOR",
      "VOLUNTEER",
    ]),
    advice: "Solicita a un rol de captura que registre el vínculo autorizado.",
  },
  FINANCE_LIMITS: {
    roles: new Set(["ADMIN", "CAMPAIGN_MANAGER", "FINANCE_MANAGER"]),
    advice:
      "Solicita a Administración o Gerencia financiera que complete el expediente.",
  },
  FIRST_CASE: {
    roles: new Set([
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "CONSTITUENT_SERVICES_MANAGER",
      "CASE_WORKER",
    ]),
    advice:
      "Solicita a Administración, Atención ciudadana o Gestión de casos que abra el caso.",
  },
  FIRST_TEAM_VISIBLE_COMMITMENT: {
    roles: new Set([
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "CONSTITUENT_SERVICES_MANAGER",
      "CASE_WORKER",
    ]),
    advice:
      "Solicita a un responsable de atención que publique el compromiso interno.",
  },
  FIRST_SCHEDULED_EVENT: {
    roles: new Set([
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "COMMUNICATIONS_MANAGER",
      "CONSTITUENT_SERVICES_MANAGER",
    ]),
    advice:
      "Solicita a Administración, Gerencia o Comunicaciones que programe la actividad.",
  },
};

const HANDOVER_RESOLVERS: Readonly<
  Record<string, { roles: ReadonlySet<BackendUserRole>; advice: string }>
> = {
  FINANCE_NOT_CLOSED: {
    roles: new Set(["ADMIN", "FINANCE_MANAGER", "COMPLIANCE_OFFICER"]),
    advice:
      "Escala el cierre a Administración, Gerencia financiera o Cumplimiento.",
  },
  FINANCE_DEADLINE_EXPIRED: {
    roles: new Set(["ADMIN", "FINANCE_MANAGER", "COMPLIANCE_OFFICER"]),
    advice:
      "Escala el vencimiento a Administración, Gerencia financiera o Cumplimiento.",
  },
  E14_PENDING_REVIEW: {
    roles: new Set([
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "COMPLIANCE_OFFICER",
      "ZONE_COORDINATOR",
    ]),
    advice:
      "Solicita a Administración, Gerencia, Cumplimiento o Coordinación que concilie las actas.",
  },
  OPEN_CAMPAIGN_CASES: {
    roles: new Set([
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "CONSTITUENT_SERVICES_MANAGER",
      "CASE_WORKER",
    ]),
    advice:
      "Solicita a Administración o al equipo responsable de casos que cierre o transfiera los incidentes.",
  },
  OPEN_CAMPAIGN_TASKS: {
    roles: new Set([
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
    ]),
    advice: "Solicita al responsable asignado que actualice la tarea.",
  },
  PENDING_COMMUNICATIONS: {
    roles: new Set([
      "ADMIN",
      "CAMPAIGN_MANAGER",
      "COMMUNICATIONS_MANAGER",
      "CONSTITUENT_SERVICES_MANAGER",
      "COMPLIANCE_OFFICER",
    ]),
    advice:
      "Solicita a Administración, Comunicaciones o Cumplimiento que tome la decisión pendiente.",
  },
  NO_ACTIVE_PRIVACY_NOTICE: {
    roles: new Set(["ADMIN"]),
    advice:
      "Solicita a Administración que active el aviso; Cumplimiento puede verificarlo, pero no reemplazarlo.",
  },
};

const HANDOVER_REVIEW_ONLY = new Set([
  "E14_REJECTED_EVIDENCE",
  "UNRESOLVED_STORAGE_EVIDENCE",
]);

export function getActivationStepGuidance(
  code: string,
  complete: boolean,
  role: BackendUserRole | null | undefined,
): RoleActionGuidance {
  const policy = ACTIVATION_RESOLVERS[code];
  if (!policy || !role) {
    return {
      linkLabel: null,
      advice: "Consulta a Administración antes de continuar.",
    };
  }

  if (complete) {
    return { linkLabel: "Consultar", advice: null };
  }

  return policy.roles.has(role)
    ? { linkLabel: "Configurar", advice: null }
    : { linkLabel: null, advice: policy.advice };
}

export function getHandoverActionGuidance(
  code: string,
  role: BackendUserRole | null | undefined,
): RoleActionGuidance {
  if (HANDOVER_REVIEW_ONLY.has(code)) {
    return { linkLabel: "Revisar", advice: null };
  }

  const policy = HANDOVER_RESOLVERS[code];
  if (!policy || !role) {
    return {
      linkLabel: null,
      advice: "Escala este pendiente a Administración para asignarlo.",
    };
  }

  return policy.roles.has(role)
    ? { linkLabel: "Resolver", advice: null }
    : { linkLabel: null, advice: policy.advice };
}
