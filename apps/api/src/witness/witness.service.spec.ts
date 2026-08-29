import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DivisionType,
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { WitnessService } from './witness.service';

describe('WitnessService tenant isolation', () => {
  it('rejects a voting place that is not owned by the JWT tenant', async () => {
    const userFindFirst = jest.fn().mockResolvedValue({
      role: Role.ADMIN,
      divisionId: null,
    });
    const divisionFindFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn();
    const service = new WitnessService({
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
      witnessReport: { findFirst: jest.fn().mockResolvedValue(null), create },
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'witness-a', {
        puestoId: 'puesto-from-tenant-b',
        mesa: 1,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
        candidateVotes: 10,
        totalTableVotes: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: 'witness-a', tenantId: 'tenant-a', isActive: true },
      select: { role: true, divisionId: true },
    });
    expect(divisionFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'puesto-from-tenant-b',
        tenantId: 'tenant-a',
        type: DivisionType.PUESTO,
      },
      select: { id: true },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an E-14 path from another tenant before querying Prisma', async () => {
    const userFindFirst = jest.fn();
    const service = new WitnessService({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: userFindFirst },
      politicalDivision: { findFirst: jest.fn() },
      witnessReport: { findFirst: jest.fn(), create: jest.fn() },
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 1,
        e14ImageUrl: 'tenant-b/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
        candidateVotes: 10,
        totalTableVotes: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('returns 403 before operational queries in public-office mode', async () => {
    const userFindFirst = jest.fn();
    const create = jest.fn();
    const service = new WitnessService({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.PUBLIC_OFFICE,
        }),
      },
      user: { findFirst: userFindFirst },
      politicalDivision: { findFirst: jest.fn() },
      witnessReport: { findFirst: jest.fn(), create },
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 1,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
        candidateVotes: 10,
        totalTableVotes: 100,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userFindFirst).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects candidate votes above the table total', async () => {
    const userFindFirst = jest.fn();
    const service = new WitnessService({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      user: { findFirst: userFindFirst },
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 1,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
        candidateVotes: 101,
        totalTableVotes: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('rejects an existing tenant, voting-place and table tuple', async () => {
    const create = jest.fn();
    const service = new WitnessService({
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
      witnessReport: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-report' }),
        create,
      },
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 42,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
        candidateVotes: 10,
        totalTableVotes: 100,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('maps a concurrent Prisma unique violation to HTTP 409', async () => {
    const transaction = {
      witnessReport: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
      storedObject: { updateMany: jest.fn() },
    };
    const service = new WitnessService({
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
      witnessReport: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);
    await expect(
      service.create('tenant-a', 'witness-a', {
        puestoId: 'puesto-a',
        mesa: 42,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
        candidateVotes: 10,
        totalTableVotes: 100,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks witness reads in public-office mode', async () => {
    const findMany = jest.fn();
    const service = new WitnessService({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.PUBLIC_OFFICE,
        }),
      },
      witnessReport: { findMany },
    } as unknown as PrismaService);

    await expect(
      service.findAll('tenant-office', 'auditor-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('projects create and list responses without the private E-14 path', async () => {
    const safeReport = {
      id: 'report-a',
      puestoId: 'puesto-a',
      mesa: 42,
      candidateVotes: 10,
      totalTableVotes: 100,
      observations: null,
      isSynced: false,
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      puesto: { code: 'P-001', name: 'Colegio Central' },
      witness: { name: 'Testigo A' },
    };
    const create = jest.fn().mockResolvedValue(safeReport);
    const findMany = jest.fn().mockResolvedValue([safeReport]);
    const transaction = {
      witnessReport: { create },
      storedObject: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new WitnessService({
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
      witnessReport: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany,
      },
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    const created = await service.create('tenant-a', 'witness-a', {
      puestoId: 'puesto-a',
      mesa: 42,
      e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
      candidateVotes: 10,
      totalTableVotes: 100,
    });
    const listed = await service.findAll('tenant-a', 'witness-a');

    expect(created).not.toHaveProperty('e14ImageUrl');
    expect(listed[0]).not.toHaveProperty('e14ImageUrl');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ e14ImageUrl: true }) as object,
      }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ e14ImageUrl: true }) as object,
      }),
    );
  });

  it('denies a witness who tries to occupy a table outside the assigned territory', async () => {
    const uploadFindFirst = jest.fn();
    const divisionFindFirst = jest.fn();
    const create = jest.fn();
    const service = new WitnessService({
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
          { id: 'zone-b', parentId: null },
          { id: 'puesto-b', parentId: 'zone-b' },
        ]),
        findFirst: divisionFindFirst,
      },
      witnessReport: { findFirst: jest.fn(), create },
    } as unknown as PrismaService);

    await expect(
      service.create('tenant-a', 'witness-a', {
        puestoId: 'puesto-b',
        mesa: 1,
        e14ImageUrl: 'tenant-a/e14/123e4567-e89b-42d3-a456-426614174000.pdf',
        candidateVotes: 10,
        totalTableVotes: 100,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(uploadFindFirst).not.toHaveBeenCalled();
    expect(divisionFindFirst).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('limits witness listings to the current database assignment', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new WitnessService({
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
      politicalDivision: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'zone-a', parentId: null },
          { id: 'puesto-a', parentId: 'zone-a' },
          { id: 'puesto-b', parentId: null },
        ]),
      },
      witnessReport: { findMany },
    } as unknown as PrismaService);

    await service.findAll('tenant-a', 'coordinator-a');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          puestoId: { in: expect.arrayContaining(['zone-a', 'puesto-a']) },
        },
      }),
    );
    expect(findMany.mock.calls[0][0].where.puestoId.in).not.toContain(
      'puesto-b',
    );
  });
});
