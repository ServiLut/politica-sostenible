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
  PqrsdDeadlineCalculationStatus,
  PqrsdDossierStatus,
  PqrsdRiskLevel,
  Prisma,
  Role,
  TaskStatus,
  TenantType,
  WorkPriority,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  resolveTerritorialAccess,
  type TerritorialAccess,
} from '../common/utils/territorial-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { PQRSD_READ_ROLES } from '../pqrsd/pqrsd-access.constants';
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
const OPEN_PQRSD_STATUSES = [
  PqrsdDossierStatus.RECEIVED,
  PqrsdDossierStatus.CLASSIFICATION_PENDING,
  PqrsdDossierStatus.CLASSIFIED,
  PqrsdDossierStatus.ASSIGNED,
  PqrsdDossierStatus.IN_PROGRESS,
  PqrsdDossierStatus.TRANSFER_PENDING,
  PqrsdDossierStatus.WAITING_ON_PETITIONER,
  PqrsdDossierStatus.EXTENSION_PROPOSED,
  PqrsdDossierStatus.DRAFT_RESPONSE,
  PqrsdDossierStatus.RETURNED_FOR_CHANGES,
  PqrsdDossierStatus.REVIEWED,
  PqrsdDossierStatus.AUTHORIZED,
  PqrsdDossierStatus.DELIVERY_PENDING,
  PqrsdDossierStatus.DELIVERED,
  PqrsdDossierStatus.REOPENED,
] as const;

const MODE_ROLES: Readonly<Record<PoliticalOperationMode, readonly Role[]>> = {
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

const TASK_MANAGEMENT_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMMUNICATIONS_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.ZONE_COORDINATOR,
];

const COMMITMENT_MANAGEMENT_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
];

const CASE_MANAGEMENT_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
];

const PQRSD_MANAGEMENT_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
  Role.COMPLIANCE_OFFICER,
];

const COMMUNICATION_DECISION_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMMUNICATIONS_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.COMPLIANCE_OFFICER,
];

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
  | 'PQRSD'
  | 'COMMUNICATION_APPROVAL';

interface InboxResponsible {
  id: string;
  name: string;
  role: Role;
}

interface InboxCommitmentRecord {
  id: string;
  reference: string;
  title: string;
  status: CommitmentStatus;
  targetDate: Date | null;
  createdAt: Date;
  owner: InboxResponsible | null;
}

interface InboxIssueCaseRecord {
  id: string;
  reference: string;
  title: string;
  status: IssueCaseStatus;
  priority: WorkPriority;
  dueAt: Date | null;
  createdAt: Date;
  assignee: InboxResponsible | null;
}

interface InboxApprovalRecord {
  id: string;
  title: string;
  status: CommunicationApprovalStatus;
  scheduledAt: Date | null;
  createdAt: Date;
  requestedBy: InboxResponsible;
}

interface InboxPqrsdRecord {
  id: string;
  reference: string;
  subject: string;
  status: PqrsdDossierStatus;
  riskLevel: PqrsdRiskLevel;
  createdAt: Date;
  currentPrimaryAssignee: (InboxResponsible & { isActive: boolean }) | null;
  currentBackupAssignee: (InboxResponsible & { isActive: boolean }) | null;
  deadlines: Array<{
    calculationStatus: PqrsdDeadlineCalculationStatus;
    dueAt: Date | null;
  }>;
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
  pqrsd: Prisma.PqrsdDossierWhereInput | null;
}

