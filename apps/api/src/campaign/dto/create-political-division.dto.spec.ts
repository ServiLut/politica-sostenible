import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePoliticalDivisionDto,
  CreatableDivisionType,
} from './create-political-division.dto';

describe('CreatePoliticalDivisionDto', () => {
  it('accepts a normalized operational division', async () => {
    const dto = plainToInstance(CreatePoliticalDivisionDto, {
      type: CreatableDivisionType.PUESTO,
      code: ' p-001 ',
      name: ' Colegio Central ',
      parentId: 'zona-a',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.code).toBe('p-001');
    expect(dto.name).toBe('Colegio Central');
  });

  it('rejects unsupported levels and unsafe identifiers', async () => {
    const dto = plainToInstance(CreatePoliticalDivisionDto, {
      type: 'MUNICIPIO',
      code: '../puesto',
      name: '',
      parentId: 'not/a/cuid',
    });

    const errors = await validate(dto);
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['type', 'code', 'name', 'parentId']),
    );
  });
});
