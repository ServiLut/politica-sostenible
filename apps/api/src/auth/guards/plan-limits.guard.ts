import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PlanCode,
  Prisma,
  StoredObjectStatus,
  SubscriptionStatus,
} from '../../../prisma/generated/prisma';
import {
  PLAN_FEATURE_KEY,
  PlanFeature,
} from '../decorators/requires-plan-feature.decorator';
import { ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY } from '../decorators/allow-saas-admin-mfa-enrollment.decorator';
import {
  isConfiguredSaasAdminUserId,
  SAAS_ADMIN_IDENTITY_CONFIG,
  type SaasAdminIdentityConfig,
} from './saas-admin.guard';
import type { AuthenticatedRequest } from '../interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';

export type PlanQuotaResource = 'users' | 'voters' | 'storage';

type SubscriptionClient = Pick<
  Prisma.TransactionClient,
  'subscriptionPlan' | 'tenantSubscription'
>;

type QuotaClient = SubscriptionClient &
  Pick<
    Prisma.TransactionClient,
    '$queryRaw' | 'storedObject' | 'user' | 'voter'
  >;

const BYTES_PER_MEGABYTE = 1024 * 1024;
const PLAN_ENTITLEMENT_INCLUDE = {
  plan: true,
} satisfies Prisma.TenantSubscriptionInclude;

const FEATURE_FIELDS = {
  [PlanFeature.EXPORT]: 'includesExport',
  [PlanFeature.IMPORT]: 'includesImport',
  [PlanFeature.MFA]: 'includesMfa',
} as const;

const FEATURE_LABELS = {
  [PlanFeature.EXPORT]: 'la exportación de datos',
  [PlanFeature.IMPORT]: 'la importación de datos',
  [PlanFeature.MFA]: 'la autenticación multifactor',
} as const;

const QUOTA_LABELS: Record<PlanQuotaResource, string> = {
  users: 'usuarios',
  voters: 'votantes',
  storage: 'almacenamiento',
};

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

function invalidBillingConfiguration(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    'No fue posible validar el plan de la organización.',
  );
}

function isValidLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function nextMonthlyPeriod(now: Date): Date {
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  return nextMonth;
}

async function loadEntitlements(client: SubscriptionClient, tenantId: string) {
  const subscription = await client.tenantSubscription.findUnique({
    where: { tenantId },
    include: PLAN_ENTITLEMENT_INCLUDE,
  });

  const now = Date.now();

  if (
    !subscription ||
    !subscription.plan?.isActive ||
    !isValidLimit(subscription.plan.maxUsers) ||
    !isValidLimit(subscription.plan.maxVoters) ||
    !isValidLimit(subscription.plan.maxStorageMb) ||
    !(subscription.currentPeriodStart instanceof Date) ||
    !(subscription.currentPeriodEnd instanceof Date) ||
    subscription.currentPeriodStart > subscription.currentPeriodEnd
  ) {
    throw invalidBillingConfiguration();
  }

  if (
    subscription.currentPeriodStart.getTime() > now ||
    subscription.currentPeriodEnd.getTime() <= now
  ) {
    throw new ForbiddenException(
      'El periodo de facturación de la organización no está vigente.',
    );
  }

  if (subscription.status === SubscriptionStatus.TRIAL) {
    if (
      !(subscription.trialEndsAt instanceof Date) ||
      subscription.trialEndsAt.getTime() <= now
    ) {
      throw new ForbiddenException(
        'El periodo de prueba de la organización terminó.',
      );
    }
  } else if (subscription.status !== SubscriptionStatus.ACTIVE) {
    throw new ForbiddenException(
      'La suscripción de la organización no está activa.',
    );
  }

  return subscription;
}

/**
 * Ensures legacy tenants receive the default FREE subscription once. Entitlement
 * validation still happens at the point of use and always fails closed.
 */
