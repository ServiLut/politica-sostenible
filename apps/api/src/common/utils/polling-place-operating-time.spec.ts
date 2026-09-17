import {
  dateKeyInTimeZone,
  pollingPlaceOperationalStatus,
  storedDateOnlyKey,
} from './polling-place-operating-time';

describe('polling-place logical voting time', () => {
  it('uses the polling place IANA zone across a UTC date boundary', () => {
    const instant = new Date('2026-05-31T04:30:00.000Z');
    expect(dateKeyInTimeZone(instant, 'America/Bogota')).toBe('2026-05-30');
    expect(dateKeyInTimeZone(instant, 'Europe/Madrid')).toBe('2026-05-31');
  });

  it('does not open a domestic Sunday place while the global window is open for consulates', () => {
    expect(
      pollingPlaceOperationalStatus(
        {
          votingDate: new Date('2026-05-31T00:00:00.000Z'),
          timeZone: 'America/Bogota',
        },
        new Date('2026-05-30T18:00:00.000Z'),
      ),
    ).toMatchObject({
      code: 'OUTSIDE_LOGICAL_VOTING_DATE',
      operationalNow: false,
      evaluatedLocalDate: '2026-05-30',
    });
  });

  it('opens only on the declared local civil date', () => {
    expect(
      pollingPlaceOperationalStatus(
        {
          votingDate: '2026-05-31',
          timeZone: 'America/Bogota',
        },
        new Date('2026-05-31T15:00:00.000Z'),
      ),
    ).toMatchObject({
      code: 'OPEN_FOR_LOGICAL_VOTING_DATE',
      operationalNow: true,
    });
  });

  it('fails closed for an exterior place without a verified IANA zone', () => {
    expect(
      pollingPlaceOperationalStatus({
        votingDate: '2026-05-25',
        timeZone: null,
      }),
    ).toEqual({
      code: 'TIME_ZONE_NOT_VERIFIED',
      operationalNow: false,
      votingDate: '2026-05-25',
      evaluatedLocalDate: null,
      timeZone: null,
    });
  });

  it('keeps a stored DATE as UTC civil data instead of reinterpreting it in Bogota', () => {
    expect(storedDateOnlyKey(new Date('2026-06-21T00:00:00.000Z'))).toBe(
      '2026-06-21',
    );
  });
});
