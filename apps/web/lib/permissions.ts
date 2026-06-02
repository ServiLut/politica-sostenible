import { UserRole } from '@/types/saas-schema';

export type AppPermission =
  | 'finance:read'
  | 'finance:write'
  | 'voters:read'
  | 'voters:write'
  | 'operations:read'
  | 'operations:write'
  | 'security:read';

const PERMISSION_MATRIX: Record<AppPermission, UserRole[]> = {
  'finance:read': [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador],
  'finance:write': [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps],
  'voters:read': [
    UserRole.SuperAdmin,
    UserRole.AdminCampana,
    UserRole.GerenteOps,
    UserRole.Coordinador,
    UserRole.Testigo,
    UserRole.Voluntario,
  ],
  'voters:write': [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador],
  'operations:read': [
    UserRole.SuperAdmin,
    UserRole.AdminCampana,
    UserRole.GerenteOps,
    UserRole.Coordinador,
    UserRole.Testigo,
    UserRole.Voluntario,
  ],
  'operations:write': [UserRole.SuperAdmin, UserRole.AdminCampana, UserRole.GerenteOps, UserRole.Coordinador],
  'security:read': [UserRole.SuperAdmin, UserRole.AdminCampana],
};

export function hasPermission(
  role: UserRole | null | undefined,
  permission: AppPermission,
): boolean {
  if (!role) return false;
  return PERMISSION_MATRIX[permission]?.includes(role) ?? false;
}
