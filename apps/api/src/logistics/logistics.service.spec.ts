import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AuditActorType,
  ConsentCollectionChannel,
  ConsentPurpose,
  ConsentStatus,
  DivisionType,
  E14FormType,
  OfflineSyncOperationType,
  PoliticalOperationMode,
  Prisma,
  Role,
  TenantType,
  WitnessCredentialType,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import {
  OfflineSyncDescriptor,
  OfflineSyncReceiptRecord,
  OfflineSyncService,
} from '../common/services/offline-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { WitnessService } from '../witness/witness.service';
import { LogisticsService as ProductionLogisticsService } from './logistics.service';
import {
  assertPlanQuotaInTransaction,
  ensureTenantSubscription,
} from '../auth/guards/plan-limits.guard';

jest.mock('../auth/guards/plan-limits.guard', () => ({
  assertPlanQuotaInTransaction: jest.fn().mockResolvedValue(undefined),
  ensureTenantSubscription: jest.fn().mockResolvedValue(undefined),
}));

const e14OfflineMetadata = {
  clientOperationId: '11111111-1111-4111-8111-111111111111',
  capturedAt: '2026-08-21T12:00:00.000Z',
  captureGrant: 'A'.repeat(43),
  evidenceSha256: 'a'.repeat(64),
} as const;

const e14Traceability = {
  ...e14OfflineMetadata,
  credentialType: WitnessCredentialType.E15,
  credentialReference: 'E15-BOG-001-0001',
  checkedInAt: '2026-08-21T07:00:00.000-05:00',
  e14FormType: E14FormType.DELEGADOS,
  blankVotes: 3,
  nullVotes: 2,
  unmarkedVotes: 1,
  hasWrittenClaim: false,
} as const;

const voterOfflineMetadata = {
  clientOperationId: '22222222-2222-4222-8222-222222222222',
  capturedAt: '2026-08-21T12:00:00.000Z',
} as const;

function offlineSyncFixture(): OfflineSyncService {
  const prepare = jest.fn(
    (
      operationType: OfflineSyncOperationType,
      clientOperationId: string,
      capturedAt: string,
    ): OfflineSyncDescriptor => ({
      operationType,
      clientOperationId,
      capturedAt: new Date(capturedAt),
      payloadHmac: 'a'.repeat(64),
    }),
  );
  const createReceipt = jest.fn(
    (
      _transaction: unknown,
      tenantId: string,
      actorUserId: string,
      descriptor: OfflineSyncDescriptor,
      _resourceType: string,
      _resourceId: string,
      receivedAt: Date,
    ): Promise<OfflineSyncReceiptRecord> =>
      Promise.resolve({
        id: 'offline-receipt-a',
        tenantId,
        actorUserId,
        clientOperationId: descriptor.clientOperationId,
        operationType: descriptor.operationType,
        payloadHmac: descriptor.payloadHmac,
        capturedAt: descriptor.capturedAt,
        receivedAt,
      }),
  );

  return {
    prepare,
    lockAndFindDuplicate: jest.fn().mockResolvedValue(null),
    createReceipt,
    present: jest.fn((receipt: OfflineSyncReceiptRecord, status) => ({
      received: true,
      receiptId: receipt.id,
      clientOperationId: receipt.clientOperationId,
      operationType: receipt.operationType,
      status,
      capturedAt: receipt.capturedAt.toISOString(),
      receivedAt: receipt.receivedAt.toISOString(),
    })),
  } as unknown as OfflineSyncService;
}

class LogisticsService extends ProductionLogisticsService {
  constructor(
    prisma: PrismaService,
    consentEvidence: ConsentEvidenceService,
    witnessService?: WitnessService,
  ) {
    const offlineSync = offlineSyncFixture();
    super(
      prisma,
      consentEvidence,
      witnessService ?? new WitnessService(prisma, offlineSync),
      offlineSync,
    );
  }
}

