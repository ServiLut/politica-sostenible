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

export interface CampaignTenantState {
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

/**
 * The current E-14 domain stores a single `candidateVotes` value. Until the
 * ballot model supports parties, lists and signature committees, only a
 * candidacy tenant can use that consolidation safely.
 */
export function assertCandidacyCampaignTenant(
  tenant: CampaignTenantState | null | undefined,
): asserts tenant is CampaignTenantState {
  assertCampaignTenant(tenant);

  if (tenant.type !== TenantType.CANDIDACY) {
    throw new ForbiddenException(
      'La conciliación E-14 con votos de candidatura sólo está disponible para organizaciones de tipo candidatura',
    );
  }
}
