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

@Injectable()
export class CommitmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListCommitmentsQueryDto) {
    const mode = await this.getActiveMode(user.tenantId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.CommitmentWhereInput = {
      tenantId: user.tenantId,
      mode,
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.issueCaseId ? { issueCaseId: query.issueCaseId } : {}),
      ...(query.isPublic !== undefined
        ? { isPublic: query.isPublic === 'true' }
        : {}),
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

    const [items, total] = await Promise.all([
      this.prisma.commitment.findMany({
        where,
        include: COMMITMENT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.commitment.count({ where }),
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

  async create(user: AuthenticatedUser, dto: CreateCommitmentDto) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertCommitmentManager(user.role, mode);

    await Promise.all([
      this.assertReferenceAvailable(user.tenantId, dto.reference),
      dto.ownerId
        ? this.assertUserInTenant(user.tenantId, dto.ownerId)
        : Promise.resolve(),
      dto.issueCaseId
        ? this.assertIssueCaseInScope(user.tenantId, mode, dto.issueCaseId)
        : Promise.resolve(),
    ]);

    return this.prisma.commitment.create({
      data: {
        tenantId: user.tenantId,
        mode,
        reference: dto.reference,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        ownerId: dto.ownerId,
        issueCaseId: dto.issueCaseId,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        progress: dto.progress,
        isPublic: dto.isPublic,
        completedAt:
          dto.status === CommitmentStatus.FULFILLED ? new Date() : undefined,
      },
      include: COMMITMENT_INCLUDE,
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateCommitmentDto) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertCommitmentManager(user.role, mode);
    const existing = await this.prisma.commitment.findFirst({
      where: { id, tenantId: user.tenantId, mode },
      select: { id: true, reference: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException('Compromiso no encontrado');
    }

    await Promise.all([
      dto.reference && dto.reference !== existing.reference
        ? this.assertReferenceAvailable(user.tenantId, dto.reference, id)
        : Promise.resolve(),
      dto.ownerId
        ? this.assertUserInTenant(user.tenantId, dto.ownerId)
        : Promise.resolve(),
      dto.issueCaseId
        ? this.assertIssueCaseInScope(user.tenantId, mode, dto.issueCaseId)
        : Promise.resolve(),
    ]);

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

    return this.prisma.commitment.update({
      where: { id, tenantId: user.tenantId, mode },
      data,
      include: COMMITMENT_INCLUDE,
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

  private assertCommitmentManager(
    role: string | undefined,
    mode: PoliticalOperationMode,
  ): void {
    const isAllowed =
      role === Role.ADMIN ||
      (mode === PoliticalOperationMode.CAMPAIGN
        ? role === Role.CAMPAIGN_MANAGER
        : role === Role.CONSTITUENT_SERVICES_MANAGER ||
          role === Role.CASE_WORKER);

    if (!isAllowed) {
      throw new ForbiddenException(
        'Tu rol no puede gestionar compromisos en el modo operativo actual',
      );
    }
  }

  private async assertUserInTenant(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const owner = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });

    if (!owner) {
      throw new BadRequestException(
        'Responsable inválido para la organización actual',
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
