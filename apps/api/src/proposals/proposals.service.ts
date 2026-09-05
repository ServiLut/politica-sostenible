import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  PoliticalOperationMode,
  Prisma,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { ListProposalsQueryDto } from './dto/list-proposals-query.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';

@Injectable()
export class ProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListProposalsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.PoliticalProposalWhereInput = {
      tenantId: user.tenantId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isPublic !== undefined ? { isPublic: query.isPublic === 'true' } : {}),
    };

    const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    
    const [items, total] = await Promise.all([
      this.prisma.politicalProposal.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.politicalProposal.count({ where }),
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

  async findOne(user: AuthenticatedUser, id: string) {
    const proposal = await this.prisma.politicalProposal.findUnique({
      where: { id_tenantId: { id, tenantId: user.tenantId } },
    });

    if (!proposal) {
      throw new NotFoundException('Propuesta política no encontrada');
    }

    return proposal;
  }

  async create(user: AuthenticatedUser, dto: CreateProposalDto) {
    const [nextRef, mode] = await Promise.all([
      this.generateReferenceCode(user.tenantId),
      this.getActiveMode(user.tenantId),
    ]);

    const created = await this.prisma.$transaction(async (transaction) => {
      const proposal = await transaction.politicalProposal.create({
        data: {
          tenantId: user.tenantId,
          referenceCode: nextRef,
          title: dto.title,
          description: dto.description ?? '',
          category: dto.category,
          targetGroup: dto.targetGroup,
          status: dto.status,
          progressPercent: dto.progressPercent,
          isPublic: dto.isPublic,
          territory: dto.territory,
          estimatedCost: dto.estimatedCost,
          sourceUrl: dto.sourceUrl,
          ownerId: dto.ownerId ?? user.userId,
          createdById: user.userId,
          updatedById: user.userId,
        },
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

    return created;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateProposalDto) {
    const [existing, mode] = await Promise.all([
      this.findOne(user, id),
      this.getActiveMode(user.tenantId),
    ]);

    const updated = await this.prisma.$transaction(async (transaction) => {
      const proposal = await transaction.politicalProposal.update({
        where: { id_tenantId: { id, tenantId: user.tenantId } },
        data: {
          ...dto,
          updatedById: user.userId,
        },
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
        },
      });

      return proposal;
    });

    return updated;
  }

  async delete(user: AuthenticatedUser, id: string) {
    const [existing, mode] = await Promise.all([
      this.findOne(user, id),
      this.getActiveMode(user.tenantId),
    ]);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.politicalProposal.delete({
        where: { id_tenantId: { id, tenantId: user.tenantId } },
      });

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
}