@Injectable()
export class OperationalInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListOperationalInboxQueryDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, defaultMode: true, type: true },
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
    const scopes = this.buildScopes(
      user,
      tenant.defaultMode,
      tenant.type,
      access,
    );

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
        const pqrsdWhere: Prisma.PqrsdDossierWhereInput | null = scopes.pqrsd
          ? {
              tenantId: user.tenantId,
              status: { in: [...OPEN_PQRSD_STATUSES] },
              AND: [scopes.pqrsd],
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
          pqrsdDossiers,
          pqrsdTotal,
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
            : Promise.resolve<InboxCommitmentRecord[]>([]),
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
            : Promise.resolve<InboxIssueCaseRecord[]>([]),
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
            : Promise.resolve<InboxApprovalRecord[]>([]),
          approvalWhere
            ? tx.communicationApproval.count({ where: approvalWhere })
            : Promise.resolve(0),
          pqrsdWhere
            ? tx.pqrsdDossier.findMany({
                where: pqrsdWhere,
                select: {
                  id: true,
                  reference: true,
                  subject: true,
                  status: true,
                  riskLevel: true,
                  createdAt: true,
                  currentPrimaryAssignee: {
                    select: {
                      id: true,
                      name: true,
                      role: true,
                      isActive: true,
                    },
                  },
                  currentBackupAssignee: {
                    select: {
                      id: true,
                      name: true,
                      role: true,
                      isActive: true,
                    },
                  },
                  deadlines: {
                    orderBy: { versionNumber: 'desc' },
                    take: 1,
                    select: {
                      calculationStatus: true,
                      dueAt: true,
                    },
                  },
                },
                orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
                take: limit,
              })
            : Promise.resolve<InboxPqrsdRecord[]>([]),
          pqrsdWhere
            ? tx.pqrsdDossier.count({ where: pqrsdWhere })
            : Promise.resolve(0),
        ]);

        const items: OperationalInboxItem[] = [
          ...tasks.map((task) => this.toTaskItem(task, access.role, now)),
          ...commitments.map((commitment) =>
            this.toCommitmentItem(commitment, access.role, now),
          ),
          ...issueCases.map((issueCase) =>
            this.toIssueCaseItem(
              issueCase,
              tenant.defaultMode,
              access.role,
              now,
            ),
          ),
          ...approvals.map((approval) =>
            this.toApprovalItem(approval, access.role, now),
          ),
          ...pqrsdDossiers.map((dossier) =>
            this.toPqrsdItem(dossier, access.role, now),
          ),
        ];

        return {
          items: items
            .sort((left, right) => this.compareItems(left, right))
            .slice(0, limit),
          totals: {
            tasks: taskTotal,
            commitments: commitmentTotal,
            cases:
              tenant.defaultMode === PoliticalOperationMode.PUBLIC_OFFICE
                ? issueCaseTotal
                : 0,
            incidents:
              tenant.defaultMode === PoliticalOperationMode.CAMPAIGN
                ? issueCaseTotal
                : 0,
            approvals: approvalTotal,
            pqrsd: pqrsdTotal,
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
          (item) => item.kind !== 'COMMUNICATION_APPROVAL' && !item.responsible,
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
    tenantType: TenantType,
    access: TerritorialAccess,
  ): InboxScopes {
    const pqrsd =
      tenantType === TenantType.PUBLIC_OFFICE &&
      PQRSD_READ_ROLES.includes(access.role)
        ? {}
        : null;
    if (GLOBAL_OPERATION_ROLES[mode].includes(access.role)) {
      return {
        task: {},
        commitment: {},
        issueCase: {},
        approval: {},
        pqrsd,
      };
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
        // Coordinación territorial no está autorizada por CasesController.
        // El scope de caso sólo acota tareas/compromisos relacionados; no debe
        // convertirse en una lectura directa de incidentes inaccesibles.
        issueCase: null,
        approval: null,
        pqrsd,
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
              OR: [{ assigneeId: user.userId }, { createdById: user.userId }],
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
        pqrsd,
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
        pqrsd,
      };
    }

    if (access.role === Role.COMMUNICATIONS_MANAGER) {
      return {
        task: ownTaskScope,
        commitment: null,
        issueCase: null,
        approval: {},
        pqrsd,
      };
    }

    // Cumplimiento y auditoría pueden leer los casos, compromisos y
    // aprobaciones; la API de tareas sólo les permite ver las asignadas.
    return {
      task: ownTaskScope,
      commitment: {},
      issueCase: {},
      approval: {},
      pqrsd,
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
    role: Role,
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
      cta: {
        label: TASK_MANAGEMENT_ROLES.includes(role)
          ? 'Gestionar tarea'
          : 'Revisar tarea',
        href: this.deepLink('/dashboard/tasks', task.id, 'tasks'),
      },
      createdAt: task.createdAt.toISOString(),
    };
  }

  private toCommitmentItem(
    commitment: InboxCommitmentRecord,
    role: Role,
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
      cta: {
        label: COMMITMENT_MANAGEMENT_ROLES.includes(role)
          ? 'Gestionar compromiso'
          : 'Revisar compromiso',
        href: this.deepLink('/dashboard/tasks', commitment.id, 'commitments'),
      },
      createdAt: commitment.createdAt.toISOString(),
    };
  }

  private toIssueCaseItem(
    issueCase: InboxIssueCaseRecord,
    mode: PoliticalOperationMode,
    role: Role,
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
        label: CASE_MANAGEMENT_ROLES.includes(role)
          ? isIncident
            ? 'Gestionar incidente'
            : 'Gestionar caso'
          : isIncident
            ? 'Revisar incidente'
            : 'Revisar caso',
        href: this.deepLink(
          isIncident ? '/dashboard/incidents' : '/dashboard/cases',
          issueCase.id,
          'detail',
        ),
      },
      createdAt: issueCase.createdAt.toISOString(),
    };
  }

  private toApprovalItem(
    approval: InboxApprovalRecord,
    role: Role,
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
      priority: approval.scheduledAt ? WorkPriority.HIGH : WorkPriority.MEDIUM,
      responsible: null,
      dueAt: approval.scheduledAt?.toISOString() ?? null,
      overdue: this.isOverdue(approval.scheduledAt, now),
      blocked: true,
      blockReason: `Espera revisión independiente; solicitada por ${approval.requestedBy.name}`,
      cta: {
        label: COMMUNICATION_DECISION_ROLES.includes(role)
          ? 'Revisar y decidir'
          : 'Revisar solicitud',
        href: this.deepLink('/dashboard/communications', approval.id, 'review'),
      },
      createdAt: approval.createdAt.toISOString(),
    };
  }

  private toPqrsdItem(
    dossier: InboxPqrsdRecord,
    role: Role,
    now: Date,
  ): OperationalInboxItem {
    const latestDeadline = dossier.deadlines[0];
    const deadlineResolved =
      latestDeadline?.calculationStatus ===
        PqrsdDeadlineCalculationStatus.CALCULATED ||
      latestDeadline?.calculationStatus ===
        PqrsdDeadlineCalculationStatus.MANUAL_REVIEWED;
    const dueAt = deadlineResolved ? (latestDeadline?.dueAt ?? null) : null;
    const overdue = this.isOverdue(dueAt, now);
    const responsible = dossier.currentPrimaryAssignee?.isActive
      ? dossier.currentPrimaryAssignee
      : dossier.currentBackupAssignee?.isActive
        ? dossier.currentBackupAssignee
        : null;
    const primaryUnavailable = !dossier.currentPrimaryAssignee?.isActive;
    const backupUnavailable = !dossier.currentBackupAssignee?.isActive;
    const blockReason = this.joinReasons([
      !deadlineResolved
        ? 'Plazo ausente o pendiente de cálculo aprobado'
        : null,
      primaryUnavailable
        ? responsible
          ? 'Responsable principal no disponible; expediente en suplencia'
          : 'Sin responsable principal activo'
        : null,
      backupUnavailable ? 'Sin suplente activo' : null,
      this.pqrsdWorkflowBlockReason(dossier.status),
    ]);

    return {
      id: `PQRSD:${dossier.id}`,
      entityId: dossier.id,
      kind: 'PQRSD',
      kindLabel: 'PQRSD formal',
      reference: dossier.reference,
      title: dossier.subject,
      status: dossier.status,
      statusLabel: this.pqrsdStatusLabel(dossier.status),
      priority: this.pqrsdPriority(dossier.riskLevel, dueAt, now),
      responsible: responsible
        ? {
            id: responsible.id,
            name: responsible.name,
            role: responsible.role,
          }
        : null,
      dueAt: dueAt?.toISOString() ?? null,
      overdue,
      blocked: blockReason !== null,
      blockReason,
      cta: {
        label: PQRSD_MANAGEMENT_ROLES.includes(role)
          ? 'Gestionar expediente'
          : 'Revisar expediente',
        href: this.deepLink('/dashboard/pqrsd', dossier.id, 'detail'),
      },
      createdAt: dossier.createdAt.toISOString(),
    };
  }

  private deepLink(path: string, entityId: string, view: string): string {
    return `${path}?view=${encodeURIComponent(view)}&entityId=${encodeURIComponent(entityId)}`;
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

    const leftDue = left.dueAt
      ? Date.parse(left.dueAt)
      : Number.MAX_SAFE_INTEGER;
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

  private pqrsdPriority(
    riskLevel: PqrsdRiskLevel,
    dueAt: Date | null,
    now: Date,
  ): WorkPriority {
    if (
      riskLevel === PqrsdRiskLevel.HIGH ||
      (dueAt !== null && dueAt.getTime() < now.getTime())
    ) {
      return WorkPriority.URGENT;
    }
    if (
      dueAt !== null &&
      dueAt.getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1_000
    ) {
      return WorkPriority.HIGH;
    }
    return WorkPriority.MEDIUM;
  }

  private pqrsdWorkflowBlockReason(status: PqrsdDossierStatus): string | null {
    return {
      [PqrsdDossierStatus.RECEIVED]: 'Pendiente de clasificación formal',
      [PqrsdDossierStatus.CLASSIFICATION_PENDING]:
        'Clasificación pendiente de revisión',
      [PqrsdDossierStatus.CLASSIFIED]: null,
      [PqrsdDossierStatus.ASSIGNED]: null,
      [PqrsdDossierStatus.IN_PROGRESS]: null,
      [PqrsdDossierStatus.TRANSFER_PENDING]: 'Traslado pendiente de constancia',
      [PqrsdDossierStatus.WAITING_ON_PETITIONER]:
        'Esperando información de la persona peticionaria',
      [PqrsdDossierStatus.EXTENSION_PROPOSED]: 'Prórroga pendiente de decisión',
      [PqrsdDossierStatus.DRAFT_RESPONSE]: null,
      [PqrsdDossierStatus.RETURNED_FOR_CHANGES]:
        'Respuesta devuelta para correcciones',
      [PqrsdDossierStatus.REVIEWED]: null,
      [PqrsdDossierStatus.AUTHORIZED]:
        'Respuesta autorizada pendiente de entrega',
      [PqrsdDossierStatus.DELIVERY_PENDING]: 'Entrega pendiente de constancia',
      [PqrsdDossierStatus.DELIVERED]: null,
      [PqrsdDossierStatus.CLOSED]: null,
      [PqrsdDossierStatus.REOPENED]: 'Expediente reabierto',
      [PqrsdDossierStatus.CANCELLED]: null,
    }[status];
  }

  private joinReasons(reasons: Array<string | null>): string | null {
    const present = reasons.filter((reason): reason is string =>
      Boolean(reason),
    );
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

  private pqrsdStatusLabel(status: PqrsdDossierStatus): string {
    return {
      [PqrsdDossierStatus.RECEIVED]: 'Recibido',
      [PqrsdDossierStatus.CLASSIFICATION_PENDING]: 'Clasificación pendiente',
      [PqrsdDossierStatus.CLASSIFIED]: 'Clasificado',
      [PqrsdDossierStatus.ASSIGNED]: 'Asignado',
      [PqrsdDossierStatus.IN_PROGRESS]: 'En gestión',
      [PqrsdDossierStatus.TRANSFER_PENDING]: 'Traslado pendiente',
      [PqrsdDossierStatus.WAITING_ON_PETITIONER]:
        'Espera a la persona peticionaria',
      [PqrsdDossierStatus.EXTENSION_PROPOSED]: 'Prórroga propuesta',
      [PqrsdDossierStatus.DRAFT_RESPONSE]: 'Respuesta en borrador',
      [PqrsdDossierStatus.RETURNED_FOR_CHANGES]: 'Devuelto para correcciones',
      [PqrsdDossierStatus.REVIEWED]: 'Respuesta revisada',
      [PqrsdDossierStatus.AUTHORIZED]: 'Respuesta autorizada',
      [PqrsdDossierStatus.DELIVERY_PENDING]: 'Entrega pendiente',
      [PqrsdDossierStatus.DELIVERED]: 'Entregado',
      [PqrsdDossierStatus.CLOSED]: 'Cerrado',
      [PqrsdDossierStatus.REOPENED]: 'Reabierto',
      [PqrsdDossierStatus.CANCELLED]: 'Cancelado',
    }[status];
  }
}
