export type WitnessAssignmentCoverageType = 'PRIMARY' | 'BACKUP';
export type WitnessAssignmentCoverageStatus =
  | 'PLANNED'
  | 'CONFIRMED'
  | 'CANCELLED';

export interface WitnessCoverageRange {
  from: number;
  to: number;
}

export interface WitnessCoverageTimeGap {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
}

export interface WitnessCoverageTemporalGapGroup {
  tableFrom: number;
  tableTo: number;
  gaps: WitnessCoverageTimeGap[];
}

export interface WitnessCoveragePlaceInput {
  id: string;
  code: string;
  name: string;
  expectedTables: number | null;
}

export interface WitnessCoverageWindowInput {
  id: string;
  puestoId: string;
  localDate: Date | string;
  startsAt: Date | string;
  endsAt: Date | string;
  timeZone: string;
  utcOffsetMinutes: number;
}

export interface WitnessCoverageAssignmentInput {
  coverageWindowId: string;
  puestoId: string;
  tableStart: number;
  tableEnd: number;
  shiftStartsAt: Date | string;
  shiftEndsAt: Date | string;
  assignmentType: WitnessAssignmentCoverageType;
  status: WitnessAssignmentCoverageStatus;
  witnessEligible: boolean;
}

export interface WitnessCoverageKindResult {
  /** Table-window units covered for the entire declared operating window. */
  scheduledTables: number;
  confirmedTables: number;
  plannedOnlyTables: number;
  scheduledGapRanges: WitnessCoverageRange[];
  confirmedGapRanges: WitnessCoverageRange[];
  scheduledUncoveredMinutes: number;
  confirmedUncoveredMinutes: number;
}

export interface WitnessCoverageWindowResult {
  window: {
    id: string;
    localDate: string;
    startsAt: string;
    endsAt: string;
    timeZone: string;
    utcOffsetMinutes: number;
    durationMinutes: number;
  };
  primary: WitnessCoverageKindResult;
  backup: WitnessCoverageKindResult;
  primaryScheduledTemporalGaps: WitnessCoverageTemporalGapGroup[];
  primaryConfirmedTemporalGaps: WitnessCoverageTemporalGapGroup[];
  backupScheduledTemporalGaps: WitnessCoverageTemporalGapGroup[];
  backupConfirmedTemporalGaps: WitnessCoverageTemporalGapGroup[];
  bothConfirmedTables: number;
  fullyConfirmed: boolean;
}

export interface WitnessCoveragePlaceResult {
  puesto: WitnessCoveragePlaceInput;
  configurationReady: boolean;
  hasCoverageWindow: boolean;
  primary: WitnessCoverageKindResult;
  backup: WitnessCoverageKindResult;
  bothConfirmedTables: number;
  fullyConfirmed: boolean;
  ineligibleAssignmentCount: number;
  windows: WitnessCoverageWindowResult[];
}

export interface ExactWitnessCoverage {
  expectedPollingPlaces: number;
  placesWithoutExpectedTables: number;
  placesWithoutCoverageWindows: number;
  coverageWindowCount: number;
  /** Compatibility name: this is the number of table-window units, not tables. */
  expectedTables: number;
  expectedTableWindows: number;
  scheduledPrimaryTables: number;
  scheduledBackupTables: number;
  confirmedPrimaryTables: number;
  confirmedBackupTables: number;
  confirmedBothTables: number;
  missingPrimaryTables: number;
  missingBackupTables: number;
  fullyConfirmedTables: number;
  confirmedPrimaryUncoveredMinutes: number;
  confirmedBackupUncoveredMinutes: number;
  fullyConfirmed: boolean;
  ineligibleAssignmentCount: number;
  places: WitnessCoveragePlaceResult[];
}

interface TimeRange {
  start: number;
  end: number;
}

function asMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function asIso(value: number): string {
  return new Date(value).toISOString();
}

function mergeTimeRanges(
  ranges: TimeRange[],
  windowStart: number,
  windowEnd: number,
): TimeRange[] {
  const clipped = ranges
    .map(({ start, end }) => ({
      start: Math.max(windowStart, start),
      end: Math.min(windowEnd, end),
    }))
    .filter(({ start, end }) => Number.isFinite(start) && end > start)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: TimeRange[] = [];
  for (const range of clipped) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) merged.push({ ...range });
    else previous.end = Math.max(previous.end, range.end);
  }
  return merged;
}

