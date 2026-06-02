import { AUTH_TOKEN_KEY } from './auth-token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function requireAuthHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  const token = getAuthToken();

  if (!token) {
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}
