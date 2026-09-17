import { ElectoralCatalogImportStatus } from '../../prisma/generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import { ElectoralCatalogImportRecoveryService } from './electoral-catalog-import-recovery.service';
import type { ElectoralCatalogQueuePort } from './electoral-catalog-queue.constants';

describe('ElectoralCatalogImportRecoveryService', () => {
  let prisma: {
    tenant: { findMany: jest.Mock };
    electoralCatalogImportJob: { findMany: jest.Mock };
  };
  let queue: { enqueue: jest.Mock; checkReady: jest.Mock };

  beforeEach(() => {
    prisma = {
      tenant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'tenant-a' }, { id: 'tenant-b' }]),
      },
      electoralCatalogImportJob: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'queued-a', tenantId: 'tenant-a' },
            { id: 'stale-a', tenantId: 'tenant-a' },
          ])
          .mockResolvedValueOnce([{ id: 'queued-b', tenantId: 'tenant-b' }]),
      },
    };
    queue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      checkReady: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('discovers tenants but reads and enqueues operational jobs tenant by tenant', async () => {
    const service = new ElectoralCatalogImportRecoveryService(
      prisma as unknown as PrismaService,
      queue as unknown as ElectoralCatalogQueuePort,
    );

    await service.onApplicationBootstrap();
    service.onModuleDestroy();

    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          electoralCatalogImports: {
            some: {
              OR: [
                { status: ElectoralCatalogImportStatus.QUEUED },
                expect.objectContaining({
                  status: ElectoralCatalogImportStatus.PROCESSING,
                }),
              ],
            },
          },
        },
        take: 100,
      }),
    );
    expect(prisma.electoralCatalogImportJob.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
      }),
    );
    expect(prisma.electoralCatalogImportJob.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-b' }),
      }),
    );
    expect(queue.enqueue.mock.calls).toEqual([
      [{ importJobId: 'queued-a', tenantId: 'tenant-a' }],
      [{ importJobId: 'stale-a', tenantId: 'tenant-a' }],
      [{ importJobId: 'queued-b', tenantId: 'tenant-b' }],
    ]);
  });

  it('fails the reconciliation cycle closed without leaking an unhandled rejection', async () => {
    prisma.tenant.findMany.mockRejectedValueOnce(
      new Error('postgres://secret@database'),
    );
    const service = new ElectoralCatalogImportRecoveryService(
      prisma as unknown as PrismaService,
      queue as unknown as ElectoralCatalogQueuePort,
    );

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    service.onModuleDestroy();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rotates the tenant cursor so a permanent early backlog cannot starve later tenants', async () => {
    prisma.tenant.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => ({
          id: `tenant-${String(index).padStart(3, '0')}`,
        })),
      )
      .mockResolvedValueOnce([]);
    prisma.electoralCatalogImportJob.findMany.mockReset().mockResolvedValue([]);
    const service = new ElectoralCatalogImportRecoveryService(
      prisma as unknown as PrismaService,
      queue as unknown as ElectoralCatalogQueuePort,
    );

    await service.onApplicationBootstrap();
    await (service as unknown as { recover(): Promise<void> }).recover();
    service.onModuleDestroy();

    expect(prisma.tenant.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { gt: 'tenant-099' },
        }),
      }),
    );
  });
});
