import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_VERSION_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET no permite validar la version de sesion');
  }
  return secret;
}

function digest(
  userId: string,
  passwordHash: string,
  mfaEnabledAt: Date | null,
  authVersion: number,
): Buffer {
  if (!Number.isSafeInteger(authVersion) || authVersion < 0) {
    throw new Error('authVersion no permite validar la version de sesion');
  }

  const hmac = createHmac('sha256', jwtSecret())
    .update(userId, 'utf8')
    .update('\0', 'utf8')
    .update(passwordHash, 'utf8');

  // authVersion=0 conserva exactamente los bytes usados antes de la migracion:
  // HMAC(userId + NUL + passwordHash). Asi, un despliegue no expulsa por error
  // todas las sesiones que ya estaban vigentes.
  if (authVersion === 0) {
    return hmac.digest();
  }

  hmac
    .update('\0mfa-enabled-at\0', 'utf8')
    .update(mfaEnabledAt?.toISOString() ?? 'mfa-disabled', 'utf8')
    .update('\0auth-version\0', 'utf8')
    .update(String(authVersion), 'utf8');

  return hmac.digest();
}

export function createSessionVersion(
  userId: string,
  passwordHash: string,
  mfaEnabledAt: Date | null = null,
  authVersion = 0,
): string {
  return digest(userId, passwordHash, mfaEnabledAt, authVersion).toString(
    'base64url',
  );
}

export function isCurrentSessionVersion(
  candidate: unknown,
  userId: string,
  passwordHash: string,
  mfaEnabledAt: Date | null = null,
  authVersion = 0,
): boolean {
  let expected: Buffer;
  try {
    expected = digest(userId, passwordHash, mfaEnabledAt, authVersion);
  } catch {
    return false;
  }
  const candidateIsWellFormed =
    typeof candidate === 'string' && SESSION_VERSION_PATTERN.test(candidate);
  const decoded = candidateIsWellFormed
    ? Buffer.from(candidate, 'base64url')
    : Buffer.alloc(expected.length);
  const sameLength = decoded.length === expected.length;
  const comparable = sameLength ? decoded : Buffer.alloc(expected.length);

  return timingSafeEqual(expected, comparable) && sameLength;
}
