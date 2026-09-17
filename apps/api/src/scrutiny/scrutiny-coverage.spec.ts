import { buildScrutinyTemporalCoverage } from './scrutiny-coverage';

describe('scrutiny E-16 temporal coverage', () => {
  const commission = {
    id: 'commission-a',
    scheduledStartsAt: new Date('2027-10-31T16:00:00.000Z'),
    scheduledEndsAt: new Date('2027-10-31T20:00:00.000Z'),
    status: 'ACTIVE' as const,
  };

  it('unions overlapping approved E-16 shifts instead of counting names', () => {
    const [result] = buildScrutinyTemporalCoverage(
      [commission],
      [
        {
          commissionId: commission.id,
          shiftStartsAt: new Date('2027-10-31T16:00:00.000Z'),
          shiftEndsAt: new Date('2027-10-31T18:30:00.000Z'),
          status: 'CONFIRMED',
          witnessEligible: true,
          credentialApproved: true,
        },
        {
          commissionId: commission.id,
          shiftStartsAt: new Date('2027-10-31T18:00:00.000Z'),
          shiftEndsAt: new Date('2027-10-31T20:00:00.000Z'),
          status: 'CONFIRMED',
          witnessEligible: true,
          credentialApproved: true,
        },
      ],
    );

    expect(result).toEqual(
      expect.objectContaining({
        expectedMinutes: 240,
        coveredMinutes: 240,
        gapMinutes: 0,
        fullyCovered: true,
      }),
    );
  });

  it('exposes exact time gaps and ignores planned or unapproved credentials', () => {
    const [result] = buildScrutinyTemporalCoverage(
      [commission],
      [
        {
          commissionId: commission.id,
          shiftStartsAt: new Date('2027-10-31T16:00:00.000Z'),
          shiftEndsAt: new Date('2027-10-31T17:00:00.000Z'),
          status: 'CONFIRMED',
          witnessEligible: true,
          credentialApproved: true,
        },
        {
          commissionId: commission.id,
          shiftStartsAt: new Date('2027-10-31T17:00:00.000Z'),
          shiftEndsAt: new Date('2027-10-31T20:00:00.000Z'),
          status: 'PLANNED',
          witnessEligible: true,
          credentialApproved: true,
        },
        {
          commissionId: commission.id,
          shiftStartsAt: new Date('2027-10-31T17:00:00.000Z'),
          shiftEndsAt: new Date('2027-10-31T20:00:00.000Z'),
          status: 'CONFIRMED',
          witnessEligible: true,
          credentialApproved: false,
        },
      ],
    );

    expect(result.gapMinutes).toBe(180);
    expect(result.fullyCovered).toBe(false);
    expect(result.gaps).toEqual([
      {
        startsAt: '2027-10-31T17:00:00.000Z',
        endsAt: '2027-10-31T20:00:00.000Z',
        durationMinutes: 180,
      },
    ]);
  });

  it('excludes explicitly cancelled commissions from readiness', () => {
    expect(
      buildScrutinyTemporalCoverage(
        [{ ...commission, status: 'CANCELLED' }],
        [],
      ),
    ).toEqual([]);
  });
});
