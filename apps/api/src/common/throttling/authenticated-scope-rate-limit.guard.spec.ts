import {
  ServiceUnavailableException,
  type ExecutionContext,
} from '@nestjs/common';
import { ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';
import {
  AuthenticatedScopeRateLimitGuard,
  authenticatedScopeRateLimitTesting,
} from './authenticated-scope-rate-limit.guard';
import {
  RateLimitOperation,
  OPERATION_RATE_LIMITS,
} from './operation-rate-limit';

const allowed = {
  totalHits: 1,
  timeToExpire: 60,
  isBlocked: false,
  timeToBlockExpire: 0,
};

class WorkController {
  read() {}

  @RateLimitOperation('import-execute')
  execute() {}
}

function context(
  user?: { userId: string; tenantId: string; role?: string },
  operation = false,
) {
  const header = jest.fn();
  return {
    header,
    value: {
      getHandler: () =>
        operation
          ? WorkController.prototype.execute
          : WorkController.prototype.read,
      getClass: () => WorkController,
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
    });
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
    });
    const request = context({ userId: 'user-a', tenantId: 'tenant-a' });

    await expect(guard.canActivate(request.value)).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    expect(request.header).toHaveBeenCalledWith('Retry-After', 37);
    expect(increment).toHaveBeenCalledTimes(1);
  });

  it('a blocked account cannot spend the shared tenant budget repeatedly', async () => {
    const increment = jest.fn().mockResolvedValue({
      ...allowed,
      isBlocked: true,
      timeToBlockExpire: 20,
    });
    const guard = new AuthenticatedScopeRateLimitGuard({ increment });
    const request = context({ userId: 'noisy', tenantId: 'shared' }, true);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(guard.canActivate(request.value)).rejects.toBeInstanceOf(
        ThrottlerException,
      );
    }
    expect(increment).toHaveBeenCalledTimes(3);
    expect(
      increment.mock.calls.every((call: unknown[]) => call[4] === 'account'),
    ).toBe(true);
  });

  it('applies operation budgets to administrators with no privileged bypass', async () => {
    const increment = jest.fn().mockResolvedValue(allowed);
    const guard = new AuthenticatedScopeRateLimitGuard({ increment });
    const request = context(
      { userId: 'admin', tenantId: 'tenant-a', role: 'ADMIN' },
      true,
    );
    await expect(guard.canActivate(request.value)).resolves.toBe(true);
    expect(increment.mock.calls.map((call: unknown[]) => call[4])).toEqual([
      'account',
      'operation-account',
      'operation-tenant',
      'tenant',
    ]);
    expect(increment).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      60_000,
      OPERATION_RATE_LIMITS['import-execute'].account,
      60_000,
      'operation-account',
    );
    expect(increment).toHaveBeenNthCalledWith(
      3,
      expect.any(String),
      60_000,
      OPERATION_RATE_LIMITS['import-execute'].tenant,
      60_000,
      'operation-tenant',
    );
  });

  it('a blocked operation account cannot spend either tenant quota', async () => {
    const increment = jest
      .fn()
      .mockResolvedValueOnce(allowed)
      .mockResolvedValueOnce({
        ...allowed,
        isBlocked: true,
        timeToBlockExpire: 12,
      });
    const guard = new AuthenticatedScopeRateLimitGuard({ increment });
    const request = context({ userId: 'user-a', tenantId: 'tenant-a' }, true);
    await expect(guard.canActivate(request.value)).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    expect(increment).toHaveBeenCalledTimes(2);
    expect(request.header).toHaveBeenCalledWith('Retry-After', 12);
  });

  it('keeps tenant operation counters isolated across organizations', async () => {
    const increment = jest.fn().mockResolvedValue(allowed);
    const guard = new AuthenticatedScopeRateLimitGuard({ increment });
    await guard.canActivate(
      context({ userId: 'user-a', tenantId: 'tenant-a' }, true).value,
    );
    await guard.canActivate(
      context({ userId: 'user-b', tenantId: 'tenant-b' }, true).value,
    );
    expect(increment.mock.calls[2][0]).not.toBe(increment.mock.calls[6][0]);
    expect(increment.mock.calls[3][0]).not.toBe(increment.mock.calls[7][0]);
  });

  it('propagates unavailable distributed storage instead of allowing execution', async () => {
    const increment = jest
      .fn()
      .mockRejectedValue(new ServiceUnavailableException());
    const guard = new AuthenticatedScopeRateLimitGuard({ increment });
    await expect(
      guard.canActivate(
        context({ userId: 'user-a', tenantId: 'tenant-a' }, true).value,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(increment).toHaveBeenCalledTimes(1);
  });
});
