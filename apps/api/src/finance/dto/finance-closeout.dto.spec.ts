import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  FinanceBankMatchStatus,
  FinanceReportKind,
} from '../../../prisma/generated/prisma';
import {
  CreateFinanceBankStatementDto,
  CreateFinanceDossierDto,
} from './finance-closeout.dto';

const command = {
  clientRequestId: '123e4567-e89b-42d3-a456-426614174000',
  payloadSha256: 'a'.repeat(64),
};

describe('finance closeout DTO validation', () => {
  it('normalizes a report subject without accepting tenant identity', async () => {
    const dto = plainToInstance(CreateFinanceDossierDto, {
      ...command,
      tenantId: 'attacker-tenant',
      kind: FinanceReportKind.CANDIDATE,
      subjectCode: ' cand-01 ',
      subjectName: ' Candidatura municipal ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.subjectCode).toBe('CAND-01');
    expect(dto.subjectName).toBe('Candidatura municipal');
    expect(Object.prototype.hasOwnProperty.call(dto, 'tenantId')).toBe(true);
    // Global ValidationPipe whitelist removes this unknown property before the
    // controller; no DTO ever exposes tenantId as an accepted field.
    expect('tenantId' in CreateFinanceDossierDto.prototype).toBe(false);
  });

  it('validates nested statement lines and rejects malformed hashes', async () => {
    const dto = plainToInstance(CreateFinanceBankStatementDto, {
      ...command,
      payloadSha256: 'NOT-A-HASH',
      bankName: 'Banco de prueba',
      accountLastFour: '1234',
      periodStartsAt: '2026-08-01',
      periodEndsAt: '2026-08-31',
      openingBalance: 0,
      closingBalance: 100,
      storagePath: 'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000.pdf',
      statementSha256: 'b'.repeat(64),
      lines: [
        {
          lineNumber: 0,
          occurredAt: 'not-a-date',
          bankReference: 'R-1',
          description: 'Movimiento',
          debit: 0,
          credit: 100,
          matchStatus: FinanceBankMatchStatus.MATCHED,
        },
      ],
    });
    const errors = await validate(dto);
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['payloadSha256', 'lines']),
    );
  });

  it('accepts a bounded, typed statement payload', async () => {
    const dto = plainToInstance(CreateFinanceBankStatementDto, {
      ...command,
      bankName: 'Banco de prueba',
      accountLastFour: '1234',
      periodStartsAt: '2026-08-01',
      periodEndsAt: '2026-08-31',
      openingBalance: 0,
      closingBalance: 100,
      storagePath: 'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000.pdf',
      statementSha256: 'b'.repeat(64),
      lines: [
        {
          lineNumber: 1,
          occurredAt: '2026-08-02',
          bankReference: 'R-1',
          description: 'Ingreso conciliado',
          debit: 0,
          credit: 100,
          matchStatus: FinanceBankMatchStatus.MATCHED,
          matchedEntryId: 'entry-a',
        },
      ],
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
