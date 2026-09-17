import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  ElectoralCatalogImportStatus,
  Prisma,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import {
  ELECTORAL_CATALOG_QUEUE_PORT,
  type ElectoralCatalogQueuePort,
} from './electoral-catalog-queue.constants';

const RECOVERY_INTERVAL_MS = 60_000;
const STALE_PROCESSING_MS = 15 * 60_000;

@Injectable()
export class ElectoralCatalogImportRecoveryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    ElectoralCatalogImportRecoveryService.name,
  );
  private recoveryTimer?: NodeJS.Timeout;
  private running = false;
  private lastTenantId?: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ELECTORAL_CATALOG_QUEUE_PORT)
    private readonly queue: ElectoralCatalogQueuePort,
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
      const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
      const recoverable: Prisma.ElectoralCatalogImportJobWhereInput = {
        OR: [
          { status: ElectoralCatalogImportStatus.QUEUED },
          {
            status: ElectoralCatalogImportStatus.PROCESSING,
            startedAt: { lte: staleBefore },
          },
        ],
      };
      // Tenant es la raiz de aislamiento. La reconciliacion puede descubrir
      // tenants con trabajo pendiente, pero nunca consulta una tabla operativa
      // sin fijar tenantId en la consulta que devuelve sus filas.
      const tenants = await this.prisma.tenant.findMany({
        where: {
          ...(this.lastTenantId ? { id: { gt: this.lastTenantId } } : {}),
          electoralCatalogImports: { some: recoverable },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      this.lastTenantId =
        tenants.length === 100 ? tenants.at(-1)?.id : undefined;
      for (const tenant of tenants) {
        const jobs = await this.prisma.electoralCatalogImportJob.findMany({
          where: { tenantId: tenant.id, ...recoverable },
          select: { id: true, tenantId: true },
          orderBy: { createdAt: 'asc' },
          take: 100,
        });
        for (const job of jobs) {
          await this.queue.enqueue({
            importJobId: job.id,
            tenantId: tenant.id,
          });
        }
      }
    } catch {
      this.logger.warn(
        'No fue posible reconciliar la cola durable de ingesta electoral',
      );
    } finally {
      this.running = false;
    }
  }
}
