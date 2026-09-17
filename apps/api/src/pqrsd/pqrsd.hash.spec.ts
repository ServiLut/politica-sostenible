import { createHash } from 'node:crypto';
import { canonicalPqrsdCommand, computePqrsdCommandSha256 } from './pqrsd.hash';

describe('PQRSD canonical command hashing', () => {
  it('is deterministic across object key order and excludes the transmitted digest', () => {
    const left = {
      expectedVersion: 4,
      rationale: 'Decision documentada',
      nested: { z: 2, a: 1 },
      payloadSha256: '0'.repeat(64),
    };
    const right = {
      nested: { a: 1, z: 2 },
      rationale: 'Decision documentada',
      expectedVersion: 4,
    };

    expect(computePqrsdCommandSha256('RESPONSE_REVIEW', left)).toBe(
      computePqrsdCommandSha256('RESPONSE_REVIEW', right),
    );
  });

  it('binds the operation name and every route-bound field', () => {
    const payload = { responseId: 'response-a', decision: 'APPROVE' };
    const canonical = canonicalPqrsdCommand('RESPONSE_REVIEW', payload);

    expect(canonical).toBe(
      '{"decision":"APPROVE","responseId":"response-a","type":"RESPONSE_REVIEW"}',
    );
    expect(computePqrsdCommandSha256('RESPONSE_REVIEW', payload)).toBe(
      createHash('sha256').update(canonical, 'utf8').digest('hex'),
    );
    expect(computePqrsdCommandSha256('RESPONSE_AUTHORIZE', payload)).not.toBe(
      computePqrsdCommandSha256('RESPONSE_REVIEW', payload),
    );
  });
});
