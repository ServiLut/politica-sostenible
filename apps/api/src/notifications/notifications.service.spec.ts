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

    const result = await service.sendTaskReminders('tenant-a');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        status: { not: TaskStatus.DONE },
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
    expect(result).toEqual({ pendingRecipients: 1, nextCursor: null });
  });

  it('uses an explicit cursor and returns the next bounded-page cursor', async () => {
    findMany.mockResolvedValue(
      Array.from({ length: TASK_REMINDER_BATCH_SIZE }, (_, index) => ({
        id: `task-${index}`,
        assignee: { phone: '3000000000' },
      })),
    );

    const result = await service.sendTaskReminders('tenant-a', 'previous-task');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
        cursor: { id: 'previous-task' },
        skip: 1,
        take: TASK_REMINDER_BATCH_SIZE,
      }),
    );
    expect(result).toEqual({
      pendingRecipients: TASK_REMINDER_BATCH_SIZE,
      nextCursor: `task-${TASK_REMINDER_BATCH_SIZE - 1}`,
    });
  });
});
