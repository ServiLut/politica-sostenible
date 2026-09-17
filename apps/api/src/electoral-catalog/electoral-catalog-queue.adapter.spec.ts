import { ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  BullElectoralCatalogQueueAdapter,
  DisabledElectoralCatalogQueueAdapter,
} from './electoral-catalog-queue.adapter';
import {
  ELECTORAL_CATALOG_IMPORT_JOB,
  type ElectoralCatalogImportQueueData,
} from './electoral-catalog-queue.constants';

describe('BullElectoralCatalogQueueAdapter', () => {
  const data: ElectoralCatalogImportQueueData = {
    importJobId: 'import-a',
    tenantId: 'tenant-a',
  };
  let queue: {
    getJob: jest.Mock;
    add: jest.Mock;
    getJobCounts: jest.Mock;
  };
  let adapter: BullElectoralCatalogQueueAdapter;

  beforeEach(() => {
    queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({ id: data.importJobId }),
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0 }),
    };
    adapter = new BullElectoralCatalogQueueAdapter(
      queue as unknown as Queue<ElectoralCatalogImportQueueData>,
    );
  });

  it('enqueues a deterministic, retryable and bounded BullMQ job', async () => {
    await adapter.enqueue(data);

    expect(queue.add).toHaveBeenCalledWith(
      ELECTORAL_CATALOG_IMPORT_JOB,
      data,
      expect.objectContaining({
        jobId: data.importJobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      }),
    );
  });

  it('does not duplicate a waiting or active job', async () => {
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('active'),
    });

    await adapter.enqueue(data);

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('retries a failed job and replaces a completed job', async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValueOnce({
      getState: jest.fn().mockResolvedValue('failed'),
      retry,
    });
    await adapter.enqueue(data);
    expect(retry).toHaveBeenCalledWith('failed');
    expect(queue.add).not.toHaveBeenCalled();

    const remove = jest.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValueOnce({
      getState: jest.fn().mockResolvedValue('completed'),
      remove,
    });
    await adapter.enqueue(data);
    expect(remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('executes a real Redis command for readiness', async () => {
    await adapter.checkReady();
    expect(queue.getJobCounts).toHaveBeenCalledWith('waiting');
  });

  it('maps Redis details to a safe 503 response', async () => {
    queue.getJob.mockRejectedValueOnce(
      new Error('redis://default:secret@private-host'),
    );
    await expect(adapter.enqueue(data)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    queue.getJobCounts.mockRejectedValueOnce(new Error('ECONNREFUSED secret'));
    await expect(adapter.checkReady()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed when queues are intentionally disabled', async () => {
    const disabled = new DisabledElectoralCatalogQueueAdapter();
    await expect(disabled.enqueue(data)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(disabled.checkReady()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
