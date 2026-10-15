import {
  getDefaultDashboardRoute,
  getNavigationGroupsForRole,
  getVisibleNavigationItems,
} from "../../config/navigation";
import type { Tenant, User } from "../../types/saas-schema";

function searchableText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

/** Discover the same sections as the sidebar, never a second permission list. */
export function searchNavigation(
  query: string,
  user: Pick<User, "role" | "backendRole"> | null,
  tenant: Pick<Tenant, "type" | "operationStage"> | null,
) {
  if (!user || !tenant) return [];

  const visible = getVisibleNavigationItems(
    user,
    tenant,
    tenant.operationStage,
  );
  const groups = getNavigationGroupsForRole(user.backendRole);
  const ordered = groups.flatMap((group) =>
    visible.filter((item) => item.group === group.id),
  );
  const terms = searchableText(query).trim().split(/\s+/).filter(Boolean);

  if (terms.length) {
    return ordered.filter((item) => {
      const text = searchableText(`${item.title} ${item.mobileTitle}`);
      return terms.every((term) => text.includes(term));
    });
  }

  const preferredHrefs = [
    getDefaultDashboardRoute(user, tenant, tenant.operationStage),
    "/dashboard/tasks",
    "/dashboard/events",
  ];
  const preferred = preferredHrefs.flatMap((href) =>
    visible.filter((item) => item.href === href),
  );
  return [
    ...new Map(
      [...preferred, ...ordered].map((item) => [item.href, item]),
    ).values(),
  ].slice(0, 6);
}
