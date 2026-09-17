import { rm, writeFile } from 'node:fs/promises';
import { ElectoralCatalogImportProcessor } from './electoral-catalog-import.processor';
import type { ElectoralCatalogQueuePort } from './electoral-catalog-queue.constants';
import { ElectoralCatalogWorkerHeartbeatService } from './electoral-catalog-worker-heartbeat.service';
import { StorageIntegrityProcessor } from '../storage/storage-integrity.processor';
import type { StorageIntegrityQueuePort } from '../storage/storage-integrity-queue.constants';

jest.mock('node:fs/promises', () => ({
  rm: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

describe('ElectoralCatalogWorkerHeartbeatService', () => {
  const mockedRm = jest.mocked(rm);
  const mockedWriteFile = jest.mocked(writeFile);
  let processor: { worker: { waitUntilReady: jest.Mock } };
  let queue: { enqueue: jest.Mock; checkReady: jest.Mock };
  let integrityProcessor: { worker: { waitUntilReady: jest.Mock } };
  let integrityQueue: { enqueue: jest.Mock; checkReady: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    processor = {
      worker: { waitUntilReady: jest.fn().mockResolvedValue(undefined) },
    };
    queue = {
      enqueue: jest.fn(),
      checkReady: jest.fn().mockResolvedValue(undefined),
    };
    integrityProcessor = {
      worker: { waitUntilReady: jest.fn().mockResolvedValue(undefined) },
    };
    integrityQueue = {
      enqueue: jest.fn(),
      checkReady: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('writes a restrictive heartbeat only after both worker and Redis answer', async () => {
    const service = new ElectoralCatalogWorkerHeartbeatService(
      processor as unknown as ElectoralCatalogImportProcessor,
      queue as unknown as ElectoralCatalogQueuePort,
      integrityProcessor as unknown as StorageIntegrityProcessor,
      integrityQueue as unknown as StorageIntegrityQueuePort,
    );

    await service.onApplicationBootstrap();
    await service.onModuleDestroy();

    expect(processor.worker.waitUntilReady).toHaveBeenCalled();
    expect(queue.checkReady).toHaveBeenCalled();
    expect(integrityProcessor.worker.waitUntilReady).toHaveBeenCalled();
    expect(integrityQueue.checkReady).toHaveBeenCalled();
    expect(mockedWriteFile).toHaveBeenCalledWith(
      '/tmp/electoral-catalog-worker.ready',
      expect.any(String),
      { encoding: 'utf8', mode: 0o600 },
    );
    expect(mockedRm).toHaveBeenCalledWith(
      '/tmp/electoral-catalog-worker.ready',
      { force: true },
    );
  });

  it('removes readiness when Redis cannot execute a real command', async () => {
    queue.checkReady.mockRejectedValueOnce(new Error('redis secret'));
    const service = new ElectoralCatalogWorkerHeartbeatService(
      processor as unknown as ElectoralCatalogImportProcessor,
      queue as unknown as ElectoralCatalogQueuePort,
      integrityProcessor as unknown as StorageIntegrityProcessor,
      integrityQueue as unknown as StorageIntegrityQueuePort,
    );

    await service.onApplicationBootstrap();
    await service.onModuleDestroy();

    expect(mockedWriteFile).not.toHaveBeenCalled();
    expect(mockedRm).toHaveBeenCalled();
  });

  it('removes readiness when the integrity worker or its queue is unavailable', async () => {
    integrityQueue.checkReady.mockRejectedValueOnce(new Error('redis secret'));
    const service = new ElectoralCatalogWorkerHeartbeatService(
      processor as unknown as ElectoralCatalogImportProcessor,
      queue as unknown as ElectoralCatalogQueuePort,
      integrityProcessor as unknown as StorageIntegrityProcessor,
      integrityQueue as unknown as StorageIntegrityQueuePort,
    );

    await service.onApplicationBootstrap();
    await service.onModuleDestroy();

    expect(mockedWriteFile).not.toHaveBeenCalled();
    expect(mockedRm).toHaveBeenCalled();
  });
});
