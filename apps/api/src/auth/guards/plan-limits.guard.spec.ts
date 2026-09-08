import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import {
  StoredObjectStatus,
  SubscriptionStatus,
} from '../../../prisma/generated/prisma';
import {
  PLAN_FEATURE_KEY,
  PlanFeature,
} from '../decorators/requires-plan-feature.decorator';
import { ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY } from '../decorators/allow-saas-admin-mfa-enrollment.decorator';
import {
  assertPlanQuotaInTransaction,
  ensureTenantSubscription,
  PlanLimitsGuard,
  PlanLimitsService,
} from './plan-limits.guard';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SaasAdminIdentityConfig } from './saas-admin.guard';

const ADMIN_USER_ID = `c${'1'.repeat(24)}`;
const MEMBER_USER_ID = `c${'2'.repeat(24)}`;
const SAAS_ADMIN_IDENTITY: SaasAdminIdentityConfig = {
  userIds: [ADMIN_USER_ID],
};

function activeSubscription(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: SubscriptionStatus.ACTIVE,
    trialEndsAt: null,
    currentPeriodStart: new Date(Date.now() - 60_000),
    currentPeriodEnd: new Date(Date.now() + 60_000),
    plan: {
      isActive: true,
      maxUsers: 3,
      maxVoters: 100,
      maxStorageMb: 50,
      includesExport: true,
      includesImport: false,
      includesMfa: true,
    },
    ...overrides,
  };
}

function quotaClient(subscription = activeSubscription()) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: '' }]),
    tenantSubscription: {
      findUnique: jest.fn().mockResolvedValue(subscription),
      create: jest.fn(),
    },
    subscriptionPlan: { findUnique: jest.fn() },
    user: { count: jest.fn().mockResolvedValue(0) },
    voter: { count: jest.fn().mockResolvedValue(0) },
    storedObject: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { expectedSize: 0 },
      }),
    },
  };
}

