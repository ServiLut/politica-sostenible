import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CommitmentStatus,
  CommunicationApprovalStatus,
  IssueCaseStatus,
  PoliticalOperationMode,
  Role,
  TaskStatus,
  WorkPriority,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { OperationalInboxService } from './operational-inbox.service';

describe('OperationalInboxService secure unified read model', () => {
  const leader: AuthenticatedUser = {
    userId: 'leader-a',
    tenantId: 'tenant-a',
    role: Role.CAMPAIGN_MANAGER,
  };
  const owner = { id: 'owner-a', name: 'Responsable A', role: Role.ADMIN };
  const oldDate = new Date('2025-01-01T12:00:00.000Z');
  const futureDate = new Date('2099-01-01T12:00:00.000Z');

  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    politicalDivision: { findMany: jest.Mock };
    task: { findMany: jest.Mock; count: jest.Mock };
    commitment: { findMany: jest.Mock; count: jest.Mock };
    issueCase: { findMany: jest.Mock; count: jest.Mock };
    communicationApproval: { findMany: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: OperationalInboxService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-a',
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.CAMPAIGN_MANAGER,
          divisionId: null,
        }),
      },
      politicalDivision: { findMany: jest.fn().mockResolvedValue([]) },
      task: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'task-a',
            title: 'Cerrar logística',
            status: TaskStatus.BLOCKED,
            priority: WorkPriority.HIGH,
            dueAt: futureDate,
            createdAt: oldDate,
            assignee: owner,
            issueCase: null,
            commitment: null,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      commitment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'commitment-a',
            reference: 'COMP-001',
            title: 'Publicar respuesta',
            status: CommitmentStatus.AT_RISK,
            targetDate: futureDate,
            createdAt: oldDate,
            owner: null,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      issueCase: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'case-a',
            reference: 'INC-001',
            title: 'Incidente logístico',
            status: IssueCaseStatus.IN_PROGRESS,
            priority: WorkPriority.URGENT,
            dueAt: oldDate,
            createdAt: oldDate,
            assignee: owner,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      communicationApproval: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'approval-a',
            title: 'Comunicado territorial',
            status: CommunicationApprovalStatus.PENDING,
            scheduledAt: null,
            createdAt: oldDate,
            requestedBy: owner,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    service = new OperationalInboxService(prisma as unknown as PrismaService);
  });

  it('normalizes, prioritizes and summarizes open work without returning source details', async () => {
    const result = await service.findAll(leader, { limit: 20 });

    expect(result.mode).toBe(PoliticalOperationMode.CAMPAIGN);
    expect(result.summary).toMatchObject({
      total: 4,
      visible: 4,
      overdue: 1,
      blocked: 3,
      unassigned: 1,
      pendingApprovals: 1,
      truncated: false,
      byKind: {
        tasks: 1,
        commitments: 1,
        cases: 0,
        incidents: 1,
        approvals: 1,
      },
    });
    expect(result.items.map((item) => item.id)).toEqual([
      'INCIDENT:case-a',
      'COMMITMENT:commitment-a',
      'TASK:task-a',
      'COMMUNICATION_APPROVAL:approval-a',
    ]);
    expect(result.items[0]).toMatchObject({
      kind: 'INCIDENT',
      kindLabel: 'Incidente',
      overdue: true,
      cta: { href: '/dashboard/incidents' },
    });
    expect(JSON.stringify(result)).not.toContain('description');
    expect(JSON.stringify(result)).not.toContain('externalContactRef');
    expect(JSON.stringify(result)).not.toContain('contentHash');
  });

  it('derives tenant and mode exclusively from authentication and scopes every source query', async () => {
    await service.findAll(
      { ...leader, tenantId: 'tenant-a', role: Role.ADMIN },
      { limit: 17 },
    );

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: { id: true, defaultMode: true },
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'leader-a', tenantId: 'tenant-a', isActive: true },
      select: { role: true, divisionId: true },
    });
    for (const query of [
      prisma.task.findMany,
      prisma.task.count,
      prisma.commitment.findMany,
      prisma.commitment.count,
      prisma.issueCase.findMany,
      prisma.issueCase.count,
      prisma.communicationApproval.findMany,
      prisma.communicationApproval.count,
    ]) {
      const [args] = query.mock.calls[0];
      expect(args.where).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
        }),
      );
    }
    expect(prisma.task.findMany.mock.calls[0][0].take).toBe(17);
  });

  it('limits a case worker to assigned cases, related work and own approvals', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-a',
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CASE_WORKER,
      divisionId: null,
    });

    await service.findAll(
      {
        userId: 'worker-a',
        tenantId: 'tenant-a',
        role: Role.ADMIN,
      },
      {},
    );

    const taskWhere = prisma.task.findMany.mock.calls[0][0].where;
    const commitmentWhere = prisma.commitment.findMany.mock.calls[0][0].where;
    const caseWhere = prisma.issueCase.findMany.mock.calls[0][0].where;
    const approvalWhere =
      prisma.communicationApproval.findMany.mock.calls[0][0].where;

    expect(JSON.stringify(taskWhere)).toContain('worker-a');
    expect(JSON.stringify(commitmentWhere)).toContain('worker-a');
    expect(caseWhere).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        AND: [{ assigneeId: 'worker-a' }],
      }),
    );
    expect(approvalWhere).toEqual(
      expect.objectContaining({ AND: [{ requestedById: 'worker-a' }] }),
    );
  });

  it('uses the persisted role and rejects an incompatible or inactive actor', async () => {
    prisma.user.findFirst.mockResolvedValue({
      role: Role.FINANCE_MANAGER,
      divisionId: null,
    });

    await expect(
      service.findAll({ ...leader, role: Role.ADMIN }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when the authenticated tenant does not exist', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.findAll(leader, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('scopes a territorial coordinator to the assigned division descendants', async () => {
    prisma.user.findFirst.mockResolvedValue({
      role: Role.ZONE_COORDINATOR,
      divisionId: 'division-parent',
    });
    prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'division-parent', parentId: null },
      { id: 'division-child', parentId: 'division-parent' },
      { id: 'division-foreign', parentId: null },
    ]);

    await service.findAll(
      {
        userId: 'coordinator-a',
        tenantId: 'tenant-a',
        role: Role.ADMIN,
      },
      {},
    );

    const taskScope = prisma.task.findMany.mock.calls[0][0].where.AND[0];
    expect(JSON.stringify(taskScope)).toContain('division-parent');
    expect(JSON.stringify(taskScope)).toContain('division-child');
    expect(JSON.stringify(taskScope)).not.toContain('division-foreign');
    expect(prisma.communicationApproval.findMany).not.toHaveBeenCalled();
  });
});
