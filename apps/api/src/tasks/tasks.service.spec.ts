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
    user: { findFirst: jest.Mock };
    issueCase: { findFirst: jest.Mock };
    commitment: { findFirst: jest.Mock };
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
      user: { findFirst: jest.fn() },
      issueCase: { findFirst: jest.fn() },
      commitment: { findFirst: jest.fn() },
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

  it('rejects an assignee that does not belong to the JWT tenant', async () => {
    prisma.user.findFirst.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === currentUser.userId ? { id: where.id } : null,
        ),
    );

    await expect(
      service.create(currentUser, {
        title: 'Visitar el barrio',
        assigneeId: 'user-from-tenant-b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-from-tenant-b', tenantId: 'tenant-a' },
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
      select: { id: true, status: true, assigneeId: true },
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('rejects a commitment from the other political operation mode', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: currentUser.userId });
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
    await expect(
      service.create(
        { ...currentUser, userId: 'volunteer-a', role: Role.VOLUNTEER },
        { title: 'Tarea no autorizada' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("returns 403 when a witness updates somebody else's task", async () => {
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
        where: {
          id: 'task-a',
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
        },
      }),
    );
  });

  it('returns 403 when an assignee tries to edit task content', async () => {
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
});
