import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DecideSignatureCountCorrectionDto,
  ProposeSignatureCountCorrectionDto,
  SignatureCountCorrectionDecisionInput,
} from './signature-count-correction.dto';

const validProposal = {
  clientRequestId: 'E6CB41F9-71A4-45A2-A91D-A7763990896F',
  payloadSha256: 'A'.repeat(64),
  expectedVersion: 4,
  reason: '  Recuento fisico documentado y verificado por custodia.  ',
  evidenceStoragePath:
    'tenant-1/signature-collection/e6cb41f9-71a4-45a2-a91d-a7763990896f.pdf',
  evidenceSha256: 'B'.repeat(64),
  proposedPlannedForms: 12,
  proposedIssuedForms: 10,
  proposedReturnedForms: 7,
  proposedAnnulledForms: 1,
  proposedMissingForms: 1,
  proposedInCustodyForms: 1,
  proposedReportedSupports: 8,
  proposedInternalAcceptedSupports: 6,
  proposedInternalRejectedSupports: 2,
  proposedPossibleDuplicateSupports: 1,
};

describe('signature count-correction DTOs', () => {
  it('normalizes hashes/UUID/reason and accepts exact conservation equations', async () => {
    const dto = plainToInstance(
      ProposeSignatureCountCorrectionDto,
      validProposal,
    );

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.clientRequestId).toBe(
      validProposal.clientRequestId.toLowerCase(),
    );
    expect(dto.payloadSha256).toBe('a'.repeat(64));
    expect(dto.evidenceSha256).toBe('b'.repeat(64));
    expect(dto.reason).toBe(
      'Recuento fisico documentado y verificado por custodia.',
    );
  });

  it.each([
    { proposedReturnedForms: 6 },
    { proposedInternalAcceptedSupports: 5 },
    { proposedPossibleDuplicateSupports: 3 },
  ])(
    'rejects mathematically inconsistent absolute counts: %o',
    async (change) => {
      const dto = plainToInstance(ProposeSignatureCountCorrectionDto, {
        ...validProposal,
        ...change,
      });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it('rejects a non-v4 id, negative count and unsupported decision', async () => {
    const proposal = plainToInstance(ProposeSignatureCountCorrectionDto, {
      ...validProposal,
      clientRequestId: 'not-an-id',
      proposedPlannedForms: -1,
    });
    const decision = plainToInstance(DecideSignatureCountCorrectionDto, {
      clientRequestId: validProposal.clientRequestId,
      payloadSha256: 'c'.repeat(64),
      expectedVersion: 4,
      decision: 'EDIT',
      reviewReason:
        'Revision suficientemente explicada para control independiente.',
    });

    expect(await validate(proposal)).not.toHaveLength(0);
    expect(await validate(decision)).not.toHaveLength(0);
  });

  it('accepts the two explicit terminal decisions', async () => {
    for (const decision of Object.values(
      SignatureCountCorrectionDecisionInput,
    )) {
      const dto = plainToInstance(DecideSignatureCountCorrectionDto, {
        clientRequestId: validProposal.clientRequestId,
        payloadSha256: 'c'.repeat(64),
        expectedVersion: 4,
        decision,
        reviewReason:
          'Revision independiente sustentada en la evidencia del expediente.',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
    }
  });
});
