import { NextRequest, NextResponse } from 'next/server';

const BLOCKED_IN_PROD = ['/test', '/crm-demo'];

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  );
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  );

  return response;
}

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== 'production') {
    return withSecurityHeaders(NextResponse.next());
  }

  const { pathname } = request.nextUrl;
  const isBlocked = BLOCKED_IN_PROD.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isBlocked) {
    return withSecurityHeaders(NextResponse.rewrite(new URL('/404', request.url)));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/test/:path*', '/crm-demo/:path*'],
};
