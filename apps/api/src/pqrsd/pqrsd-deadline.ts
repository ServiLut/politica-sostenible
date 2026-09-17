import {
  civilDateAt,
  civilDateTimeToUtc,
} from '../electoral-calendar/electoral-calendar.time';

export type PqrsdDayMethod = 'CALENDAR_DAYS' | 'WORKING_DAYS';
export type PqrsdStartRule =
  | 'RECEIPT_DATE'
  | 'NEXT_CALENDAR_DATE'
  | 'NEXT_WORKING_DATE'
  | 'MANUAL_REVIEW';
export type PqrsdCalendarException = Readonly<{
  localDate: string;
  type: 'NON_WORKING' | 'WORKING_OVERRIDE';
  label: string;
  sourceReference: string;
}>;

export type DeadlineDayTrace = Readonly<{
  localDate: string;
  included: boolean;
  reason:
    | 'CALENDAR_DAY'
    | 'CONFIGURED_WORKING_DAY'
    | 'CONFIGURED_NON_WORKING_WEEKDAY'
    | 'NON_WORKING_EXCEPTION'
    | 'WORKING_OVERRIDE';
  sourceReference?: string;
}>;

export type PqrsdDeadlineResult = Readonly<{
  calculationStatus: 'CALCULATED' | 'CALCULATION_REQUIRES_REVIEW';
  startLocalDate: string;
  startExplanation: string;
  originalDueLocalDate: string | null;
  currentDueLocalDate: string | null;
  dueAt: Date | null;
  includedDays: DeadlineDayTrace[];
  excludedDays: DeadlineDayTrace[];
  calculationTrace: {
    timeZone: string;
    durationDays: number;
    dayMethod: PqrsdDayMethod;
    startRule: PqrsdStartRule;
    nonWorkingWeekdays: number[];
    exceptionCount: number;
    reviewReason?: string;
  };
}>;

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function assertCivilDate(value: string): void {
  if (!CIVIL_DATE.test(value)) throw new Error('invalid civil date');
  const instant = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(instant.getTime()) ||
    instant.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('invalid civil date');
  }
}

