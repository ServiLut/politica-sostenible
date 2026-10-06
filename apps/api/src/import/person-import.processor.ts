import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  PERSON_IMPORT_JOB,
  PERSON_IMPORT_QUEUE,
  type PersonImportQueueData,
} from './person-import.constants';
import { PersonImportService } from './person-import.service';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

@Processor(PERSON_IMPORT_QUEUE, {
  concurrency: 1,
  lockDuration: 180_000,
  stalledInterval: 30_000,
  maxStalledCount: 2,
})
export class PersonImportProcessor extends WorkerHost {
  constructor(private readonly imports: PersonImportService) {
    super();
  }

  process(job: Job<PersonImportQueueData>) {
    if (
      job.name !== PERSON_IMPORT_JOB ||
      !SAFE_ID.test(job.data.importJobId) ||
      !SAFE_ID.test(job.data.tenantId)
    ) {
      throw new Error('Trabajo de importación de personas inválido');
    }
    return this.imports.process(job.data.importJobId, job.data.tenantId);
  }
}
