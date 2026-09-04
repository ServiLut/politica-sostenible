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
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';
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

const TASK_ACCESS_ROLES = Object.values(Role);
const TERRITORIALLY_SCOPED_TASK_ROLES = [Role.ZONE_COORDINATOR] as const;

interface TaskAccess {
  role: Role;
  divisionIds: string[] | null;
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssignees(user: AuthenticatedUser) {
    const [mode, access] = await Promise.all([
      this.getActiveMode(user.tenantId),
      this.getCurrentAccess(user),
    ]);
    this.assertTaskCreateAccess(access.role, mode);

    const where: Prisma.UserWhereInput = {
      tenantId: user.tenantId,
      isActive: true,
    };

    if (access.role === Role.CASE_WORKER) {
      where.id = user.userId;
    } else if (access.role === Role.ZONE_COORDINATOR) {
      where.OR = [
        { id: user.userId },
        { divisionId: { in: access.divisionIds ?? [] } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        role: true,
        division: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async findAll(user: AuthenticatedUser, query: ListTasksQueryDto) {
    const [mode, access] = await Promise.all([
      this.getActiveMode(user.tenantId),
      this.getCurrentAccess(user),
    ]);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const isGlobalManager = this.isGlobalTaskManager(access.role, mode);
    const isCaseWorker = access.role === Role.CASE_WORKER;

    if (
      !isGlobalManager &&
      access.role !== Role.ZONE_COORDINATOR &&
      query.assigneeId !== undefined &&
      query.assigneeId !== user.userId
    ) {
      throw new ForbiddenException(
        'Sólo puedes consultar tareas asignadas a ti',
      );
    }

    const scope = this.buildTaskScope(user, mode, access);
    const assigneeId =
      isGlobalManager || access.role === Role.ZONE_COORDINATOR
        ? query.assigneeId
        : isCaseWorker
          ? query.assigneeId
          : user.userId;
    const andFilters: Prisma.TaskWhereInput[] = [];
    if (scope) andFilters.push(scope);
    if (query.search) {
      andFilters.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.TaskWhereInput = {
      tenantId: user.tenantId,
      mode,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(query.issueCaseId ? { issueCaseId: query.issueCaseId } : {}),
      ...(query.commitmentId ? { commitmentId: query.commitmentId } : {}),
      ...(andFilters.length > 0 ? { AND: andFilters } : {}),
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
    const [mode, access] = await Promise.all([
      this.getActiveMode(user.tenantId),
      this.getCurrentAccess(user),
    ]);
    this.assertTaskCreateAccess(access.role, mode);

    await Promise.all([
      dto.assigneeId
        ? this.assertAssigneeInScope(user, mode, access, dto.assigneeId)
        : Promise.resolve(),
      dto.issueCaseId
        ? this.assertIssueCaseInScope(user, mode, access, dto.issueCaseId)
        : Promise.resolve(),
      dto.commitmentId
        ? this.assertCommitmentInScope(user, mode, access, dto.commitmentId)
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
    const [mode, access] = await Promise.all([
      this.getActiveMode(user.tenantId),
      this.getCurrentAccess(user),
    ]);
    const scope = this.buildTaskScope(user, mode, access);
    const scopedWhere: Prisma.TaskWhereUniqueInput = {
      id,
      tenantId: user.tenantId,
      mode,
      ...(scope ? { AND: [scope] } : {}),
    };
    const existing = await this.prisma.task.findFirst({
      where: scopedWhere,
      select: {
        id: true,
        status: true,
        assigneeId: true,
        createdById: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Tarea no encontrada');
    }

    this.assertTaskUpdateAccess(
      user.userId,
      access.role,
      mode,
      existing.assigneeId,
      existing.createdById,
      dto,
    );

    await Promise.all([
      dto.assigneeId
        ? this.assertAssigneeInScope(user, mode, access, dto.assigneeId)
        : Promise.resolve(),
      dto.issueCaseId
        ? this.assertIssueCaseInScope(user, mode, access, dto.issueCaseId)
        : Promise.resolve(),
      dto.commitmentId
        ? this.assertCommitmentInScope(user, mode, access, dto.commitmentId)
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
      where: scopedWhere,
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
    userId: string,
    role: Role,
    mode: PoliticalOperationMode,
    assigneeId: string | null,
    createdById: string,
    dto: UpdateTaskDto,
  ): void {
    if (
      this.isGlobalTaskManager(role, mode) ||
      (role === Role.ZONE_COORDINATOR &&
        mode === PoliticalOperationMode.CAMPAIGN)
    ) {
      return;
    }

    const changesOnlyStatus = Object.entries(dto).every(
      ([key, value]) => key === 'status' || value === undefined,
    );

    if (
      (assigneeId !== userId && createdById !== userId) ||
      dto.status === undefined ||
      !changesOnlyStatus
    ) {
      throw new ForbiddenException(
        'Sólo puedes actualizar el estado de una tarea asignada a ti',
      );
    }
  }

  private assertTaskCreateAccess(
    role: Role,
    mode: PoliticalOperationMode,
  ): void {
    if (this.isGlobalTaskManager(role, mode)) return;
    if (
      role === Role.ZONE_COORDINATOR &&
      mode === PoliticalOperationMode.CAMPAIGN
    ) {
      return;
    }
    if (
      role === Role.CASE_WORKER &&
      mode === PoliticalOperationMode.PUBLIC_OFFICE
    ) {
      return;
    }

    throw new ForbiddenException(
      'Tu rol no puede gestionar tareas en el modo operativo actual',
    );
  }

  private isGlobalTaskManager(
    role: Role,
    mode: PoliticalOperationMode,
  ): boolean {
    if (role === Role.ADMIN) return true;

    return mode === PoliticalOperationMode.CAMPAIGN
      ? role === Role.CAMPAIGN_MANAGER || role === Role.COMMUNICATIONS_MANAGER
      : role === Role.CONSTITUENT_SERVICES_MANAGER;
  }

  private async getCurrentAccess(user: AuthenticatedUser): Promise<TaskAccess> {
    return resolveTerritorialAccess({
      client: this.prisma,
      tenantId: user.tenantId,
      userId: user.userId,
      allowedRoles: TASK_ACCESS_ROLES,
      territoriallyScopedRoles: TERRITORIALLY_SCOPED_TASK_ROLES,
    });
  }

  private buildTaskScope(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: TaskAccess,
  ): Prisma.TaskWhereInput | null {
    if (this.isGlobalTaskManager(access.role, mode)) return null;

    if (
      access.role === Role.CASE_WORKER &&
      mode === PoliticalOperationMode.PUBLIC_OFFICE
    ) {
      const issueCaseScope = this.buildIssueCaseScope(user, mode, access);
      const commitmentScope = this.buildCommitmentScope(user, mode, access);
      return {
        AND: [
          {
            OR: [{ assigneeId: user.userId }, { createdById: user.userId }],
          },
          {
            OR: [{ issueCaseId: null }, { issueCase: { is: issueCaseScope } }],
          },
          {
            OR: [
              { commitmentId: null },
              { commitment: { is: commitmentScope } },
            ],
          },
        ],
      };
    }

    if (
      access.role === Role.ZONE_COORDINATOR &&
      mode === PoliticalOperationMode.CAMPAIGN
    ) {
      const divisionIds = access.divisionIds ?? [];
      const issueCaseScope = this.buildIssueCaseScope(user, mode, access);
      const commitmentScope = this.buildCommitmentScope(user, mode, access);
      return {
        AND: [
          {
            OR: [
              { assigneeId: user.userId },
              { createdById: user.userId },
              {
                assignee: {
                  is: {
                    tenantId: user.tenantId,
                    divisionId: { in: divisionIds },
                  },
                },
              },
              { issueCase: { is: issueCaseScope } },
              { commitment: { is: commitmentScope } },
            ],
          },
          {
            OR: [{ issueCaseId: null }, { issueCase: { is: issueCaseScope } }],
          },
          {
            OR: [
              { commitmentId: null },
              { commitment: { is: commitmentScope } },
            ],
          },
        ],
      };
    }

    return { assigneeId: user.userId };
  }

  private buildIssueCaseScope(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: TaskAccess,
  ): Prisma.IssueCaseWhereInput {
    const where: Prisma.IssueCaseWhereInput = {
      tenantId: user.tenantId,
      mode,
    };

    if (access.role === Role.CASE_WORKER) {
      where.assigneeId = user.userId;
    } else if (access.role === Role.ZONE_COORDINATOR) {
      where.divisionId = { in: access.divisionIds ?? [] };
    }

    return where;
  }

  private buildCommitmentScope(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: TaskAccess,
  ): Prisma.CommitmentWhereInput {
    const where: Prisma.CommitmentWhereInput = {
      tenantId: user.tenantId,
      mode,
    };

    if (access.role === Role.CASE_WORKER) {
      where.OR = [
        { ownerId: user.userId },
        {
          issueCase: {
            is: this.buildIssueCaseScope(user, mode, access),
          },
        },
      ];
    } else if (access.role === Role.ZONE_COORDINATOR) {
      where.OR = [
        { ownerId: user.userId },
        {
          owner: {
            is: {
              tenantId: user.tenantId,
              divisionId: { in: access.divisionIds ?? [] },
            },
          },
        },
        {
          issueCase: {
            is: this.buildIssueCaseScope(user, mode, access),
          },
        },
      ];
    }

    return where;
  }

  private async assertUserInTenant(
    tenantId: string,
    userId: string,
    label: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, isActive: true },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException(
        `${label} inválido para la organización actual`,
      );
    }
  }

  private async assertAssigneeInScope(
    actor: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: TaskAccess,
    assigneeId: string,
  ): Promise<void> {
    if (this.isGlobalTaskManager(access.role, mode)) {
      await this.assertUserInTenant(actor.tenantId, assigneeId, 'responsable');
      return;
    }

    if (access.role === Role.CASE_WORKER) {
      if (assigneeId !== actor.userId) {
        throw new ForbiddenException(
          'Los gestores de caso no pueden asignar tareas a otros usuarios',
        );
      }
      return;
    }

    if (access.role === Role.ZONE_COORDINATOR) {
      if (assigneeId === actor.userId) return;

      const assignee = await this.prisma.user.findFirst({
        where: {
          id: assigneeId,
          tenantId: actor.tenantId,
          isActive: true,
          divisionId: { in: access.divisionIds ?? [] },
        },
        select: { id: true },
      });
      if (assignee) return;
    }

    throw new ForbiddenException(
      'El responsable no pertenece al alcance operativo del usuario',
    );
  }

  private async assertIssueCaseInScope(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: TaskAccess,
    issueCaseId: string,
  ): Promise<void> {
    const relationScope = this.buildIssueCaseScope(user, mode, access);
    const issueCase = await this.prisma.issueCase.findFirst({
      where: {
        id: issueCaseId,
        tenantId: user.tenantId,
        mode,
        ...(this.isGlobalTaskManager(access.role, mode)
          ? {}
          : { AND: [relationScope] }),
      },
      select: { id: true },
    });

    if (!issueCase) {
      throw new BadRequestException(
        'Caso inválido para el modo operativo actual',
      );
    }
  }

  private async assertCommitmentInScope(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: TaskAccess,
    commitmentId: string,
  ): Promise<void> {
    const relationScope = this.buildCommitmentScope(user, mode, access);
    const commitment = await this.prisma.commitment.findFirst({
      where: {
        id: commitmentId,
        tenantId: user.tenantId,
        mode,
        ...(this.isGlobalTaskManager(access.role, mode)
          ? {}
          : { AND: [relationScope] }),
      },
      select: { id: true },
    });

    if (!commitment) {
      throw new BadRequestException(
        'Compromiso inválido para el modo operativo actual',
      );
    }
  }
}
