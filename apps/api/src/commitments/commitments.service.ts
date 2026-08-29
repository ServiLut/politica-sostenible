import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommitmentStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommitmentDto } from './dto/create-commitment.dto';
import { ListCommitmentsQueryDto } from './dto/list-commitments-query.dto';
import { UpdateCommitmentDto } from './dto/update-commitment.dto';

const COMMITMENT_INCLUDE = {
  owner: { select: { id: true, name: true, role: true } },
  issueCase: {
    select: { id: true, reference: true, title: true, status: true },
  },
  _count: { select: { tasks: true } },
} satisfies Prisma.CommitmentInclude;

const PUBLIC_COMMITMENT_SELECT = {
  id: true,
  mode: true,
  reference: true,
  title: true,
  description: true,
  status: true,
  targetDate: true,
  progress: true,
  isPublic: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { tasks: true } },
} satisfies Prisma.CommitmentSelect;

// CASE_WORKER needs ownership fields only to evaluate authorization. They are
// removed from the response so a public commitment cannot disclose a foreign
// owner or case association.
const CASE_WORKER_COMMITMENT_SELECT = {
  ...PUBLIC_COMMITMENT_SELECT,
  ownerId: true,
  issueCaseId: true,
  issueCase: { select: { assigneeId: true } },
} satisfies Prisma.CommitmentSelect;

type CaseWorkerCommitmentRecord = Prisma.CommitmentGetPayload<{
  select: typeof CASE_WORKER_COMMITMENT_SELECT;
}>;

@Injectable()
export class CommitmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListCommitmentsQueryDto) {
    const [mode, currentRole] = await Promise.all([
      this.getActiveMode(user.tenantId),
      this.getCurrentRole(user.tenantId, user.userId),
    ]);
    const isCaseWorker = this.isScopedCaseWorker(currentRole, mode);
    const canReadAllInternal = this.canReadAllInternalCommitments(
      currentRole,
      mode,
    );
    const canReadInternal = canReadAllInternal || isCaseWorker;

    if (
      !canReadInternal &&
      (query.isPublic === 'false' || query.ownerId || query.issueCaseId)
    ) {
      throw new ForbiddenException(
        'Tu rol sólo puede consultar compromisos públicos',
      );
    }

    if (
      isCaseWorker &&
      query.ownerId !== undefined &&
      query.ownerId !== user.userId
    ) {
      throw new ForbiddenException(
        'Los gestores de caso solo pueden filtrar compromisos propios',
      );
    }

