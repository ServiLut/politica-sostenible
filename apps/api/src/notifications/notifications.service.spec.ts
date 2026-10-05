import { TaskStatus } from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationsService,
  TASK_REMINDER_BATCH_SIZE,
} from './notifications.service';

const NOW = new Date('2026-09-07T12:00:00.000Z');

describe('NotificationsService tenant isolation', () => {
  let findMany: jest.Mock;
  let service: NotificationsService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    findMany = jest.fn();
    service = new NotificationsService({
      task: { findMany },
    } as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads one bounded page scoped to the requested tenant', async () => {
    findMany.mockResolvedValue([
      { id: 'task-a', assignee: { phone: '3000000000' } },
      { id: 'task-b', assignee: null },
    ]);

    const result = await service.findTaskReminderCandidates('tenant-a');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        status: {
          in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
        },
        dueAt: {
          gte: NOW,
          lte: new Date('2026-09-10T12:00:00.000Z'),
        },
        assigneeId: { not: null },
      },
      select: {
        id: true,
        assignee: { select: { phone: true } },
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: TASK_REMINDER_BATCH_SIZE,
    });
    expect(result).toEqual({ candidateRecipients: 1, nextCursor: null });
  });

  it('uses an explicit cursor and returns the next bounded-page cursor', async () => {
    findMany.mockResolvedValue(
      Array.from({ length: TASK_REMINDER_BATCH_SIZE }, (_, index) => ({
        id: `task-${index}`,
        assignee: { phone: '3000000000' },
      })),
    );

    const result = await service.findTaskReminderCandidates(
      'tenant-a',
      'previous-task',
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
        cursor: { id: 'previous-task' },
        skip: 1,
        take: TASK_REMINDER_BATCH_SIZE,
      }),
    );
    expect(result).toEqual({
      candidateRecipients: TASK_REMINDER_BATCH_SIZE,
      nextCursor: `task-${TASK_REMINDER_BATCH_SIZE - 1}`,
    });
  });

  it('counts only active task recipients within the tenant and reminder window', async () => {
    const dueAt = new Date('2026-09-08T12:00:00.000Z');
    const assigned = {
      tenantId: 'tenant-a',
      dueAt,
      assigneeId: 'recipient-a',
      assignee: { phone: '3000000000' },
    };
    const records = [
      ...Object.values(TaskStatus).map((status) => ({
        ...assigned,
        id: `task-${status}`,
        status,
      })),
      {
        ...assigned,
        id: 'other-tenant',
        tenantId: 'tenant-b',
        status: TaskStatus.TODO,
      },
      {
        ...assigned,
        id: 'outside-window',
        dueAt: new Date('2026-09-11T12:00:00.000Z'),
        status: TaskStatus.TODO,
      },
      {
        ...assigned,
        id: 'unassigned',
        assigneeId: null,
        assignee: null,
        status: TaskStatus.TODO,
      },
      {
        ...assigned,
        id: 'no-phone',
        assignee: { phone: null },
        status: TaskStatus.TODO,
      },
    ];
    // Emulate the repository boundary against mixed records so an overly broad
    // predicate changes the observable recipient count, including CANCELLED.
    findMany.mockImplementation(
      (query: {
        where: {
          tenantId: string;
          status: { in?: TaskStatus[]; not?: TaskStatus };
          dueAt: { gte: Date; lte: Date };
          assigneeId: { not: null };
        };
        take: number;
      }) =>
        records
          .filter((task) => {
            const { where } = query;
            return (
              task.tenantId === where.tenantId &&
              (!where.status.in || where.status.in.includes(task.status)) &&
              (!where.status.not || task.status !== where.status.not) &&
              task.dueAt >= where.dueAt.gte &&
              task.dueAt <= where.dueAt.lte &&
              task.assigneeId !== where.assigneeId.not
            );
          })
          .slice(0, query.take),
    );

    await expect(
      service.findTaskReminderCandidates('tenant-a'),
    ).resolves.toEqual({ candidateRecipients: 3, nextCursor: null });
  });
});
