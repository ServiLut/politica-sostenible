import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListProposalsQueryDto } from './list-proposals-query.dto';

describe('ListProposalsQueryDto', () => {
  it('transforms bounded pages and trims search while preserving explicit false', async () => {
    const dto = plainToInstance(ListProposalsQueryDto, {
      page: '2',
      limit: '20',
      search: '  agua  ',
      status: 'DRAFT',
      category: 'HEALTH',
      isPublic: 'false',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      page: 2,
      limit: 20,
      search: 'agua',
      isPublic: 'false',
    });
  });

  it.each([
    { page: '0' },
    { page: '1.5' },
    { page: '1000001' },
    { page: 'Infinity' },
    { limit: '101' },
    { limit: '-1' },
    { search: ['a', 'b'] },
    { search: 'a'.repeat(201) },
    { category: 'UNKNOWN' },
    { status: 'UNKNOWN' },
    { isPublic: 'yes' },
    { tenantId: 'client-controlled' },
  ])('rejects invalid or injected query parameters %j', async (input) => {
    const dto = plainToInstance(ListProposalsQueryDto, input);
    expect(
      (await validate(dto, { whitelist: true, forbidNonWhitelisted: true }))
        .length,
    ).toBeGreaterThan(0);
  });
});
