import { apiRequest } from "@/lib/api-client";
import { BackendUserRole } from "@/types/saas-schema";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: BackendUserRole;
  isActive: boolean;
  divisionId: string | null;
  division: TeamDivision | null;
  createdAt: string;
}

export type TeamDivisionType = "MUNICIPIO" | "ZONA" | "PUESTO";

export interface TeamDivision {
  id: string;
  code: string;
  name: string;
  type: TeamDivisionType;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: BackendUserRole;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string };
}

export interface PaginatedTeamResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateTeamInvitationInput {
  email: string;
  role: BackendUserRole;
}

export interface CreatedTeamInvitation {
  invitation: Omit<TeamInvitation, "invitedBy">;
  invitationUrl: string;
  delivery: "MANUAL";
}

export interface TeamMemberAccessReset {
  memberId: string;
  temporaryPassword: string;
  temporaryPasswordExpiresAt: string;
}

export interface AcceptTeamInvitationInput {
  token: string;
  password: string;
  name: string;
  documentId: string;
  phone?: string;
  termsAccepted: true;
  termsVersion: "2026.1";
}

async function listAllTeamPages<T>(path: string, signal?: AbortSignal) {
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const query = new URLSearchParams({ page: String(page), limit: "100" });
    const response = await apiRequest<PaginatedTeamResult<T>>(
      `${path}?${query.toString()}`,
      { signal },
    );
    items.push(...response.items);
    totalPages = response.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return items;
}

export function listTeamMembers(signal?: AbortSignal) {
  return listAllTeamPages<TeamMember>("team/members", signal);
}

export function listPendingTeamInvitations(signal?: AbortSignal) {
  return listAllTeamPages<TeamInvitation>("team/invitations", signal);
}

export function createTeamInvitation(input: CreateTeamInvitationInput) {
  return apiRequest<CreatedTeamInvitation>("team/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTeamMemberRole(memberId: string, role: BackendUserRole) {
  return apiRequest<Pick<TeamMember, "id" | "role" | "isActive">>(
    `team/members/${encodeURIComponent(memberId)}/role`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );
}

export function updateTeamMemberStatus(memberId: string, isActive: boolean) {
  return apiRequest<Pick<TeamMember, "id" | "role" | "isActive">>(
    `team/members/${encodeURIComponent(memberId)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    },
  );
}

export function resetTeamMemberAccess(memberId: string) {
  return apiRequest<TeamMemberAccessReset>(
    `team/members/${encodeURIComponent(memberId)}/access-reset`,
    { method: "POST" },
  );
}

export function updateTeamMemberDivision(
  memberId: string,
  divisionId: string | null,
) {
  return apiRequest<
    Pick<TeamMember, "id" | "role" | "isActive" | "divisionId" | "division">
  >(`team/members/${encodeURIComponent(memberId)}/division`, {
    method: "PATCH",
    body: JSON.stringify({ divisionId }),
  });
}

const ASSIGNABLE_DIVISION_TYPES: Partial<
  Record<BackendUserRole, TeamDivisionType[]>
> = {
  ZONE_COORDINATOR: ["MUNICIPIO", "ZONA"],
  WITNESS: ["PUESTO"],
  VOLUNTEER: ["MUNICIPIO", "ZONA", "PUESTO"],
};

const ASSIGNABLE_DIVISION_PAGE_SIZE = 100;
const MAX_ASSIGNABLE_DIVISION_PAGES = 1_000;

async function listAllAssignableDivisionPages(
  type: TeamDivisionType,
  search: string,
  signal?: AbortSignal,
) {
  const divisions: TeamDivision[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const query = new URLSearchParams({
      type,
      page: String(page),
      limit: String(ASSIGNABLE_DIVISION_PAGE_SIZE),
    });
    if (search) query.set("search", search);

    const response = await apiRequest<PaginatedTeamResult<TeamDivision>>(
      `campaigns/divisions?${query.toString()}`,
      { signal },
    );
    const pagination = response?.pagination;
    if (
      !Array.isArray(response?.items) ||
      !pagination ||
      !Number.isSafeInteger(pagination.page) ||
      pagination.page !== page ||
      !Number.isSafeInteger(pagination.totalPages) ||
      pagination.totalPages < 0 ||
      pagination.totalPages > MAX_ASSIGNABLE_DIVISION_PAGES ||
      (pagination.totalPages > 0 && pagination.totalPages < page)
    ) {
      throw new Error(
        "La API devolvió una paginación territorial inválida o excesiva.",
      );
    }

    divisions.push(...response.items);
    totalPages = pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return divisions;
}

export async function listAssignableTeamDivisions(
  role: BackendUserRole,
  search = "",
  signal?: AbortSignal,
): Promise<TeamDivision[]> {
  const types = ASSIGNABLE_DIVISION_TYPES[role] ?? [];
  const normalizedSearch = search.trim();
  const responses = await Promise.all(
    types.map((type) =>
      listAllAssignableDivisionPages(type, normalizedSearch, signal),
    ),
  );

  const unique = new Map<string, TeamDivision>();
  for (const divisions of responses) {
    for (const division of divisions) unique.set(division.id, division);
  }
  return [...unique.values()];
}

export function acceptTeamInvitation(input: AcceptTeamInvitationInput) {
  return apiRequest<{ message: string }>("auth/invitations/accept", {
    auth: false,
    method: "POST",
    body: JSON.stringify(input),
  });
}
