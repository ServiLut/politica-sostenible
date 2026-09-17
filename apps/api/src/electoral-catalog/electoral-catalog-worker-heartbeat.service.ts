import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { rm, writeFile } from 'node:fs/promises';
import { ElectoralCatalogImportProcessor } from './electoral-catalog-import.processor';
import {
  ELECTORAL_CATALOG_QUEUE_PORT,
  type ElectoralCatalogQueuePort,
} from './electoral-catalog-queue.constants';
import { StorageIntegrityProcessor } from '../storage/storage-integrity.processor';
import {
  STORAGE_INTEGRITY_QUEUE_PORT,
  type StorageIntegrityQueuePort,
} from '../storage/storage-integrity-queue.constants';

const HEALTH_FILE = '/tmp/electoral-catalog-worker.ready';
const HEARTBEAT_INTERVAL_MS = 30_000;

@Injectable()
export class ElectoralCatalogWorkerHeartbeatService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private heartbeatTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly processor: ElectoralCatalogImportProcessor,
    @Inject(ELECTORAL_CATALOG_QUEUE_PORT)
    private readonly queue: ElectoralCatalogQueuePort,
    private readonly integrityProcessor: StorageIntegrityProcessor,
    @Inject(STORAGE_INTEGRITY_QUEUE_PORT)
    private readonly integrityQueue: StorageIntegrityQueuePort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.heartbeat();
    this.heartbeatTimer = setInterval(
      () => void this.heartbeat(),
      HEARTBEAT_INTERVAL_MS,
    );
    this.heartbeatTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await rm(HEALTH_FILE, { force: true }).catch(() => undefined);
  }

  private async heartbeat(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await Promise.all([
        this.processor.worker.waitUntilReady(),
        this.queue.checkReady(),
        this.integrityProcessor.worker.waitUntilReady(),
        this.integrityQueue.checkReady(),
      ]);
      await writeFile(HEALTH_FILE, new Date().toISOString(), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      await rm(HEALTH_FILE, { force: true }).catch(() => undefined);
    } finally {
      this.running = false;
    }
  }
}
