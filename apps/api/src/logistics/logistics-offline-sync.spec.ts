import { ConfigService } from '@nestjs/config';
import {
  ConsentCollectionChannel,
  ConsentPurpose,
  OfflineSyncOperationType,
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import { assertPlanQuotaInTransaction } from '../auth/guards/plan-limits.guard';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { OfflineSyncService } from '../common/services/offline-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { WitnessService } from '../witness/witness.service';
import { LogisticsService } from './logistics.service';

jest.mock('../auth/guards/plan-limits.guard', () => ({
  assertPlanQuotaInTransaction: jest.fn().mockResolvedValue(undefined),
  ensureTenantSubscription: jest.fn().mockResolvedValue(undefined),
}));

const input = {
  clientOperationId: '11111111-1111-4111-8111-111111111111',
  capturedAt: '2026-09-01T12:00:00.000Z',
  documentId: '1012345678',
  firstName: 'María',
  lastName: 'Pérez',
  phone: '3001234567',
  puestoId: 'puesto-a',
  mesa: 8,
  consentAccepted: true as const,
  termsVersion: '2026.1',
  collectionChannel: ConsentCollectionChannel.IN_PERSON,
};

describe('LogisticsService durable voter synchronization', () => {
  beforeEach(() => jest.clearAllMocks());

  it('atomically applies once, returns the same receipt and conflicts on key reuse', async () => {
    const offlineSync = new OfflineSyncService({
      get: jest.fn((key: string) =>
        key === 'OFFLINE_SYNC_HMAC_SECRET'
          ? 'explicit-test-offline-sync-secret-longer-than-32-bytes'
          : undefined,
      ),
    } as unknown as ConfigService);
    let persistedReceipt: Record<string, unknown> | null = null;
    const offlineReceiptFind = jest.fn(() => Promise.resolve(persistedReceipt));
    const offlineReceiptCreate = jest.fn(
      ({ data }: { data: Record<string, unknown> }) => {
        persistedReceipt = { id: 'receipt-a', ...data };
        return Promise.resolve(persistedReceipt);
      },
    );
    const voterCreate = jest.fn().mockResolvedValue({ id: 'voter-a' });
    const consentCreate = jest.fn().mockResolvedValue({ id: 'consent-a' });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-a' });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      offlineSyncReceipt: {
        findUnique: offlineReceiptFind,
        create: offlineReceiptCreate,
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.ADMIN,
          divisionId: null,
        }),
      },
      politicalDivision: {
        findMany: jest.fn(),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'puesto-a', expectedTables: 10 }),
      },
      consentNotice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'notice-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
          version: '2026.1',
          title: 'Aviso',
          content: 'Contenido',
          controllerName: 'Campaña',
          contactEmail: 'privacy@example.test',
          privacyPolicyUrl: null,
          activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
      voter: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: voterCreate,
      },
      consentRecord: { create: consentCreate },
      auditEvent: { create: auditCreate },
    };
    const runTransaction = jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const prisma = {
      $transaction: runTransaction,
    } as unknown as PrismaService;
    const consentEvidence = {
      hashIp: jest.fn().mockReturnValue('sync-network-ip-hash'),
    } as unknown as ConsentEvidenceService;
    const service = new LogisticsService(
      prisma,
      consentEvidence,
      {} as WitnessService,
      offlineSync,
    );

    const first = await service.syncVoter(
      { tenantId: 'tenant-a', userId: 'actor-a' },
      '203.0.113.42',
      input,
    );
    const duplicate = await service.syncVoter(
      { tenantId: 'tenant-a', userId: 'actor-a' },
      '203.0.113.42',
      input,
    );

    expect(first).toEqual(
      expect.objectContaining({
        receiptId: 'receipt-a',
        clientOperationId: input.clientOperationId,
        operationType: OfflineSyncOperationType.VOTER_CAPTURE,
        status: 'APPLIED',
        capturedAt: input.capturedAt,
      }),
    );
    expect(duplicate).toEqual({ ...first, status: 'DUPLICATE' });
    expect(first).not.toHaveProperty('resourceId');
    expect(first).not.toHaveProperty('documentId');
    expect(voterCreate).toHaveBeenCalledTimes(1);
    expect(consentCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(offlineReceiptCreate).toHaveBeenCalledTimes(1);
    expect(transaction.voter.findUnique).toHaveBeenCalledTimes(1);
    expect(assertPlanQuotaInTransaction).toHaveBeenNthCalledWith(
      1,
      transaction,
      'tenant-a',
      'voters',
      0,
    );
    expect(assertPlanQuotaInTransaction).toHaveBeenNthCalledWith(
      2,
      transaction,
      'tenant-a',
      'voters',
    );
    expect(voterCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          registrarId: 'actor-a',
          puestoId: 'puesto-a',
          mesa: 8,
          consentIp: null,
          consentTimestamp: new Date(input.capturedAt),
        }) as object,
      }),
    );
    expect(consentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        capturedAt: new Date(input.capturedAt),
        receivedAt: expect.any(Date),
        sourceIpHash: null,
        syncSourceIpHash: 'sync-network-ip-hash',
        grantedAt: new Date(input.capturedAt),
      }) as object,
    });

    const persistedReceiptCall = JSON.stringify(
      offlineReceiptCreate.mock.calls,
    );
    const persistedAuditCall = JSON.stringify(auditCreate.mock.calls);
    for (const sensitiveValue of [
      input.documentId,
      input.firstName,
      input.lastName,
      input.phone,
      '203.0.113.42',
      'sync-network-ip-hash',
    ]) {
      expect(persistedReceiptCall).not.toContain(sensitiveValue);
      expect(persistedAuditCall).not.toContain(sensitiveValue);
    }

    await expect(
      service.syncVoter(
        { tenantId: 'tenant-a', userId: 'actor-a' },
        '203.0.113.42',
        { ...input, firstName: 'Nombre alterado' },
      ),
    ).rejects.toThrow(
      'clientOperationId ya fue utilizado con una operacion diferente',
    );
    expect(voterCreate).toHaveBeenCalledTimes(1);
    expect(offlineReceiptCreate).toHaveBeenCalledTimes(1);
  });
});
