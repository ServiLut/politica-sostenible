import { apiRequest } from "@/lib/api-client";
import type {
  BackendUserRole,
  PoliticalOperationStage,
  Tenant,
} from "@/types/saas-schema";
import type {
  OperationClosureType,
  OperationTerminationCause,
  OperationTerminationStatus,
} from "@/lib/operation-termination-api";

export type HandoverStatus = "READY" | "ATTENTION" | "BLOCKED";

export interface HandoverAction {
  code: string;
  severity: "BLOCK" | "WARN";
  label: string;
  detail: string;
  href: string;
}

export interface PostElectionHandoverReport {
  reportId: string;
  packageKind:
    | "INTERNAL_CAMPAIGN_CLOSEOUT_DRAFT"
    | "EXCEPTIONAL_TERMINATION_DUTIES_DOSSIER";
  generatedAt: string;
  status: HandoverStatus;
  organization: {
    name: string;
    type: Exclude<Tenant["type"], "PUBLIC_OFFICE">;
  };
  election: {
    name: string | null;
    type: string;
    date: string;
    circumscriptionType: string;
    circumscriptionName: string;
  };
  lifecycle: {
    stage: Extract<PoliticalOperationStage, "POST_ELECTION" | "CLOSED">;
    retentionPeriodDays: number;
    closureType: OperationClosureType | null;
    terminatedAt: string | null;
    terminationCause: OperationTerminationCause | null;
    complianceCertified: false;
    authorityFilingCertified: false;
  };
  termination: {
    requestId: string | null;
    status: OperationTerminationStatus | null;
    effectiveAt: string | null;
    reviewedAt: string | null;
    reviewer: {
      id: string;
      name: string;
      role: BackendUserRole;
    } | null;
  } | null;
  finance: {
    entries: number;
    pendingReview: number;
    approvedNotReported: number;
    reported: number;
    income: number;
    expenses: number;
    balance: number;
    reportScope: string | null;
    reportDeadline: string | null;
    officialLimitsReference: string | null;
    cuentasClarasCodeConfigured: boolean;
    closeoutReady: boolean;
    closeoutBlockerCodes: string[];
  };
  operation: {
    openTasks: number;
    openCases: number;
    pendingCommunications: number;
    e14PendingReview: number;
    e14Rejected: number;
  };
  evidence: {
    confirmedNotAssociated: number;
    expiredAuthorizations: number;
  };
  governance: {
    activePrivacyNotices: number;
    activeTeamByRole: Array<{ role: BackendUserRole; count: number }>;
  };
  actions: HandoverAction[];
  transitionPolicy: {
    automaticTransferAllowed: false;
    campaignDataReusedAutomatically: false;
    requiredDestinationType: "PUBLIC_OFFICE";
    explanation: string;
  };
  disclaimer: string;
  integrity: {
    algorithm: "SHA-256";
    scope: "REPORT_BODY_WITHOUT_INTEGRITY";
    sha256: string;
  };
}

export interface PostElectionHandoverReportSummary {
  reportId: string;
  operationProfileId: string;
  generatedAt: string;
  status: HandoverStatus;
  packageKind: PostElectionHandoverReport["packageKind"];
  sha256: string;
  generatedBy: {
    id: string;
    name: string;
    role: BackendUserRole;
  };
}

export interface PostElectionHandoverReportList {
  items: PostElectionHandoverReportSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function generatePostElectionHandover(): Promise<PostElectionHandoverReport> {
  return apiRequest("transition-handover/report", { method: "POST" });
}

export function listPostElectionHandovers(
  page = 1,
  limit = 25,
  signal?: AbortSignal,
): Promise<PostElectionHandoverReportList> {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return apiRequest(`transition-handover/reports?${query.toString()}`, {
    signal,
  });
}

export function getPostElectionHandover(
  reportId: string,
  signal?: AbortSignal,
): Promise<PostElectionHandoverReport> {
  return apiRequest(
    `transition-handover/reports/${encodeURIComponent(reportId)}`,
    { signal },
  );
}
