import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RedisThrottlerStorage,
  opaqueThrottleKey,
} from './redis-throttler-storage';

function config(redisUrl?: string, nodeEnvironment = 'test') {
  return {
    get: jest.fn((name: string) => {
      if (name === 'REDIS_URL') return redisUrl;
      if (name === 'NODE_ENV') return nodeEnvironment;
      return undefined;
    }),
  } as unknown as ConfigService;
}

function redisClient(result: unknown, failure?: Error) {
  const evaluate = jest.fn<
    Promise<unknown>,
    [script: string, numberOfKeys: number, ...args: string[]]
  >();
  if (failure) evaluate.mockRejectedValue(failure);
  else evaluate.mockResolvedValue(result);

  return {
    status: 'ready',
    connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    ping: jest.fn<Promise<string>, []>().mockResolvedValue('PONG'),
    eval: evaluate,
    on: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe('RedisThrottlerStorage', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('uses one opaque Redis key and returns the atomic script result', async () => {
    const redis = redisClient([3, 42, 0, 0]);
    const storage = new RedisThrottlerStorage(
      config('rediss://unused.invalid'),
      redis as never,
    );

    await expect(
      storage.increment('a'.repeat(64), 60_000, 120, 60_000, 'default'),
    ).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 42,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    const call = redis.eval.mock.calls[0];
    expect(call[1]).toBe(1);
    expect(call[2]).toBe(
      `politica-sostenible:throttle:v1:default:${'a'.repeat(64)}`,
    );
    expect(call[3]).toBe('60000');
    expect(call[4]).toBe('120');
    expect(call[5]).toBe('60000');
    storage.onApplicationShutdown();
    expect(redis.disconnect).toHaveBeenCalledWith(false);
  });

  it('uses a bounded per-process fallback outside production when Redis fails', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(100_000);
    const redis = redisClient(null, new Error('private redis detail'));
    const storage = new RedisThrottlerStorage(
      config('rediss://unused.invalid'),
      redis as never,
    );

    const first = await storage.increment('key', 60_000, 1, 60_000, 'default');
    const second = await storage.increment('key', 60_000, 1, 60_000, 'default');

    expect(first.isBlocked).toBe(false);
    expect(second.isBlocked).toBe(true);
    expect(redis.eval).toHaveBeenCalledTimes(1);
    storage.onApplicationShutdown();
  });

  it('fails closed in production instead of multiplying limits per replica', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(100_000);
    const redis = redisClient(null, new Error('private redis detail'));
    const storage = new RedisThrottlerStorage(
      config('rediss://unused.invalid', 'production'),
      redis as never,
    );

    await expect(
      storage.increment('key', 60_000, 1, 60_000, 'default'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      storage.increment('key', 60_000, 1, 60_000, 'default'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(redis.eval).toHaveBeenCalledTimes(1);
    storage.onApplicationShutdown();
  });

  it('requires Redis configuration when production fail-closed mode is active', () => {
    expect(
      () => new RedisThrottlerStorage(config(undefined, 'production')),
    ).toThrow('REDIS_URL is required for distributed production throttling');
  });

  it('probes Redis without consuming a throttling counter', async () => {
    const redis = redisClient([1, 60, 0, 0]);
    const storage = new RedisThrottlerStorage(
      config('rediss://unused.invalid', 'production'),
      redis as never,
    );

    await expect(storage.assertAvailable()).resolves.toBeUndefined();
    expect(redis.ping).toHaveBeenCalledTimes(1);
    expect(redis.eval).not.toHaveBeenCalled();
    storage.onApplicationShutdown();
  });

  it('reports a failed Redis readiness probe as unavailable', async () => {
    const redis = redisClient([1, 60, 0, 0]);
    redis.ping.mockRejectedValueOnce(new Error('private redis detail'));
    const storage = new RedisThrottlerStorage(
      config('rediss://unused.invalid', 'production'),
      redis as never,
    );

    await expect(storage.assertAvailable()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    storage.onApplicationShutdown();
  });

  it('never places tenant or account identifiers in a counter key', () => {
    const key = opaqueThrottleKey('tenant', 'tenant-sensitive-123');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain('tenant-sensitive-123');
  });

  it('rejects invalid limiter configuration before contacting Redis', async () => {
    const redis = redisClient([1, 1, 0, 0]);
    const storage = new RedisThrottlerStorage(
      config('rediss://unused.invalid'),
      redis as never,
    );

    await expect(storage.increment('key', 0, 1, 1, 'default')).rejects.toThrow(
      'ttl must be a positive safe integer',
    );
    expect(redis.eval).not.toHaveBeenCalled();
    storage.onApplicationShutdown();
  });
});
