import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListSaasAdminQueryDto } from './list-saas-admin-query.dto';

describe('ListSaasAdminQueryDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const parse = (query: unknown): Promise<ListSaasAdminQueryDto> =>
    pipe.transform(query, {
      type: 'query',
      metatype: ListSaasAdminQueryDto,
    }) as Promise<ListSaasAdminQueryDto>;

  it('provides a bounded first page even when the caller omits the query', async () => {
    expect(await parse({})).toMatchObject({ page: 1, limit: 25 });
  });

  it('parses HTTP numbers and trims the search without changing its meaning', async () => {
    expect(
      await parse({ page: '2', limit: '100', search: '  Equipo Norte  ' }),
    ).toMatchObject({ page: 2, limit: 100, search: 'Equipo Norte' });
  });

  it.each([
    { page: '0' },
    { page: '-1' },
    { page: '100001' },
    { page: '1.5' },
    { page: 'Infinity' },
    { page: ['1', '2'] },
    { limit: '0' },
    { limit: '101' },
    { limit: 'invalid' },
    { search: ['a', 'b'] },
    { search: { contains: 'a' } },
    { search: 'x'.repeat(101) },
    { tenantId: 'client-controlled-tenant' },
    { orderBy: 'email' },
  ])('rejects invalid or unsupported query %j', async (query) => {
    await expect(parse(query)).rejects.toBeInstanceOf(BadRequestException);
  });
});
