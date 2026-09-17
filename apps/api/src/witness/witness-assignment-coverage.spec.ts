import { buildExactWitnessCoverage } from './witness-assignment-coverage';

const places = [
  { id: 'place-a', code: '001', name: 'Colegio A', expectedTables: 2 },
  { id: 'place-b', code: '002', name: 'Colegio B', expectedTables: 1 },
];
const windows = [
  {
    id: 'window-a',
    puestoId: 'place-a',
    localDate: '2026-10-25',
    startsAt: '2026-10-25T12:00:00.000Z',
    endsAt: '2026-10-25T22:00:00.000Z',
    timeZone: 'America/Bogota',
    utcOffsetMinutes: -300,
  },
];

const assignment = (
  values: Partial<{
    coverageWindowId: string;
    puestoId: string;
    tableStart: number;
    tableEnd: number;
    shiftStartsAt: string;
    shiftEndsAt: string;
    assignmentType: 'PRIMARY' | 'BACKUP';
    status: 'PLANNED' | 'CONFIRMED' | 'CANCELLED';
    witnessEligible: boolean;
  }> = {},
) => ({
  coverageWindowId: 'window-a',
  puestoId: 'place-a',
  tableStart: 1,
  tableEnd: 2,
  shiftStartsAt: '2026-10-25T12:00:00.000Z',
  shiftEndsAt: '2026-10-25T22:00:00.000Z',
  assignmentType: 'PRIMARY' as const,
  status: 'CONFIRMED' as const,
  witnessEligible: true,
  ...values,
});

describe('exact witness temporal table coverage', () => {
  it('requires each type to cover every table for the complete declared window', () => {
    const coverage = buildExactWitnessCoverage(places, windows, [
      assignment(),
      assignment({
        assignmentType: 'BACKUP',
        shiftStartsAt: '2026-10-25T17:00:00.000Z',
      }),
    ]);

    expect(coverage).toMatchObject({
      expectedTableWindows: 2,
      confirmedPrimaryTables: 2,
      confirmedBackupTables: 0,
      confirmedBothTables: 0,
      missingPrimaryTables: 0,
      missingBackupTables: 2,
      confirmedBackupUncoveredMinutes: 600,
      fullyConfirmed: false,
    });
    expect(coverage.places[0].windows[0].backupConfirmedTemporalGaps).toEqual([
      {
        tableFrom: 1,
        tableTo: 2,
        gaps: [
          {
            startsAt: '2026-10-25T12:00:00.000Z',
            endsAt: '2026-10-25T17:00:00.000Z',
            durationMinutes: 300,
          },
        ],
      },
    ]);
  });

  it('merges adjacent shifts but exposes even a one-minute temporal gap', () => {
    const full = buildExactWitnessCoverage([places[0]], windows, [
      assignment({ shiftEndsAt: '2026-10-25T17:00:00.000Z' }),
      assignment({
        shiftStartsAt: '2026-10-25T17:00:00.000Z',
        assignmentType: 'PRIMARY',
      }),
      assignment({ assignmentType: 'BACKUP' }),
    ]);
    expect(full.fullyConfirmed).toBe(true);

    const gapped = buildExactWitnessCoverage([places[0]], windows, [
      assignment({ shiftEndsAt: '2026-10-25T16:59:00.000Z' }),
      assignment({ shiftStartsAt: '2026-10-25T17:00:00.000Z' }),
      assignment({ assignmentType: 'BACKUP' }),
    ]);
    expect(gapped.fullyConfirmed).toBe(false);
    expect(gapped.confirmedPrimaryUncoveredMinutes).toBe(2);
    expect(
      gapped.places[0].windows[0].primaryConfirmedTemporalGaps[0].gaps,
    ).toEqual([
      {
        startsAt: '2026-10-25T16:59:00.000Z',
        endsAt: '2026-10-25T17:00:00.000Z',
        durationMinutes: 1,
      },
    ]);
  });

  it('never counts planned, cancelled, or ineligible rows as confirmed', () => {
    const coverage = buildExactWitnessCoverage([places[0]], windows, [
      assignment({ status: 'PLANNED' }),
      assignment({ assignmentType: 'BACKUP', witnessEligible: false }),
    ]);
    expect(coverage).toMatchObject({
      confirmedPrimaryTables: 0,
      confirmedBackupTables: 0,
      ineligibleAssignmentCount: 1,
      fullyConfirmed: false,
    });
  });

  it('blocks an otherwise configured place without an explicit local window', () => {
    const coverage = buildExactWitnessCoverage([places[1]], [], []);
    expect(coverage).toMatchObject({
      expectedPollingPlaces: 1,
      placesWithoutExpectedTables: 0,
      placesWithoutCoverageWindows: 1,
      expectedTableWindows: 0,
      fullyConfirmed: false,
    });
  });

  it('blocks a place without expected table capacity', () => {
    const coverage = buildExactWitnessCoverage(
      [{ ...places[0], expectedTables: null }],
      windows,
      [],
    );
    expect(coverage).toMatchObject({
      placesWithoutExpectedTables: 1,
      expectedTableWindows: 0,
      fullyConfirmed: false,
    });
  });
});
