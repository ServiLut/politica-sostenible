import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import {
  STORAGE_INTEGRITY_QUEUE,
  STORAGE_INTEGRITY_VERIFY_JOB,
  type StorageIntegrityQueueData,
} from './storage-integrity-queue.constants';
import {
  StorageIntegrityTerminalError,
  StorageIntegrityVerificationService,
} from './storage-integrity-verification.service';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

@Processor(STORAGE_INTEGRITY_QUEUE, {
  concurrency: 2,
  lockDuration: 120_000,
  stalledInterval: 30_000,
  maxStalledCount: 2,
})
export class StorageIntegrityProcessor extends WorkerHost {
  constructor(private readonly verification: StorageIntegrityVerificationService) {
    super();
  }

  async process(job: Job<StorageIntegrityQueueData>) {
    if (
      job.name !== STORAGE_INTEGRITY_VERIFY_JOB ||
      !SAFE_ID.test(job.data.tenantId) ||
      !SAFE_ID.test(job.data.storedObjectId)
    ) {
      throw new UnrecoverableError('Trabajo de integridad de Storage invalido');
    }

    const maximumAttempts = Math.max(1, Number(job.opts.attempts ?? 1));
    const finalAttempt = job.attemptsMade + 1 >= maximumAttempts;
    try {
      return await this.verification.process(
        job.data.tenantId,
        job.data.storedObjectId,
        finalAttempt,
      );
    } catch (error) {
      if (error instanceof StorageIntegrityTerminalError) {
        // Only the stable code is exposed to BullMQ; signed URLs and provider
        // errors are intentionally absent from jobs and logs.
        throw new UnrecoverableError(`Integridad rechazada: ${error.code}`);
      }
      throw error;
    }
  }
}
