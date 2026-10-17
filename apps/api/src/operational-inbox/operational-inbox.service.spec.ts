import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CommitmentStatus,
  CommunicationApprovalStatus,
  IssueCaseStatus,
  PoliticalOperationMode,
  PqrsdDeadlineCalculationStatus,
  PqrsdDossierStatus,
  PqrsdRiskLevel,
  Role,
  TaskStatus,
  TenantType,
  WorkPriority,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { OperationalInboxService } from './operational-inbox.service';

type Fixture = Record<string, unknown>;
function matchesRankingPartition(row: Fixture, where: Fixture): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND')
      return (value as Fixture[]).every((part) =>
        matchesRankingPartition(row, part),
      );
    if (key === 'OR')
      return (value as Fixture[]).some((part) =>
        matchesRankingPartition(row, part),
      );
    if (key === 'NOT') return !matchesRankingPartition(row, value as Fixture);
    const actual =
      key === 'assigneeId'
        ? ((row.assignee as Fixture | null)?.id ?? null)
        : key === 'ownerId'
          ? ((row.owner as Fixture | null)?.id ?? null)
          : row[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === 'not') return actual !== expected;
        if (operator === 'in') return (expected as unknown[]).includes(actual);
        if (operator === 'lt')
          return actual instanceof Date && actual < (expected as Date);
        if (operator === 'gte')
          return actual instanceof Date && actual >= (expected as Date);
        throw new Error(`Unsupported fixture operator: ${operator}`);
      });
    }
    return actual === value;
  });
}

