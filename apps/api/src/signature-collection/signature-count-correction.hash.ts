import { createHash } from 'node:crypto';

export type SignatureCountCorrectionCommandName = 'PROPOSE' | 'DECIDE';

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

export function canonicalSignatureCountCorrectionCommand(
  type: SignatureCountCorrectionCommandName,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export function computeSignatureCountCorrectionSha256(
  type: SignatureCountCorrectionCommandName,
  input: object,
): string {
  return createHash('sha256')
    .update(canonicalSignatureCountCorrectionCommand(type, input), 'utf8')
    .digest('hex');
}
