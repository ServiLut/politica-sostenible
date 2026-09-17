import { createHash } from 'node:crypto';

export const BOGOTA_TIME_ZONE = 'America/Bogota';
export const MAX_VOTING_WINDOW_INCLUSIVE_DAYS = 14;
export const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const BOGOTA_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BOGOTA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  numberingSystem: 'latn',
});

export interface ElectionOperatingWindowInput {
  electionDate: string;
  votingStartDate?: string;
  votingEndDate?: string;
  votingWindowSourceUrl?: string;
  votingWindowReference?: string;
}

export interface NormalizedElectionOperatingWindow {
  electionDate: Date;
  electionDateKey: string;
  votingStartDate: Date;
  votingStartDateKey: string;
  votingEndDate: Date;
  votingEndDateKey: string;
  votingWindowSourceUrl: string | null;
  votingWindowReference: string | null;
  inclusiveDays: number;
}

export interface StoredElectionOperatingWindow {
  tenantId: string;
  operationProfileId: string;
  electionDate: Date;
  votingStartDate: Date;
  votingEndDate: Date;
  votingWindowSourceUrl: string | null;
  votingWindowReference: string | null;
}

/** Returns the civil calendar date at the instant in America/Bogota. */
export function toBogotaDateKey(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new Error('No se puede resolver una fecha invalida en Bogota');
  }
  const parts = BOGOTA_DATE_FORMATTER.formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('No se pudo resolver la fecha calendario de Bogota');
  }
  return `${year}-${month}-${day}`;
}

/** Preserves a PostgreSQL DATE exposed by Prisma as UTC midnight. */
export function toStoredDateOnlyKey(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new Error('No se puede resolver una fecha civil invalida');
  }
  const year = String(value.getUTCFullYear()).padStart(4, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateOnlyFromKey(value: string): Date {
  if (!CIVIL_DATE_PATTERN.test(value)) {
    throw new Error('La fecha civil debe usar el formato YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    toStoredDateOnlyKey(parsed) !== value
  ) {
    throw new Error('La fecha civil no existe en el calendario');
  }
  return parsed;
}

export function normalizeElectionOperatingWindow(
  input: ElectionOperatingWindowInput,
): NormalizedElectionOperatingWindow {
  const electionDate = new Date(input.electionDate);
  if (!Number.isFinite(electionDate.getTime())) {
    throw new Error('La fecha electoral principal no es valida');
  }
  // electionDate is a declared civil date carried through a legacy TIMESTAMP
  // column. Its UTC components preserve YYYY-MM-DD inputs; interpreting UTC
  // midnight as a Bogota instant would incorrectly move it to the prior day.
  const electionDateKey = toStoredDateOnlyKey(electionDate);
  const hasStart = input.votingStartDate !== undefined;
  const hasEnd = input.votingEndDate !== undefined;
  if (hasStart !== hasEnd) {
    throw new Error(
      'El inicio y el fin de la ventana electoral deben declararse juntos',
    );
  }

  const votingStartDateKey = input.votingStartDate ?? electionDateKey;
  const votingEndDateKey = input.votingEndDate ?? electionDateKey;
  const votingStartDate = dateOnlyFromKey(votingStartDateKey);
  const votingEndDate = dateOnlyFromKey(votingEndDateKey);
  if (
    votingStartDateKey > electionDateKey ||
    electionDateKey > votingEndDateKey
  ) {
    throw new Error(
      'La fecha electoral principal debe estar dentro de la ventana electoral',
    );
  }

  const inclusiveDays =
    Math.round(
      (votingEndDate.getTime() - votingStartDate.getTime()) / 86_400_000,
    ) + 1;
  if (inclusiveDays < 1 || inclusiveDays > MAX_VOTING_WINDOW_INCLUSIVE_DAYS) {
    throw new Error(
      `La ventana electoral admite entre 1 y ${MAX_VOTING_WINDOW_INCLUSIVE_DAYS} fechas civiles inclusivas`,
    );
  }

  const sourceUrl = input.votingWindowSourceUrl?.trim() || null;
  const reference = input.votingWindowReference?.trim() || null;
  if (Boolean(sourceUrl) !== Boolean(reference)) {
    throw new Error(
      'La URL fuente y la referencia documental deben declararse juntas',
    );
  }
  if (reference && (reference.length < 10 || reference.length > 500)) {
    throw new Error(
      'La referencia documental debe tener entre 10 y 500 caracteres',
    );
  }
  if (sourceUrl) assertSafeHttpsSource(sourceUrl);
  if (inclusiveDays > 1 && (!sourceUrl || !reference)) {
    throw new Error(
      'Una ventana electoral de varios dias exige fuente HTTPS y referencia documental',
    );
  }

  return {
    electionDate,
    electionDateKey,
    votingStartDate,
    votingStartDateKey,
    votingEndDate,
    votingEndDateKey,
    votingWindowSourceUrl: sourceUrl,
    votingWindowReference: reference,
    inclusiveDays,
  };
}

export function getElectionOperatingWindowError(
  input: ElectionOperatingWindowInput,
): string | null {
  try {
    normalizeElectionOperatingWindow(input);
    return null;
  } catch (error: unknown) {
    return error instanceof Error
      ? error.message
      : 'La ventana electoral no es valida';
  }
}

export function isWithinElectionOperatingWindow(
  instant: Date,
  votingStartDate: Date,
  votingEndDate: Date,
): boolean {
  const currentDateKey = toBogotaDateKey(instant);
  return (
    toStoredDateOnlyKey(votingStartDate) <= currentDateKey &&
    currentDateKey <= toStoredDateOnlyKey(votingEndDate)
  );
}

export function electionOperatingWindowSnapshot(
  input: StoredElectionOperatingWindow,
): string {
  return JSON.stringify({
    schemaVersion: 1,
    tenantId: input.tenantId,
    operationProfileId: input.operationProfileId,
    electionDate: toStoredDateOnlyKey(input.electionDate),
    votingStartDate: toStoredDateOnlyKey(input.votingStartDate),
    votingEndDate: toStoredDateOnlyKey(input.votingEndDate),
    votingWindowSourceUrl: input.votingWindowSourceUrl?.trim() || null,
    votingWindowReference: input.votingWindowReference?.trim() || null,
    timeZone: BOGOTA_TIME_ZONE,
  });
}

export function electionOperatingWindowSha256(
  input: StoredElectionOperatingWindow,
): string {
  return createHash('sha256')
    .update(electionOperatingWindowSnapshot(input), 'utf8')
    .digest('hex');
}

function assertSafeHttpsSource(value: string): void {
  if (value.length > 2_048 || /\s/u.test(value)) {
    throw new Error('La fuente debe ser una URL HTTPS valida y sin espacios');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('La fuente debe ser una URL HTTPS valida');
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      'La fuente debe usar HTTPS y no puede incluir credenciales embebidas',
    );
  }
}
