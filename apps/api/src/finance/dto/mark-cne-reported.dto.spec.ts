import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MarkCneReportedDto } from './mark-cne-reported.dto';

describe('MarkCneReportedDto', () => {
  it('requires and trims both the declared reference and private receipt path', async () => {
    const dto = plainToInstance(MarkCneReportedDto, {
      externalReference: '  CC-2026/004219  ',
      cneReportEvidenceUrl:
        '  tenant-a/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({
      externalReference: 'CC-2026/004219',
      cneReportEvidenceUrl:
        'tenant-a/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
    });
  });

  it.each([
    {
      externalReference: 'CC-2026/004219',
      cneReportEvidenceUrl: undefined,
      invalidField: 'cneReportEvidenceUrl',
    },
    {
      externalReference: 'x',
      cneReportEvidenceUrl:
        'tenant-a/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
      invalidField: 'externalReference',
    },
    {
      externalReference: '<script>alert(1)</script>',
      cneReportEvidenceUrl:
        'tenant-a/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
      invalidField: 'externalReference',
    },
  ])('rejects incomplete external filing evidence', async (payload) => {
    const errors = await validate(plainToInstance(MarkCneReportedDto, payload));

    expect(
      errors.some((error) => error.property === payload.invalidField),
    ).toBe(true);
  });

  it('rejects client-controlled tenant and reporting identity', async () => {
    const errors = await validate(
      plainToInstance(MarkCneReportedDto, {
        externalReference: 'CC-2026/004219',
        cneReportEvidenceUrl:
          'tenant-a/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
        tenantId: 'tenant-attacker',
        cneReportedById: 'attacker',
        platformVerified: true,
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'tenantId',
        'cneReportedById',
        'platformVerified',
      ]),
    );
  });
});
