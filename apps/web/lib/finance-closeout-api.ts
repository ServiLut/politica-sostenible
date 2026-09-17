import { apiRequest } from '@/lib/api-client';

export type FinanceCloseoutCommandType =
  | 'DOSSIER_CREATE'
  | 'BANK_STATEMENT_CREATE'
  | 'IN_KIND_CREATE'
  | 'PAYABLE_CREATE'
  | 'PAYABLE_SETTLE'
  | 'REPORT_VERSION_CREATE'
  | 'REPORT_APPROVAL_RECORD'
  | 'EXTERNAL_EVIDENCE_RECORD'
  | 'EXTERNAL_EVIDENCE_REVIEW';
export type FinanceReportKind = 'CANDIDATE' | 'CONSOLIDATED';
export type FinanceApprovalDecision = 'APPROVE' | 'RETURN_FOR_CORRECTION';
export type FinanceExternalReviewDecision = 'APPROVE' | 'REJECT';
export type FinanceBankMatchStatus = 'MATCHED' | 'UNMATCHED' | 'EXCLUDED';

export interface FinanceCloseoutVersion {
  id: string;
  versionNumber: number;
  basedOnVersionId: string | null;
  correctionReason: string | null;
  preparationNote: string;
  createdAt: string;
  internalStatus:
    | 'DRAFT'
    | 'IN_REVIEW'
    | 'APPROVED_INTERNAL'
    | 'RETURNED_FOR_CORRECTION';
  approvals: Array<{
    control: 'CAMPAIGN_MANAGER' | 'ACCOUNTANT' | 'COMPLIANCE';
    decision: FinanceApprovalDecision;
    rationale: string;
    createdAt: string;
  }>;
  ledgerCut: {
    id: string;
    periodStartsAt: string;
    periodEndsAt: string;
    cutoffAt: string;
    entryCount: number;
    totalIncome: string | number;
    totalExpense: string | number;
    balance: string | number;
    ledgerSha256: string;
  };
  externalEvidenceStatus:
    | 'NOT_RECORDED'
    | 'PENDING_REVIEW'
    | 'APPROVED'
    | 'REJECTED';
  externalEvidence: null | {
    id: string;
    authorityName: string;
    channel: string;
    externalReference: string;
    submittedAt: string;
    evidenceSha256: string;
    hasPrivateFile: true;
    officialPlatformVerified: false;
  };
}

export interface FinanceCloseoutOverview {
  operationStage: string;
  readOnly: boolean;
  legalStateNotice: string;
  readiness: {
    readyForCloseout: boolean;
    evaluatedAt: string;
    basis: string;
    blockers: Array<{ code: string; detail: string }>;
  };
  summary: {
    dossierCount: number;
    dossierWithoutVersionCount: number;
    bankStatementCount: number;
    inKindContributionCount: number;
    payableCount: number;
    pendingEntryCount: number;
    approvedUnreportedEntryCount: number;
    unreportedEntryCount: number;
    unmatchedBankLineCount: number;
    outstandingPayables: string | number;
  };
  dossiers: Array<{
    id: string;
    kind: FinanceReportKind;
    subjectCode: string;
    subjectName: string;
    createdAt: string;
    versions: FinanceCloseoutVersion[];
  }>;
  bankStatements: Array<{
    id: string;
    bankName: string;
    accountMasked: string;
    periodStartsAt: string;
    periodEndsAt: string;
    openingBalance: string | number;
    closingBalance: string | number;
    lineCount: number;
    unmatchedLineCount: number;
    excludedLineCount: number;
    lines: Array<{
      id: string;
      lineNumber: number;
      occurredAt: string;
      bankReference: string;
      description: string;
      debit: string | number;
      credit: string | number;
      matchStatus: FinanceBankMatchStatus;
      matchedEntryId: string | null;
      exclusionReason: string | null;
    }>;
    statementSha256: string;
    hasPrivateFile: true;
  }>;
  inKindContributions: Array<{
    id: string;
    contributorName: string;
    contributorDocumentMasked: string;
    contributionDate: string;
    description: string;
    value: string | number;
    valuationMethod: string;
    valuationSourceReference: string;
    valuationSha256: string;
    hasPrivateFile: true;
  }>;
  payables: Array<{
    id: string;
    creditorName: string;
    creditorTaxIdMasked: string;
    description: string;
    incurredAt: string;
    dueAt: string;
    originalAmount: string | number;
    settledAmount: string | number;
    outstandingAmount: string | number;
    status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID';
    hasPrivateFile: true;
  }>;
}

