export interface BriefingAttention {
  code: string;
  severity: "critical" | "attention" | "ok";
  title: string;
  detail: string;
  href: string;
  count?: number;
}

/** Presentation order only: keep every alert and the server's severity. */
export function orderBriefingAlerts<T extends BriefingAttention>(
  alerts: readonly T[],
): T[] {
  const rank = { critical: 0, attention: 1, ok: 2 };
  return [...alerts].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** A dashboard shortcut must use the same visible routes as the sidebar. */
export function canOpenBriefingLink(
  href: string,
  visibleHrefs: readonly string[],
) {
  if (!href.startsWith("/dashboard/") || href.includes("\\")) return false;
  const path = new URL(href, "https://dashboard.invalid").pathname;
  return visibleHrefs.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}

export function briefingAlertCopy(alert: BriefingAttention) {
  if (alert.code === "ELECTORAL_CALENDAR_NOT_ACTIVE") {
    return {
      title: "Revisa el calendario electoral",
      detail:
        "No hay una versión activa. Revisa las fechas y sus fuentes antes de usarlas en la operación.",
    };
  }
  return { title: alert.title, detail: alert.detail };
}