    if (isCaseWorker && query.issueCaseId) {
      await this.assertIssueCaseInScope(
        user.tenantId,
        mode,
        query.issueCaseId,
        user.userId,
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.CommitmentWhereInput = {
      tenantId: user.tenantId,
      mode,
      ...(query.status ? { status: query.status } : {}),
      ...(canReadInternal && query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(canReadInternal && query.issueCaseId
        ? { issueCaseId: query.issueCaseId }
        : {}),
      ...(isCaseWorker ? { AND: [this.caseWorkerReadScope(user.userId)] } : {}),
      ...(canReadInternal
        ? query.isPublic !== undefined
          ? { isPublic: query.isPublic === 'true' }
          : {}
        : { isPublic: true }),
      ...(query.search
        ? {
            OR: [
              { reference: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.targetFrom || query.targetTo
        ? {
            targetDate: {
              ...(query.targetFrom ? { gte: new Date(query.targetFrom) } : {}),
              ...(query.targetTo ? { lte: new Date(query.targetTo) } : {}),
            },
          }
        : {}),
    };

    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const paginationQuery = {
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    };
    const countPromise = this.prisma.commitment.count({ where });
    const permissions = {
      canCreate: this.canManageCommitments(currentRole, mode),
      canReadInternal,
    };

    if (isCaseWorker) {
      const [records, total] = await Promise.all([
        this.prisma.commitment.findMany({
          where,
          select: CASE_WORKER_COMMITMENT_SELECT,
          ...paginationQuery,
        }),
        countPromise,
      ]);

      return this.toPaginatedResult(
        records.map((record) =>
          this.toCaseWorkerCommitment(record, user.userId),
        ),
        page,
        limit,
        total,
        permissions,
      );
    }

    if (canReadAllInternal) {
      const [records, total] = await Promise.all([
        this.prisma.commitment.findMany({
          where,
          include: COMMITMENT_INCLUDE,
          ...paginationQuery,
        }),
        countPromise,
      ]);

      return this.toPaginatedResult(
        records.map((record) => ({
          ...record,
          canUpdate: this.canManageAllCommitments(currentRole, mode),
        })),
        page,
        limit,
        total,
        permissions,
      );
    }

    const [records, total] = await Promise.all([
      this.prisma.commitment.findMany({
        where,
        select: PUBLIC_COMMITMENT_SELECT,
        ...paginationQuery,
      }),
      countPromise,
    ]);

    return this.toPaginatedResult(
      records.map((record) => ({ ...record, canUpdate: false })),
      page,
      limit,
      total,
      permissions,
    );
  }

  async create(user: AuthenticatedUser, dto: CreateCommitmentDto) {
    const [mode, currentRole] = await Promise.all([
      this.getActiveMode(user.tenantId),
      this.getCurrentRole(user.tenantId, user.userId),
    ]);
    this.assertCommitmentManager(currentRole, mode);
    const isCaseWorker = this.isScopedCaseWorker(currentRole, mode);
    if (isCaseWorker) {
      this.assertCaseWorkerOwner(user.userId, dto.ownerId);
    }
    const ownerId =
      isCaseWorker && !dto.issueCaseId ? user.userId : dto.ownerId;

    await Promise.all([
      this.assertReferenceAvailable(user.tenantId, dto.reference),
      ownerId
        ? this.assertUserInTenant(user.tenantId, ownerId)
        : Promise.resolve(),
      dto.issueCaseId
        ? this.assertIssueCaseInScope(
            user.tenantId,
            mode,
            dto.issueCaseId,
            isCaseWorker ? user.userId : undefined,
          )
        : Promise.resolve(),
    ]);

    const created = await this.prisma.commitment.create({
      data: {
        tenantId: user.tenantId,
        mode,
        reference: dto.reference,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        ownerId,
        issueCaseId: dto.issueCaseId,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        progress: dto.progress,
        isPublic: dto.isPublic,
        completedAt:
          dto.status === CommitmentStatus.FULFILLED ? new Date() : undefined,
      },
      include: COMMITMENT_INCLUDE,
    });

    return { ...created, canUpdate: true };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateCommitmentDto) {
    const [mode, currentRole] = await Promise.all([
      this.getActiveMode(user.tenantId),
      this.getCurrentRole(user.tenantId, user.userId),
    ]);
    this.assertCommitmentManager(currentRole, mode);
    const isCaseWorker = this.isScopedCaseWorker(currentRole, mode);
    const scopedWhere: Prisma.CommitmentWhereUniqueInput = {
      id,
      tenantId: user.tenantId,
      mode,
      ...(isCaseWorker
        ? { AND: [this.caseWorkerMutationScope(user.userId)] }
        : {}),
    };
    const existing = await this.prisma.commitment.findFirst({
      where: scopedWhere,
      select: {
        id: true,
        reference: true,
        status: true,
        ownerId: true,
        issueCaseId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Compromiso no encontrado');
    }

    if (isCaseWorker) {
      this.assertCaseWorkerOwner(user.userId, dto.ownerId);
    }

    await Promise.all([
      dto.reference && dto.reference !== existing.reference
        ? this.assertReferenceAvailable(user.tenantId, dto.reference, id)
        : Promise.resolve(),
      dto.ownerId
        ? this.assertUserInTenant(user.tenantId, dto.ownerId)
        : Promise.resolve(),
      dto.issueCaseId
        ? this.assertIssueCaseInScope(
            user.tenantId,
            mode,
            dto.issueCaseId,
            isCaseWorker ? user.userId : undefined,
          )
        : Promise.resolve(),
    ]);

    if (isCaseWorker) {
      const resultingIssueCaseId =
        dto.issueCaseId !== undefined ? dto.issueCaseId : existing.issueCaseId;
      const resultingOwnerId =
        dto.ownerId !== undefined ? dto.ownerId : existing.ownerId;

      if (resultingIssueCaseId === null && resultingOwnerId !== user.userId) {
        throw new ForbiddenException(
          'Un compromiso sin caso debe permanecer asignado al gestor actual',
        );
      }
    }

    const data: Prisma.CommitmentUncheckedUpdateInput = {};
    if (dto.reference !== undefined) data.reference = dto.reference;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.completedAt =
        dto.status === CommitmentStatus.FULFILLED
          ? existing.status === CommitmentStatus.FULFILLED
            ? undefined
            : new Date()
          : null;
    }
    if (dto.ownerId !== undefined) data.ownerId = dto.ownerId;
    if (dto.issueCaseId !== undefined) data.issueCaseId = dto.issueCaseId;
    if (dto.targetDate !== undefined) {
      data.targetDate =
        dto.targetDate === null ? null : new Date(dto.targetDate);
    }
    if (dto.progress !== undefined) data.progress = dto.progress;
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;

    const updated = await this.prisma.commitment.update({
      where: scopedWhere,
      data,
      include: COMMITMENT_INCLUDE,
    });

    return { ...updated, canUpdate: true };
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

  private assertCommitmentManager(
    role: Role,
    mode: PoliticalOperationMode,
  ): void {
    if (!this.canManageCommitments(role, mode)) {
      throw new ForbiddenException(
        'Tu rol no puede gestionar compromisos en el modo operativo actual',
      );
    }
  }

  private canManageCommitments(
    role: Role,
    mode: PoliticalOperationMode,
  ): boolean {
    return (
      this.canManageAllCommitments(role, mode) ||
      this.isScopedCaseWorker(role, mode)
    );
  }

  private canManageAllCommitments(
    role: Role,
    mode: PoliticalOperationMode,
  ): boolean {
    return (
      role === Role.ADMIN ||
      (mode === PoliticalOperationMode.CAMPAIGN
        ? role === Role.CAMPAIGN_MANAGER
        : role === Role.CONSTITUENT_SERVICES_MANAGER)
    );
  }

  private canReadAllInternalCommitments(
    role: Role,
    mode: PoliticalOperationMode,
  ): boolean {
    return (
      role === Role.AUDITOR ||
      role === Role.COMPLIANCE_OFFICER ||
      this.canManageAllCommitments(role, mode)
    );
  }

  private isScopedCaseWorker(
    role: Role,
    mode: PoliticalOperationMode,
  ): boolean {
    return (
      role === Role.CASE_WORKER && mode === PoliticalOperationMode.PUBLIC_OFFICE
    );
  }

  private caseWorkerReadScope(userId: string): Prisma.CommitmentWhereInput {
    return {
      OR: [
        { isPublic: true },
        { issueCase: { is: { assigneeId: userId } } },
        { issueCaseId: null, ownerId: userId },
      ],
    };
  }

  private caseWorkerMutationScope(userId: string): Prisma.CommitmentWhereInput {
    return {
      OR: [
        { issueCase: { is: { assigneeId: userId } } },
        { issueCaseId: null, ownerId: userId },
      ],
    };
  }

  private assertCaseWorkerOwner(
    userId: string,
    ownerId: string | null | undefined,
  ): void {
    if (ownerId && ownerId !== userId) {
      throw new ForbiddenException(
        'Los gestores de caso no pueden asignar compromisos a otro usuario',
      );
    }
  }

  private toCaseWorkerCommitment(
    record: CaseWorkerCommitmentRecord,
    userId: string,
  ) {
    const { ownerId, issueCaseId, issueCase, ...safeCommitment } = record;
    const canUpdate =
      issueCase?.assigneeId === userId ||
      (issueCaseId === null && ownerId === userId);

    return { ...safeCommitment, canUpdate };
  }

  private toPaginatedResult<T>(
    items: T[],
    page: number,
    limit: number,
    total: number,
    permissions: { canCreate: boolean; canReadInternal: boolean },
  ) {
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      permissions,
    };
  }

  private async assertUserInTenant(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const owner = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, isActive: true },
      select: { id: true },
    });

    if (!owner) {
      throw new BadRequestException(
        'Responsable inválido para la organización actual',
      );
    }
  }

  private async getCurrentRole(
    tenantId: string,
    userId: string,
  ): Promise<Role> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, isActive: true },
      select: { role: true },
    });

    if (!user) {
      throw new ForbiddenException(
        'El usuario no tiene acceso vigente a la organización',
      );
    }

    return user.role;
  }

  private async assertIssueCaseInScope(
    tenantId: string,
    mode: PoliticalOperationMode,
    issueCaseId: string,
    assigneeId?: string,
  ): Promise<void> {
    const issueCase = await this.prisma.issueCase.findFirst({
      where: {
        id: issueCaseId,
        tenantId,
        mode,
        ...(assigneeId ? { assigneeId } : {}),
      },
      select: { id: true },
    });

    if (!issueCase) {
      if (assigneeId) {
        throw new ForbiddenException(
          'El caso no está asignado al gestor actual',
        );
      }
      throw new BadRequestException(
        'Caso inválido para el modo operativo actual',
      );
    }
  }

  private async assertReferenceAvailable(
    tenantId: string,
    reference: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.commitment.findFirst({
      where: {
        tenantId,
        reference,
        ...(excludedId ? { NOT: { id: excludedId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('La referencia del compromiso ya existe');
    }
  }
}
