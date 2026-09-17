import { apiRequest } from "./api-client";

export const OFFLINE_INCIDENT_CATEGORIES = [
  "SECURITY",
  "LOGISTICS",
  "ELECTORAL_MATERIAL",
  "ACCESSIBILITY",
  "PUBLIC_ORDER",
  "TECHNOLOGY",
  "COMPLIANCE",
  "OTHER",
] as const;
export const OFFLINE_INCIDENT_PRIORITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
] as const;

export type OfflineIncidentCategory =
  (typeof OFFLINE_INCIDENT_CATEGORIES)[number];
export type OfflineIncidentPriority =
  (typeof OFFLINE_INCIDENT_PRIORITIES)[number];

export interface OfflineIncidentTerritory {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface OfflineIncidentCaptureContext {
  schemaVersion: 1;
  provisionedAt: string;
  stage: string;
  requiresTerritory: boolean;
  categories: OfflineIncidentCategory[];
  priorities: OfflineIncidentPriority[];
  territories: OfflineIncidentTerritory[];
}

export interface OfflineIncidentInput {
  category: OfflineIncidentCategory;
  priority: OfflineIncidentPriority;
  title: string;
  description: string;
  occurredOn: string;
  divisionId?: string;
}

export interface OfflineIncidentSyncInput extends OfflineIncidentInput {
  clientOperationId: string;
  capturedAt: string;
  payloadSha256: string;
}

export interface OfflineIncidentSyncReceipt {
  received: true;
  receiptId: string;
  clientOperationId: string;
  operationType: "INCIDENT_REPORT";
  status: "APPLIED" | "DUPLICATE";
  capturedAt: string;
  receivedAt: string;
  payloadSha256: string;
}

export function canonicalOfflineIncident(
  input: {
    clientOperationId: string;
    capturedAt: string;
  } & OfflineIncidentInput,
): string {
  return JSON.stringify({
    capturedAt: new Date(input.capturedAt).toISOString(),
    category: input.category,
    clientOperationId: input.clientOperationId.toLowerCase(),
    description: input.description.trim(),
    divisionId: input.divisionId?.trim() || null,
    occurredOn: input.occurredOn,
    priority: input.priority,
    title: input.title.trim(),
    version: 1,
  });
}

export async function computeOfflineIncidentSha256(
  input: {
    clientOperationId: string;
    capturedAt: string;
  } & OfflineIncidentInput,
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalOfflineIncident(input)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function getOfflineIncidentCaptureContext(signal?: AbortSignal) {
  return apiRequest<OfflineIncidentCaptureContext>(
    "offline-incidents/context",
    { signal },
  );
}

export function syncOfflineIncident(
  input: OfflineIncidentSyncInput,
  signal?: AbortSignal,
) {
  return apiRequest<OfflineIncidentSyncReceipt>("offline-incidents/sync", {
    method: "POST",
    signal,
    body: JSON.stringify(input),
  });
}
