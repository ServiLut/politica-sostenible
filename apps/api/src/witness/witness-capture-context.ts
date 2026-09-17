import { ConflictException } from '@nestjs/common';
import {
  PoliticalOperationStage,
  Prisma,
  WitnessCaptureContext,
} from '../../prisma/generated/prisma';

type WitnessContextTransaction = Pick<Prisma.TransactionClient, '$queryRaw'>;

type OperationStageRow = Readonly<{ stage: PoliticalOperationStage }>;

export type WitnessCaptureOperation = 'READ' | 'WRITE' | 'CONFIGURE';

/**
 * Resolves provenance from the database row while holding a shared row lock.
 * The lock prevents a stage transition from racing an E-14 write and makes the
 * decision independent from client payloads and stale JWT/UI state.
 */
export async function resolveWitnessCaptureContext(
  transaction: WitnessContextTransaction,
  tenantId: string,
  operation: WitnessCaptureOperation,
): Promise<WitnessCaptureContext> {
  const profiles = await transaction.$queryRaw<OperationStageRow[]>(
    Prisma.sql`
      SELECT "stage"
      FROM "OperationProfile"
      WHERE "tenantId" = ${tenantId}
      FOR SHARE
    `,
  );
  const stage = profiles[0]?.stage;

  if (!stage) {
    throw new ConflictException({
      code: 'OPERATION_STAGE_NOT_CONFIGURED',
      message:
        'Configura o adopta la etapa vigente antes de usar reportes E-14',
      currentStage: null,
    });
  }

  if (stage === PoliticalOperationStage.SIMULATION) {
    return WitnessCaptureContext.SIMULATION;
  }

  if (
    operation === 'CONFIGURE' &&
    stage === PoliticalOperationStage.ELECTION_PREPARATION
  ) {
    return WitnessCaptureContext.REAL;
  }

  if (
    operation !== 'CONFIGURE' &&
    (stage === PoliticalOperationStage.ELECTION_DAY ||
      stage === PoliticalOperationStage.POST_ELECTION ||
      (operation === 'READ' && stage === PoliticalOperationStage.CLOSED))
  ) {
    return WitnessCaptureContext.REAL;
  }

  throw new ConflictException({
    code: 'E14_CAPTURE_STAGE_NOT_ALLOWED',
    message: `Los reportes E-14 no estan disponibles durante ${stage}`,
    currentStage: stage,
    allowedStages:
      operation === 'CONFIGURE'
        ? [
            PoliticalOperationStage.ELECTION_PREPARATION,
            PoliticalOperationStage.SIMULATION,
          ]
        : operation === 'READ'
          ? [
              PoliticalOperationStage.SIMULATION,
              PoliticalOperationStage.ELECTION_DAY,
              PoliticalOperationStage.POST_ELECTION,
              PoliticalOperationStage.CLOSED,
            ]
          : [
              PoliticalOperationStage.SIMULATION,
              PoliticalOperationStage.ELECTION_DAY,
              PoliticalOperationStage.POST_ELECTION,
            ],
  });
}
