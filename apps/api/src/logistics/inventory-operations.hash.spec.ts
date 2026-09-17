import { createHash } from 'node:crypto';
import {
  canonicalInventoryCommandPayload,
  computeInventoryCommandSha256,
} from './inventory-operations.hash';

describe('inventory command canonical hash', () => {
  it('sorts object keys recursively, preserves line order and omits undefined', () => {
    const left = canonicalInventoryCommandPayload('DISPATCH', {
      payloadSha256: 'must-not-be-hashed',
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      purpose: 'Entrega controlada para jornada electoral',
      omitted: undefined,
      lines: [
        { quantity: 2, stockBalanceId: 'balance-b' },
        { stockBalanceId: 'balance-a', quantity: 1 },
      ],
    });
    const right = canonicalInventoryCommandPayload('DISPATCH', {
      lines: [
        { stockBalanceId: 'balance-b', quantity: 2 },
        { quantity: 1, stockBalanceId: 'balance-a' },
      ],
      purpose: 'Entrega controlada para jornada electoral',
      clientRequestId: '11111111-1111-4111-8111-111111111111',
    });

    expect(left).toBe(right);
    expect(left).not.toContain('payloadSha256');
    expect(left.indexOf('balance-b')).toBeLessThan(left.indexOf('balance-a'));
    const parsed = JSON.parse(left) as Record<string, unknown>;
    expect(computeInventoryCommandSha256('DISPATCH', parsed)).toBe(
      createHash('sha256')
        .update(canonicalInventoryCommandPayload('DISPATCH', parsed), 'utf8')
        .digest('hex'),
    );
  });

  it('binds the command type so the same body cannot be replayed as another operation', () => {
    const body = {
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      warehouseId: 'warehouse-a',
    };
    expect(computeInventoryCommandSha256('STOCK_RECEIVE', body)).not.toBe(
      computeInventoryCommandSha256('WAREHOUSE_CREATE', body),
    );
  });
});
