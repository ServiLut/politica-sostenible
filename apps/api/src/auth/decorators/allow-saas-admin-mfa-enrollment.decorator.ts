import { SetMetadata } from '@nestjs/common';

/**
 * Narrow bootstrap escape hatch for immutable, explicitly allowlisted SaaS
 * administrators. It only has meaning together with PlanFeature.MFA.
 */
export const ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY =
  'allow-saas-admin-mfa-enrollment';

export const AllowSaasAdminMfaEnrollment = () =>
  SetMetadata(ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY, true);
