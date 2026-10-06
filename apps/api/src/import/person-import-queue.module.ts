import { Module } from '@nestjs/common';
import { BackgroundJobsModule } from '../common/jobs/background-jobs.module';
import {
  BullPersonImportQueueAdapter,
  DisabledPersonImportQueueAdapter,
} from './person-import-queue.adapter';
import { PERSON_IMPORT_QUEUE_PORT } from './person-import.constants';

const queueDisabledForTests = process.env.NODE_ENV === 'test';

const queueProviders = queueDisabledForTests
  ? [
      DisabledPersonImportQueueAdapter,
      {
        provide: PERSON_IMPORT_QUEUE_PORT,
        useExisting: DisabledPersonImportQueueAdapter,
      },
    ]
  : [
      BullPersonImportQueueAdapter,
      {
        provide: PERSON_IMPORT_QUEUE_PORT,
        useExisting: BullPersonImportQueueAdapter,
      },
    ];

@Module({
  imports: [BackgroundJobsModule],
  providers: queueProviders,
  exports: [PERSON_IMPORT_QUEUE_PORT],
})
export class PersonImportQueueModule {}
