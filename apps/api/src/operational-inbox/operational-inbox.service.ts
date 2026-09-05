import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommitmentStatus,
  CommunicationApprovalStatus,
  IssueCaseStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
  TaskStatus,
  WorkPriority,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  resolveTerritorialAccess,
  type TerritorialAccess,
} from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { ListOperationalInboxQueryDto } from './dto/list-operational-inbox-query.dto';

const OPEN_TASK_STATUSES = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
] as const;
const OPEN_COMMITMENT_STATUSES = [
  CommitmentStatus.PROPOSED,
  CommitmentStatus.PLANNED,
  CommitmentStatus.IN_PROGRESS,
  CommitmentStatus.AT_RISK,
] as const;
const OPEN_CASE_STATUSES = [
  IssueCaseStatus.OPEN,
  IssueCaseStatus.TRIAGED,
  IssueCaseStatus.IN_PROGRESS,
  IssueCaseStatus.WAITING_ON_CITIZEN,
  IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY,
] as const;

const MODE_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.COMMUNICATIONS_MANAGER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
    Role.COMMUNICATIONS_MANAGER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  ],
};

const GLOBAL_OPERATION_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [Role.ADMIN, Role.CAMPAIGN_MANAGER],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
  ],
};

const PRIORITY_SCORE: Readonly<Record<WorkPriority, number>> = {
  [WorkPriority.LOW]: 1,
  [WorkPriority.MEDIUM]: 2,
  [WorkPriority.HIGH]: 3,
  [WorkPriority.URGENT]: 4,
};

type InboxItemKind =
  | 'TASK'
  | 'COMMITMENT'
  | 'CASE'
  | 'INCIDENT'
  | 'COMMUNICATION_APPROVAL';

interface InboxResponsible {
  id: string;
  name: string;
  role: Role;
}

export interface OperationalInboxItem {
  id: string;
  entityId: string;
  kind: InboxItemKind;
  kindLabel: string;
  reference: string | null;
  title: string;
  status: string;
  statusLabel: string;
  priority: WorkPriority;
  responsible: InboxResponsible | null;
  dueAt: string | null;
  overdue: boolean;
  blocked: boolean;
  blockReason: string | null;
  cta: { label: string; href: string };
  createdAt: string;
}

interface InboxScopes {
  task: Prisma.TaskWhereInput;
  commitment: Prisma.CommitmentWhereInput | null;
  issueCase: Prisma.IssueCaseWhereInput | null;
  approval: Prisma.CommunicationApprovalWhereInput | null;
}

