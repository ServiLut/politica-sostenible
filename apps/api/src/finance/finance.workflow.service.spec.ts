import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  CneCode,
  EntryType,
  FinanceStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';

const CAMPAIGN_TENANT = {
  defaultMode: PoliticalOperationMode.CAMPAIGN,
  type: TenantType.CANDIDACY,
};

const createDto = (amount = 100) => ({
  type: EntryType.EXPENSE,
  amount,
  date: '2026-08-27T00:00:00.000Z',
  cneCode: CneCode.OTROS,
  description: 'Transporte territorial',
  vendorName: 'Proveedor sensible',
  vendorTaxId: '900123456',
});

const entryViewSource = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-a',
  type: EntryType.EXPENSE,
  amount: new Prisma.Decimal('100'),
  date: new Date('2026-08-27T00:00:00.000Z'),
  cneCode: CneCode.OTROS,
  description: 'Transporte territorial',
  vendorName: 'Proveedor sensible',
  vendorTaxId: '900123456',
  status: FinanceStatus.PENDING,
  createdAt: new Date('2026-08-27T00:00:00.000Z'),
  reviewedAt: null,
  evidenceUrl: null,
  reporterId: 'reporter-a',
  ...overrides,
});

describe('FinanceService controlled workflow', () => {
  it('checks an exact Decimal budget and atomically creates a scoped entry and PII-free audit', async () => {
    const financialCreate = jest
      .fn()
      .mockImplementation(({ data }: { data: { amount: Prisma.Decimal } }) =>
        entryViewSource({ amount: data.amount }),
      );
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-a' });
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(CAMPAIGN_TENANT) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'reporter-a' }) },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({
          maxTotalBudget: new Prisma.Decimal('0.30'),
          maxPublicityLimit: new Prisma.Decimal('0.30'),
        }),
      },
      financialEntry: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: new Prisma.Decimal('0.20') },
        }),
        create: financialCreate,
      },
      auditEvent: { create: auditCreate },
    };
    const runTransaction = jest.fn(
      async (
        callback: (client: typeof transaction) => Promise<unknown>,
        _options?: unknown,
      ) => callback(transaction),
    );
    const service = new FinanceService({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    const result = await service.create(
      'tenant-a',
      'reporter-a',
      createDto(0.1),
    );

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'reporter-a', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(transaction.financialEntry.aggregate).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        type: EntryType.EXPENSE,
        status: { not: FinanceStatus.REJECTED },
      },
      _sum: { amount: true },
    });
    const createArgs = financialCreate.mock.calls[0][0] as {
      data: { amount: Prisma.Decimal; tenantId: string; reporterId: string };
    };
    expect(createArgs.data.amount).toBeInstanceOf(Prisma.Decimal);
    expect(createArgs.data.amount.equals('0.1')).toBe(true);
    expect(createArgs.data).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-a',
        reporterId: 'reporter-a',
      }),
    );
    const auditData = (auditCreate.mock.calls[0][0] as { data: object }).data;
    expect(auditData).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: 'reporter-a',
        action: 'CAMPAIGN_FINANCIAL_ENTRY_CREATED',
        resourceType: 'FinancialEntry',
        resourceId: 'entry-a',
      }),
    );
    expect(JSON.stringify(auditData)).not.toContain('Proveedor sensible');
    expect(JSON.stringify(auditData)).not.toContain('900123456');
    expect(result).toEqual(
      expect.objectContaining({ hasEvidence: false, reportedByMe: true }),
    );
    expect(result).not.toHaveProperty('evidenceUrl');
    expect(result).not.toHaveProperty('reporterId');
    expect(result).not.toHaveProperty('reviewReason');
    expect(result).not.toHaveProperty('reviewedById');
  });

  it('rejects an expense above the non-rejected tenant total before writing', async () => {
    const financialCreate = jest.fn();
    const auditCreate = jest.fn();
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(CAMPAIGN_TENANT) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'reporter-a' }) },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({
          maxTotalBudget: new Prisma.Decimal('100.00'),
          maxPublicityLimit: new Prisma.Decimal('100.00'),
        }),
      },
      financialEntry: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: new Prisma.Decimal('99.99') },
        }),
        create: financialCreate,
      },
      auditEvent: { create: auditCreate },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'reporter-a', createDto(0.02)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(financialCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('maps a serializable create conflict to HTTP 409', async () => {
    const service = new FinanceService({
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'reporter-a', createDto()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('excludes rejected entries from summary totals using tenant-scoped filters', async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValueOnce({
        _sum: { amount: new Prisma.Decimal('125.25') },
      })
      .mockResolvedValueOnce({
        _sum: { amount: new Prisma.Decimal('200.50') },
      });
    const service = new FinanceService({
      tenant: { findUnique: jest.fn().mockResolvedValue(CAMPAIGN_TENANT) },
      financialEntry: { aggregate },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({
          maxTotalBudget: new Prisma.Decimal('500.00'),
          maxPublicityLimit: new Prisma.Decimal('100.00'),
        }),
      },
    } as unknown as PrismaService);

    const summary = await service.getSummary('tenant-a');

    expect(aggregate).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: 'tenant-a',
        type: EntryType.EXPENSE,
        status: { not: FinanceStatus.REJECTED },
      },
      _sum: { amount: true },
    });
    expect(aggregate).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: 'tenant-a',
        type: EntryType.INCOME,
        status: { not: FinanceStatus.REJECTED },
      },
      _sum: { amount: true },
    });
    expect(summary).toEqual({
      totalExpenses: 125.25,
      totalIncome: 200.5,
      balance: 75.25,
      limitsConfigured: true,
      maxTotalBudget: 500,
      maxPublicityLimit: 100,
      remainingBudget: 374.75,
    });
  });

  it('exports only approved or CNE-reported expenses and keeps CSV neutralization', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        date: new Date('2026-08-27T00:00:00.000Z'),
        description: '=HYPERLINK("https://evil.invalid")',
        amount: new Prisma.Decimal('125000.50'),
        vendorName: 'ACME",\r\n=WEBSERVICE("https://evil.invalid")',
        vendorTaxId: '+900123456',
        cneCode: CneCode.OTROS,
        reporter: { name: '@SUM(1,1)' },
      },
    ]);
    const service = new FinanceService({
      tenant: { findUnique: jest.fn().mockResolvedValue(CAMPAIGN_TENANT) },
      financialEntry: { findMany },
    } as unknown as PrismaService);

    const csv = await service.generateCneReport('tenant-a');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        type: EntryType.EXPENSE,
        status: {
          in: [FinanceStatus.APPROVED, FinanceStatus.REPORTED_CNE],
        },
      },
      select: {
        date: true,
        description: true,
        amount: true,
        vendorName: true,
        vendorTaxId: true,
        cneCode: true,
        reporter: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    });
    expect(csv).not.toContain('\r');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+900123456");
    expect(csv).toContain("'@SUM(1,1)");
  });

  it('rejects lowering either setting below current non-rejected expenses', async () => {
    const upsert = jest.fn();
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(CAMPAIGN_TENANT) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-a' }) },
      financialEntry: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({
            _sum: { amount: new Prisma.Decimal('800.01') },
          })
          .mockResolvedValueOnce({
            _sum: { amount: new Prisma.Decimal('200.01') },
          }),
      },
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
      service.updateSettings('tenant-a', 'manager-a', {
        maxTotalBudget: 800,
        maxPublicityLimit: 200,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('maps a serializable settings conflict to HTTP 409', async () => {
    const service = new FinanceService({
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    } as unknown as PrismaService);

    await expect(
      service.updateSettings('tenant-a', 'manager-a', {
        maxTotalBudget: 1000,
        maxPublicityLimit: 500,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('approves a pending entry with four eyes, an optimistic update and a PII-free audit', async () => {
    const existing = entryViewSource({
      reporterId: 'reporter-a',
      evidenceUrl: 'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000.pdf',
    });
    const updated = entryViewSource({
      status: FinanceStatus.APPROVED,
      reviewedAt: new Date('2026-08-27T12:00:00.000Z'),
      reviewReason: 'Documento verificado exhaustivamente',
      reviewedById: 'reviewer-a',
      evidenceUrl: 'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000.pdf',
    });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-review' });
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(CAMPAIGN_TENANT) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'reviewer-a',
          role: Role.COMPLIANCE_OFFICER,
        }),
      },
      financialEntry: { findFirst, updateMany },
      auditEvent: { create: auditCreate },
    };
    const runTransaction = jest.fn(
      async (
        callback: (client: typeof transaction) => Promise<unknown>,
        _options?: unknown,
      ) => callback(transaction),
    );
    const service = new FinanceService({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    const result = await service.review('tenant-a', 'reviewer-a', 'entry-a', {
      status: FinanceStatus.APPROVED,
      reviewReason: 'Documento verificado exhaustivamente',
    });

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'entry-a', tenantId: 'tenant-a' },
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'entry-a',
        tenantId: 'tenant-a',
        status: FinanceStatus.PENDING,
        reporterId: { not: 'reviewer-a' },
      },
      data: {
        status: FinanceStatus.APPROVED,
        reviewedById: 'reviewer-a',
        reviewedAt: expect.any(Date),
        reviewReason: 'Documento verificado exhaustivamente',
      },
    });
    const auditData = (auditCreate.mock.calls[0][0] as { data: object }).data;
    expect(auditData).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-a',
        actorUserId: 'reviewer-a',
        action: 'CAMPAIGN_FINANCIAL_ENTRY_REVIEWED',
        metadata: { decision: FinanceStatus.APPROVED },
      }),
    );
    expect(JSON.stringify(auditData)).not.toContain(
      'Documento verificado exhaustivamente',
    );
    expect(result).not.toHaveProperty('reviewReason');
    expect(result).not.toHaveProperty('reviewedById');
    expect(result).not.toHaveProperty('reporterId');
    expect(result).not.toHaveProperty('evidenceUrl');
  });

  it('rejects approval when the movement has no verified evidence', async () => {
    const updateMany = jest.fn();
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(CAMPAIGN_TENANT) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'reviewer-a',
          role: Role.COMPLIANCE_OFFICER,
        }),
      },
      financialEntry: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            entryViewSource({ reporterId: 'reporter-a', evidenceUrl: null }),
          ),
        updateMany,
      },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.review('tenant-a', 'reviewer-a', 'entry-a', {
        status: FinanceStatus.APPROVED,
        reviewReason: 'La clasificación fue revisada de forma independiente',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('forbids a reporter from reviewing their own pending entry', async () => {
    const updateMany = jest.fn();
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(CAMPAIGN_TENANT) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'reporter-a',
          role: Role.ADMIN,
        }),
      },
      financialEntry: {
        findFirst: jest.fn().mockResolvedValue(
          entryViewSource({
            reporterId: 'reporter-a',
            evidenceUrl:
              'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000.pdf',
          }),
        ),
        updateMany,
      },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.review('tenant-a', 'reporter-a', 'entry-a', {
        status: FinanceStatus.REJECTED,
        reviewReason: 'El soporte no cumple los requisitos',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not find or mutate an entry from another tenant', async () => {
    const updateMany = jest.fn();
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(CAMPAIGN_TENANT) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'reviewer-a',
          role: Role.FINANCE_MANAGER,
        }),
      },
      financialEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany,
      },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.review('tenant-a', 'reviewer-a', 'entry-from-tenant-b', {
        status: FinanceStatus.REJECTED,
        reviewReason: 'No corresponde a la campaña autenticada',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.financialEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-from-tenant-b', tenantId: 'tenant-a' },
      }),
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns a conflict when another reviewer wins the optimistic transition', async () => {
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(CAMPAIGN_TENANT) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'reviewer-a',
          role: Role.ADMIN,
        }),
      },
      financialEntry: {
        findFirst: jest.fn().mockResolvedValue(
          entryViewSource({
            reporterId: 'reporter-a',
            evidenceUrl:
              'tenant-a/finance/123e4567-e89b-42d3-a456-426614174000.pdf',
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.review('tenant-a', 'reviewer-a', 'entry-a', {
        status: FinanceStatus.APPROVED,
        reviewReason: 'Revisión independiente completada',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('maps a serializable review conflict to HTTP 409', async () => {
    const service = new FinanceService({
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    } as unknown as PrismaService);

    await expect(
      service.review('tenant-a', 'reviewer-a', 'entry-a', {
        status: FinanceStatus.APPROVED,
        reviewReason: 'Revisión independiente completada',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
