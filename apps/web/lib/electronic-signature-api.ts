import { apiRequest } from "@/lib/api-client";

export type ElectronicSignatureModule = "finance" | "e14";

interface CandidateDocument {
  documentId: string;
  resourceId: string;
  contentType: string;
  actualSize: number;
  confirmedAt: string;
  consumedAt: string;
  signature: { id: string; signedAt: string } | null;
}

export interface FinanceSignatureCandidate extends CandidateDocument {
  resource: {
    kind: "FinancialEntry";
    type: string;
    occurredAt: string;
    label: string;
  };
}

export interface E14SignatureCandidate extends CandidateDocument {
  resource: {
    kind: "WitnessReport";
    mesa: number;
    captureContext: string;
    pollingPlace: { code: string; name: string };
  };
}

export type ElectronicSignatureCandidate =
  | FinanceSignatureCandidate
  | E14SignatureCandidate;

export interface SigningCandidatePage {
  items: ElectronicSignatureCandidate[];
  limit: number;
  truncated: boolean;
}

export interface ElectronicSignatureResult {
  id: string;
  signedAt: string;
  module: ElectronicSignatureModule;
  resourceType: "FinancialEntry" | "WitnessReport";
  integrityScope: "LINK_AND_STORAGE_METADATA";
  contentIntegrity: "UNVERIFIED";
}

export interface ElectronicSignatureVerification extends ElectronicSignatureResult {
  valid: boolean;
}

export function listSigningCandidates(
  module: ElectronicSignatureModule,
  signal?: AbortSignal,
) {
  return apiRequest<SigningCandidatePage>(
    `/electronic-signature/candidates?module=${encodeURIComponent(module)}`,
    { cache: "no-store", signal },
  );
}

export function signElectronicDocument(input: {
  documentId: string;
  module: ElectronicSignatureModule;
  resourceId: string;
  otpCode: string;
}) {
  return apiRequest<ElectronicSignatureResult>("/electronic-signature/sign", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function verifyElectronicSignature(input: {
  id: string;
  module: ElectronicSignatureModule;
  resourceId: string;
}) {
  const query = new URLSearchParams({
    module: input.module,
    resourceId: input.resourceId,
  });
  return apiRequest<ElectronicSignatureVerification>(
    `/electronic-signature/${encodeURIComponent(input.id)}/verify?${query.toString()}`,
    { cache: "no-store" },
  );
}
