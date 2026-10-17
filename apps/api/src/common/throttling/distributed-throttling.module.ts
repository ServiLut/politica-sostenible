import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './redis-throttler-storage';
import { createLoginIdentityThrottler } from './login-identity-rate-limit';

@Module({
  imports: [ConfigModule],
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
class RedisThrottlerStorageModule {}

@Module({
  imports: [
    RedisThrottlerStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisThrottlerStorageModule],
      inject: [RedisThrottlerStorage, ConfigService],
      useFactory: (storage: RedisThrottlerStorage, config: ConfigService) => ({
        storage,
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: 120,
            blockDuration: 60_000,
          },
          createLoginIdentityThrottler(config.getOrThrow<string>('JWT_SECRET')),
        ],
      }),
    }),
  ],
  exports: [ThrottlerModule, RedisThrottlerStorageModule],
})
export class DistributedThrottlingModule {}
