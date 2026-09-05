import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignEventStatus,
  CommitmentStatus,
  CommunicationApprovalStatus,
  ConsentPurpose,
  ConsentStatus,
  DivisionType,
  EntryType,
  FinanceStatus,
  IssueCaseStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
  TaskStatus,
  WitnessReportStatus,
  WorkPriority,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';

const CAMPAIGN_LEADERS: readonly Role[] = [Role.ADMIN, Role.CAMPAIGN_MANAGER];
const PUBLIC_OFFICE_LEADERS: readonly Role[] = [
  Role.ADMIN,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];
const OPEN_TASK_STATUSES = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
] as const;
const OPEN_CASE_STATUSES = [
  IssueCaseStatus.OPEN,
  IssueCaseStatus.TRIAGED,
  IssueCaseStatus.IN_PROGRESS,
  IssueCaseStatus.WAITING_ON_CITIZEN,
  IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY,
] as const;
const OPEN_COMMITMENT_STATUSES = [
  CommitmentStatus.PROPOSED,
  CommitmentStatus.PLANNED,
  CommitmentStatus.IN_PROGRESS,
  CommitmentStatus.AT_RISK,
] as const;

type AlertSeverity = 'critical' | 'attention' | 'ok';

export interface BriefingAlert {
  code: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href: string;
  count?: number;
}

export interface ActivationStep {
  code: string;
  title: string;
  detail: string;
  href: string;
  complete: boolean;
}

interface DivisionCount {
  type: DivisionType;
  _count: { _all: number };
}

interface FinanceGroup {
  type: EntryType;
  _sum: { amount: Prisma.Decimal | null };
}

interface BriefingActor {
  userId: string;
  role: Role;
}

