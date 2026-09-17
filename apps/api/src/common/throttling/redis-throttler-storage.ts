import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import Redis from 'ioredis';

const REDIS_THROTTLE_CLIENT = Symbol('REDIS_THROTTLE_CLIENT');
const REDIS_KEY_PREFIX = 'politica-sostenible:throttle:v1';
const REDIS_RETRY_AFTER_MS = 5_000;
const REDIS_WARNING_INTERVAL_MS = 60_000;

interface RedisThrottleClient {
  readonly status: string;
  connect(): Promise<unknown>;
  ping(): Promise<unknown>;
  eval(
    script: string,
    numberOfKeys: number,
    ...args: string[]
  ): Promise<unknown>;
  on(event: 'error', listener: () => void): unknown;
  disconnect(reconnect?: boolean): void;
}

interface RateLimitStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

// One Redis hash owns the complete state for a key. Redis TIME avoids clock
// disagreement between API replicas and the Lua script makes the transition
// to and from a blocked window atomic.
const INCREMENT_SCRIPT = `
local clock = redis.call('TIME')
local now = (tonumber(clock[1]) * 1000) + math.floor(tonumber(clock[2]) / 1000)
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local hits = tonumber(redis.call('HGET', KEYS[1], 'hits') or '0')
local windowExpiresAt = tonumber(redis.call('HGET', KEYS[1], 'windowExpiresAt') or '0')
local blockedUntil = tonumber(redis.call('HGET', KEYS[1], 'blockedUntil') or '0')

if blockedUntil > now then
  return {
    hits,
    math.max(0, math.ceil((windowExpiresAt - now) / 1000)),
    1,
    math.max(1, math.ceil((blockedUntil - now) / 1000))
  }
end

if blockedUntil > 0 or windowExpiresAt <= now then
  hits = 0
  windowExpiresAt = now + ttl
  blockedUntil = 0
end

hits = hits + 1
if hits > limit then
  blockedUntil = now + blockDuration
end

redis.call('HSET', KEYS[1],
  'hits', hits,
  'windowExpiresAt', windowExpiresAt,
  'blockedUntil', blockedUntil
)
local retainUntil = math.max(windowExpiresAt, blockedUntil)
redis.call('PEXPIRE', KEYS[1], math.max(1, retainUntil - now))

return {
  hits,
  math.max(0, math.ceil((windowExpiresAt - now) / 1000)),
  blockedUntil > now and 1 or 0,
  blockedUntil > now and math.max(1, math.ceil((blockedUntil - now) / 1000)) or 0
}
`;

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function decodeStorageRecord(value: unknown): RateLimitStorageRecord {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error('Redis returned an invalid throttling record');
  }
  const [rawHits, rawExpiry, rawBlocked, rawBlockExpiry] = value.map(Number);
  if (
    !Number.isSafeInteger(rawHits) ||
    rawHits < 0 ||
    !Number.isSafeInteger(rawExpiry) ||
    rawExpiry < 0 ||
    (rawBlocked !== 0 && rawBlocked !== 1) ||
    !Number.isSafeInteger(rawBlockExpiry) ||
    rawBlockExpiry < 0
  ) {
    throw new Error('Redis returned an invalid throttling record');
  }
  return {
    totalHits: rawHits,
    timeToExpire: rawExpiry,
    isBlocked: rawBlocked === 1,
    timeToBlockExpire: rawBlockExpiry,
  };
}

