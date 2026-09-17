import { SetMetadata } from '@nestjs/common';
import { PoliticalOperationStage } from '../../../prisma/generated/prisma';

export const OPERATION_STAGE_POLICY_KEY = 'operation-stage-policy';

export type OperationStagePolicy =
  | Readonly<{ kind: 'ALLOW_CLOSED' }>
  | Readonly<{ kind: 'BLOCK_CLOSED' }>
  | Readonly<{
      kind: 'REQUIRE';
      allowedStages: readonly PoliticalOperationStage[];
    }>;

export const BlockWhenOperationClosed = () =>
  SetMetadata(OPERATION_STAGE_POLICY_KEY, {
    kind: 'BLOCK_CLOSED',
  } satisfies OperationStagePolicy);

/**
 * Overrides a controller-level freeze for rights that must survive archival
 * closure, such as consent revocation and personal-data rectification.
 */
export const AllowWhenOperationClosed = () =>
  SetMetadata(OPERATION_STAGE_POLICY_KEY, {
    kind: 'ALLOW_CLOSED',
  } satisfies OperationStagePolicy);

export const RequireOperationStages = (
  ...allowedStages: PoliticalOperationStage[]
) =>
  SetMetadata(OPERATION_STAGE_POLICY_KEY, {
    kind: 'REQUIRE',
    allowedStages: Object.freeze([...allowedStages]),
  } satisfies OperationStagePolicy);
