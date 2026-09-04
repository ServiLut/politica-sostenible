import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOrganizationDto } from './update-organization.dto';

describe('UpdateOrganizationDto', () => {
  it('normaliza un nombre válido antes de validarlo', async () => {
    const dto = plainToInstance(UpdateOrganizationDto, {
      name: '  Movimiento Región Viva  ',
      expectedName: '  Nombre anterior  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('Movimiento Región Viva');
    expect(dto.expectedName).toBe('Nombre anterior');
  });

  it.each([
    { name: '   ', expectedName: 'Anterior' },
    { name: 'x'.repeat(161), expectedName: 'Anterior' },
    { name: 2027, expectedName: 'Anterior' },
    { name: 'Nuevo', expectedName: '   ' },
    { name: 'Nuevo', expectedName: 'x'.repeat(161) },
    { name: 'Nuevo', expectedName: 2027 },
    { name: 'Nuevo' },
  ])('rechaza nombres vacíos, extensos o no textuales: %p', async (input) => {
    const dto = plainToInstance(UpdateOrganizationDto, input);

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
