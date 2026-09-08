import { ConsentStatus } from '../../../prisma/generated/prisma';
import {
  type ConsentEffectivenessRecord,
  evaluateConsentEffectiveness,
} from './consent-effectiveness.util';

const checkedAt = new Date('2026-09-07T12:00:00.000Z');

function record(
  overrides: Partial<ConsentEffectivenessRecord> = {},
): ConsentEffectivenessRecord {
  return {
    id: 'consent-a',
    status: ConsentStatus.GRANTED,
    noticeVersion: 'campaign-v1',
    grantedAt: new Date('2026-09-01T12:00:00.000Z'),
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    ...overrides,
  };
}

describe('evaluateConsentEffectiveness', () => {
  it('accepts only a grant for the currently active notice version', () => {
    expect(
      evaluateConsentEffectiveness(record(), 'campaign-v1', checkedAt),
    ).toEqual({
      active: true,
      requiresReconsent: false,
      reason: 'CURRENT',
    });
  });

  it('preserves an older grant as evidence but requires fresh consent', () => {
    expect(
      evaluateConsentEffectiveness(record(), 'campaign-v2', checkedAt),
    ).toEqual({
      active: false,
      requiresReconsent: true,
      reason: 'OUTDATED_NOTICE',
    });
  });

  it.each([
    [
      'a later revocation',
      record({
        status: ConsentStatus.REVOKED,
        revokedAt: new Date('2026-09-06T12:00:00.000Z'),
      }),
      'REVOKED',
    ],
    [
      'an expired grant',
      record({ expiresAt: new Date('2026-09-07T12:00:00.000Z') }),
      'EXPIRED',
    ],
    [
      'a future-dated grant',
      record({ grantedAt: new Date('2026-09-08T12:00:00.000Z') }),
      'NOT_YET_EFFECTIVE',
    ],
  ])('fails closed for %s', (_label, consent, reason) => {
    expect(
      evaluateConsentEffectiveness(consent, 'campaign-v1', checkedAt),
    ).toMatchObject({ active: false, reason });
  });

  it('does not claim reconsent is possible while no notice is active', () => {
    expect(evaluateConsentEffectiveness(record(), null, checkedAt)).toEqual({
      active: false,
      requiresReconsent: false,
      reason: 'NOTICE_UNAVAILABLE',
    });
  });
});
