import { apiRequest } from "./api-client";

export type PqrsdCommandName =
  | "RULE_PACKAGE_CREATE"
  | "RULE_PACKAGE_REVIEW"
  | "DOSSIER_CREATE"
  | "DOCUMENT_ATTACH"
  | "DOCUMENT_REVIEW"
  | "ACKNOWLEDGEMENT_RECORD"
  | "CLASSIFICATION_PROPOSE"
  | "CLASSIFICATION_REVIEW"
  | "ASSIGNMENT_RECORD"
  | "TRANSFER_PROPOSE"
  | "TRANSFER_REVIEW"
  | "TRANSFER_ATTEMPT_RECORD"
  | "EXTENSION_PROPOSE"
  | "EXTENSION_REVIEW"
  | "RESPONSE_VERSION_CREATE"
  | "RESPONSE_REVIEW"
  | "RESPONSE_AUTHORIZE"
  | "DELIVERY_ATTEMPT_RECORD"
  | "DOSSIER_CLOSE"
  | "DOSSIER_REOPEN";

export type PqrsdDossierStatus =
  | "RECEIVED"
  | "CLASSIFICATION_PENDING"
  | "CLASSIFIED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "TRANSFER_PENDING"
  | "WAITING_ON_PETITIONER"
  | "EXTENSION_PROPOSED"
  | "DRAFT_RESPONSE"
  | "RETURNED_FOR_CHANGES"
  | "REVIEWED"
  | "AUTHORIZED"
  | "DELIVERY_PENDING"
  | "DELIVERED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED";

export const PQRSD_DOCUMENT_TYPES = [
  "INTAKE_ATTACHMENT",
  "RECEIPT_ACKNOWLEDGEMENT",
  "CLASSIFICATION_SUPPORT",
  "TRANSFER_SUPPORT",
  "TRANSFER_PROOF",
  "EXTENSION_SUPPORT",
  "RESPONSE_ATTACHMENT",
  "AUTHORIZATION_ARTIFACT",
  "DELIVERY_PROOF",
  "CLOSURE_SUPPORT",
  "REOPENING_SUPPORT",
  "OTHER",
] as const;

export interface PqrsdRule {
  id: string;
  classificationKey: string;
  label: string;
  durationDays: number;
  dayMethod: "CALENDAR_DAYS" | "WORKING_DAYS";
  startRule:
    | "RECEIPT_DATE"
    | "NEXT_CALENDAR_DATE"
    | "NEXT_WORKING_DATE"
    | "MANUAL_REVIEW";
  legalBasis: string;
  highRisk: boolean;
}

export interface PqrsdRulePackage {
  id: string;
  scopeKey: string;
  versionLabel: string;
  sourceUrl: string;
  sourceReference: string;
  sourceSha256: string;
  timeZone: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  nonWorkingWeekdays: number[];
  status: "DRAFT" | "ACTIVE" | "REJECTED" | "SUPERSEDED";
  revision: number;
  createdById: string;
  rules: PqrsdRule[];
  calendarExceptions: Array<{
    localDate: string;
    type: "NON_WORKING" | "WORKING_OVERRIDE";
    label: string;
    sourceReference: string;
  }>;
}

export interface PqrsdDossierListItem {
  id: string;
  reference: string;
  receivedAt: string;
  receivedTimeZone: string;
  status: PqrsdDossierStatus;
  riskLevel: "NORMAL" | "HIGH";
  version: number;
  rulePackage?: { rules: PqrsdRule[]; timeZone: string; sourceReference: string };
  updatedAt: string;
  petitioner: {
    maskedFullName: string;
    maskedDocumentNumber?: string | null;
    maskedEmail?: string | null;
    maskedPhone?: string | null;
  } | null;
  currentPrimaryAssignee?: { id: string; name: string; isActive: boolean } | null;
  currentBackupAssignee?: { id: string; name: string; isActive: boolean } | null;
  classifications: Array<{
    categoryLabel: string;
    competence: string;
    department: string;
    review?: { decision: string } | null;
  }>;
  deadlines: Array<{
    calculationStatus: string;
    currentDueLocalDate?: string | null;
    dueAt?: string | null;
  }>;
  detailHref: string;
}

export interface PqrsdAlert {
  code: string;
  severity: "critical" | "warning" | "info";
  dossierId: string;
  reference: string;
  message: string;
  href: string;
  remainingBusinessDays: number | null;
}

