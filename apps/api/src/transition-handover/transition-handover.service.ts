import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditActorType } from '../../prisma/generated/prisma';

@Injectable()
export class TransitionHandoverService {
  constructor(private readonly prisma: PrismaService) {}

  async generateHandoverReport(tenantId: string, userId: string) {
    // 1. Get Tenant details and Settings
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const mode = tenant.defaultMode;

    // 2. Aggregate Finances
    const finances = await this.prisma.financialEntry.groupBy({
      by: ['type'],
      where: { tenantId },
      _sum: { amount: true },
      _count: { _all: true },
    });

    let totalIncome = 0;
    let totalExpenses = 0;
    let totalEntries = 0;

    for (const f of finances) {
      totalEntries += f._count._all;
      if (f.type === 'INCOME') {
        totalIncome += Number(f._sum.amount || 0);
      } else if (f.type === 'EXPENSE') {
        totalExpenses += Number(f._sum.amount || 0);
      }
    }

    // 3. Aggregate Team
    const activeUsersCount = await this.prisma.user.count({
      where: { tenantId, isActive: true },
    });
    const usersByRole = await this.prisma.user.groupBy({
      by: ['role'],
      where: { tenantId, isActive: true },
      _count: { _all: true },
    });

    // 4. Aggregate Operations
    const votersCount = await this.prisma.voter.count({ where: { tenantId } });
    const casesCount = await this.prisma.issueCase.count({ where: { tenantId } });
    const tasksByStatus = await this.prisma.task.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { _all: true },
    });

    // 5. Aggregate Storage
    const storageByCategory = await this.prisma.storedObject.groupBy({
      by: ['documentCategory'],
      where: { tenantId },
      _count: { _all: true },
    });

    // 6. Comprehensive JSON object
    const report = {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        type: tenant.type,
        mode: tenant.defaultMode,
        createdAt: tenant.createdAt,
      },
      settings: tenant.settings,
      finances: {
        totalIncome,
        totalExpenses,
        totalEntries,
      },
      team: {
        activeUsersCount,
        byRole: usersByRole.map((r) => ({
          role: r.role,
          count: r._count._all,
        })),
      },
      operations: {
        votersCount,
        casesCount,
        tasks: tasksByStatus.map((t) => ({
          status: t.status,
          count: t._count._all,
        })),
      },
      storage: {
        byCategory: storageByCategory.map((s) => ({
          category: s.documentCategory,
          count: s._count._all,
        })),
      },
      generatedAt: new Date(),
    };

    // 7. Log AuditEvent
    await this.prisma.auditEvent.create({
      data: {
        tenantId,
        mode,
        actorType: AuditActorType.USER,
        actorUserId: userId,
        action: 'HANDOVER_REPORT_GENERATED',
        resourceType: 'Report',
        resourceId: tenantId,
      },
    });

    return report;
  }
}
