import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CandidateListType,
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationStage,
  PoliticalOperationType,
} from '../../../prisma/generated/prisma';
import {
  ADOPTABLE_OPERATION_STAGES,
  CreateOperationStageAdoptionDto,
  OperationAdoptionDecision,
  ReviewOperationStageAdoptionDto,
} from './operation-stage-adoption.dto';

const HASH = 'a'.repeat(64);

function validRequest() {
  return {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    payloadSha256: HASH,
    operationType: PoliticalOperationType.SINGLE_CANDIDACY,
    targetStage: PoliticalOperationStage.CAMPAIGN,
    electionType: ElectoralContestType.MAYORALTY,
    circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
    circumscriptionName: 'Municipio sintetico',
    electionDate: '2026-10-25T05:00:00.000Z',
    expectedTeamSize: 20,
    candidateCount: 1,
    maxTotalBudget: 100_000_000,
    maxPublicityLimit: 20_000_000,
    dataControllerName: 'Comite responsable sintetico',
    responsibleDataUserId: 'responsible-a',
    retentionPeriodDays: 730,
    revocationProcedure:
      'Solicitud escrita al responsable con validacion de identidad.',
    effectiveAt: '2026-09-01T12:00:00.000Z',
    justification:
      'La operacion inicio antes de habilitar la plataforma y se aporta evidencia verificable suficiente para reconstruir responsablemente su estado actual.',
    evidenceReference: 'tenant-a/adoption/evidence-001.json',
    evidenceSha256: HASH,
    incompleteHistoryAcknowledged: true,
  };
}

describe('operation stage adoption DTOs', () => {
  it.each(ADOPTABLE_OPERATION_STAGES)(
    'accepts a complete acknowledged request for adoptable stage %s',
    async (targetStage) => {
      const dto = plainToInstance(CreateOperationStageAdoptionDto, {
        ...validRequest(),
        targetStage,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it.each([
    PoliticalOperationStage.EXPLORATION,
    PoliticalOperationStage.PRE_CAMPAIGN,
    PoliticalOperationStage.CLOSED,
  ])('rejects non-adoptable target %s', async (targetStage) => {
    const dto = plainToInstance(CreateOperationStageAdoptionDto, {
      ...validRequest(),
      targetStage,
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires acknowledgement, broad justification and exact hashes', async () => {
    const dto = plainToInstance(CreateOperationStageAdoptionDto, {
      ...validRequest(),
      payloadSha256: 'ABC',
      evidenceSha256: 'xyz',
      justification: 'Demasiado corta',
      incompleteHistoryAcknowledged: false,
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'payloadSha256',
        'evidenceSha256',
        'justification',
        'incompleteHistoryAcknowledged',
      ]),
    );
  });

  it('preserves the same profile coherence validation', async () => {
    const dto = plainToInstance(CreateOperationStageAdoptionDto, {
      ...validRequest(),
      operationType: PoliticalOperationType.CORPORATION_CANDIDACY,
      electionType: ElectoralContestType.SENATE,
      listType: undefined as CandidateListType | undefined,
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires a rejection reason only for REJECT', async () => {
    const base = {
      clientReviewId: '22222222-2222-4222-8222-222222222222',
      expectedPayloadSha256: HASH,
      reviewPayloadSha256: HASH,
    };
    const missingReason = plainToInstance(ReviewOperationStageAdoptionDto, {
      ...base,
      decision: OperationAdoptionDecision.REJECT,
    });
    const reasonOnApproval = plainToInstance(ReviewOperationStageAdoptionDto, {
      ...base,
      decision: OperationAdoptionDecision.APPROVE,
      rejectionReason:
        'Una aprobacion no debe contener razon propia de un rechazo.',
    });
    const validRejection = plainToInstance(ReviewOperationStageAdoptionDto, {
      ...base,
      decision: OperationAdoptionDecision.REJECT,
      rejectionReason:
        'La evidencia presentada no permite comprobar la fecha efectiva.',
    });

    expect(await validate(missingReason)).not.toHaveLength(0);
    expect(await validate(reasonOnApproval)).not.toHaveLength(0);
    await expect(validate(validRejection)).resolves.toHaveLength(0);
  });
});
