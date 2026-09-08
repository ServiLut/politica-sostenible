import { ConsentStatus, Prisma } from '../../../prisma/generated/prisma';

export const CONSENT_EFFECTIVENESS_RECORD_SELECT = {
  id: true,
  status: true,
  noticeVersion: true,
  grantedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} satisfies Prisma.ConsentRecordSelect;

export type ConsentEffectivenessRecord = Prisma.ConsentRecordGetPayload<{
  select: typeof CONSENT_EFFECTIVENESS_RECORD_SELECT;
}>;

export type ConsentEffectivenessReason =
  | 'CURRENT'
  | 'NO_RECORD'
  | 'NOTICE_UNAVAILABLE'
  | 'OUTDATED_NOTICE'
  | 'NOT_YET_EFFECTIVE'
  | 'EXPIRED'
  | 'REVOKED'
  | 'DENIED';

export interface ConsentEffectiveness {
  active: boolean;
  requiresReconsent: boolean;
  reason: ConsentEffectivenessReason;
}

/**
 * Evaluates whether the latest immutable consent event authorizes use under
 * the notice that is active now. The persisted Voter.consentAccepted flag is
 * deliberately not an input: it is only a legacy/materialized snapshot and
 * changing a notice must never rewrite the person's historical decision.
 */
export function evaluateConsentEffectiveness(
  record: ConsentEffectivenessRecord | null | undefined,
  currentNoticeVersion: string | null | undefined,
  checkedAt: Date,
): ConsentEffectiveness {
  if (!record) {
    return { active: false, requiresReconsent: false, reason: 'NO_RECORD' };
  }

  if (record.revokedAt || record.status === ConsentStatus.REVOKED) {
    return { active: false, requiresReconsent: false, reason: 'REVOKED' };
  }

  if (record.status === ConsentStatus.DENIED) {
    return { active: false, requiresReconsent: false, reason: 'DENIED' };
  }

  if (
    record.status === ConsentStatus.EXPIRED ||
    (record.expiresAt && record.expiresAt.getTime() <= checkedAt.getTime())
  ) {
    return {
      active: false,
      requiresReconsent: Boolean(currentNoticeVersion),
      reason: 'EXPIRED',
    };
  }

  if (record.grantedAt.getTime() > checkedAt.getTime()) {
    return {
      active: false,
      requiresReconsent: false,
      reason: 'NOT_YET_EFFECTIVE',
    };
  }

  if (!currentNoticeVersion) {
    return {
      active: false,
      requiresReconsent: false,
      reason: 'NOTICE_UNAVAILABLE',
    };
  }

  if (record.noticeVersion !== currentNoticeVersion) {
    return {
      active: false,
      requiresReconsent: true,
      reason: 'OUTDATED_NOTICE',
    };
  }

  return { active: true, requiresReconsent: false, reason: 'CURRENT' };
}
