import { Role } from '../../prisma/generated/prisma';

/**
 * Roles allowed to read the formal PQRSD aggregate.
 *
 * Keep this single source of truth shared by the PQRSD controller and every
 * derived read model (search/inbox), so those projections can never broaden
 * access beyond the audited detail endpoint.
 */
export const PQRSD_READ_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
