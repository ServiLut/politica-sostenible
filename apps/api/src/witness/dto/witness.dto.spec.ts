import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  E14FormType,
  WitnessCredentialType,
  WitnessReclamationGround,
  WitnessReportStatus,
} from '../../../prisma/generated/prisma';
import { CreateWitnessReportDto } from './create-witness-report.dto';
import { ListWitnessReportsQueryDto } from './list-witness-reports-query.dto';
import { ReviewWitnessReportDto } from './review-witness-report.dto';
import { UpdatePollingPlaceProfileDto } from './update-polling-place-profile.dto';

describe('Witness E-14 DTO validation', () => {
  const validReport = {
    puestoId: 'puesto-a',
    mesa: 1,
    e14ImageUrl: 'tenant-a/e14/report.pdf',
    credentialType: WitnessCredentialType.E15,
    credentialReference: '  E15-BOG-001-0001  ',
    checkedInAt: '2026-08-30T07:00:00.000-05:00',
    e14FormType: E14FormType.DELEGADOS,
    candidateVotes: 75,
    blankVotes: 4,
    nullVotes: 2,
    unmarkedVotes: 1,
    totalTableVotes: 200,
    hasWrittenClaim: false,
  };

  it('accepts and normalizes complete witness traceability', async () => {
    const dto = plainToInstance(CreateWitnessReportDto, validReport);

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.credentialReference).toBe('E15-BOG-001-0001');
  });

  it('requires the ground and reasoned facts when a written claim exists', async () => {
    const missingClaimDetails = plainToInstance(CreateWitnessReportDto, {
      ...validReport,
      hasWrittenClaim: true,
    });
    const completeClaim = plainToInstance(CreateWitnessReportDto, {
      ...validReport,
      hasWrittenClaim: true,
      reclamationGround: WitnessReclamationGround.ARITHMETIC_ERROR,
      reclamationDescription:
        '  El total consignado no coincide con la suma visible por renglones.  ',
    });

    const errors = await validate(missingClaimDetails);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['reclamationGround', 'reclamationDescription']),
    );
    await expect(validate(completeClaim)).resolves.toHaveLength(0);
    expect(completeClaim.reclamationDescription).toBe(
      'El total consignado no coincide con la suma visible por renglones.',
    );
  });

  it('rejects legacy-shaped new submissions without accreditation or vote detail', async () => {
    const errors = await validate(
      plainToInstance(CreateWitnessReportDto, {
        puestoId: 'puesto-a',
        mesa: 1,
        e14ImageUrl: 'tenant-a/e14/report.pdf',
        candidateVotes: 75,
        totalTableVotes: 200,
      }),
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'credentialType',
        'credentialReference',
        'checkedInAt',
        'e14FormType',
        'blankVotes',
        'nullVotes',
        'unmarkedVotes',
        'hasWrittenClaim',
      ]),
    );
  });

  it.each([WitnessReportStatus.ACCEPTED, WitnessReportStatus.REJECTED])(
    'accepts review decision %s and trims its reason',
    async (status) => {
      const dto = plainToInstance(ReviewWitnessReportDto, {
        status,
        reviewReason: '  Verificacion visual completada por segunda persona.  ',
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
      expect(dto.reviewReason).toBe(
        'Verificacion visual completada por segunda persona.',
      );
    },
  );

  it.each([WitnessReportStatus.PENDING, WitnessReportStatus.SUPERSEDED])(
    'rejects non-decision status %s',
    async (status) => {
      const errors = await validate(
        plainToInstance(ReviewWitnessReportDto, {
          status,
          reviewReason: 'Motivo con longitud suficiente para la revision.',
        }),
      );

      expect(errors.some((error) => error.property === 'status')).toBe(true);
    },
  );

  it('rejects a short reason and client-controlled identity fields', async () => {
    const errors = await validate(
      plainToInstance(ReviewWitnessReportDto, {
        status: WitnessReportStatus.ACCEPTED,
        reviewReason: 'corto',
        tenantId: 'tenant-attacker',
        reviewerId: 'reviewer-attacker',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['reviewReason', 'tenantId', 'reviewerId']),
    );
  });

  it('coerces bounded pagination and rejects unsafe values', async () => {
    const valid = plainToInstance(ListWitnessReportsQueryDto, {
      page: '2',
      limit: '100',
      mesa: '14',
      status: WitnessReportStatus.PENDING,
    });
    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid).toEqual(
      expect.objectContaining({ page: 2, limit: 100, mesa: 14 }),
    );

    const invalid = plainToInstance(ListWitnessReportsQueryDto, {
      page: '0',
      limit: '101',
      mesa: '0',
    });
    const errors = await validate(invalid);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit', 'mesa']),
    );
  });

  it('returns a Spanish validation message when the table filter exceeds the contract', async () => {
    const errors = await validate(
      plainToInstance(ListWitnessReportsQueryDto, { mesa: '100000' }),
    );
    const mesaError = errors.find((error) => error.property === 'mesa');

    expect(Object.values(mesaError?.constraints ?? {})).toContain(
      'La mesa debe ser menor o igual a 99.999.',
    );
    expect(Object.values(mesaError?.constraints ?? {}).join(' ')).not.toMatch(
      /must|greater|less/i,
    );
  });

  it('rejects impossible totals and profile sizes at the DTO boundary', async () => {
    const reportErrors = await validate(
      plainToInstance(CreateWitnessReportDto, {
        ...validReport,
        puestoId: 'puesto-a',
        mesa: 1,
        e14ImageUrl: 'tenant-a/e14/report.pdf',
        candidateVotes: -1,
        totalTableVotes: 100_000,
      }),
    );
    const profileErrors = await validate(
      plainToInstance(UpdatePollingPlaceProfileDto, { expectedTables: 0 }),
    );

    expect(reportErrors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['candidateVotes', 'totalTableVotes']),
    );
    expect(profileErrors.map((error) => error.property)).toContain(
      'expectedTables',
    );
  });
});
