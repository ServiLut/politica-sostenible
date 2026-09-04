import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_VERSION_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET no permite validar la version de sesion');
  }
  return secret;
}

function digest(userId: string, passwordHash: string): Buffer {
  return createHmac('sha256', jwtSecret())
    .update(userId, 'utf8')
    .update('\0', 'utf8')
    .update(passwordHash, 'utf8')
    .digest();
}

export function createSessionVersion(
  userId: string,
  passwordHash: string,
): string {
  return digest(userId, passwordHash).toString('base64url');
}

export function isCurrentSessionVersion(
  candidate: unknown,
  userId: string,
  passwordHash: string,
): boolean {
  const expected = digest(userId, passwordHash);
  const candidateIsWellFormed =
    typeof candidate === 'string' && SESSION_VERSION_PATTERN.test(candidate);
  const decoded = candidateIsWellFormed
    ? Buffer.from(candidate, 'base64url')
    : Buffer.alloc(expected.length);
  const sameLength = decoded.length === expected.length;
  const comparable = sameLength ? decoded : Buffer.alloc(expected.length);

  return timingSafeEqual(expected, comparable) && sameLength;
}
