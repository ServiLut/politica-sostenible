import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CandidateListType,
  ElectoralCircumscriptionType,
  ElectoralContestType,
  PoliticalOperationStage,
  PoliticalOperationType,
} from '../../../prisma/generated/prisma';
import { UpsertOperationProfileDto } from './upsert-operation-profile.dto';

const validInput = {
  operationType: PoliticalOperationType.CORPORATION_CANDIDACY,
  stage: PoliticalOperationStage.CAMPAIGN,
  electionType: ElectoralContestType.MUNICIPAL_COUNCIL,
  circumscriptionType: ElectoralCircumscriptionType.MUNICIPAL,
  circumscriptionName: '  Medellin  ',
  circumscriptionCode: '  05001  ',
  listType: CandidateListType.OPEN_PREFERENTIAL,
  electionDate: '2027-10-31T13:00:00.000Z',
  expectedTeamSize: '80',
  candidateCount: '21',
  maxTotalBudget: '500000000.00',
  maxPublicityLimit: '100000000.00',
  dataControllerName: '  Movimiento ciudadano  ',
  responsibleDataUserId: 'user_compliance-1',
  retentionPeriodDays: '730',
  revocationProcedure:
    '  Envie su solicitud al canal de privacidad y recibira confirmacion escrita.  ',
};

describe('UpsertOperationProfileDto', () => {
  it('normalizes text and numeric configuration without accepting tenant identity', async () => {
    const dto = plainToInstance(UpsertOperationProfileDto, validInput);

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.circumscriptionName).toBe('Medellin');
    expect(dto.circumscriptionCode).toBe('05001');
    expect(dto.dataControllerName).toBe('Movimiento ciudadano');
    expect(dto.expectedTeamSize).toBe(80);
    expect(dto.maxTotalBudget).toBe(500000000);
    expect('tenantId' in dto).toBe(false);
  });

  it.each([
    [
      'corporation without list type',
      { ...validInput, listType: undefined },
      'tipo de lista',
    ],
    [
      'individual candidacy with list type',
      {
        ...validInput,
        operationType: PoliticalOperationType.SINGLE_CANDIDACY,
        electionType: ElectoralContestType.MAYORALTY,
        candidateCount: 1,
      },
      'solo aplica',
    ],
    [
      'individual candidacy with multiple candidates',
      {
        ...validInput,
        operationType: PoliticalOperationType.SINGLE_CANDIDACY,
        electionType: ElectoralContestType.MAYORALTY,
        listType: undefined,
        candidateCount: 2,
      },
      'exactamente una',
    ],
    [
      'corporation with uninominal election',
      {
        ...validInput,
        electionType: ElectoralContestType.MAYORALTY,
      },
      'eleccion colegiada',
    ],
    [
      'individual candidacy with corporation election',
      {
        ...validInput,
        operationType: PoliticalOperationType.SINGLE_CANDIDACY,
        listType: undefined,
        candidateCount: 1,
      },
      'uninominal',
    ],
    [
      'publicity over total budget',
      { ...validInput, maxPublicityLimit: 500000000.01 },
      'publicidad',
    ],
  ])('rejects incoherent configuration: %s', async (_label, input, message) => {
    const errors = await validate(
      plainToInstance(UpsertOperationProfileDto, input),
    );

    expect(JSON.stringify(errors)).toContain(message);
  });

  it.each([
    ['inactive data owner id format', { responsibleDataUserId: '../tenant-b' }],
    ['zero retention', { retentionPeriodDays: 0 }],
    ['empty controller', { dataControllerName: ' ' }],
    ['unclear revocation', { revocationProcedure: 'Llame' }],
    ['invalid election date', { electionDate: 'proximo domingo' }],
    ['zero team', { expectedTeamSize: 0 }],
  ])('rejects invalid readiness data: %s', async (_label, patch) => {
    const errors = await validate(
      plainToInstance(UpsertOperationProfileDto, {
        ...validInput,
        ...patch,
      }),
    );

    expect(errors.length).toBeGreaterThan(0);
  });
});
