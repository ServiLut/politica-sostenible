import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TerritoryOverviewQueryDto } from './territory-overview-query.dto';

const parse = async (input: object) => {
  const dto = plainToInstance(TerritoryOverviewQueryDto, input);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
};

describe('TerritoryOverviewQueryDto', () => {
  it('applies bounded defaults with the existing geographic defaults', async () => {
    const { dto, errors } = await parse({});
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({
      level: 'DEPARTAMENTO',
      metric: 'E14_COVERAGE',
      activity: 'ACTIVE',
      page: 1,
      limit: 20,
    });
  });

  it('accepts and normalizes a complete paginated search', async () => {
    const { dto, errors } = await parse({
      level: 'MUNICIPIO',
      metric: 'OPEN_CASES',
      parentId: ' department-a ',
      search: ' Medellín ',
      activity: 'ALL',
      page: '3',
      limit: '50',
    });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({
      search: 'Medellín',
      parentId: 'department-a',
      page: 3,
      limit: 50,
    });
  });

  it.each([
    { page: 0 },
    { page: -1 },
    { page: '1.2' },
    { page: '1e3' },
    { page: true },
    { page: null },
    { page: [] },
    { page: Number.MAX_SAFE_INTEGER + 1 },
    { limit: '51' },
    { limit: 0 },
    { limit: Infinity },
    { limit: NaN },
    { limit: null },
    { limit: false },
    { limit: {} },
    { activity: 'NONE' },
    { activity: null },
    { search: ['x'] },
    { search: 'x'.repeat(81) },
    { level: 'CITY' },
    { metric: 'RAW_PEOPLE' },
    { parentId: '../tenant-b' },
    { tenantId: 'tenant-b' },
  ])('rejects malformed or unauthorized input %j', async (input) => {
    expect((await parse(input)).errors.length).toBeGreaterThan(0);
  });

  it('accepts 80 search characters and treats whitespace-only search as absent', async () => {
    expect((await parse({ search: 'x'.repeat(80) })).errors).toEqual([]);
    const { dto, errors } = await parse({ search: '   ' });
    expect(errors).toEqual([]);
    expect(dto.search).toBeUndefined();
  });
});
