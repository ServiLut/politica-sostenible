import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PoliticalOperationMode,
  Role,
  TaskStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

describe('TasksService tenant and mode isolation', () => {
  const currentUser: AuthenticatedUser = {
    userId: 'creator-a',
    tenantId: 'tenant-a',
    role: Role.ADMIN,
  };

  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock; findMany: jest.Mock };
    issueCase: { findFirst: jest.Mock };
    commitment: { findFirst: jest.Mock };
    politicalDivision: { findMany: jest.Mock };
    task: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: TasksService;

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
              'role' in select ? { role: Role.ADMIN } : { id: 'user-a' },
            ),
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      issueCase: { findFirst: jest.fn() },
      commitment: { findFirst: jest.fn() },
      politicalDivision: { findMany: jest.fn() },
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new TasksService(prisma as unknown as PrismaService);
  });

  it('lists only active assignees from the JWT tenant for a global manager', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'creator-a',
        name: 'Administración',
        role: Role.ADMIN,
        division: null,
      },
    ]);

    await expect(service.listAssignees(currentUser)).resolves.toEqual([
      expect.objectContaining({ id: 'creator-a', role: Role.ADMIN }),
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        division: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  });

  it('limits a zone coordinator assignee catalog to self and territorial scope', async () => {
    prisma.user.findFirst.mockResolvedValue({
      role: Role.ZONE_COORDINATOR,
      divisionId: 'zone-a',
    });
    prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'place-a', parentId: 'zone-a' },
    ]);

    await service.listAssignees({
      ...currentUser,
      userId: 'coordinator-a',
      role: Role.ZONE_COORDINATOR,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          isActive: true,
          OR: [
            { id: 'coordinator-a' },
            { divisionId: { in: ['zone-a', 'place-a'] } },
          ],
        },
      }),
    );
  });

  it('only offers the current case worker as an assignee', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CASE_WORKER,
      divisionId: null,
    });

    await service.listAssignees({
      ...currentUser,
      userId: 'case-worker-a',
      role: Role.CASE_WORKER,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          isActive: true,
          id: 'case-worker-a',
        },
      }),
    );
  });

  it('rejects an assignee that does not belong to the JWT tenant', async () => {
    prisma.user.findFirst.mockImplementation(
      ({ where, select }: { where: { id: string }; select: object }) =>
        Promise.resolve(
          'role' in select
            ? { role: Role.ADMIN }
            : where.id === currentUser.userId
              ? { id: where.id }
              : null,
        ),
    );

    await expect(
      service.create(currentUser, {
        title: 'Visitar el barrio',
        assigneeId: 'user-from-tenant-b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'user-from-tenant-b',
        tenantId: 'tenant-a',
        isActive: true,
      },
      select: { id: true },
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('does not update a task owned by another tenant', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.update(currentUser, 'task-from-tenant-b', { title: 'Ataque' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-from-tenant-b',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      },
      select: {
        id: true,
        status: true,
        assigneeId: true,
        createdById: true,
      },
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('rejects a commitment from the other political operation mode', async () => {
    prisma.user.findFirst.mockImplementation(({ select }) =>
      Promise.resolve(
        'role' in select ? { role: Role.ADMIN } : { id: currentUser.userId },
      ),
    );
    prisma.commitment.findFirst.mockResolvedValue(null);

    await expect(
      service.create(currentUser, {
        title: 'Dar seguimiento',
        commitmentId: 'public-office-commitment',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.commitment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'public-office-commitment',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      },
      select: { id: true },
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('always scopes paginated reads to JWT tenant and server-side mode', async () => {
    await service.findAll(currentUser, { page: 2, limit: 10 });

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
        },
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.task.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      },
    });
  });

  it('returns 403 when a volunteer tries to create a task', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.VOLUNTEER });
    await expect(
      service.create(
        { ...currentUser, userId: 'volunteer-a', role: Role.VOLUNTEER },
        { title: 'Tarea no autorizada' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'volunteer-a', tenantId: 'tenant-a', isActive: true },
      select: { role: true, divisionId: true },
    });
  });

  it("returns 403 when a witness updates somebody else's task", async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.WITNESS });
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-a',
      status: TaskStatus.TODO,
      assigneeId: 'other-user',
    });

    await expect(
      service.update(
        { ...currentUser, userId: 'witness-a', role: Role.WITNESS },
        'task-a',
        { status: TaskStatus.DONE },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('lets an assignee update only the status of their own task', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.VOLUNTEER });
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-a',
      status: TaskStatus.TODO,
      assigneeId: 'volunteer-a',
    });
    prisma.task.update.mockResolvedValue({
      id: 'task-a',
      status: TaskStatus.IN_PROGRESS,
    });

    await expect(
      service.update(
        { ...currentUser, userId: 'volunteer-a', role: Role.VOLUNTEER },
        'task-a',
        { status: TaskStatus.IN_PROGRESS },
      ),
    ).resolves.toEqual({ id: 'task-a', status: TaskStatus.IN_PROGRESS });

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'task-a',
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          AND: [{ assigneeId: 'volunteer-a' }],
        }) as object,
      }),
    );
  });

  it('returns 403 when an assignee tries to edit task content', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.VOLUNTEER });
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-a',
      status: TaskStatus.TODO,
      assigneeId: 'volunteer-a',
    });

    await expect(
      service.update(
        { ...currentUser, userId: 'volunteer-a', role: Role.VOLUNTEER },
        'task-a',
        { title: 'Contenido alterado' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('limits a non-manager read to tasks assigned to the current user', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.WITNESS });

    await service.findAll(
      { ...currentUser, userId: 'witness-a', role: Role.ADMIN },
      { page: 1, limit: 20 },
    );

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          assigneeId: 'witness-a',
        }) as object,
      }),
    );
    expect(prisma.task.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        assigneeId: 'witness-a',
      }) as object,
    });
  });

  it('rejects a non-manager filter for another assignee before reading tasks', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.VOLUNTEER });

    await expect(
      service.findAll(
        { ...currentUser, userId: 'volunteer-a', role: Role.ADMIN },
        { page: 1, limit: 20, assigneeId: 'other-user' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.task.count).not.toHaveBeenCalled();
  });

  it('denies a case worker from reading tasks assigned to another user', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CASE_WORKER,
      divisionId: null,
    });

    await expect(
      service.findAll(
        { ...currentUser, userId: 'case-worker-a', role: Role.ADMIN },
        { page: 1, limit: 20, assigneeId: 'case-worker-b' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.task.count).not.toHaveBeenCalled();
  });

  it('limits a case worker to owned or assigned tasks with assigned-case links', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CASE_WORKER,
      divisionId: null,
    });

    await service.findAll(
      { ...currentUser, userId: 'case-worker-a', role: Role.ADMIN },
      { page: 1, limit: 20 },
    );

    const where = prisma.task.findMany.mock.calls[0]?.[0].where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    const serializedWhere = JSON.stringify(where);
    expect(serializedWhere).toContain(
      '"OR":[{"assigneeId":"case-worker-a"},{"createdById":"case-worker-a"}]',
    );
    expect(serializedWhere).toContain('"assigneeId":"case-worker-a"');
    expect(serializedWhere).toContain('"issueCaseId":null');
    expect(serializedWhere).toContain('"commitmentId":null');
  });

  it('denies a case worker from assigning a new task to another user', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CASE_WORKER,
      divisionId: null,
    });

    await expect(
      service.create(
        { ...currentUser, userId: 'case-worker-a', role: Role.ADMIN },
        { title: 'Intento fuera de alcance', assigneeId: 'case-worker-b' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('denies a case worker from linking a task to an unassigned case', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CASE_WORKER,
      divisionId: null,
    });
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { ...currentUser, userId: 'case-worker-a', role: Role.ADMIN },
        { title: 'Caso ajeno', issueCaseId: 'case-assigned-to-somebody-else' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'case-assigned-to-somebody-else',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        AND: [
          {
            tenantId: 'tenant-a',
            mode: PoliticalOperationMode.PUBLIC_OFFICE,
            assigneeId: 'case-worker-a',
          },
        ],
      },
      select: { id: true },
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('denies a case worker from linking a task to an unrelated commitment', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CASE_WORKER,
      divisionId: null,
    });
    prisma.commitment.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { ...currentUser, userId: 'case-worker-a', role: Role.ADMIN },
        { title: 'Compromiso ajeno', commitmentId: 'commitment-other-team' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const where = prisma.commitment.findFirst.mock.calls[0]?.[0]
      .where as Record<string, unknown>;
    expect(where).toMatchObject({
      id: 'commitment-other-team',
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    const serializedWhere = JSON.stringify(where);
    expect(serializedWhere).toContain('"ownerId":"case-worker-a"');
    expect(serializedWhere).toContain('"assigneeId":"case-worker-a"');
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('denies a case worker from patching a task outside their ownership', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CASE_WORKER,
      divisionId: null,
    });
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.update(
        { ...currentUser, userId: 'case-worker-a', role: Role.ADMIN },
        'task-owned-by-another-worker',
        { status: TaskStatus.DONE },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const where = prisma.task.findFirst.mock.calls[0]?.[0].where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      id: 'task-owned-by-another-worker',
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    expect(JSON.stringify(where)).toContain(
      '"OR":[{"assigneeId":"case-worker-a"},{"createdById":"case-worker-a"}]',
    );
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('limits coordinator reads to ownership or territorial relations', async () => {
    prisma.user.findFirst.mockResolvedValue({
      role: Role.ZONE_COORDINATOR,
      divisionId: 'zone-a',
    });
    prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'zone-b', parentId: null },
    ]);

    await service.findAll(
      { ...currentUser, userId: 'coordinator-a', role: Role.ADMIN },
      { page: 1, limit: 20 },
    );

    expect(prisma.politicalDivision.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: { id: true, parentId: true },
    });
    const where = prisma.task.findMany.mock.calls[0]?.[0].where as Record<
      string,
      unknown
    >;
    const serializedWhere = JSON.stringify(where);
    expect(serializedWhere).toContain('"tenantId":"tenant-a"');
    expect(serializedWhere).toContain(
      '"divisionId":{"in":["zone-a","puesto-a"]}',
    );
    expect(serializedWhere).not.toContain('zone-b');
  });

  it('denies a coordinator from creating a task linked outside their territory', async () => {
    prisma.user.findFirst.mockResolvedValue({
      role: Role.ZONE_COORDINATOR,
      divisionId: 'zone-a',
    });
    prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'zone-b', parentId: null },
    ]);
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { ...currentUser, userId: 'coordinator-a', role: Role.ADMIN },
        { title: 'Caso fuera de zona', issueCaseId: 'case-zone-b' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const where = prisma.issueCase.findFirst.mock.calls[0]?.[0].where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      id: 'case-zone-b',
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.CAMPAIGN,
    });
    expect(JSON.stringify(where)).toContain(
      '"divisionId":{"in":["zone-a","puesto-a"]}',
    );
    expect(JSON.stringify(where)).not.toContain(
      '"divisionId":{"in":["zone-b"]}',
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('denies a coordinator from linking a task to an out-of-scope commitment', async () => {
    prisma.user.findFirst.mockResolvedValue({
      role: Role.ZONE_COORDINATOR,
      divisionId: 'zone-a',
    });
    prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'zone-b', parentId: null },
    ]);
    prisma.commitment.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { ...currentUser, userId: 'coordinator-a', role: Role.ADMIN },
        {
          title: 'Compromiso fuera de zona',
          commitmentId: 'commitment-zone-b',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const where = prisma.commitment.findFirst.mock.calls[0]?.[0]
      .where as Record<string, unknown>;
    expect(where).toMatchObject({
      id: 'commitment-zone-b',
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.CAMPAIGN,
    });
    expect(JSON.stringify(where)).toContain(
      '"divisionId":{"in":["zone-a","puesto-a"]}',
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('denies a coordinator from patching a task outside territorial scope', async () => {
    prisma.user.findFirst.mockResolvedValue({
      role: Role.ZONE_COORDINATOR,
      divisionId: 'zone-a',
    });
    prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'zone-b', parentId: null },
    ]);
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.update(
        { ...currentUser, userId: 'coordinator-a', role: Role.ADMIN },
        'task-zone-b',
        { title: 'Intento de cambio global' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const where = prisma.task.findFirst.mock.calls[0]?.[0].where as Record<
      string,
      unknown
    >;
    expect(where).toMatchObject({
      id: 'task-zone-b',
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.CAMPAIGN,
    });
    expect(JSON.stringify(where)).toContain(
      '"divisionId":{"in":["zone-a","puesto-a"]}',
    );
    expect(JSON.stringify(where)).not.toContain(
      '"divisionId":{"in":["zone-b"]}',
    );
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('uses the current database role instead of a stale elevated JWT role', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.WITNESS });

    await expect(
      service.create(
        { ...currentUser, role: Role.ADMIN, userId: 'former-admin' },
        { title: 'No autorizada' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.task.create).not.toHaveBeenCalled();
  });
});
