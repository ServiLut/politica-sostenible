import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CommunicationChannel } from '../../../prisma/generated/prisma';
import { CreateCommunicationApprovalDto } from './create-communication-approval.dto';

const validInput = {
  title: 'Informe de gestión',
  message: 'Contenido verificable para revisión.',
  channel: CommunicationChannel.EMAIL,
  purpose: 'Informar a personas que autorizaron el contacto',
  recipientBasis: 'DIRECT_OPT_IN',
  audienceDescription: 'Personas inscritas voluntariamente al boletín',
  dataSource: 'Formulario propio con aviso de privacidad vigente',
  segmentationCriteria: 'Municipio informado voluntariamente',
  usesArtificialIntelligence: false,
  rightsMechanismUrl: 'https://example.test/privacidad',
  consentEvidenceReference: 'CONS-2026-00142',
  containsSensitiveData: false,
};

describe('CreateCommunicationApprovalDto', () => {
  it('accepts a complete disclosure without trusting tenant or mode input', async () => {
    const dto = plainToInstance(CreateCommunicationApprovalDto, validInput);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    ['recipientBasis', undefined],
    ['audienceDescription', ''],
    ['dataSource', 'x'],
    ['segmentationCriteria', ''],
    ['usesArtificialIntelligence', undefined],
    ['rightsMechanismUrl', 'http://example.test/retirar'],
    ['consentEvidenceReference', '123'],
  ])('rejects an invalid %s disclosure', async (field, value) => {
    const dto = plainToInstance(CreateCommunicationApprovalDto, {
      ...validInput,
      [field]: value,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === field)).toBe(true);
  });

  it('rejects tenant, mode and server-controlled state fields', async () => {
    const dto = plainToInstance(CreateCommunicationApprovalDto, {
      ...validInput,
      tenantId: 'tenant-attacker',
      mode: 'PUBLIC_OFFICE',
      status: 'APPROVED',
      contentHash: 'attacker-controlled',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['tenantId', 'mode', 'status', 'contentHash']),
    );
  });
});
