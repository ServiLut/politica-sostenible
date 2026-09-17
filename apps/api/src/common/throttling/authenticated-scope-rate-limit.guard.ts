import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import {
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerStorage,
} from '@nestjs/throttler';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { opaqueThrottleKey } from './redis-throttler-storage';

const WINDOW_MS = 60_000;
const BLOCK_MS = 60_000;
const ACCOUNT_LIMIT = 600;
const TENANT_LIMIT = 6_000;

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

interface HeaderResponse {
  header(name: string, value: string | number): unknown;
}

function scopedKey(scope: 'account' | 'tenant', value: string): string {
  return opaqueThrottleKey(`authenticated-${scope}`, value);
}

@Injectable()
export class AuthenticatedScopeRateLimitGuard implements CanActivate {
  constructor(
    @InjectThrottlerStorage()
    private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<HeaderResponse>();
    const user = request.user;
    if (!user?.userId || !user.tenantId) return true;

    const [account, tenant] = await Promise.all([
      this.storage.increment(
        scopedKey('account', user.userId),
        WINDOW_MS,
        ACCOUNT_LIMIT,
        BLOCK_MS,
        'account',
      ),
      this.storage.increment(
        scopedKey('tenant', user.tenantId),
        WINDOW_MS,
        TENANT_LIMIT,
        BLOCK_MS,
        'tenant',
      ),
    ]);

    response.header('X-RateLimit-Limit-Account', ACCOUNT_LIMIT);
    response.header(
      'X-RateLimit-Remaining-Account',
      Math.max(0, ACCOUNT_LIMIT - account.totalHits),
    );
    response.header('X-RateLimit-Reset-Account', account.timeToExpire);
    response.header('X-RateLimit-Limit-Tenant', TENANT_LIMIT);
    response.header(
      'X-RateLimit-Remaining-Tenant',
      Math.max(0, TENANT_LIMIT - tenant.totalHits),
    );
    response.header('X-RateLimit-Reset-Tenant', tenant.timeToExpire);

    if (account.isBlocked || tenant.isBlocked) {
      response.header(
        'Retry-After',
        Math.max(account.timeToBlockExpire, tenant.timeToBlockExpire, 1),
      );
      throw new ThrottlerException(
        'Demasiadas solicitudes para esta cuenta u organizacion',
      );
    }
    return true;
  }
}

export const authenticatedScopeRateLimitTesting = {
  accountLimit: ACCOUNT_LIMIT,
  tenantLimit: TENANT_LIMIT,
  scopedKey,
};