function timeGaps(
  covered: TimeRange[],
  windowStart: number,
  windowEnd: number,
): TimeRange[] {
  const gaps: TimeRange[] = [];
  let cursor = windowStart;
  for (const range of covered) {
    if (range.start > cursor) gaps.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < windowEnd) gaps.push({ start: cursor, end: windowEnd });
  return gaps;
}

function gapMinutes(gaps: TimeRange[]): number {
  return Math.ceil(
    gaps.reduce((total, gap) => total + gap.end - gap.start, 0) / 60_000,
  );
}

function serializeGaps(gaps: TimeRange[]): WitnessCoverageTimeGap[] {
  return gaps.map(({ start, end }) => ({
    startsAt: asIso(start),
    endsAt: asIso(end),
    durationMinutes: Math.ceil((end - start) / 60_000),
  }));
}

function gapSignature(gaps: TimeRange[]): string {
  return gaps.map(({ start, end }) => `${start}:${end}`).join('|');
}

function groupTableGaps(
  gapsByTable: Map<number, TimeRange[]>,
): WitnessCoverageTemporalGapGroup[] {
  const groups: WitnessCoverageTemporalGapGroup[] = [];
  let previousSignature: string | null = null;
  for (const [table, gaps] of [...gapsByTable.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    if (gaps.length === 0) continue;
    const signature = gapSignature(gaps);
    const previous = groups.at(-1);
    if (
      previous &&
      previous.tableTo + 1 === table &&
      previousSignature === signature
    ) {
      previous.tableTo = table;
    } else {
      groups.push({
        tableFrom: table,
        tableTo: table,
        gaps: serializeGaps(gaps),
      });
    }
    previousSignature = signature;
  }
  return groups;
}

function tableRanges(tables: number[]): WitnessCoverageRange[] {
  const ranges: WitnessCoverageRange[] = [];
  for (const table of [...new Set(tables)].sort(
    (left, right) => left - right,
  )) {
    const previous = ranges.at(-1);
    if (previous && previous.to + 1 === table) previous.to = table;
    else ranges.push({ from: table, to: table });
  }
  return ranges;
}

interface KindWindowCoverage {
  result: WitnessCoverageKindResult;
  scheduledGaps: Map<number, TimeRange[]>;
  confirmedGaps: Map<number, TimeRange[]>;
  confirmedFullTables: Set<number>;
}

function coverageForKind(
  expectedTables: number,
  windowStart: number,
  windowEnd: number,
  assignments: WitnessCoverageAssignmentInput[],
  assignmentType: WitnessAssignmentCoverageType,
): KindWindowCoverage {
  const eligible = assignments.filter(
    (assignment) =>
      assignment.witnessEligible &&
      assignment.assignmentType === assignmentType &&
      assignment.status !== 'CANCELLED',
  );
  const scheduledGaps = new Map<number, TimeRange[]>();
  const confirmedGaps = new Map<number, TimeRange[]>();
  const scheduledFullTables = new Set<number>();
  const confirmedFullTables = new Set<number>();

  for (let table = 1; table <= expectedTables; table += 1) {
    const forTable = eligible.filter(
      ({ tableStart, tableEnd }) => tableStart <= table && tableEnd >= table,
    );
    const scheduled = mergeTimeRanges(
      forTable.map(({ shiftStartsAt, shiftEndsAt }) => ({
        start: asMillis(shiftStartsAt),
        end: asMillis(shiftEndsAt),
      })),
      windowStart,
      windowEnd,
    );
    const confirmed = mergeTimeRanges(
      forTable
        .filter(({ status }) => status === 'CONFIRMED')
        .map(({ shiftStartsAt, shiftEndsAt }) => ({
          start: asMillis(shiftStartsAt),
          end: asMillis(shiftEndsAt),
        })),
      windowStart,
      windowEnd,
    );
    const scheduledTableGaps = timeGaps(scheduled, windowStart, windowEnd);
    const confirmedTableGaps = timeGaps(confirmed, windowStart, windowEnd);
    scheduledGaps.set(table, scheduledTableGaps);
    confirmedGaps.set(table, confirmedTableGaps);
    if (scheduledTableGaps.length === 0) scheduledFullTables.add(table);
    if (confirmedTableGaps.length === 0) confirmedFullTables.add(table);
  }

  const scheduledMissing = [...scheduledGaps.entries()]
    .filter(([, gaps]) => gaps.length > 0)
    .map(([table]) => table);
  const confirmedMissing = [...confirmedGaps.entries()]
    .filter(([, gaps]) => gaps.length > 0)
    .map(([table]) => table);

  return {
    result: {
      scheduledTables: scheduledFullTables.size,
      confirmedTables: confirmedFullTables.size,
      plannedOnlyTables: Math.max(
        0,
        scheduledFullTables.size - confirmedFullTables.size,
      ),
      scheduledGapRanges: tableRanges(scheduledMissing),
      confirmedGapRanges: tableRanges(confirmedMissing),
      scheduledUncoveredMinutes: [...scheduledGaps.values()].reduce(
        (total, gaps) => total + gapMinutes(gaps),
        0,
      ),
      confirmedUncoveredMinutes: [...confirmedGaps.values()].reduce(
        (total, gaps) => total + gapMinutes(gaps),
        0,
      ),
    },
    scheduledGaps,
    confirmedGaps,
    confirmedFullTables,
  };
}

function emptyKind(): WitnessCoverageKindResult {
  return {
    scheduledTables: 0,
    confirmedTables: 0,
    plannedOnlyTables: 0,
    scheduledGapRanges: [],
    confirmedGapRanges: [],
    scheduledUncoveredMinutes: 0,
    confirmedUncoveredMinutes: 0,
  };
}

function addKind(
  target: WitnessCoverageKindResult,
  source: WitnessCoverageKindResult,
): WitnessCoverageKindResult {
  return {
    scheduledTables: target.scheduledTables + source.scheduledTables,
    confirmedTables: target.confirmedTables + source.confirmedTables,
    plannedOnlyTables: target.plannedOnlyTables + source.plannedOnlyTables,
    scheduledGapRanges: [],
    confirmedGapRanges: [],
    scheduledUncoveredMinutes:
      target.scheduledUncoveredMinutes + source.scheduledUncoveredMinutes,
    confirmedUncoveredMinutes:
      target.confirmedUncoveredMinutes + source.confirmedUncoveredMinutes,
  };
}

function dateOnly(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return new Date(value).toISOString().slice(0, 10);
}

export function buildExactWitnessCoverage(
  places: WitnessCoveragePlaceInput[],
  windows: WitnessCoverageWindowInput[],
  assignments: WitnessCoverageAssignmentInput[],
): ExactWitnessCoverage {
  const windowsByPlace = new Map<string, WitnessCoverageWindowInput[]>();
  for (const window of windows) {
    const current = windowsByPlace.get(window.puestoId) ?? [];
    current.push(window);
    windowsByPlace.set(window.puestoId, current);
  }

  const assignmentsByWindow = new Map<
    string,
    WitnessCoverageAssignmentInput[]
  >();
  for (const assignment of assignments) {
    const current = assignmentsByWindow.get(assignment.coverageWindowId) ?? [];
    current.push(assignment);
    assignmentsByWindow.set(assignment.coverageWindowId, current);
  }

  const placeResults = places.map((puesto): WitnessCoveragePlaceResult => {
    const placeWindows = (windowsByPlace.get(puesto.id) ?? []).sort(
      (left, right) => asMillis(left.startsAt) - asMillis(right.startsAt),
    );
    const placeAssignments = assignments.filter(
      ({ puestoId, status }) =>
        puestoId === puesto.id && status !== 'CANCELLED',
    );
    const ineligibleAssignmentCount = placeAssignments.filter(
      ({ witnessEligible }) => !witnessEligible,
    ).length;
    const expectedTables =
      Number.isInteger(puesto.expectedTables) &&
      (puesto.expectedTables ?? 0) > 0
        ? (puesto.expectedTables as number)
        : 0;
    let primary = emptyKind();
    let backup = emptyKind();

    const windowResults =
      expectedTables === 0
        ? []
        : placeWindows.map((window): WitnessCoverageWindowResult => {
            const windowStart = asMillis(window.startsAt);
            const windowEnd = asMillis(window.endsAt);
            const windowAssignments = (
              assignmentsByWindow.get(window.id) ?? []
            ).filter(({ puestoId }) => puestoId === puesto.id);
            const primaryWindow = coverageForKind(
              expectedTables,
              windowStart,
              windowEnd,
              windowAssignments,
              'PRIMARY',
            );
            const backupWindow = coverageForKind(
              expectedTables,
              windowStart,
              windowEnd,
              windowAssignments,
              'BACKUP',
            );
            const bothConfirmedTables = [
              ...primaryWindow.confirmedFullTables,
            ].filter((table) =>
              backupWindow.confirmedFullTables.has(table),
            ).length;
            primary = addKind(primary, primaryWindow.result);
            backup = addKind(backup, backupWindow.result);

            return {
              window: {
                id: window.id,
                localDate: dateOnly(window.localDate),
                startsAt: asIso(windowStart),
                endsAt: asIso(windowEnd),
                timeZone: window.timeZone,
                utcOffsetMinutes: window.utcOffsetMinutes,
                durationMinutes: Math.ceil((windowEnd - windowStart) / 60_000),
              },
              primary: primaryWindow.result,
              backup: backupWindow.result,
              primaryScheduledTemporalGaps: groupTableGaps(
                primaryWindow.scheduledGaps,
              ),
              primaryConfirmedTemporalGaps: groupTableGaps(
                primaryWindow.confirmedGaps,
              ),
              backupScheduledTemporalGaps: groupTableGaps(
                backupWindow.scheduledGaps,
              ),
              backupConfirmedTemporalGaps: groupTableGaps(
                backupWindow.confirmedGaps,
              ),
              bothConfirmedTables,
              fullyConfirmed: bothConfirmedTables === expectedTables,
            };
          });

    const bothConfirmedTables = windowResults.reduce(
      (total, window) => total + window.bothConfirmedTables,
      0,
    );
    return {
      puesto,
      configurationReady: expectedTables > 0,
      hasCoverageWindow: placeWindows.length > 0,
      primary,
      backup,
      bothConfirmedTables,
      fullyConfirmed:
        expectedTables > 0 &&
        windowResults.length > 0 &&
        windowResults.every(({ fullyConfirmed }) => fullyConfirmed) &&
        ineligibleAssignmentCount === 0,
      ineligibleAssignmentCount,
      windows: windowResults,
    };
  });

  const expectedTableWindows = placeResults.reduce(
    (total, place) =>
      total +
      (place.configurationReady
        ? (place.puesto.expectedTables ?? 0) * place.windows.length
        : 0),
    0,
  );
  const sum = (selector: (place: WitnessCoveragePlaceResult) => number) =>
    placeResults.reduce((total, place) => total + selector(place), 0);
  const confirmedPrimaryTables = sum(
    ({ primary: value }) => value.confirmedTables,
  );
  const confirmedBackupTables = sum(
    ({ backup: value }) => value.confirmedTables,
  );
  const confirmedBothTables = sum(({ bothConfirmedTables: value }) => value);
  const placesWithoutExpectedTables = placeResults.filter(
    ({ configurationReady }) => !configurationReady,
  ).length;
  const placesWithoutCoverageWindows = placeResults.filter(
    ({ configurationReady, hasCoverageWindow }) =>
      configurationReady && !hasCoverageWindow,
  ).length;
  const ineligibleAssignmentCount = sum(
    ({ ineligibleAssignmentCount: value }) => value,
  );

  return {
    expectedPollingPlaces: placeResults.length,
    placesWithoutExpectedTables,
    placesWithoutCoverageWindows,
    coverageWindowCount: windows.length,
    expectedTables: expectedTableWindows,
    expectedTableWindows,
    scheduledPrimaryTables: sum(({ primary: value }) => value.scheduledTables),
    scheduledBackupTables: sum(({ backup: value }) => value.scheduledTables),
    confirmedPrimaryTables,
    confirmedBackupTables,
    confirmedBothTables,
    missingPrimaryTables: expectedTableWindows - confirmedPrimaryTables,
    missingBackupTables: expectedTableWindows - confirmedBackupTables,
    fullyConfirmedTables: confirmedBothTables,
    confirmedPrimaryUncoveredMinutes: sum(
      ({ primary: value }) => value.confirmedUncoveredMinutes,
    ),
    confirmedBackupUncoveredMinutes: sum(
      ({ backup: value }) => value.confirmedUncoveredMinutes,
    ),
    fullyConfirmed:
      placeResults.length > 0 &&
      placesWithoutExpectedTables === 0 &&
      placesWithoutCoverageWindows === 0 &&
      expectedTableWindows > 0 &&
      confirmedBothTables === expectedTableWindows &&
      ineligibleAssignmentCount === 0,
    ineligibleAssignmentCount,
    places: placeResults,
  };
}