type CommandIdentity = { clientRequestId: string };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, nested]) => key !== 'payloadSha256' && nested !== undefined,
        )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalFinanceCloseoutPayload(
  type: FinanceCloseoutCommandType,
  input: object,
): string {
  return JSON.stringify(canonicalize({ type, ...input }));
}

export async function computeFinanceCloseoutPayloadSha256(
  type: FinanceCloseoutCommandType,
  input: object,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonicalFinanceCloseoutPayload(type, input),
  );
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function normalize<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  ) as T;
}

async function postCommand<T>(
  path: string,
  type: FinanceCloseoutCommandType,
  input: Record<string, unknown>,
  binding?: Record<string, unknown>,
): Promise<T> {
  const normalized = normalize(input);
  const payloadSha256 = await computeFinanceCloseoutPayloadSha256(type, {
    ...(binding ?? {}),
    ...normalized,
  });
  return apiRequest<T>(path, {
    method: 'POST',
    body: JSON.stringify({ ...normalized, payloadSha256 }),
  });
}

export function getFinanceCloseoutOverview(signal?: AbortSignal) {
  return apiRequest<FinanceCloseoutOverview>('finance/closeout', { signal });
}

export function createFinanceDossier(
  input: CommandIdentity & {
    kind: FinanceReportKind;
    subjectCode: string;
    subjectName: string;
  },
) {
  return postCommand('finance/closeout/dossiers', 'DOSSIER_CREATE', {
    ...input,
    subjectCode: input.subjectCode.trim().toUpperCase(),
  });
}

export function createFinanceBankStatement(
  input: CommandIdentity & Record<string, unknown>,
) {
  return postCommand(
    'finance/closeout/bank-statements',
    'BANK_STATEMENT_CREATE',
    input,
  );
}

export function createFinanceInKindContribution(
  input: CommandIdentity & Record<string, unknown>,
) {
  return postCommand(
    'finance/closeout/in-kind-contributions',
    'IN_KIND_CREATE',
    input,
  );
}

export function createFinancePayable(
  input: CommandIdentity & Record<string, unknown>,
) {
  return postCommand('finance/closeout/payables', 'PAYABLE_CREATE', input);
}

export function settleFinancePayable(
  payableId: string,
  input: CommandIdentity & Record<string, unknown>,
) {
  return postCommand(
    `finance/closeout/payables/${payableId}/settlements`,
    'PAYABLE_SETTLE',
    input,
    { payableId },
  );
}

export function createFinanceReportVersion(
  dossierId: string,
  input: CommandIdentity & Record<string, unknown>,
) {
  return postCommand(
    `finance/closeout/dossiers/${dossierId}/versions`,
    'REPORT_VERSION_CREATE',
    input,
    { dossierId },
  );
}

export function approveFinanceReportVersion(
  versionId: string,
  input: CommandIdentity & {
    decision: FinanceApprovalDecision;
    rationale: string;
  },
) {
  return postCommand(
    `finance/closeout/versions/${versionId}/approvals`,
    'REPORT_APPROVAL_RECORD',
    input,
    { versionId },
  );
}

export function recordFinanceExternalEvidence(
  versionId: string,
  input: CommandIdentity & Record<string, unknown>,
) {
  return postCommand(
    `finance/closeout/versions/${versionId}/external-evidence`,
    'EXTERNAL_EVIDENCE_RECORD',
    input,
    { versionId },
  );
}

export function reviewFinanceExternalEvidence(
  evidenceId: string,
  input: CommandIdentity & {
    decision: FinanceExternalReviewDecision;
    reviewNote: string;
  },
) {
  return postCommand(
    `finance/closeout/external-evidence/${evidenceId}/review`,
    'EXTERNAL_EVIDENCE_REVIEW',
    input,
    { evidenceId },
  );
}
