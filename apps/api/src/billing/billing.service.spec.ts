import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  StoredObjectStatus,
  SubscriptionStatus,
} from '../../prisma/generated/prisma';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

const freePlan = {
  id: 'plan-free',
  code: 'FREE',
  name: 'Gratis',
  maxUsers: 3,
  maxVoters: 100,
  maxStorageMb: 50,
  isActive: true,
};

function existingSubscription(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'subscription-a',
    tenantId: 'tenant-a',
    status: SubscriptionStatus.ACTIVE,
    trialEndsAt: null,
    currentPeriodStart: new Date(Date.now() - 60_000),
    currentPeriodEnd: new Date(Date.now() + 60_000),
    plan: freePlan,
    ...overrides,
  };
}

describe('BillingService', () => {
  it('completa el catálogo manual sin sobrescribir contratos existentes', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 4 });
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { code: 'FREE' },
        { code: 'STARTER' },
        { code: 'PROFESSIONAL' },
        { code: 'ENTERPRISE' },
      ]);
    const service = new BillingService({
      subscriptionPlan: { createMany, findMany },
    } as unknown as PrismaService);

    await service.seedDefaultPlans();

    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          code: 'FREE',
          isActive: true,
          maxUsers: 3,
          includesApi: false,
        }),
      ]),
      skipDuplicates: true,
    });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('incluye todos los planes en una migración de datos idempotente', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/20260907150000_seed_subscription_plans/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('INSERT INTO "SubscriptionPlan"');
    for (const code of ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']) {
      expect(migration).toContain(`'${code}'`);
    }
    expect(migration).toContain('ON CONFLICT DO NOTHING');
    expect(migration).not.toContain('DO UPDATE');
    expect(migration).not.toContain('INSERT INTO "TenantSubscription"');
    expect(migration).not.toContain("'Sin límites'");
  });

  it('falla de forma explícita si las migraciones no configuraron FREE', async () => {
    const create = jest.fn();
    const service = new BillingService({
      tenantSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
      subscriptionPlan: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService);

    await expect(service.getCurrentSubscription('tenant-a')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('resuelve la carrera entre suscripción y uso devolviendo el único registro del tenant', async () => {
    let persistedSubscription: Record<string, unknown> | null = null;
    let createAttempts = 0;
    let releaseCreates = () => undefined;
    const bothCreatesStarted = new Promise<void>((resolve) => {
      releaseCreates = resolve;
    });

    const findUnique = jest.fn(({ where }: { where: { tenantId: string } }) => {
      expect(where).toEqual({ tenantId: 'tenant-a' });
      return Promise.resolve(persistedSubscription);
    });
    const create = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => {
        createAttempts += 1;
        if (createAttempts === 2) releaseCreates();
        await bothCreatesStarted;

        if (persistedSubscription) {
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
          });
        }

        persistedSubscription = {
          id: 'subscription-a',
          ...data,
          plan: freePlan,
        };
        return persistedSubscription;
      },
    );
    const prisma = {
      tenantSubscription: { findUnique, create },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue(freePlan),
      },
      user: { count: jest.fn().mockResolvedValue(2) },
      voter: { count: jest.fn().mockResolvedValue(25) },
      storedObject: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { expectedSize: 2 * 1024 * 1024 },
        }),
      },
    };
    const service = new BillingService(prisma as unknown as PrismaService);

    const [subscription, usage] = await Promise.all([
      service.getCurrentSubscription('tenant-a'),
      service.getUsage('tenant-a'),
    ]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(
      create.mock.calls.every(
        ([call]) =>
          call.data.tenantId === 'tenant-a' && call.data.planId === freePlan.id,
      ),
    ).toBe(true);
    expect(subscription).toMatchObject({
      id: 'subscription-a',
      tenantId: 'tenant-a',
      plan: freePlan,
    });
    expect(usage).toEqual({
      limits: { users: 3, voters: 100, storageMb: 50 },
      current: { users: 2, voters: 25, storageMb: 2 },
    });
    expect(prisma.storedObject.aggregate).toHaveBeenCalledWith({
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

  it('falla cerrado si un P2002 no deja una suscripción concurrente verificable', async () => {
    const raceError = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });
    const service = new BillingService({
      tenantSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(raceError),
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue(freePlan),
      },
    } as unknown as PrismaService);

    await expect(
      service.getCurrentSubscription('tenant-a'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    SubscriptionStatus.CANCELLED,
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.PAST_DUE,
  ])(
    'no publica una suscripción con estado %s como vigente',
    async (status) => {
      const subscription = existingSubscription({ status });
      const service = new BillingService({
        tenantSubscription: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(subscription)
            .mockResolvedValueOnce(subscription),
        },
        subscriptionPlan: { findUnique: jest.fn() },
      } as unknown as PrismaService);

      await expect(
        service.getCurrentSubscription('tenant-a'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('no publica un periodo vencido ni consulta uso operativo', async () => {
    const subscription = existingSubscription({
      currentPeriodEnd: new Date(Date.now() - 60_000),
      plan: { ...freePlan, code: 'STARTER' },
    });
    const userCount = jest.fn();
    const voterCount = jest.fn();
    const aggregate = jest.fn();
    const service = new BillingService({
      tenantSubscription: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(subscription)
          .mockResolvedValueOnce(subscription),
      },
      subscriptionPlan: { findUnique: jest.fn() },
      user: { count: userCount },
      voter: { count: voterCount },
      storedObject: { aggregate },
    } as unknown as PrismaService);

    await expect(service.getUsage('tenant-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(userCount).not.toHaveBeenCalled();
    expect(voterCount).not.toHaveBeenCalled();
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('falla cerrado si el plan de la suscripción está inactivo', async () => {
    const subscription = existingSubscription({
      plan: { ...freePlan, isActive: false },
    });
    const service = new BillingService({
      tenantSubscription: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(subscription)
          .mockResolvedValueOnce(subscription),
      },
      subscriptionPlan: { findUnique: jest.fn() },
    } as unknown as PrismaService);

    await expect(
      service.getCurrentSubscription('tenant-a'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('renueva FREE vencido antes de publicar suscripción y cuotas', async () => {
    const expired = existingSubscription({
      currentPeriodEnd: new Date(Date.now() - 60_000),
    });
    const renewed = existingSubscription();
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new BillingService({
      tenantSubscription: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(expired)
          .mockResolvedValueOnce(renewed),
        updateMany,
      },
      subscriptionPlan: { findUnique: jest.fn() },
    } as unknown as PrismaService);

    await expect(service.getCurrentSubscription('tenant-a')).resolves.toEqual(
      renewed,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
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
});
