import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../prisma/generated/prisma';
import { ListSaasAdminQueryDto } from './dto/list-saas-admin-query.dto';

function pagination(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

@Injectable()
export class SaasAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listTenants(
    query: ListSaasAdminQueryDto = new ListSaasAdminQueryDto(),
  ) {
    const { page = 1, limit = 25 } = query;
    const search = query.search?.trim();
    const where: Prisma.TenantWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    // Cross-organization reads are available only through SaasAdminGuard.
    // Count and page share one snapshot so metadata cannot silently disagree.
    const [tenants, total] = await this.prisma.$transaction(
      [
        this.prisma.tenant.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          include: {
            _count: {
              select: {
                users: true,
                voters: true,
              },
            },
            auditEvents: {
              orderBy: { occurredAt: 'desc' },
              take: 1,
              select: { occurredAt: true },
            },
            operationProfile: {
              select: { id: true },
            },
            settings: {
              select: { id: true },
            },
          },
        }),
        this.prisma.tenant.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      data: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        type: t.type,
        createdAt: t.createdAt,
        userCount: t._count.users,
        voterCount: t._count.voters,
        lastActivity: t.auditEvents[0]?.occurredAt || null,
        operationProfileConfigured: !!t.operationProfile,
        campaignSettingsConfigured: !!t.settings,
      })),
      pagination: pagination(page, limit, total),
    };
  }

  async getTenantDetail(
    tenantId: string,
    query: ListSaasAdminQueryDto = new ListSaasAdminQueryDto(),
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        operationProfile: true,
        settings: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const { page = 1, limit = 25 } = query;
    const search = query.search?.trim();
    const userWhere: Prisma.UserWhereInput = {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [users, usersTotal] = await this.prisma.$transaction(
      [
        this.prisma.user.findMany({
          where: userWhere,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        }),
        this.prisma.user.count({ where: userWhere }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const maskedUsers = users.map((u) => {
      const parts = u.email.split('@');
      const domain = parts[1] || '';
      const namePart = parts[0] || '';
      const maskedEmail =
        namePart.length > 3
          ? namePart.substring(0, 3) + '***@' + domain
          : namePart + '***@' + domain;
      return { ...u, email: maskedEmail };
    });

    const [
      votersCount,
      tasksCount,
      casesCount,
      commitmentsCount,
      eventsCount,
      financialEntriesCount,
      consentRecordsCount,
      storageObjects,
      auditEventsRaw,
    ] = await Promise.all([
      this.prisma.voter.count({ where: { tenantId } }),
      this.prisma.task.count({ where: { tenantId } }),
      this.prisma.issueCase.count({ where: { tenantId } }),
      this.prisma.commitment.count({ where: { tenantId } }),
      this.prisma.campaignEvent.count({ where: { tenantId } }),
      this.prisma.financialEntry.count({ where: { tenantId } }),
      this.prisma.consentRecord.count({ where: { tenantId } }),
      this.prisma.storedObject.aggregate({
        where: { tenantId },
        _sum: { actualSize: true },
      }),
      this.prisma.auditEvent.groupBy({
        by: ['action'],
        where: { tenantId },
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
    ]);

    const storageUsage = storageObjects._sum.actualSize || 0;

    return {
      tenant,
      users: maskedUsers,
      usersPagination: pagination(page, limit, usersTotal),
      moduleUsage: {
        voters: votersCount,
        tasks: tasksCount,
        cases: casesCount,
        commitments: commitmentsCount,
        events: eventsCount,
        financialEntries: financialEntriesCount,
        consentRecords: consentRecordsCount,
      },
      storageUsage,
      topAuditEvents: auditEventsRaw.map((a) => ({
        action: a.action,
        count: a._count.action,
      })),
    };
  }

  async getPlatformStats() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalTenants,
      totalUsers,
      totalVoters,
      activeTenantsList,
      tasksCount,
      casesCount,
      eventsCount,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.voter.count(),
      this.prisma.auditEvent.groupBy({
        by: ['tenantId'],
        where: { occurredAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.task.count(),
      this.prisma.issueCase.count(),
      this.prisma.campaignEvent.count(),
    ]);

    const activeTenants = activeTenantsList.length;
    const averageTeamSize = totalTenants > 0 ? totalUsers / totalTenants : 0;

    return {
      totalTenants,
      totalUsers,
      totalVoters,
      activeTenantsLast30Days: activeTenants,
      averageTeamSize,
      moduleUsageStats: {
        tasks: tasksCount,
        cases: casesCount,
        events: eventsCount,
      },
    };
  }
}
