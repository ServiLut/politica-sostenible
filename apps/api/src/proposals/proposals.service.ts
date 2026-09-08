import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  PoliticalOperationMode,
  Prisma,
  ProposalStatus,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { ListProposalsQueryDto } from './dto/list-proposals-query.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';

const PROPOSAL_SELECT = {
  id: true,
  referenceCode: true,
  title: true,
  description: true,
  category: true,
  targetGroup: true,
  status: true,
  progressPercent: true,
  isPublic: true,
  territory: true,
  estimatedCost: true,
  sourceUrl: true,
  ownerId: true,
  owner: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PoliticalProposalSelect;

type ProposalRecord = Prisma.PoliticalProposalGetPayload<{
  select: typeof PROPOSAL_SELECT;
}>;

const PROPOSAL_TENANT_TYPES: readonly TenantType[] = [
  TenantType.CANDIDACY,
  TenantType.PARTY,
];

const PROPOSAL_STATUS_TRANSITIONS: Readonly<
  Record<ProposalStatus, readonly ProposalStatus[]>
> = Object.freeze({
  [ProposalStatus.DRAFT]: [
    ProposalStatus.DRAFT,
    ProposalStatus.PROPOSED,
    ProposalStatus.WITHDRAWN,
  ],
  [ProposalStatus.PROPOSED]: [
    ProposalStatus.PROPOSED,
    ProposalStatus.IN_PROGRESS,
    ProposalStatus.WITHDRAWN,
  ],
  [ProposalStatus.IN_PROGRESS]: [
    ProposalStatus.IN_PROGRESS,
    ProposalStatus.COMPLETED,
    ProposalStatus.WITHDRAWN,
  ],
  [ProposalStatus.COMPLETED]: [ProposalStatus.COMPLETED],
  [ProposalStatus.WITHDRAWN]: [ProposalStatus.WITHDRAWN],
});

@Injectable()
export class ProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListProposalsQueryDto) {
    await this.assertProposalDomain(user.tenantId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.PoliticalProposalWhereInput = {
      tenantId: user.tenantId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isPublic !== undefined
        ? { isPublic: query.isPublic === 'true' }
        : {}),
    };

    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

    const [items, total] = await Promise.all([
      this.prisma.politicalProposal.findMany({
        where,
        select: PROPOSAL_SELECT,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.politicalProposal.count({ where }),
    ]);

    return {
      items: items.map((proposal) => this.toResponse(proposal)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    await this.assertProposalDomain(user.tenantId);
    const proposal = await this.findProposalInTenant(user.tenantId, id);

    return this.toResponse(proposal);
  }

  async create(user: AuthenticatedUser, dto: CreateProposalDto) {
    const mode = await this.assertProposalDomain(user.tenantId);
    if (
      (dto.status !== undefined && dto.status !== ProposalStatus.DRAFT) ||
      (dto.progressPercent !== undefined && dto.progressPercent !== 0)
    ) {
      throw new BadRequestException(
        'Toda propuesta debe iniciar como borrador con progreso 0',
      );
    }
    const ownerId = dto.ownerId ?? user.userId;
    await this.assertOwnerInTenant(user.tenantId, ownerId);
    const nextRef = await this.generateReferenceCode(user.tenantId);

    const created = await this.prisma.$transaction(async (transaction) => {
      const proposal = await transaction.politicalProposal.create({
        data: {
          tenantId: user.tenantId,
          referenceCode: nextRef,
          title: dto.title,
          description: dto.description ?? '',
          category: dto.category,
          targetGroup: dto.targetGroup,
          status: ProposalStatus.DRAFT,
          progressPercent: 0,
          isPublic: dto.isPublic,
          territory: dto.territory,
          estimatedCost: dto.estimatedCost,
          sourceUrl: dto.sourceUrl,
          ownerId,
          createdById: user.userId,
          updatedById: user.userId,
        },
        select: PROPOSAL_SELECT,
      });

      await transaction.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode,
          actorType: AuditActorType.USER,
          actorUserId: user.userId,
          action: 'PROPOSAL_CREATED',
          resourceType: 'PoliticalProposal',
          resourceId: proposal.id,
          metadata: { referenceCode: nextRef },
        },
      });

      return proposal;
    });

    return this.toResponse(created);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateProposalDto) {
    const mode = await this.assertProposalDomain(user.tenantId);
    const [existing] = await Promise.all([
      this.findProposalInTenant(user.tenantId, id),
      dto.ownerId
        ? this.assertOwnerInTenant(user.tenantId, dto.ownerId)
        : Promise.resolve(),
    ]);
    this.assertStatusTransition(existing.status, dto.status);
    this.assertPublishedContentUnchanged(existing, dto);
    this.assertTerminalOperationalStateUnchanged(existing, dto);

    const resultingStatus = dto.status ?? existing.status;
    const resultingProgress = dto.progressPercent ?? existing.progressPercent;
    if (
      (resultingStatus === ProposalStatus.DRAFT ||
        resultingStatus === ProposalStatus.PROPOSED) &&
      resultingProgress !== 0
    ) {
      throw new BadRequestException(
        'Una propuesta en borrador o propuesta debe conservar progreso 0',
      );
    }
    if (
      resultingStatus === ProposalStatus.COMPLETED &&
      resultingProgress !== 100
    ) {
      throw new BadRequestException(
        'Una propuesta solo puede marcarse como completada con progreso de 100 %',
      );
    }

    const changedFields = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field)
      .sort();

