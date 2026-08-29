import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  ConsentCollectionChannel,
  ConsentLegalBasis,
  ConsentPurpose,
  ConsentStatus,
  ConsentSubjectType,
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoterService } from './voter.service';

const campaignTenant = {
  defaultMode: PoliticalOperationMode.CAMPAIGN,
  type: TenantType.CANDIDACY,
};

const admin: AuthenticatedUser = {
  userId: 'admin-a',
  tenantId: 'tenant-a',
  role: Role.ADMIN,
};

const grantedAt = new Date('2026-05-01T15:00:00.000Z');

function buildRevocationTransaction() {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(campaignTenant),
    },
    voter: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'voter-a',
        tenantId: 'tenant-a',
        consentAccepted: true,
      }),
      update: jest.fn().mockResolvedValue({
        id: 'voter-a',
        consentAccepted: false,
      }),
    },
    consentRecord: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'grant-a',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        subjectType: ConsentSubjectType.VOTER,
        subjectRef: 'voter-a',
        voterId: 'voter-a',
        purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
        legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
        status: ConsentStatus.GRANTED,
        collectionChannel: ConsentCollectionChannel.IN_PERSON,
        noticeVersion: '2026.1',
        proofPath: null,
        grantedAt,
      }),
      create: jest.fn().mockResolvedValue({
        id: 'revocation-a',
        status: ConsentStatus.REVOKED,
        revokedAt: new Date('2026-08-21T17:00:00.000Z'),
      }),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({ id: 'audit-a' }),
    },
  };
}

