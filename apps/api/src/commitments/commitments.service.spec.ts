import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PoliticalOperationMode, Role } from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CommitmentsService } from './commitments.service';

describe('CommitmentsService tenant and mode isolation', () => {
  const currentUser: AuthenticatedUser = {
    userId: 'manager-a',
    tenantId: 'tenant-a',
    role: Role.CAMPAIGN_MANAGER,
  };
  const caseWorker: AuthenticatedUser = {
    userId: 'case-worker-a',
    tenantId: 'tenant-a',
    // Deliberately stale: authorization must use the current database role.
    role: Role.ADMIN,
  };

  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    issueCase: { findFirst: jest.Mock };
    commitment: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: CommitmentsService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ defaultMode: PoliticalOperationMode.CAMPAIGN }),
      },
      user: {
        findFirst: jest
          .fn()
          .mockImplementation(({ select }) =>
            Promise.resolve(
              'role' in select
                ? { role: Role.CAMPAIGN_MANAGER }
                : { id: 'user-a' },
            ),
          ),
      },
      issueCase: { findFirst: jest.fn() },
      commitment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new CommitmentsService(prisma as unknown as PrismaService);
  });

  it('rejects an owner that does not belong to the JWT tenant', async () => {
    prisma.commitment.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockImplementation(({ select }) =>
      Promise.resolve(
        'role' in select ? { role: Role.CAMPAIGN_MANAGER } : null,
      ),
    );

    await expect(
      service.create(currentUser, {
        reference: 'CMP-001',
        title: 'Mejorar una vía',
        description: 'Compromiso verificable',
        ownerId: 'owner-from-tenant-b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'owner-from-tenant-b',
        tenantId: 'tenant-a',
        isActive: true,
      },
      select: { id: true },
    });
    expect(prisma.commitment.create).not.toHaveBeenCalled();
  });

  it('does not update a commitment owned by another tenant', async () => {
    prisma.commitment.findFirst.mockResolvedValue(null);

    await expect(
      service.update(currentUser, 'commitment-from-tenant-b', { progress: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.commitment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'commitment-from-tenant-b',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      },
      select: {
        id: true,
        reference: true,
        status: true,
        ownerId: true,
        issueCaseId: true,
      },
    });
    expect(prisma.commitment.update).not.toHaveBeenCalled();
  });

  it('rejects an issue case from the other political operation mode', async () => {
    prisma.commitment.findFirst.mockResolvedValue(null);
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.create(currentUser, {
        reference: 'CMP-002',
        title: 'Atender solicitudes',
        description: 'No mezclar gestión pública con campaña',
        issueCaseId: 'public-office-case',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'public-office-case',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      },
      select: { id: true },
    });
    expect(prisma.commitment.create).not.toHaveBeenCalled();
  });

  it('always scopes paginated reads to JWT tenant and server-side mode', async () => {
    await service.findAll(currentUser, { page: 3, limit: 5 });

    expect(prisma.commitment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
        },
        skip: 10,
        take: 5,
      }),
    );
    expect(prisma.commitment.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      },
    });
  });

  it('returns 403 when a volunteer tries to create a commitment', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.VOLUNTEER });
    await expect(
      service.create(
        { ...currentUser, userId: 'volunteer-a', role: Role.VOLUNTEER },
        {
          reference: 'CMP-403',
          title: 'Compromiso no autorizado',
          description: 'No debe persistirse',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.commitment.create).not.toHaveBeenCalled();
    expect(prisma.commitment.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 when a witness tries to update a commitment', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.WITNESS });
    await expect(
      service.update(
        { ...currentUser, userId: 'witness-a', role: Role.WITNESS },
        'commitment-a',
        { progress: 100 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.commitment.findFirst).not.toHaveBeenCalled();
    expect(prisma.commitment.update).not.toHaveBeenCalled();
  });

  it('does not let a public-office manager write campaign commitments', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });
    await expect(
      service.create(
        {
          ...currentUser,
          userId: 'case-worker-a',
          role: Role.CASE_WORKER,
        },
        {
          reference: 'CMP-MODE',
          title: 'Compromiso fuera de modo',
          description: 'Debe quedar aislado',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.commitment.create).not.toHaveBeenCalled();
  });

  it('forces low-privilege readers to public commitments with a safe projection', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.WITNESS });
    prisma.commitment.findMany.mockResolvedValue([
      { id: 'public-only', reference: 'CMP-PUBLIC', isPublic: true },
    ]);
    prisma.commitment.count.mockResolvedValue(1);

    const result = await service.findAll(
      { ...currentUser, userId: 'witness-a', role: Role.ADMIN },
      { page: 1, limit: 20 },
    );

    expect(prisma.commitment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          isPublic: true,
        },
        select: expect.not.objectContaining({
          issueCase: expect.anything(),
          issueCaseId: true,
          owner: expect.anything(),
          ownerId: true,
          evidencePath: true,
        }) as object,
      }),
    );
    expect(prisma.commitment.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        isPublic: true,
      },
    });
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'public-only', canUpdate: false }),
    ]);
    expect(result.permissions).toEqual({
      canCreate: false,
      canReadInternal: false,
    });
  });

  it.each([
    ['private visibility', { isPublic: 'false' as const }],
    ['case filter', { issueCaseId: 'case-private' }],
    ['owner filter', { ownerId: 'owner-private' }],
  ])('rejects a low-privilege %s query', async (_case, query) => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.VOLUNTEER });

    await expect(
      service.findAll(
        { ...currentUser, userId: 'volunteer-a', role: Role.ADMIN },
        { page: 1, limit: 20, ...query },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.commitment.findMany).not.toHaveBeenCalled();
    expect(prisma.commitment.count).not.toHaveBeenCalled();
  });

  it('uses the current database role instead of a stale elevated JWT role', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.WITNESS });

    await expect(
      service.create(
        { ...currentUser, role: Role.ADMIN, userId: 'former-admin' },
        {
          reference: 'CMP-STALE',
          title: 'No autorizada',
          description: 'El rol persistido manda',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.commitment.create).not.toHaveBeenCalled();
  });

  it('scopes CASE_WORKER reads to assigned cases, own case-less records, or public records', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });
    prisma.commitment.findMany.mockResolvedValue([
      {
        id: 'assigned-private',
        reference: 'CMP-ASSIGNED',
        isPublic: false,
        ownerId: null,
        issueCaseId: 'case-a',
        issueCase: { assigneeId: 'case-worker-a' },
      },
      {
        id: 'own-private',
        reference: 'CMP-OWN',
        isPublic: false,
        ownerId: 'case-worker-a',
        issueCaseId: null,
        issueCase: null,
      },
      {
        id: 'global-public',
        reference: 'CMP-PUBLIC',
        isPublic: true,
        ownerId: 'case-worker-b',
        issueCaseId: 'case-b',
        issueCase: { assigneeId: 'case-worker-b' },
      },
      {
        id: 'unowned-public',
        reference: 'CMP-UNOWNED-PUBLIC',
        isPublic: true,
        ownerId: null,
        issueCaseId: null,
        issueCase: null,
      },
    ]);
    prisma.commitment.count.mockResolvedValue(4);

    const result = await service.findAll(caseWorker, { page: 1, limit: 20 });

    expect(prisma.commitment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          AND: [
            {
              OR: [
                { isPublic: true },
                {
                  issueCase: { is: { assigneeId: 'case-worker-a' } },
                },
                {
                  issueCaseId: null,
                  ownerId: 'case-worker-a',
                },
              ],
            },
          ],
        },
        select: expect.objectContaining({
          ownerId: true,
          issueCaseId: true,
          issueCase: { select: { assigneeId: true } },
        }) as object,
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'assigned-private', canUpdate: true }),
      expect.objectContaining({ id: 'own-private', canUpdate: true }),
      expect.objectContaining({ id: 'global-public', canUpdate: false }),
      expect.objectContaining({ id: 'unowned-public', canUpdate: false }),
    ]);
    expect(result.items[0]).not.toHaveProperty('ownerId');
    expect(result.items[0]).not.toHaveProperty('issueCaseId');
    expect(result.items[0]).not.toHaveProperty('issueCase');
    expect(result.items[2]).not.toHaveProperty('ownerId');
    expect(result.items[2]).not.toHaveProperty('issueCaseId');
    expect(result.items[2]).not.toHaveProperty('issueCase');
    expect(result.permissions).toEqual({
      canCreate: true,
      canReadInternal: true,
    });
    expect(prisma.commitment.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        AND: [
          {
            OR: [
              { isPublic: true },
              { issueCase: { is: { assigneeId: 'case-worker-a' } } },
              { issueCaseId: null, ownerId: 'case-worker-a' },
            ],
          },
        ],
      },
    });
  });

  it('rejects a CASE_WORKER owner filter for another user', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });

    await expect(
      service.findAll(caseWorker, {
        page: 1,
        limit: 20,
        ownerId: 'case-worker-b',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.commitment.findMany).not.toHaveBeenCalled();
    expect(prisma.commitment.count).not.toHaveBeenCalled();
  });

  it('rejects a CASE_WORKER filter for a case not assigned to the current user', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.findAll(caseWorker, {
        page: 1,
        limit: 20,
        issueCaseId: 'case-worker-b-case',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'case-worker-b-case',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        assigneeId: 'case-worker-a',
      },
      select: { id: true },
    });
    expect(prisma.commitment.findMany).not.toHaveBeenCalled();
    expect(prisma.commitment.count).not.toHaveBeenCalled();
  });

  it('makes a case-less CASE_WORKER commitment owned by the current user', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });
    prisma.commitment.findFirst.mockResolvedValue(null);
    prisma.commitment.create.mockResolvedValue({
      id: 'commitment-own',
      ownerId: 'case-worker-a',
      issueCaseId: null,
    });

    const result = await service.create(caseWorker, {
      reference: 'CMP-OWN',
      title: 'Seguimiento propio',
      description: 'No queda como compromiso privado global',
    });

    expect(prisma.commitment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          ownerId: 'case-worker-a',
          issueCaseId: undefined,
        }) as object,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 'commitment-own', canUpdate: true }),
    );
  });

  it('does not let CASE_WORKER create a commitment for another owner or case', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });

    await expect(
      service.create(caseWorker, {
        reference: 'CMP-OTHER-OWNER',
        title: 'Propietario ajeno',
        description: 'Debe rechazarse antes de consultar compromisos',
        ownerId: 'case-worker-b',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.commitment.findFirst.mockResolvedValue(null);
    prisma.issueCase.findFirst.mockResolvedValue(null);
    await expect(
      service.create(caseWorker, {
        reference: 'CMP-OTHER-CASE',
        title: 'Caso ajeno',
        description: 'Debe exigir asignación al usuario actual',
        issueCaseId: 'case-worker-b-case',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'case-worker-b-case',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        assigneeId: 'case-worker-a',
      },
      select: { id: true },
    });
    expect(prisma.commitment.create).not.toHaveBeenCalled();
  });

  it('updates only a CASE_WORKER assigned-case or own case-less commitment', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });
    prisma.commitment.findFirst.mockResolvedValue({
      id: 'commitment-assigned',
      reference: 'CMP-ASSIGNED',
      status: 'PROPOSED',
      ownerId: null,
      issueCaseId: 'case-a',
    });
    prisma.commitment.update.mockResolvedValue({
      id: 'commitment-assigned',
      progress: 60,
    });

    const result = await service.update(caseWorker, 'commitment-assigned', {
      progress: 60,
    });

    const scopedWhere = {
      id: 'commitment-assigned',
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.PUBLIC_OFFICE,
      AND: [
        {
          OR: [
            { issueCase: { is: { assigneeId: 'case-worker-a' } } },
            { issueCaseId: null, ownerId: 'case-worker-a' },
          ],
        },
      ],
    };
    expect(prisma.commitment.findFirst).toHaveBeenCalledWith({
      where: scopedWhere,
      select: {
        id: true,
        reference: true,
        status: true,
        ownerId: true,
        issueCaseId: true,
      },
    });
    expect(prisma.commitment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: scopedWhere, data: { progress: 60 } }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 'commitment-assigned', canUpdate: true }),
    );
  });

  it('hides a foreign or global public commitment from CASE_WORKER updates', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });
    prisma.commitment.findFirst.mockResolvedValue(null);

    await expect(
      service.update(caseWorker, 'global-or-foreign', { progress: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.commitment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'global-or-foreign',
          AND: expect.any(Array) as unknown[],
        }) as object,
      }),
    );
    expect(prisma.commitment.update).not.toHaveBeenCalled();
  });

  it('does not let CASE_WORKER link an owned commitment to another worker case', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });
    prisma.commitment.findFirst.mockResolvedValue({
      id: 'commitment-own',
      reference: 'CMP-OWN',
      status: 'PROPOSED',
      ownerId: 'case-worker-a',
      issueCaseId: null,
    });
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.update(caseWorker, 'commitment-own', {
        issueCaseId: 'case-worker-b-case',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'case-worker-b-case',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        assigneeId: 'case-worker-a',
      },
      select: { id: true },
    });
    expect(prisma.commitment.update).not.toHaveBeenCalled();
  });

  it('does not let CASE_WORKER orphan a case-less commitment', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });
    prisma.commitment.findFirst.mockResolvedValue({
      id: 'commitment-own',
      reference: 'CMP-OWN',
      status: 'PROPOSED',
      ownerId: 'case-worker-a',
      issueCaseId: null,
    });

    await expect(
      service.update(caseWorker, 'commitment-own', { ownerId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.commitment.update).not.toHaveBeenCalled();
  });
});