export interface PqrsdOverview {
  scope: "PUBLIC_OFFICE_PQRSD_ONLY";
  configurationReady: boolean;
  institutionalStatus:
    | "INTERNAL_EVIDENCE_SYSTEM_CONFIGURED"
    | "CONFIGURATION_REQUIRED";
  institutionalMessage: string;
  externalDeliveryAutomated: false;
  generatedAt: string;
  packages: PqrsdRulePackage[];
  dossiers: PqrsdDossierListItem[];
  alerts: PqrsdAlert[];
  team: Array<{ id: string; name: string; role: string }>;
  privacy: {
    listDataMasked: true;
    detailAccessAudited: true;
    campaignCrmReuse: false;
    exportEnabled: false;
  };
}

export interface PqrsdDetail extends Record<string, unknown> {
  id: string;
  reference: string;
  subject: string;
  description: string;
  status: PqrsdDossierStatus;
  version: number;
  rulePackage?: {
    rules: PqrsdRule[];
    timeZone: string;
    sourceReference: string;
  };
  petitioner?: {
    fullName: string;
    documentType?: string | null;
    documentNumber?: string | null;
    email?: string | null;
    phone?: string | null;
    postalAddress?: string | null;
    preferredChannel: string;
  } | null;
  documents: Array<Record<string, unknown> & { id: string; type: string; reviews: Array<{ decision: string }> }>;
  classifications: Array<Record<string, unknown> & { id: string; versionNumber: number; review?: { decision: string } | null }>;
  deadlines: Array<Record<string, unknown> & { id: string; calculationStatus: string; currentDueLocalDate?: string | null }>;
  assignments: Array<Record<string, unknown> & { id: string }>;
  transfers: Array<Record<string, unknown> & { id: string; review?: { decision: string } | null }>;
  extensions: Array<Record<string, unknown> & { id: string; review?: { decision: string } | null }>;
  responses: Array<Record<string, unknown> & { id: string; versionNumber: number; review?: { decision: string } | null; authorization?: { decision: string } | null }>;
  closures: Array<Record<string, unknown> & { id: string }>;
  reopenings: Array<Record<string, unknown> & { id: string }>;
  statusEvents: Array<Record<string, unknown> & { id: string; toStatus: string }>;
  privacyNotice: string;
}

type CommandInput = Record<string, unknown> & { clientRequestId?: string };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => key !== "payloadSha256" && entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function canonicalPqrsdCommand(
  type: PqrsdCommandName,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export async function computePqrsdCommandSha256(
  type: PqrsdCommandName,
  input: object,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPqrsdCommand(type, input));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function mutate<T>(
  path: string,
  type: PqrsdCommandName,
  input: CommandInput,
  routeIdentity: Record<string, string> = {},
): Promise<T> {
  const clientRequestId = input.clientRequestId ?? globalThis.crypto.randomUUID();
  const command = { ...input, clientRequestId };
  const payloadSha256 = await computePqrsdCommandSha256(type, {
    ...command,
    ...routeIdentity,
  });
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify({ ...command, payloadSha256 }),
  });
}

export function getPqrsdOverview(signal?: AbortSignal) {
  return apiRequest<PqrsdOverview>("pqrsd?limit=200", { signal });
}

export function getPqrsdDetail(
  dossierId: string,
  purpose: string,
  signal?: AbortSignal,
) {
  return apiRequest<PqrsdDetail>(
    `pqrsd/dossiers/${encodeURIComponent(dossierId)}?purpose=${encodeURIComponent(purpose)}`,
    { signal },
  );
}

export function getPqrsdDocumentDownload(resourceId: string) {
  return apiRequest<{ url: string; expiresAt: string }>(
    "storage/download-url",
    {
      method: "POST",
      body: JSON.stringify({ module: "pqrsd", resourceId }),
    },
  );
}

export const createPqrsdRulePackage = (input: CommandInput) =>
  mutate("pqrsd/rule-packages", "RULE_PACKAGE_CREATE", input);
export const reviewPqrsdRulePackage = (packageId: string, input: CommandInput) =>
  mutate(
    `pqrsd/rule-packages/${encodeURIComponent(packageId)}/review`,
    "RULE_PACKAGE_REVIEW",
    input,
    { packageId },
  );
export const createPqrsdDossier = (input: CommandInput) =>
  mutate("pqrsd/dossiers", "DOSSIER_CREATE", input);
