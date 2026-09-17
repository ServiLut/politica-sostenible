import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OperationTerminationCause } from '../../../prisma/generated/prisma';
import {
  CancelOperationTerminationDto,
  CreateOperationTerminationDto,
  OperationTerminationDecision,
  ReviewOperationTerminationDto,
} from './operation-termination.dto';

const SHA = 'a'.repeat(64);

function validRequest() {
  return {
    clientRequestId: '550e8400-e29b-41d4-a716-446655440000',
    payloadSha256: SHA,
    expectedProfileUpdatedAt: '2026-09-09T12:00:00.000Z',
    cause: OperationTerminationCause.REGISTRATION_REVOKED,
    effectiveAt: '2026-09-09T11:00:00.000Z',
    explanation:
      'La autoridad competente revoco formalmente la inscripcion mediante un acto verificable y definitivo, por lo que la operacion electoral no puede continuar sin falsear su etapa.',
    authorityName: 'Consejo Nacional Electoral',
    officialActType: 'Resolucion',
    officialActReference: 'CNE-2026-00991',
    officialActIssuedAt: '2026-09-09T10:00:00.000Z',
    evidenceReference: 'https://www.cne.gov.co/actos/CNE-2026-00991.pdf',
    evidenceSha256: SHA,
    consequencesAcknowledged: true,
  };
}

describe('operation termination DTOs', () => {
  it('accepts a complete explicit causal request and trims durable references', async () => {
    const dto = plainToInstance(CreateOperationTerminationDto, {
      ...validRequest(),
      evidenceReference: '  https://www.cne.gov.co/actos/991.pdf  ',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.evidenceReference).toBe('https://www.cne.gov.co/actos/991.pdf');
  });

  it.each([
    'http://www.cne.gov.co/acto.pdf',
    'https://usuario:secreto@www.cne.gov.co/acto.pdf',
    'javascript:alert(1)',
    'no-es-url',
  ])('rejects unsafe evidence reference %s', async (evidenceReference) => {
    const dto = plainToInstance(CreateOperationTerminationDto, {
      ...validRequest(),
      evidenceReference,
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires a long OTHER cause and prohibits relabeling an explicit cause', async () => {
    const shortOther = plainToInstance(CreateOperationTerminationDto, {
      ...validRequest(),
      cause: OperationTerminationCause.OTHER,
      otherCause: 'No se puede continuar',
    });
    const relabeled = plainToInstance(CreateOperationTerminationDto, {
      ...validRequest(),
      otherCause:
        'Texto que intenta cambiar una causal explicita despues de seleccionarla.',
    });
    expect(await validate(shortOther)).not.toHaveLength(0);
    expect(await validate(relabeled)).not.toHaveLength(0);
  });

  it('does not accept a missing consequences declaration or malformed hashes', async () => {
    const dto = plainToInstance(CreateOperationTerminationDto, {
      ...validRequest(),
      consequencesAcknowledged: false,
      payloadSha256: 'ABC',
    });
    const errors = await validate(dto);
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['payloadSha256', 'consequencesAcknowledged']),
    );
  });

  it('requires a rejection reason but forbids one on approval', async () => {
    const base = {
      clientReviewId: '550e8400-e29b-41d4-a716-446655440001',
      expectedPayloadSha256: SHA,
      reviewPayloadSha256: SHA,
    };
    const rejectedWithoutReason = plainToInstance(
      ReviewOperationTerminationDto,
      { ...base, decision: OperationTerminationDecision.REJECT },
    );
    const approvedWithReason = plainToInstance(ReviewOperationTerminationDto, {
      ...base,
      decision: OperationTerminationDecision.APPROVE,
      rejectionReason: 'No deberia enviarse con una aprobacion valida.',
    });
    expect(await validate(rejectedWithoutReason)).not.toHaveLength(0);
    expect(await validate(approvedWithReason)).not.toHaveLength(0);
  });

  it('requires an idempotent cancellation receipt and a concrete reason', async () => {
    const dto = plainToInstance(CancelOperationTerminationDto, {
      clientCancellationId: '550e8400-e29b-41d4-a716-446655440002',
      expectedPayloadSha256: SHA,
      cancellationPayloadSha256: SHA,
      reason: 'corta',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
