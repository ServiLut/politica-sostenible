import {
  AuditActorType,
  AuditOutcome,
  ConsentStatus,
  PoliticalOperationMode,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { RetentionService } from './retention.service';

const NOW = new Date('2026-09-07T12:00:00.000Z');
const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe('RetentionService tenant isolation', () => {
  let prisma: {
    tenant: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: RetentionService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = {
      tenant: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    service = new RetentionService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('queries only the requested tenant and skips one without a profile', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.CAMPAIGN,
      operationProfile: null,
    });

    await service.handleDataRetention('tenant-a');

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: {
        defaultMode: true,
        operationProfile: {
          select: { electionDate: true, retentionPeriodDays: true },
        },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not delete anything before electionDate plus the retention period', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.CAMPAIGN,
      operationProfile: {
        electionDate: new Date(NOW.getTime() - 30 * DAY_IN_MS + 1),
        retentionPeriodDays: 30,
      },
    });

    await service.handleDataRetention('tenant-a');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes only data from the requested tenant after its retention expires', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      operationProfile: {
        electionDate: new Date(NOW.getTime() - 31 * DAY_IN_MS),
        retentionPeriodDays: 30,
      },
    });
    const transaction = {
      consentRecord: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      interaction: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      voter: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-a' }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (
        callback: (currentTransaction: typeof transaction) => Promise<unknown>,
      ) => callback(transaction),
    );

    await service.handleDataRetention('tenant-a');

    expect(transaction.consentRecord.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      data: { status: ConsentStatus.EXPIRED },
    });
    expect(transaction.interaction.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
    });
    expect(transaction.consentRecord.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
    });
    expect(transaction.voter.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        actorType: AuditActorType.SYSTEM,
        action: 'DATA_RETENTION_EXECUTED',
        resourceType: 'Tenant',
        resourceId: 'tenant-a',
        outcome: AuditOutcome.SUCCESS,
        metadata: {
          deletedInteractions: 2,
          deletedConsentRecords: 1,
          deletedVoters: 3,
        },
      },
    });
  });
});