export const attachPqrsdDocument = (input: CommandInput) =>
  mutate("pqrsd/documents", "DOCUMENT_ATTACH", input);
export const reviewPqrsdDocument = (documentId: string, input: CommandInput) =>
  mutate(
    `pqrsd/documents/${encodeURIComponent(documentId)}/review`,
    "DOCUMENT_REVIEW",
    input,
    { documentId },
  );
export const recordPqrsdAcknowledgement = (dossierId: string, input: CommandInput) =>
  mutate(
    `pqrsd/dossiers/${encodeURIComponent(dossierId)}/acknowledgements`,
    "ACKNOWLEDGEMENT_RECORD",
    input,
    { dossierId },
  );
export const proposePqrsdClassification = (dossierId: string, input: CommandInput) =>
  mutate(
    `pqrsd/dossiers/${encodeURIComponent(dossierId)}/classifications`,
    "CLASSIFICATION_PROPOSE",
    input,
    { dossierId },
  );
export const reviewPqrsdClassification = (classificationId: string, input: CommandInput) =>
  mutate(
    `pqrsd/classifications/${encodeURIComponent(classificationId)}/review`,
    "CLASSIFICATION_REVIEW",
    input,
    { classificationId },
  );
export const recordPqrsdAssignment = (dossierId: string, input: CommandInput) =>
  mutate(
    `pqrsd/dossiers/${encodeURIComponent(dossierId)}/assignments`,
    "ASSIGNMENT_RECORD",
    input,
    { dossierId },
  );
export const proposePqrsdTransfer = (dossierId: string, input: CommandInput) =>
  mutate(
    `pqrsd/dossiers/${encodeURIComponent(dossierId)}/transfers`,
    "TRANSFER_PROPOSE",
    input,
    { dossierId },
  );
export const reviewPqrsdTransfer = (transferId: string, input: CommandInput) =>
  mutate(
    `pqrsd/transfers/${encodeURIComponent(transferId)}/review`,
    "TRANSFER_REVIEW",
    input,
    { transferId },
  );
export const recordPqrsdTransferAttempt = (transferId: string, input: CommandInput) =>
  mutate(
    `pqrsd/transfers/${encodeURIComponent(transferId)}/attempts`,
    "TRANSFER_ATTEMPT_RECORD",
    input,
    { transferId },
  );
export const proposePqrsdExtension = (dossierId: string, input: CommandInput) =>
  mutate(
    `pqrsd/dossiers/${encodeURIComponent(dossierId)}/extensions`,
    "EXTENSION_PROPOSE",
    input,
    { dossierId },
  );
export const reviewPqrsdExtension = (extensionId: string, input: CommandInput) =>
  mutate(
    `pqrsd/extensions/${encodeURIComponent(extensionId)}/review`,
    "EXTENSION_REVIEW",
    input,
    { extensionId },
  );
export const createPqrsdResponseVersion = (dossierId: string, input: CommandInput) =>
  mutate(
    `pqrsd/dossiers/${encodeURIComponent(dossierId)}/responses`,
    "RESPONSE_VERSION_CREATE",
    input,
    { dossierId },
  );
export const reviewPqrsdResponse = (responseId: string, input: CommandInput) =>
  mutate(
    `pqrsd/responses/${encodeURIComponent(responseId)}/review`,
    "RESPONSE_REVIEW",
    input,
    { responseId },
  );
export const authorizePqrsdResponse = (responseId: string, input: CommandInput) =>
  mutate(
    `pqrsd/responses/${encodeURIComponent(responseId)}/authorize`,
    "RESPONSE_AUTHORIZE",
    input,
    { responseId },
  );
export const recordPqrsdDeliveryAttempt = (responseId: string, input: CommandInput) =>
  mutate(
    `pqrsd/responses/${encodeURIComponent(responseId)}/delivery-attempts`,
    "DELIVERY_ATTEMPT_RECORD",
    input,
    { responseId },
  );
export const closePqrsdDossier = (dossierId: string, input: CommandInput) =>
  mutate(
    `pqrsd/dossiers/${encodeURIComponent(dossierId)}/close`,
    "DOSSIER_CLOSE",
    input,
    { dossierId },
  );
export const reopenPqrsdDossier = (dossierId: string, input: CommandInput) =>
  mutate(
    `pqrsd/dossiers/${encodeURIComponent(dossierId)}/reopen`,
    "DOSSIER_REOPEN",
    input,
    { dossierId },
  );
