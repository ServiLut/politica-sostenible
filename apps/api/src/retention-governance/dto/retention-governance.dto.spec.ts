import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RetentionDataScope } from '../../../prisma/generated/prisma';
import {
  CreateRetentionDispositionDto,
  CreateRetentionLegalHoldDto,
  RetentionDispositionDecision,
  ReviewRetentionDispositionDto,
} from './retention-governance.dto';

const HASH = 'a'.repeat(64);

describe('retention governance DTOs', () => {
  it('accepts a fully acknowledged disposition request and trims evidence', async () => {
    const dto = plainToInstance(CreateRetentionDispositionDto, {
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      payloadSha256: HASH,
      expectedPreviewSha256: HASH,
      expectedProfileUpdatedAt: '2026-09-01T00:00:00.000Z',
      scope: RetentionDataScope.DATA_SUBJECT_RECORDS,
      cutoffAt: '2026-09-09T00:00:00.000Z',
      justification: `  ${'Justificacion '.repeat(10)}  `,
      legalReference: '  Politica juridica interna 2026-01  ',
      evidenceReference: '  https://evidence.example.test/file/1  ',
      evidenceSha256: HASH.toUpperCase(),
      legalPolicyRequiredAcknowledged: true,
      backupRestoreRequiredAcknowledged: true,
      executorUnavailableAcknowledged: true,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.evidenceReference).toBe('https://evidence.example.test/file/1');
    expect(dto.evidenceSha256).toBe(HASH);
  });

  it('rejects embedded credentials and missing execution acknowledgements', async () => {
    const dto = plainToInstance(CreateRetentionDispositionDto, {
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      payloadSha256: HASH,
      expectedPreviewSha256: HASH,
      expectedProfileUpdatedAt: '2026-09-01T00:00:00.000Z',
      scope: RetentionDataScope.DATA_SUBJECT_RECORDS,
      cutoffAt: '2026-09-09T00:00:00.000Z',
      justification: 'J'.repeat(120),
      legalReference: 'Politica juridica interna 2026-01',
      evidenceReference: 'https://user:password@example.test/file',
      evidenceSha256: HASH,
      legalPolicyRequiredAcknowledged: false,
      backupRestoreRequiredAcknowledged: false,
      executorUnavailableAcknowledged: false,
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'evidenceReference',
        'legalPolicyRequiredAcknowledged',
        'backupRestoreRequiredAcknowledged',
        'executorUnavailableAcknowledged',
      ]),
    );
  });

  it('requires the explicit not-executed acknowledgement only for approval', async () => {
    const invalidApproval = plainToInstance(ReviewRetentionDispositionDto, {
      clientReviewId: '22222222-2222-4222-8222-222222222222',
      expectedPayloadSha256: HASH,
      decision: RetentionDispositionDecision.APPROVE,
      reviewPayloadSha256: HASH,
    });
    const validRejection = plainToInstance(ReviewRetentionDispositionDto, {
      clientReviewId: '22222222-2222-4222-8222-222222222222',
      expectedPayloadSha256: HASH,
      decision: RetentionDispositionDecision.REJECT,
      reviewPayloadSha256: HASH,
      rejectionReason:
        'La referencia juridica no acredita el alcance solicitado.',
    });

    await expect(validate(invalidApproval)).resolves.not.toHaveLength(0);
    await expect(validate(validRejection)).resolves.toHaveLength(0);
  });

  it('validates legal-hold authority, reason and durable HTTPS evidence', async () => {
    const dto = plainToInstance(CreateRetentionLegalHoldDto, {
      clientRequestId: '33333333-3333-4333-8333-333333333333',
      payloadSha256: HASH,
      scope: RetentionDataScope.ALL_TENANT_RECORDS,
      reason:
        'Existe una actuacion formal que obliga a preservar integralmente el expediente.',
      legalAuthority: 'Oficina juridica',
      legalReference: 'Actuacion administrativa 2026-33',
      evidenceReference: 'https://evidence.example.test/hold/33',
      evidenceSha256: HASH,
      effectiveAt: '2026-09-09T00:00:00.000Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
