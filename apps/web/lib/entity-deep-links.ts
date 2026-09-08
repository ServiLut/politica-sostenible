export type SearchResourceCategory = "Voters" | "Users" | "Proposals";

const RESOURCE_TARGETS: Record<SearchResourceCategory, string> = {
  Voters: "/dashboard/votantes",
  Users: "/dashboard/team",
  Proposals: "/dashboard/proposals",
};

const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidResourceId(value: string): boolean {
  return RESOURCE_ID_PATTERN.test(value);
}

export function buildSearchResultHref(
  category: SearchResourceCategory,
  entityId: string,
): string {
  if (!isValidResourceId(entityId)) {
    throw new Error("La búsqueda devolvió un identificador inválido.");
  }

  const query = new URLSearchParams({ view: "detail", entityId });
  return `${RESOURCE_TARGETS[category]}?${query.toString()}`;
}

export function readEntityDeepLink(search: string): string | null {
  const query = new URLSearchParams(search);
  if (query.get("view") !== "detail") return null;

  const entityIds = query.getAll("entityId");
  if (entityIds.length !== 1) return null;

  const entityId = entityIds[0].trim();
  return isValidResourceId(entityId) ? entityId : null;
}
