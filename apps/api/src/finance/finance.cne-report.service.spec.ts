import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AuditActorType,
  FinanceStatus,
  PoliticalOperationMode,
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
  evidenceUrl: 'tenant-a/finance/evidence.pdf',
  reporterId: 'reporter-a',
};

function campaignTenant() {
  return {
    defaultMode: PoliticalOperationMode.CAMPAIGN,
    type: TenantType.CANDIDACY,
  };
}

describe('FinanceService external CNE reporting', () => {
  it('atomically marks an approved tenant entry and audits the external reference', async () => {
    const updated = {
      ...baseEntry,
      status: FinanceStatus.REPORTED_CNE,
      cneReportedAt: new Date('2026-09-04T15:00:00.000Z'),
      cneReportReference: 'CC-2026/004219',
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(baseEntry)
      .mockResolvedValueOnce(updated);
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant()) },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'finance-a', role: Role.FINANCE_MANAGER }),
      },
      financialEntry: {
        findFirst,
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
      { externalReference: 'CC-2026/004219' },
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
        metadata: { externalReference: 'CC-2026/004219' },
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
  });

  it('rejects a non-approved state without writing or auditing', async () => {
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant()) },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'finance-a', role: Role.FINANCE_MANAGER }),
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
      service.markReportedToCne('tenant-a', 'finance-a', 'entry-a', {
        externalReference: 'CC-2026/004219',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.financialEntry.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a repeated confirmation instead of overwriting evidence', async () => {
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant()) },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'admin-a', role: Role.ADMIN }),
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
      service.markReportedToCne('tenant-a', 'admin-a', 'entry-a', {
        externalReference: 'CC-2026/004219',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.financialEntry.updateMany).not.toHaveBeenCalled();
  });

  it('revalidates the persisted actor role before reading the entry', async () => {
    const transaction = {
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
      service.markReportedToCne('tenant-a', 'volunteer-a', 'entry-a', {
        externalReference: 'CC-2026/004219',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.financialEntry.findFirst).not.toHaveBeenCalled();
  });
});