@Injectable()
export class CommandCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async getBriefing(user: AuthenticatedUser) {
    const [tenant, currentUser] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: {
          id: true,
          name: true,
          type: true,
          defaultMode: true,
        },
      }),
      this.prisma.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          isActive: true,
        },
        select: { role: true },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException('Organización no encontrada');
    }

    if (!currentUser) {
      throw new ForbiddenException(
        'El usuario autenticado ya no pertenece a la organización activa',
      );
    }

    this.assertLeaderAccess(currentUser.role, tenant.defaultMode);
    const now = new Date();
    const actor: BriefingActor = {
      userId: user.userId,
      role: currentUser.role,
    };

    const briefing =
      tenant.defaultMode === PoliticalOperationMode.CAMPAIGN
        ? await this.loadCampaignBriefing(user.tenantId, now, actor)
        : await this.loadPublicOfficeBriefing(user.tenantId, now, actor);

    const commonMetrics = await this.prisma.$transaction(async (tx) => {
      const [
        topLevelDivisions,
        overdueTasksCount,
        overdueCommitmentsCount,
        activeTeamCount,
        totalTeamCount,
        activeConsentNoticeCount,
        operationProfileCount,
        campaignSettingsCount,
        nonAdminTeamMemberCount,
      ] = await Promise.all([
        tx.politicalDivision.findMany({
          where: { tenantId: user.tenantId, parentId: null },
          select: {
            name: true,
            code: true,
            goal: true,
            _count: { select: { voters: true } },
          },
        }),
        tx.task.count({
          where: {
            tenantId: user.tenantId,
            status: { in: [...OPEN_TASK_STATUSES] },
            dueAt: { lt: now },
          },
        }),
        tx.commitment.count({
          where: {
            tenantId: user.tenantId,
            status: { in: [...OPEN_COMMITMENT_STATUSES] },
            targetDate: { lt: now },
          },
        }),
        tx.user.count({ where: { tenantId: user.tenantId, isActive: true } }),
        tx.user.count({ where: { tenantId: user.tenantId } }),
        tx.consentNotice.count({ where: { tenantId: user.tenantId, isActive: true } }),
        tx.operationProfile.count({ where: { tenantId: user.tenantId } }),
        tx.campaignSettings.count({ where: { tenantId: user.tenantId } }),
        tx.user.count({ where: { tenantId: user.tenantId, role: { not: Role.ADMIN } } }),
      ]);

      return {
        territorialCoverage: topLevelDivisions.map((div) => ({
          name: div.name,
          code: div.code,
          voterCount: div._count.voters,
          goal: div.goal,
          coveragePercent: div.goal ? (div._count.voters / div.goal) * 100 : null,
        })),
        overdueItemsCount: overdueTasksCount + overdueCommitmentsCount,
        teamActivationRate: totalTeamCount ? (activeTeamCount / totalTeamCount) * 100 : 0,
        complianceStatus: {
          hasActiveConsentNotice: activeConsentNoticeCount > 0,
          hasConfiguredOperationProfile: operationProfileCount > 0,
          hasConfiguredCampaignSettings: campaignSettingsCount > 0,
          hasNonAdminTeamMember: nonAdminTeamMemberCount > 0,
        },
      };
    });

    return {
      generatedAt: now.toISOString(),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        type: tenant.type,
        mode: tenant.defaultMode,
      },
      ...briefing,
      ...commonMetrics,
    };
  }

  private async loadCampaignBriefing(
    tenantId: string,
    now: Date,
    actor: BriefingActor,
  ) {
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(
      async (tx) => {
        const [
          activeTeam,
          pendingInvitations,
          divisionCounts,
          peopleTotal,
          peopleConsented,
          financeSettings,
          financeGroups,
          financePending,
          financeOverdue,
          witnessReports,
          syncedWitnessReports,
          openTasks,
          overdueTasks,
          upcomingEventsCount,
          upcomingEvents,
          priorityTasks,
          pendingCommunications,
        ] = await Promise.all([
          tx.user.count({ where: { tenantId, isActive: true } }),
          tx.teamInvitation.count({
            where: { tenantId, acceptedAt: null, expiresAt: { gt: now } },
          }),
          tx.politicalDivision.groupBy({
            by: ['type'],
            where: { tenantId },
            _count: { _all: true },
          }),
          tx.voter.count({ where: { tenantId } }),
          tx.voter.count({
            where: {
              tenantId,
              consentAccepted: true,
              consentRecords: {
                some: {
                  tenantId,
                  mode: PoliticalOperationMode.CAMPAIGN,
                  purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
                  status: ConsentStatus.GRANTED,
                  revokedAt: null,
                  grantedAt: { lte: now },
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
              },
            },
          }),
          tx.campaignSettings.findUnique({
            where: { tenantId },
            select: { id: true },
          }),
          tx.financialEntry.groupBy({
            by: ['type'],
            where: { tenantId, status: { not: FinanceStatus.REJECTED } },
            _sum: { amount: true },
          }),
          tx.financialEntry.count({
            where: { tenantId, status: FinanceStatus.PENDING },
          }),
          tx.financialEntry.count({
            where: {
              tenantId,
              status: FinanceStatus.PENDING,
              date: { lt: oneWeekAgo },
            },
          }),
          tx.witnessReport.count({
            where: { tenantId, status: WitnessReportStatus.ACCEPTED },
          }),
          tx.witnessReport.count({
            where: {
              tenantId,
              status: WitnessReportStatus.ACCEPTED,
              isSynced: true,
            },
          }),
          tx.task.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              status: { in: [...OPEN_TASK_STATUSES] },
            },
          }),
          tx.task.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              status: { in: [...OPEN_TASK_STATUSES] },
              dueAt: { lt: now },
            },
          }),
          tx.campaignEvent.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              status: CampaignEventStatus.SCHEDULED,
              startsAt: { gte: now },
            },
          }),
          tx.campaignEvent.findMany({
            where: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              status: CampaignEventStatus.SCHEDULED,
              startsAt: { gte: now, lte: inTwoWeeks },
            },
            select: {
              id: true,
              name: true,
              startsAt: true,
              endsAt: true,
              status: true,
            },
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            take: 4,
          }),
          tx.task.findMany({
            where: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              status: { in: [...OPEN_TASK_STATUSES] },
              priority: { in: [WorkPriority.URGENT, WorkPriority.HIGH] },
            },
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              dueAt: true,
            },
            orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
            take: 4,
          }),
          tx.communicationApproval.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              status: CommunicationApprovalStatus.PENDING,
            },
          }),
        ]);

        const territory = this.toTerritoryMetrics(divisionCounts);
        const finance = this.toFinanceMetrics(
          financeGroups,
          financePending,
          financeOverdue,
        );
        const consentCoverage = peopleTotal
          ? Math.round((peopleConsented / peopleTotal) * 100)
          : 0;
        const activationSteps: ActivationStep[] = [
          {
            code: 'TERRITORY_BASE',
            title: 'Cargar la base territorial',
            detail: 'Sincroniza departamentos y municipios desde DANE.',
            href: '/dashboard/territory',
            complete: territory.municipalities > 0,
          },
          {
            code: 'TEAM_READY',
            title: 'Asignar el equipo inicial',
            detail: 'Activa por lo menos a dos responsables con roles claros.',
            href: '/dashboard/team',
            complete: activeTeam >= 2,
          },
          {
            code: 'FIRST_CONSENTED_RELATIONSHIP',
            title: 'Crear el primer vínculo autorizado',
            detail: 'Registra una persona con consentimiento verificable.',
            href: '/dashboard/votantes',
            complete: peopleConsented > 0,
          },
          {
            code: 'FINANCE_LIMITS',
            title: 'Configurar topes financieros',
            detail: 'Define los límites antes de registrar movimientos.',
            href: '/dashboard/finance',
            complete: Boolean(financeSettings),
          },
          {
            code: 'FIRST_SCHEDULED_EVENT',
            title: 'Programar la primera acción',
            detail: 'Convierte la estrategia en una actividad con fecha.',
            href: '/dashboard/events',
            complete: upcomingEventsCount > 0,
          },
        ].filter(
          (step) => actor.role === Role.ADMIN || step.code !== 'TEAM_READY',
        );

        const alerts = this.buildCampaignAlerts({
          peopleTotal,
          consentCoverage,
          financeOverdue,
          overdueTasks,
          pollingPlaces: territory.pollingPlaces,
          pendingCommunications,
        });

        return {
          activation: this.toActivation(activationSteps),
          metrics: {
            people: {
              total: peopleTotal,
              consented: peopleConsented,
              consentCoverage,
            },
            team: { active: activeTeam, pendingInvitations },
            territory,
            tasks: { open: openTasks, overdue: overdueTasks },
            events: { upcoming: upcomingEventsCount },
            finance,
            electionDay: {
              reports: witnessReports,
              syncedReports: syncedWitnessReports,
            },
            communications: { pendingApproval: pendingCommunications },
          },
          alerts,
          agenda: { upcomingEvents, priorityTasks },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async loadPublicOfficeBriefing(
    tenantId: string,
    now: Date,
    actor: BriefingActor,
  ) {
    const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const isCaseWorker = actor.role === Role.CASE_WORKER;
    const assignedCaseScope: Prisma.IssueCaseWhereInput = {
      tenantId,
      mode: PoliticalOperationMode.PUBLIC_OFFICE,
      assigneeId: actor.userId,
    };
    const caseScope: Prisma.IssueCaseWhereInput = isCaseWorker
      ? assignedCaseScope
      : {};
    const commitmentScope: Prisma.CommitmentWhereInput = isCaseWorker
      ? {
          OR: [
            { issueCase: { is: assignedCaseScope } },
            { issueCaseId: null, ownerId: actor.userId },
          ],
        }
      : {};
    const taskScope: Prisma.TaskWhereInput = isCaseWorker
      ? {
          AND: [
            {
              OR: [{ assigneeId: actor.userId }, { createdById: actor.userId }],
            },
            {
              OR: [
                { issueCaseId: null },
                { issueCase: { is: assignedCaseScope } },
              ],
            },
            {
              OR: [
                { commitmentId: null },
                { commitment: { is: commitmentScope } },
              ],
            },
          ],
        }
      : {};
    const eventScope: Prisma.CampaignEventWhereInput = isCaseWorker
      ? { responsibleId: actor.userId }
      : {};
    const communicationScope: Prisma.CommunicationApprovalWhereInput =
      isCaseWorker ? { requestedById: actor.userId } : {};

    return this.prisma.$transaction(
      async (tx) => {
        const [
          activeTeam,
          pendingInvitations,
          openCases,
          overdueCases,
          urgentCases,
          openTasks,
          overdueTasks,
          openCommitments,
          atRiskCommitments,
          overdueCommitments,
          publicCommitments,
          upcomingEventsCount,
          upcomingEvents,
          priorityTasks,
          pendingCommunications,
        ] = await Promise.all([
          tx.user.count({ where: { tenantId, isActive: true } }),
          tx.teamInvitation.count({
            where: { tenantId, acceptedAt: null, expiresAt: { gt: now } },
          }),
          tx.issueCase.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: { in: [...OPEN_CASE_STATUSES] },
              ...caseScope,
            },
          }),
          tx.issueCase.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: { in: [...OPEN_CASE_STATUSES] },
              dueAt: { lt: now },
              ...caseScope,
            },
          }),
          tx.issueCase.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: { in: [...OPEN_CASE_STATUSES] },
              priority: WorkPriority.URGENT,
              ...caseScope,
            },
          }),
          tx.task.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: { in: [...OPEN_TASK_STATUSES] },
              ...taskScope,
            },
          }),
          tx.task.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: { in: [...OPEN_TASK_STATUSES] },
              dueAt: { lt: now },
              ...taskScope,
            },
          }),
          tx.commitment.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: { in: [...OPEN_COMMITMENT_STATUSES] },
              ...commitmentScope,
            },
          }),
          tx.commitment.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: CommitmentStatus.AT_RISK,
              ...commitmentScope,
            },
          }),
          tx.commitment.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: { in: [...OPEN_COMMITMENT_STATUSES] },
              targetDate: { lt: now },
              ...commitmentScope,
            },
          }),
          tx.commitment.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              isPublic: true,
              ...commitmentScope,
            },
          }),
          tx.campaignEvent.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: CampaignEventStatus.SCHEDULED,
              startsAt: { gte: now },
              ...eventScope,
            },
          }),
          tx.campaignEvent.findMany({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: CampaignEventStatus.SCHEDULED,
              startsAt: { gte: now, lte: inTwoWeeks },
              ...eventScope,
            },
            select: {
              id: true,
              name: true,
              startsAt: true,
              endsAt: true,
              status: true,
            },
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            take: 4,
          }),
          tx.task.findMany({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: { in: [...OPEN_TASK_STATUSES] },
              priority: { in: [WorkPriority.URGENT, WorkPriority.HIGH] },
              ...taskScope,
            },
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              dueAt: true,
            },
            orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
            take: 4,
          }),
          tx.communicationApproval.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.PUBLIC_OFFICE,
              status: CommunicationApprovalStatus.PENDING,
              ...communicationScope,
            },
          }),
        ]);

        const activationSteps: ActivationStep[] = [
          {
            code: 'TEAM_READY',
            title: 'Asignar el equipo de atención',
            detail: 'Activa por lo menos a dos responsables con roles claros.',
            href: '/dashboard/team',
            complete: activeTeam >= 2,
          },
          {
            code: 'FIRST_CASE',
            title: 'Abrir el primer caso trazable',
            detail: 'Centraliza una solicitud ciudadana con responsable y SLA.',
            href: '/dashboard/cases',
            complete: openCases > 0,
          },
          {
            code: 'FIRST_PUBLIC_COMMITMENT',
            title: 'Publicar el primer compromiso',
            detail: 'Define responsable, fecha y avance verificable.',
            href: '/dashboard/tasks',
            complete: publicCommitments > 0,
          },
          {
            code: 'FIRST_SCHEDULED_EVENT',
            title: 'Programar la primera actividad pública',
            detail: 'Conecta la agenda con la ejecución del equipo.',
            href: '/dashboard/events',
            complete: upcomingEventsCount > 0,
          },
        ].filter(
          (step) => actor.role === Role.ADMIN || step.code !== 'TEAM_READY',
        );
        const alerts = this.buildPublicOfficeAlerts({
          overdueCases,
          urgentCases,
          overdueTasks,
          atRiskCommitments,
          overdueCommitments,
          pendingCommunications,
        });

        return {
          activation: this.toActivation(activationSteps),
          metrics: {
            team: { active: activeTeam, pendingInvitations },
            cases: {
              open: openCases,
              overdue: overdueCases,
              urgent: urgentCases,
            },
            tasks: { open: openTasks, overdue: overdueTasks },
            commitments: {
              open: openCommitments,
              atRisk: atRiskCommitments,
              overdue: overdueCommitments,
              public: publicCommitments,
            },
            events: { upcoming: upcomingEventsCount },
            communications: { pendingApproval: pendingCommunications },
          },
          alerts,
          agenda: { upcomingEvents, priorityTasks },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private assertLeaderAccess(
    role: string | undefined,
    mode: PoliticalOperationMode,
  ): void {
    const allowedRoles =
      mode === PoliticalOperationMode.CAMPAIGN
        ? CAMPAIGN_LEADERS
        : PUBLIC_OFFICE_LEADERS;

    if (!allowedRoles.includes(role as Role)) {
      throw new ForbiddenException(
        'Tu rol no puede consultar el briefing ejecutivo del modo activo',
      );
    }
  }

  private toActivation(steps: ActivationStep[]) {
    const completedSteps = steps.filter((step) => step.complete).length;
    return {
      ready: completedSteps === steps.length,
      completedSteps,
      totalSteps: steps.length,
      steps,
    };
  }

  private toTerritoryMetrics(groups: DivisionCount[]) {
    const count = (type: DivisionType) =>
      groups.find((group) => group.type === type)?._count._all ?? 0;

    return {
      departments: count(DivisionType.DEPARTAMENTO),
      municipalities: count(DivisionType.MUNICIPIO),
      zones: count(DivisionType.ZONA),
      pollingPlaces: count(DivisionType.PUESTO),
    };
  }

  private toFinanceMetrics(
    groups: FinanceGroup[],
    pending: number,
    overdue: number,
  ) {
    const income =
      groups.find((group) => group.type === EntryType.INCOME)?._sum.amount ??
      new Prisma.Decimal(0);
    const expenses =
      groups.find((group) => group.type === EntryType.EXPENSE)?._sum.amount ??
      new Prisma.Decimal(0);

    return {
      income: income.toFixed(2),
      expenses: expenses.toFixed(2),
      balance: income.minus(expenses).toFixed(2),
      pending,
      overdue,
    };
  }

  private buildCampaignAlerts(input: {
    peopleTotal: number;
    consentCoverage: number;
    financeOverdue: number;
    overdueTasks: number;
    pollingPlaces: number;
    pendingCommunications: number;
  }): BriefingAlert[] {
    const alerts: BriefingAlert[] = [];

    if (input.financeOverdue > 0) {
      alerts.push({
        code: 'FINANCE_REVIEW_OVERDUE',
        severity: 'critical',
        title: 'Cierre financiero pendiente',
        detail: `${input.financeOverdue} movimientos llevan más de siete días sin revisión.`,
        href: '/dashboard/finance',
        count: input.financeOverdue,
      });
    }
    if (input.peopleTotal > 0 && input.consentCoverage < 100) {
      alerts.push({
        code: 'CONSENT_COVERAGE_INCOMPLETE',
        severity: 'critical',
        title: 'Consentimientos incompletos',
        detail: `La cobertura verificable es ${input.consentCoverage}%; esos registros no deben usarse para comunicaciones.`,
        href: '/dashboard/votantes',
      });
    }
    if (input.overdueTasks > 0) {
      alerts.push({
        code: 'TASKS_OVERDUE',
        severity: 'critical',
        title: 'Ejecución vencida',
        detail: `${input.overdueTasks} tareas abiertas ya superaron su fecha objetivo.`,
        href: '/dashboard/tasks',
        count: input.overdueTasks,
      });
    }
    if (input.pollingPlaces === 0) {
      alerts.push({
        code: 'NO_POLLING_PLACES',
        severity: 'attention',
        title: 'Día D todavía sin puestos',
        detail:
          'La base territorial aún no tiene puestos de votación para asignar cobertura.',
        href: '/dashboard/territory',
      });
    }
    if (input.peopleTotal === 0) {
      alerts.push({
        code: 'NO_CONSENTED_RELATIONSHIPS',
        severity: 'attention',
        title: 'Relacionamiento por activar',
        detail:
          'Registra la primera persona únicamente después de obtener autorización explícita.',
        href: '/dashboard/votantes',
      });
    }
    if (input.pendingCommunications > 0) {
      alerts.push({
        code: 'COMMUNICATIONS_PENDING_REVIEW',
        severity: 'attention',
        title: 'Mensajes esperando segundo control',
        detail: `${input.pendingCommunications} solicitudes requieren una decisión independiente.`,
        href: '/dashboard/communications',
        count: input.pendingCommunications,
      });
    }

    return this.withHealthyFallback(alerts);
  }

  private buildPublicOfficeAlerts(input: {
    overdueCases: number;
    urgentCases: number;
    overdueTasks: number;
    atRiskCommitments: number;
    overdueCommitments: number;
    pendingCommunications: number;
  }): BriefingAlert[] {
    const alerts: BriefingAlert[] = [];

    if (input.overdueCases > 0 || input.urgentCases > 0) {
      alerts.push({
        code: 'CASES_REQUIRE_DECISION',
        severity: 'critical',
        title: 'Casos ciudadanos requieren decisión',
        detail: `${input.urgentCases} urgentes y ${input.overdueCases} vencidos necesitan responsable.`,
        href: '/dashboard/cases',
        count: input.overdueCases + input.urgentCases,
      });
    }
    if (input.overdueTasks > 0) {
      alerts.push({
        code: 'TASKS_OVERDUE',
        severity: 'critical',
        title: 'Ejecución vencida',
        detail: `${input.overdueTasks} tareas abiertas ya superaron su fecha objetivo.`,
        href: '/dashboard/tasks',
        count: input.overdueTasks,
      });
    }
    if (input.atRiskCommitments > 0 || input.overdueCommitments > 0) {
      alerts.push({
        code: 'COMMITMENTS_AT_RISK',
        severity: 'attention',
        title: 'Compromisos en riesgo',
        detail: `${input.atRiskCommitments} en riesgo y ${input.overdueCommitments} vencidos requieren evidencia o ajuste.`,
        href: '/dashboard/tasks',
        count: input.atRiskCommitments + input.overdueCommitments,
      });
    }
    if (input.pendingCommunications > 0) {
      alerts.push({
        code: 'COMMUNICATIONS_PENDING_REVIEW',
        severity: 'attention',
        title: 'Comunicaciones esperando control',
        detail: `${input.pendingCommunications} solicitudes requieren una decisión independiente.`,
        href: '/dashboard/communications',
        count: input.pendingCommunications,
      });
    }

    return this.withHealthyFallback(alerts);
  }

  private withHealthyFallback(alerts: BriefingAlert[]): BriefingAlert[] {
    if (alerts.length > 0) return alerts;

    return [
      {
        code: 'NO_CRITICAL_ALERTS',
        severity: 'ok',
        title: 'Sin alertas en los controles medidos',
        detail:
          'No hay vencimientos ni decisiones pendientes entre los indicadores incluidos en este corte.',
        href: '/dashboard/tasks',
      },
    ];
  }
}
