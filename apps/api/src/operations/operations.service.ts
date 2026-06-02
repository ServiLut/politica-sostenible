import { Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { JwtIdentityService } from '../common/services/jwt-identity.service';
import { UpdateOperationsStateDto } from './dto/update-operations-state.dto';

type JsonObj = Record<string, unknown>;
type AuditLogRecord = {
  actorId: string;
  module: string;
  action: string;
  timestamp: string;
  severity: 'Info' | 'Warning' | 'Critical';
};

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtIdentityService: JwtIdentityService,
  ) {}

  async getState(authorization?: string) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: identity.tenantId },
      select: { config: true },
    });

    const config = this.ensureObject(tenant?.config);
    const operations = this.ensureObject(config.operations);

    return {
      events: this.ensureArray(operations.events),
      tasks: this.ensureArray(operations.tasks),
      team: this.ensureArray(operations.team),
      broadcasts: this.ensureArray(operations.broadcasts),
      compliance: this.ensureArray(operations.compliance),
      territory: this.ensureArray(operations.territory),
      e14Reports: this.ensureArray(operations.e14Reports),
      campaignGoal:
        typeof operations.campaignGoal === 'number'
          ? operations.campaignGoal
          : 50000,
      onboarding: this.ensureObject(operations.onboarding),
    };
  }

  async updateState(
    authorization: string | undefined,
    dto: UpdateOperationsStateDto,
  ) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: identity.tenantId },
      select: { id: true, config: true },
    });

    const config = this.ensureObject(tenant?.config);
    const operations = this.ensureObject(config.operations);

    const nextOperations = {
      ...operations,
      ...(dto.events ? { events: dto.events } : {}),
      ...(dto.tasks ? { tasks: dto.tasks } : {}),
      ...(dto.team ? { team: dto.team } : {}),
      ...(dto.broadcasts ? { broadcasts: dto.broadcasts } : {}),
      ...(dto.compliance ? { compliance: dto.compliance } : {}),
      ...(dto.territory ? { territory: dto.territory } : {}),
      ...(dto.e14Reports ? { e14Reports: dto.e14Reports } : {}),
      ...(dto.campaignGoal !== undefined
        ? { campaignGoal: dto.campaignGoal }
        : {}),
      ...(dto.onboarding ? { onboarding: dto.onboarding } : {}),
    };

    const nextConfig: JsonObj = {
      ...config,
      operations: nextOperations,
    };

    await this.prisma.tenant.update({
      where: { id: identity.tenantId },
      data: {
        config: nextConfig as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      events: this.ensureArray(nextOperations.events),
      tasks: this.ensureArray(nextOperations.tasks),
      team: this.ensureArray(nextOperations.team),
      broadcasts: this.ensureArray(nextOperations.broadcasts),
      compliance: this.ensureArray(nextOperations.compliance),
      territory: this.ensureArray(nextOperations.territory),
      e14Reports: this.ensureArray(nextOperations.e14Reports),
      campaignGoal:
        typeof nextOperations.campaignGoal === 'number'
          ? nextOperations.campaignGoal
          : 50000,
      onboarding: this.ensureObject(nextOperations.onboarding),
    };
  }

  async getIntelligence(authorization?: string) {
    const identity =
      await this.jwtIdentityService.fromAuthorizationHeader(authorization);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: identity.tenantId },
      select: { config: true },
    });

    const config = this.ensureObject(tenant?.config);
    const operations = this.ensureObject(config.operations);
    const now = new Date();
    const nowMs = now.getTime();
    const oneDayAgoMs = nowMs - 24 * 60 * 60 * 1000;
    const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysAgoMs = nowMs - 14 * 24 * 60 * 60 * 1000;

    const auditLogs = this.readAuditFromConfig(config);
    const recentAudit = auditLogs.filter((log) => {
      const ts = new Date(log.timestamp).getTime();
      return Number.isFinite(ts) && ts >= sevenDaysAgoMs;
    });
    const topActorLogs = auditLogs.filter((log) => {
      const ts = new Date(log.timestamp).getTime();
      return Number.isFinite(ts) && ts >= fourteenDaysAgoMs;
    });

    const moduleMap = new Map<
      string,
      { events: number; lastEventAt: string | null }
    >();
    for (const log of recentAudit) {
      const current = moduleMap.get(log.module) ?? {
        events: 0,
        lastEventAt: null,
      };
      current.events += 1;
      if (!current.lastEventAt || log.timestamp > current.lastEventAt) {
        current.lastEventAt = log.timestamp;
      }
      moduleMap.set(log.module, current);
    }

    const actorEventCount = new Map<string, number>();
    for (const log of topActorLogs) {
      actorEventCount.set(
        log.actorId,
        (actorEventCount.get(log.actorId) ?? 0) + 1,
      );
    }

    const actorIds = Array.from(actorEventCount.keys());
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: {
            tenantId: identity.tenantId,
            id: { in: actorIds },
          },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const voterCount = await this.prisma.voter.count({
      where: { tenantId: identity.tenantId },
    });
    const financeCount = await this.prisma.financialEntry.count({
      where: { tenantId: identity.tenantId },
    });
    const pendingExpenses = await this.prisma.financialEntry.aggregate({
      where: {
        tenantId: identity.tenantId,
        type: 'EXPENSE',
        status: 'PENDING',
      },
      _sum: { amount: true },
    });
    const totalExpenses = await this.prisma.financialEntry.aggregate({
      where: {
        tenantId: identity.tenantId,
        type: 'EXPENSE',
      },
      _sum: { amount: true },
    });

    const expensesValue = Number(totalExpenses._sum.amount ?? 0);
    const pendingValue = Number(pendingExpenses._sum.amount ?? 0);
    const maxBudget = 500000000;
    const executionPct = ((expensesValue + pendingValue) / maxBudget) * 100;

    const tasks = this.ensureArray(operations.tasks);
    const compliance = this.ensureArray(operations.compliance);
    const campaignGoal =
      typeof operations.campaignGoal === 'number'
        ? operations.campaignGoal
        : 50000;

    const overdueTasks = tasks.filter((task) => {
      const status = task.status;
      const deadline = typeof task.deadline === 'string' ? task.deadline : '';
      if (status === 'Completada' || !deadline) return false;
      const ts = new Date(deadline).getTime();
      return Number.isFinite(ts) && ts < nowMs;
    }).length;
    const pendingTasks = tasks.filter(
      (task) => task.status !== 'Completada',
    ).length;

    const overdueCompliance = compliance.filter((item) => {
      if (item.status === 'Vencido') return true;
      const deadline = typeof item.deadline === 'string' ? item.deadline : '';
      if (!deadline) return false;
      const ts = new Date(deadline).getTime();
      return (
        Number.isFinite(ts) && ts < oneDayAgoMs && item.status !== 'Cumplido'
      );
    }).length;

    const alerts: Array<{
      id: string;
      severity: 'Critical' | 'Warning' | 'Info';
      module: string;
      title: string;
      description: string;
      metric: string;
      actionHref: string;
    }> = [];

    if (voterCount < 200) {
      alerts.push({
        id: 'int-voters-low',
        severity: 'Critical',
        module: 'Votantes',
        title: 'Base electoral baja',
        description: 'El padrón actual en CRM no alcanza umbral operativo.',
        metric: `${voterCount} registros`,
        actionHref: '/dashboard/pipeline',
      });
    }

    if (campaignGoal > 0) {
      const progressPct = (voterCount / campaignGoal) * 100;
      if (progressPct < 30) {
        alerts.push({
          id: 'int-goal-low',
          severity: 'Warning',
          module: 'Votantes',
          title: 'Meta de campaña rezagada',
          description:
            'La carga de registros está por debajo de la meta definida.',
          metric: `${progressPct.toFixed(1)}%`,
          actionHref: '/dashboard/executive',
        });
      }
    }

    if (executionPct >= 90) {
      alerts.push({
        id: 'int-finance-high-risk',
        severity: 'Critical',
        module: 'Finanzas',
        title: 'Riesgo de tope CNE',
        description: 'La ejecución financiera proyectada está en zona crítica.',
        metric: `${executionPct.toFixed(1)}%`,
        actionHref: '/dashboard/finance',
      });
    } else if (executionPct >= 80) {
      alerts.push({
        id: 'int-finance-warning',
        severity: 'Warning',
        module: 'Finanzas',
        title: 'Finanzas en zona de cuidado',
        description: 'Se requiere revisión de gastos pendientes y planeados.',
        metric: `${executionPct.toFixed(1)}%`,
        actionHref: '/dashboard/finance',
      });
    }

    if (overdueTasks > 0) {
      alerts.push({
        id: 'int-tasks-overdue',
        severity: overdueTasks >= 5 ? 'Critical' : 'Warning',
        module: 'Operaciones',
        title: 'Tareas vencidas',
        description: 'Hay actividades operativas fuera de plazo.',
        metric: `${overdueTasks} vencidas`,
        actionHref: '/dashboard/tasks',
      });
    }

    if (overdueCompliance > 0) {
      alerts.push({
        id: 'int-compliance-overdue',
        severity: 'Critical',
        module: 'Compliance',
        title: 'Obligaciones vencidas',
        description: 'Existen obligaciones normativas sin cierre.',
        metric: `${overdueCompliance} items`,
        actionHref: '/dashboard/compliance',
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        id: 'int-healthy',
        severity: 'Info',
        module: 'Operaciones',
        title: 'Operación estable',
        description: 'No se detectaron alertas críticas automáticas.',
        metric: 'Sin críticos',
        actionHref: '/dashboard/executive',
      });
    }

    const moduleBreakdown = Array.from(moduleMap.entries())
      .map(([module, data]) => ({
        module,
        events: data.events,
        lastEventAt: data.lastEventAt,
      }))
      .sort((a, b) => b.events - a.events);

    const topActors = Array.from(actorEventCount.entries())
      .map(([userId, events]) => ({
        userId,
        events,
        name: userMap.get(userId)?.name || 'Usuario',
        email: userMap.get(userId)?.email || '',
      }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 5);

    return {
      generatedAt: now.toISOString(),
      alerts: alerts.slice(0, 6),
      adoption: {
        activeUsers7d: new Set(recentAudit.map((log) => log.actorId)).size,
        events7d: recentAudit.length,
        modulesUsed7d: moduleBreakdown.length,
        moduleBreakdown,
        topActors,
      },
      health: {
        voters: voterCount,
        financeEntries: financeCount,
        tasksPending: pendingTasks,
        tasksOverdue: overdueTasks,
        complianceOverdue: overdueCompliance,
        expenseExecutionPercentage: Number(executionPct.toFixed(2)),
      },
    };
  }

  private ensureObject(value: unknown): JsonObj {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as JsonObj;
  }

  private ensureArray(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object' && !Array.isArray(item),
    );
  }

  private readAuditFromConfig(config: JsonObj): AuditLogRecord[] {
    const raw = config.auditLogs;
    if (!Array.isArray(raw)) return [];

    return raw
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          return null;
        const log = item as Record<string, unknown>;
        if (
          typeof log.actorId !== 'string' ||
          typeof log.module !== 'string' ||
          typeof log.action !== 'string' ||
          typeof log.timestamp !== 'string'
        ) {
          return null;
        }
        const severity =
          log.severity === 'Warning' ||
          log.severity === 'Critical' ||
          log.severity === 'Info'
            ? log.severity
            : 'Info';
        return {
          actorId: log.actorId,
          module: log.module,
          action: log.action,
          timestamp: log.timestamp,
          severity,
        } as AuditLogRecord;
      })
      .filter((log): log is AuditLogRecord => !!log);
  }
}
