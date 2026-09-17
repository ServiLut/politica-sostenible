export interface ScrutinyCoverageCommission {
  id: string;
  scheduledStartsAt: Date;
  scheduledEndsAt: Date;
  status: 'PLANNED' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'CANCELLED';
}

export interface ScrutinyCoverageShift {
  commissionId: string;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  status: 'PLANNED' | 'CONFIRMED' | 'CANCELLED';
  witnessEligible: boolean;
  credentialApproved: boolean;
}

export interface ScrutinyCoverageGap {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
}

export interface ScrutinyCommissionCoverageResult {
  commissionId: string;
  expectedMinutes: number;
  coveredMinutes: number;
  gapMinutes: number;
  fullyCovered: boolean;
  gaps: ScrutinyCoverageGap[];
}

function minutes(start: number, end: number): number {
  return Math.max(0, Math.ceil((end - start) / 60_000));
}

export function buildScrutinyTemporalCoverage(
  commissions: readonly ScrutinyCoverageCommission[],
  shifts: readonly ScrutinyCoverageShift[],
): ScrutinyCommissionCoverageResult[] {
  return commissions
    .filter(({ status }) => status !== 'CANCELLED')
    .map((commission) => {
      const start = commission.scheduledStartsAt.getTime();
      const end = commission.scheduledEndsAt.getTime();
      const intervals = shifts
        .filter(
          (shift) =>
            shift.commissionId === commission.id &&
            shift.status === 'CONFIRMED' &&
            shift.witnessEligible &&
            shift.credentialApproved,
        )
        .map(
          (shift) =>
            [
              Math.max(start, shift.shiftStartsAt.getTime()),
              Math.min(end, shift.shiftEndsAt.getTime()),
            ] as const,
        )
        .filter(([intervalStart, intervalEnd]) => intervalEnd > intervalStart)
        .sort(([left], [right]) => left - right);

      const merged: Array<[number, number]> = [];
      for (const [intervalStart, intervalEnd] of intervals) {
        const previous = merged.at(-1);
        if (!previous || intervalStart > previous[1]) {
          merged.push([intervalStart, intervalEnd]);
        } else {
          previous[1] = Math.max(previous[1], intervalEnd);
        }
      }

      const gaps: ScrutinyCoverageGap[] = [];
      let cursor = start;
      for (const [intervalStart, intervalEnd] of merged) {
        if (intervalStart > cursor) {
          gaps.push({
            startsAt: new Date(cursor).toISOString(),
            endsAt: new Date(intervalStart).toISOString(),
            durationMinutes: minutes(cursor, intervalStart),
          });
        }
        cursor = Math.max(cursor, intervalEnd);
      }
      if (cursor < end) {
        gaps.push({
          startsAt: new Date(cursor).toISOString(),
          endsAt: new Date(end).toISOString(),
          durationMinutes: minutes(cursor, end),
        });
      }

      const expectedMinutes = minutes(start, end);
      const gapMinutes = gaps.reduce(
        (total, gap) => total + gap.durationMinutes,
        0,
      );
      return {
        commissionId: commission.id,
        expectedMinutes,
        coveredMinutes: Math.max(0, expectedMinutes - gapMinutes),
        gapMinutes,
        fullyCovered: expectedMinutes > 0 && gapMinutes === 0,
        gaps,
      };
    });
}
