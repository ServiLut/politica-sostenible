import { ConfigService } from '@nestjs/config';
import {
  E14FormType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Role,
  TenantType,
  WitnessCredentialType,
  WitnessCaptureContext,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import { OfflineSyncService } from '../common/services/offline-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { WitnessService } from './witness.service';
import { OfflineE14CaptureGrantService } from './offline-e14-capture-grant.service';

const evidence = 'tenant-a/e14/11111111-1111-4111-8111-111111111111.pdf';
const reportInput = {
  puestoId: 'puesto-a',
  mesa: 7,
  e14ImageUrl: evidence,
  credentialType: WitnessCredentialType.E15,
  credentialReference: 'E15-BOG-001-0007',
  checkedInAt: '2026-09-01T11:55:00.000Z',
  e14FormType: E14FormType.DELEGADOS,
  candidateVotes: 80,
  blankVotes: 5,
  nullVotes: 3,
  unmarkedVotes: 2,
  totalTableVotes: 200,
  hasWrittenClaim: false,
};
const offlineEnvelope = {
  clientOperationId: '11111111-1111-4111-8111-111111111111',
  capturedAt: '2026-09-01T12:00:00.000Z',
  captureGrant: 'A'.repeat(43),
  evidenceSha256: 'a'.repeat(64),
} as const;

describe('WitnessService durable E-14 synchronization', () => {
  it('keeps the confirmed direct-upload mutation, audit and receipt atomic', async () => {
    const offlineSync = new OfflineSyncService({
      get: jest.fn((key: string) =>
        key === 'OFFLINE_SYNC_HMAC_SECRET'
          ? 'explicit-test-offline-sync-secret-longer-than-32-bytes'
          : undefined,
      ),
    } as unknown as ConfigService);
    let persistedReceipt: Record<string, unknown> | null = null;
    const receiptCreate = jest.fn(
      ({ data }: { data: Record<string, unknown> }) => {
        persistedReceipt = { id: 'receipt-e14-a', ...data };
        return Promise.resolve(persistedReceipt);
      },
    );
    const report = {
      id: 'report-a',
      captureContext: WitnessCaptureContext.REAL,
      witnessId: 'witness-a',
      puestoId: reportInput.puestoId,
      mesa: reportInput.mesa,
      credentialType: reportInput.credentialType,
      credentialReference: reportInput.credentialReference,
      checkedInAt: new Date(reportInput.checkedInAt),
      e14FormType: reportInput.e14FormType,
      candidateVotes: reportInput.candidateVotes,
      blankVotes: reportInput.blankVotes,
      nullVotes: reportInput.nullVotes,
      unmarkedVotes: reportInput.unmarkedVotes,
      totalTableVotes: reportInput.totalTableVotes,
      hasWrittenClaim: false,
      reclamationGround: null,
      reclamationDescription: null,
      observations: null,
      isSynced: true,
      status: WitnessReportStatus.PENDING,
      reviewerId: null,
      reviewReason: null,
      reviewedAt: null,
      supersededById: null,
      createdAt: new Date('2026-09-01T12:01:00.000Z'),
      updatedAt: new Date('2026-09-01T12:01:00.000Z'),
      puesto: { code: 'P-001', name: 'Colegio', expectedTables: 10 },
      witness: { id: 'witness-a', name: 'Testigo' },
      reviewer: null,
    };
    const reportCreate = jest.fn().mockResolvedValue(report);
    const storageConsume = jest.fn().mockResolvedValue({ count: 1 });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-e14-a' });
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ stage: PoliticalOperationStage.ELECTION_DAY }]),
      offlineSyncReceipt: {
        findUnique: jest.fn(() => Promise.resolve(persistedReceipt)),
        create: receiptCreate,
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.WITNESS,
          divisionId: 'puesto-a',
        }),
      },
      politicalDivision: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'puesto-a', parentId: null }]),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'puesto-a', expectedTables: 10 }),
      },
      witnessReport: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: reportCreate,
      },
      storedObject: { updateMany: storageConsume },
      auditEvent: { create: auditCreate },
    };
    const runTransaction = jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const grantService = {
      resolveForSync: jest.fn().mockResolvedValue({
        grantId: 'grant-a',
        tokenHmac: 'b'.repeat(64),
        captureContext: WitnessCaptureContext.REAL,
        actorUserId: 'witness-a',
        operationProfileId: 'profile-a',
        userAuthVersion: 0,
        roleAtIssue: Role.WITNESS,
        electionDate: new Date('2026-09-01T00:00:00.000Z'),
        issuedAt: new Date('2026-09-01T11:00:00.000Z'),
        expiresAt: new Date('2026-09-03T11:00:00.000Z'),
        revokedAt: null,
      }),
      assertUsableForMutation: jest.fn().mockResolvedValue(undefined),
      markUsed: jest.fn().mockResolvedValue(undefined),
    } as unknown as OfflineE14CaptureGrantService;
    const service = new WitnessService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type: TenantType.CANDIDACY,
          }),
        },
        $transaction: runTransaction,
      } as unknown as PrismaService,
      offlineSync,
      grantService,
    );

    const first = await service.create('tenant-a', 'witness-a', reportInput, {
      isSynced: true,
      source: 'OFFLINE_SYNC',
      offlineSync: offlineEnvelope,
    });
    const duplicate = await service.create(
      'tenant-a',
      'witness-a',
      reportInput,
      { isSynced: true, source: 'OFFLINE_SYNC', offlineSync: offlineEnvelope },
    );

    expect(first).toEqual(
      expect.objectContaining({
        receiptId: 'receipt-e14-a',
        clientOperationId: offlineEnvelope.clientOperationId,
        status: 'APPLIED',
        capturedAt: offlineEnvelope.capturedAt,
        captureContext: WitnessCaptureContext.REAL,
      }),
    );
    expect(duplicate).toEqual({ ...first, status: 'DUPLICATE' });
    expect(first).not.toHaveProperty('e14ImageUrl');
    expect(first).not.toHaveProperty('resourceId');
    expect(reportCreate).toHaveBeenCalledTimes(1);
    expect(storageConsume).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(receiptCreate).toHaveBeenCalledTimes(1);
    expect(storageConsume).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          path: evidence,
          uploaderId: 'witness-a',
          expectedSha256: offlineEnvelope.evidenceSha256,
          reportedSha256: offlineEnvelope.evidenceSha256,
        }) as object,
      }),
    );
    expect(receiptCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          actorUserId: 'witness-a',
          resourceType: 'WitnessReport',
          resourceId: 'report-a',
        }) as object,
      }),
    );
    expect(runTransaction).toHaveBeenCalledTimes(2);

    (
      grantService.assertUsableForMutation as unknown as jest.Mock
    ).mockRejectedValueOnce(new Error('grant expired after durable receipt'));
    await expect(
      service.create('tenant-a', 'witness-a', reportInput, {
        isSynced: true,
        source: 'OFFLINE_SYNC',
        offlineSync: offlineEnvelope,
      }),
    ).resolves.toEqual({ ...first, status: 'DUPLICATE' });
    expect(grantService.assertUsableForMutation).toHaveBeenCalledTimes(1);

    await expect(
      service.create(
        'tenant-a',
        'witness-a',
        { ...reportInput, candidateVotes: 81 },
        {
          isSynced: true,
          source: 'OFFLINE_SYNC',
          offlineSync: offlineEnvelope,
        },
      ),
    ).rejects.toThrow(
      'clientOperationId ya fue utilizado con una operacion diferente',
    );
    expect(reportCreate).toHaveBeenCalledTimes(1);
    expect(storageConsume).toHaveBeenCalledTimes(1);
    expect(receiptCreate).toHaveBeenCalledTimes(1);
  });
});
