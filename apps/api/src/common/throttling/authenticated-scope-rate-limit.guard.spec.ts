import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';
import {
  AuthenticatedScopeRateLimitGuard,
  authenticatedScopeRateLimitTesting,
} from './authenticated-scope-rate-limit.guard';

const allowed = {
  totalHits: 1,
  timeToExpire: 60,
  isBlocked: false,
  timeToBlockExpire: 0,
};

function context(user?: { userId: string; tenantId: string }) {
  const header = jest.fn();
  return {
    header,
    value: {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: () => ({ header }),
      }),
    } as unknown as ExecutionContext,
  };
}

describe('AuthenticatedScopeRateLimitGuard', () => {
  it('does nothing before authentication has established an identity', async () => {
    const storage = { increment: jest.fn() } as unknown as ThrottlerStorage;
    const guard = new AuthenticatedScopeRateLimitGuard(storage);

    await expect(guard.canActivate(context().value)).resolves.toBe(true);
    expect(storage.increment).not.toHaveBeenCalled();
  });

  it('charges independent opaque account and tenant counters', async () => {
    const increment = jest.fn().mockResolvedValue(allowed);
    const guard = new AuthenticatedScopeRateLimitGuard({
      increment,
    } as ThrottlerStorage);
    const request = context({
      userId: 'user-sensitive-123',
      tenantId: 'tenant-sensitive-456',
    });

    await expect(guard.canActivate(request.value)).resolves.toBe(true);

    expect(increment).toHaveBeenCalledTimes(2);
    const serializedCalls = JSON.stringify(increment.mock.calls);
    expect(serializedCalls).not.toContain('user-sensitive-123');
    expect(serializedCalls).not.toContain('tenant-sensitive-456');
    expect(increment).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      60_000,
      authenticatedScopeRateLimitTesting.accountLimit,
      60_000,
      'account',
    );
    expect(increment).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      60_000,
      authenticatedScopeRateLimitTesting.tenantLimit,
      60_000,
      'tenant',
    );
    expect(request.header).toHaveBeenCalledWith(
      'X-RateLimit-Remaining-Account',
      authenticatedScopeRateLimitTesting.accountLimit - 1,
    );
  });

  it('returns one retry window when either authenticated scope is blocked', async () => {
    const increment = jest
      .fn()
      .mockResolvedValueOnce({
        ...allowed,
        isBlocked: true,
        timeToBlockExpire: 37,
      })
      .mockResolvedValueOnce(allowed);
    const guard = new AuthenticatedScopeRateLimitGuard({
      increment,
    } as ThrottlerStorage);
    const request = context({ userId: 'user-a', tenantId: 'tenant-a' });

    await expect(guard.canActivate(request.value)).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    expect(request.header).toHaveBeenCalledWith('Retry-After', 37);
  });
});
