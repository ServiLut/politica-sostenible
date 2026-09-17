import { createHash } from 'node:crypto';

export type ScrutinyCommandName =
  | 'COMMISSION_CREATE'
  | 'REQUIREMENT_CONFIGURE'
  | 'SESSION_EVENT_RECORD'
  | 'COVERAGE_CREATE'
  | 'DOCUMENT_CREATE'
  | 'DOCUMENT_REVIEW'
  | 'CUSTODY_EVENT_RECORD'
  | 'DISCREPANCY_CREATE'
  | 'DISCREPANCY_RESOLVE'
  | 'ACTION_CREATE'
  | 'ACTION_VERSION_ADD'
  | 'ACTION_APPROVE'
  | 'ACTION_FILE'
  | 'DECISION_RECORD'
  | 'DECISION_REVIEW'
  | 'DECLARATION_CREATE'
  | 'DECLARATION_REVIEW';

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

export function canonicalScrutinyCommand(
  type: ScrutinyCommandName,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export function computeScrutinyCommandSha256(
  type: ScrutinyCommandName,
  input: object,
): string {
  return createHash('sha256')
    .update(canonicalScrutinyCommand(type, input), 'utf8')
    .digest('hex');
}
