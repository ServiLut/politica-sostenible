import { createHmac } from 'node:crypto';
import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import { isEmail } from 'class-validator';

const LOGIN_IDENTITY_RATE_LIMIT_KEY = 'login-identity-rate-limit';

export const LoginIdentityRateLimit = () =>
  SetMetadata(LOGIN_IDENTITY_RATE_LIMIT_KEY, true);

function loginIdentity(request: { body?: unknown }): string | null {
  const body = request.body;
  if (!body || typeof body !== 'object' || !('email' in body)) return null;
  if (typeof body.email !== 'string') return null;
  // Guards run before DTO transformation. Match LoginDto canonicalization, and
  // leave malformed input to validation without allocating an identity bucket.
  const email = body.email.trim().toLowerCase();
  return email.length <= 254 && isEmail(email) ? email : null;
}

export function createLoginIdentityThrottler(secret: string): ThrottlerOptions {
  if (!secret)
    throw new Error('A server secret is required for login throttling');
  return {
    name: 'login-identity',
    limit: 20,
    ttl: 60_000,
    blockDuration: 120_000,
    skipIf: (context: ExecutionContext) =>
      Reflect.getMetadata(
        LOGIN_IDENTITY_RATE_LIMIT_KEY,
        context.getHandler(),
      ) !== true ||
      loginIdentity(context.switchToHttp().getRequest<{ body?: unknown }>()) ===
        null,
    getTracker: (request) =>
      createHmac('sha256', secret)
        .update(
          JSON.stringify([
            'login-identity:v1',
            loginIdentity(request) ?? 'invalid',
          ]),
        )
        .digest('hex'),
  };
}
