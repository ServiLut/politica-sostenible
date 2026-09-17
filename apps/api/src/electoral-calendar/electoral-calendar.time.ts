import { BadRequestException } from '@nestjs/common';

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CIVIL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

type CivilParts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}>;

export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 3 || value.length > 100) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return value.includes('/') || value === 'UTC';
  } catch {
    return false;
  }
}

function partsAt(instant: Date, timeZone: string): CivilParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

function equalParts(left: CivilParts, right: CivilParts) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

/**
 * Converts an explicit civil date/time using the supplied IANA zone. It fails
 * closed for a nonexistent or ambiguous DST instant instead of guessing.
 */
export function civilDateTimeToUtc(
  localDate: string,
  localTime: string,
  timeZone: string,
): Date {
  const dateMatch = CIVIL_DATE.exec(localDate);
  const timeMatch = CIVIL_TIME.exec(localTime);
  if (!dateMatch || !timeMatch || !isIanaTimeZone(timeZone)) {
    throw new BadRequestException(
      'La fecha, hora civil o zona IANA del hito no es valida',
    );
  }
  const desired: CivilParts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
  const pseudoUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  const offsets = new Set<number>();
  for (const deltaDays of [-183, -2, -1, 0, 1, 2, 183]) {
    const probe = new Date(pseudoUtc + deltaDays * 86_400_000);
    const civil = partsAt(probe, timeZone);
    offsets.add(
      Date.UTC(
        civil.year,
        civil.month - 1,
        civil.day,
        civil.hour,
        civil.minute,
      ) - probe.getTime(),
    );
  }
  const candidates = [...offsets]
    .map((offset) => new Date(pseudoUtc - offset))
    .filter((candidate) => equalParts(partsAt(candidate, timeZone), desired));
  const unique = [
    ...new Map(candidates.map((date) => [date.getTime(), date])).values(),
  ];
  if (unique.length !== 1) {
    throw new BadRequestException(
      unique.length === 0
        ? 'La hora civil no existe en la zona IANA seleccionada'
        : 'La hora civil es ambigua en la zona IANA seleccionada',
    );
  }
  return unique[0];
}

export function civilDateAt(instant: Date, timeZone: string): string {
  if (!isIanaTimeZone(timeZone)) {
    throw new BadRequestException('La zona horaria IANA no es valida');
  }
  const parts = partsAt(instant, timeZone);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
