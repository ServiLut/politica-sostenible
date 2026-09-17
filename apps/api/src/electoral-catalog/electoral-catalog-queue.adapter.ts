import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  ELECTORAL_CATALOG_IMPORT_JOB,
  ELECTORAL_CATALOG_QUEUE,
  type ElectoralCatalogImportQueueData,
  type ElectoralCatalogQueuePort,
} from './electoral-catalog-queue.constants';

@Injectable()
export class BullElectoralCatalogQueueAdapter implements ElectoralCatalogQueuePort {
  constructor(
    @InjectQueue(ELECTORAL_CATALOG_QUEUE)
    private readonly queue: Queue<ElectoralCatalogImportQueueData>,
  ) {}

  async enqueue(data: ElectoralCatalogImportQueueData): Promise<void> {
    try {
      const existing = await this.queue.getJob(data.importJobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'failed') {
          await existing.retry('failed');
          return;
        }
        if (state === 'completed') {
          await existing.remove();
        } else {
          return;
        }
      }

      await this.queue.add(ELECTORAL_CATALOG_IMPORT_JOB, data, {
        jobId: data.importJobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      });
    } catch {
      throw new ServiceUnavailableException(
        'La cola de ingesta electoral no esta disponible; reintenta con el mismo identificador de solicitud',
      );
    }
  }

  async checkReady(): Promise<void> {
    try {
      // Ejecuta un comando real: waitUntilReady por si solo puede conservar una
      // promesa ya resuelta aunque Redis se desconecte posteriormente.
      await this.queue.getJobCounts('waiting');
    } catch {
      throw new ServiceUnavailableException(
        'La cola de ingesta electoral no esta disponible',
      );
    }
  }
}

@Injectable()
export class DisabledElectoralCatalogQueueAdapter implements ElectoralCatalogQueuePort {
  enqueue(data: ElectoralCatalogImportQueueData): Promise<void> {
    void data;
    return Promise.reject(
      new ServiceUnavailableException(
        'La cola de ingesta electoral esta deshabilitada en este entorno',
      ),
    );
  }

  checkReady(): Promise<void> {
    return Promise.reject(
      new ServiceUnavailableException(
        'La cola de ingesta electoral esta deshabilitada en este entorno',
      ),
    );
  }
}
