import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivateConsentNoticeDto } from './activate-consent-notice.dto';

const validInput = {
  version: ' campaign-2026-09-v1 ',
  title: ' Autorizacion para comunicaciones de la organizacion ',
  content:
    'Autorizo de manera previa, expresa e informada el tratamiento de mis datos para las finalidades explicadas, y conozco como ejercer mis derechos.',
  controllerName: ' Organizacion ciudadana responsable ',
  contactEmail: ' PRIVACIDAD@EXAMPLE.TEST ',
  privacyPolicyUrl: ' https://example.test/privacidad ',
};

describe('ActivateConsentNoticeDto', () => {
  it('normalizes and accepts a complete organization notice', async () => {
    const dto = plainToInstance(ActivateConsentNoticeDto, validInput);

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.version).toBe('campaign-2026-09-v1');
    expect(dto.controllerName).toBe('Organizacion ciudadana responsable');
    expect(dto.contactEmail).toBe('privacidad@example.test');
    expect(dto.privacyPolicyUrl).toBe('https://example.test/privacidad');
  });

  it.each([
    [{ ...validInput, version: 'version con espacios' }, 'version'],
    [{ ...validInput, content: 'demasiado corto' }, 'content'],
    [{ ...validInput, contactEmail: 'correo-invalido' }, 'contactEmail'],
    [
      { ...validInput, privacyPolicyUrl: 'http://example.test' },
      'privacyPolicyUrl',
    ],
  ])('rejects an invalid notice field %#', async (input, property) => {
    const errors = await validate(
      plainToInstance(ActivateConsentNoticeDto, input),
    );
    expect(errors.map((error) => error.property)).toContain(property);
  });

  it('rejects tenant, mode and actor supplied by the client', async () => {
    const dto = plainToInstance(ActivateConsentNoticeDto, {
      ...validInput,
      tenantId: 'tenant-attacker',
      mode: 'CAMPAIGN',
      purpose: 'POLITICAL_COMMUNICATION',
      createdById: 'actor-attacker',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['tenantId', 'mode', 'purpose', 'createdById']),
    );
  });
});
