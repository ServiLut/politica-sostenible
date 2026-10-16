import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import {
  RedisThrottlerStorage,
  opaqueThrottleKey,
} from './redis-throttler-storage';
import { AuthenticatedScopeRateLimitGuard } from './authenticated-scope-rate-limit.guard';
import { RateLimitOperation } from './operation-rate-limit';
import { LoginIdentityRateLimit } from './login-identity-rate-limit';
import { DistributedThrottlingModule } from './distributed-throttling.module';

class ImportOperation {
  @RateLimitOperation('import-execute')
  execute() {}
}

class LoginOperation {
  @LoginIdentityRateLimit()
  login() {}
}

const redisTestUrl = process.env.THROTTLE_REDIS_TEST_URL;
const describeRedis = redisTestUrl ? describe : describe.skip;

describeRedis('RedisThrottlerStorage integration', () => {
  const storages: RedisThrottlerStorage[] = [];

  afterEach(() => {
    for (const storage of storages) storage.onApplicationShutdown();
    storages.length = 0;
  });

  function storage() {
    const value = new RedisThrottlerStorage({
      get: (name: string) =>
        name === 'REDIS_URL'
          ? redisTestUrl
          : name === 'NODE_ENV'
            ? 'production'
            : undefined,
    } as ConfigService);
    storages.push(value);
    return value;
  }

  it('atomically shares a block across API replicas and isolates other keys', async () => {
    const firstReplica = storage();
    const secondReplica = storage();
    const key = randomUUID();
    const calls = Array.from({ length: 121 }, (_, index) =>
      (index % 2 ? firstReplica : secondReplica).increment(
        key,
        60_000,
        120,
        60_000,
        'default',
      ),
    );

    const results = (await Promise.all(calls)) as Array<{
      totalHits: number;
      isBlocked: boolean;
    }>;
    expect(results.filter((result) => result.isBlocked)).toHaveLength(1);
    expect(
      results.map((result) => result.totalHits).sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 121 }, (_, index) => index + 1));

    await expect(
      firstReplica.increment(key, 60_000, 120, 60_000, 'default'),
    ).resolves.toMatchObject({ totalHits: 121, isBlocked: true });
    await expect(
      secondReplica.increment(`${key}-other`, 60_000, 120, 60_000, 'default'),
    ).resolves.toMatchObject({ totalHits: 1, isBlocked: false });
  });

  it('does not extend a block on denied retries and reopens after its bounded expiry', async () => {
    const firstReplica = storage();
    const secondReplica = storage();
    const key = randomUUID();
    await firstReplica.increment(key, 100, 1, 250, 'expiry-test');
    await expect(
      secondReplica.increment(key, 100, 1, 250, 'expiry-test'),
    ).resolves.toMatchObject({ totalHits: 2, isBlocked: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(
      firstReplica.increment(key, 100, 1, 250, 'expiry-test'),
    ).resolves.toMatchObject({ totalHits: 2, isBlocked: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(
      secondReplica.increment(key, 100, 1, 250, 'expiry-test'),
    ).resolves.toMatchObject({ totalHits: 1, isBlocked: false });
  });

  it('caps one account across replicas without charging denied work to the tenant', async () => {
    const firstReplica = storage();
    const secondReplica = storage();
    const guards = [
      new AuthenticatedScopeRateLimitGuard(firstReplica),
      new AuthenticatedScopeRateLimitGuard(secondReplica),
    ];
    const tenantId = randomUUID();
    const userId = randomUUID();
    const context = {
      getClass: () => ImportOperation,
      getHandler: () => ImportOperation.prototype.execute,
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId, tenantId, role: 'ADMIN' } }),
        getResponse: () => ({ header: () => undefined }),
      }),
    } as unknown as ExecutionContext;
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        guards[index % 2].canActivate(context),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(6);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(14);
    // Reading through increment consumes one extra hit. Only six operations
    // reached either shared quota, despite twenty concurrent account attempts.
    await expect(
      firstReplica.increment(
        opaqueThrottleKey('operation-import-execute-tenant', tenantId),
        60_000,
        18,
        60_000,
        'operation-tenant',
      ),
    ).resolves.toMatchObject({ totalHits: 7, isBlocked: false });
    await expect(
      secondReplica.increment(
        opaqueThrottleKey('authenticated-tenant', tenantId),
        60_000,
        6_000,
        60_000,
        'tenant',
      ),
    ).resolves.toMatchObject({ totalHits: 7, isBlocked: false });
  });

  it('wires the identity policy through the real Nest module and Redis storage', async () => {
    const values: Record<string, string | undefined> = {
      REDIS_URL: redisTestUrl,
      NODE_ENV: 'production',
      JWT_SECRET: 'local-test-module-secret-not-a-production-credential',
    };
    const module = await Test.createTestingModule({
      imports: [DistributedThrottlingModule],
      providers: [ThrottlerGuard],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (name: string) => values[name],
        getOrThrow: (name: string) => {
          if (!values[name]) throw new Error('Missing test configuration');
          return values[name];
        },
      })
      .compile();
    await module.init();
    const guard = module.get(ThrottlerGuard);
    const email = `${randomUUID()}@example.test`;
    const context = (attempt: number) =>
      ({
        getClass: () => LoginOperation,
        getHandler: () => LoginOperation.prototype.login,
        switchToHttp: () => ({
          getRequest: () => ({
            body: { email },
            ip: `192.0.2.${attempt + 1}`,
            headers: {},
          }),
          getResponse: () => ({ header: () => undefined }),
        }),
      }) as unknown as ExecutionContext;
    try {
      for (let attempt = 0; attempt < 20; attempt += 1)
        await expect(guard.canActivate(context(attempt))).resolves.toBe(true);
      await expect(guard.canActivate(context(21))).rejects.toBeInstanceOf(
        ThrottlerException,
      );
    } finally {
      await module.close();
    }
  });
});
