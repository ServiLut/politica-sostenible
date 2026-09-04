import { ConflictException, PreconditionFailedException } from '@nestjs/common';
import {
  ConsentPurpose,
  PoliticalOperationMode,
} from '../../../prisma/generated/prisma';
import {
  findActiveConsentNotice,
  getConsentPurposeForMode,
  requireActiveConsentNotice,
} from './consent-notice.util';

describe('tenant consent notice utilities', () => {
  const notice = {
    id: 'notice-a',
    mode: PoliticalOperationMode.CAMPAIGN,
    purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
    version: 'campaign-2026-09',
    title: 'Autorizacion de tratamiento',
    content: 'Texto legal completo comunicado al titular.',
    controllerName: 'Organizacion A',
    contactEmail: 'privacidad@example.test',
    privacyPolicyUrl: null,
    activatedAt: new Date('2026-09-04T12:00:00.000Z'),
  };

  it('reads only the active notice inside the authenticated tenant scope', async () => {
    const findFirst = jest.fn().mockResolvedValue(notice);
    const client = { consentNotice: { findFirst } } as never;

    await expect(
      findActiveConsentNotice(
        client,
        'tenant-from-jwt',
        PoliticalOperationMode.CAMPAIGN,
      ),
    ).resolves.toEqual(notice);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-from-jwt',
          mode: PoliticalOperationMode.CAMPAIGN,
          purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
          isActive: true,
        },
      }),
    );
  });

  it('fails closed when the organization has no active notice', async () => {
    const client = {
      consentNotice: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never;

    await expect(
      requireActiveConsentNotice(
        client,
        'tenant-a',
        PoliticalOperationMode.CAMPAIGN,
        'campaign-2026-09',
      ),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('rejects a stale client version and accepts the current version', async () => {
    const client = {
      consentNotice: { findFirst: jest.fn().mockResolvedValue(notice) },
    } as never;

    await expect(
      requireActiveConsentNotice(
        client,
        'tenant-a',
        PoliticalOperationMode.CAMPAIGN,
        'campaign-2026-08',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      requireActiveConsentNotice(
        client,
        'tenant-a',
        PoliticalOperationMode.CAMPAIGN,
        notice.version,
      ),
    ).resolves.toEqual(notice);
  });

  it('derives the legally supported purpose from the tenant operation mode', () => {
    expect(getConsentPurposeForMode(PoliticalOperationMode.CAMPAIGN)).toBe(
      ConsentPurpose.POLITICAL_COMMUNICATION,
    );
    expect(getConsentPurposeForMode(PoliticalOperationMode.PUBLIC_OFFICE)).toBe(
      ConsentPurpose.SERVICE_FOLLOW_UP,
    );
  });
});
