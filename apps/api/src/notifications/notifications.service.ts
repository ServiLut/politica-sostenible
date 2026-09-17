import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus } from '../../prisma/generated/prisma';

export const TASK_REMINDER_BATCH_SIZE = 100;

export interface TaskReminderCandidateBatchResult {
  candidateRecipients: number;
  nextCursor: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findTaskReminderCandidates(
    tenantId: string,
    cursor?: string,
  ): Promise<TaskReminderCandidateBatchResult> {
    this.logger.log(
      'Consultando candidatos a recordatorio; no existe un canal de envío configurado',
    );

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
      `Candidatos a recordatorio con teléfono: ${count}; no se envió ningún mensaje.`,
    );

    return {
      candidateRecipients: count,
      nextCursor:
        tasks.length === TASK_REMINDER_BATCH_SIZE
          ? (tasks.at(-1)?.id ?? null)
          : null,
    };
  }
}