function buildServiceWithTransaction(
  transaction: ReturnType<typeof buildRevocationTransaction>,
) {
  const runTransaction = jest.fn(
    async (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  const prisma = {
    $transaction: runTransaction,
    consentRecord: {
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService;

  return {
    prisma,
    runTransaction,
    service: new VoterService(prisma, {} as ConsentEvidenceService),
  };
}

describe('VoterService privacy controls', () => {
  it('rejects an empty or superficial reason before opening a transaction', async () => {
    const transaction = buildRevocationTransaction();
    const { runTransaction, service } =
      buildServiceWithTransaction(transaction);

    await expect(
      service.revokeConsent(admin, 'voter-a', { reason: '   no   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('appends a revocation, disables current consent and audits atomically without PII', async () => {
    const transaction = buildRevocationTransaction();
    const { runTransaction, service } =
      buildServiceWithTransaction(transaction);

    const result = await service.revokeConsent(admin, 'voter-a', {
      reason: '  Solicitud expresa recibida por el titular.  ',
    });

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(transaction.voter.findFirst).toHaveBeenCalledWith({
      where: { id: 'voter-a', tenantId: 'tenant-a' },
      select: { id: true, consentAccepted: true },
    });
    expect(transaction.consentRecord.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        voterId: 'voter-a',
        subjectType: ConsentSubjectType.VOTER,
        purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(transaction.consentRecord.create).toHaveBeenCalledTimes(1);
    const consentCreateCalls = transaction.consentRecord.create.mock
      .calls as unknown as Array<
      [
        {
          data: Record<string, unknown>;
          select: Record<string, boolean>;
        },
      ]
    >;
    const consentCreateArgs = consentCreateCalls[0]?.[0];
    expect(consentCreateArgs?.data).toMatchObject({
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.CAMPAIGN,
      subjectType: ConsentSubjectType.VOTER,
      subjectRef: 'voter-a',
      voterId: 'voter-a',
      purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
      legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
      status: ConsentStatus.REVOKED,
      collectionChannel: ConsentCollectionChannel.IN_PERSON,
      noticeVersion: '2026.1',
      capturedById: 'admin-a',
      grantedAt,
      revocationReason: 'Solicitud expresa recibida por el titular.',
    });
    expect(consentCreateArgs?.data.revokedAt).toBeInstanceOf(Date);
    expect(consentCreateArgs?.select).toEqual({
      id: true,
      status: true,
      revokedAt: true,
    });
    expect(transaction.voter.update).toHaveBeenCalledWith({
      where: { id: 'voter-a', tenantId: 'tenant-a' },
      data: { consentAccepted: false },
      select: { id: true, consentAccepted: true },
    });
    const auditCalls = transaction.auditEvent.create.mock
      .calls as unknown as Array<[{ data: Record<string, unknown> }]>;
    const auditArgs = auditCalls[0]?.[0];
    const auditData = auditArgs?.data;
    expect(auditData).toMatchObject({
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.CAMPAIGN,
      actorType: AuditActorType.USER,
      actorUserId: 'admin-a',
      action: 'VOTER_CONSENT_REVOKED',
      resourceType: 'ConsentRecord',
      resourceId: 'revocation-a',
      before: { status: ConsentStatus.GRANTED, consentAccepted: true },
      after: { status: ConsentStatus.REVOKED, consentAccepted: false },
      metadata: { purpose: ConsentPurpose.POLITICAL_COMMUNICATION },
    });
    expect(JSON.stringify(auditData)).not.toContain('Solicitud expresa');
    expect(transaction.consentRecord.update).not.toHaveBeenCalled();
    expect(transaction.consentRecord.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      voterId: 'voter-a',
      consentAccepted: false,
      status: ConsentStatus.REVOKED,
    });
  });

  it('cannot inspect or revoke a voter owned by another tenant', async () => {
    const transaction = buildRevocationTransaction();
    transaction.voter.findFirst.mockResolvedValue(null);
    const { service } = buildServiceWithTransaction(transaction);

    await expect(
      service.revokeConsent(admin, 'voter-from-tenant-b', {
        reason: 'Solicitud expresa del titular.',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(transaction.voter.findFirst).toHaveBeenCalledWith({
      where: { id: 'voter-from-tenant-b', tenantId: 'tenant-a' },
      select: { id: true, consentAccepted: true },
    });
    expect(transaction.consentRecord.findFirst).not.toHaveBeenCalled();
    expect(transaction.consentRecord.create).not.toHaveBeenCalled();
    expect(transaction.voter.update).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it.each([Role.VOLUNTEER, Role.AUDITOR, Role.ZONE_COORDINATOR])(
    'denies consent revocation to role %s before opening a transaction',
    async (role) => {
      const transaction = buildRevocationTransaction();
      const { runTransaction, service } =
        buildServiceWithTransaction(transaction);

      await expect(
        service.revokeConsent({ ...admin, role }, 'voter-a', {
          reason: 'Solicitud expresa del titular.',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(runTransaction).not.toHaveBeenCalled();
    },
  );

  it('returns a conflict when the latest event already revoked the purpose', async () => {
    const transaction = buildRevocationTransaction();
    transaction.consentRecord.findFirst.mockResolvedValue({
      id: 'revocation-existing',
      status: ConsentStatus.REVOKED,
    });
    const { service } = buildServiceWithTransaction(transaction);

    await expect(
      service.revokeConsent(admin, 'voter-a', {
        reason: 'Solicitud expresa del titular.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.consentRecord.create).not.toHaveBeenCalled();
    expect(transaction.voter.update).not.toHaveBeenCalled();
    expect(transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects revocation outside campaign mode without reading a voter', async () => {
    const transaction = buildRevocationTransaction();
    transaction.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    const { service } = buildServiceWithTransaction(transaction);

    await expect(
      service.revokeConsent(admin, 'voter-a', {
        reason: 'Solicitud expresa del titular.',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.voter.findFirst).not.toHaveBeenCalled();
  });

  it('propagates an audit failure from the same transaction', async () => {
    const transaction = buildRevocationTransaction();
    transaction.auditEvent.create.mockRejectedValue(
      new Error('audit unavailable'),
    );
    const { service } = buildServiceWithTransaction(transaction);

    await expect(
      service.revokeConsent(admin, 'voter-a', {
        reason: 'Solicitud expresa del titular.',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(transaction.consentRecord.create).toHaveBeenCalledTimes(1);
    expect(transaction.voter.update).toHaveBeenCalledTimes(1);
    expect(transaction.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('paginates inside the JWT tenant and never serializes raw contact fields', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'voter-a',
        documentId: '1012345678',
        firstName: 'Ana',
        lastName: 'Rojas',
        phone: '3001234567',
        email: 'must-not-leak@example.test',
        mesa: 12,
        isSignatureValid: true,
        consentAccepted: true,
        consentTimestamp: grantedAt,
        createdAt: grantedAt,
        puesto: { name: 'Puesto 1' },
        registrar: { name: 'Equipo A' },
      },
    ]);
    const count = jest.fn().mockResolvedValue(21);
    const service = new VoterService(
      {
        tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant) },
        user: {
          findFirst: jest.fn().mockResolvedValue({
            role: Role.ADMIN,
            divisionId: null,
          }),
        },
        politicalDivision: { findMany: jest.fn() },
        voter: { findMany, count },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    const result = await service.findAll(
      { ...admin, role: Role.ZONE_COORDINATOR },
      {
        page: 2,
        limit: 10,
        search: 'ana',
      },
    );

    const findManyCalls = findMany.mock.calls as unknown as Array<
      [{ where: Record<string, unknown>; skip: number; take: number }]
    >;
    const countCalls = count.mock.calls as unknown as Array<
      [{ where: Record<string, unknown> }]
    >;
    const findManyArgs = findManyCalls[0]?.[0];
    const countArgs = countCalls[0]?.[0];
    expect(findManyArgs).toMatchObject({ skip: 10, take: 10 });
    expect(findManyArgs?.where).toMatchObject({ tenantId: 'tenant-a' });
    expect(JSON.stringify(findManyArgs?.where)).not.toContain('documentId');
    expect(JSON.stringify(findManyArgs?.where)).not.toContain('phone');
    expect(countArgs?.where).toMatchObject({ tenantId: 'tenant-a' });
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
    expect(result.items[0]).toMatchObject({
      id: 'voter-a',
      documentIdMasked: '******5678',
      phoneMasked: '******4567',
    });
    expect(result.items[0]).not.toHaveProperty('documentId');
    expect(result.items[0]).not.toHaveProperty('phone');
    expect(result.items[0]).not.toHaveProperty('email');
  });

  it('scopes a coordinator list to the persisted division and descendants', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const userFindFirst = jest.fn().mockResolvedValue({
      role: Role.ZONE_COORDINATOR,
      divisionId: 'municipality-a',
    });
    const divisionFindMany = jest.fn().mockResolvedValue([
      { id: 'department-a', parentId: null },
      { id: 'municipality-a', parentId: 'department-a' },
      { id: 'zone-a', parentId: 'municipality-a' },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'municipality-b', parentId: 'department-a' },
      { id: 'puesto-b', parentId: 'municipality-b' },
    ]);
    const service = new VoterService(
      {
        tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant) },
        user: { findFirst: userFindFirst },
        politicalDivision: { findMany: divisionFindMany },
        voter: { findMany, count },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    await service.findAll(
      { ...admin, userId: 'coordinator-a', role: Role.ADMIN },
      { page: 1, limit: 25 },
    );

    expect(userFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'coordinator-a',
        tenantId: 'tenant-a',
        isActive: true,
      },
      select: { role: true, divisionId: true },
    });
    expect(divisionFindMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: { id: true, parentId: true },
    });

    const findManyCalls = findMany.mock.calls as unknown as Array<
      [{ where: Record<string, unknown> }]
    >;
    const countCalls = count.mock.calls as unknown as Array<
      [{ where: Record<string, unknown> }]
    >;
    const listWhere = findManyCalls[0]?.[0].where;
    const countWhere = countCalls[0]?.[0].where;
    const territorialFilter = listWhere?.puestoId as
      | { in?: string[] }
      | undefined;

    expect(listWhere).toMatchObject({ tenantId: 'tenant-a' });
    expect(territorialFilter?.in).toEqual(
      expect.arrayContaining(['municipality-a', 'zone-a', 'puesto-a']),
    );
    expect(territorialFilter?.in).not.toEqual(
      expect.arrayContaining(['department-a', 'municipality-b', 'puesto-b']),
    );
    expect(countWhere).toEqual(listWhere);
  });

  it('scopes every coordinator statistic to the same tenant divisions', async () => {
    const count = jest
      .fn()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const service = new VoterService(
      {
        tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant) },
        user: {
          findFirst: jest.fn().mockResolvedValue({
            role: Role.ZONE_COORDINATOR,
            divisionId: 'zone-a',
          }),
        },
        politicalDivision: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'zone-a', parentId: null },
            { id: 'puesto-a', parentId: 'zone-a' },
            { id: 'zone-b', parentId: null },
          ]),
        },
        voter: { count },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    await expect(
      service.getStats({
        ...admin,
        userId: 'coordinator-a',
        role: Role.ADMIN,
      }),
    ).resolves.toEqual({ total: 3, signatures: 2, consented: 1 });

    const calls = count.mock.calls as unknown as Array<
      [{ where: Record<string, unknown> }]
    >;
    for (const [index, call] of calls.entries()) {
      expect(call[0].where).toMatchObject({
        tenantId: 'tenant-a',
        puestoId: {
          in: expect.arrayContaining(['zone-a', 'puesto-a']) as string[],
        },
        ...(index === 1 ? { isSignatureValid: true } : {}),
        ...(index === 2 ? { consentAccepted: true } : {}),
      });
      const puestoFilter = call[0].where.puestoId as { in: string[] };
      expect(puestoFilter.in).not.toContain('zone-b');
    }
  });

  it('fails closed when a coordinator has no persisted division', async () => {
    const findMany = jest.fn();
    const count = jest.fn();
    const divisionFindMany = jest.fn();
    const service = new VoterService(
      {
        tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant) },
        user: {
          findFirst: jest.fn().mockResolvedValue({
            role: Role.ZONE_COORDINATOR,
            divisionId: null,
          }),
        },
        politicalDivision: { findMany: divisionFindMany },
        voter: { findMany, count },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );
    const coordinator = {
      ...admin,
      userId: 'coordinator-without-zone',
      role: Role.ADMIN,
    };

    await expect(service.findAll(coordinator, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getStats(coordinator)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(divisionFindMany).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('counts current consents for executive metrics inside the JWT tenant', async () => {
    const count = jest
      .fn()
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(9);
    const service = new VoterService(
      {
        tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant) },
        user: {
          findFirst: jest.fn().mockResolvedValue({
            role: Role.ADMIN,
            divisionId: null,
          }),
        },
        politicalDivision: { findMany: jest.fn() },
        voter: { count },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    await expect(service.getStats(admin)).resolves.toEqual({
      total: 12,
      signatures: 4,
      consented: 9,
    });
    expect(count).toHaveBeenNthCalledWith(1, {
      where: { tenantId: 'tenant-a' },
    });
    expect(count).toHaveBeenNthCalledWith(2, {
      where: { tenantId: 'tenant-a', isSignatureValid: true },
    });
    expect(count).toHaveBeenNthCalledWith(3, {
      where: { tenantId: 'tenant-a', consentAccepted: true },
    });
  });
});