export function opaqueThrottleKey(scope: string, value: string): string {
  return createHash('sha256')
    .update(JSON.stringify([scope, value]), 'utf8')
    .digest('hex');
}

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private readonly redis: RedisThrottleClient | null;
  private readonly failClosed: boolean;
  private connectPromise: Promise<unknown> | null = null;
  private redisUnavailableUntil = 0;
  private lastWarningAt = 0;

  constructor(
    config: ConfigService,
    @Optional()
    @Inject(REDIS_THROTTLE_CLIENT)
    injectedClient?: RedisThrottleClient,
  ) {
    const nodeEnvironment =
      config.get<string>('NODE_ENV')?.trim() ?? process.env.NODE_ENV;
    this.failClosed = nodeEnvironment === 'production';

    if (injectedClient) {
      this.redis = injectedClient;
      this.redis.on('error', () => this.noteRedisFailure());
      return;
    }

    const redisUrl = config.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) {
      if (this.failClosed) {
        throw new Error(
          'REDIS_URL is required for distributed production throttling',
        );
      }
      this.redis = null;
      return;
    }

    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_500,
      commandTimeout: 1_500,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1_000),
    });
    this.redis.on('error', () => this.noteRedisFailure());
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<RateLimitStorageRecord> {
    const validTtl = positiveInteger(ttl, 'ttl');
    const validLimit = positiveInteger(limit, 'limit');
    const validBlockDuration = positiveInteger(blockDuration, 'blockDuration');

    if (!this.redis || Date.now() < this.redisUnavailableUntil) {
      return this.fallbackOrReject(
        key,
        validTtl,
        validLimit,
        validBlockDuration,
        throttlerName,
      );
    }

    try {
      await this.ensureConnected();
      const redisKey = `${REDIS_KEY_PREFIX}:${this.safeName(throttlerName)}:${key}`;
      const result = await this.redis.eval(
        INCREMENT_SCRIPT,
        1,
        redisKey,
        String(validTtl),
        String(validLimit),
        String(validBlockDuration),
      );
      this.redisUnavailableUntil = 0;
      return decodeStorageRecord(result);
    } catch {
      this.noteRedisFailure();
      return this.fallbackOrReject(
        key,
        validTtl,
        validLimit,
        validBlockDuration,
        throttlerName,
      );
    }
  }

  /**
   * Probes the distributed limiter without mutating a rate-limit counter.
   * Production readiness uses this method because accepting traffic with a
   * process-local fallback would let clients multiply limits across replicas.
   */
  async assertAvailable(): Promise<void> {
    if (!this.redis) {
      if (this.failClosed) this.rejectUnavailable();
      return;
    }

    if (Date.now() < this.redisUnavailableUntil) {
      this.rejectUnavailable();
    }

    try {
      await this.ensureConnected();
      const response = await this.redis.ping();
      if (response !== 'PONG') {
        throw new Error('Redis returned an invalid health response');
      }
      this.redisUnavailableUntil = 0;
    } catch {
      this.noteRedisFailure();
      this.rejectUnavailable();
    }
  }

  onApplicationShutdown(): void {
    this.redis?.disconnect(false);
    this.fallback.onApplicationShutdown();
  }

  private async ensureConnected(): Promise<void> {
    if (!this.redis || this.redis.status === 'ready') return;
    if (!this.connectPromise) {
      this.connectPromise = Promise.resolve(this.redis.connect()).finally(
        () => {
          this.connectPromise = null;
        },
      );
    }
    await this.connectPromise;
  }

  private noteRedisFailure(): void {
    const now = Date.now();
    this.redisUnavailableUntil = now + REDIS_RETRY_AFTER_MS;
    if (now - this.lastWarningAt >= REDIS_WARNING_INTERVAL_MS) {
      this.lastWarningAt = now;
      this.logger.warn(
        this.failClosed
          ? 'Redis throttling is unavailable; protected traffic is being rejected'
          : 'Redis throttling is unavailable; temporary per-process limits are active',
      );
    }
  }

  private fallbackOrReject(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<RateLimitStorageRecord> {
    if (this.failClosed) this.rejectUnavailable();
    return this.fallback.increment(
      key,
      ttl,
      limit,
      blockDuration,
      throttlerName,
    );
  }

  private rejectUnavailable(): never {
    throw new ServiceUnavailableException(
      'Servicio temporalmente no disponible',
    );
  }

  private safeName(value: string): string {
    return /^[a-z0-9_-]{1,40}$/i.test(value) ? value : 'invalid';
  }
}

export const redisThrottleTesting = {
  clientToken: REDIS_THROTTLE_CLIENT,
  incrementScript: INCREMENT_SCRIPT,
  decodeStorageRecord,
};
