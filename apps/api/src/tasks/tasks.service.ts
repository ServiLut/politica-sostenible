import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PoliticalOperationMode,
  Prisma,
  Role,
  TaskStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true, role: true } },
  issueCase: {
    select: { id: true, reference: true, title: true, status: true },
  },
  commitment: {
    select: { id: true, reference: true, title: true, status: true },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListTasksQueryDto) {
    const mode = await this.getActiveMode(user.tenantId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.TaskWhereInput = {
      tenantId: user.tenantId,
      mode,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.issueCaseId ? { issueCaseId: query.issueCaseId } : {}),
      ...(query.commitmentId ? { commitmentId: query.commitmentId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            dueAt: {
              ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
              ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(user: AuthenticatedUser, dto: CreateTaskDto) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertTaskManager(user.role, mode);

    await Promise.all([
      this.assertUserInTenant(user.tenantId, user.userId, 'creador'),
      dto.assigneeId
        ? this.assertUserInTenant(user.tenantId, dto.assigneeId, 'responsable')
        : Promise.resolve(),
      dto.issueCaseId
        ? this.assertIssueCaseInScope(user.tenantId, mode, dto.issueCaseId)
        : Promise.resolve(),
      dto.commitmentId
        ? this.assertCommitmentInScope(user.tenantId, mode, dto.commitmentId)
        : Promise.resolve(),
    ]);

    return this.prisma.task.create({
      data: {
        tenantId: user.tenantId,
        mode,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        issueCaseId: dto.issueCaseId,
        commitmentId: dto.commitmentId,
        createdById: user.userId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        completedAt: dto.status === TaskStatus.DONE ? new Date() : undefined,
      },
      include: TASK_INCLUDE,
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTaskDto) {
    const mode = await this.getActiveMode(user.tenantId);
    const existing = await this.prisma.task.findFirst({
      where: { id, tenantId: user.tenantId, mode },
      select: { id: true, status: true, assigneeId: true },
    });

    if (!existing) {
      throw new NotFoundException('Tarea no encontrada');
    }

    this.assertTaskUpdateAccess(user, mode, existing.assigneeId, dto);

    await Promise.all([
      dto.assigneeId
        ? this.assertUserInTenant(user.tenantId, dto.assigneeId, 'responsable')
        : Promise.resolve(),
      dto.issueCaseId
        ? this.assertIssueCaseInScope(user.tenantId, mode, dto.issueCaseId)
        : Promise.resolve(),
      dto.commitmentId
        ? this.assertCommitmentInScope(user.tenantId, mode, dto.commitmentId)
        : Promise.resolve(),
    ]);

    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.completedAt =
        dto.status === TaskStatus.DONE
          ? existing.status === TaskStatus.DONE
            ? undefined
            : new Date()
          : null;
    }
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.issueCaseId !== undefined) data.issueCaseId = dto.issueCaseId;
    if (dto.commitmentId !== undefined) data.commitmentId = dto.commitmentId;
    if (dto.dueAt !== undefined) {
      data.dueAt = dto.dueAt === null ? null : new Date(dto.dueAt);
    }

    return this.prisma.task.update({
      where: { id, tenantId: user.tenantId, mode },
      data,
      include: TASK_INCLUDE,
    });
  }

  private async getActiveMode(
    tenantId: string,
  ): Promise<PoliticalOperationMode> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultMode: true },
    });

    if (!tenant) {
      throw new NotFoundException('Organización no encontrada');
    }

    return tenant.defaultMode;
  }

  private assertTaskUpdateAccess(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    assigneeId: string | null,
    dto: UpdateTaskDto,
  ): void {
    if (this.isTaskManager(user.role, mode)) {
      return;
    }

    const changesOnlyStatus = Object.entries(dto).every(
      ([key, value]) => key === 'status' || value === undefined,
    );

    if (
      assigneeId !== user.userId ||
      dto.status === undefined ||
      !changesOnlyStatus
    ) {
      throw new ForbiddenException(
        'Sólo puedes actualizar el estado de una tarea asignada a ti',
      );
    }
  }

  private assertTaskManager(
    role: string | undefined,
    mode: PoliticalOperationMode,
  ): void {
    if (!this.isTaskManager(role, mode)) {
      throw new ForbiddenException(
        'Tu rol no puede gestionar tareas en el modo operativo actual',
      );
    }
  }

  private isTaskManager(
    role: string | undefined,
    mode: PoliticalOperationMode,
  ): boolean {
    if (role === Role.ADMIN) return true;

    return mode === PoliticalOperationMode.CAMPAIGN
      ? role === Role.CAMPAIGN_MANAGER ||
          role === Role.COMMUNICATIONS_MANAGER ||
          role === Role.ZONE_COORDINATOR
      : role === Role.CONSTITUENT_SERVICES_MANAGER || role === Role.CASE_WORKER;
  }

  private async assertUserInTenant(
    tenantId: string,
    userId: string,
    label: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException(
        `${label} inválido para la organización actual`,
      );
    }
  }

  private async assertIssueCaseInScope(
    tenantId: string,
    mode: PoliticalOperationMode,
    issueCaseId: string,
  ): Promise<void> {
    const issueCase = await this.prisma.issueCase.findFirst({
      where: { id: issueCaseId, tenantId, mode },
      select: { id: true },
    });

    if (!issueCase) {
      throw new BadRequestException(
        'Caso inválido para el modo operativo actual',
      );
    }
  }

  private async assertCommitmentInScope(
    tenantId: string,
    mode: PoliticalOperationMode,
    commitmentId: string,
  ): Promise<void> {
    const commitment = await this.prisma.commitment.findFirst({
      where: { id: commitmentId, tenantId, mode },
      select: { id: true },
    });

    if (!commitment) {
      throw new BadRequestException(
        'Compromiso inválido para el modo operativo actual',
      );
    }
  }
}
