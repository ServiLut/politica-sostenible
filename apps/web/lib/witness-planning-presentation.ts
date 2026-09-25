import type { PoliticalOperationStage } from "@/types/saas-schema";
import type { WitnessCaptureContext } from "./witness-planning-api";

export function canEditWitnessPlanning(input: {
  stage?: PoliticalOperationStage;
  isPlanner: boolean;
  windowsReadOnly?: boolean;
  assignmentsReadOnly?: boolean;
  context: WitnessCaptureContext;
}): boolean {
  if (!input.stage || !input.isPlanner || input.windowsReadOnly !== false || input.assignmentsReadOnly !== false) return false;
  return input.context === "REAL" || ["CAMPAIGN", "ELECTION_PREPARATION", "SIMULATION"].includes(input.stage);
}
