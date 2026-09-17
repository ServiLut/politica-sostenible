import { PoliticalOperationStage } from '../../prisma/generated/prisma';
import {
  getAllowedNextOperationStages,
  isValidOperationStageTransition,
  OPERATION_STAGE_TRANSITIONS,
  SAFE_INITIAL_OPERATION_STAGES,
} from './operation-profile-stage-transition';

const stages = Object.values(PoliticalOperationStage);

const allowedForwardTransitions: ReadonlyArray<
  readonly [PoliticalOperationStage, PoliticalOperationStage]
> = [
  [PoliticalOperationStage.EXPLORATION, PoliticalOperationStage.PRE_CAMPAIGN],
  [
    PoliticalOperationStage.PRE_CAMPAIGN,
    PoliticalOperationStage.SIGNATURE_COLLECTION,
  ],
  [PoliticalOperationStage.PRE_CAMPAIGN, PoliticalOperationStage.CAMPAIGN],
  [
    PoliticalOperationStage.SIGNATURE_COLLECTION,
    PoliticalOperationStage.CAMPAIGN,
  ],
  [
    PoliticalOperationStage.SIGNATURE_COLLECTION,
    PoliticalOperationStage.ELECTION_PREPARATION,
  ],
  [
    PoliticalOperationStage.CAMPAIGN,
    PoliticalOperationStage.ELECTION_PREPARATION,
  ],
  [
    PoliticalOperationStage.ELECTION_PREPARATION,
    PoliticalOperationStage.SIMULATION,
  ],
  [
    PoliticalOperationStage.ELECTION_PREPARATION,
    PoliticalOperationStage.ELECTION_DAY,
  ],
  [PoliticalOperationStage.SIMULATION, PoliticalOperationStage.ELECTION_DAY],
  [PoliticalOperationStage.ELECTION_DAY, PoliticalOperationStage.POST_ELECTION],
  [PoliticalOperationStage.POST_ELECTION, PoliticalOperationStage.CLOSED],
];

const allowedPairs = new Set(
  [
    ...allowedForwardTransitions,
    ...stages.map((stage) => [stage, stage] as const),
  ].map(([current, next]) => `${current}->${next}`),
);

describe('political operation stage lifecycle', () => {
  it('declares the complete direct transition graph explicitly', () => {
    expect(OPERATION_STAGE_TRANSITIONS).toEqual({
      EXPLORATION: ['PRE_CAMPAIGN'],
      PRE_CAMPAIGN: ['SIGNATURE_COLLECTION', 'CAMPAIGN'],
      SIGNATURE_COLLECTION: ['CAMPAIGN', 'ELECTION_PREPARATION'],
      CAMPAIGN: ['ELECTION_PREPARATION'],
      ELECTION_PREPARATION: ['SIMULATION', 'ELECTION_DAY'],
      SIMULATION: ['ELECTION_DAY'],
      ELECTION_DAY: ['POST_ELECTION'],
      POST_ELECTION: ['CLOSED'],
      CLOSED: [],
    });
  });

  it.each(
    stages.flatMap((current) =>
      stages.map((next) => ({
        current,
        next,
        expected: allowedPairs.has(`${current}->${next}`),
      })),
    ),
  )(
    'classifies $current -> $next as allowed=$expected',
    ({ current, next, expected }) => {
      expect(isValidOperationStageTransition(current, next)).toBe(expected);
    },
  );

  it.each(stages.map((stage) => ({ stage })))(
    'classifies $stage as a safe initial stage only when explicitly allowed',
    ({ stage }) => {
      expect(SAFE_INITIAL_OPERATION_STAGES.has(stage)).toBe(
        stage === PoliticalOperationStage.EXPLORATION ||
          stage === PoliticalOperationStage.PRE_CAMPAIGN,
      );
    },
  );

  it.each(stages.map((stage) => ({ stage })))(
    'exposes $stage itself plus only its valid direct next stages',
    ({ stage }) => {
      expect(getAllowedNextOperationStages(stage)).toEqual([
        stage,
        ...OPERATION_STAGE_TRANSITIONS[stage],
      ]);
    },
  );
});
