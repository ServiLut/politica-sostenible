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

const BLOCKED_LEGACY_ROUTES = new Set(["/dashboard/agent"]);

function storageOrigin() {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(
  nonce: string,
  isDevelopment = process.env.NODE_ENV !== "production",
) {
  const allowedStorageOrigin = storageOrigin();

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // Several progress and heat-map components require calculated style
    // attributes. This exception cannot execute JavaScript; scripts remain
    // protected by a request-scoped nonce and strict-dynamic.
    "style-src 'self' 'unsafe-inline'",
    "manifest-src 'self'",
    "worker-src 'self'",
    `img-src 'self' data: blob:${allowedStorageOrigin ? ` ${allowedStorageOrigin}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self'${allowedStorageOrigin ? ` ${allowedStorageOrigin}` : ""}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function withContentSecurityPolicy(
  response: NextResponse,
  contentSecurityPolicy: string,
) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const pathname = request.nextUrl.pathname.replace(/\/$/, "") || "/";
  const canonicalPath = Object.entries(LEGACY_ROUTE_REDIRECTS).find(
    ([legacyPath]) =>
      pathname === legacyPath || pathname.startsWith(`${legacyPath}/`),
  )?.[1];

  if (canonicalPath) {
    return withContentSecurityPolicy(
      NextResponse.redirect(new URL(canonicalPath, request.url), 308),
      contentSecurityPolicy,
    );
  }

  if (BLOCKED_LEGACY_ROUTES.has(pathname)) {
    return withContentSecurityPolicy(
      new NextResponse("Not Found", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
        },
      }),
      contentSecurityPolicy,
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  return withContentSecurityPolicy(
    NextResponse.next({ request: { headers: requestHeaders } }),
    contentSecurityPolicy,
  );
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
