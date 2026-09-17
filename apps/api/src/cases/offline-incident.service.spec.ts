import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  OfflineSyncOperationType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  TenantType,
  WorkPriority,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { OfflineSyncService } from '../common/services/offline-sync.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  OfflineIncidentCategory,
  type SyncOfflineIncidentDto,
} from './dto/sync-offline-incident.dto';
import { offlineIncidentSha256 } from './offline-incident.hash';
import { OfflineIncidentService } from './offline-incident.service';

const user: AuthenticatedUser = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  role: Role.ADMIN,
};

function buildDto(): SyncOfflineIncidentDto {
  const input = {
    clientOperationId: '48d8333a-6c32-45ea-b3de-2eb8a4789389',
    capturedAt: '2026-09-09T14:30:00.000Z',
    category: OfflineIncidentCategory.LOGISTICS,
    priority: WorkPriority.HIGH,
    title: 'Falta material operativo',
    description: 'El punto reporta faltante del insumo operativo previsto.',
    occurredOn: '2026-09-09',
  };
  return { ...input, payloadSha256: offlineIncidentSha256(input) };
}

function setup(duplicate: Record<string, unknown> | null = null) {
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.CANDIDACY,
      }),
    },
    operationProfile: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ stage: PoliticalOperationStage.CAMPAIGN }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        role: Role.ADMIN,
        divisionId: null,
      }),
    },
    politicalDivision: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    issueCase: { create: jest.fn().mockResolvedValue({ id: 'case-1' }) },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    offlineSyncReceipt: {},
  };
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      Promise.resolve(callback(transaction)),
    ),
  };
  const descriptor = {
    clientOperationId: buildDto().clientOperationId,
    operationType: OfflineSyncOperationType.INCIDENT_REPORT,
    payloadHmac: 'b'.repeat(64),
    capturedAt: new Date(buildDto().capturedAt),
  };
  const receipt = {
    id: 'receipt-1',
    tenantId: user.tenantId,
    actorUserId: user.userId,
    clientOperationId: descriptor.clientOperationId,
    operationType: descriptor.operationType,
    payloadHmac: descriptor.payloadHmac,
    capturedAt: descriptor.capturedAt,
    receivedAt: new Date('2026-09-09T15:00:00.000Z'),
  };
  const offlineSync = {
    prepare: jest.fn().mockReturnValue(descriptor),
    lockAndFindDuplicate: jest.fn().mockResolvedValue(duplicate),
    createReceipt: jest.fn().mockResolvedValue(receipt),
    present: jest.fn(
      (value: typeof receipt, status: 'APPLIED' | 'DUPLICATE') => ({
        received: true,
        receiptId: value.id,
        clientOperationId: value.clientOperationId,
        operationType: value.operationType,
        status,
        capturedAt: value.capturedAt.toISOString(),
        receivedAt: value.receivedAt.toISOString(),
      }),
    ),
  };
  return {
    transaction,
    prisma,
    offlineSync,
    service: new OfflineIncidentService(
      prisma as unknown as PrismaService,
      offlineSync as unknown as OfflineSyncService,
    ),
    receipt,
  };
}

describe('OfflineIncidentService', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T16:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it('crea caso, auditoría y recibo en una transacción serializable', async () => {
    const fixture = setup();
    await expect(fixture.service.sync(user, buildDto())).resolves.toMatchObject(
      {
        status: 'APPLIED',
        payloadSha256: buildDto().payloadSha256,
      },
    );
    expect(fixture.transaction.issueCase.create).toHaveBeenCalledTimes(1);
    expect(fixture.transaction.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(fixture.offlineSync.createReceipt).toHaveBeenCalledWith(
      fixture.transaction,
      user.tenantId,
      user.userId,
      expect.any(Object),
      'IssueCase',
      expect.any(String),
      expect.any(Date),
      buildDto().payloadSha256,
    );
    expect(fixture.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });

  it('reproduce un recibo idéntico sin crear otro caso', async () => {
    const base = setup();
    const fixture = setup(base.receipt);
    await expect(fixture.service.sync(user, buildDto())).resolves.toMatchObject(
      {
        status: 'DUPLICATE',
      },
    );
    expect(fixture.transaction.issueCase.create).not.toHaveBeenCalled();
    expect(fixture.transaction.auditEvent.create).not.toHaveBeenCalled();
    expect(fixture.offlineSync.createReceipt).not.toHaveBeenCalled();
  });

  it('rechaza SHA distinto antes de abrir una transacción', () => {
    const fixture = setup();
    expect(() =>
      fixture.service.sync(user, {
        ...buildDto(),
        payloadSha256: 'c'.repeat(64),
      }),
    ).toThrow(BadRequestException);
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('falla cerrado si el perfil quedó CLOSED dentro de la transacción', async () => {
    const fixture = setup();
    fixture.transaction.operationProfile.findUnique.mockResolvedValue({
      stage: PoliticalOperationStage.CLOSED,
    });
    await expect(fixture.service.sync(user, buildDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(fixture.transaction.issueCase.create).not.toHaveBeenCalled();
  });
});
