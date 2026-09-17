import { Module } from '@nestjs/common';
import { BackgroundJobsModule } from '../common/jobs/background-jobs.module';
import {
  BullStorageIntegrityQueueAdapter,
  DisabledStorageIntegrityQueueAdapter,
} from './storage-integrity-queue.adapter';
import { STORAGE_INTEGRITY_QUEUE_PORT } from './storage-integrity-queue.constants';

const queueDisabledForTests = process.env.NODE_ENV === 'test';
const providers = queueDisabledForTests
  ? [
      DisabledStorageIntegrityQueueAdapter,
      {
        provide: STORAGE_INTEGRITY_QUEUE_PORT,
        useExisting: DisabledStorageIntegrityQueueAdapter,
      },
    ]
  : [
      BullStorageIntegrityQueueAdapter,
      {
        provide: STORAGE_INTEGRITY_QUEUE_PORT,
        useExisting: BullStorageIntegrityQueueAdapter,
      },
    ];

@Module({
  imports: [BackgroundJobsModule],
  providers,
  exports: [STORAGE_INTEGRITY_QUEUE_PORT],
})
export class StorageIntegrityQueueModule {}
