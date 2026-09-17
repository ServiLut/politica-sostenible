import { Module } from '@nestjs/common';
import { BackgroundJobsModule } from '../common/jobs/background-jobs.module';
import {
  BullElectoralCatalogQueueAdapter,
  DisabledElectoralCatalogQueueAdapter,
} from './electoral-catalog-queue.adapter';
import { ELECTORAL_CATALOG_QUEUE_PORT } from './electoral-catalog-queue.constants';

const queueDisabledForTests = process.env.NODE_ENV === 'test';

const queueProviders = queueDisabledForTests
  ? [
      DisabledElectoralCatalogQueueAdapter,
      {
        provide: ELECTORAL_CATALOG_QUEUE_PORT,
        useExisting: DisabledElectoralCatalogQueueAdapter,
      },
    ]
  : [
      BullElectoralCatalogQueueAdapter,
      {
        provide: ELECTORAL_CATALOG_QUEUE_PORT,
        useExisting: BullElectoralCatalogQueueAdapter,
      },
    ];

@Module({
  imports: [BackgroundJobsModule],
  providers: queueProviders,
  exports: [ELECTORAL_CATALOG_QUEUE_PORT],
})
export class ElectoralCatalogQueueModule {}
