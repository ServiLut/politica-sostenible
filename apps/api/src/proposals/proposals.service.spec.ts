import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PoliticalOperationMode,
  Prisma,
  ProposalCategory,
  ProposalStatus,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ProposalsService } from './proposals.service';
import { ProposalsController } from './proposals.controller';
import { ListProposalsQueryDto } from './dto/list-proposals-query.dto';

describe('ProposalsService contract and tenant isolation', () => {
  const actor: AuthenticatedUser = {
    userId: 'manager-a',
    tenantId: 'tenant-a',
    role: Role.CAMPAIGN_MANAGER,
  };
  const proposalRecord = {
    id: 'proposal-a',
    referenceCode: 'PRO-001',
    title: 'Agua segura',
    description: 'Acueductos rurales verificables',
    category: ProposalCategory.INFRASTRUCTURE,
    targetGroup: null,
    status: ProposalStatus.IN_PROGRESS,
    progressPercent: 42,
    isPublic: true,
    territory: 'Zona rural',
    estimatedCost: new Prisma.Decimal('125000.50'),
    sourceUrl: null,
    ownerId: 'owner-a',
    owner: { id: 'owner-a', name: 'Laura Responsable' },
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    updatedAt: new Date('2026-08-02T12:00:00.000Z'),
  };

  let prisma: {
    $queryRaw: jest.Mock;
    politicalProposal: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: { findFirst: jest.Mock };
    tenant: { findUnique: jest.Mock };
    auditEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: ProposalsService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ stage: 'CAMPAIGN' }]),
      politicalProposal: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: actor.userId }),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    service = new ProposalsService(prisma as unknown as PrismaService);
  });

  it('returns the explicit owner/progress/cost contract and scopes the list to the JWT tenant', async () => {
    prisma.politicalProposal.findMany.mockResolvedValue([proposalRecord]);
    prisma.politicalProposal.count.mockResolvedValue(1);

    const result = await service.findAll(actor, {
      page: 2,
      limit: 5,
      status: ProposalStatus.IN_PROGRESS,
    });

    expect(prisma.politicalProposal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          status: ProposalStatus.IN_PROGRESS,
        },
        skip: 5,
        take: 5,
        select: expect.objectContaining({
          progressPercent: true,
          estimatedCost: true,
          owner: { select: { id: true, name: true } },
        }),
      }),
    );
    expect(prisma.politicalProposal.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        status: ProposalStatus.IN_PROGRESS,
      },
    });
    expect(result.items[0]).toEqual({
      ...proposalRecord,
      estimatedCost: 125000.5,
    });
    expect(result.items[0]).not.toHaveProperty('tenantId');
  });

  it('allows PARTY tenants while preserving CAMPAIGN mode', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.CAMPAIGN,
      type: TenantType.PARTY,
    });

    await expect(
      service.findAll(actor, new ListProposalsQueryDto()),
    ).resolves.toMatchObject({
      items: [],
    });
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: actor.tenantId },
      select: { defaultMode: true, type: true },
    });
  });

  it.each([
    ['GSC', TenantType.GSC, PoliticalOperationMode.CAMPAIGN],
    [
      'PUBLIC_OFFICE type',
      TenantType.PUBLIC_OFFICE,
      PoliticalOperationMode.CAMPAIGN,
    ],
    [
      'PUBLIC_OFFICE mode',
      TenantType.CANDIDACY,
      PoliticalOperationMode.PUBLIC_OFFICE,
    ],
  ])(
    'denies every read and mutation for %s before proposal or user data reads',
    async (_label, type, defaultMode) => {
      prisma.tenant.findUnique.mockResolvedValue({ type, defaultMode });

      const attempts = [
        () => service.findAll(actor, new ListProposalsQueryDto()),
        () => service.findOne(actor, 'proposal-a'),
        () =>
          service.create(actor, {
            title: 'Propuesta bloqueada',
            category: ProposalCategory.OTHER,
          }),
        () => service.update(actor, 'proposal-a', { title: 'Bloqueada' }),
        () => service.delete(actor, 'proposal-a'),
      ];

      for (const attempt of attempts) {
        await expect(attempt()).rejects.toBeInstanceOf(ForbiddenException);
      }

      expect(prisma.politicalProposal.findMany).not.toHaveBeenCalled();
      expect(prisma.politicalProposal.count).not.toHaveBeenCalled();
      expect(prisma.politicalProposal.findUnique).not.toHaveBeenCalled();
      expect(prisma.politicalProposal.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([TenantType.GSC, TenantType.PUBLIC_OFFICE])(
    'keeps the %s domain denial when called through the API controller',
    async (type) => {
      prisma.tenant.findUnique.mockResolvedValue({
        type,
        defaultMode: PoliticalOperationMode.CAMPAIGN,
      });
      const controller = new ProposalsController(service);

      await expect(
        controller.findAll(actor, new ListProposalsQueryDto()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.politicalProposal.findMany).not.toHaveBeenCalled();
    },
  );

  it('never resolves a proposal from a different tenant', async () => {
    prisma.politicalProposal.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne(actor, 'proposal-from-tenant-b'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.politicalProposal.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: {
            id: 'proposal-from-tenant-b',
            tenantId: 'tenant-a',
          },
        },
      }),
    );
  });

  it('rejects assigning an owner outside the JWT tenant before writing', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.create(actor, {
        title: 'Propuesta aislada',
        category: ProposalCategory.EDUCATION,
        ownerId: 'owner-from-tenant-b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'owner-from-tenant-b',
        tenantId: 'tenant-a',
        isActive: true,
      },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.politicalProposal.create).not.toHaveBeenCalled();
  });

  it('creates for the JWT tenant, defaults the owner to the actor and serializes Decimal as number', async () => {
    prisma.politicalProposal.create.mockResolvedValue({
      ...proposalRecord,
      status: ProposalStatus.DRAFT,
      progressPercent: 0,
      ownerId: actor.userId,
      owner: { id: actor.userId, name: 'Gerencia' },
    });

    const result = await service.create(actor, {
      title: 'Agua segura',
      description: 'Acueductos rurales verificables',
      category: ProposalCategory.INFRASTRUCTURE,
      estimatedCost: 125000.5,
      isPublic: true,
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: actor.userId,
        tenantId: actor.tenantId,
        isActive: true,
      },
      select: { id: true },
    });
    expect(prisma.politicalProposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: actor.tenantId,
          ownerId: actor.userId,
          createdById: actor.userId,
          updatedById: actor.userId,
          status: ProposalStatus.DRAFT,
          progressPercent: 0,
          estimatedCost: 125000.5,
        }),
        select: expect.objectContaining({
          owner: { select: { id: true, name: true } },
        }),
      }),
    );
    expect(result.estimatedCost).toBe(125000.5);
    expect(result.owner).toEqual({ id: actor.userId, name: 'Gerencia' });
  });

  it('rejects attempts to create a proposal with fabricated progress or final status', async () => {
    await expect(
      service.create(actor, {
        title: 'Resultado sin trayectoria',
        category: ProposalCategory.GOVERNANCE,
        status: ProposalStatus.COMPLETED,
        progressPercent: 0,
      }),
    ).rejects.toThrow('debe iniciar como borrador con progreso 0');

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.politicalProposal.create).not.toHaveBeenCalled();
  });

  it('validates a changed owner in-tenant and supports clearing estimated cost', async () => {
    prisma.politicalProposal.findUnique.mockResolvedValue({
      ...proposalRecord,
      status: ProposalStatus.DRAFT,
      progressPercent: 0,
    });
    prisma.user.findFirst.mockResolvedValue({ id: 'owner-b' });
    prisma.politicalProposal.update.mockResolvedValue({
      ...proposalRecord,
      ownerId: 'owner-b',
      owner: { id: 'owner-b', name: 'Nuevo responsable' },
      status: ProposalStatus.DRAFT,
      progressPercent: 0,
      estimatedCost: null,
    });

    const result = await service.update(actor, proposalRecord.id, {
      ownerId: 'owner-b',
      estimatedCost: null,
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'owner-b',
        tenantId: actor.tenantId,
        isActive: true,
      },
      select: { id: true },
    });
    expect(prisma.politicalProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: {
            id: proposalRecord.id,
            tenantId: actor.tenantId,
          },
        },
        data: {
          ownerId: 'owner-b',
          estimatedCost: null,
          updatedById: actor.userId,
        },
      }),
    );
    expect(result.estimatedCost).toBeNull();
    expect(result.progressPercent).toBe(0);
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          previousOwnerId: 'owner-a',
          currentOwnerId: 'owner-b',
        }),
      }),
    });
  });

  it.each([
    [ProposalStatus.PROPOSED, ProposalStatus.DRAFT],
    [ProposalStatus.IN_PROGRESS, ProposalStatus.PROPOSED],
    [ProposalStatus.COMPLETED, ProposalStatus.IN_PROGRESS],
    [ProposalStatus.WITHDRAWN, ProposalStatus.PROPOSED],
  ])(
    'refuses to rewrite proposal history from %s to %s',
    async (currentStatus, requestedStatus) => {
      prisma.politicalProposal.findUnique.mockResolvedValue({
        ...proposalRecord,
        status: currentStatus,
      });

      await expect(
        service.update(actor, proposalRecord.id, { status: requestedStatus }),
      ).rejects.toThrow(
        `No se permite cambiar una propuesta de ${currentStatus} a ${requestedStatus}`,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.politicalProposal.update).not.toHaveBeenCalled();
      expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    },
  );

  it('allows the forward lifecycle and records the status transition', async () => {
    prisma.politicalProposal.findUnique.mockResolvedValue({
      ...proposalRecord,
      status: ProposalStatus.IN_PROGRESS,
    });
    prisma.politicalProposal.update.mockResolvedValue({
      ...proposalRecord,
      status: ProposalStatus.COMPLETED,
      progressPercent: 100,
    });

    await service.update(actor, proposalRecord.id, {
      status: ProposalStatus.COMPLETED,
      progressPercent: 100,
    });

    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'PROPOSAL_UPDATED',
        metadata: {
          changedFields: ['progressPercent', 'status'],
          previousStatus: ProposalStatus.IN_PROGRESS,
          currentStatus: ProposalStatus.COMPLETED,
          previousProgressPercent: 42,
          currentProgressPercent: 100,
          previousOwnerId: 'owner-a',
          currentOwnerId: 'owner-a',
        },
      }),
    });
  });

  it('keeps the committed content immutable after a proposal leaves draft', async () => {
    prisma.politicalProposal.findUnique.mockResolvedValue({
      ...proposalRecord,
      status: ProposalStatus.PROPOSED,
    });

    await expect(
      service.update(actor, proposalRecord.id, {
        title: 'Texto político reescrito',
        status: ProposalStatus.PROPOSED,
      }),
    ).rejects.toThrow(
      'El contenido comprometido de una propuesta publicada es inmutable',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.politicalProposal.update).not.toHaveBeenCalled();
  });

  it('requires 100 percent before completing a proposal', async () => {
    prisma.politicalProposal.findUnique.mockResolvedValue({
      ...proposalRecord,
      status: ProposalStatus.IN_PROGRESS,
      progressPercent: 90,
    });

    await expect(
      service.update(actor, proposalRecord.id, {
        status: ProposalStatus.COMPLETED,
      }),
    ).rejects.toThrow('progreso de 100 %');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not report execution progress before work starts', async () => {
    prisma.politicalProposal.findUnique.mockResolvedValue({
      ...proposalRecord,
      status: ProposalStatus.DRAFT,
      progressPercent: 0,
    });

    await expect(
      service.update(actor, proposalRecord.id, {
        status: ProposalStatus.PROPOSED,
        progressPercent: 20,
      }),
    ).rejects.toThrow('debe conservar progreso 0');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records the immutable commitment snapshot when a draft is proposed', async () => {
    const draft = {
      ...proposalRecord,
      status: ProposalStatus.DRAFT,
      progressPercent: 0,
    };
    const proposed = { ...draft, status: ProposalStatus.PROPOSED };
    prisma.politicalProposal.findUnique.mockResolvedValue(draft);
    prisma.politicalProposal.update.mockResolvedValue(proposed);

    await service.update(actor, proposalRecord.id, {
      status: ProposalStatus.PROPOSED,
    });

    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'PROPOSAL_UPDATED',
        after: expect.objectContaining({
          referenceCode: proposalRecord.referenceCode,
          title: proposalRecord.title,
          status: ProposalStatus.PROPOSED,
          progressPercent: 0,
          estimatedCost: '125000.5',
        }),
      }),
    });
  });

  it('freezes final ownership and progress for completed proposals', async () => {
    prisma.politicalProposal.findUnique.mockResolvedValue({
      ...proposalRecord,
      status: ProposalStatus.COMPLETED,
      progressPercent: 100,
    });

    await expect(
      service.update(actor, proposalRecord.id, { progressPercent: 99 }),
    ).rejects.toThrow('conserva responsable y progreso finales');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to erase a proposal once it has left draft status', async () => {
    prisma.politicalProposal.findUnique.mockResolvedValue(proposalRecord);

    await expect(service.delete(actor, proposalRecord.id)).rejects.toThrow(
      'Solo pueden eliminarse propuestas que todavía estén en borrador',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.politicalProposal.deleteMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('deletes an in-tenant draft and preserves a redacted audit event', async () => {
    prisma.politicalProposal.findUnique.mockResolvedValue({
      ...proposalRecord,
      status: ProposalStatus.DRAFT,
    });
    prisma.politicalProposal.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.delete(actor, proposalRecord.id)).resolves.toEqual({
      success: true,
    });

    expect(prisma.politicalProposal.deleteMany).toHaveBeenCalledWith({
      where: {
        id: proposalRecord.id,
        tenantId: actor.tenantId,
        status: ProposalStatus.DRAFT,
      },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'PROPOSAL_DELETED',
        resourceId: proposalRecord.id,
      }),
    });
  });

  it('does not delete when another request advances the draft first', async () => {
    prisma.politicalProposal.findUnique.mockResolvedValue({
      ...proposalRecord,
      status: ProposalStatus.DRAFT,
    });
    prisma.politicalProposal.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.delete(actor, proposalRecord.id)).rejects.toThrow(
      'La propuesta cambió de estado y ya no puede eliminarse',
    );

    expect(prisma.politicalProposal.deleteMany).toHaveBeenCalledWith({
      where: {
        id: proposalRecord.id,
        tenantId: actor.tenantId,
        status: ProposalStatus.DRAFT,
      },
    });
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });
});
