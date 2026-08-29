import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FinanceStatus } from '../../../prisma/generated/prisma';
import { ReviewFinancialEntryDto } from './review-financial-entry.dto';

describe('ReviewFinancialEntryDto', () => {
  it.each([FinanceStatus.APPROVED, FinanceStatus.REJECTED])(
    'accepts the final review status %s and trims its reason',
    async (status) => {
      const dto = plainToInstance(ReviewFinancialEntryDto, {
        status,
        reviewReason: '  Verificación documental completada.  ',
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
      expect(dto.reviewReason).toBe('Verificación documental completada.');
    },
  );

  it.each([
    FinanceStatus.PENDING,
    FinanceStatus.REPORTED_CNE,
  ])('rejects the non-review status %s', async (status) => {
    const errors = await validate(
      plainToInstance(ReviewFinancialEntryDto, {
        status,
        reviewReason: 'Motivo suficientemente detallado',
      }),
    );

    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });

  it.each(['muy corto', 'x'.repeat(501)])(
    'rejects a reason outside 10..500 characters',
    async (reviewReason) => {
      const errors = await validate(
        plainToInstance(ReviewFinancialEntryDto, {
          status: FinanceStatus.APPROVED,
          reviewReason,
        }),
      );

      expect(errors.some((error) => error.property === 'reviewReason')).toBe(
        true,
      );
    },
  );

  it('rejects client-controlled tenant and reviewer fields', async () => {
    const errors = await validate(
      plainToInstance(ReviewFinancialEntryDto, {
        status: FinanceStatus.APPROVED,
        reviewReason: 'Verificación documental completada.',
        tenantId: 'tenant-attacker',
        reviewedById: 'reviewer-attacker',
        reviewedAt: '2026-08-27T00:00:00.000Z',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['tenantId', 'reviewedById', 'reviewedAt']),
    );
  });
});
