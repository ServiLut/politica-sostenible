import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FinanceReportScope } from '../../../prisma/generated/prisma';
import { UpsertFinanceSettingsDto } from './upsert-finance-settings.dto';

const validSettings = (overrides: Record<string, unknown> = {}) => ({
  maxTotalBudget: '1000000.50',
  maxPublicityLimit: '250000.25',
  electionName: ' Elecciones territoriales 2027 ',
  electionDate: '2027-10-31',
  reportScope: FinanceReportScope.CANDIDATE,
  officialLimitsReference: ' Resolución CNE 0001 de 2027 ',
  officialLimitsUrl: 'https://www.cne.gov.co/resoluciones/0001',
  reportDeadline: '2027-11-30',
  financialManagerName: ' Gerencia financiera ',
  financialManagerDocument: ' 1234567890 ',
  accountantName: ' Contador responsable ',
  accountantDocument: ' 9876543210 ',
  uniqueAccountBank: ' Banco autorizado ',
  uniqueAccountLastFour: ' 1234 ',
  cuentasClarasCode: ' CC-CANDIDATO-001 ',
  ...overrides,
});

describe('UpsertFinanceSettingsDto', () => {
  it('accepts, normalizes and requires a complete election compliance file', async () => {
    const dto = plainToInstance(UpsertFinanceSettingsDto, validSettings());

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        maxTotalBudget: 1000000.5,
        maxPublicityLimit: 250000.25,
        electionName: 'Elecciones territoriales 2027',
        financialManagerDocument: '1234567890',
        uniqueAccountLastFour: '1234',
        cuentasClarasCode: 'CC-CANDIDATO-001',
      }),
    );
  });

  it('accepts the HTTPS scheme independently of letter casing', async () => {
    const dto = plainToInstance(
      UpsertFinanceSettingsDto,
      validSettings({
        officialLimitsUrl: 'HTTPS://www.cne.gov.co/resoluciones/0001',
      }),
    );

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    { maxTotalBudget: 0 },
    { maxTotalBudget: 100, maxPublicityLimit: 101 },
    { maxTotalBudget: 100.001 },
    { reportDeadline: '2027-10-31' },
    { reportDeadline: '2027-10-30' },
    { officialLimitsUrl: 'http://www.cne.gov.co/resoluciones/0001' },
    { uniqueAccountLastFour: '12A4' },
    { financialManagerDocument: '' },
    { cuentasClarasCode: '=CMD()' },
  ])('rejects an invalid compliance field %#', async (override) => {
    const errors = await validate(
      plainToInstance(UpsertFinanceSettingsDto, validSettings(override)),
    );

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an incomplete legacy-style settings payload', async () => {
    const errors = await validate(
      plainToInstance(UpsertFinanceSettingsDto, {
        maxTotalBudget: 100,
        maxPublicityLimit: 50,
      }),
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'electionName',
        'electionDate',
        'reportScope',
        'officialLimitsReference',
        'officialLimitsUrl',
        'reportDeadline',
        'financialManagerName',
        'financialManagerDocument',
        'accountantName',
        'accountantDocument',
        'uniqueAccountBank',
        'uniqueAccountLastFour',
        'cuentasClarasCode',
      ]),
    );
  });

  it('rejects a client-supplied tenant identifier', async () => {
    const dto = plainToInstance(
      UpsertFinanceSettingsDto,
      validSettings({
        tenantId: 'tenant-attacker',
      }),
    );

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'tenantId' }) as object,
      ]),
    );
  });
});
