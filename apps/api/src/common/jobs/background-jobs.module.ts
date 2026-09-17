import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ELECTORAL_CATALOG_QUEUE } from '../../electoral-catalog/electoral-catalog-queue.constants';
import { STORAGE_INTEGRITY_QUEUE } from '../../storage/storage-integrity-queue.constants';

const queuesDisabledForTests = process.env.NODE_ENV === 'test';

const queueImports = queuesDisabledForTests
  ? []
  : [
      BullModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          connection: {
            url: config.getOrThrow<string>('REDIS_URL'),
            maxRetriesPerRequest: null,
            enableOfflineQueue: false,
          },
          prefix: 'politica-sostenible',
        }),
      }),
      BullModule.registerQueue(
        { name: ELECTORAL_CATALOG_QUEUE },
        { name: STORAGE_INTEGRITY_QUEUE },
      ),
    ];

/** One Redis/BullMQ connection shared by API producers and the separate worker. */
@Global()
@Module({
  imports: [ConfigModule, ...queueImports],
  exports: [...queueImports],
})
export class BackgroundJobsModule {}
