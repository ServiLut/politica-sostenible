import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  PERSON_IMPORT_JOB,
  PERSON_IMPORT_QUEUE,
  type PersonImportQueueData,
  type PersonImportQueuePort,
} from './person-import.constants';

@Injectable()
export class BullPersonImportQueueAdapter implements PersonImportQueuePort {
  constructor(
    @InjectQueue(PERSON_IMPORT_QUEUE)
    private readonly queue: Queue<PersonImportQueueData>,
  ) {}

  async enqueue(data: PersonImportQueueData): Promise<void> {
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

      await this.queue.add(PERSON_IMPORT_JOB, data, {
        jobId: data.importJobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      });
    } catch {
      throw new ServiceUnavailableException(
        'La cola de importación de personas no está disponible; reintenta con el mismo identificador de solicitud',
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
        'La cola de importación de personas no está disponible',
      );
    }
  }
}

@Injectable()
export class DisabledPersonImportQueueAdapter implements PersonImportQueuePort {
  enqueue(data: PersonImportQueueData): Promise<void> {
    void data;
    return Promise.reject(
      new ServiceUnavailableException(
        'La cola de importación de personas está deshabilitada en este entorno',
      ),
    );
  }

  checkReady(): Promise<void> {
    return Promise.reject(
      new ServiceUnavailableException(
        'La cola de importación de personas está deshabilitada en este entorno',
      ),
    );
  }
}
