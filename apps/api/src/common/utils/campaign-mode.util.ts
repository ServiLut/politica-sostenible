import { ForbiddenException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  Prisma,
  TenantType,
} from '../../../prisma/generated/prisma';

export const CAMPAIGN_TENANT_SELECT = {
  defaultMode: true,
  type: true,
} satisfies Prisma.TenantSelect;

interface CampaignTenantState {
  defaultMode: PoliticalOperationMode;
  type: TenantType;
}

export function assertCampaignTenant(
  tenant: CampaignTenantState | null | undefined,
): asserts tenant is CampaignTenantState {
  if (
    !tenant ||
    tenant.defaultMode !== PoliticalOperationMode.CAMPAIGN ||
    tenant.type === TenantType.PUBLIC_OFFICE
  ) {
    throw new ForbiddenException(
      'Este módulo sólo está disponible en organizaciones con modo campaña activo',
    );
  }
}
