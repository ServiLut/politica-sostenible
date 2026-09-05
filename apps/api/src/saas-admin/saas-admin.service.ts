import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SaasAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
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
    });

    return tenants.map((t) => ({
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
    }));
  }

  async getTenantDetail(tenantId: string) {
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

    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

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