function addCivilDays(value: string, amount: number): string {
  assertCivilDate(value);
  const instant = new Date(`${value}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + amount);
  return instant.toISOString().slice(0, 10);
}

function weekday(value: string): number {
  assertCivilDate(value);
  return new Date(`${value}T00:00:00.000Z`).getUTCDay();
}

function traceDay(
  localDate: string,
  dayMethod: PqrsdDayMethod,
  nonWorkingWeekdays: ReadonlySet<number>,
  exceptions: ReadonlyMap<string, PqrsdCalendarException>,
): DeadlineDayTrace {
  if (dayMethod === 'CALENDAR_DAYS') {
    return { localDate, included: true, reason: 'CALENDAR_DAY' };
  }
  const exception = exceptions.get(localDate);
  if (exception?.type === 'WORKING_OVERRIDE') {
    return {
      localDate,
      included: true,
      reason: 'WORKING_OVERRIDE',
      sourceReference: exception.sourceReference,
    };
  }
  if (exception?.type === 'NON_WORKING') {
    return {
      localDate,
      included: false,
      reason: 'NON_WORKING_EXCEPTION',
      sourceReference: exception.sourceReference,
    };
  }
  if (nonWorkingWeekdays.has(weekday(localDate))) {
    return {
      localDate,
      included: false,
      reason: 'CONFIGURED_NON_WORKING_WEEKDAY',
    };
  }
  return { localDate, included: true, reason: 'CONFIGURED_WORKING_DAY' };
}

export function calculatePqrsdDeadline(
  input: Readonly<{
    receivedAt: Date;
    timeZone: string;
    durationDays: number;
    dayMethod: PqrsdDayMethod;
    startRule: PqrsdStartRule;
    nonWorkingWeekdays: readonly number[];
    exceptions: readonly PqrsdCalendarException[];
  }>,
): PqrsdDeadlineResult {
  if (
    !Number.isInteger(input.durationDays) ||
    input.durationDays < 1 ||
    input.durationDays > 365
  ) {
    throw new Error(
      'durationDays must be an explicit integer between 1 and 365',
    );
  }
  if (
    new Set(input.nonWorkingWeekdays).size !==
      input.nonWorkingWeekdays.length ||
    input.nonWorkingWeekdays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6,
    )
  ) {
    throw new Error(
      'nonWorkingWeekdays must be an explicit unique subset of 0..6',
    );
  }
  const exceptionMap = new Map<string, PqrsdCalendarException>();
  for (const exception of input.exceptions) {
    assertCivilDate(exception.localDate);
    if (exceptionMap.has(exception.localDate)) {
      throw new Error('calendar package has contradictory duplicate dates');
    }
    exceptionMap.set(exception.localDate, exception);
  }
  const excludedWeekdays = new Set(input.nonWorkingWeekdays);
  const receiptDate = civilDateAt(input.receivedAt, input.timeZone);

  if (input.startRule === 'MANUAL_REVIEW') {
    return {
      calculationStatus: 'CALCULATION_REQUIRES_REVIEW',
      startLocalDate: receiptDate,
      startExplanation:
        'La regla aprobada exige determinacion humana documentada.',
      originalDueLocalDate: null,
      currentDueLocalDate: null,
      dueAt: null,
      includedDays: [],
      excludedDays: [],
      calculationTrace: {
        timeZone: input.timeZone,
        durationDays: input.durationDays,
        dayMethod: input.dayMethod,
        startRule: input.startRule,
        nonWorkingWeekdays: [...input.nonWorkingWeekdays],
        exceptionCount: input.exceptions.length,
        reviewReason: 'PACKAGE_REQUIRES_MANUAL_REVIEW',
      },
    };
  }

  let cursor =
    input.startRule === 'RECEIPT_DATE'
      ? receiptDate
      : addCivilDays(receiptDate, 1);
  if (input.startRule === 'NEXT_WORKING_DATE') {
    let inspected = 0;
    while (
      !traceDay(cursor, 'WORKING_DAYS', excludedWeekdays, exceptionMap).included
    ) {
      cursor = addCivilDays(cursor, 1);
      inspected += 1;
      if (inspected > 370) {
        throw new Error('calendar package does not expose a next working date');
      }
    }
  }
  const startLocalDate = cursor;
  const includedDays: DeadlineDayTrace[] = [];
  const excludedDays: DeadlineDayTrace[] = [];
  let inspected = 0;
  while (includedDays.length < input.durationDays) {
    const trace = traceDay(
      cursor,
      input.dayMethod,
      excludedWeekdays,
      exceptionMap,
    );
    (trace.included ? includedDays : excludedDays).push(trace);
    cursor = addCivilDays(cursor, 1);
    inspected += 1;
    if (inspected > 5_000) {
      throw new Error('calendar package cannot produce a finite deadline');
    }
  }
  const dueLocalDate = includedDays.at(-1)!.localDate;
  try {
    const dueAt = civilDateTimeToUtc(dueLocalDate, '23:59', input.timeZone);
    return {
      calculationStatus: 'CALCULATED',
      startLocalDate,
      startExplanation: `Inicio ${input.startRule}; conteo ${input.dayMethod} segun paquete aprobado.`,
      originalDueLocalDate: dueLocalDate,
      currentDueLocalDate: dueLocalDate,
      dueAt,
      includedDays,
      excludedDays,
      calculationTrace: {
        timeZone: input.timeZone,
        durationDays: input.durationDays,
        dayMethod: input.dayMethod,
        startRule: input.startRule,
        nonWorkingWeekdays: [...input.nonWorkingWeekdays],
        exceptionCount: input.exceptions.length,
      },
    };
  } catch (error) {
    return {
      calculationStatus: 'CALCULATION_REQUIRES_REVIEW',
      startLocalDate,
      startExplanation: `Inicio ${input.startRule}; la conversion de la fecha limite requiere revision.`,
      originalDueLocalDate: null,
      currentDueLocalDate: null,
      dueAt: null,
      includedDays,
      excludedDays,
      calculationTrace: {
        timeZone: input.timeZone,
        durationDays: input.durationDays,
        dayMethod: input.dayMethod,
        startRule: input.startRule,
        nonWorkingWeekdays: [...input.nonWorkingWeekdays],
        exceptionCount: input.exceptions.length,
        reviewReason:
          error instanceof Error ? error.message : 'AMBIGUOUS_CIVIL_DEADLINE',
      },
    };
  }
}
