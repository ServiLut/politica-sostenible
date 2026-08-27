import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';
import {
  AuditActorType,
  PoliticalOperationMode,
  TenantType,
} from '../../prisma/generated/prisma';

describe('FinanceService tenant-safe exports', () => {
  it('queries only the JWT tenant and neutralizes malicious CSV cells', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        date: new Date('2026-08-21T00:00:00.000Z'),
        description: '=HYPERLINK("https://evil.invalid")',
        amount: 125000,
        vendorName: 'ACME",\r\n=WEBSERVICE("https://evil.invalid")',
        vendorTaxId: '+900123456',
        cneCode: 'OTROS',
        reporter: { name: '@SUM(1,1)' },
      },
    ]);
    const service = new FinanceService({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      financialEntry: { findMany },
    } as unknown as PrismaService);

    const csv = await service.generateCneReport('tenant-from-jwt');

    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-from-jwt', type: 'EXPENSE' },
      include: { reporter: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).not.toContain('\r');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+900123456");
    expect(csv).toContain("'@SUM(1,1)");
    expect(csv).toContain('ACME""');
  });

  it('rejects a finance object path owned by another tenant before writing', async () => {
    const create = jest.fn();
    const service = new FinanceService({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      financialEntry: { create },
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-from-jwt', 'user-from-jwt', {
        type: 'INCOME',
        amount: 1000,
        date: '2026-08-21T00:00:00.000Z',
        cneCode: 'OTROS',
        description: 'Aporte',
        vendorName: 'Aportante',
        vendorTaxId: '900123456',
        evidenceUrl:
          'tenant-attacker/finance/123e4567-e89b-42d3-a456-426614174000-soporte.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a canonical finance path without a durable upload receipt', async () => {
    const create = jest.fn();
    const receiptFindFirst = jest.fn().mockResolvedValue(null);
    const service = new FinanceService({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      auditEvent: { findFirst: receiptFindFirst },
      financialEntry: { create },
    } as unknown as PrismaService);
    const path =
      'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000-soporte.pdf';

    await expect(
      service.create('tenant-a', 'user-a', {
        type: 'INCOME',
        amount: 1000,
        date: '2026-08-21T00:00:00.000Z',
        cneCode: 'OTROS',
        description: 'Aporte',
        vendorName: 'Aportante',
        vendorTaxId: '900123456',
        evidenceUrl: path,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(receiptFindFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        action: 'STORAGE_UPLOAD_CONFIRMED',
        resourceType: 'StorageObject',
        resourceId: path,
        outcome: 'SUCCESS',
      },
      select: { id: true },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('blocks every finance operation when the active mode is public office', async () => {
    const create = jest.fn();
    const findMany = jest.fn();
    const aggregate = jest.fn();
    const service = new FinanceService({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.PUBLIC_OFFICE,
        }),
      },
      financialEntry: { create, findMany, aggregate },
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'user-a', {
        type: 'INCOME',
        amount: 1000,
        date: '2026-08-21T00:00:00.000Z',
        cneCode: 'OTROS',
        description: 'Aporte',
        vendorName: 'Aportante',
        vendorTaxId: '900123456',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.findAll('tenant-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getSummary('tenant-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.validateExpense('tenant-a', { vendorName: 'Proveedor' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.generateCneReport('tenant-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(create).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('returns safe finance views with a boolean instead of the private evidence path', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'entry-with-evidence',
        type: 'EXPENSE',
        amount: 100,
        date: new Date('2026-08-21T00:00:00.000Z'),
        cneCode: 'OTROS',
        description: 'Transporte',
        vendorName: 'Proveedor',
        vendorTaxId: '900123456',
        status: 'PENDING',
        createdAt: new Date('2026-08-21T00:00:00.000Z'),
        evidenceUrl:
          'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000-soporte.pdf',
      },
      {
        id: 'entry-without-evidence',
        type: 'INCOME',
        amount: 200,
        date: new Date('2026-08-21T00:00:00.000Z'),
        cneCode: 'OTROS',
        description: 'Aporte',
        vendorName: 'Aportante',
        vendorTaxId: '900123457',
        status: 'PENDING',
        createdAt: new Date('2026-08-21T00:00:00.000Z'),
        evidenceUrl: null,
      },
    ]);
    const create = jest.fn().mockResolvedValue({
      id: 'created-entry',
      type: 'INCOME',
      amount: 300,
      date: new Date('2026-08-21T00:00:00.000Z'),
      cneCode: 'OTROS',
      description: 'Aporte',
      vendorName: 'Aportante',
      vendorTaxId: '900123458',
      status: 'PENDING',
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      evidenceUrl:
        'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000-soporte.pdf',
    });
    const receiptFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 'upload-receipt-a' });
    const service = new FinanceService({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      auditEvent: { findFirst: receiptFindFirst },
      financialEntry: { findMany, create },
    } as unknown as PrismaService);

    const listed = await service.findAll('tenant-a');
    const created = await service.create('tenant-a', 'user-a', {
      type: 'INCOME',
      amount: 300,
      date: '2026-08-21T00:00:00.000Z',
      cneCode: 'OTROS',
      description: 'Aporte',
      vendorName: 'Aportante',
      vendorTaxId: '900123458',
      evidenceUrl:
        'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000-soporte.pdf',
    });

    expect(listed.map((entry) => entry.hasEvidence)).toEqual([true, false]);
    expect(created.hasEvidence).toBe(true);
    expect(listed[0]).not.toHaveProperty('evidenceUrl');
    expect(created).not.toHaveProperty('evidenceUrl');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          tenantId: true,
          auditLog: true,
        }) as object,
      }),
    );
  });

  it('atomically upserts tenant settings and records an audit event', async () => {
    const settings = {
      id: 'settings-a',
      maxTotalBudget: 1_000_000,
      maxPublicityLimit: 250_000,
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      updatedAt: new Date('2026-08-21T00:00:00.000Z'),
    };
    const transaction = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-a' }) },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({
          ...settings,
          maxTotalBudget: 900_000,
          maxPublicityLimit: 200_000,
        }),
        upsert: jest.fn().mockResolvedValue(settings),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const runTransaction = jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const service = new FinanceService({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    const result = await service.updateSettings('tenant-a', 'manager-a', {
      maxTotalBudget: 1_000_000,
      maxPublicityLimit: 250_000,
    });

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'manager-a', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(transaction.campaignSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a' },
        update: {
          maxTotalBudget: 1_000_000,
          maxPublicityLimit: 250_000,
        },
        create: {
          tenantId: 'tenant-a',
          maxTotalBudget: 1_000_000,
          maxPublicityLimit: 250_000,
        },
      }),
    );
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: 'manager-a',
        action: 'CAMPAIGN_FINANCE_SETTINGS_UPSERTED',
        resourceType: 'CampaignSettings',
        resourceId: 'settings-a',
        before: {
          maxTotalBudget: '900000',
          maxPublicityLimit: '200000',
        },
        after: {
          maxTotalBudget: '1000000',
          maxPublicityLimit: '250000',
        },
      },
    });
    expect(result).toBe(settings);
  });

  it('rejects a cross-tenant settings actor before upsert or audit', async () => {
    const upsert = jest.fn();
    const auditCreate = jest.fn();
    const transaction = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      campaignSettings: { findUnique: jest.fn(), upsert },
      auditEvent: { create: auditCreate },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.updateSettings('tenant-a', 'user-from-tenant-b', {
        maxTotalBudget: 1_000_000,
        maxPublicityLimit: 250_000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-from-tenant-b', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('blocks settings changes outside campaign mode', async () => {
    const upsert = jest.fn();
    const transaction = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.PUBLIC_OFFICE,
        }),
      },
      user: { findFirst: jest.fn() },
      campaignSettings: { findUnique: jest.fn(), upsert },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.updateSettings('tenant-office', 'manager-a', {
        maxTotalBudget: 1_000_000,
        maxPublicityLimit: 250_000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });
});
