import { ApiError, apiRequest } from "@/lib/api-client";

export const PROPOSAL_CATEGORIES = [
  "EDUCATION",
  "HEALTH",
  "INFRASTRUCTURE",
  "SECURITY",
  "ECONOMY",
  "ENVIRONMENT",
  "CULTURE",
  "SOCIAL",
  "GOVERNANCE",
  "OTHER",
] as const;

export type ProposalCategory = (typeof PROPOSAL_CATEGORIES)[number];

export const PROPOSAL_STATUSES = [
  "DRAFT",
  "PROPOSED",
  "IN_PROGRESS",
  "COMPLETED",
  "WITHDRAWN",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const PROPOSAL_STATUS_TRANSITIONS: Readonly<
  Record<ProposalStatus, readonly ProposalStatus[]>
> = {
  DRAFT: ["DRAFT", "PROPOSED", "WITHDRAWN"],
  PROPOSED: ["PROPOSED", "IN_PROGRESS", "WITHDRAWN"],
  IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "WITHDRAWN"],
  COMPLETED: ["COMPLETED"],
  WITHDRAWN: ["WITHDRAWN"],
};

export function allowedProposalStatuses(
  currentStatus: ProposalStatus,
): readonly ProposalStatus[] {
  return PROPOSAL_STATUS_TRANSITIONS[currentStatus];
}

export interface ProposalOwner {
  id: string;
  name: string;
}

export interface PoliticalProposal {
  id: string;
  referenceCode: string;
  title: string;
  description: string;
  category: ProposalCategory;
  targetGroup: string | null;
  status: ProposalStatus;
  progressPercent: number;
  isPublic: boolean;
  territory: string | null;
  estimatedCost: number | null;
  sourceUrl: string | null;
  ownerId: string;
  owner: ProposalOwner;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalPage {
  items: PoliticalProposal[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SaveProposalInput {
  title: string;
  description?: string;
  category: ProposalCategory;
  status?: ProposalStatus;
  progressPercent?: number;
  isPublic?: boolean;
  estimatedCost?: number | null;
  ownerId?: string;
}

export const PROPOSALS_PAGE_SIZE = 20;
const MAX_PROPOSALS_PAGE_SIZE = 100;

export interface ListProposalsParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: ProposalCategory;
  status?: ProposalStatus;
  isPublic?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseProposalPage(
  value: unknown,
  requestedPage: number,
  requestedLimit: number,
): ProposalPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("La API devolvió una página de propuestas inválida.");
  }

  const pagination = value.pagination;
  if (
    !isRecord(pagination) ||
    !Number.isSafeInteger(pagination.page) ||
    pagination.page !== requestedPage ||
    !Number.isSafeInteger(pagination.limit) ||
    (pagination.limit as number) < 1 ||
    (pagination.limit as number) > MAX_PROPOSALS_PAGE_SIZE ||
    pagination.limit !== requestedLimit ||
    !Number.isSafeInteger(pagination.total) ||
    (pagination.total as number) < 0 ||
    !Number.isSafeInteger(pagination.totalPages) ||
    (pagination.totalPages as number) < 0 ||
    pagination.totalPages !== Math.ceil((pagination.total as number) / requestedLimit) ||
    value.items.length !== Math.min(requestedLimit, Math.max(0, (pagination.total as number) - (requestedPage - 1) * requestedLimit))
  ) {
    throw new Error("La API devolvió una paginación de propuestas inválida.");
  }

  if (
    new Set(value.items.map((item) => isRecord(item) ? item.id : null)).size !== value.items.length ||
    value.items.some(
      (item) => !isRecord(item) || typeof item.id !== "string" || !item.id,
    )
  ) {
    throw new Error("La API devolvió una propuesta sin identificador válido.");
  }

  return value as unknown as ProposalPage;
}

/** Fetch exactly one page; the UI never downloads the entire program to filter it. */
export async function listProposals(
  params: ListProposalsParams = {},
  signal?: AbortSignal,
): Promise<ProposalPage> {
  const page = params.page ?? 1;
  const limit = params.limit ?? PROPOSALS_PAGE_SIZE;
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.category) query.set("category", params.category);
  if (params.status) query.set("status", params.status);
  if (params.isPublic !== undefined) query.set("isPublic", String(params.isPublic));
  return parseProposalPage(
    await apiRequest<unknown>(`proposals?${query.toString()}`, { signal }),
    page,
    limit,
  );
}

/** Direct links resolve by ID, independently of the current list page or filters. */
export async function getProposal(id: string, signal?: AbortSignal): Promise<PoliticalProposal | null> {
  try {
    return await apiRequest(`proposals/${encodeURIComponent(id)}`, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function createProposal(
  input: SaveProposalInput,
): Promise<PoliticalProposal> {
  return apiRequest("proposals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProposal(
  id: string,
  input: Partial<SaveProposalInput>,
): Promise<PoliticalProposal> {
  return apiRequest(`proposals/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteProposal(id: string): Promise<{ success: true }> {
  return apiRequest(`proposals/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export interface ListResponsiblesParams {
  search?: string;
  limit?: number;
  page?: number;
}

export interface ComboboxUser {
  id: string;
  name: string;
  role: string;
}

export interface ResponsiblesPage {
  items: ComboboxUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function listProposalResponsibles(
  params: ListResponsiblesParams = {},
  signal?: AbortSignal,
): Promise<ResponsiblesPage> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.page) query.set("page", String(params.page));
  
  const queryString = query.toString();
  return apiRequest(
    queryString
      ? `proposals/responsibles?${queryString}`
      : "proposals/responsibles",
    { signal },
  );
}
