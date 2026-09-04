import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DivisionType,
  PoliticalOperationMode,
  Prisma,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignService } from './campaign.service';
import { CreatableDivisionType } from './dto/create-political-division.dto';
import {
  DaneDivipolaClient,
  DaneDivipolaError,
  type DaneMunicipality,
} from './dane-divipola.client';

interface DivisionUpsertInput {
  where: {
    tenantId_code_type: {
      tenantId: string;
      code: string;
      type: DivisionType;
    };
  };
  create: {
    tenantId: string;
    code: string;
    type: DivisionType;
    parentId?: string;
  };
}

interface DivisionFindManyInput {
  where: { tenantId: string };
  skip: number;
  take: number;
}

const daneData: DaneMunicipality[] = [
  {
    departmentCode: '05',
    departmentName: 'ANTIOQUIA',
    municipalityCode: '05001',
    municipalityName: 'MEDELLÍN',
  },
  {
    departmentCode: '08',
    departmentName: 'ATLÁNTICO',
    municipalityCode: '08001',
    municipalityName: 'BARRANQUILLA',
  },
];

describe('CampaignService DIVIPOLA synchronization', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('upserts every division exclusively inside the authenticated tenant', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const tenantFindUnique = jest.fn().mockResolvedValue({
      id: 'tenant-a',
      name: 'Campaign A',
      defaultMode: PoliticalOperationMode.CAMPAIGN,
      type: TenantType.CANDIDACY,
    });
    const upsert = jest
      .fn<Promise<{ id: string }>, [DivisionUpsertInput]>()
      .mockImplementation(({ create }) =>
        Promise.resolve({
          id: `${create.tenantId}-${create.type}-${create.code}`,
        }),
      );
    const deleteMany = jest.fn();
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-sync-a' });
    const fetchMunicipalities = jest.fn().mockResolvedValue(daneData);
    const prismaClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      tenant: { findUnique: tenantFindUnique },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-a' }) },
      politicalDivision: { upsert, deleteMany },
      auditEvent: { create: auditCreate },
    };
    const runTransaction = jest.fn(
      async (
        callback: (client: typeof prismaClient) => Promise<unknown>,
      ) => callback(prismaClient),
    );
    const service = new CampaignService(
      {
        ...prismaClient,
        $transaction: runTransaction,
      } as unknown as PrismaService,
      { fetchMunicipalities } as unknown as DaneDivipolaClient,
    );

    const result = await service.initializeElectoralData({
      userId: 'admin-a',
      tenantId: 'tenant-a',
    });

    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        defaultMode: true,
      },
    });
    expect(fetchMunicipalities).toHaveBeenCalledTimes(1);
    expect(tenantFindUnique).toHaveBeenCalledTimes(2);
    expect(prismaClient.user.findFirst).toHaveBeenCalledTimes(2);
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    });
    expect(upsert).toHaveBeenCalledTimes(4);
    for (const [input] of upsert.mock.calls) {
      expect(input.where.tenantId_code_type.tenantId).toBe('tenant-a');
      expect(input.create.tenantId).toBe('tenant-a');
      expect(input.where.tenantId_code_type.tenantId).not.toBe('tenant-b');
    }
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_code_type: {
            tenantId: 'tenant-a',
            code: '05001',
            type: DivisionType.MUNICIPIO,
          },
        },
        create: expect.objectContaining({
          tenantId: 'tenant-a',
          parentId: 'tenant-a-DEPARTAMENTO-05',
        }) as object,
      }),
    );
    expect(deleteMany).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        actorUserId: 'admin-a',
        action: 'POLITICAL_GEOGRAPHY_SYNCHRONIZED',
        resourceType: 'Tenant',
        resourceId: 'tenant-a',
        metadata: expect.objectContaining({
          version: '2025',
          departments: 2,
          municipalities: 2,
        }) as object,
      }),
    });
    expect(result.synchronized).toEqual({
      departments: 2,
      municipalities: 2,
    });
    expect(result.source.version).toBe('2025');
  });

  it('uses the same composite upserts on retry and never inserts unscoped data', async () => {
    const upsert = jest
      .fn<Promise<{ id: string }>, [DivisionUpsertInput]>()
      .mockImplementation(({ create }) =>
        Promise.resolve({ id: `${create.type}-${create.code}` }),
      );
    const prismaClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-a',
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-a' }) },
      politicalDivision: { upsert },
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-sync-a' }),
      },
    };
    const runTransaction = jest.fn(
      async (
        callback: (client: typeof prismaClient) => Promise<unknown>,
      ) => callback(prismaClient),
    );
    const service = new CampaignService(
      {
        ...prismaClient,
        $transaction: runTransaction,
      } as unknown as PrismaService,
      {
        fetchMunicipalities: jest.fn().mockResolvedValue(daneData),
      } as unknown as DaneDivipolaClient,
    );

    await service.initializeElectoralData({
      userId: 'admin-a',
      tenantId: 'tenant-a',
    });
    const firstRunKeys = upsert.mock.calls.map(
      ([input]) => input.where.tenantId_code_type,
    );
    upsert.mockClear();
    await service.initializeElectoralData({
      userId: 'admin-a',
      tenantId: 'tenant-a',
    });
    const secondRunKeys = upsert.mock.calls.map(
      ([input]) => input.where.tenantId_code_type,
    );

    expect(secondRunKeys).toEqual(firstRunKeys);
    expect(
      secondRunKeys.every(
        (key: { tenantId: string }) => key.tenantId === 'tenant-a',
      ),
    ).toBe(true);
  });

  it('does not mutate Prisma or report success when DANE fails validation', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const upsert = jest.fn();
    const service = new CampaignService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tenant-a',
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type: TenantType.CANDIDACY,
          }),
        },
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-a' }) },
        politicalDivision: { upsert },
      } as unknown as PrismaService,
      {
        fetchMunicipalities: jest
          .fn()
          .mockRejectedValue(new DaneDivipolaError('invalid response')),
      } as unknown as DaneDivipolaClient,
    );

    await expect(
      service.initializeElectoralData({
        userId: 'admin-a',
        tenantId: 'tenant-a',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('blocks a stale admin before contacting DANE or mutating territory', async () => {
    const fetchMunicipalities = jest.fn();
    const upsert = jest.fn();
    const service = new CampaignService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tenant-a',
            defaultMode: PoliticalOperationMode.CAMPAIGN,
            type: TenantType.CANDIDACY,
          }),
        },
        user: { findFirst: jest.fn().mockResolvedValue(null) },
        politicalDivision: { upsert },
      } as unknown as PrismaService,
      { fetchMunicipalities } as unknown as DaneDivipolaClient,
    );

    await expect(
      service.initializeElectoralData({
        userId: 'inactive-admin',
        tenantId: 'tenant-a',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fetchMunicipalities).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('revalidates the admin after the DANE download and before any write', async () => {
    const fetchMunicipalities = jest.fn().mockResolvedValue(daneData);
    const upsert = jest.fn();
    const auditCreate = jest.fn();
    const userFindFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'admin-a' })
      .mockResolvedValueOnce(null);
    const prismaClient = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-a',
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: userFindFirst },
      politicalDivision: { upsert },
      auditEvent: { create: auditCreate },
    };
    const runTransaction = jest.fn(
      async (
        callback: (client: typeof prismaClient) => Promise<unknown>,
      ) => callback(prismaClient),
    );
    const service = new CampaignService(
      {
        ...prismaClient,
        $transaction: runTransaction,
      } as unknown as PrismaService,
      { fetchMunicipalities } as unknown as DaneDivipolaClient,
    );

    await expect(
      service.initializeElectoralData({
        userId: 'admin-a',
        tenantId: 'tenant-a',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(fetchMunicipalities).toHaveBeenCalledTimes(1);
    expect(userFindFirst).toHaveBeenCalledTimes(2);
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects a concurrent territorial synchronization before any upsert', async () => {
    const fetchMunicipalities = jest.fn().mockResolvedValue(daneData);
    const upsert = jest.fn();
    const auditCreate = jest.fn();
    const prismaClient = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: false }]),
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-a',
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-a' }) },
      politicalDivision: { upsert },
      auditEvent: { create: auditCreate },
    };
    const service = new CampaignService(
      {
        ...prismaClient,
        $transaction: jest.fn(
          async (callback: (client: typeof prismaClient) => Promise<unknown>) =>
            callback(prismaClient),
        ),
      } as unknown as PrismaService,
      { fetchMunicipalities } as unknown as DaneDivipolaClient,
    );

    await expect(
      service.initializeElectoralData({
        userId: 'admin-a',
        tenantId: 'tenant-a',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prismaClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('lists operational divisions with an immutable tenant scope', async () => {
    const findMany = jest
      .fn<Promise<Array<{ id: string }>>, [DivisionFindManyInput]>()
      .mockResolvedValue([{ id: 'puesto-a' }]);
    const count = jest.fn().mockResolvedValue(1);
    const transaction = {
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
      politicalDivision: { findMany, count },
    };
    const service = new CampaignService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      {} as DaneDivipolaClient,
    );

    const result = await service.findDivisions(
      { userId: 'admin-a', tenantId: 'tenant-a' },
      {
        type: DivisionType.PUESTO,
        search: 'central',
        page: 2,
        limit: 10,
      },
    );

    const expectedWhere = {
      tenantId: 'tenant-a',
      type: DivisionType.PUESTO,
      OR: [
        { code: { contains: 'central', mode: 'insensitive' } },
        { name: { contains: 'central', mode: 'insensitive' } },
      ],
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        skip: 10,
        take: 10,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(findMany.mock.calls[0]?.[0].where.tenantId).not.toBe('tenant-b');
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('limits coordinators to their current division and descendants', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'zone-a', parentId: 'municipality-a' },
        { id: 'place-a', parentId: 'zone-a' },
        { id: 'zone-b', parentId: 'municipality-a' },
        { id: 'place-b', parentId: 'zone-b' },
      ])
      .mockResolvedValueOnce([{ id: 'place-a' }]);
    const count = jest.fn().mockResolvedValue(1);
    const transaction = {
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
      politicalDivision: { findMany, count },
    };
    const service = new CampaignService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      {} as DaneDivipolaClient,
    );

    await service.findDivisions(
      { userId: 'coordinator-a', tenantId: 'tenant-a' },
      { type: DivisionType.PUESTO, page: 1, limit: 25 },
    );

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { tenantId: 'tenant-a' },
      select: { id: true, parentId: true },
    });
    const scopedWhere = findMany.mock.calls[1]?.[0].where;
    expect(scopedWhere).toEqual({
      tenantId: 'tenant-a',
      type: DivisionType.PUESTO,
      id: { in: ['zone-a', 'place-a'] },
    });
    expect(scopedWhere.id.in).not.toContain('zone-b');
    expect(scopedWhere.id.in).not.toContain('place-b');
    expect(count).toHaveBeenCalledWith({ where: scopedWhere });
  });

  it('rejects a stale or inactive actor before listing divisions', async () => {
    const findMany = jest.fn();
    const count = jest.fn();
    const transaction = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      politicalDivision: { findMany, count },
    };
    const service = new CampaignService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      {} as DaneDivipolaClient,
    );

    await expect(
      service.findDivisions(
        { userId: 'inactive-a', tenantId: 'tenant-a' },
        { type: DivisionType.PUESTO, page: 1, limit: 25 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('blocks initialization before contacting DANE in public-office mode', async () => {
    const fetchMunicipalities = jest.fn();
    const upsert = jest.fn();
    const service = new CampaignService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tenant-office',
            defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
            type: TenantType.PUBLIC_OFFICE,
          }),
        },
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-a' }) },
        politicalDivision: { upsert },
      } as unknown as PrismaService,
      { fetchMunicipalities } as unknown as DaneDivipolaClient,
    );

    await expect(
      service.initializeElectoralData({
        userId: 'admin-a',
        tenantId: 'tenant-office',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fetchMunicipalities).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('blocks campaign reads and divisions in public-office mode', async () => {
    const findMany = jest.fn();
    const count = jest.fn();
    const transaction = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-office',
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.PUBLIC_OFFICE,
        }),
      },
      user: { findFirst: jest.fn() },
      politicalDivision: { findMany, count },
    };
    const service = new CampaignService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tenant-office',
            defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
            type: TenantType.PUBLIC_OFFICE,
          }),
        },
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => Promise<unknown>) =>
            callback(transaction),
        ),
      } as unknown as PrismaService,
      {} as DaneDivipolaClient,
    );

    await expect(service.getCampaign('tenant-office')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.findDivisions(
        { userId: 'office-user', tenantId: 'tenant-office' },
        {
          type: DivisionType.PUESTO,
          page: 1,
          limit: 25,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('projects the current campaign without arbitrary tenant config', async () => {
    const tenantFindUnique = jest.fn().mockResolvedValue({
      id: 'tenant-a',
      name: 'Campaign A',
      slug: 'campaign-a',
      type: TenantType.CANDIDACY,
      defaultMode: PoliticalOperationMode.CAMPAIGN,
    });
    const service = new CampaignService(
      {
        tenant: { findUnique: tenantFindUnique },
      } as unknown as PrismaService,
      {} as DaneDivipolaClient,
    );

    const result = await service.getCampaign('tenant-a');

    expect(result).not.toHaveProperty('config');
    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        defaultMode: true,
      },
    });
  });

  it('creates a tenant-scoped puesto under a compatible parent and audits it', async () => {
    const division = {
      id: 'puesto-a',
      code: 'P-001',
      name: 'Colegio Central',
      type: DivisionType.PUESTO,
      parentId: 'zone-a',
      parent: {
        id: 'zone-a',
        code: 'Z-001',
        name: 'Zona 1',
        type: DivisionType.ZONA,
      },
    };
    const tx = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-a' }) },
      politicalDivision: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'zone-a', type: DivisionType.ZONA }),
        create: jest.fn().mockResolvedValue(division),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    const transaction = jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const service = new CampaignService(
      { $transaction: transaction } as unknown as PrismaService,
      {} as DaneDivipolaClient,
    );

    await expect(
      service.createDivision(
        { userId: 'admin-a', tenantId: 'tenant-a', role: Role.VOLUNTEER },
        {
          type: CreatableDivisionType.PUESTO,
          code: ' p-001 ',
          name: 'Colegio Central',
          parentId: 'zone-a',
        },
      ),
    ).resolves.toEqual(division);

    expect(tx.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'admin-a',
        tenantId: 'tenant-a',
        role: Role.ADMIN,
        isActive: true,
      },
      select: { id: true },
    });
    expect(tx.politicalDivision.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'zone-a',
        tenantId: 'tenant-a',
        type: { in: [DivisionType.MUNICIPIO, DivisionType.ZONA] },
      },
      select: { id: true, type: true },
    });
    expect(tx.politicalDivision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId: 'tenant-a',
          type: DivisionType.PUESTO,
          code: 'P-001',
          name: 'Colegio Central',
          parentId: 'zone-a',
        },
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        actorUserId: 'admin-a',
        action: 'POLITICAL_DIVISION_CREATED',
        resourceId: 'puesto-a',
      }),
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('rejects a parent outside the tenant or hierarchy before creating', async () => {
    const tx = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-a' }) },
      politicalDivision: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      auditEvent: { create: jest.fn() },
    };
    const service = new CampaignService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      } as unknown as PrismaService,
      {} as DaneDivipolaClient,
    );

    await expect(
      service.createDivision(
        { userId: 'admin-a', tenantId: 'tenant-a', role: Role.ADMIN },
        {
          type: CreatableDivisionType.ZONA,
          code: 'Z-001',
          name: 'Zona 1',
          parentId: 'other-tenant-parent',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.politicalDivision.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
