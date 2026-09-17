export type SearchResourceCategory =
  | "Voters"
  | "Users"
  | "Proposals"
  | "Tasks"
  | "Commitments"
  | "Cases"
  | "Incidents"
  | "Pqrsd";

const RESOURCE_TARGETS: Record<
  SearchResourceCategory,
  { pathname: string; view: string }
> = {
  Voters: { pathname: "/dashboard/votantes", view: "detail" },
  Users: { pathname: "/dashboard/team", view: "detail" },
  Proposals: { pathname: "/dashboard/proposals", view: "detail" },
  Tasks: { pathname: "/dashboard/tasks", view: "tasks" },
  Commitments: { pathname: "/dashboard/tasks", view: "commitments" },
  Cases: { pathname: "/dashboard/cases", view: "detail" },
  Incidents: { pathname: "/dashboard/incidents", view: "detail" },
  Pqrsd: { pathname: "/dashboard/pqrsd", view: "detail" },
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

  const target = RESOURCE_TARGETS[category];
  const query = new URLSearchParams({ view: target.view, entityId });
  return `${target.pathname}?${query.toString()}`;
}

export function readEntityDeepLink(search: string): string | null {
  const query = new URLSearchParams(search);
  if (query.get("view") !== "detail") return null;

  const entityIds = query.getAll("entityId");
  if (entityIds.length !== 1) return null;

  const entityId = entityIds[0].trim();
  return isValidResourceId(entityId) ? entityId : null;
}
