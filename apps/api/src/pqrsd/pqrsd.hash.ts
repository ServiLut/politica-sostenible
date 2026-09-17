import { createHash } from 'node:crypto';

export type PqrsdCommandName =
  | 'RULE_PACKAGE_CREATE'
  | 'RULE_PACKAGE_REVIEW'
  | 'DOSSIER_CREATE'
  | 'DOCUMENT_ATTACH'
  | 'DOCUMENT_REVIEW'
  | 'ACKNOWLEDGEMENT_RECORD'
  | 'CLASSIFICATION_PROPOSE'
  | 'CLASSIFICATION_REVIEW'
  | 'ASSIGNMENT_RECORD'
  | 'TRANSFER_PROPOSE'
  | 'TRANSFER_REVIEW'
  | 'TRANSFER_ATTEMPT_RECORD'
  | 'EXTENSION_PROPOSE'
  | 'EXTENSION_REVIEW'
  | 'RESPONSE_VERSION_CREATE'
  | 'RESPONSE_REVIEW'
  | 'RESPONSE_AUTHORIZE'
  | 'DELIVERY_ATTEMPT_RECORD'
  | 'DOSSIER_CLOSE'
  | 'DOSSIER_REOPEN';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => key !== 'payloadSha256' && entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function canonicalPqrsdCommand(
  type: PqrsdCommandName,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export function computePqrsdCommandSha256(
  type: PqrsdCommandName,
  input: object,
): string {
  return createHash('sha256')
    .update(canonicalPqrsdCommand(type, input), 'utf8')
    .digest('hex');
}
