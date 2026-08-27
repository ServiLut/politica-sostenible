import { ForbiddenException } from '@nestjs/common';
import {
  PoliticalOperationMode,
  TenantType,
} from '../../../prisma/generated/prisma';
import { assertCampaignTenant } from './campaign-mode.util';

describe('assertCampaignTenant', () => {
  it('accepts only a campaign-mode non-public-office tenant', () => {
    expect(() =>
      assertCampaignTenant({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.CANDIDACY,
      }),
    ).not.toThrow();
  });

  it.each([
    {
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    },
    {
      defaultMode: PoliticalOperationMode.CAMPAIGN,
      type: TenantType.PUBLIC_OFFICE,
    },
    {
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.CANDIDACY,
    },
    null,
  ])('returns 403 for non-campaign context %#', (tenant) => {
    expect(() => assertCampaignTenant(tenant)).toThrow(ForbiddenException);
  });
});
