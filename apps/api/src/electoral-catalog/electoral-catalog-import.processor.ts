import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  ELECTORAL_CATALOG_IMPORT_JOB,
  ELECTORAL_CATALOG_QUEUE,
  type ElectoralCatalogImportQueueData,
} from './electoral-catalog-queue.constants';
import { ElectoralCatalogImportService } from './electoral-catalog-import.service';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

@Processor(ELECTORAL_CATALOG_QUEUE, {
  concurrency: 1,
  lockDuration: 180_000,
  stalledInterval: 30_000,
  maxStalledCount: 2,
})
export class ElectoralCatalogImportProcessor extends WorkerHost {
  constructor(private readonly imports: ElectoralCatalogImportService) {
    super();
  }

  process(job: Job<ElectoralCatalogImportQueueData>) {
    if (
      job.name !== ELECTORAL_CATALOG_IMPORT_JOB ||
      !SAFE_ID.test(job.data.importJobId) ||
      !SAFE_ID.test(job.data.tenantId)
    ) {
      throw new Error('Trabajo de ingesta electoral invalido');
    }
    return this.imports.process(job.data.importJobId, job.data.tenantId);
  }
}
