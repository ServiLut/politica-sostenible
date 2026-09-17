import { createHash } from 'node:crypto';

export type ElectoralCalendarCommandName =
  | 'RELEASE_STAGE'
  | 'RELEASE_VALIDATE'
  | 'RELEASE_ACTIVATE'
  | 'MILESTONE_RESULT_RECORD'
  | 'MILESTONE_RESULT_REVIEW';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => key !== 'payloadSha256' && entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function canonicalElectoralCalendarCommand(
  type: ElectoralCalendarCommandName,
  input: object,
) {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export function computeElectoralCalendarCommandSha256(
  type: ElectoralCalendarCommandName,
  input: object,
) {
  return createHash('sha256')
    .update(canonicalElectoralCalendarCommand(type, input), 'utf8')
    .digest('hex');
}
