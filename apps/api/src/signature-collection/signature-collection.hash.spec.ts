import {
  canonicalSignatureCommand,
  computeSignatureCommandSha256,
} from './signature-collection.hash';

describe('signature collection command hashing', () => {
  it('is stable across key order and never hashes the supplied hash itself', () => {
    const left = computeSignatureCommandSha256('BATCH_CREATE', {
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
      code: 'LOTE-01',
      plannedForms: 20,
      payloadSha256: 'f'.repeat(64),
    });
    const right = computeSignatureCommandSha256('BATCH_CREATE', {
      plannedForms: 20,
      code: 'LOTE-01',
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
    });
    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('binds a path command to the exact batch', () => {
    const dto = {
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
      expectedVersion: 1,
    };
    expect(
      computeSignatureCommandSha256('BATCH_ISSUE', {
        batchId: 'batch-a',
        ...dto,
      }),
    ).not.toBe(
      computeSignatureCommandSha256('BATCH_ISSUE', {
        batchId: 'batch-b',
        ...dto,
      }),
    );
  });

  it('emits one recursively sorted canonical JSON representation', () => {
    expect(
      canonicalSignatureCommand('PLAN_CREATE', {
        z: 1,
        nested: { z: true, a: false },
        a: 2,
      }),
    ).toBe('{"a":2,"nested":{"a":false,"z":true},"type":"PLAN_CREATE","z":1}');
  });
});
