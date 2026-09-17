import { expect, test } from '@playwright/test';
import {
  canonicalFinanceCloseoutPayload,
  computeFinanceCloseoutPayloadSha256,
} from './finance-closeout-api';

test.describe('finance closeout API command integrity', () => {
  test('matches canonical ordering and omits a supplied digest', async () => {
    const first = {
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
      subjectCode: 'CAND-1',
      subjectName: 'Candidatura uno',
    };
    const second = {
      subjectName: 'Candidatura uno',
      payloadSha256: 'a'.repeat(64),
      subjectCode: 'CAND-1',
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
    };
    await expect(
      computeFinanceCloseoutPayloadSha256('DOSSIER_CREATE', first),
    ).resolves.toBe(
      await computeFinanceCloseoutPayloadSha256('DOSSIER_CREATE', second),
    );
    expect(canonicalFinanceCloseoutPayload('DOSSIER_CREATE', second)).not.toContain(
      'payloadSha256',
    );
  });

  test('binds route identifiers and nested reconciliation lines', async () => {
    const base = {
      clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
      dossierId: 'dossier-a',
      lines: [{ lineNumber: 1, debit: 0, credit: 120 }],
    };
    expect(
      await computeFinanceCloseoutPayloadSha256(
        'REPORT_VERSION_CREATE',
        base,
      ),
    ).not.toBe(
      await computeFinanceCloseoutPayloadSha256('REPORT_VERSION_CREATE', {
        ...base,
        dossierId: 'dossier-b',
      }),
    );
  });
});
