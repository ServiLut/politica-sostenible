import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerStorage,
} from '@nestjs/throttler';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { opaqueThrottleKey } from './redis-throttler-storage';
import {
  OPERATION_RATE_LIMIT_KEY,
  OPERATION_RATE_LIMITS,
  type RateLimitedOperation,
} from './operation-rate-limit';

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
    private readonly reflector: Reflector = new Reflector(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<HeaderResponse>();
    const user = request.user;
    if (!user?.userId || !user.tenantId) return true;

    // Reject a blocked account before charging any shared tenant quota. A
    // noisy account must not keep exhausting its colleagues' budget.
    await this.consume(
      response,
      'Account',
      scopedKey('account', user.userId),
      ACCOUNT_LIMIT,
      WINDOW_MS,
      BLOCK_MS,
      'account',
    );

    const operation = this.reflector.getAllAndOverride<RateLimitedOperation>(
      OPERATION_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (operation) {
      const policy = OPERATION_RATE_LIMITS[operation];
      await this.consume(
        response,
        'Operation-Account',
        opaqueThrottleKey(`operation-${operation}-account`, user.userId),
        policy.account,
        policy.windowMs,
        policy.windowMs,
        'operation-account',
      );
      await this.consume(
        response,
        'Operation-Tenant',
        opaqueThrottleKey(`operation-${operation}-tenant`, user.tenantId),
        policy.tenant,
        policy.windowMs,
        policy.windowMs,
        'operation-tenant',
      );
    }

    await this.consume(
      response,
      'Tenant',
      scopedKey('tenant', user.tenantId),
      TENANT_LIMIT,
      WINDOW_MS,
      BLOCK_MS,
      'tenant',
    );
    return true;
  }

  private async consume(
    response: HeaderResponse,
    headerScope: string,
    key: string,
    limit: number,
    ttl: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<void> {
    const record = await this.storage.increment(
      key,
      ttl,
      limit,
      blockDuration,
      throttlerName,
    );
    response.header(`X-RateLimit-Limit-${headerScope}`, limit);
    response.header(
      `X-RateLimit-Remaining-${headerScope}`,
      Math.max(0, limit - record.totalHits),
    );
    response.header(`X-RateLimit-Reset-${headerScope}`, record.timeToExpire);
    if (record.isBlocked) {
      response.header('Retry-After', Math.max(record.timeToBlockExpire, 1));
      throw new ThrottlerException(
        'Demasiadas solicitudes para esta cuenta u organizacion',
      );
    }
  }
}

export const authenticatedScopeRateLimitTesting = {
  accountLimit: ACCOUNT_LIMIT,
  tenantLimit: TENANT_LIMIT,
  scopedKey,
};
