export const MAIN_CONTENT_ID = "main-content";
export const DASHBOARD_CONTENT_ID = "dashboard-content";

export function isDashboardPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export function getSkipNavigationTarget(pathname: string): string {
  return `#${
    isDashboardPath(pathname) ? DASHBOARD_CONTENT_ID : MAIN_CONTENT_ID
  }`;
}
