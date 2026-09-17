import { createHash } from 'node:crypto';

export type SignatureCommandName =
  | 'PLAN_CREATE'
  | 'BATCH_CREATE'
  | 'BATCH_ISSUE'
  | 'BATCH_RETURN'
  | 'BATCH_INTERNAL_REVIEW'
  | 'BATCH_DELIVER_TO_COMMITTEE'
  | 'BATCH_SUBMIT_TO_AUTHORITY'
  | 'BATCH_QUARANTINE'
  | 'BATCH_RELEASE_QUARANTINE'
  | 'AUTHORITY_RESULT_RECORD'
  | 'AUTHORITY_RESULT_REVIEW'
  | 'AUTHORITY_RESULT_LINK';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => key !== 'payloadSha256' && entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function canonicalSignatureCommand(
  type: SignatureCommandName,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export function computeSignatureCommandSha256(
  type: SignatureCommandName,
  input: object,
): string {
  return createHash('sha256')
    .update(canonicalSignatureCommand(type, input), 'utf8')
    .digest('hex');
}
