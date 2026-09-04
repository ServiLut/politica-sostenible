export enum UserRole {
  SuperAdmin = "SuperAdmin",
  AdminCampana = "AdminCampana",
  GerenteFinanzas = "GerenteFinanzas",
  GerenteOps = "GerenteOps",
  Coordinador = "Coordinador",
  Lider = "Lider",
  Voluntario = "Voluntario",
  Testigo = "Testigo",
  Auditor = "Auditor",
}

export type BackendUserRole =
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

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  backendRole: BackendUserRole;
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: string | null;
  avatar?: string;
}

export interface Tenant {
  id: string;
  name: string; // Nombre de la campaña o partido
  slug: string;
  type: "CANDIDACY" | "PARTY" | "GSC" | "PUBLIC_OFFICE";
  config?: unknown;
}

export interface Territory {
  id: string;
  name: string;
  type: "department" | "municipality" | "zone" | "place";
  parentId?: string;
}

export interface Campaign {
  id: string;
  name: string;
  tenantId: string;
  startDate: Date;
  endDate: Date;
  status: "active" | "archived";
}
