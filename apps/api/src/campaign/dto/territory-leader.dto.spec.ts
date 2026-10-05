import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateTerritoryLeaderDto,
  UpdateTerritoryLeaderDto,
} from './territory-leader.dto';

describe('territory leader required text contract', () => {
  const valid = {
    name: 'PRUEBA QA referente técnico',
    roleDescription: 'SIMULACIÓN SIN VALIDEZ — coordinación técnica',
  };

  it('normalizes valid names and responsibilities without requiring contacts', async () => {
    const dto = plainToInstance(CreateTerritoryLeaderDto, {
      name: `  ${valid.name}  `,
      roleDescription: `  ${valid.roleDescription}\n`,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe(valid.name);
    expect(dto.roleDescription).toBe(valid.roleDescription);
  });

  it.each(['name', 'roleDescription'] as const)(
    'rejects empty and whitespace-only %s after transformation',
    async (field) => {
      for (const value of ['', '  ', '\n\t', null, undefined]) {
        const dto = plainToInstance(CreateTerritoryLeaderDto, {
          ...valid,
          [field]: value,
        });
        const errors = await validate(dto);
        expect(errors.map(({ property }) => property)).toContain(field);
      }
    },
  );

  it.each(['name', 'roleDescription'] as const)(
    'keeps the %s constraint when PATCH explicitly supplies an invalid value',
    async (field) => {
      for (const value of ['', ' \t ', null]) {
        const dto = plainToInstance(UpdateTerritoryLeaderDto, {
          [field]: value,
        });
        const errors = await validate(dto);
        expect(errors.map(({ property }) => property)).toContain(field);
      }
    },
  );

  it('preserves omission of unchanged required fields in PATCH', async () => {
    const dto = plainToInstance(UpdateTerritoryLeaderDto, {
      observations: 'PRUEBA QA — sólo observaciones',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBeUndefined();
    expect(dto.roleDescription).toBeUndefined();
  });

  it.each([CreateTerritoryLeaderDto, UpdateTerritoryLeaderDto])(
    'returns the real ValidationPipe 400 contract for %s without DB writes',
    async (metatype) => {
      const pipe = new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      await expect(
        pipe.transform({ ...valid, name: '  ' }, { type: 'body', metatype }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
