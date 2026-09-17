import { createHash } from 'node:crypto';

export type FinanceCloseoutCommandName =
  | 'DOSSIER_CREATE'
  | 'BANK_STATEMENT_CREATE'
  | 'IN_KIND_CREATE'
  | 'PAYABLE_CREATE'
  | 'PAYABLE_SETTLE'
  | 'REPORT_VERSION_CREATE'
  | 'REPORT_APPROVAL_RECORD'
  | 'EXTERNAL_EVIDENCE_RECORD'
  | 'EXTERNAL_EVIDENCE_REVIEW';

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

export function canonicalFinanceCloseoutCommand(
  type: FinanceCloseoutCommandName,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export function computeFinanceCloseoutCommandSha256(
  type: FinanceCloseoutCommandName,
  input: object,
): string {
  return createHash('sha256')
    .update(canonicalFinanceCloseoutCommand(type, input), 'utf8')
    .digest('hex');
}
