export type PollingPlaceOperationalCode =
  | 'OPEN_FOR_LOGICAL_VOTING_DATE'
  | 'VOTING_DATE_NOT_DOCUMENTED'
  | 'TIME_ZONE_NOT_VERIFIED'
  | 'OUTSIDE_LOGICAL_VOTING_DATE';

export interface PollingPlaceOperationalStatus {
  code: PollingPlaceOperationalCode;
  operationalNow: boolean;
  votingDate: string | null;
  evaluatedLocalDate: string | null;
  timeZone: string | null;
}

interface PollingPlaceTimeInput {
  votingDate: Date | string | null | undefined;
  timeZone: string | null | undefined;
}

export function pollingPlaceOperationalStatus(
  place: PollingPlaceTimeInput,
  evaluatedAt = new Date(),
): PollingPlaceOperationalStatus {
  const votingDate = storedDateOnlyKey(place.votingDate);
  if (!votingDate) {
    return {
      code: 'VOTING_DATE_NOT_DOCUMENTED',
      operationalNow: false,
      votingDate: null,
      evaluatedLocalDate: null,
      timeZone: place.timeZone ?? null,
    };
  }
  if (!place.timeZone || !isIanaTimeZone(place.timeZone)) {
    return {
      code: 'TIME_ZONE_NOT_VERIFIED',
      operationalNow: false,
      votingDate,
      evaluatedLocalDate: null,
      timeZone: place.timeZone ?? null,
    };
  }
  const evaluatedLocalDate = dateKeyInTimeZone(evaluatedAt, place.timeZone);
  const operationalNow = evaluatedLocalDate === votingDate;
  return {
    code: operationalNow
      ? 'OPEN_FOR_LOGICAL_VOTING_DATE'
      : 'OUTSIDE_LOGICAL_VOTING_DATE',
    operationalNow,
    votingDate,
    evaluatedLocalDate,
    timeZone: place.timeZone,
  };
}

export function dateKeyInTimeZone(value: Date, timeZone: string): string {
  if (!Number.isFinite(value.getTime()) || !isIanaTimeZone(timeZone)) {
    throw new RangeError('Fecha o zona horaria operativa invalida');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) {
    throw new RangeError('No fue posible calcular la fecha civil operativa');
  }
  return `${year}-${month}-${day}`;
}

export function storedDateOnlyKey(
  value: Date | string | null | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})(?:T|$)/u.exec(value);
    return match?.[1] ?? null;
  }
  if (!Number.isFinite(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

export function isIanaTimeZone(value: string): boolean {
  if (
    value.length > 100 ||
    !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)+$/u.test(value)
  ) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}
