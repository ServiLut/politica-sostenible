import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ScrutinyCommissionLevel,
  ScrutinyDocumentType,
  ScrutinyRequirementApplicability,
} from '../../../prisma/generated/prisma';
import {
  ConfigureScrutinyRequirementDto,
  CreateScrutinyCommissionDto,
} from './scrutiny.dto';

const command = {
  clientRequestId: '6e927194-7a8f-4d4c-aabd-99b2ead3627d',
  payloadSha256: 'a'.repeat(64),
};

describe('scrutiny DTO validation', () => {
  it('accepts a complete commission with a real IANA zone and HTTPS source', async () => {
    const dto = plainToInstance(CreateScrutinyCommissionDto, {
      ...command,
      code: 'mun-001',
      level: ScrutinyCommissionLevel.MUNICIPAL,
      name: 'Comision Municipal Uno',
      scopeCode: '001',
      scopeName: 'Municipio Uno',
      venue: 'Palacio municipal, sala principal',
      timeZone: 'America/Bogota',
      scheduledStartsAt: '2027-10-31T21:00:00.000Z',
      scheduledEndsAt: '2027-11-01T03:00:00.000Z',
      calendarSourceUrl: 'https://www.registraduria.gov.co/calendario',
      calendarSourceReference: 'Resolucion electoral vigente',
      legalLeadUserId: 'legal-user',
      escalationRoute:
        'Escalar al apoderado principal y luego al responsable nacional documentando cada llamada y respuesta.',
      contingencyPlan:
        'Usar formato fisico numerado, doble custodia, registro horario y reingreso por orden de recepcion al recuperar conectividad.',
    });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
    expect(dto.code).toBe('MUN-001');
  });

  it.each([
    ['zona inventada', { timeZone: 'America/NoExiste' }],
    ['fuente insegura', { calendarSourceUrl: 'http://example.test' }],
    ['uuid no v4', { clientRequestId: 'not-a-uuid' }],
    ['hash invalido', { payloadSha256: 'abc' }],
  ])('rejects %s', async (_label, patch) => {
    const dto = plainToInstance(CreateScrutinyCommissionDto, {
      ...command,
      code: 'MUN-001',
      level: ScrutinyCommissionLevel.MUNICIPAL,
      name: 'Comision Municipal Uno',
      scopeCode: '001',
      scopeName: 'Municipio Uno',
      venue: 'Palacio municipal, sala principal',
      timeZone: 'America/Bogota',
      scheduledStartsAt: '2027-10-31T21:00:00.000Z',
      scheduledEndsAt: '2027-11-01T03:00:00.000Z',
      calendarSourceUrl: 'https://www.registraduria.gov.co/calendario',
      calendarSourceReference: 'Resolucion electoral vigente',
      legalLeadUserId: 'legal-user',
      escalationRoute:
        'Escalar al apoderado principal y luego al responsable nacional documentando cada llamada y respuesta.',
      contingencyPlan:
        'Usar formato fisico numerado, doble custodia, registro horario y reingreso por orden de recepcion al recuperar conectividad.',
      ...patch,
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires an explicit, justified document applicability decision', async () => {
    const dto = plainToInstance(ConfigureScrutinyRequirementDto, {
      ...command,
      documentType: ScrutinyDocumentType.E25,
      applicability: ScrutinyRequirementApplicability.NOT_APPLICABLE,
      rationale:
        'No hubo reclamaciones en esta comision y el acta general lo deja expresamente documentado.',
      expectedVersion: 1,
    });
    expect(await validate(dto)).toEqual([]);
  });
});
