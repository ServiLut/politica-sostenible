import {
  canAccessNavigationItem,
  dashboardConfig,
  getDefaultDashboardRoute,
  matchesNavigationPath,
} from "@/config/navigation";
import type { Tenant, User } from "@/types/saas-schema";

const INTERNAL_NAVIGATION_ORIGIN = "https://navigation.invalid";
const MAX_RETURN_PATH_LENGTH = 2_048;
const UNSAFE_RETURN_PATH_CHARACTERS = /[\u0000-\u001f\u007f\\]/;

interface ParsedDashboardReturnPath {
  destination: string;
  pathname: string;
}

function parseDashboardReturnPath(
  requestedPath: string | null | undefined,
): ParsedDashboardReturnPath | null {
  if (
    !requestedPath ||
    requestedPath.length > MAX_RETURN_PATH_LENGTH ||
    requestedPath !== requestedPath.trim() ||
    !requestedPath.startsWith("/") ||
    requestedPath.startsWith("//") ||
    requestedPath.includes("#") ||
    UNSAFE_RETURN_PATH_CHARACTERS.test(requestedPath)
  ) {
    return null;
  }

  try {
    const parsed = new URL(requestedPath, INTERNAL_NAVIGATION_ORIGIN);
    if (
      parsed.origin !== INTERNAL_NAVIGATION_ORIGIN ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      (parsed.pathname !== "/dashboard" &&
        !parsed.pathname.startsWith("/dashboard/"))
    ) {
      return null;
    }

    return {
      destination: `${parsed.pathname}${parsed.search}`,
      pathname: parsed.pathname,
    };
  } catch {
    return null;
  }
}

export function buildLoginRedirectHref(
  pathname: string,
  search = "",
): string {
  const normalizedSearch =
    search && !search.startsWith("?") ? `?${search}` : search;
  const query = new URLSearchParams({ next: `${pathname}${normalizedSearch}` });
  return `/iniciar-sesion?${query.toString()}`;
}

export function resolvePostLoginDestination(
  requestedPath: string | null | undefined,
  user: User,
  tenant: Tenant,
): string {
  if (user.mustChangePassword === true) {
    return "/dashboard/profile";
  }

  const fallback = getDefaultDashboardRoute(
    user,
    tenant,
    tenant.operationStage,
  );
  const parsed = parseDashboardReturnPath(requestedPath);
  if (!parsed) return fallback;

  if (parsed.pathname === "/dashboard") return fallback;
  if (parsed.pathname === "/dashboard/profile") return parsed.destination;

  const requestedRoute = dashboardConfig.find((item) =>
    matchesNavigationPath(parsed.pathname, item.href),
  );
  const stageAllowed =
    !requestedRoute?.allowedStages ||
    Boolean(
      tenant.operationStage &&
        requestedRoute.allowedStages.includes(tenant.operationStage),
    );

  return requestedRoute &&
    stageAllowed &&
    canAccessNavigationItem(requestedRoute, user, tenant)
    ? parsed.destination
    : fallback;
}
