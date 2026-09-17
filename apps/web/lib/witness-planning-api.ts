import { apiRequest } from "@/lib/api-client";
import type { PoliticalOperationStage } from "@/types/saas-schema";

export type WitnessCaptureContext = "REAL" | "SIMULATION";
export type WitnessAssignmentType = "PRIMARY" | "BACKUP";
export type WitnessAssignmentStatus = "PLANNED" | "CONFIRMED" | "CANCELLED";

export interface WitnessCoverageWindow {
  id: string;
  captureContext: WitnessCaptureContext;
  puestoId: string;
  localDate: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  utcOffsetMinutes: number;
  version: number;
  puesto: {
    id: string;
    code: string;
    name: string;
    expectedTables: number | null;
    votingDate: string | null;
    timeZone: string | null;
    isActive: boolean;
  };
}

export interface WitnessAssignment {
  id: string;
  coverageWindowId: string;
  captureContext: WitnessCaptureContext;
  puestoId: string;
  tableStart: number;
  tableEnd: number;
  shiftStartsAt: string;
  shiftEndsAt: string;
  assignmentType: WitnessAssignmentType;
  status: WitnessAssignmentStatus;
  witnessId: string;
  version: number;
  eligible: boolean;
  witness: { id: string; name: string; isActive: boolean; role: "WITNESS" };
  puesto: { id: string; code: string; name: string; expectedTables: number | null };
  coverageWindow: Omit<WitnessCoverageWindow, "captureContext" | "puestoId" | "puesto">;
}

export interface WitnessCandidate {
  id: string;
  name: string;
  division: { id: string; code: string; name: string } | null;
}

export interface WitnessTimeGap {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
}

export interface WitnessTemporalGapGroup {
  tableFrom: number;
  tableTo: number;
  gaps: WitnessTimeGap[];
}

export interface WitnessCoverageResponse {
  operationStage: PoliticalOperationStage;
  captureContext: WitnessCaptureContext;
  readinessBasis: string;
  summary: {
    expectedPollingPlaces: number;
    placesWithoutExpectedTables: number;
    placesWithoutCoverageWindows: number;
    coverageWindowCount: number;
    expectedTableWindows: number;
    confirmedPrimaryTables: number;
    confirmedBackupTables: number;
    missingPrimaryTables: number;
    missingBackupTables: number;
    confirmedPrimaryUncoveredMinutes: number;
    confirmedBackupUncoveredMinutes: number;
    fullyConfirmed: boolean;
    ineligibleAssignmentCount: number;
  };
  places: Array<{
    puesto: { id: string; code: string; name: string; expectedTables: number | null };
    configurationReady: boolean;
    hasCoverageWindow: boolean;
    fullyConfirmed: boolean;
    windows: Array<{
      window: Omit<WitnessCoverageWindow, "captureContext" | "puestoId" | "puesto" | "version"> & {
        durationMinutes: number;
      };
      primaryConfirmedTemporalGaps: WitnessTemporalGapGroup[];
      backupConfirmedTemporalGaps: WitnessTemporalGapGroup[];
      bothConfirmedTables: number;
      fullyConfirmed: boolean;
    }>;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateCoverageWindowInput {
  clientRequestId: string;
  puestoId: string;
  captureContext: WitnessCaptureContext;
  localDate: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  utcOffsetMinutes: number;
}

export interface CreateWitnessAssignmentInput {
  clientRequestId: string;
  coverageWindowId: string;
  witnessId: string;
  puestoId: string;
  tableStart: number;
  tableEnd: number;
  shiftStartsAt: string;
  shiftEndsAt: string;
  captureContext: WitnessCaptureContext;
  assignmentType: WitnessAssignmentType;
}

function query(context: WitnessCaptureContext): string {
  return `captureContext=${encodeURIComponent(context)}`;
}

export function getWitnessCoverage(
  context: WitnessCaptureContext,
  signal?: AbortSignal,
): Promise<WitnessCoverageResponse> {
  return apiRequest(`witnesses/assignments/coverage?${query(context)}&limit=100`, {
    signal,
  });
}

export function listWitnessCoverageWindows(
  context: WitnessCaptureContext,
  signal?: AbortSignal,
): Promise<{ operationStage: PoliticalOperationStage; readOnly: boolean; items: WitnessCoverageWindow[] }> {
  return apiRequest(`witnesses/assignments/coverage-windows?${query(context)}`, {
    signal,
  });
}

export function listWitnessAssignments(
  context: WitnessCaptureContext,
  signal?: AbortSignal,
): Promise<{ operationStage: PoliticalOperationStage; readOnly: boolean; items: WitnessAssignment[] }> {
  return apiRequest(`witnesses/assignments?${query(context)}&limit=100`, { signal });
}

export function listWitnessCandidates(signal?: AbortSignal): Promise<{
  items: WitnessCandidate[];
  truncated: boolean;
}> {
  return apiRequest("witnesses/assignments/candidates", { signal });
}

export function createWitnessCoverageWindow(input: CreateCoverageWindowInput) {
  return apiRequest<WitnessCoverageWindow>("witnesses/assignments/coverage-windows", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWitnessCoverageWindow(
  id: string,
  input: Omit<CreateCoverageWindowInput, "puestoId" | "captureContext" | "localDate"> & {
    expectedVersion: number;
  },
) {
  return apiRequest<WitnessCoverageWindow>(
    `witnesses/assignments/coverage-windows/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function createWitnessAssignment(input: CreateWitnessAssignmentInput) {
  return apiRequest<WitnessAssignment>("witnesses/assignments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function confirmWitnessAssignment(id: string, expectedVersion: number) {
  return apiRequest<WitnessAssignment>(
    `witnesses/assignments/${encodeURIComponent(id)}/confirm`,
    {
      method: "POST",
      body: JSON.stringify({
        clientRequestId: globalThis.crypto.randomUUID(),
        expectedVersion,
      }),
    },
  );
}

export function cancelWitnessAssignment(
  id: string,
  expectedVersion: number,
  reason: string,
) {
  return apiRequest<WitnessAssignment>(
    `witnesses/assignments/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        clientRequestId: globalThis.crypto.randomUUID(),
        expectedVersion,
        reason: reason.trim(),
      }),
    },
  );
}

export function reassignWitnessAssignment(
  id: string,
  expectedVersion: number,
  reason: string,
  input: Omit<CreateWitnessAssignmentInput, "clientRequestId">,
) {
  return apiRequest<WitnessAssignment>(
    `witnesses/assignments/${encodeURIComponent(id)}/reassign`,
    {
      method: "POST",
      body: JSON.stringify({
        ...input,
        clientRequestId: globalThis.crypto.randomUUID(),
        expectedVersion,
        reason: reason.trim(),
      }),
    },
  );
}
