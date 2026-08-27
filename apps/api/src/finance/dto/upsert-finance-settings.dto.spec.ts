import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertFinanceSettingsDto } from './upsert-finance-settings.dto';

describe('UpsertFinanceSettingsDto', () => {
  it('accepts positive limits when publicity does not exceed the total', async () => {
    const dto = plainToInstance(UpsertFinanceSettingsDto, {
      maxTotalBudget: '1000000.50',
      maxPublicityLimit: '250000.25',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({
      maxTotalBudget: 1000000.5,
      maxPublicityLimit: 250000.25,
    });
  });

  it.each([
    { maxTotalBudget: 0, maxPublicityLimit: 1 },
    { maxTotalBudget: 100, maxPublicityLimit: 101 },
    { maxTotalBudget: 100.001, maxPublicityLimit: 50 },
  ])('rejects invalid financial limits %#', async (input) => {
    const errors = await validate(
      plainToInstance(UpsertFinanceSettingsDto, input),
    );

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a client-supplied tenant identifier', async () => {
    const dto = plainToInstance(UpsertFinanceSettingsDto, {
      tenantId: 'tenant-attacker',
      maxTotalBudget: 100,
      maxPublicityLimit: 50,
    });

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
