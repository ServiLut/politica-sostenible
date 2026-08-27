import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DivisionType } from '../../../prisma/generated/prisma';
import { ListDivisionsQueryDto } from './list-divisions-query.dto';

describe('ListDivisionsQueryDto', () => {
  it('accepts an operational type and treats blank optional filters as absent', async () => {
    const dto = plainToInstance(ListDivisionsQueryDto, {
      type: DivisionType.PUESTO,
      search: '',
      page: '',
      limit: '',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.search).toBeUndefined();
  });

  it('rejects non-operational types and unsafe pagination values', async () => {
    const dto = plainToInstance(ListDivisionsQueryDto, {
      type: DivisionType.DEPARTAMENTO,
      page: '0',
      limit: '101',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['type', 'page', 'limit']),
    );
  });
});
