import { SetMetadata } from '@nestjs/common';

export enum PlanFeature {
  EXPORT = 'export',
  IMPORT = 'import',
  MFA = 'mfa',
}

export const PLAN_FEATURE_KEY = 'required-plan-feature';

export const RequiresPlanFeature = (feature: PlanFeature) =>
  SetMetadata(PLAN_FEATURE_KEY, feature);
