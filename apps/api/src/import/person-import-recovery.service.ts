import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PersonImportStatus, Prisma } from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import {
  PERSON_IMPORT_QUEUE_PORT,
  type PersonImportQueuePort,
} from './person-import.constants';

@Injectable()
export class PersonImportRecoveryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PersonImportRecoveryService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private afterTenant?: string;
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PERSON_IMPORT_QUEUE_PORT)
    private readonly queue: PersonImportQueuePort,
  ) {}
  async onApplicationBootstrap() {
    await this.recover();
    this.timer = setInterval(() => void this.recover(), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async recover() {
    if (this.running) return;
    this.running = true;
    try {
      const pending: Prisma.PersonImportJobWhereInput = {
        OR: [
          {
            status: {
              in: [PersonImportStatus.QUEUED, PersonImportStatus.IMPORT_QUEUED],
            },
          },
          {
            status: {
              in: [PersonImportStatus.VALIDATING, PersonImportStatus.IMPORTING],
            },
            leaseExpiresAt: { lt: new Date() },
          },
        ],
      };
      const tenants = await this.prisma.tenant.findMany({
        where: {
          ...(this.afterTenant ? { id: { gt: this.afterTenant } } : {}),
          personImports: { some: pending },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      this.afterTenant =
        tenants.length === 100 ? tenants.at(-1)?.id : undefined;
      for (const tenant of tenants) {
        const jobs = await this.prisma.personImportJob.findMany({
          where: { tenantId: tenant.id, ...pending },
          select: { id: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 100,
        });
        for (const job of jobs)
          await this.queue.enqueue({
            tenantId: tenant.id,
            importJobId: job.id,
          });
      }
    } catch {
      this.logger.warn(
        'No fue posible reconciliar la cola de importación de personas',
      );
    } finally {
      this.running = false;
    }
  }
}
