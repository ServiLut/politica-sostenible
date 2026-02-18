export enum UserRole {
  SuperAdmin = 'SuperAdmin',
  AdminCampana = 'AdminCampana',
  GerenteFinanzas = 'GerenteFinanzas',
  GerenteOps = 'GerenteOps',
  Coordinador = 'Coordinador',
  Lider = 'Lider',
  Voluntario = 'Voluntario',
  Testigo = 'Testigo',
  Auditor = 'Auditor',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
}

export interface Tenant {
  id: string;
  name: string; // Nombre de la campaña o partido
  subdomain: string;
  logo?: string;
  plan: 'basic' | 'pro' | 'enterprise';
}

export interface Territory {
  id: string;
  name: string;
  type: 'department' | 'municipality' | 'zone' | 'place';
  parentId?: string;
}

export interface Campaign {
  id: string;
  name: string;
  tenantId: string;
  startDate: Date;
  endDate: Date;
  status: 'active' | 'archived';
}
