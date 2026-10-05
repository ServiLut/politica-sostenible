import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { SaasAdminService } from './saas-admin.service';

function harness() {
  const prisma = {
    tenant: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue({ id: 'tenant-a' }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    voter: { count: jest.fn().mockResolvedValue(2) },
    task: { count: jest.fn().mockResolvedValue(3) },
    issueCase: { count: jest.fn().mockResolvedValue(4) },
    commitment: { count: jest.fn().mockResolvedValue(5) },
    campaignEvent: { count: jest.fn().mockResolvedValue(6) },
    financialEntry: { count: jest.fn().mockResolvedValue(7) },
    consentRecord: { count: jest.fn().mockResolvedValue(8) },
    storedObject: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { actualSize: 42 } }),
    },
    auditEvent: { groupBy: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  return {
    prisma,
    service: new SaasAdminService(prisma as unknown as PrismaService),
  };
}

describe('SaasAdminService bounded read contracts', () => {
  it('reports the rest of the organization catalog instead of silently truncating it', async () => {
    const { prisma, service } = harness();
    prisma.tenant.count.mockResolvedValue(26);
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-a',
        name: 'Equipo A',
        slug: 'equipo-a',
        type: 'CAMPAIGN',
        createdAt: new Date('2026-10-05T00:00:00Z'),
        _count: { users: 2, voters: 3 },
        auditEvents: [],
        operationProfile: null,
        settings: { id: 'settings-a' },
        config: { privateValue: 'must-not-be-returned' },
      },
    ]);
    const result = await service.listTenants();
    expect(result.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 26,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 25,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(result.data[0]).toMatchObject({
      userCount: 2,
      voterCount: 3,
      lastActivity: null,
      operationProfileConfigured: false,
      campaignSettingsConfigured: true,
    });
    expect(result.data[0]).not.toHaveProperty('config');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });

  it('searches names and slugs with the same filter for count and page, and has deterministic ties', async () => {
    const { prisma, service } = harness();
    prisma.tenant.count.mockResolvedValue(11);
    const result = await service.listTenants({
      page: 3,
      limit: 5,
      search: ' Norte ',
    });
    const where = {
      OR: [
        { name: { contains: 'Norte', mode: 'insensitive' } },
        { slug: { contains: 'Norte', mode: 'insensitive' } },
      ],
    };
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 10,
        take: 5,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(prisma.tenant.count).toHaveBeenCalledWith({ where });
    expect(result.pagination).toMatchObject({
      total: 11,
      totalPages: 3,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it('keeps an out-of-range or empty result explicit instead of switching to an unlimited query', async () => {
    const { prisma, service } = harness();
    const result = await service.listTenants({
      page: 4,
      limit: 10,
      search: '  ',
    });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 30, take: 10 }),
    );
    expect(result).toEqual({
      data: [],
      pagination: {
        page: 4,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });

  it('keeps search and counts inside the selected tenant, preserving masked users and module totals', async () => {
    const { prisma, service } = harness();
    prisma.user.count.mockResolvedValue(8);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-a',
        name: 'Ana',
        email: 'ana.personal@example.test',
        role: 'ADMIN',
        isActive: false,
        createdAt: new Date('2026-10-05T00:00:00Z'),
      },
    ]);
    const result = await service.getTenantDetail('tenant-a', {
      page: 2,
      limit: 5,
      search: ' Ana ',
    });
    const where = {
      tenantId: 'tenant-a',
      OR: [
        { name: { contains: 'Ana', mode: 'insensitive' } },
        { email: { contains: 'Ana', mode: 'insensitive' } },
      ],
    };
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 5,
        take: 5,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith({ where });
    expect(result.users[0]).toMatchObject({
      email: 'ana***@example.test',
      isActive: false,
    });
    expect(result.usersPagination).toEqual({
      page: 2,
      limit: 5,
      total: 8,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(result.moduleUsage.voters).toBe(2);
    expect(result.storageUsage).toBe(42);
    for (const model of [
      prisma.voter,
      prisma.task,
      prisma.issueCase,
      prisma.commitment,
      prisma.campaignEvent,
      prisma.financialEntry,
      prisma.consentRecord,
    ]) {
      expect(model.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-a' },
      });
    }
    expect(prisma.storedObject.aggregate).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      _sum: { actualSize: true },
    });
    expect(prisma.auditEvent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
  });

  it('bounds detail users without query parameters and reports an empty list', async () => {
    const { prisma, service } = harness();
    const result = await service.getTenantDetail('tenant-a');
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a' },
        skip: 0,
        take: 25,
      }),
    );
    expect(result.users).toEqual([]);
    expect(result.usersPagination).toMatchObject({
      total: 0,
      totalPages: 0,
      hasNextPage: false,
    });
  });

  it('does not query users or aggregate records for an unknown tenant', async () => {
    const { prisma, service } = harness();
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(service.getTenantDetail('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.voter.count).not.toHaveBeenCalled();
  });
});
