import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { RedisThrottlerStorage } from './redis-throttler-storage';

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
      get: (name: string) => (name === 'REDIS_URL' ? redisTestUrl : undefined),
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
});
