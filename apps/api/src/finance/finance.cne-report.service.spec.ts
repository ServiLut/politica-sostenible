import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AuditActorType,
  FinanceReportScope,
  FinanceStatus,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';

const baseEntry = {
  id: 'entry-a',
  type: 'EXPENSE',
  amount: 250000,
  date: new Date('2026-09-01T12:00:00.000Z'),
  cneCode: 'TRANSPORTE',
  description: 'Transporte territorial',
  vendorName: 'Proveedor verificado',
  vendorTaxId: '900123456',
  status: FinanceStatus.APPROVED,
  createdAt: new Date('2026-09-01T12:00:00.000Z'),
  reviewedAt: new Date('2026-09-02T12:00:00.000Z'),
  cneReportedAt: null,
  cneReportReference: null,
  cneReportEvidenceUrl: null,
  evidenceUrl: 'tenant-a/finance/evidence.pdf',
  reporterId: 'reporter-a',
};

const cneEvidencePath =
  'tenant-a/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf';

const reportDto = {
  externalReference: 'CC-2026/004219',
  cneReportEvidenceUrl: cneEvidencePath,
};

function campaignTenant() {
  return {
    defaultMode: PoliticalOperationMode.CAMPAIGN,
    type: TenantType.CANDIDACY,
  };
}

function openLifecycleQuery() {
  return jest.fn((query: { sql: string }) =>
    Promise.resolve(
      query.sql.includes('FROM "OperationProfile"')
        ? [{ stage: PoliticalOperationStage.CAMPAIGN }]
        : [{ locked: true }],
    ),
  );
}

const completeSettings = (overrides: Record<string, unknown> = {}) => ({
  id: 'settings-a',
  maxTotalBudget: new Prisma.Decimal('1000000'),
  maxPublicityLimit: new Prisma.Decimal('250000'),
  electionName: 'Elecciones territoriales 2027',
  electionDate: new Date('2027-10-31T00:00:00.000Z'),
  reportScope: FinanceReportScope.CANDIDATE,
  officialLimitsReference: 'Resolución CNE 0001 de 2027',
  officialLimitsUrl: 'https://www.cne.gov.co/resoluciones/0001',
  reportDeadline: new Date('2027-11-30T00:00:00.000Z'),
  financialManagerName: 'Gerencia financiera',
  financialManagerDocument: '1234567890',
  accountantName: 'Contador responsable',
  accountantDocument: '9876543210',
  uniqueAccountBank: 'Banco autorizado',
  uniqueAccountLastFour: '1234',
  cuentasClarasCode: 'CC-CANDIDATO-001',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  ...overrides,
});

