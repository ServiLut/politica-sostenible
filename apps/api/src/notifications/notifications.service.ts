import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus } from '../../prisma/generated/prisma';

export const TASK_REMINDER_BATCH_SIZE = 100;

export interface TaskReminderBatchResult {
  pendingRecipients: number;
  nextCursor: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendTaskReminders(
    tenantId: string,
    cursor?: string,
  ): Promise<TaskReminderBatchResult> {
    this.logger.log('Iniciando envío de recordatorios de tareas (WhatsApp)...');

    const now = new Date();
    const in3Days = new Date(now);
    in3Days.setUTCDate(in3Days.getUTCDate() + 3);

    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        status: { not: TaskStatus.DONE },
        dueAt: {
          gte: now,
          lte: in3Days,
        },
        assigneeId: { not: null },
      },
      select: {
        id: true,
        assignee: {
          select: { phone: true },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: TASK_REMINDER_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    let count = 0;
    for (const task of tasks) {
      if (task.assignee && task.assignee.phone) {
        count++;
      }
    }

    this.logger.log(
      `Recordatorios de tareas: ${count} pendientes de canal de envío.`,
    );

    return {
      pendingRecipients: count,
      nextCursor:
        tasks.length === TASK_REMINDER_BATCH_SIZE
          ? (tasks.at(-1)?.id ?? null)
          : null,
    };
  }
}
