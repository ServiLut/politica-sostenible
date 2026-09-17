import { calculatePqrsdDeadline } from './pqrsd-deadline';

describe('PQRSD reproducible deadline calculation', () => {
  it('uses only the approved package calendar and records every included/excluded day', () => {
    const result = calculatePqrsdDeadline({
      receivedAt: new Date('2026-09-04T15:00:00.000Z'), // Friday in Bogota
      timeZone: 'America/Bogota',
      durationDays: 3,
      dayMethod: 'WORKING_DAYS',
      startRule: 'NEXT_WORKING_DATE',
      nonWorkingWeekdays: [0, 6],
      exceptions: [
        {
          localDate: '2026-09-08',
          type: 'NON_WORKING',
          label: 'Cierre excepcional documentado',
          sourceReference: 'Resolucion 123 de 2026',
        },
      ],
    });

    expect(result.calculationStatus).toBe('CALCULATED');
    expect(result.startLocalDate).toBe('2026-09-07');
    expect(result.currentDueLocalDate).toBe('2026-09-10');
    expect(result.includedDays.map((day) => day.localDate)).toEqual([
      '2026-09-07',
      '2026-09-09',
      '2026-09-10',
    ]);
    expect(result.excludedDays).toEqual([
      expect.objectContaining({
        localDate: '2026-09-08',
        reason: 'NON_WORKING_EXCEPTION',
        sourceReference: 'Resolucion 123 de 2026',
      }),
    ]);
  });

  it('fails closed when the approved start rule requires human determination', () => {
    const result = calculatePqrsdDeadline({
      receivedAt: new Date('2026-09-09T15:00:00.000Z'),
      timeZone: 'America/Bogota',
      durationDays: 21,
      dayMethod: 'CALENDAR_DAYS',
      startRule: 'MANUAL_REVIEW',
      nonWorkingWeekdays: [],
      exceptions: [],
    });

    expect(result).toMatchObject({
      calculationStatus: 'CALCULATION_REQUIRES_REVIEW',
      originalDueLocalDate: null,
      currentDueLocalDate: null,
      dueAt: null,
      calculationTrace: { reviewReason: 'PACKAGE_REQUIRES_MANUAL_REVIEW' },
    });
  });

  it('rejects contradictory calendar dates instead of guessing', () => {
    expect(() =>
      calculatePqrsdDeadline({
        receivedAt: new Date('2026-09-09T15:00:00.000Z'),
        timeZone: 'America/Bogota',
        durationDays: 1,
        dayMethod: 'WORKING_DAYS',
        startRule: 'RECEIPT_DATE',
        nonWorkingWeekdays: [0, 6],
        exceptions: [
          {
            localDate: '2026-09-09',
            type: 'NON_WORKING',
            label: 'Primera fuente',
            sourceReference: 'Acto A',
          },
          {
            localDate: '2026-09-09',
            type: 'WORKING_OVERRIDE',
            label: 'Fuente contradictoria',
            sourceReference: 'Acto B',
          },
        ],
      }),
    ).toThrow('contradictory duplicate dates');
  });

  it.each([0, 366, 10.5])(
    'requires an explicit finite duration (%s)',
    (durationDays) => {
      expect(() =>
        calculatePqrsdDeadline({
          receivedAt: new Date('2026-09-09T15:00:00.000Z'),
          timeZone: 'UTC',
          durationDays,
          dayMethod: 'CALENDAR_DAYS',
          startRule: 'RECEIPT_DATE',
          nonWorkingWeekdays: [],
          exceptions: [],
        }),
      ).toThrow('explicit integer');
    },
  );
});
