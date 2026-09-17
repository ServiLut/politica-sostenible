import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoredObjectStatus } from '../../prisma/generated/prisma';
import { getTenantEntitledSubscription } from '../auth/guards/plan-limits.guard';
import {
  isConfiguredSaasAdminUserId,
  SAAS_ADMIN_IDENTITY_CONFIG,
  type SaasAdminIdentityConfig,
} from '../auth/guards/saas-admin.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

const NO_SAAS_ADMINS: SaasAdminIdentityConfig = Object.freeze({
  userIds: Object.freeze([]),
});

export interface BillingCapabilities {
  plan: {
    code: string;
    name: string;
  };
  features: {
    export: boolean;
    import: boolean;
    mfa: boolean;
  };
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SAAS_ADMIN_IDENTITY_CONFIG)
    private readonly saasAdminIdentity: SaasAdminIdentityConfig = NO_SAAS_ADMINS,
  ) {}

  async seedDefaultPlans() {
    this.logger.log('Seeding default subscription plans...');

    const plans = [
      {
        code: 'FREE' as const,
        name: 'Piloto',
        description: 'Ediles, Concejos municipios 6ta cat.',
        maxUsers: 3,
        maxVoters: 500,
        maxStorageMb: 50,
        includesExport: false,
        includesImport: false,
        includesMfa: false,
        includesApi: false,
        monthlyPriceCop: 0,
        yearlyPriceCop: 0,
        isActive: true,
        sortOrder: 1,
      },
      {
        code: 'STARTER' as const,
        name: 'Starter',
        description: 'Concejales capitales, Alcaldías cat. 4-6',
        maxUsers: 15,
        maxVoters: 5000,
        maxStorageMb: 500,
        includesExport: true,
        includesImport: false,
        includesMfa: false,
        includesApi: false,
        monthlyPriceCop: 290000,
        yearlyPriceCop: 290000 * 12,
        isActive: true,
        sortOrder: 2,
      },
      {
        code: 'PROFESSIONAL' as const,
        name: 'Profesional',
        description: 'Alcaldías cat. 3-Especial, Asambleas, Cámara',
        maxUsers: 50,
        maxVoters: 50000,
        maxStorageMb: 2048,
        includesExport: true,
        includesImport: true,
        includesMfa: true,
        // API keys for third-party clients are not implemented yet. Do not
        // advertise or entitle an external API until that lifecycle exists.
        includesApi: false,
        monthlyPriceCop: 990000,
        yearlyPriceCop: 990000 * 12,
        isActive: true,
        sortOrder: 3,
      },
      {
        code: 'ENTERPRISE' as const,
        name: 'Enterprise',
        description: 'Gobernaciones, grandes capitales, Senado',
        maxUsers: 999999,
        maxVoters: 999999,
        maxStorageMb: 999999,
        includesExport: true,
        includesImport: true,
        includesMfa: true,
        includesApi: false,
        monthlyPriceCop: 3500000,
        yearlyPriceCop: 3500000 * 12,
        isActive: true,
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

    const configuredCodes = await this.prisma.subscriptionPlan.findMany({
      where: { code: { in: plans.map(({ code }) => code) } },
      select: { code: true },
    });
    if (
      new Set(configuredCodes.map(({ code }) => code)).size !== plans.length
    ) {
      throw new ServiceUnavailableException(
        'El catálogo de planes entra en conflicto con datos existentes; requiere revisión manual',
      );
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
    return getTenantEntitledSubscription(this.prisma, tenantId);
  }

  /**
   * Returns only the flags needed to render plan-gated product actions. The
   * tenant is deliberately taken from the validated JWT user, never from a
   * request body or query string.
   */
  async getCapabilities(
    user: Pick<AuthenticatedUser, 'tenantId' | 'userId'>,
  ): Promise<BillingCapabilities> {
    const subscription = await this.getCurrentSubscription(user.tenantId);
    const plan = subscription.plan;

    return {
      plan: {
        code: plan.code,
        name: plan.name,
      },
      features: {
        export: plan.includesExport === true,
        import: plan.includesImport === true,
        // SaaS operators must retain the MFA-enrolment route that the guard
        // explicitly grants them, even when their tenant uses a lower plan.
        mfa:
          plan.includesMfa === true ||
          isConfiguredSaasAdminUserId(user.userId, this.saasAdminIdentity),
      },
    };
  }

  async getUsage(tenantId: string) {
    // Never publish usable-looking limits for an ineligible subscription.
    const sub = await this.getCurrentSubscription(tenantId);
    const [usersCount, votersCount, storageBytes] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.voter.count({ where: { tenantId } }),
      this.prisma.storedObject.aggregate({
        where: {
          tenantId,
          status: {
            in: [
              StoredObjectStatus.ISSUED,
              StoredObjectStatus.CONFIRMED,
              StoredObjectStatus.CONSUMED,
            ],
          },
        },
        _sum: { expectedSize: true },
      }),
    ]);

    const storageMb = (storageBytes._sum.expectedSize || 0) / (1024 * 1024);

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
}
