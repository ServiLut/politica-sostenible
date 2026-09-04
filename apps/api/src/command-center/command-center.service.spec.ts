import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CampaignEventStatus,
  DivisionType,
  EntryType,
  PoliticalOperationMode,
  Prisma,
  Role,
  TaskStatus,
  TenantType,
  WitnessReportStatus,
  WorkPriority,
} from '../../prisma/generated/prisma';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMMAND_CENTER_ROLES,
  CommandCenterController,
} from './command-center.controller';
import { CommandCenterService } from './command-center.service';

describe('CommandCenterService secure briefing', () => {
  const campaignLeader: AuthenticatedUser = {
    userId: 'leader-a',
    tenantId: 'tenant-a',
    role: Role.CAMPAIGN_MANAGER,
  };

  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock; count: jest.Mock };
    teamInvitation: { count: jest.Mock };
    politicalDivision: { groupBy: jest.Mock };
    voter: { count: jest.Mock };
    campaignSettings: { findUnique: jest.Mock };
    financialEntry: { groupBy: jest.Mock; count: jest.Mock };
    witnessReport: { count: jest.Mock };
    task: { count: jest.Mock; findMany: jest.Mock };
    campaignEvent: { count: jest.Mock; findMany: jest.Mock };
    communicationApproval: { count: jest.Mock };
    issueCase: { count: jest.Mock };
    commitment: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: CommandCenterService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tenant-a',
          name: 'Campaña A',
          type: TenantType.CANDIDACY,
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ role: Role.CAMPAIGN_MANAGER }),
        count: jest.fn().mockResolvedValue(3),
      },
      teamInvitation: { count: jest.fn().mockResolvedValue(1) },
      politicalDivision: {
        groupBy: jest.fn().mockResolvedValue([
          { type: DivisionType.DEPARTAMENTO, _count: { _all: 1 } },
          { type: DivisionType.MUNICIPIO, _count: { _all: 5 } },
          { type: DivisionType.PUESTO, _count: { _all: 2 } },
        ]),
      },
      voter: {
        count: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(where.consentAccepted === true ? 8 : 10),
          ),
      },
      campaignSettings: {
        findUnique: jest.fn().mockResolvedValue({ id: 'settings-a' }),
      },
      financialEntry: {
        groupBy: jest.fn().mockResolvedValue([
          {
            type: EntryType.INCOME,
            _sum: { amount: new Prisma.Decimal('1000.00') },
          },
          {
            type: EntryType.EXPENSE,
            _sum: { amount: new Prisma.Decimal('400.00') },
          },
        ]),
        count: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(where.date ? 1 : 2),
          ),
      },
      witnessReport: {
        count: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(where.isSynced === true ? 4 : 5),
          ),
      },
      task: {
        count: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(where.dueAt ? 1 : 3),
          ),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'task-a',
            title: 'Cerrar ruta',
            status: TaskStatus.TODO,
            priority: WorkPriority.URGENT,
            dueAt: null,
          },
        ]),
      },
      campaignEvent: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-a',
            name: 'Encuentro territorial',
            startsAt: new Date('2026-09-01T14:00:00.000Z'),
            endsAt: new Date('2026-09-01T16:00:00.000Z'),
            status: CampaignEventStatus.SCHEDULED,
          },
        ]),
      },
      communicationApproval: { count: jest.fn().mockResolvedValue(1) },
      issueCase: { count: jest.fn() },
      commitment: { count: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    service = new CommandCenterService(prisma as unknown as PrismaService);
  });

  it('builds one deterministic campaign read model without returning PII', async () => {
    const result = await service.getBriefing(campaignLeader);

    expect(result).toMatchObject({
      tenant: {
        id: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      },
      activation: { ready: true, completedSteps: 4, totalSteps: 4 },
      metrics: {
        people: { total: 10, consented: 8, consentCoverage: 80 },
        team: { active: 3, pendingInvitations: 1 },
        territory: { municipalities: 5, pollingPlaces: 2 },
        finance: {
          income: '1000.00',
          expenses: '400.00',
          balance: '600.00',
          pending: 2,
          overdue: 1,
        },
        electionDay: { reports: 5, syncedReports: 4 },
      },
    });
    expect(result.alerts.map((alert) => alert.code)).toEqual(
      expect.arrayContaining([
        'FINANCE_REVIEW_OVERDUE',
        'CONSENT_COVERAGE_INCOMPLETE',
        'TASKS_OVERDUE',
        'COMMUNICATIONS_PENDING_REVIEW',
      ]),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('documentId');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('evidenceUrl');
    expect(serialized).not.toContain('description');
    expect(serialized).not.toContain('/dashboard/team');
  });

  it('shows the team activation action only to the authoritative ADMIN role', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.ADMIN });

    const result = await service.getBriefing({
      ...campaignLeader,
      role: Role.CAMPAIGN_MANAGER,
    });

    expect(result.activation).toMatchObject({ totalSteps: 5 });
    expect(result.activation.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'TEAM_READY',
          href: '/dashboard/team',
        }),
      ]),
    );
  });

  it('scopes every campaign query to the JWT tenant and server-side mode', async () => {
    await service.getBriefing(campaignLeader);

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: { id: true, name: true, type: true, defaultMode: true },
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'leader-a',
        tenantId: 'tenant-a',
        isActive: true,
      },
      select: { role: true },
    });
    expect(prisma.voter.count).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: 'tenant-a',
        consentAccepted: true,
        consentRecords: {
          some: {
            tenantId: 'tenant-a',
            mode: PoliticalOperationMode.CAMPAIGN,
            purpose: 'POLITICAL_COMMUNICATION',
            status: 'GRANTED',
            revokedAt: null,
            grantedAt: { lte: expect.any(Date) },
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        },
      },
    });
    for (const query of [
      prisma.user.count,
      prisma.teamInvitation.count,
      prisma.politicalDivision.groupBy,
      prisma.voter.count,
      prisma.campaignSettings.findUnique,
      prisma.financialEntry.groupBy,
      prisma.financialEntry.count,
      prisma.witnessReport.count,
      prisma.task.count,
      prisma.task.findMany,
      prisma.campaignEvent.count,
      prisma.campaignEvent.findMany,
      prisma.communicationApproval.count,
    ]) {
      for (const [args] of query.mock.calls) {
        expect(args.where).toEqual(
          expect.objectContaining({ tenantId: 'tenant-a' }),
        );
      }
    }
    for (const [args] of prisma.witnessReport.count.mock.calls) {
      expect(args.where.status).toBe(WitnessReportStatus.ACCEPTED);
    }
    for (const query of [
      prisma.task.count,
      prisma.task.findMany,
      prisma.campaignEvent.count,
      prisma.campaignEvent.findMany,
      prisma.communicationApproval.count,
    ]) {
      for (const [args] of query.mock.calls) {
        expect(args.where.mode).toBe(PoliticalOperationMode.CAMPAIGN);
      }
    }
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });

  it('rejects the authoritative DB role even when the token carries a leader role', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.VOLUNTEER });

    await expect(service.getBriefing(campaignLeader)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.voter.count).not.toHaveBeenCalled();
  });

  it('uses the public-office mode and its own leadership matrix', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-a',
      name: 'Concejo abierto',
      type: TenantType.PUBLIC_OFFICE,
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({
      role: Role.CONSTITUENT_SERVICES_MANAGER,
    });
    prisma.issueCase.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    prisma.task.count.mockResolvedValueOnce(6).mockResolvedValueOnce(2);
    prisma.commitment.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    const result = await service.getBriefing({
      ...campaignLeader,
      role: Role.CONSTITUENT_SERVICES_MANAGER,
    });

    expect(result).toMatchObject({
      tenant: { mode: PoliticalOperationMode.PUBLIC_OFFICE },
      metrics: {
        cases: { open: 5, overdue: 2, urgent: 1 },
        tasks: { open: 6, overdue: 2 },
        commitments: { open: 4, atRisk: 1, overdue: 2, public: 3 },
      },
    });
    expect(prisma.issueCase.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
      }),
    });
    expect(prisma.voter.count).not.toHaveBeenCalled();
    expect(prisma.financialEntry.count).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('/dashboard/team');
  });

  it('does not let a campaign manager read a public-office briefing', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-a',
      name: 'Concejo abierto',
      type: TenantType.PUBLIC_OFFICE,
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await expect(service.getBriefing(campaignLeader)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the DB role to scope every CASE_WORKER operational read and every returned title', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-a',
      name: 'Concejo abierto',
      type: TenantType.PUBLIC_OFFICE,
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.user.findFirst.mockResolvedValue({ role: Role.CASE_WORKER });
    prisma.issueCase.count.mockResolvedValue(0);
    prisma.task.count.mockResolvedValue(0);
    prisma.commitment.count.mockResolvedValue(0);

    await service.getBriefing({ ...campaignLeader, role: Role.ADMIN });

    for (const [args] of prisma.issueCase.count.mock.calls) {
      expect(args.where).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          assigneeId: 'leader-a',
        }),
      );
    }
    for (const query of [prisma.task.count, prisma.task.findMany]) {
      for (const [args] of query.mock.calls) {
        expect(args.where).toEqual(
          expect.objectContaining({
            tenantId: 'tenant-a',
            mode: PoliticalOperationMode.PUBLIC_OFFICE,
            AND: [
              {
                OR: [{ assigneeId: 'leader-a' }, { createdById: 'leader-a' }],
              },
              {
                OR: [
                  { issueCaseId: null },
                  {
                    issueCase: {
                      is: {
                        tenantId: 'tenant-a',
                        mode: PoliticalOperationMode.PUBLIC_OFFICE,
                        assigneeId: 'leader-a',
                      },
                    },
                  },
                ],
              },
              {
                OR: [
                  { commitmentId: null },
                  {
                    commitment: {
                      is: {
                        OR: [
                          {
                            issueCase: {
                              is: {
                                tenantId: 'tenant-a',
                                mode: PoliticalOperationMode.PUBLIC_OFFICE,
                                assigneeId: 'leader-a',
                              },
                            },
                          },
                          { issueCaseId: null, ownerId: 'leader-a' },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          }),
        );
      }
    }
    for (const [args] of prisma.commitment.count.mock.calls) {
      expect(args.where).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          OR: [
            {
              issueCase: {
                is: {
                  tenantId: 'tenant-a',
                  mode: PoliticalOperationMode.PUBLIC_OFFICE,
                  assigneeId: 'leader-a',
                },
              },
            },
            { issueCaseId: null, ownerId: 'leader-a' },
          ],
        }),
      );
    }
    for (const query of [
      prisma.campaignEvent.count,
      prisma.campaignEvent.findMany,
    ]) {
      for (const [args] of query.mock.calls) {
        expect(args.where).toEqual(
          expect.objectContaining({ responsibleId: 'leader-a' }),
        );
      }
    }
    expect(prisma.communicationApproval.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ requestedById: 'leader-a' }),
    });
  });

  it.each([Role.COMPLIANCE_OFFICER, Role.AUDITOR])(
    'lets the public-office read role %s use its visible command center',
    async (role) => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-a',
        name: 'Concejo abierto',
        type: TenantType.PUBLIC_OFFICE,
        defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      });
      prisma.issueCase.count.mockResolvedValue(0);
      prisma.task.count.mockResolvedValue(0);
      prisma.commitment.count.mockResolvedValue(0);
      prisma.user.findFirst.mockResolvedValue({ role });

      await expect(
        service.getBriefing({ ...campaignLeader, role }),
      ).resolves.toMatchObject({
        tenant: { mode: PoliticalOperationMode.PUBLIC_OFFICE },
      });
    },
  );

  it('fails closed when the JWT tenant no longer exists', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.getBriefing(campaignLeader)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when the authenticated user is no longer active in the tenant', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.getBriefing(campaignLeader)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('declares the exact cross-mode command-center roles in controller RBAC', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CommandCenterController)).toEqual(
      COMMAND_CENTER_ROLES,
    );
  });
});
