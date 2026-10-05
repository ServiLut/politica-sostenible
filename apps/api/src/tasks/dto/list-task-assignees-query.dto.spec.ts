import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListTaskAssigneesQueryDto } from './list-task-assignees-query.dto';

describe('ListTaskAssigneesQueryDto HTTP boundary', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const parse = (value: unknown) =>
    pipe.transform(value, {
      type: 'query',
      metatype: ListTaskAssigneesQueryDto,
    });

  it('defaults to a bounded page and trims the search without dropping explicit pagination', async () => {
    await expect(parse({})).resolves.toMatchObject({ page: 1, limit: 20 });
    await expect(
      parse({ page: '3', limit: '50', search: '  Ana  ' }),
    ).resolves.toMatchObject({ page: 3, limit: 50, search: 'Ana' });
    await expect(parse({ search: '   ' })).resolves.toMatchObject({
      search: '',
    });
  });

  it.each([
    { limit: '0' },
    { limit: '51' },
    { limit: '1.5' },
    { limit: 'Infinity' },
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: '100001' },
    { search: 'x'.repeat(101) },
    { search: ['Ana', 'Luz'] },
    { tenantId: 'tenant-b' },
    { role: 'ADMIN' },
    { mode: 'CAMPAIGN' },
  ])(
    'rejects invalid bounds or caller-supplied authority: %j',
    async (value) => {
      await expect(parse(value)).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
