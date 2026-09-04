import { NextRequest, NextResponse } from "next/server";

/**
 * Historical UI prototypes must never render in a deployed application. Some of
 * them contain local-only state and simulated operational results. Keep the
 * source available while the corresponding real workflows are migrated, but
 * stop requests here before Next.js can serve a prototype page or its RSC
 * payload.
 */
const LEGACY_ROUTE_REDIRECTS: Readonly<Record<string, string>> = {
  "/olvide-mi-contraseña": "/olvide-mi-contrasena",
  "/reiniciar-contraseña": "/reiniciar-contrasena",
  "/crm-demo": "/",
  "/test": "/",
  "/dashboard/compliance": "/dashboard/audit",
  "/dashboard/directory": "/dashboard/votantes",
  "/dashboard/elections": "/dashboard/war-room",
  "/dashboard/finanzas": "/dashboard/finance",
  "/dashboard/messaging": "/dashboard/communications",
  "/dashboard/org": "/dashboard/team",
  "/dashboard/pipeline": "/dashboard/votantes",
  "/dashboard/security": "/dashboard/audit",
  "/dashboard/testigos": "/dashboard/war-room",
};

const BLOCKED_LEGACY_ROUTES = new Set([
  "/dashboard/agent",
  "/dashboard/settings",
]);

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname.replace(/\/$/, "") || "/";
  const canonicalPath = Object.entries(LEGACY_ROUTE_REDIRECTS).find(
    ([legacyPath]) =>
      pathname === legacyPath || pathname.startsWith(`${legacyPath}/`),
  )?.[1];

  if (canonicalPath) {
    return NextResponse.redirect(new URL(canonicalPath, request.url), 308);
  }

  if (BLOCKED_LEGACY_ROUTES.has(pathname)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  return new NextResponse("Not Found", { status: 404 });
}

export const config = {
  matcher: [
    "/olvide-mi-contraseña",
    "/reiniciar-contraseña",
    "/crm-demo",
    "/test",
    "/dashboard/agent/:path*",
    "/dashboard/compliance/:path*",
    "/dashboard/directory/:path*",
    "/dashboard/elections/:path*",
    "/dashboard/finanzas/:path*",
    "/dashboard/messaging/:path*",
    "/dashboard/org/:path*",
    "/dashboard/pipeline/:path*",
    "/dashboard/security/:path*",
    "/dashboard/settings/:path*",
    "/dashboard/testigos/:path*",
  ],
};
