import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizedOrigin(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsed = new URL(value);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      (parsed.pathname && parsed.pathname !== '/') ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function configuredRequestOrigins(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const configured =
    environment.CORS_ORIGINS ?? environment.NEXT_PUBLIC_APP_URL;
  if (!configured?.trim()) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  return [
    ...new Set(
      configured
        .split(',')
        .map((origin) => normalizedOrigin(origin.trim()))
        .filter((origin): origin is string => origin !== null),
    ),
  ];
}

export function isUnsafeMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Browser mutations carrying an Origin must come from an explicitly allowed
 * frontend. Non-browser clients authenticate with Bearer and commonly omit it.
 */
export function isTrustedBrowserMutation(
  request: Pick<Request, 'headers' | 'method'>,
  allowedOrigins: readonly string[],
): boolean {
  if (!isUnsafeMethod(request.method)) return true;
  if (request.headers.origin === undefined) return true;

  const origin = normalizedOrigin(request.headers.origin);
  return origin !== null && allowedOrigins.includes(origin);
}

/** Cookie-authenticated mutations always require a trustworthy Origin. */
export function isTrustedCookieMutation(
  request: Pick<Request, 'headers' | 'method'>,
  allowedOrigins: readonly string[],
): boolean {
  if (!isUnsafeMethod(request.method)) return true;

  const origin = normalizedOrigin(request.headers.origin);
  return origin !== null && allowedOrigins.includes(origin);
}
