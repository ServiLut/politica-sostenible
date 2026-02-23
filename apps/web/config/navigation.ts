import { UserRole } from '../types/saas-schema';

export interface NavItem {
  title: string;
  href: string;
  icon?: string;
  allowedRoles: UserRole[];
}

export const ALL_ROLES = Object.values(UserRole);

export const dashboardConfig: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard/executive',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps],
  },
  {
    title: 'Organización',
    href: '/dashboard/org',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador],
  },
  {
    title: 'Territorio',
    href: '/dashboard/territory',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador, UserRole.Lider],
  },
  {
    title: 'Puestos Votación (Logística)',
    href: '/dashboard/territory/voting-places',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador],
  },
  {
    title: 'Directorio CRM',
    href: '/dashboard/directory',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador, UserRole.Lider, UserRole.Voluntario],
  },
  {
    title: 'Pipeline',
    href: '/dashboard/pipeline',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador],
  },
  {
    title: 'Estratega IA',
    href: '/dashboard/agent',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana],
  },
  {
    title: 'Eventos',
    href: '/dashboard/events',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador, UserRole.Lider, UserRole.Voluntario],
  },
  {
    title: 'Mensajería',
    href: '/dashboard/messaging',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.Coordinador],
  },
  {
    title: 'Misiones',
    href: '/dashboard/tasks',
    allowedRoles: ALL_ROLES,
  },
  {
    title: 'Finanzas',
    href: '/dashboard/finance',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteFinanzas, UserRole.Auditor],
  },
  {
    title: 'Día D / E14',
    href: '/dashboard/war-room',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador, UserRole.Testigo],
  },
  {
    title: 'Seguridad',
    href: '/dashboard/security',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana],
  },
  {
    title: 'Compliance',
    href: '/dashboard/compliance',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.Auditor],
  },
  {
    title: 'Configuración',
    href: '/dashboard/settings',
    allowedRoles: [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador],
  },
];
