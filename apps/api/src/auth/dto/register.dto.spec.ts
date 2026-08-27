import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TenantType } from '../../../prisma/generated/prisma';
import { RegisterDto } from './register.dto';

const validRegistration = {
  email: 'ADMIN@EXAMPLE.TEST',
  password: 'clave-segura-2026',
  name: ' Ana Pérez ',
  organizationName: ' Concejo abierto ',
  organizationType: TenantType.PUBLIC_OFFICE,
  phone: '3001234567',
  documentId: ' 1012345678 ',
  termsAccepted: true,
  termsVersion: '2026.1',
};

describe('RegisterDto', () => {
  it('normaliza identificadores y limita el alta a los términos vigentes', async () => {
    const dto = plainToInstance(RegisterDto, validRegistration);

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.email).toBe('admin@example.test');
    expect(dto.name).toBe('Ana Pérez');
    expect(dto.organizationName).toBe('Concejo abierto');
    expect(dto.documentId).toBe('1012345678');
  });

  it.each([
    [{ ...validRegistration, termsVersion: '2026.2' }, 'termsVersion'],
    [{ ...validRegistration, termsAccepted: false }, 'termsAccepted'],
    [{ ...validRegistration, documentId: '../otro-tenant' }, 'documentId'],
    [{ ...validRegistration, password: 'muy-corta' }, 'password'],
  ])('rechaza contratos de alta inválidos: %s', async (input, property) => {
    const errors = await validate(plainToInstance(RegisterDto, input));
    expect(errors.map((error) => error.property)).toContain(property);
  });
});