describe('plan entitlement enforcement', () => {
  it('creates a FREE subscription for a legacy tenant', async () => {
    const client = {
      tenantSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'subscription-a' }),
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'free-plan',
          isActive: true,
        }),
      },
    };

    await ensureTenantSubscription(client as never, 'tenant-from-jwt');

    expect(client.tenantSubscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-from-jwt',
        planId: 'free-plan',
        status: SubscriptionStatus.ACTIVE,
      }),
      select: { id: true },
    });
  });

  it('recovers safely when another request bootstraps the same tenant', async () => {
    const client = {
      tenantSubscription: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'concurrent-subscription' }),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'free-plan',
          isActive: true,
        }),
      },
    };

    await expect(
      ensureTenantSubscription(client as never, 'tenant-a'),
    ).resolves.toBeUndefined();
    expect(client.tenantSubscription.findUnique).toHaveBeenLastCalledWith({
      where: { tenantId: 'tenant-a' },
      select: expect.objectContaining({
        id: true,
        currentPeriodEnd: true,
      }),
    });
  });

  it('renews an expired FREE period once with a conditional update', async () => {
    const expiredAt = new Date(Date.now() - 60_000);
    const client = {
      tenantSubscription: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'subscription-a',
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: expiredAt,
            plan: { code: 'FREE', isActive: true },
          })
          .mockResolvedValueOnce({
            id: 'subscription-a',
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: new Date(Date.now() + 60_000),
            plan: { code: 'FREE', isActive: true },
          }),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      subscriptionPlan: { findUnique: jest.fn() },
    };

    await ensureTenantSubscription(client as never, 'tenant-a');
    await ensureTenantSubscription(client as never, 'tenant-a');

    expect(client.tenantSubscription.updateMany).toHaveBeenCalledTimes(1);
    expect(client.tenantSubscription.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'subscription-a',
        tenantId: 'tenant-a',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { lte: expect.any(Date) as Date },
      }),
      data: {
        currentPeriodStart: expect.any(Date) as Date,
        currentPeriodEnd: expect.any(Date) as Date,
      },
    });
  });

  it('fails closed when the FREE plan is missing or inactive', async () => {
    const client = {
      tenantSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      subscriptionPlan: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    await expect(
      ensureTenantSubscription(client as never, 'tenant-a'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(client.tenantSubscription.create).not.toHaveBeenCalled();
  });

  it('allows an included feature and denies a feature absent from the plan', async () => {
    const prisma = quotaClient();
    prisma.tenantSubscription.findUnique
      .mockResolvedValueOnce({ id: 'subscription-a' })
      .mockResolvedValueOnce(activeSubscription())
      .mockResolvedValueOnce({ id: 'subscription-a' })
      .mockResolvedValueOnce(activeSubscription());
    const service = new PlanLimitsService(prisma as unknown as PrismaService);

    await expect(
      service.assertFeature('tenant-a', PlanFeature.EXPORT),
    ).resolves.toBeUndefined();
    await expect(
      service.assertFeature('tenant-a', PlanFeature.IMPORT),
    ).rejects.toThrow('El plan actual no incluye la importación de datos.');
  });

  it.each([
    [
      'inicio futuro',
      activeSubscription({
        currentPeriodStart: new Date(Date.now() + 60_000),
      }),
    ],
    [
      'periodo vencido',
      activeSubscription({
        currentPeriodEnd: new Date(Date.now() - 60_000),
      }),
    ],
    [
      'plan inactivo',
      activeSubscription({
        plan: {
          ...(activeSubscription().plan as Record<string, unknown>),
          isActive: false,
        },
      }),
    ],
  ])('fails closed for inconsistent billing: %s', async (_label, row) => {
    const prisma = quotaClient();
    prisma.tenantSubscription.findUnique
      .mockResolvedValueOnce({ id: 'subscription-a' })
      .mockResolvedValueOnce(row);
    const service = new PlanLimitsService(prisma as unknown as PrismaService);

    await expect(
      service.assertFeature('tenant-a', PlanFeature.EXPORT),
    ).rejects.toBeInstanceOf(
      _label === 'plan inactivo'
        ? ServiceUnavailableException
        : ForbiddenException,
    );
  });

  it('rejects an expired trial', async () => {
    const prisma = quotaClient();
    prisma.tenantSubscription.findUnique
      .mockResolvedValueOnce({ id: 'subscription-a' })
      .mockResolvedValueOnce(
        activeSubscription({
          status: SubscriptionStatus.TRIAL,
          trialEndsAt: new Date(Date.now() - 1),
        }),
      );
    const service = new PlanLimitsService(prisma as unknown as PrismaService);

    await expect(
      service.assertFeature('tenant-a', PlanFeature.MFA),
    ).rejects.toThrow('El periodo de prueba de la organización terminó.');
  });

  it('rejects a trial outside its billing period even if trialEndsAt is future', async () => {
    const prisma = quotaClient();
    prisma.tenantSubscription.findUnique
      .mockResolvedValueOnce({ id: 'subscription-a' })
      .mockResolvedValueOnce(
        activeSubscription({
          status: SubscriptionStatus.TRIAL,
          trialEndsAt: new Date(Date.now() + 60_000),
          currentPeriodEnd: new Date(Date.now() - 1),
        }),
      );
    const service = new PlanLimitsService(prisma as unknown as PrismaService);

    await expect(
      service.assertFeature('tenant-a', PlanFeature.MFA),
    ).rejects.toThrow(
      'El periodo de facturación de la organización no está vigente.',
    );
  });
});

describe('atomic plan quotas', () => {
  it('locks and counts users only inside the JWT tenant', async () => {
    const client = quotaClient();
    client.user.count.mockResolvedValue(2);

    await assertPlanQuotaInTransaction(client as never, 'tenant-a', 'users');

    expect(client.user.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
    });
    const query = client.$queryRaw.mock.calls[0][0] as {
      sql?: string;
      values?: unknown[];
    };
    expect(query.sql).toContain('pg_advisory_xact_lock');
    expect(query.values).toContain('plan-quota:tenant-a:users');
  });

  it('denies a voter insert that would exceed maxVoters', async () => {
    const client = quotaClient();
    client.voter.count.mockResolvedValue(100);

    await expect(
      assertPlanQuotaInTransaction(client as never, 'tenant-a', 'voters'),
    ).rejects.toThrow('El plan actual alcanzó la cuota de votantes.');
    expect(client.voter.count).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
    });
  });

  it('reserves storage bytes against active durable and pending objects', async () => {
    const client = quotaClient();
    client.storedObject.aggregate.mockResolvedValue({
      _sum: { expectedSize: 49 * 1024 * 1024 },
    });

    await assertPlanQuotaInTransaction(
      client as never,
      'tenant-a',
      'storage',
      1024 * 1024,
    );

    expect(client.storedObject.aggregate).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
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
  });

  it('denies storage when requested bytes exceed maxStorageMb', async () => {
    const client = quotaClient();
    client.storedObject.aggregate.mockResolvedValue({
      _sum: { expectedSize: 50 * 1024 * 1024 },
    });

    await expect(
      assertPlanQuotaInTransaction(client as never, 'tenant-a', 'storage', 1),
    ).rejects.toThrow('El plan actual alcanzó la cuota de almacenamiento.');
  });

  it('rejects invalid increments before issuing a database lock', async () => {
    const client = quotaClient();

    await expect(
      assertPlanQuotaInTransaction(client as never, 'tenant-a', 'users', -1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('PlanLimitsGuard', () => {
  function executionContext(user?: {
    tenantId?: string;
    userId?: string;
  }): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('uses the authenticated tenant and never a request parameter', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(PlanFeature.EXPORT),
    };
    const planLimits = {
      assertFeature: jest.fn().mockResolvedValue(undefined),
    };
    const guard = new PlanLimitsGuard(
      reflector as unknown as Reflector,
      planLimits as unknown as PlanLimitsService,
      SAAS_ADMIN_IDENTITY,
    );

    await expect(
      guard.canActivate(executionContext({ tenantId: 'tenant-from-jwt' })),
    ).resolves.toBe(true);
    expect(planLimits.assertFeature).toHaveBeenCalledWith(
      'tenant-from-jwt',
      PlanFeature.EXPORT,
    );
  });

  it('fails closed when a protected route has no authenticated tenant', async () => {
    const guard = new PlanLimitsGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(PlanFeature.MFA),
      } as unknown as Reflector,
      { assertFeature: jest.fn() } as unknown as PlanLimitsService,
      SAAS_ADMIN_IDENTITY,
    );

    await expect(guard.canActivate(executionContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('does not query billing for routes without plan metadata', async () => {
    const planLimits = { assertFeature: jest.fn() };
    const guard = new PlanLimitsGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(undefined),
      } as unknown as Reflector,
      planLimits as unknown as PlanLimitsService,
      SAAS_ADMIN_IDENTITY,
    );

    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(planLimits.assertFeature).not.toHaveBeenCalled();
  });

  function reflectorFor(
    feature: PlanFeature,
    allowSaasAdminMfaEnrollment: boolean,
  ): Reflector {
    return {
      getAllAndOverride: jest.fn((metadataKey: string) => {
        if (metadataKey === PLAN_FEATURE_KEY) return feature;
        if (metadataKey === ALLOW_SAAS_ADMIN_MFA_ENROLLMENT_KEY) {
          return allowSaasAdminMfaEnrollment;
        }
        return undefined;
      }),
    } as unknown as Reflector;
  }

  it('permite exclusivamente el enrolamiento MFA de un ID SaaS inmutable allowlisted sin consultar el plan', async () => {
    const planLimits = {
      assertFeature: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('FREE no incluye MFA')),
    };
    const guard = new PlanLimitsGuard(
      reflectorFor(PlanFeature.MFA, true),
      planLimits as unknown as PlanLimitsService,
      SAAS_ADMIN_IDENTITY,
    );

    await expect(
      guard.canActivate(
        executionContext({
          tenantId: 'tenant-legacy-without-subscription',
          userId: ADMIN_USER_ID,
        }),
      ),
    ).resolves.toBe(true);
    expect(planLimits.assertFeature).not.toHaveBeenCalled();
  });

  it.each([
    [MEMBER_USER_ID, PlanFeature.MFA, true, 'ID no allowlisted'],
    [ADMIN_USER_ID, PlanFeature.MFA, false, 'ruta MFA ordinaria'],
    [ADMIN_USER_ID, PlanFeature.EXPORT, true, 'otra funcionalidad del plan'],
  ])(
    'no extiende el bypass a %s/%s/%s: %s',
    async (userId, feature, marked) => {
      const denial = new ForbiddenException('El plan no incluye la función.');
      const planLimits = {
        assertFeature: jest.fn().mockRejectedValue(denial),
      };
      const guard = new PlanLimitsGuard(
        reflectorFor(feature, marked),
        planLimits as unknown as PlanLimitsService,
        SAAS_ADMIN_IDENTITY,
      );

      await expect(
        guard.canActivate(
          executionContext({ tenantId: 'tenant-free', userId }),
        ),
      ).rejects.toBe(denial);
      expect(planLimits.assertFeature).toHaveBeenCalledWith(
        'tenant-free',
        feature,
      );
    },
  );

  it('sigue exigiendo el tenant autenticado incluso para el enrolamiento SaaS', async () => {
    const planLimits = { assertFeature: jest.fn() };
    const guard = new PlanLimitsGuard(
      reflectorFor(PlanFeature.MFA, true),
      planLimits as unknown as PlanLimitsService,
      SAAS_ADMIN_IDENTITY,
    );

    await expect(
      guard.canActivate(executionContext({ userId: ADMIN_USER_ID })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(planLimits.assertFeature).not.toHaveBeenCalled();
  });
});