export async function ensureTenantSubscription(
  client: SubscriptionClient,
  tenantId: string,
): Promise<void> {
  const existing = await client.tenantSubscription.findUnique({
    where: { tenantId },
    select: {
      id: true,
      status: true,
      currentPeriodEnd: true,
      plan: { select: { code: true, isActive: true } },
    },
  });
  if (existing) {
    const now = new Date();
    if (
      existing.status === SubscriptionStatus.ACTIVE &&
      existing.plan.isActive &&
      existing.plan.code === PlanCode.FREE &&
      existing.currentPeriodEnd.getTime() <= now.getTime()
    ) {
      // FREE has no external billing lifecycle. Renew it with a conditional
      // update so concurrent requests cannot move the period repeatedly.
      await client.tenantSubscription.updateMany({
        where: {
          id: existing.id,
          tenantId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: { lte: now },
          plan: { code: PlanCode.FREE, isActive: true },
        },
        data: {
          currentPeriodStart: now,
          currentPeriodEnd: nextMonthlyPeriod(now),
        },
      });
    }
    return;
  }

  const freePlan = await client.subscriptionPlan.findUnique({
    where: { code: 'FREE' },
    select: { id: true, isActive: true },
  });
  if (!freePlan?.isActive) {
    throw invalidBillingConfiguration();
  }

  const now = new Date();
  const nextMonth = nextMonthlyPeriod(now);

  try {
    await client.tenantSubscription.create({
      data: {
        tenantId,
        planId: freePlan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: nextMonth,
      },
      select: { id: true },
    });
  } catch (error: unknown) {
    if (!isPrismaError(error, 'P2002')) throw error;

    const concurrent = await client.tenantSubscription.findUnique({
      where: { tenantId },
      select: {
        id: true,
        status: true,
        currentPeriodEnd: true,
        plan: { select: { code: true, isActive: true } },
      },
    });
    if (!concurrent) throw invalidBillingConfiguration();
  }
}

/**
 * Returns only subscriptions that authorize product use. This is the shared
 * source of truth for guards, billing responses and usage limits.
 */
export async function getTenantEntitledSubscription(
  client: SubscriptionClient,
  tenantId: string,
) {
  await ensureTenantSubscription(client, tenantId);
  return loadEntitlements(client, tenantId);
}

/**
 * Must be called from the same transaction that performs the corresponding
 * insert. The tenant/resource advisory lock serializes quota reservations.
 */
export async function assertPlanQuotaInTransaction(
  client: QuotaClient,
  tenantId: string,
  resource: PlanQuotaResource,
  increment = 1,
): Promise<void> {
  if (!Number.isSafeInteger(increment) || increment < 0) {
    throw new BadRequestException(
      'El incremento de cuota debe ser un entero no negativo.',
    );
  }

  const lockKey = `plan-quota:${tenantId}:${resource}`;
  await client.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
    WITH plan_quota_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    )
    SELECT TRUE AS "locked" FROM plan_quota_lock
  `);

  const subscription = await loadEntitlements(client, tenantId);
  let current: number;
  let limit: number;

  if (resource === 'users') {
    current = await client.user.count({ where: { tenantId } });
    limit = subscription.plan.maxUsers;
  } else if (resource === 'voters') {
    current = await client.voter.count({ where: { tenantId } });
    limit = subscription.plan.maxVoters;
  } else {
    const stored = await client.storedObject.aggregate({
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
    });
    current = Number(stored._sum.expectedSize ?? 0);
    limit = subscription.plan.maxStorageMb * BYTES_PER_MEGABYTE;
  }

  if (!Number.isSafeInteger(current) || current < 0) {
    throw invalidBillingConfiguration();
  }

  if (current > limit - increment) {
    throw new ForbiddenException(
      `El plan actual alcanzó la cuota de ${QUOTA_LABELS[resource]}.`,
    );
  }
}

@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureTenantSubscription(tenantId: string): Promise<void> {
    await ensureTenantSubscription(this.prisma, tenantId);
  }

  async assertFeature(tenantId: string, feature: PlanFeature): Promise<void> {
    const subscription = await getTenantEntitledSubscription(
      this.prisma,
      tenantId,
    );
    const field = FEATURE_FIELDS[feature];

    if (!subscription.plan[field]) {
      throw new ForbiddenException(
        `El plan actual no incluye ${FEATURE_LABELS[feature]}.`,
      );
    }
  }

  async assertQuotaInTransaction(
    client: QuotaClient,
    tenantId: string,
    resource: PlanQuotaResource,
    increment = 1,
  ): Promise<void> {
    await assertPlanQuotaInTransaction(client, tenantId, resource, increment);
  }
}

@Injectable()
export class PlanLimitsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planLimits: PlanLimitsService,
    @Inject(SAAS_ADMIN_IDENTITY_CONFIG)
    private readonly saasAdminIdentity: SaasAdminIdentityConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<PlanFeature>(
      PLAN_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredFeature) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException(
        'Se requiere una sesión autenticada para validar el plan.',
      );
    }

    const permitsSaasAdminMfaEnrollment =
      requiredFeature === PlanFeature.MFA &&
      this.reflector.getAllAndOverride<boolean>(
        ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY,
        [context.getHandler(), context.getClass()],
      ) === true &&
      isConfiguredSaasAdminUserId(request.user?.userId, this.saasAdminIdentity);

    if (permitsSaasAdminMfaEnrollment) return true;

    await this.planLimits.assertFeature(tenantId, requiredFeature);
    return true;
  }
}
