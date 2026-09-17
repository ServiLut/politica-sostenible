import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ElectoralCalendarMilestoneCategory,
  ElectoralCalendarMilestoneSemantics,
} from '../../../prisma/generated/prisma';
import { CreateElectoralCalendarReleaseDto } from './electoral-calendar.dto';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const hash = 'a'.repeat(64);

function validInput() {
  return {
    clientRequestId: uuid,
    payloadSha256: hash,
    roundCode: 'PRIMERA_VUELTA',
    versionLabel: 'Resolucion 001, corte inicial',
    sourceAuthority: 'Autoridad electoral competente',
    sourceUrl: 'https://autoridad.example/calendario.pdf',
    sourceReference: 'Resolucion 001 de 2099, articulo aplicable',
    sourcePublishedAt: '2099-01-10',
    sourceCutoffAt: '2099-01-10T15:00:00.000Z',
    sourceSha256: hash,
    milestones: [
      {
        stableKey: 'RADICACION_APOYOS',
        category: ElectoralCalendarMilestoneCategory.SIGNATURES,
        semantics: ElectoralCalendarMilestoneSemantics.EXTERNAL_DEADLINE,
        title: 'Radicacion agregada de apoyos',
        applicabilityRule: 'Aplica al comite y ronda declarados en la fuente.',
        originalTextSummary:
          'La fuente establece la fecha de radicacion para este proceso.',
        localDate: '2099-03-10',
        localTime: '17:00',
        timeZone: 'America/Bogota',
        responsibleUserId: 'responsable-a',
        backupUserId: 'suplente-b',
        alertOffsetsDays: [30, 15, 7, 3, 1, 0],
        stageGateRequired: true,
        resultEvidenceRequired: true,
      },
    ],
  };
}

describe('electoral calendar DTOs', () => {
  it('accepts a civil date, explicit IANA zone and external accountability', async () => {
    await expect(
      validate(
        plainToInstance(CreateElectoralCalendarReleaseDto, validInput()),
        {
          whitelist: true,
          forbidNonWhitelisted: true,
        },
      ),
    ).resolves.toEqual([]);
  });

  it('rejects unsafe sources, unknown time zones and hidden tenant/mode inputs', async () => {
    const input = validInput();
    input.sourceUrl = 'http://inseguro.example/calendario';
    input.milestones[0].timeZone = 'Bogota';
    const instance = plainToInstance(CreateElectoralCalendarReleaseDto, {
      ...input,
      tenantId: 'tenant-ajeno',
      mode: 'PUBLIC_OFFICE',
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['sourceUrl', 'milestones', 'tenantId', 'mode']),
    );
  });

  it('rejects duplicate or unapproved alert offsets', async () => {
    const input = validInput();
    input.milestones[0].alertOffsetsDays = [7, 7, 2];
    const errors = await validate(
      plainToInstance(CreateElectoralCalendarReleaseDto, input),
    );
    expect(
      errors.find(({ property }) => property === 'milestones'),
    ).toBeDefined();
  });
});