function activeConsentNoticeDelegate() {
  return {
    findFirst: jest.fn().mockResolvedValue({
      id: 'notice-a',
      mode: PoliticalOperationMode.CAMPAIGN,
      purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
      version: '2026.1',
      title: 'Autorizacion de tratamiento de datos',
      content: 'Texto legal vigente para la campana.',
      controllerName: 'Campana responsable',
      contactEmail: 'privacidad@example.test',
      privacyPolicyUrl: null,
      activatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  };
}

function openLifecycleQuery() {
  return jest.fn().mockResolvedValue([{ stage: 'CAMPAIGN' }]);
}

describe('LogisticsService tenant isolation', () => {
  it('rejects an E-14 voting place from another tenant', async () => {
    const userFindFirst = jest.fn().mockResolvedValue({
      role: Role.ADMIN,
      divisionId: null,
    });
    const divisionFindFirst = jest.fn().mockResolvedValue(null);
    const reportCreate = jest.fn();
    const witnessCreate = jest
      .fn()
      .mockRejectedValue(new BadRequestException('Puesto invalido'));
    const service = new LogisticsService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type: TenantType.CANDIDACY,
          }),
        },
        auditEvent: {
          findFirst: jest.fn().mockResolvedValue({ id: 'upload-receipt-a' }),
        },
        user: { findFirst: userFindFirst },
        politicalDivision: { findFirst: divisionFindFirst },
        witnessReport: { findFirst: jest.fn(), create: reportCreate },
      } as unknown as PrismaService,
      { hashIp: jest.fn() } as unknown as ConsentEvidenceService,
      { create: witnessCreate } as unknown as WitnessService,
    );

    await expect(
      service.syncE14('tenant-a', 'witness-a', {
        puestoId: 'puesto-from-tenant-b',
        mesa: 1,
        ...e14Traceability,
        candidateVotes: 10,
        totalTableVotes: 100,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(witnessCreate).toHaveBeenCalledWith(
      'tenant-a',
      'witness-a',
      expect.objectContaining({ puestoId: 'puesto-from-tenant-b' }),
      {
        isSynced: true,
        source: 'OFFLINE_SYNC',
        offlineSync: e14OfflineMetadata,
      },
    );
    expect(divisionFindFirst).not.toHaveBeenCalled();
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it('rejects an offline voter voting place from another tenant', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      consentNotice: activeConsentNoticeDelegate(),
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
        findFirst: jest.fn().mockResolvedValue(null),
      },
      voter: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      consentRecord: { create: jest.fn() },
    };
    const runTransaction = jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const service = new LogisticsService(
      { $transaction: runTransaction } as unknown as PrismaService,
      {
        hashIp: jest.fn().mockReturnValue('hashed-ip'),
      } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.syncVoter(
        { tenantId: 'tenant-a', userId: 'registrar-a' },
        '203.0.113.42',
        {
          ...voterOfflineMetadata,
          documentId: '1012345678',
          firstName: 'María',
          lastName: 'Pérez',
          puestoId: 'puesto-from-tenant-b',
          consentAccepted: true,
          termsVersion: '2026.1',
          collectionChannel: ConsentCollectionChannel.IN_PERSON,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'registrar-a',
        tenantId: 'tenant-a',
        isActive: true,
      },
      select: { role: true, divisionId: true },
    });
    expect(transaction.politicalDivision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'puesto-from-tenant-b',
        tenantId: 'tenant-a',
        type: DivisionType.PUESTO,
        isActive: true,
      },
      select: { id: true, expectedTables: true },
    });
    expect(transaction.voter.findUnique).not.toHaveBeenCalled();
    expect(transaction.voter.create).not.toHaveBeenCalled();
  });

  it('blocks E-14 synchronization in public-office mode', async () => {
    const userFindFirst = jest.fn();
    const reportCreate = jest.fn();
    const service = new LogisticsService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
            type: TenantType.PUBLIC_OFFICE,
          }),
        },
        user: { findFirst: userFindFirst },
        witnessReport: { create: reportCreate },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    await expect(
      service.syncE14('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 1,
        ...e14Traceability,
        candidateVotes: 10,
        totalTableVotes: 100,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userFindFirst).not.toHaveBeenCalled();
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it('rejects E-14 candidate votes above the table total', async () => {
    const userFindFirst = jest.fn();
    const service = new LogisticsService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type: TenantType.CANDIDACY,
          }),
        },
        user: { findFirst: userFindFirst },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    await expect(
      service.syncE14('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 1,
        ...e14Traceability,
        candidateVotes: 101,
        totalTableVotes: 100,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('blocks offline voter synchronization in public-office mode', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.PUBLIC_OFFICE,
        }),
      },
      voter: { create: jest.fn() },
    };
    const hashIp = jest.fn();
    const service = new LogisticsService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      { hashIp } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.syncVoter(
        { tenantId: 'tenant-a', userId: 'volunteer-a' },
        '203.0.113.42',
        {
          ...voterOfflineMetadata,
          documentId: '1012345678',
          firstName: 'María',
          lastName: 'Pérez',
          consentAccepted: true,
          termsVersion: '2026.1',
          collectionChannel: ConsentCollectionChannel.IN_PERSON,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(hashIp).not.toHaveBeenCalled();
    expect(transaction.voter.create).not.toHaveBeenCalled();
  });

  it('does not expose the private E-14 object path for an idempotent sync', async () => {
    const existingReport = {
      id: 'report-a',
      witnessId: 'witness-a',
      puestoId: 'puesto-a',
      mesa: 1,
      candidateVotes: 10,
      totalTableVotes: 100,
      observations: null,
      isSynced: true,
      status: WitnessReportStatus.PENDING,
      reviewerId: null,
      reviewReason: null,
      reviewedAt: null,
      supersededById: null,
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      updatedAt: new Date('2026-08-21T00:00:00.000Z'),
      puesto: {
        code: 'P-001',
        name: 'Colegio Central',
        expectedTables: null,
      },
      witness: { id: 'witness-a', name: 'Testigo A' },
      reviewer: null,
    };
    const reportFindFirst = jest.fn().mockResolvedValue(existingReport);
    const witnessCreate = jest.fn().mockResolvedValue(existingReport);
    const service = new LogisticsService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type: TenantType.CANDIDACY,
          }),
        },
        auditEvent: {
          findFirst: jest.fn().mockResolvedValue({ id: 'upload-receipt-a' }),
        },
        user: {
          findFirst: jest.fn().mockResolvedValue({
            role: Role.ADMIN,
            divisionId: null,
          }),
        },
        politicalDivision: {
          findFirst: jest.fn().mockResolvedValue({ id: 'puesto-a' }),
        },
        witnessReport: { findFirst: reportFindFirst, create: jest.fn() },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
      { create: witnessCreate } as unknown as WitnessService,
    );

    const result = await service.syncE14('tenant-a', 'witness-a', {
      puestoId: 'puesto-a',
      mesa: 1,
      ...e14Traceability,
      candidateVotes: 10,
      totalTableVotes: 100,
      e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
    });

    expect(result).not.toHaveProperty('e14ImageUrl');
    expect(witnessCreate).toHaveBeenCalledWith(
      'tenant-a',
      'witness-a',
      expect.objectContaining({
        puestoId: 'puesto-a',
        mesa: 1,
      }),
      {
        isSynced: true,
        source: 'OFFLINE_SYNC',
        offlineSync: e14OfflineMetadata,
      },
    );
    expect(reportFindFirst).not.toHaveBeenCalled();
  });

  it('denies offline E-14 synchronization outside the current witness territory', async () => {
    const uploadFindFirst = jest.fn();
    const divisionFindFirst = jest.fn();
    const reportCreate = jest.fn();
    const witnessCreate = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('Fuera del territorio'));
    const service = new LogisticsService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type: TenantType.CANDIDACY,
          }),
        },
        auditEvent: { findFirst: uploadFindFirst },
        user: {
          findFirst: jest.fn().mockResolvedValue({
            role: Role.WITNESS,
            divisionId: 'zone-a',
          }),
        },
        politicalDivision: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'zone-a', parentId: null },
            { id: 'puesto-a', parentId: 'zone-a' },
            { id: 'puesto-b', parentId: null },
          ]),
          findFirst: divisionFindFirst,
        },
        witnessReport: { findFirst: jest.fn(), create: reportCreate },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
      { create: witnessCreate } as unknown as WitnessService,
    );

    await expect(
      service.syncE14('tenant-a', 'witness-a', {
        puestoId: 'puesto-b',
        mesa: 1,
        ...e14Traceability,
        candidateVotes: 10,
        totalTableVotes: 100,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(uploadFindFirst).not.toHaveBeenCalled();
    expect(divisionFindFirst).not.toHaveBeenCalled();
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it('creates a new voter and consent record inside the authenticated tenant', async () => {
    const voterCreate = jest.fn().mockResolvedValue({
      id: 'voter-a',
      consentAccepted: true,
      consentTimestamp: new Date('2026-08-21T00:00:00.000Z'),
    });
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      consentNotice: activeConsentNoticeDelegate(),
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
      politicalDivision: { findMany: jest.fn(), findFirst: jest.fn() },
      voter: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: voterCreate,
      },
      consentRecord: {
        create: jest.fn().mockResolvedValue({ id: 'consent-a' }),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-a' }),
      },
    };
    const service = new LogisticsService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      {
        hashIp: jest.fn().mockReturnValue('hashed-ip'),
      } as unknown as ConsentEvidenceService,
    );

    const result = await service.syncVoter(
      { tenantId: 'tenant-a', userId: 'volunteer-a' },
      '203.0.113.42',
      {
        ...voterOfflineMetadata,
        documentId: '1012345678',
        firstName: 'María',
        lastName: 'Pérez',
        phone: '3001234567',
        email: 'maria@example.com',
        consentAccepted: true,
        termsVersion: '2026.1',
        collectionChannel: ConsentCollectionChannel.IN_PERSON,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        receiptId: 'offline-receipt-a',
        clientOperationId: voterOfflineMetadata.clientOperationId,
        operationType: OfflineSyncOperationType.VOTER_CAPTURE,
        status: 'APPLIED',
        capturedAt: voterOfflineMetadata.capturedAt,
      }),
    );
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('documentId');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('email');
    expect(transaction.voter.findUnique).toHaveBeenCalledWith({
      where: {
        documentId_tenantId: {
          documentId: '1012345678',
          tenantId: 'tenant-a',
        },
      },
      select: { id: true },
    });
    expect(voterCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: '1012345678',
          tenantId: 'tenant-a',
          registrarId: 'volunteer-a',
          consentAccepted: true,
          consentIp: null,
          consentTimestamp: new Date(voterOfflineMetadata.capturedAt),
        }) as object,
        select: { id: true },
      }),
    );
    expect(transaction.consentRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        voterId: 'voter-a',
        subjectRef: 'voter-a',
        status: ConsentStatus.GRANTED,
        sourceIpHash: null,
        capturedAt: new Date(voterOfflineMetadata.capturedAt),
        syncSourceIpHash: 'hashed-ip',
      }) as object,
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: 'volunteer-a',
        action: 'VOTER_REGISTERED_WITH_CONSENT',
        resourceType: 'Voter',
        resourceId: 'voter-a',
        after: { consentStatus: ConsentStatus.GRANTED },
        metadata: expect.objectContaining({
          registeredFields: [
            'documentId',
            'email',
            'firstName',
            'lastName',
            'phone',
          ],
          purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
          collectionChannel: ConsentCollectionChannel.IN_PERSON,
          noticeVersion: '2026.1',
          source: 'OFFLINE_SYNC',
          timestampSource: 'CLIENT_CAPTURED_AT',
          capturedAt: voterOfflineMetadata.capturedAt,
          syncNetworkEvidenceStored: true,
        }),
      }),
    });
    const serializedAudit = JSON.stringify(
      transaction.auditEvent.create.mock.calls,
    );
    expect(serializedAudit).not.toContain('1012345678');
    expect(serializedAudit).not.toContain('María');
    expect(serializedAudit).not.toContain('Pérez');
    expect(serializedAudit).not.toContain('3001234567');
    expect(serializedAudit).not.toContain('maria@example.com');
    expect(serializedAudit).not.toContain('203.0.113.42');
    expect(serializedAudit).not.toContain('hashed-ip');
  });

  it('fails the offline voter operation when its audit cannot persist', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      consentNotice: activeConsentNoticeDelegate(),
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
      politicalDivision: { findMany: jest.fn(), findFirst: jest.fn() },
      voter: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'voter-a' }),
      },
      consentRecord: {
        create: jest.fn().mockResolvedValue({ id: 'consent-a' }),
      },
      auditEvent: {
        create: jest.fn().mockRejectedValue(new Error('audit unavailable')),
      },
    };
    const runTransaction = jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const service = new LogisticsService(
      { $transaction: runTransaction } as unknown as PrismaService,
      {
        hashIp: jest.fn().mockReturnValue('hashed-ip'),
      } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.syncVoter(
        { tenantId: 'tenant-a', userId: 'volunteer-a' },
        '203.0.113.42',
        {
          ...voterOfflineMetadata,
          documentId: '1012345678',
          firstName: 'María',
          lastName: 'Pérez',
          consentAccepted: true,
          termsVersion: '2026.1',
          collectionChannel: ConsentCollectionChannel.IN_PERSON,
        },
      ),
    ).rejects.toThrow('audit unavailable');

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
    expect(ensureTenantSubscription).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-a',
    );
    expect(assertPlanQuotaInTransaction).toHaveBeenCalledWith(
      transaction,
      'tenant-a',
      'voters',
    );
    expect(transaction.voter.create).toHaveBeenCalledTimes(1);
    expect(transaction.consentRecord.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('maps a serialization conflict to a safe retryable conflict', async () => {
    const runTransaction = jest.fn().mockRejectedValue({ code: 'P2034' });
    const service = new LogisticsService(
      { $transaction: runTransaction } as unknown as PrismaService,
      { hashIp: jest.fn() } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.syncVoter(
        { tenantId: 'tenant-a', userId: 'volunteer-a' },
        '203.0.113.42',
        {
          ...voterOfflineMetadata,
          documentId: '1012345678',
          firstName: 'María',
          lastName: 'Pérez',
          consentAccepted: true,
          termsVersion: '2026.1',
          collectionChannel: ConsentCollectionChannel.IN_PERSON,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it('returns a generic receipt for an existing voter after validating scope', async () => {
    const existingVoter = {
      id: 'voter-a',
      consentAccepted: true,
      consentTimestamp: new Date('2026-08-21T00:00:00.000Z'),
    };
    const voterCreate = jest.fn();
    const voterUpdate = jest.fn();
    const voterUpsert = jest.fn();
    const consentCreate = jest.fn();
    const consentFindFirst = jest.fn().mockResolvedValue({
      status: ConsentStatus.GRANTED,
      expiresAt: null,
    });
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      consentNotice: activeConsentNoticeDelegate(),
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
        findFirst: jest.fn().mockResolvedValue({ id: 'puesto-a' }),
      },
      voter: {
        findUnique: jest.fn().mockResolvedValue(existingVoter),
        create: voterCreate,
        update: voterUpdate,
        upsert: voterUpsert,
      },
      consentRecord: {
        findFirst: consentFindFirst,
        create: consentCreate,
      },
      auditEvent: { create: jest.fn() },
    };
    const hashIp = jest.fn();
    const service = new LogisticsService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      { hashIp } as unknown as ConsentEvidenceService,
    );

    const result = await service.syncVoter(
      { tenantId: 'tenant-a', userId: 'volunteer-a' },
      '203.0.113.42',
      {
        ...voterOfflineMetadata,
        documentId: '1012345678',
        firstName: 'Nombre que no debe reemplazarse',
        lastName: 'Apellido que no debe reemplazarse',
        phone: '3009999999',
        email: 'otro@example.com',
        puestoId: 'puesto-a',
        consentAccepted: true,
        termsVersion: '2026.1',
        collectionChannel: ConsentCollectionChannel.IN_PERSON,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        received: true,
        receiptId: 'offline-receipt-a',
        status: 'APPLIED',
      }),
    );
    expect(result).not.toHaveProperty('id');
    expect(transaction.voter.findUnique).toHaveBeenCalledWith({
      where: {
        documentId_tenantId: {
          documentId: '1012345678',
          tenantId: 'tenant-a',
        },
      },
      select: { id: true },
    });
    expect(consentFindFirst).not.toHaveBeenCalled();
    expect(transaction.politicalDivision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'puesto-a',
        tenantId: 'tenant-a',
        type: DivisionType.PUESTO,
        isActive: true,
      },
      select: { id: true, expectedTables: true },
    });
    expect(hashIp).not.toHaveBeenCalled();
    expect(voterCreate).not.toHaveBeenCalled();
    expect(voterUpdate).not.toHaveBeenCalled();
    expect(voterUpsert).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'VOTER_OFFLINE_SYNC_ACKNOWLEDGED',
        resourceId: 'voter-a',
        metadata: expect.objectContaining({ changed: false }),
      }),
    });
  });

  it.each([
    ['revoked', { status: ConsentStatus.REVOKED, expiresAt: null }],
    [
      'expired',
      {
        status: ConsentStatus.GRANTED,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    ],
  ])(
    'returns the same non-disclosing receipt when prior consent is %s',
    async (_state, latestConsent) => {
      const voterCreate = jest.fn();
      const voterUpdate = jest.fn();
      const consentCreate = jest.fn();
      const transaction = {
        $queryRaw: openLifecycleQuery(),
        consentNotice: activeConsentNoticeDelegate(),
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
        voter: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'voter-a',
            consentAccepted: true,
            consentTimestamp: new Date('2026-08-21T00:00:00.000Z'),
          }),
          create: voterCreate,
          update: voterUpdate,
        },
        consentRecord: {
          findFirst: jest.fn().mockResolvedValue(latestConsent),
          create: consentCreate,
        },
        auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
      };
      const hashIp = jest.fn();
      const service = new LogisticsService(
        {
          $transaction: jest.fn(
            async (
              callback: (client: typeof transaction) => Promise<unknown>,
            ) => callback(transaction),
          ),
        } as unknown as PrismaService,
        { hashIp } as unknown as ConsentEvidenceService,
      );

      const synchronization = service.syncVoter(
        { tenantId: 'tenant-a', userId: 'volunteer-a' },
        '203.0.113.42',
        {
          ...voterOfflineMetadata,
          documentId: '1012345678',
          firstName: 'María',
          lastName: 'Pérez',
          consentAccepted: true,
          termsVersion: '2026.1',
          collectionChannel: ConsentCollectionChannel.IN_PERSON,
        },
      );

      await expect(synchronization).resolves.toEqual(
        expect.objectContaining({ received: true, status: 'APPLIED' }),
      );
      expect(transaction.consentRecord.findFirst).not.toHaveBeenCalled();
      expect(hashIp).not.toHaveBeenCalled();
      expect(voterCreate).not.toHaveBeenCalled();
      expect(voterUpdate).not.toHaveBeenCalled();
      expect(consentCreate).not.toHaveBeenCalled();
    },
  );

  it('does not acknowledge an unexpected unique violation without a durable receipt', async () => {
    const concurrentVoter = {
      id: 'voter-concurrent',
      consentAccepted: true,
      consentTimestamp: new Date('2026-08-21T00:00:00.000Z'),
    };
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      consentNotice: activeConsentNoticeDelegate(),
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
      politicalDivision: { findMany: jest.fn(), findFirst: jest.fn() },
      voter: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
      consentRecord: { create: jest.fn() },
      auditEvent: { create: jest.fn() },
    };
    const concurrentFindUnique = jest.fn().mockResolvedValue(concurrentVoter);
    const concurrentConsentFindFirst = jest.fn().mockResolvedValue({
      status: ConsentStatus.GRANTED,
      expiresAt: null,
    });
    const service = new LogisticsService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
        voter: { findUnique: concurrentFindUnique },
        consentRecord: { findFirst: concurrentConsentFindFirst },
      } as unknown as PrismaService,
      {
        hashIp: jest.fn().mockReturnValue('hashed-ip'),
      } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.syncVoter(
        { tenantId: 'tenant-a', userId: 'volunteer-a' },
        '203.0.113.42',
        {
          ...voterOfflineMetadata,
          documentId: '1012345678',
          firstName: 'María',
          lastName: 'Pérez',
          consentAccepted: true,
          termsVersion: '2026.1',
          collectionChannel: ConsentCollectionChannel.IN_PERSON,
        },
      ),
    ).rejects.toEqual({ code: 'P2002' });
    expect(concurrentFindUnique).not.toHaveBeenCalled();
    expect(concurrentConsentFindFirst).not.toHaveBeenCalled();
    expect(transaction.consentRecord.create).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('denies offline voter capture outside the persisted volunteer territory', async () => {
    const transaction = {
      $queryRaw: openLifecycleQuery(),
      consentNotice: activeConsentNoticeDelegate(),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.VOLUNTEER,
          divisionId: 'zone-a',
        }),
      },
      politicalDivision: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'zone-a', parentId: null },
          { id: 'puesto-a', parentId: 'zone-a' },
          { id: 'puesto-b', parentId: null },
        ]),
        findFirst: jest.fn(),
      },
      voter: { findUnique: jest.fn(), create: jest.fn() },
      consentRecord: { create: jest.fn() },
    };
    const hashIp = jest.fn();
    const service = new LogisticsService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      { hashIp } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.syncVoter(
        {
          tenantId: 'tenant-a',
          userId: 'volunteer-a',
          role: Role.ADMIN,
        },
        '203.0.113.42',
        {
          ...voterOfflineMetadata,
          documentId: '1012345678',
          firstName: 'María',
          lastName: 'Pérez',
          puestoId: 'puesto-b',
          consentAccepted: true,
          termsVersion: '2026.1',
          collectionChannel: ConsentCollectionChannel.IN_PERSON,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(hashIp).not.toHaveBeenCalled();
    expect(transaction.politicalDivision.findFirst).not.toHaveBeenCalled();
    expect(transaction.voter.findUnique).not.toHaveBeenCalled();
    expect(transaction.voter.create).not.toHaveBeenCalled();
  });
});
