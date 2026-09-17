import {
  canonicalFinanceCloseoutCommand,
  computeFinanceCloseoutCommandSha256,
} from './finance-closeout.hash';

describe('finance closeout canonical command integrity', () => {
  it('is stable across object key order and excludes the supplied digest', () => {
    const left = {
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
      subjectCode: 'CAND-1',
      subjectName: 'Candidatura uno',
    };
    const right = {
      subjectName: 'Candidatura uno',
      payloadSha256: 'f'.repeat(64),
      subjectCode: 'CAND-1',
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
    };
    expect(computeFinanceCloseoutCommandSha256('DOSSIER_CREATE', left)).toBe(
      computeFinanceCloseoutCommandSha256('DOSSIER_CREATE', right),
    );
    expect(
      canonicalFinanceCloseoutCommand('DOSSIER_CREATE', right),
    ).not.toContain('payloadSha256');
  });

  it('binds command type and nested bank lines', () => {
    const input = {
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
      lines: [{ lineNumber: 1, debit: 100, credit: 0 }],
    };
    expect(
      computeFinanceCloseoutCommandSha256('BANK_STATEMENT_CREATE', input),
    ).not.toBe(computeFinanceCloseoutCommandSha256('PAYABLE_CREATE', input));
  });
});
