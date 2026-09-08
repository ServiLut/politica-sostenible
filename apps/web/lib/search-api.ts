import { apiRequest } from "@/lib/api-client";
import {
  buildSearchResultHref,
  type SearchResourceCategory,
} from "@/lib/entity-deep-links";

export interface GlobalSearchResponse {
  voters: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; email: string }>;
  proposals: Array<{ id: string; title: string; referenceCode: string }>;
  documents: [];
}

export interface GlobalSearchResult {
  id: string;
  title: string;
  subtitle?: string;
  category: SearchResourceCategory;
  href: string;
}

export function flattenGlobalSearch(
  response: GlobalSearchResponse,
): GlobalSearchResult[] {
  return [
    ...response.voters.map((voter) => ({
      id: voter.id,
      title: voter.name,
      subtitle: "Persona vinculada",
      category: "Voters" as const,
      href: buildSearchResultHref("Voters", voter.id),
    })),
    ...response.users.map((user) => ({
      id: user.id,
      title: user.name,
      subtitle: user.email,
      category: "Users" as const,
      href: buildSearchResultHref("Users", user.id),
    })),
    ...response.proposals.map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      subtitle: proposal.referenceCode,
      category: "Proposals" as const,
      href: buildSearchResultHref("Proposals", proposal.id),
    })),
  ];
}

export function searchGlobally(query: string, signal?: AbortSignal) {
  return apiRequest<GlobalSearchResponse>("search", {
    method: "POST",
    body: JSON.stringify({ query }),
    signal,
  });
}
