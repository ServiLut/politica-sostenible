import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  StorageIntegrityStatus,
  StoredObjectStatus,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORAGE_INTEGRITY_QUEUE_PORT,
  type StorageIntegrityQueuePort,
} from './storage-integrity-queue.constants';

const RECOVERY_INTERVAL_MS = 60_000;
const STALE_LEASE_MS = 5 * 60_000;

@Injectable()
export class StorageIntegrityRecoveryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(StorageIntegrityRecoveryService.name);
  private recoveryTimer?: NodeJS.Timeout;
  private running = false;
  private lastTenantId?: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_INTEGRITY_QUEUE_PORT)
    private readonly queue: StorageIntegrityQueuePort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recover();
    this.recoveryTimer = setInterval(
      () => void this.recover(),
      RECOVERY_INTERVAL_MS,
    );
    this.recoveryTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
  }

  private async recover(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const staleBefore = new Date(Date.now() - STALE_LEASE_MS);
      const pending = {
        expectedSha256: { not: null },
        integrityStatus: StorageIntegrityStatus.PENDING,
        status: {
          in: [StoredObjectStatus.CONFIRMED, StoredObjectStatus.CONSUMED],
        },
        OR: [
          { integrityVerificationStartedAt: null },
          { integrityVerificationStartedAt: { lte: staleBefore } },
        ],
      } as const;

      // Tenant is the discovery root. Operational rows are then fetched only
      // with that exact tenantId, preserving zero-trust isolation.
      const tenants = await this.prisma.tenant.findMany({
        where: {
          ...(this.lastTenantId ? { id: { gt: this.lastTenantId } } : {}),
          storedObjects: { some: pending },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      this.lastTenantId =
        tenants.length === 100 ? tenants.at(-1)?.id : undefined;

      for (const tenant of tenants) {
        const objects = await this.prisma.storedObject.findMany({
          where: { tenantId: tenant.id, ...pending },
          select: { id: true, tenantId: true },
          orderBy: { createdAt: 'asc' },
          take: 100,
        });
        for (const object of objects) {
          await this.queue.enqueue({
            tenantId: tenant.id,
            storedObjectId: object.id,
          });
        }
      }
    } catch {
      this.logger.warn(
        'No fue posible reconciliar la cola durable de integridad de Storage',
      );
    } finally {
      this.running = false;
    }
  }
}
