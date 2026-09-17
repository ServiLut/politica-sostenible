import type { PoliticalOperationStage } from "@/types/saas-schema";

const E14_PERSISTENCE_STAGES = new Set<PoliticalOperationStage>([
  "SIMULATION",
  "ELECTION_DAY",
  "POST_ELECTION",
]);

const POLLING_PLACE_CONFIGURATION_STAGES = new Set<PoliticalOperationStage>([
  "ELECTION_PREPARATION",
  "SIMULATION",
]);

export function canPersistE14(
  stage: PoliticalOperationStage | null | undefined,
): boolean {
  return (
    stage !== null &&
    stage !== undefined &&
    E14_PERSISTENCE_STAGES.has(stage)
  );
}

export function canConfigurePollingPlaces(
  stage: PoliticalOperationStage | null | undefined,
): boolean {
  return (
    stage !== null &&
    stage !== undefined &&
    POLLING_PLACE_CONFIGURATION_STAGES.has(stage)
  );
}
