import { computeScrutinyCommandSha256 } from './scrutiny.hash';

describe('scrutiny canonical command hash', () => {
  it('is stable across object key order and ignores only payloadSha256', () => {
    const left = computeScrutinyCommandSha256('DOCUMENT_REVIEW', {
      clientRequestId: '6e927194-7a8f-4d4c-aabd-99b2ead3627d',
      documentId: 'doc-a',
      decision: 'APPROVE',
      payloadSha256: 'f'.repeat(64),
    });
    const right = computeScrutinyCommandSha256('DOCUMENT_REVIEW', {
      decision: 'APPROVE',
      documentId: 'doc-a',
      payloadSha256: '0'.repeat(64),
      clientRequestId: '6e927194-7a8f-4d4c-aabd-99b2ead3627d',
    });
    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds the command type and resource id', () => {
    const input = {
      clientRequestId: '6e927194-7a8f-4d4c-aabd-99b2ead3627d',
      documentId: 'doc-a',
      expectedVersion: 1,
    };
    expect(computeScrutinyCommandSha256('DOCUMENT_REVIEW', input)).not.toBe(
      computeScrutinyCommandSha256('DECISION_REVIEW', input),
    );
    expect(computeScrutinyCommandSha256('DOCUMENT_REVIEW', input)).not.toBe(
      computeScrutinyCommandSha256('DOCUMENT_REVIEW', {
        ...input,
        documentId: 'doc-b',
      }),
    );
  });
});
