import { createHash } from 'node:crypto';

export const INVENTORY_COMMAND_NAMES = [
  'WAREHOUSE_CREATE',
  'ITEM_IMPORT',
  'STOCK_RECEIVE',
  'DISPATCH',
  'RECEIVE',
  'RETURN',
  'RECONCILE',
  'INCIDENT_REPORT',
] as const;

export type InventoryCommandName = (typeof INVENTORY_COMMAND_NAMES)[number];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalInventoryCommandPayload(
  type: InventoryCommandName,
  value: object,
): string {
  const payload = { ...(value as Record<string, unknown>) };
  delete payload.payloadSha256;
  return JSON.stringify(canonicalize({ type, ...payload }));
}

export function computeInventoryCommandSha256(
  type: InventoryCommandName,
  value: object,
): string {
  return createHash('sha256')
    .update(canonicalInventoryCommandPayload(type, value), 'utf8')
    .digest('hex');
}
