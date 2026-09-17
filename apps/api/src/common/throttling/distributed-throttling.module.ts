import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './redis-throttler-storage';

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
      imports: [RedisThrottlerStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: 120,
            blockDuration: 60_000,
          },
        ],
      }),
    }),
  ],
  exports: [ThrottlerModule, RedisThrottlerStorageModule],
})
export class DistributedThrottlingModule {}
