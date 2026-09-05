import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus } from '../../prisma/generated/prisma';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 8 * * 1-5')
  async sendTaskReminders() {
    this.logger.log('Iniciando envío de recordatorios de tareas (WhatsApp)...');

    const now = new Date();
    const in3Days = new Date();
    in3Days.setDate(now.getDate() + 3);

    const tasks = await this.prisma.task.findMany({
      where: {
        status: { not: TaskStatus.DONE },
        dueAt: {
          gte: now,
          lte: in3Days,
        },
        assigneeId: { not: null },
      },
      include: {
        assignee: true,
      },
    });

    let count = 0;
    for (const task of tasks) {
      if (task.assignee && task.assignee.phone) {
        this.logger.debug(`[Pendiente integración] Recordatorio para ${task.assignee.phone}: "${task.title}" vence ${task.dueAt}`);
        count++;
      }
    }

    this.logger.log(`Recordatorios de tareas: ${count} pendientes de canal de envío.`);
  }
}
