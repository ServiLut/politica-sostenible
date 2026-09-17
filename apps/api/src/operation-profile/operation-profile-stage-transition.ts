import { PoliticalOperationStage } from '../../prisma/generated/prisma';

/**
 * Direct lifecycle transitions. Remaining in the same stage is also valid so
 * administrators can correct profile data without advancing the operation.
 *
 * Deliberate safe skips:
 * - PRE_CAMPAIGN -> CAMPAIGN for operations that do not collect signatures.
 * - SIGNATURE_COLLECTION -> ELECTION_PREPARATION when that collection is the
 *   operation's campaign phase.
 * - ELECTION_PREPARATION -> ELECTION_DAY when no simulation is scheduled.
 *
 * Early closure is intentionally excluded because the current profile does not
 * capture a withdrawal/cancellation reason or its approval evidence.
 */
export const OPERATION_STAGE_TRANSITIONS = {
  [PoliticalOperationStage.EXPLORATION]: [PoliticalOperationStage.PRE_CAMPAIGN],
  [PoliticalOperationStage.PRE_CAMPAIGN]: [
    PoliticalOperationStage.SIGNATURE_COLLECTION,
    PoliticalOperationStage.CAMPAIGN,
  ],
  [PoliticalOperationStage.SIGNATURE_COLLECTION]: [
    PoliticalOperationStage.CAMPAIGN,
    PoliticalOperationStage.ELECTION_PREPARATION,
  ],
  [PoliticalOperationStage.CAMPAIGN]: [
    PoliticalOperationStage.ELECTION_PREPARATION,
  ],
  [PoliticalOperationStage.ELECTION_PREPARATION]: [
    PoliticalOperationStage.SIMULATION,
    PoliticalOperationStage.ELECTION_DAY,
  ],
  [PoliticalOperationStage.SIMULATION]: [PoliticalOperationStage.ELECTION_DAY],
  [PoliticalOperationStage.ELECTION_DAY]: [
    PoliticalOperationStage.POST_ELECTION,
  ],
  [PoliticalOperationStage.POST_ELECTION]: [PoliticalOperationStage.CLOSED],
  [PoliticalOperationStage.CLOSED]: [],
} as const satisfies Record<
  PoliticalOperationStage,
  readonly PoliticalOperationStage[]
>;

/**
 * A new profile may only start before regulated campaign activity begins.
 * Existing operations at a later stage must first establish this auditable
 * lifecycle instead of bypassing its history during initial configuration.
 */
export const SAFE_INITIAL_OPERATION_STAGES: ReadonlySet<PoliticalOperationStage> =
  new Set([
    PoliticalOperationStage.EXPLORATION,
    PoliticalOperationStage.PRE_CAMPAIGN,
  ]);

export function isValidOperationStageTransition(
  current: PoliticalOperationStage,
  next: PoliticalOperationStage,
): boolean {
  if (current === next) return true;
  return getAllowedOperationStageTransitions(current).includes(next);
}

export function getAllowedOperationStageTransitions(
  current: PoliticalOperationStage,
): readonly PoliticalOperationStage[] {
  return (
    (
      OPERATION_STAGE_TRANSITIONS as Partial<
        Record<PoliticalOperationStage, readonly PoliticalOperationStage[]>
      >
    )[current] ?? []
  );
}

export function getAllowedNextOperationStages(
  current: PoliticalOperationStage,
): PoliticalOperationStage[] {
  return [current, ...getAllowedOperationStageTransitions(current)];
}
