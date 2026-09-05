import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seedDefaultPlans() {
    this.logger.log('Seeding default subscription plans...');

    const plans = [
      {
        code: 'FREE' as const,
        name: 'Gratis',
        description: 'Ideal para iniciar',
        maxUsers: 3,
        maxVoters: 100,
        maxStorageMb: 50,
        includesExport: false,
        includesImport: false,
        includesMfa: false,
        includesApi: false,
        monthlyPriceCop: 0,
        yearlyPriceCop: 0,
        sortOrder: 1,
      },
      {
        code: 'STARTER' as const,
        name: 'Starter',
        description: 'Para campañas pequeñas',
        maxUsers: 10,
        maxVoters: 1000,
        maxStorageMb: 500,
        includesExport: true,
        includesImport: false,
        includesMfa: false,
        includesApi: false,
        monthlyPriceCop: 99000,
        yearlyPriceCop: 99000 * 12,
        sortOrder: 2,
      },
      {
        code: 'PROFESSIONAL' as const,
        name: 'Profesional',
        description: 'Para campañas medianas a grandes',
        maxUsers: 50,
        maxVoters: 10000,
        maxStorageMb: 2048,
        includesExport: true,
        includesImport: true,
        includesMfa: true,
        includesApi: true,
        monthlyPriceCop: 299000,
        yearlyPriceCop: 299000 * 12,
        sortOrder: 3,
      },
      {
        code: 'ENTERPRISE' as const,
        name: 'Empresarial',
        description: 'Sin límites',
        maxUsers: 999999,
        maxVoters: 999999,
        maxStorageMb: 999999,
        includesExport: true,
        includesImport: true,
        includesMfa: true,
        includesApi: true,
        monthlyPriceCop: 799000,
        yearlyPriceCop: 799000 * 12,
        sortOrder: 4,
      },
    ];

    for (const plan of plans) {
      await this.prisma.subscriptionPlan.upsert({
        where: { code: plan.code },
        update: plan,
        create: plan,
      });
    }

    this.logger.log('Default subscription plans seeded.');
  }

  async listPlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getCurrentSubscription(tenantId: string) {
    let sub = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!sub) {
      const freePlan = await this.prisma.subscriptionPlan.findUnique({ where: { code: 'FREE' } });
      if (!freePlan) throw new Error('Free plan not found');
      
      const now = new Date();
      const nextMonth = new Date();
      nextMonth.setMonth(now.getMonth() + 1);

      sub = await this.prisma.tenantSubscription.create({
        data: {
          tenantId,
          planId: freePlan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: nextMonth,
        },
        include: { plan: true },
      });
    }

    return sub;
  }

  async getUsage(tenantId: string) {
    const [usersCount, votersCount, storageBytes] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.voter.count({ where: { tenantId } }),
      this.prisma.storedObject.aggregate({
        where: { tenantId },
        _sum: { actualSize: true },
      }),
    ]);

    const storageMb = (storageBytes._sum.actualSize || 0) / (1024 * 1024);
    const sub = await this.getCurrentSubscription(tenantId);
    
    return {
      limits: {
        users: sub.plan.maxUsers,
        voters: sub.plan.maxVoters,
        storageMb: sub.plan.maxStorageMb,
      },
      current: {
        users: usersCount,
        voters: votersCount,
        storageMb: storageMb,
      },
    };
  }

  async checkQuota(tenantId: string, resource: 'users' | 'voters' | 'storage', increment = 1): Promise<boolean> {
    const usage = await this.getUsage(tenantId);
    
    if (resource === 'users') {
      return (usage.current.users + increment) <= usage.limits.users;
    } else if (resource === 'voters') {
      return (usage.current.voters + increment) <= usage.limits.voters;
    } else if (resource === 'storage') {
      return (usage.current.storageMb + increment) <= usage.limits.storageMb;
    }
    
    return false;
  }
}
