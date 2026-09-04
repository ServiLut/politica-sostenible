import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateVoterDataDto } from './update-voter-data.dto';
import { VoterDataRightsParamsDto } from './voter-data-rights-params.dto';

describe('UpdateVoterDataDto', () => {
  it('normaliza exclusivamente los campos personales corregibles', async () => {
    const dto = plainToInstance(UpdateVoterDataDto, {
      documentId: ' 1012345678 ',
      firstName: ' Ana Maria ',
      lastName: ' Rojas ',
      phone: ' +57 300 123 4567 ',
      email: ' ANA@EXAMPLE.TEST ',
      puestoId: ' puesto-a ',
      mesa: 12,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      documentId: '1012345678',
      firstName: 'Ana Maria',
      lastName: 'Rojas',
      phone: '+573001234567',
      email: 'ana@example.test',
      puestoId: 'puesto-a',
      mesa: 12,
    });
  });

  it('canonicaliza parentesis y guiones antes de corregir el telefono', async () => {
    const dto = plainToInstance(UpdateVoterDataDto, {
      phone: '(300) 123-4567',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.phone).toBe('3001234567');
  });

  it('permite retirar datos opcionales sin permitir anular identidad', async () => {
    await expect(
      validate(
        plainToInstance(UpdateVoterDataDto, {
          phone: null,
          email: null,
          puestoId: null,
          mesa: null,
        }),
      ),
    ).resolves.toHaveLength(0);

    const identityErrors = await validate(
      plainToInstance(UpdateVoterDataDto, {
        documentId: null,
        firstName: null,
        lastName: null,
      }),
    );
    expect(identityErrors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['documentId', 'firstName', 'lastName']),
    );
  });

  it.each([
    [{ documentId: '../tenant-b' }, 'documentId'],
    [{ firstName: '' }, 'firstName'],
    [{ lastName: 'x'.repeat(101) }, 'lastName'],
    [{ phone: 'not-a-phone' }, 'phone'],
    [{ email: 'not-an-email' }, 'email'],
    [{ puestoId: '../puesto' }, 'puestoId'],
    [{ mesa: 0 }, 'mesa'],
    [{ mesa: true }, 'mesa'],
  ])(
    'rechaza una correccion fuera del contrato: %j',
    async (input, property) => {
      const errors = await validate(plainToInstance(UpdateVoterDataDto, input));
      expect(errors.map((error) => error.property)).toContain(property);
    },
  );

  it.each(['tenantId', 'registrarId', 'consentAccepted', 'termsVersion'])(
    'rechaza el campo de control %s enviado por el cliente',
    async (field) => {
      const errors = await validate(
        plainToInstance(UpdateVoterDataDto, {
          firstName: 'Ana',
          [field]: field === 'consentAccepted' ? false : 'attacker-value',
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      );

      expect(errors.map((error) => error.property)).toContain(field);
    },
  );
});

describe('VoterDataRightsParamsDto', () => {
  it('acepta un identificador interno acotado', async () => {
    await expect(
      validate(plainToInstance(VoterDataRightsParamsDto, { id: 'cm123_a-b' })),
    ).resolves.toHaveLength(0);
  });

  it.each(['', '../tenant-b', 'x'.repeat(129)])(
    'rechaza el identificador inseguro %p',
    async (id) => {
      const errors = await validate(
        plainToInstance(VoterDataRightsParamsDto, { id }),
      );
      expect(errors.map((error) => error.property)).toContain('id');
    },
  );
});