    const updated = await this.prisma.$transaction(async (transaction) => {
      const proposal = await transaction.politicalProposal.update({
        where: { id_tenantId: { id, tenantId: user.tenantId } },
        data: {
          ...dto,
          updatedById: user.userId,
        },
        select: PROPOSAL_SELECT,
      });

      await transaction.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode,
          actorType: AuditActorType.USER,
          actorUserId: user.userId,
          action: 'PROPOSAL_UPDATED',
          resourceType: 'PoliticalProposal',
          resourceId: proposal.id,
          ...(existing.status === ProposalStatus.DRAFT &&
          proposal.status !== ProposalStatus.DRAFT
            ? { after: this.proposalCommitmentSnapshot(proposal) }
            : {}),
          metadata: {
            changedFields,
            previousStatus: existing.status,
            currentStatus: proposal.status,
            previousProgressPercent: existing.progressPercent,
            currentProgressPercent: proposal.progressPercent,
            previousOwnerId: existing.ownerId,
            currentOwnerId: proposal.ownerId,
          },
        },
      });

      return proposal;
    });

    return this.toResponse(updated);
  }

  async delete(user: AuthenticatedUser, id: string) {
    const mode = await this.assertProposalDomain(user.tenantId);
    const existing = await this.findProposalInTenant(user.tenantId, id);

    if (existing.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException(
        'Solo pueden eliminarse propuestas que todavía estén en borrador',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.politicalProposal.deleteMany({
        where: {
          id,
          tenantId: user.tenantId,
          status: ProposalStatus.DRAFT,
        },
      });
      if (deleted.count !== 1) {
        throw new ConflictException(
          'La propuesta cambió de estado y ya no puede eliminarse; actualiza la vista',
        );
      }

      await transaction.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode,
          actorType: AuditActorType.USER,
          actorUserId: user.userId,
          action: 'PROPOSAL_DELETED',
          resourceType: 'PoliticalProposal',
          resourceId: existing.id,
        },
      });
    });

    return { success: true };
  }

  private assertStatusTransition(
    currentStatus: ProposalStatus,
    requestedStatus: ProposalStatus | undefined,
  ): void {
    if (
      requestedStatus === undefined ||
      PROPOSAL_STATUS_TRANSITIONS[currentStatus].includes(requestedStatus)
    ) {
      return;
    }

    throw new BadRequestException(
      `No se permite cambiar una propuesta de ${currentStatus} a ${requestedStatus}. Registre una nueva versión en lugar de reescribir su estado histórico`,
    );
  }

  private assertPublishedContentUnchanged(
    existing: ProposalRecord,
    dto: UpdateProposalDto,
  ): void {
    if (existing.status === ProposalStatus.DRAFT) return;

    const estimatedCostChanged =
      dto.estimatedCost !== undefined &&
      (dto.estimatedCost === null
        ? existing.estimatedCost !== null
        : existing.estimatedCost === null ||
          !existing.estimatedCost.equals(dto.estimatedCost));
    const changed =
      (dto.title !== undefined && dto.title !== existing.title) ||
      (dto.description !== undefined &&
        dto.description !== existing.description) ||
      (dto.category !== undefined && dto.category !== existing.category) ||
      (dto.targetGroup !== undefined &&
        dto.targetGroup !== existing.targetGroup) ||
      (dto.territory !== undefined && dto.territory !== existing.territory) ||
      estimatedCostChanged ||
      (dto.sourceUrl !== undefined && dto.sourceUrl !== existing.sourceUrl);

    if (changed) {
      throw new BadRequestException(
        'El contenido comprometido de una propuesta publicada es inmutable. Retírela y registre una nueva versión trazable',
      );
    }
  }

  private assertTerminalOperationalStateUnchanged(
    existing: ProposalRecord,
    dto: UpdateProposalDto,
  ): void {
    if (
      existing.status !== ProposalStatus.COMPLETED &&
      existing.status !== ProposalStatus.WITHDRAWN
    ) {
      return;
    }

    const changed =
      (dto.progressPercent !== undefined &&
        dto.progressPercent !== existing.progressPercent) ||
      (dto.ownerId !== undefined && dto.ownerId !== existing.ownerId);
    if (changed) {
      throw new BadRequestException(
        'Una propuesta completada o retirada conserva responsable y progreso finales',
      );
    }
  }

  private proposalCommitmentSnapshot(proposal: ProposalRecord) {
    return {
      referenceCode: proposal.referenceCode,
      title: proposal.title,
      description: proposal.description,
      category: proposal.category,
      targetGroup: proposal.targetGroup,
      territory: proposal.territory,
      estimatedCost: proposal.estimatedCost?.toString() ?? null,
      sourceUrl: proposal.sourceUrl,
      status: proposal.status,
      progressPercent: proposal.progressPercent,
      ownerId: proposal.ownerId,
    };
  }

  private async findProposalInTenant(tenantId: string, id: string) {
    const proposal = await this.prisma.politicalProposal.findUnique({
      where: { id_tenantId: { id, tenantId } },
      select: PROPOSAL_SELECT,
    });

    if (!proposal) {
      throw new NotFoundException('Propuesta política no encontrada');
    }

    return proposal;
  }

  private async generateReferenceCode(tenantId: string): Promise<string> {
    const lastProposal = await this.prisma.politicalProposal.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { referenceCode: true },
    });

    let nextNumber = 1;
    if (lastProposal && lastProposal.referenceCode.startsWith('PRO-')) {
      const match = lastProposal.referenceCode.match(/^PRO-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      } else {
        const count = await this.prisma.politicalProposal.count({
          where: { tenantId },
        });
        nextNumber = count + 1;
      }
    }

    return `PRO-${String(nextNumber).padStart(3, '0')}`;
  }

  private async assertOwnerInTenant(tenantId: string, ownerId: string) {
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, tenantId, isActive: true },
      select: { id: true },
    });

    if (!owner) {
      throw new BadRequestException(
        'El responsable debe ser un usuario activo de la organización',
      );
    }
  }

  private toResponse(proposal: ProposalRecord) {
    return {
      ...proposal,
      estimatedCost: proposal.estimatedCost?.toNumber() ?? null,
    };
  }

  private async assertProposalDomain(
    tenantId: string,
  ): Promise<PoliticalOperationMode> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultMode: true, type: true },
    });

    if (
      !tenant ||
      tenant.defaultMode !== PoliticalOperationMode.CAMPAIGN ||
      !PROPOSAL_TENANT_TYPES.includes(tenant.type)
    ) {
      throw new ForbiddenException(
        'El programa político sólo está disponible para candidaturas o partidos en modo campaña.',
      );
    }

    return PoliticalOperationMode.CAMPAIGN;
  }
}
