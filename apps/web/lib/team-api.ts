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

export interface AcceptTeamInvitationInput {
  token: string;
  password: string;
  name: string;
  documentId: string;
  phone?: string;
  termsAccepted: true;
  termsVersion: "2026.1";
}

export function listTeamMembers(signal?: AbortSignal) {
  return apiRequest<PaginatedTeamResult<TeamMember>>(
    "team/members?page=1&limit=100",
    { signal },
  );
}

export function listPendingTeamInvitations(signal?: AbortSignal) {
  return apiRequest<PaginatedTeamResult<TeamInvitation>>(
    "team/invitations?page=1&limit=100",
    { signal },
  );
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

export async function listAssignableTeamDivisions(
  role: BackendUserRole,
  search = "",
  signal?: AbortSignal,
): Promise<TeamDivision[]> {
  const types = ASSIGNABLE_DIVISION_TYPES[role] ?? [];
  const responses = await Promise.all(
    types.map((type) => {
      const query = new URLSearchParams({ type, page: "1", limit: "30" });
      if (search.trim()) query.set("search", search.trim());
      return apiRequest<PaginatedTeamResult<TeamDivision>>(
        `campaigns/divisions?${query}`,
        { signal },
      );
    }),
  );

  const unique = new Map<string, TeamDivision>();
  for (const response of responses) {
    for (const division of response.items) unique.set(division.id, division);
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