function selectFixtureRows(
  rows: Fixture[],
  args: {
    where: { AND?: Fixture[] };
    orderBy: Fixture[];
    take: number;
  },
) {
  const partition = args.where.AND?.[1];
  const priorities = [
    WorkPriority.LOW,
    WorkPriority.MEDIUM,
    WorkPriority.HIGH,
    WorkPriority.URGENT,
  ];
  return rows
    .filter((row) => !partition || matchesRankingPartition(row, partition))
    .sort((a, b) => {
      for (const order of args.orderBy) {
        const [field, direction] = Object.entries(order)[0];
        const av = a[field],
          bv = b[field];
        if (av === bv) continue;
        if (av === null) return 1;
        if (bv === null) return -1;
        const comparison =
          field === 'priority'
            ? priorities.indexOf(av as WorkPriority) -
              priorities.indexOf(bv as WorkPriority)
            : av instanceof Date && bv instanceof Date
              ? av.getTime() - bv.getTime()
              : typeof av === 'string' && typeof bv === 'string'
                ? av.localeCompare(bv)
                : 0;
        if (comparison) return direction === 'desc' ? -comparison : comparison;
      }
      return 0;
    })
    .slice(0, args.take);
}

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
    pqrsdDossier: { findMany: jest.Mock; count: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let service: OperationalInboxService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-a',
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
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
      pqrsdDossier: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'pqrsd-a' }]),
    };
    for (const delegate of [
      prisma.task,
      prisma.commitment,
      prisma.issueCase,
      prisma.communicationApproval,
    ]) {
      const rows = delegate.findMany() as Promise<Fixture[]>;
      delegate.findMany
        .mockReset()
        .mockImplementation(
          async (args: Parameters<typeof selectFixtureRows>[1]) =>
            selectFixtureRows(await rows, args),
        );
    }
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
        pqrsd: 0,
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
      cta: {
        label: 'Gestionar incidente',
        href: '/dashboard/incidents?view=detail&entityId=case-a',
      },
    });
    expect(result.items.find((item) => item.kind === 'TASK')?.cta).toEqual({
      label: 'Gestionar tarea',
      href: '/dashboard/tasks?view=tasks&entityId=task-a',
    });
    expect(
      result.items.find((item) => item.kind === 'COMMITMENT')?.cta,
    ).toEqual({
      label: 'Gestionar compromiso',
      href: '/dashboard/tasks?view=commitments&entityId=commitment-a',
    });
    expect(
      result.items.find((item) => item.kind === 'COMMUNICATION_APPROVAL')?.cta,
    ).toEqual({
      label: 'Revisar y decidir',
      href: '/dashboard/communications?view=review&entityId=approval-a',
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
      select: { id: true, defaultMode: true, type: true },
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
      for (const [args] of query.mock.calls) {
        expect(args.where).toEqual(
          expect.objectContaining({
            tenantId: 'tenant-a',
            mode: PoliticalOperationMode.CAMPAIGN,
          }),
        );
      }
    }
    expect(prisma.task.findMany.mock.calls[0][0].take).toBe(17);
  });

  it('limits a case worker to assigned cases, related work and own approvals', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-a',
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CASE_WORKER,
      divisionId: null,
    });

    const result = await service.findAll(
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
        AND: expect.arrayContaining([{ assigneeId: 'worker-a' }]),
      }),
    );
    expect(approvalWhere).toEqual(
      expect.objectContaining({ AND: [{ requestedById: 'worker-a' }] }),
    );
    expect(prisma.pqrsdDossier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
      }),
    );
    expect(
      result.items.find((item) => item.kind === 'COMMUNICATION_APPROVAL')?.cta,
    ).toEqual({
      label: 'Revisar solicitud',
      href: '/dashboard/communications?view=review&entityId=approval-a',
    });
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

    const result = await service.findAll(
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
    expect(prisma.issueCase.findMany).not.toHaveBeenCalled();
    expect(prisma.issueCase.count).not.toHaveBeenCalled();
    expect(prisma.communicationApproval.findMany).not.toHaveBeenCalled();
    expect(result.summary.byKind.incidents).toBe(0);
    expect(result.items.some((item) => item.kind === 'INCIDENT')).toBe(false);
    expect(
      result.items.find((item) => item.kind === 'COMMITMENT')?.cta.label,
    ).toBe('Revisar compromiso');
  });

  it('uses review language for audit roles without hiding real decision capability', async () => {
    prisma.user.findFirst.mockResolvedValue({
      role: Role.COMPLIANCE_OFFICER,
      divisionId: null,
    });

    const complianceResult = await service.findAll(
      { ...leader, role: Role.ADMIN },
      {},
    );

    expect(
      complianceResult.items.find((item) => item.kind === 'INCIDENT')?.cta
        .label,
    ).toBe('Revisar incidente');
    expect(
      complianceResult.items.find((item) => item.kind === 'TASK')?.cta.label,
    ).toBe('Revisar tarea');
    expect(
      complianceResult.items.find(
        (item) => item.kind === 'COMMUNICATION_APPROVAL',
      )?.cta.label,
    ).toBe('Revisar y decidir');

    prisma.user.findFirst.mockResolvedValue({
      role: Role.AUDITOR,
      divisionId: null,
    });
    const auditorResult = await service.findAll(
      { ...leader, role: Role.ADMIN },
      {},
    );
    expect(
      auditorResult.items.find((item) => item.kind === 'INCIDENT')?.cta.label,
    ).toBe('Revisar incidente');
    expect(
      auditorResult.items.find((item) => item.kind === 'COMMUNICATION_APPROVAL')
        ?.cta.label,
    ).toBe('Revisar solicitud');
  });

  it('adds only open formal PQRSD with the latest deadline and safe assignment projection', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-a',
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CONSTITUENT_SERVICES_MANAGER,
      divisionId: null,
    });
    prisma.pqrsdDossier.findMany.mockResolvedValue([
      {
        id: 'pqrsd-a',
        reference: 'PQRSD-INT-001',
        subject: 'Solicitud de alumbrado público',
        status: PqrsdDossierStatus.WAITING_ON_PETITIONER,
        riskLevel: PqrsdRiskLevel.HIGH,
        createdAt: oldDate,
        currentPrimaryAssignee: {
          id: 'inactive-primary',
          name: 'Responsable inactivo',
          role: Role.CASE_WORKER,
          isActive: false,
        },
        currentBackupAssignee: {
          id: 'active-backup',
          name: 'Suplencia activa',
          role: Role.CASE_WORKER,
          isActive: true,
        },
        deadlines: [
          {
            calculationStatus: PqrsdDeadlineCalculationStatus.MANUAL_REVIEWED,
            dueAt: oldDate,
          },
        ],
      },
    ]);
    prisma.pqrsdDossier.count.mockResolvedValue(1);

    const result = await service.findAll(
      { ...leader, role: Role.CONSTITUENT_SERVICES_MANAGER },
      { limit: 20 },
    );

    const dossierQuery = prisma.pqrsdDossier.findMany.mock.calls[0][0];
    expect(dossierQuery.where).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-a',
        status: {
          in: expect.not.arrayContaining([
            PqrsdDossierStatus.CLOSED,
            PqrsdDossierStatus.CANCELLED,
          ]),
        },
      }),
    );
    expect(dossierQuery.select.deadlines).toEqual({
      orderBy: { versionNumber: 'desc' },
      take: 1,
      select: { calculationStatus: true, dueAt: true },
    });
    expect(dossierQuery.select).not.toHaveProperty('description');
    expect(dossierQuery.select).not.toHaveProperty('petitioner');
    expect(result.summary.byKind.pqrsd).toBe(1);
    expect(result.items).toContainEqual(
      expect.objectContaining({
        id: 'PQRSD:pqrsd-a',
        kind: 'PQRSD',
        reference: 'PQRSD-INT-001',
        title: 'Solicitud de alumbrado público',
        status: PqrsdDossierStatus.WAITING_ON_PETITIONER,
        priority: WorkPriority.URGENT,
        responsible: expect.objectContaining({ id: 'active-backup' }),
        dueAt: oldDate.toISOString(),
        overdue: true,
        blocked: true,
        cta: {
          label: 'Gestionar expediente',
          href: '/dashboard/pqrsd?view=detail&entityId=pqrsd-a',
        },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('Responsable inactivo');
  });

  it('does not expose PQRSD to a role outside the formal read policy', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-a',
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.COMMUNICATIONS_MANAGER,
      divisionId: null,
    });

    const result = await service.findAll(
      { ...leader, role: Role.COMMUNICATIONS_MANAGER },
      {},
    );

    expect(prisma.pqrsdDossier.findMany).not.toHaveBeenCalled();
    expect(prisma.pqrsdDossier.count).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result.summary.byKind.pqrsd).toBe(0);
    expect(result.items.some((item) => item.kind === 'PQRSD')).toBe(false);
  });

  it('keeps global source totals distinct from visible attention counters under truncation', async () => {
    const result = await service.findAll(leader, { limit: 1 });
    expect(result.summary).toMatchObject({
      total: 4,
      visible: 1,
      truncated: true,
      pendingApprovals: 1,
      overdue: 1,
      blocked: 0,
      unassigned: 0,
    });
  });

  it.each(['task', 'issueCase'] as const)(
    'selects the actual top 100 %s records before truncation, including undated urgent work',
    async (source) => {
      for (const delegate of [
        prisma.task,
        prisma.commitment,
        prisma.issueCase,
        prisma.communicationApproval,
      ]) {
        delegate.findMany.mockResolvedValue([]);
        delegate.count.mockResolvedValue(0);
      }
      const openStatus =
        source === 'task' ? TaskStatus.TODO : IssueCaseStatus.OPEN;
      const blockedStatus =
        source === 'task'
          ? TaskStatus.BLOCKED
          : IssueCaseStatus.WAITING_ON_CITIZEN;
      const rows: Fixture[] = Array.from({ length: 101 }, (_, index) => ({
        id: `low-${String(index).padStart(3, '0')}`,
        title: 'Baja prioridad con fecha',
        status: openStatus,
        priority: WorkPriority.LOW,
        dueAt: futureDate,
        createdAt: oldDate,
        assignee: owner,
        issueCase: null,
        commitment: null,
        reference: 'REF',
      }));
      const special = [
        {
          id: 'urgent-without-date',
          priority: WorkPriority.URGENT,
          dueAt: null,
        },
        { id: 'urgent-with-date', priority: WorkPriority.URGENT },
        {
          id: 'blocked-without-date',
          priority: WorkPriority.URGENT,
          status: blockedStatus,
          dueAt: null,
        },
        {
          id: 'unassigned-without-date',
          priority: WorkPriority.URGENT,
          assignee: null,
          dueAt: null,
        },
        { id: 'overdue-low', dueAt: oldDate },
      ];
      rows.push(...special.map((overrides) => ({ ...rows[0], ...overrides })));
      prisma[source].findMany.mockImplementation(
        (args: Parameters<typeof selectFixtureRows>[1]) =>
          Promise.resolve(selectFixtureRows(rows, args)),
      );
      prisma[source].count.mockResolvedValue(rows.length);

      const result = await service.findAll(leader, { limit: 100 });

      expect(result.items.slice(0, 5).map((item) => item.entityId)).toEqual([
        'overdue-low',
        'blocked-without-date',
        'unassigned-without-date',
        'urgent-with-date',
        'urgent-without-date',
      ]);
      expect(result.items).toHaveLength(100);
      expect(new Set(result.items.map((item) => item.id)).size).toBe(100);
      expect(result.summary).toMatchObject({
        total: 106,
        visible: 100,
        truncated: true,
      });
      expect(prisma[source].findMany).toHaveBeenCalledTimes(4);
      for (const [args] of prisma[source].findMany.mock.calls) {
        expect(args.where).toMatchObject({
          tenantId: leader.tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
        });
        expect(args.take).toBe(100);
      }
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
    },
  );

  it('does not starve an at-risk or unassigned commitment behind 101 dated planned commitments', async () => {
    for (const delegate of [
      prisma.task,
      prisma.issueCase,
      prisma.communicationApproval,
    ]) {
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);
    }
    const rows: Fixture[] = Array.from({ length: 101 }, (_, index) => ({
      id: `planned-${index}`,
      reference: `COMP-${index}`,
      title: 'Compromiso programado',
      status: CommitmentStatus.PLANNED,
      targetDate: futureDate,
      createdAt: oldDate,
      owner,
    }));
    rows.push({
      ...rows[0],
      id: 'at-risk-no-date',
      status: CommitmentStatus.AT_RISK,
      targetDate: null,
    });
    rows.push({
      ...rows[0],
      id: 'unassigned-no-date',
      owner: null,
      targetDate: null,
    });
    prisma.commitment.findMany.mockImplementation(
      (args: Parameters<typeof selectFixtureRows>[1]) =>
        Promise.resolve(selectFixtureRows(rows, args)),
    );
    prisma.commitment.count.mockResolvedValue(rows.length);

    const result = await service.findAll(leader, { limit: 100 });

    expect(result.items.slice(0, 2).map((item) => item.entityId)).toEqual([
      'at-risk-no-date',
      'unassigned-no-date',
    ]);
    expect(result.summary.total).toBe(103);
    expect(result.items).toHaveLength(100);
    expect(prisma.commitment.findMany).toHaveBeenCalledTimes(6);
  });

  it('selects an overdue scheduled approval ahead of 101 older unscheduled approvals', async () => {
    for (const delegate of [prisma.task, prisma.issueCase, prisma.commitment]) {
      delegate.findMany.mockResolvedValue([]);
      delegate.count.mockResolvedValue(0);
    }
    const rows: Fixture[] = Array.from({ length: 101 }, (_, index) => ({
      id: `approval-${index}`,
      title: 'Revisión sin fecha',
      status: CommunicationApprovalStatus.PENDING,
      scheduledAt: null,
      createdAt: oldDate,
      requestedBy: owner,
    }));
    rows.push({
      ...rows[0],
      id: 'scheduled-overdue',
      scheduledAt: oldDate,
      createdAt: new Date('2026-01-01'),
    });
    prisma.communicationApproval.findMany.mockImplementation(
      (args: Parameters<typeof selectFixtureRows>[1]) =>
        Promise.resolve(selectFixtureRows(rows, args)),
    );
    prisma.communicationApproval.count.mockResolvedValue(rows.length);

    const result = await service.findAll(leader, { limit: 100 });

    expect(result.items[0].entityId).toBe('scheduled-overdue');
    expect(result.items[0].overdue).toBe(true);
    expect(result.summary.total).toBe(102);
    expect(result.items).toHaveLength(100);
  });
});
