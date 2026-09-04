import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  ConsentCollectionChannel,
  ConsentLegalBasis,
  ConsentPurpose,
  ConsentStatus,
  ConsentSubjectType,
  DivisionType,
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import { ConsentEvidenceService } from '../common/services/consent-evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVoterDto } from './dto/create-voter.dto';
import { ListVotersQueryDto } from './dto/list-voters-query.dto';
import { SearchVotersDto } from './dto/search-voters.dto';
import { VoterService } from './voter.service';

describe('VoterService consent transaction', () => {
  const dto: CreateVoterDto = {
    documentId: '1012345678',
    firstName: 'María',
    lastName: 'Pérez',
    consentAccepted: true,
    termsVersion: '2026.1',
  };

  const buildTransaction = (
    defaultMode: PoliticalOperationMode = PoliticalOperationMode.CAMPAIGN,
  ) => {
    const captured: {
      voterData?: Record<string, unknown>;
      consentData?: Record<string, unknown>;
    } = {};

    return {
      captured,
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode,
          type:
            defaultMode === PoliticalOperationMode.PUBLIC_OFFICE
              ? TenantType.PUBLIC_OFFICE
              : TenantType.CANDIDACY,
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
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          captured.voterData = args.data;
          return Promise.resolve({
            id: 'voter-id',
            tenantId: 'tenant-from-token',
            documentId: '1012345678',
            phone: '3001234567',
            email: 'private@example.test',
            consentAccepted: true,
          });
        }),
      },
      consentRecord: {
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          captured.consentData = args.data;
          return Promise.resolve({ id: 'consent-id' });
        }),
      },
    };
  };

  it('atomically creates voter and legal consent evidence', async () => {
    const transaction = buildTransaction();
    const runTransaction = jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    const hashIp = jest.fn().mockReturnValue('hashed-ip-evidence');
    const service = new VoterService(
      { $transaction: runTransaction } as unknown as PrismaService,
      { hashIp } as unknown as ConsentEvidenceService,
    );

    const result = await service.create(
      {
        tenantId: 'tenant-from-token',
        userId: 'user-from-token',
        role: Role.VOLUNTEER,
      },
      '203.0.113.42',
      dto,
    );

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(hashIp).toHaveBeenCalledWith('203.0.113.42');
    const voterCreateData = transaction.captured.voterData;
    expect(voterCreateData).toMatchObject({
      tenantId: 'tenant-from-token',
      registrarId: 'user-from-token',
      consentAccepted: true,
      consentIp: 'hashed-ip-evidence',
      termsVersion: '2026.1',
    });
    expect(voterCreateData?.consentTimestamp).toBeInstanceOf(Date);
    const consentCreateData = transaction.captured.consentData;
    expect(consentCreateData).toMatchObject({
      tenantId: 'tenant-from-token',
      mode: PoliticalOperationMode.CAMPAIGN,
      subjectType: ConsentSubjectType.VOTER,
      subjectRef: 'voter-id',
      voterId: 'voter-id',
      purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
      legalBasis: ConsentLegalBasis.EXPLICIT_CONSENT,
      status: ConsentStatus.GRANTED,
      collectionChannel: ConsentCollectionChannel.IN_PERSON,
      noticeVersion: '2026.1',
      sourceIpHash: 'hashed-ip-evidence',
      capturedById: 'user-from-token',
    });
    expect(consentCreateData?.grantedAt).toBeInstanceOf(Date);
    expect(result).toEqual({ received: true });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('documentId');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('email');
  });

  it('rejects political collection for a public-office tenant', async () => {
    const transaction = buildTransaction(PoliticalOperationMode.PUBLIC_OFFICE);
    const service = new VoterService(
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

    await expect(
      service.create(
        {
          tenantId: 'tenant-from-token',
          userId: 'user-from-token',
          role: Role.ADMIN,
        },
        '203.0.113.42',
        dto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.voter.create).not.toHaveBeenCalled();
    expect(transaction.consentRecord.create).not.toHaveBeenCalled();
  });

  it('rejects a voting place from another tenant', async () => {
    const transaction = buildTransaction();
    transaction.politicalDivision.findFirst.mockResolvedValue(null);
    const service = new VoterService(
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

    await expect(
      service.create(
        { tenantId: 'tenant-a', userId: 'user-a', role: Role.ADMIN },
        '203.0.113.42',
        {
          ...dto,
          puestoId: 'puesto-from-tenant-b',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.politicalDivision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'puesto-from-tenant-b',
        tenantId: 'tenant-a',
        type: 'PUESTO',
      },
      select: { id: true },
    });
    expect(transaction.voter.create).not.toHaveBeenCalled();
  });

  it('returns 403 for voter reads and statistics in public-office mode', async () => {
    const findMany = jest.fn();
    const count = jest.fn();
    const service = new VoterService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
            type: TenantType.PUBLIC_OFFICE,
          }),
        },
        voter: { findMany, count },
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    const user = {
      userId: 'admin-a',
      tenantId: 'tenant-a',
      role: 'ADMIN',
    };
    await expect(service.findAll(user, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getStats(user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('denies capture outside the persisted coordinator territory', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst.mockResolvedValue({
      role: Role.ZONE_COORDINATOR,
      divisionId: 'zone-a',
    });
    transaction.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'puesto-b', parentId: null },
    ]);
    const hashIp = jest.fn();
    const service = new VoterService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      { hashIp } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.create(
        {
          tenantId: 'tenant-from-token',
          userId: 'coordinator-a',
          role: Role.ADMIN,
        },
        '203.0.113.42',
        { ...dto, puestoId: 'puesto-b' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(hashIp).not.toHaveBeenCalled();
    expect(transaction.politicalDivision.findFirst).not.toHaveBeenCalled();
    expect(transaction.voter.findUnique).not.toHaveBeenCalled();
    expect(transaction.voter.create).not.toHaveBeenCalled();
  });

  it('persists the tenant, collector and allowed puesto from the current assignment', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst.mockResolvedValue({
      role: Role.VOLUNTEER,
      divisionId: 'zone-a',
    });
    transaction.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'puesto-outside', parentId: null },
    ]);
    const service = new VoterService(
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

    await expect(
      service.create(
        {
          tenantId: 'tenant-from-token',
          userId: 'volunteer-a',
          // La autorización efectiva se toma de la base de datos.
          role: Role.ADMIN,
        },
        '203.0.113.42',
        { ...dto, puestoId: 'puesto-a' },
      ),
    ).resolves.toEqual({ received: true });

    expect(transaction.politicalDivision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'puesto-a',
        tenantId: 'tenant-from-token',
        type: DivisionType.PUESTO,
      },
      select: { id: true },
    });
    expect(transaction.captured.voterData).toMatchObject({
      tenantId: 'tenant-from-token',
      registrarId: 'volunteer-a',
      puestoId: 'puesto-a',
    });
    expect(JSON.stringify(transaction.captured.voterData)).not.toContain(
      'puesto-outside',
    );
  });

  it('returns only assigned PUESTO divisions in the capture context', async () => {
    const divisionFindMany = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'zone-a', parentId: null },
        { id: 'puesto-a', parentId: 'zone-a' },
        { id: 'puesto-b', parentId: 'zone-a' },
        { id: 'puesto-outside', parentId: null },
      ])
      .mockResolvedValueOnce([
        { id: 'puesto-a', code: 'P-01', name: 'Colegio Central' },
        { id: 'puesto-b', code: 'P-02', name: 'Escuela Norte' },
      ]);
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.ZONE_COORDINATOR,
          divisionId: 'zone-a',
        }),
      },
      politicalDivision: { findMany: divisionFindMany },
    };
    const service = new VoterService(
      prisma as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    const result = await service.getCaptureContext({
      tenantId: 'tenant-a',
      userId: 'coordinator-a',
      role: Role.ADMIN,
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'coordinator-a',
        tenantId: 'tenant-a',
        isActive: true,
      },
      select: { role: true, divisionId: true },
    });
    const puestosQuery = divisionFindMany.mock.calls[1][0];
    expect(puestosQuery).toMatchObject({
      where: {
        tenantId: 'tenant-a',
        type: DivisionType.PUESTO,
      },
      select: { id: true, code: true, name: true },
    });
    expect(puestosQuery.where.id.in).toEqual(
      expect.arrayContaining(['zone-a', 'puesto-a', 'puesto-b']),
    );
    expect(puestosQuery.where.id.in).not.toContain('puesto-outside');
    expect(result).toEqual({
      puestos: [
        { id: 'puesto-a', code: 'P-01', name: 'Colegio Central' },
        { id: 'puesto-b', code: 'P-02', name: 'Escuela Norte' },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('tenant-a');
  });

  it('fails closed when a scoped collector has no assigned voting place', async () => {
    const transaction = buildTransaction();
    transaction.user.findFirst.mockResolvedValue({
      role: Role.VOLUNTEER,
      divisionId: 'zone-a',
    });
    transaction.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
    ]);
    const service = new VoterService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      {} as ConsentEvidenceService,
    );

    await expect(
      service.create(
        {
          tenantId: 'tenant-from-token',
          userId: 'volunteer-a',
          role: Role.ADMIN,
        },
        '203.0.113.42',
        dto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.voter.findUnique).not.toHaveBeenCalled();
    expect(transaction.voter.create).not.toHaveBeenCalled();
  });

  it('returns the same receipt for an existing record without exposing identity', async () => {
    const transaction = buildTransaction();
    transaction.voter.findUnique.mockResolvedValue({ id: 'existing-voter' });
    const hashIp = jest.fn();
    const service = new VoterService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      { hashIp } as unknown as ConsentEvidenceService,
    );

    await expect(
      service.create(
        {
          tenantId: 'tenant-from-token',
          userId: 'admin-a',
          role: Role.ADMIN,
        },
        '203.0.113.42',
        dto,
      ),
    ).resolves.toEqual({ received: true });

    expect(hashIp).not.toHaveBeenCalled();
    expect(transaction.voter.create).not.toHaveBeenCalled();
    expect(transaction.consentRecord.create).not.toHaveBeenCalled();
  });

  describe('privacy-preserving voter search', () => {
    const campaignTenant = {
      defaultMode: PoliticalOperationMode.CAMPAIGN,
      type: TenantType.CANDIDACY,
    };
    const user = {
      tenantId: 'tenant-a',
      userId: 'actor-a',
      role: Role.ADMIN,
    };

    function buildReadService({
      actor = { role: Role.ADMIN, divisionId: null },
      divisions = [],
      voters = [],
    }: {
      actor?: { role: Role; divisionId: string | null };
      divisions?: Array<{ id: string; parentId: string | null }>;
      voters?: Array<Record<string, unknown>>;
    } = {}) {
      const findMany = jest.fn().mockResolvedValue(voters);
      const count = jest.fn().mockResolvedValue(voters.length);
      const prisma = {
        tenant: { findUnique: jest.fn().mockResolvedValue(campaignTenant) },
        user: { findFirst: jest.fn().mockResolvedValue(actor) },
        politicalDivision: {
          findMany: jest.fn().mockResolvedValue(divisions),
        },
        voter: { findMany, count },
      };

      return {
        service: new VoterService(
          prisma as unknown as PrismaService,
          {} as ConsentEvidenceService,
        ),
        prisma,
        findMany,
        count,
      };
    }

    it('uses contains for names but only normalized exact equality for document and phone', async () => {
      const { service, findMany, count } = buildReadService({
        voters: [
          {
            id: 'voter-a',
            documentId: '1012345678',
            firstName: 'MarÃ­a',
            lastName: 'PÃ©rez',
            phone: '300 123 4567',
            mesa: 12,
            isSignatureValid: false,
            consentAccepted: true,
            consentTimestamp: new Date('2026-08-01T12:00:00.000Z'),
            createdAt: new Date('2026-08-01T12:00:00.000Z'),
            puesto: { name: 'Puesto Central' },
            registrar: { name: 'Operador autorizado' },
          },
        ],
      });

      const result = await service.search(user, {
        search: '  +57 (300) 123-4567  ',
      });

      const where = findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where).toEqual({
        tenantId: 'tenant-a',
        OR: [
          {
            firstName: {
              contains: '+57 (300) 123-4567',
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: '+57 (300) 123-4567',
              mode: 'insensitive',
            },
          },
          {
            documentId: {
              equals: '+57 (300) 123-4567',
              mode: 'insensitive',
            },
          },
          { phone: { equals: '+573001234567' } },
        ],
      });
      expect(JSON.stringify((where.OR as unknown[]).slice(2))).not.toContain(
        'contains',
      );
      expect(count).toHaveBeenCalledWith({ where });
      expect(result.items[0]).toMatchObject({
        id: 'voter-a',
        documentIdMasked: '******5678',
        phoneMasked: '********4567',
      });
      expect(result.items[0]).not.toHaveProperty('documentId');
      expect(result.items[0]).not.toHaveProperty('phone');
    });

    it('always scopes exact PII searches to the JWT tenant and ignores injected tenant input', async () => {
      const { service, findMany, count } = buildReadService();
      const maliciousBody = {
        search: '1012345678',
        tenantId: 'tenant-b',
      } as unknown as SearchVotersDto;

      await service.search(user, maliciousBody);

      const where = findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where).toMatchObject({ tenantId: 'tenant-a' });
      expect(where).not.toHaveProperty('tenantId', 'tenant-b');
      expect(count).toHaveBeenCalledWith({ where });
    });

    it('keeps GET pagination free of search predicates even with an injected property', async () => {
      const { service, findMany, count } = buildReadService();
      const injectedQuery = {
        page: 1,
        limit: 25,
        search: '1012345678',
      } as unknown as ListVotersQueryDto;

      await service.findAll(user, injectedQuery);

      const where = findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where).toEqual({ tenantId: 'tenant-a' });
      expect(where).not.toHaveProperty('OR');
      expect(count).toHaveBeenCalledWith({ where });
    });

    it('keeps the persisted territorial scope when searching exact PII', async () => {
      const { service, prisma, findMany, count } = buildReadService({
        actor: { role: Role.ZONE_COORDINATOR, divisionId: 'zone-a' },
        divisions: [
          { id: 'zone-a', parentId: null },
          { id: 'puesto-a', parentId: 'zone-a' },
          { id: 'puesto-outside', parentId: null },
        ],
      });

      await service.search(
        { ...user, role: Role.ADMIN },
        { search: '3001234567' },
      );

      expect(prisma.politicalDivision.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-a' },
        select: { id: true, parentId: true },
      });
      const where = findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where).toMatchObject({
        tenantId: 'tenant-a',
        puestoId: { in: ['zone-a', 'puesto-a'] },
      });
      expect(JSON.stringify(where)).not.toContain('puesto-outside');
      expect(count).toHaveBeenCalledWith({ where });
    });
  });
});