describe('FinanceService external CNE reporting', () => {
  it('atomically marks an approved tenant entry and audits the external reference', async () => {
    const updated = {
      ...baseEntry,
      status: FinanceStatus.REPORTED_CNE,
      cneReportedAt: new Date('2026-09-04T15:00:00.000Z'),
      cneReportReference: 'CC-2026/004219',
      cneReportEvidenceUrl: cneEvidencePath,
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(baseEntry)
      .mockResolvedValueOnce(updated);
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant()) },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'finance-a', role: Role.FINANCE_MANAGER }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(completeSettings()),
      },
      financialEntry: {
        findFirst,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      storedObject: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    const result = await service.markReportedToCne(
      'tenant-a',
      'finance-a',
      'entry-a',
      reportDto,
    );

    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'finance-a', tenantId: 'tenant-a', isActive: true },
      select: { id: true, role: true },
    });
    expect(transaction.financialEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'entry-a',
        tenantId: 'tenant-a',
        status: FinanceStatus.APPROVED,
      },
      data: expect.objectContaining({
        status: FinanceStatus.REPORTED_CNE,
        cneReportedById: 'finance-a',
        cneReportedAt: expect.any(Date),
        cneReportReference: 'CC-2026/004219',
        cneReportEvidenceUrl: cneEvidencePath,
      }),
    });
    expect(transaction.storedObject.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        path: cneEvidencePath,
        uploaderId: 'finance-a',
        consumedAt: null,
      }),
      data: expect.objectContaining({
        consumedByType: 'FinancialEntryCneReportEvidence',
        consumedById: 'entry-a',
      }),
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: 'finance-a',
        action: 'CAMPAIGN_FINANCIAL_ENTRY_CNE_REPORTED',
        resourceType: 'FinancialEntry',
        resourceId: 'entry-a',
        before: { status: FinanceStatus.APPROVED },
        metadata: {
          externalReference: 'CC-2026/004219',
          evidenceType: 'USER_DECLARED_EXTERNAL_FILING',
          hasCneReportEvidence: true,
          platformVerified: false,
        },
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'entry-a',
        status: FinanceStatus.REPORTED_CNE,
        cneReportReference: 'CC-2026/004219',
      }),
    );
    expect(result).not.toHaveProperty('evidenceUrl');
    expect(result).not.toHaveProperty('cneReportEvidenceUrl');
    expect(result).toHaveProperty('hasCneReportEvidence', true);
    expect(
      JSON.stringify(transaction.auditEvent.create.mock.calls),
    ).not.toContain(cneEvidencePath);
  });

  it('rolls back the transition contract when the private receipt is not confirmed', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant()) },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'finance-a', role: Role.FINANCE_MANAGER }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(completeSettings()),
      },
      financialEntry: {
        findFirst: jest.fn().mockResolvedValue(baseEntry),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      storedObject: {
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
      service.markReportedToCne('tenant-a', 'finance-a', 'entry-a', reportDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.storedObject.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a receipt path owned by another tenant before opening a transaction', async () => {
    const runTransaction = jest.fn();
    const service = new FinanceService({
      $transaction: runTransaction,
    } as unknown as PrismaService);

    await expect(
      service.markReportedToCne('tenant-a', 'finance-a', 'entry-a', {
        ...reportDto,
        cneReportEvidenceUrl:
          'tenant-b/finance/7c8f80d8-66c5-4f3a-9745-b66219c13f74.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('rejects a non-approved state without writing or auditing', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant()) },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'finance-a', role: Role.FINANCE_MANAGER }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(completeSettings()),
      },
      financialEntry: {
        findFirst: jest.fn().mockResolvedValue({
          ...baseEntry,
          status: FinanceStatus.PENDING,
        }),
        updateMany: jest.fn(),
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
      service.markReportedToCne('tenant-a', 'finance-a', 'entry-a', reportDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.financialEntry.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a repeated confirmation instead of overwriting evidence', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant()) },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'admin-a', role: Role.ADMIN }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(completeSettings()),
      },
      financialEntry: {
        findFirst: jest.fn().mockResolvedValue({
          ...baseEntry,
          status: FinanceStatus.REPORTED_CNE,
        }),
        updateMany: jest.fn(),
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
      service.markReportedToCne('tenant-a', 'admin-a', 'entry-a', reportDto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.financialEntry.updateMany).not.toHaveBeenCalled();
  });

  it('blocks an external filing transition while the legacy compliance file is incomplete', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant()) },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'finance-a', role: Role.FINANCE_MANAGER }),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue(
          completeSettings({
            accountantName: null,
            accountantDocument: null,
          }),
        ),
      },
      financialEntry: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
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
      service.markReportedToCne('tenant-a', 'finance-a', 'entry-a', reportDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.campaignSettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
    expect(transaction.financialEntry.findFirst).not.toHaveBeenCalled();
    expect(transaction.financialEntry.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('revalidates the persisted actor role before reading the entry', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant()) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'volunteer-a',
          role: Role.VOLUNTEER,
        }),
      },
      financialEntry: { findFirst: jest.fn(), updateMany: jest.fn() },
      auditEvent: { create: jest.fn() },
    };
    const service = new FinanceService({
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await expect(
      service.markReportedToCne(
        'tenant-a',
        'volunteer-a',
        'entry-a',
        reportDto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.financialEntry.findFirst).not.toHaveBeenCalled();
  });
});
