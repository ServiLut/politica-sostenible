import { apiRequest } from "@/lib/api-client";

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

const PROPOSALS_PAGE_SIZE = 100;
const MAX_PROPOSAL_PAGES = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseProposalPage(
  value: unknown,
  requestedPage: number,
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
    (pagination.limit as number) > PROPOSALS_PAGE_SIZE ||
    !Number.isSafeInteger(pagination.total) ||
    (pagination.total as number) < 0 ||
    !Number.isSafeInteger(pagination.totalPages) ||
    (pagination.totalPages as number) < 0 ||
    (pagination.totalPages as number) > MAX_PROPOSAL_PAGES ||
    ((pagination.totalPages as number) === 0 &&
      (pagination.total as number) !== 0) ||
    ((pagination.totalPages as number) > 0 &&
      requestedPage > (pagination.totalPages as number)) ||
    value.items.length > (pagination.limit as number)
  ) {
    throw new Error("La API devolvió una paginación de propuestas inválida.");
  }

  if (
    value.items.some(
      (item) => !isRecord(item) || typeof item.id !== "string" || !item.id,
    )
  ) {
    throw new Error("La API devolvió una propuesta sin identificador válido.");
  }

  return value as unknown as ProposalPage;
}

export async function listProposals(
  signal?: AbortSignal,
): Promise<ProposalPage> {
  const items: PoliticalProposal[] = [];
  const ids = new Set<string>();
  let page = 1;
  let expectedPagination: ProposalPage["pagination"] | null = null;

  do {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PROPOSALS_PAGE_SIZE),
    });
    const response = parseProposalPage(
      await apiRequest<unknown>(`proposals?${query.toString()}`, { signal }),
      page,
    );

    if (!expectedPagination) {
      expectedPagination = response.pagination;
    } else if (
      response.pagination.total !== expectedPagination.total ||
      response.pagination.totalPages !== expectedPagination.totalPages ||
      response.pagination.limit !== expectedPagination.limit
    ) {
      throw new Error(
        "Las propuestas cambiaron mientras se cargaban. Actualiza para obtener un listado consistente.",
      );
    }

    for (const proposal of response.items) {
      if (ids.has(proposal.id)) {
        throw new Error(
          "La API repitió una propuesta entre páginas. Actualiza el listado.",
        );
      }
      ids.add(proposal.id);
      items.push(proposal);
    }
    page += 1;
  } while (
    expectedPagination !== null &&
    page <= expectedPagination.totalPages
  );

  const pagination =
    expectedPagination ??
    ({
      page: 1,
      limit: PROPOSALS_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    } satisfies ProposalPage["pagination"]);
  if (items.length !== pagination.total) {
    throw new Error(
      "La API no entregó todas las propuestas anunciadas. Actualiza el listado.",
    );
  }

  return { items, pagination };
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
  const url = queryString ? `proposals/responsibles?${queryString}` : "proposals/responsibles";
  
  return apiRequest(url, { signal });
}
