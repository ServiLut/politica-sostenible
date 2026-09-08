import { apiRequest } from "@/lib/api-client";
import type {
  BackendUserRole,
  PoliticalOperationStage,
} from "@/types/saas-schema";

export type PoliticalOperationType =
  | "PRE_CANDIDACY"
  | "SINGLE_CANDIDACY"
  | "CORPORATION_CANDIDACY"
  | "PARTY_MOVEMENT"
  | "SIGNATURE_COMMITTEE"
  | "TERRITORIAL_TEAM";

export type ElectoralContestType =
  | "PRESIDENCY"
  | "GOVERNORSHIP"
  | "MAYORALTY"
  | "SENATE"
  | "HOUSE_OF_REPRESENTATIVES"
  | "DEPARTMENTAL_ASSEMBLY"
  | "MUNICIPAL_COUNCIL"
  | "LOCAL_ADMINISTRATIVE_BOARD"
  | "INTERNAL_ELECTION"
  | "OTHER";

export type ElectoralCircumscriptionType =
  | "NATIONAL"
  | "DEPARTMENTAL"
  | "MUNICIPAL"
  | "LOCAL"
  | "SPECIAL"
  | "INTERNAL";

export type CandidateListType = "CLOSED" | "OPEN_PREFERENTIAL";

export interface OperationProfile {
  id: string;
  tenantId: string;
  operationType: PoliticalOperationType;
  stage: PoliticalOperationStage;
  electionType: ElectoralContestType;
  circumscriptionType: ElectoralCircumscriptionType;
  circumscriptionName: string;
  circumscriptionCode: string | null;
  listType: CandidateListType | null;
  electionDate: string;
  expectedTeamSize: number;
  candidateCount: number;
  dataControllerName: string;
  responsibleDataUserId: string;
  retentionPeriodDays: number;
  revocationProcedure: string;
  responsibleDataUser: {
    id: string;
    name: string;
    role: BackendUserRole;
  };
  budget: {
    maxTotalBudget: number;
    maxPublicityLimit: number;
  };
  derived: {
    workspace: "ELECTION_DAY" | "SIMULATION" | "DAILY_OPERATION";
    scale: "SMALL" | "MEDIUM" | "LARGE";
    dayDEnabled: boolean;
    warRoomEnabled: boolean;
    signatureCollectionEnabled: boolean;
    candidateListEnabled: boolean;
    preferentialVoteEnabled: boolean;
    territoryScope:
      | "NATIONAL"
      | "DEPARTMENT"
      | "MUNICIPALITY"
      | "LOCALITY"
      | "SPECIAL"
      | "INTERNAL";
  };
  createdAt: string;
  updatedAt: string;
}

export type OperationProfileContext =
  | { configured: false; profile: null }
  | { configured: true; profile: OperationProfile };

export type ConfiguredOperationProfileContext = Extract<
  OperationProfileContext,
  { configured: true }
>;

export interface UpsertOperationProfileInput {
  operationType: PoliticalOperationType;
  stage: PoliticalOperationStage;
  electionType: ElectoralContestType;
  circumscriptionType: ElectoralCircumscriptionType;
  circumscriptionName: string;
  circumscriptionCode?: string;
  listType?: CandidateListType;
  electionDate: string;
  expectedTeamSize: number;
  candidateCount: number;
  maxTotalBudget: number;
  maxPublicityLimit: number;
  dataControllerName: string;
  responsibleDataUserId: string;
  retentionPeriodDays: number;
  revocationProcedure: string;
  expectedUpdatedAt?: string;
}

export function getOperationProfile(
  signal?: AbortSignal,
): Promise<OperationProfileContext> {
  return apiRequest("operation-profile", { signal });
}

export function saveOperationProfile(
  input: UpsertOperationProfileInput,
): Promise<ConfiguredOperationProfileContext> {
  return apiRequest("operation-profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
