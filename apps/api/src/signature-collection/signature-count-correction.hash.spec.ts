import {
  canonicalSignatureCountCorrectionCommand,
  computeSignatureCountCorrectionSha256,
} from './signature-count-correction.hash';

describe('signature count-correction canonical hash', () => {
  it('is deterministic, route-bound and excludes only payloadSha256', () => {
    const left = {
      batchId: 'batch-1',
      clientRequestId: 'e6cb41f9-71a4-45a2-a91d-a7763990896f',
      reason: 'Correccion soportada por recuento fisico independiente.',
      proposedIssuedForms: 10,
      payloadSha256: '0'.repeat(64),
    };
    const right = {
      proposedIssuedForms: 10,
      reason: 'Correccion soportada por recuento fisico independiente.',
      clientRequestId: 'e6cb41f9-71a4-45a2-a91d-a7763990896f',
      batchId: 'batch-1',
      payloadSha256: 'f'.repeat(64),
    };

    expect(canonicalSignatureCountCorrectionCommand('PROPOSE', left)).toBe(
      canonicalSignatureCountCorrectionCommand('PROPOSE', right),
    );
    expect(computeSignatureCountCorrectionSha256('PROPOSE', left)).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(computeSignatureCountCorrectionSha256('PROPOSE', left)).not.toBe(
      computeSignatureCountCorrectionSha256('PROPOSE', {
        ...left,
        batchId: 'batch-2',
      }),
    );
    expect(computeSignatureCountCorrectionSha256('PROPOSE', left)).not.toBe(
      computeSignatureCountCorrectionSha256('DECIDE', left),
    );
  });

  it('canonicalizes nested objects, arrays and dates without mutating them', () => {
    const createdAt = new Date('2026-09-09T17:00:00.000Z');
    const input = {
      z: [{ b: 2, a: 1 }],
      at: createdAt,
      omitted: undefined,
    };

    expect(canonicalSignatureCountCorrectionCommand('DECIDE', input)).toBe(
      '{"at":"2026-09-09T17:00:00.000Z","type":"DECIDE","z":[{"a":1,"b":2}]}',
    );
    expect(input.z[0]).toEqual({ b: 2, a: 1 });
  });
});
