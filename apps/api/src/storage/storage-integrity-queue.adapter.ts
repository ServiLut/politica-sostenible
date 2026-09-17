import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  STORAGE_INTEGRITY_QUEUE,
  STORAGE_INTEGRITY_VERIFY_JOB,
  type StorageIntegrityQueueData,
  type StorageIntegrityQueuePort,
} from './storage-integrity-queue.constants';

@Injectable()
export class BullStorageIntegrityQueueAdapter implements StorageIntegrityQueuePort {
  constructor(
    @InjectQueue(STORAGE_INTEGRITY_QUEUE)
    private readonly queue: Queue<StorageIntegrityQueueData>,
  ) {}

  async enqueue(data: StorageIntegrityQueueData): Promise<void> {
    try {
      const existing = await this.queue.getJob(data.storedObjectId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'active' || state === 'waiting' || state === 'delayed') {
          return;
        }
        await existing.remove();
      }

      await this.queue.add(STORAGE_INTEGRITY_VERIFY_JOB, data, {
        jobId: data.storedObjectId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 5_000 },
        removeOnFail: { age: 604_800, count: 10_000 },
      });
    } catch {
      throw new ServiceUnavailableException(
        'La cola de verificacion independiente no esta disponible; la evidencia permanece pendiente y se recuperara automaticamente',
      );
    }
  }

  async checkReady(): Promise<void> {
    try {
      await this.queue.getJobCounts('waiting');
    } catch {
      throw new ServiceUnavailableException(
        'La cola de verificacion independiente no esta disponible',
      );
    }
  }
}

@Injectable()
export class DisabledStorageIntegrityQueueAdapter implements StorageIntegrityQueuePort {
  enqueue(data: StorageIntegrityQueueData): Promise<void> {
    void data;
    return Promise.reject(
      new ServiceUnavailableException(
        'La cola de verificacion independiente esta deshabilitada en este entorno',
      ),
    );
  }

  checkReady(): Promise<void> {
    return Promise.reject(
      new ServiceUnavailableException(
        'La cola de verificacion independiente esta deshabilitada en este entorno',
      ),
    );
  }
}
