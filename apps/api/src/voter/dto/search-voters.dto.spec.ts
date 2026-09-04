import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchVotersDto } from './search-voters.dto';

describe('SearchVotersDto', () => {
  it('normaliza el termino sensible recibido exclusivamente en el body', async () => {
    const dto = plainToInstance(SearchVotersDto, {
      page: '2',
      limit: '10',
      search: '  +57 (300) 123-4567  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 10,
      search: '+57 (300) 123-4567',
    });
  });

  it.each([
    [{ page: 1, limit: 25 }, 'search'],
    [{ page: 1, limit: 25, search: '   ' }, 'search'],
    [{ page: 1, limit: 25, search: 'x'.repeat(101) }, 'search'],
    [{ page: 0, limit: 25, search: 'Ana' }, 'page'],
    [{ page: 1, limit: 101, search: 'Ana' }, 'limit'],
  ])(
    'rechaza un cuerpo de busqueda fuera del contrato: %s',
    async (input, property) => {
      const errors = await validate(plainToInstance(SearchVotersDto, input));
      expect(errors.map((error) => error.property)).toContain(property);
    },
  );

  it('rechaza campos de aislamiento enviados por el cliente', async () => {
    const errors = await validate(
      plainToInstance(SearchVotersDto, {
        page: 1,
        limit: 25,
        search: '1012345678',
        tenantId: 'tenant-b',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map((error) => error.property)).toContain('tenantId');
  });
});