@Injectable()
export class OperationalInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    user: AuthenticatedUser,
    query: ListOperationalInboxQueryDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, defaultMode: true },
    });
    if (!tenant) {
      throw new NotFoundException('Organización no encontrada');
    }

    const access = await resolveTerritorialAccess({
      client: this.prisma,
      tenantId: user.tenantId,
      userId: user.userId,
      allowedRoles: MODE_ROLES[tenant.defaultMode],
      territoriallyScopedRoles: [Role.ZONE_COORDINATOR],
    });
    this.assertRoleForMode(access.role, tenant.defaultMode);

    const now = new Date();
    const limit = query.limit ?? 60;
    const base = { tenantId: user.tenantId, mode: tenant.defaultMode };
    const scopes = this.buildScopes(user, tenant.defaultMode, access);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const taskWhere: Prisma.TaskWhereInput = {
          ...base,
          status: { in: [...OPEN_TASK_STATUSES] },
          AND: [scopes.task],
        };
        const commitmentWhere: Prisma.CommitmentWhereInput | null =
          scopes.commitment
            ? {
                ...base,
                status: { in: [...OPEN_COMMITMENT_STATUSES] },
                AND: [scopes.commitment],
              }
            : null;
        const issueCaseWhere: Prisma.IssueCaseWhereInput | null =
          scopes.issueCase
            ? {
                ...base,
                status: { in: [...OPEN_CASE_STATUSES] },
                AND: [scopes.issueCase],
              }
            : null;
        const approvalWhere: Prisma.CommunicationApprovalWhereInput | null =
          scopes.approval
            ? {
                ...base,
                status: CommunicationApprovalStatus.PENDING,
                AND: [scopes.approval],
              }
            : null;

        const [
          tasks,
          taskTotal,
          commitments,
          commitmentTotal,
          issueCases,
          issueCaseTotal,
          approvals,
          approvalTotal,
        ] = await Promise.all([
          tx.task.findMany({
            where: taskWhere,
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              dueAt: true,
              createdAt: true,
              assignee: { select: { id: true, name: true, role: true } },
              issueCase: { select: { reference: true } },
              commitment: { select: { reference: true } },
            },
            orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            take: limit,
          }),
          tx.task.count({ where: taskWhere }),
          commitmentWhere
            ? tx.commitment.findMany({
                where: commitmentWhere,
                select: {
                  id: true,
                  reference: true,
                  title: true,
                  status: true,
                  targetDate: true,
                  createdAt: true,
                  owner: { select: { id: true, name: true, role: true } },
                },
                orderBy: [
                  { targetDate: 'asc' },
                  { createdAt: 'asc' },
                  { id: 'asc' },
                ],
                take: limit,
              })
            : Promise.resolve([]),
          commitmentWhere
            ? tx.commitment.count({ where: commitmentWhere })
            : Promise.resolve(0),
          issueCaseWhere
            ? tx.issueCase.findMany({
                where: issueCaseWhere,
                select: {
                  id: true,
                  reference: true,
                  title: true,
                  status: true,
                  priority: true,
                  dueAt: true,
                  createdAt: true,
                  assignee: { select: { id: true, name: true, role: true } },
                },
                orderBy: [
                  { dueAt: 'asc' },
                  { createdAt: 'asc' },
                  { id: 'asc' },
                ],
                take: limit,
              })
            : Promise.resolve([]),
          issueCaseWhere
            ? tx.issueCase.count({ where: issueCaseWhere })
            : Promise.resolve(0),
          approvalWhere
            ? tx.communicationApproval.findMany({
                where: approvalWhere,
                select: {
                  id: true,
                  title: true,
                  status: true,
                  scheduledAt: true,
                  createdAt: true,
                  requestedBy: {
                    select: { id: true, name: true, role: true },
                  },
                },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                take: limit,
              })
            : Promise.resolve([]),
          approvalWhere
            ? tx.communicationApproval.count({ where: approvalWhere })
            : Promise.resolve(0),
        ]);

        const items: OperationalInboxItem[] = [
          ...tasks.map((task) => this.toTaskItem(task, now)),
          ...commitments.map((commitment) =>
            this.toCommitmentItem(commitment, now),
          ),
          ...issueCases.map((issueCase) =>
            this.toIssueCaseItem(issueCase, tenant.defaultMode, now),
          ),
          ...approvals.map((approval) => this.toApprovalItem(approval, now)),
        ];

        return {
          items: items.sort(this.compareItems).slice(0, limit),
          totals: {
            tasks: taskTotal,
            commitments: commitmentTotal,
            cases: tenant.defaultMode === PoliticalOperationMode.PUBLIC_OFFICE
              ? issueCaseTotal
              : 0,
            incidents: tenant.defaultMode === PoliticalOperationMode.CAMPAIGN
              ? issueCaseTotal
              : 0,
            approvals: approvalTotal,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const total = Object.values(result.totals).reduce(
      (sum, count) => sum + count,
      0,
    );
    return {
      generatedAt: now.toISOString(),
      mode: tenant.defaultMode,
      summary: {
        total,
        visible: result.items.length,
        overdue: result.items.filter((item) => item.overdue).length,
        blocked: result.items.filter((item) => item.blocked).length,
        unassigned: result.items.filter(
          (item) =>
            item.kind !== 'COMMUNICATION_APPROVAL' && !item.responsible,
        ).length,
        pendingApprovals: result.totals.approvals,
        truncated: total > result.items.length,
        byKind: result.totals,
      },
      items: result.items,
    };
  }

  private buildScopes(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: TerritorialAccess,
  ): InboxScopes {
    if (GLOBAL_OPERATION_ROLES[mode].includes(access.role)) {
      return { task: {}, commitment: {}, issueCase: {}, approval: {} };
    }

    if (access.role === Role.ZONE_COORDINATOR) {
      const divisionIds = access.divisionIds ?? [];
      const caseScope: Prisma.IssueCaseWhereInput = {
        divisionId: { in: divisionIds },
      };
      const commitmentScope: Prisma.CommitmentWhereInput = {
        isPublic: true,
        OR: [
          { ownerId: user.userId },
          {
            owner: {
              is: {
                tenantId: user.tenantId,
                divisionId: { in: divisionIds },
              },
            },
          },
          { issueCase: { is: caseScope } },
        ],
      };
      return {
        task: {
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
            { issueCase: { is: caseScope } },
            { commitment: { is: commitmentScope } },
          ],
        },
        commitment: commitmentScope,
        issueCase: caseScope,
        approval: null,
      };
    }

    if (access.role === Role.CASE_WORKER) {
      const caseScope: Prisma.IssueCaseWhereInput = {
        assigneeId: user.userId,
      };
      const commitmentScope: Prisma.CommitmentWhereInput = {
        OR: [
          { issueCase: { is: caseScope } },
          { issueCaseId: null, ownerId: user.userId },
        ],
      };
      return {
        task: {
          AND: [
            {
              OR: [
                { assigneeId: user.userId },
                { createdById: user.userId },
              ],
            },
            {
              OR: [{ issueCaseId: null }, { issueCase: { is: caseScope } }],
            },
            {
              OR: [
                { commitmentId: null },
                { commitment: { is: commitmentScope } },
              ],
            },
          ],
        },
        commitment: commitmentScope,
        issueCase: caseScope,
        approval: { requestedById: user.userId },
      };
    }

    const ownTaskScope: Prisma.TaskWhereInput = {
      assigneeId: user.userId,
    };
    if (
      access.role === Role.COMMUNICATIONS_MANAGER &&
      mode === PoliticalOperationMode.CAMPAIGN
    ) {
      return {
        task: {},
        commitment: null,
        issueCase: null,
        approval: {},
      };
    }

    if (access.role === Role.COMMUNICATIONS_MANAGER) {
      return {
        task: ownTaskScope,
        commitment: null,
        issueCase: null,
        approval: {},
      };
    }

    // Cumplimiento y auditoría pueden leer los casos, compromisos y
    // aprobaciones; la API de tareas sólo les permite ver las asignadas.
    return {
      task: ownTaskScope,
      commitment: {},
      issueCase: {},
      approval: {},
    };
  }

  private assertRoleForMode(role: Role, mode: PoliticalOperationMode): void {
    if (!MODE_ROLES[mode].includes(role)) {
      throw new ForbiddenException(
        'Tu rol no puede consultar la bandeja del modo operativo activo',
      );
    }
  }

  private toTaskItem(
    task: {
      id: string;
      title: string;
      status: TaskStatus;
      priority: WorkPriority;
      dueAt: Date | null;
      createdAt: Date;
      assignee: InboxResponsible | null;
      issueCase: { reference: string } | null;
      commitment: { reference: string } | null;
    },
    now: Date,
  ): OperationalInboxItem {
    const blockReason = this.joinReasons([
      task.status === TaskStatus.BLOCKED ? 'Marcada como bloqueada' : null,
      !task.assignee ? 'Sin responsable asignado' : null,
    ]);
    return {
      id: `TASK:${task.id}`,
      entityId: task.id,
      kind: 'TASK',
      kindLabel: 'Tarea',
      reference:
        task.issueCase?.reference ?? task.commitment?.reference ?? null,
      title: task.title,
      status: task.status,
      statusLabel: this.taskStatusLabel(task.status),
      priority: task.priority,
      responsible: task.assignee,
      dueAt: task.dueAt?.toISOString() ?? null,
      overdue: this.isOverdue(task.dueAt, now),
      blocked: blockReason !== null,
      blockReason,
      cta: { label: 'Abrir tarea', href: '/dashboard/tasks' },
      createdAt: task.createdAt.toISOString(),
    };
  }

  private toCommitmentItem(
    commitment: {
      id: string;
      reference: string;
      title: string;
      status: CommitmentStatus;
      targetDate: Date | null;
      createdAt: Date;
      owner: InboxResponsible | null;
    },
    now: Date,
  ): OperationalInboxItem {
    const blockReason = this.joinReasons([
      commitment.status === CommitmentStatus.AT_RISK
        ? 'El compromiso está marcado en riesgo'
        : null,
      !commitment.owner ? 'Sin responsable asignado' : null,
    ]);
    return {
      id: `COMMITMENT:${commitment.id}`,
      entityId: commitment.id,
      kind: 'COMMITMENT',
      kindLabel: 'Compromiso',
      reference: commitment.reference,
      title: commitment.title,
      status: commitment.status,
      statusLabel: this.commitmentStatusLabel(commitment.status),
      priority:
        commitment.status === CommitmentStatus.AT_RISK
          ? WorkPriority.HIGH
          : WorkPriority.MEDIUM,
      responsible: commitment.owner,
      dueAt: commitment.targetDate?.toISOString() ?? null,
      overdue: this.isOverdue(commitment.targetDate, now),
      blocked: blockReason !== null,
      blockReason,
      cta: { label: 'Revisar compromiso', href: '/dashboard/tasks' },
      createdAt: commitment.createdAt.toISOString(),
    };
  }

  private toIssueCaseItem(
    issueCase: {
      id: string;
      reference: string;
      title: string;
      status: IssueCaseStatus;
      priority: WorkPriority;
      dueAt: Date | null;
      createdAt: Date;
      assignee: InboxResponsible | null;
    },
    mode: PoliticalOperationMode,
    now: Date,
  ): OperationalInboxItem {
    const waitingReason =
      issueCase.status === IssueCaseStatus.WAITING_ON_CITIZEN
        ? 'Esperando respuesta de la persona solicitante'
        : issueCase.status === IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY
          ? 'Esperando respuesta de una entidad externa'
          : null;
    const blockReason = this.joinReasons([
      waitingReason,
      !issueCase.assignee ? 'Sin responsable asignado' : null,
    ]);
    const isIncident = mode === PoliticalOperationMode.CAMPAIGN;
    return {
      id: `${isIncident ? 'INCIDENT' : 'CASE'}:${issueCase.id}`,
      entityId: issueCase.id,
      kind: isIncident ? 'INCIDENT' : 'CASE',
      kindLabel: isIncident ? 'Incidente' : 'Caso',
      reference: issueCase.reference,
      title: issueCase.title,
      status: issueCase.status,
      statusLabel: this.caseStatusLabel(issueCase.status),
      priority: issueCase.priority,
      responsible: issueCase.assignee,
      dueAt: issueCase.dueAt?.toISOString() ?? null,
      overdue: this.isOverdue(issueCase.dueAt, now),
      blocked: blockReason !== null,
      blockReason,
      cta: {
        label: isIncident ? 'Gestionar incidente' : 'Gestionar caso',
        href: isIncident ? '/dashboard/incidents' : '/dashboard/cases',
      },
      createdAt: issueCase.createdAt.toISOString(),
    };
  }

  private toApprovalItem(
    approval: {
      id: string;
      title: string;
      status: CommunicationApprovalStatus;
      scheduledAt: Date | null;
      createdAt: Date;
      requestedBy: InboxResponsible;
    },
    now: Date,
  ): OperationalInboxItem {
    return {
      id: `COMMUNICATION_APPROVAL:${approval.id}`,
      entityId: approval.id,
      kind: 'COMMUNICATION_APPROVAL',
      kindLabel: 'Aprobación',
      reference: null,
      title: approval.title,
      status: approval.status,
      statusLabel: 'Pendiente de revisión',
      priority: approval.scheduledAt
        ? WorkPriority.HIGH
        : WorkPriority.MEDIUM,
      responsible: null,
      dueAt: approval.scheduledAt?.toISOString() ?? null,
      overdue: this.isOverdue(approval.scheduledAt, now),
      blocked: true,
      blockReason: `Espera revisión independiente; solicitada por ${approval.requestedBy.name}`,
      cta: {
        label: 'Tomar decisión',
        href: '/dashboard/communications',
      },
      createdAt: approval.createdAt.toISOString(),
    };
  }

  private compareItems(
    left: OperationalInboxItem,
    right: OperationalInboxItem,
  ): number {
    if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
    const priorityDifference =
      PRIORITY_SCORE[right.priority] - PRIORITY_SCORE[left.priority];
    if (priorityDifference !== 0) return priorityDifference;
    if (left.blocked !== right.blocked) return left.blocked ? -1 : 1;

    const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt
      ? Date.parse(right.dueAt)
      : Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;
    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }
    return left.id.localeCompare(right.id);
  }

  private isOverdue(value: Date | null, now: Date): boolean {
    return value !== null && value.getTime() < now.getTime();
  }

  private joinReasons(reasons: Array<string | null>): string | null {
    const present = reasons.filter((reason): reason is string => Boolean(reason));
    return present.length > 0 ? present.join(' · ') : null;
  }

  private taskStatusLabel(status: TaskStatus): string {
    return {
      [TaskStatus.TODO]: 'Por hacer',
      [TaskStatus.IN_PROGRESS]: 'En progreso',
      [TaskStatus.BLOCKED]: 'Bloqueada',
      [TaskStatus.DONE]: 'Terminada',
      [TaskStatus.CANCELLED]: 'Cancelada',
    }[status];
  }

  private commitmentStatusLabel(status: CommitmentStatus): string {
    return {
      [CommitmentStatus.PROPOSED]: 'Propuesto',
      [CommitmentStatus.PLANNED]: 'Planificado',
      [CommitmentStatus.IN_PROGRESS]: 'En progreso',
      [CommitmentStatus.AT_RISK]: 'En riesgo',
      [CommitmentStatus.FULFILLED]: 'Cumplido',
      [CommitmentStatus.NOT_FULFILLED]: 'No cumplido',
      [CommitmentStatus.CANCELLED]: 'Cancelado',
    }[status];
  }

  private caseStatusLabel(status: IssueCaseStatus): string {
    return {
      [IssueCaseStatus.OPEN]: 'Abierto',
      [IssueCaseStatus.TRIAGED]: 'Clasificado',
      [IssueCaseStatus.IN_PROGRESS]: 'En gestión',
      [IssueCaseStatus.WAITING_ON_CITIZEN]: 'Espera respuesta',
      [IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY]: 'Espera entidad',
      [IssueCaseStatus.RESOLVED]: 'Resuelto',
      [IssueCaseStatus.CLOSED]: 'Cerrado',
      [IssueCaseStatus.CANCELLED]: 'Cancelado',
    }[status];
  }
}
