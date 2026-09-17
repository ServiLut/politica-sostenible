import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PqrsdCalendarExceptionType,
  PqrsdDayComputationMethod,
  PqrsdTermStartRule,
} from '../../../prisma/generated/prisma';
import {
  AttachPqrsdDocumentDto,
  CreatePqrsdRulePackageDto,
  ReviewPqrsdClassificationDto,
} from './pqrsd.dto';

const command = {
  clientRequestId: 'c9f973c7-d888-4d4d-9674-fdd286e40dca',
  payloadSha256: 'a'.repeat(64),
};

describe('PQRSD DTO boundary', () => {
  it('accepts a complete, explicit and source-bound calendar package', async () => {
    const dto = plainToInstance(CreatePqrsdRulePackageDto, {
      ...command,
      scopeKey: 'GENERAL',
      versionLabel: '2026.1',
      sourceUrl: 'https://entidad.gov.co/normas/acto-123',
      sourceReference: 'Acto 123, articulo 8, publicado 2026-09-01',
      sourceSha256: 'b'.repeat(64),
      timeZone: 'America/Bogota',
      effectiveFrom: '2026-09-01',
      nonWorkingWeekdays: [0, 6],
      computationMethodNote: 'Conteo reproducible conforme al acto citado.',
      rules: [
        {
          classificationKey: 'PETICION_GENERAL',
          label: 'Peticion general',
          durationDays: 17,
          dayMethod: PqrsdDayComputationMethod.WORKING_DAYS,
          startRule: PqrsdTermStartRule.NEXT_WORKING_DATE,
          legalBasis: 'Articulo 8 del acto administrativo citado.',
          highRisk: false,
        },
      ],
      exceptions: [
        {
          localDate: '2026-12-08',
          type: PqrsdCalendarExceptionType.NON_WORKING,
          label: 'Dia no laboral documentado',
          sourceReference: 'Calendario oficial 2026',
        },
      ],
    });

    expect(
      await validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
  });

  it.each([
    ['http://entidad.gov.co/norma', 'America/Bogota'],
    ['https://usuario:secreto@entidad.gov.co/norma', 'America/Bogota'],
    ['https://entidad.gov.co/norma', 'Bogota'],
  ])(
    'rejects an unsafe source or non-IANA zone',
    async (sourceUrl, timeZone) => {
      const dto = plainToInstance(CreatePqrsdRulePackageDto, {
        ...command,
        scopeKey: 'GENERAL',
        versionLabel: '1',
        sourceUrl,
        sourceReference: 'Referencia juridica verificable',
        sourceSha256: 'b'.repeat(64),
        timeZone,
        effectiveFrom: '2026-09-01',
        nonWorkingWeekdays: [],
        computationMethodNote: 'Metodo de conteo documentado.',
        rules: [
          {
            classificationKey: 'GENERAL',
            label: 'Peticion general',
            durationDays: 17,
            dayMethod: PqrsdDayComputationMethod.CALENDAR_DAYS,
            startRule: PqrsdTermStartRule.RECEIPT_DATE,
            legalBasis: 'Fundamento juridico verificable.',
            highRisk: false,
          },
        ],
        exceptions: [],
      });

      expect(await validate(dto)).not.toEqual([]);
    },
  );

  it('rejects tenantId at the public DTO boundary', async () => {
    const dto = plainToInstance(AttachPqrsdDocumentDto, {
      ...command,
      tenantId: 'tenant-forged',
      dossierId: 'dossier-a',
      storagePath: 'tenant-real/pqrsd/object.pdf',
      type: 'REQUEST',
      fileName: 'solicitud.pdf',
      sha256: 'b'.repeat(64),
      expectedVersion: 1,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.some((error) => error.property === 'tenantId')).toBe(true);
  });

  it('validates partial manual deadline evidence at the DTO shape level without inventing values', async () => {
    const dto = plainToInstance(ReviewPqrsdClassificationDto, {
      ...command,
      decision: 'APPROVE',
      rationale: 'Revision independiente documentada.',
      manualDueLocalDate: '09/30/2026',
      expectedVersion: 2,
    });

    expect(await validate(dto)).not.toEqual([]);
  });
});
