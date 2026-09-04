import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVoterDto } from './create-voter.dto';

const validInput = {
  documentId: '1012345678',
  firstName: 'Ana María',
  lastName: 'Pérez',
  phone: '+57 300 123 4567',
  email: 'ANA@EXAMPLE.TEST',
  mesa: 12,
  consentAccepted: true,
  termsVersion: '2026.1',
};

describe('CreateVoterDto', () => {
  it('normaliza texto y acepta únicamente la versión legal vigente', async () => {
    const dto = plainToInstance(CreateVoterDto, {
      ...validInput,
      documentId: ' 1012345678 ',
      firstName: ' Ana María ',
      email: ' ANA@EXAMPLE.TEST ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.documentId).toBe('1012345678');
    expect(dto.firstName).toBe('Ana María');
    expect(dto.phone).toBe('+573001234567');
    expect(dto.email).toBe('ana@example.test');
  });

  it.each([
    ['300 123 4567', '3001234567'],
    ['(300) 123-4567', '3001234567'],
    ['+57 (300) 123-4567', '+573001234567'],
  ])('canonicalizes a formatted phone %s', async (phone, expected) => {
    const dto = plainToInstance(CreateVoterDto, { ...validInput, phone });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.phone).toBe(expected);
  });

  it.each([
    [{ ...validInput, consentAccepted: false }, 'consentAccepted'],
    [{ ...validInput, termsVersion: 'legacy' }, 'termsVersion'],
    [{ ...validInput, documentId: '../tenant-b' }, 'documentId'],
    [{ ...validInput, email: 'correo-invalido' }, 'email'],
    [{ ...validInput, mesa: 0 }, 'mesa'],
    [{ ...validInput, firstName: 'A'.repeat(101) }, 'firstName'],
  ])('rechaza entradas fuera del contrato: %s', async (input, property) => {
    const errors = await validate(plainToInstance(CreateVoterDto, input));
    expect(errors.map((error) => error.property)).toContain(property);
  });

  it('rechaza una verificación de firma controlada por el servidor', async () => {
    const errors = await validate(
      plainToInstance(CreateVoterDto, {
        ...validInput,
        isSignatureValid: true,
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map((error) => error.property)).toContain('isSignatureValid');
  });
});
