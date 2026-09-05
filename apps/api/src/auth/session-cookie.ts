import type { Request, Response } from 'express';

export const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
export const PRODUCTION_SESSION_COOKIE = '__Host-politica_session';
export const DEVELOPMENT_SESSION_COOKIE = 'politica_session';

function isProduction(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV === 'production';
}

export function sessionCookieName(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return isProduction(environment)
    ? PRODUCTION_SESSION_COOKIE
    : DEVELOPMENT_SESSION_COOKIE;
}

export function setSessionCookie(
  response: Response,
  token: string,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  response.cookie(sessionCookieName(environment), token, {
    httpOnly: true,
    maxAge: SESSION_TTL_MS,
    path: '/',
    sameSite: 'strict',
    secure: isProduction(environment),
  });
}

export function clearSessionCookies(
  response: Response,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const options = {
    httpOnly: true,
    path: '/',
    sameSite: 'strict' as const,
    secure: isProduction(environment),
  };

  // Se eliminan ambos nombres para cerrar tambien sesiones creadas antes de
  // un cambio de entorno. En produccion solo se acepta el prefijo __Host-.
  response.clearCookie(PRODUCTION_SESSION_COOKIE, options);
  response.clearCookie(DEVELOPMENT_SESSION_COOKIE, options);
}

function cookieValue(cookieHeader: string, name: string): string | undefined {
  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator <= 0) continue;

    const candidateName = cookie.slice(0, separator).trim();
    if (candidateName !== name) continue;

    const value = cookie.slice(separator + 1).trim();
    return value || undefined;
  }

  return undefined;
}

export function readSessionCookie(
  request: Pick<Request, 'headers'>,
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;

  return cookieValue(header, sessionCookieName(environment));
}
