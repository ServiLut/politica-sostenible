import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  CommunicationApprovalStatus,
  ConsentPurpose,
  EntryType,
  FinanceStatus,
  IssueCaseStatus,
  OperationClosureType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  StoredObjectStatus,
  TaskStatus,
  TransitionHandoverPackageKind,
  TransitionHandoverReportStatus,
  WitnessCaptureContext,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import {
  FINANCE_CLOSEOUT_READINESS_BLOCKER,
  getFinanceCloseoutReadiness,
  type FinanceCloseoutReadiness,
} from '../finance/finance-closeout-readiness';
import { PrismaService } from '../prisma/prisma.service';
import { lockOperationLifecycleSnapshot } from '../common/utils/operation-lifecycle-fence.util';

const HANDOVER_ROLES = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

const OPEN_CASE_STATUSES = [
  IssueCaseStatus.OPEN,
  IssueCaseStatus.TRIAGED,
  IssueCaseStatus.IN_PROGRESS,
  IssueCaseStatus.WAITING_ON_CITIZEN,
  IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY,
] as const;

const OPEN_TASK_STATUSES = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
] as const;

type ActionSeverity = 'BLOCK' | 'WARN';

export interface HandoverAction {
  readonly code: string;
  readonly severity: ActionSeverity;
  readonly label: string;
  readonly detail: string;
  readonly href: string;
}

export interface TransitionHandoverReportPayload {
  readonly reportId: string;
  readonly packageKind: TransitionHandoverPackageKind;
  readonly generatedAt: string;
  readonly status: TransitionHandoverReportStatus;
  readonly organization: {
    readonly name: string;
    readonly type: string;
  };
  readonly election: {
    readonly name: string | null;
    readonly type: string;
    readonly date: string;
    readonly circumscriptionType: string;
    readonly circumscriptionName: string;
  };
  readonly lifecycle: {
    readonly stage: PoliticalOperationStage;
    readonly retentionPeriodDays: number;
    readonly closureType: OperationClosureType | null;
    readonly terminatedAt: string | null;
    readonly terminationCause: string | null;
    readonly complianceCertified: false;
    readonly authorityFilingCertified: false;
  };
  readonly termination: {
    readonly requestId: string | null;
    readonly status: string | null;
    readonly effectiveAt: string | null;
    readonly reviewedAt: string | null;
    readonly reviewer: {
      readonly id: string;
      readonly name: string;
      readonly role: Role;
    } | null;
  } | null;
  readonly finance: {
    readonly entries: number;
    readonly pendingReview: number;
    readonly approvedNotReported: number;
    readonly reported: number;
    readonly income: number;
    readonly expenses: number;
    readonly balance: number;
    readonly reportScope: string | null;
    readonly reportDeadline: string | null;
    readonly officialLimitsReference: string | null;
    readonly cuentasClarasCodeConfigured: boolean;
    readonly closeoutReady: boolean;
    readonly closeoutBlockerCodes: string[];
  };
  readonly operation: {
    readonly openTasks: number;
    readonly openCases: number;
    readonly pendingCommunications: number;
    readonly e14PendingReview: number;
    readonly e14Rejected: number;
  };
  readonly evidence: {
    readonly confirmedNotAssociated: number;
    readonly expiredAuthorizations: number;
  };
  readonly governance: {
    readonly activePrivacyNotices: number;
    readonly activeTeamByRole: ReadonlyArray<{
      readonly role: Role;
      readonly count: number;
    }>;
  };
  readonly actions: HandoverAction[];
  readonly transitionPolicy: {
    readonly automaticTransferAllowed: false;
    readonly campaignDataReusedAutomatically: false;
    readonly requiredDestinationType: 'PUBLIC_OFFICE';
    readonly explanation: string;
  };
  readonly disclaimer: string;
  readonly integrity: {
    readonly algorithm: 'SHA-256';
    readonly scope: 'REPORT_BODY_WITHOUT_INTEGRITY';
    readonly sha256: string;
  };
}

interface CountGroup<T extends string> {
  readonly status: T;
  readonly _count: { readonly _all: number };
}

interface StoredHandoverReport {
  readonly id: string;
  readonly generatedAt: Date;
  readonly status: TransitionHandoverReportStatus;
  readonly packageKind: TransitionHandoverPackageKind;
  readonly payload: Prisma.JsonValue;
  readonly sha256: string;
}

function canonicalJson(
  value: unknown,
  ancestors = new WeakSet<object>(),
): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('El expediente contiene un numero no finito');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError('El expediente contiene una referencia circular');
    }
    ancestors.add(value);
    const result = `[${value
      .map((item) => canonicalJson(item, ancestors))
      .join(',')}]`;
    ancestors.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (ancestors.has(value)) {
      throw new TypeError('El expediente contiene una referencia circular');
    }
    ancestors.add(value);
    const record = value as Record<string, unknown>;
    const result = `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`,
      )
      .join(',')}}`;
    ancestors.delete(value);
    return result;
  }
  throw new TypeError('El expediente contiene un valor no serializable');
}

export function computeTransitionHandoverSha256(value: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}

@Injectable()
export class TransitionHandoverService {
  constructor(private readonly prisma: PrismaService) {}

  async generateHandoverReport(
    user: AuthenticatedUser,
  ): Promise<TransitionHandoverReportPayload> {
    return this.prisma.$transaction(
      async (transaction) => {
        await lockOperationLifecycleSnapshot(transaction, user.tenantId);
        const [tenant, actor, profile, settings] = await Promise.all([
          transaction.tenant.findUnique({
            where: { id: user.tenantId },
            select: {
              ...CAMPAIGN_TENANT_SELECT,
              name: true,
            },
          }),
          transaction.user.findFirst({
            where: {
              id: user.userId,
              tenantId: user.tenantId,
              isActive: true,
              role: { in: [...HANDOVER_ROLES] },
            },
            select: { id: true, role: true },
          }),
          transaction.operationProfile.findUnique({
            where: { tenantId: user.tenantId },
            select: {
              id: true,
              stage: true,
              electionType: true,
              electionDate: true,
              circumscriptionType: true,
              circumscriptionName: true,
              retentionPeriodDays: true,
              closureType: true,
              terminatedAt: true,
              terminationCause: true,
              terminationRequest: {
                select: {
                  id: true,
                  status: true,
                  effectiveAt: true,
                  reviewedAt: true,
                  reviewedBy: {
                    select: { id: true, name: true, role: true },
                  },
                },
              },
            },
          }),
          transaction.campaignSettings.findUnique({
            where: { tenantId: user.tenantId },
            select: {
              electionName: true,
              reportDeadline: true,
              reportScope: true,
              officialLimitsReference: true,
              cuentasClarasCode: true,
            },
          }),
        ]);

        if (!tenant) {
          throw new NotFoundException('Organizacion no encontrada');
        }
        assertCampaignTenant(tenant);
        if (!actor) {
          throw new ForbiddenException(
            'La cuenta vigente no puede generar el expediente poselectoral',
          );
        }
        if (!profile) {
          throw new ConflictException(
            'Configura el perfil de operacion antes de generar el expediente poselectoral',
          );
        }
        if (
          profile.stage !== PoliticalOperationStage.POST_ELECTION &&
          profile.stage !== PoliticalOperationStage.CLOSED
        ) {
          throw new ConflictException(
            'El expediente de cierre solo esta disponible en la etapa poselectoral o cerrada',
          );
        }
        const generatedAt = new Date();

        const [
          financeCloseoutReadiness,
          financeGroups,
          taskGroups,
          caseGroups,
          communicationGroups,
          witnessGroups,
          storageGroups,
          teamGroups,
          activePrivacyNotices,
        ] = await Promise.all([
          getFinanceCloseoutReadiness(
            transaction,
            user.tenantId,
            profile.id,
            generatedAt,
          ),
          transaction.financialEntry.groupBy({
            by: ['type', 'status'],
            where: { tenantId: user.tenantId },
            _sum: { amount: true },
            _count: { _all: true },
          }),
          transaction.task.groupBy({
            by: ['status'],
            where: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
            },
            _count: { _all: true },
          }),
          transaction.issueCase.groupBy({
            by: ['status'],
            where: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
            },
            _count: { _all: true },
          }),
          transaction.communicationApproval.groupBy({
            by: ['status'],
            where: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
            },
            _count: { _all: true },
          }),
          transaction.witnessReport.groupBy({
            by: ['status'],
            where: {
              tenantId: user.tenantId,
              captureContext: WitnessCaptureContext.REAL,
            },
            _count: { _all: true },
          }),
          transaction.storedObject.groupBy({
            by: ['status'],
            where: { tenantId: user.tenantId },
            _count: { _all: true },
          }),
          transaction.user.groupBy({
            by: ['role'],
            where: { tenantId: user.tenantId, isActive: true },
            _count: { _all: true },
          }),
          transaction.consentNotice.count({
            where: {
              tenantId: user.tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
              isActive: true,
              retiredAt: null,
            },
          }),
        ]);

        const pendingFinance = this.countStatuses(financeGroups, [
          FinanceStatus.PENDING,
        ]);
        const approvedNotReported = this.countStatuses(financeGroups, [
          FinanceStatus.APPROVED,
        ]);
        const reportedFinance = this.countStatuses(financeGroups, [
          FinanceStatus.REPORTED_CNE,
        ]);
        const openTasks = this.countStatuses(taskGroups, [
          ...OPEN_TASK_STATUSES,
        ]);
        const openCases = this.countStatuses(caseGroups, [
          ...OPEN_CASE_STATUSES,
        ]);
        const pendingCommunications = this.countStatuses(communicationGroups, [
          CommunicationApprovalStatus.PENDING,
          CommunicationApprovalStatus.SCHEDULED,
        ]);
        const pendingE14 = this.countStatuses(witnessGroups, [
          WitnessReportStatus.PENDING,
        ]);
        const rejectedE14 = this.countStatuses(witnessGroups, [
          WitnessReportStatus.REJECTED,
        ]);
        const unconsumedEvidence = this.countStatuses(storageGroups, [
          StoredObjectStatus.CONFIRMED,
        ]);
        const expiredEvidence = this.countStatuses(storageGroups, [
          StoredObjectStatus.EXPIRED,
        ]);

        const income = this.sumFinance(financeGroups, EntryType.INCOME);
        const expenses = this.sumFinance(financeGroups, EntryType.EXPENSE);
        const exceptionalClosure =
          profile.closureType === OperationClosureType.CLOSED_EXCEPTIONAL;
        const actions = this.buildActions({
          financeCloseoutReadiness,
          openTasks,
          openCases,
          pendingCommunications,
          pendingE14,
          rejectedE14,
          unconsumedEvidence,
          expiredEvidence,
          activePrivacyNotices,
        });
        if (exceptionalClosure) {
          actions.unshift({
            code: 'EXCEPTIONAL_TERMINATION_SURVIVING_DUTIES',
            severity: 'WARN',
            label: 'Mantener obligaciones despues de la terminacion',
            detail:
              'La causal excepcional detuvo la operacion, pero no acredita cumplimiento, radicacion ni extincion de deberes financieros, documentales o de proteccion de datos.',
            href: '/dashboard/operation-profile',
          });
        }
        const blockingActions = actions.filter(
          (action) => action.severity === 'BLOCK',
        ).length;
        const status: TransitionHandoverReportStatus =
          blockingActions > 0
            ? TransitionHandoverReportStatus.BLOCKED
            : actions.length > 0
              ? TransitionHandoverReportStatus.ATTENTION
              : TransitionHandoverReportStatus.READY;
        const reportId = randomUUID();
        const packageKind: TransitionHandoverPackageKind = exceptionalClosure
          ? TransitionHandoverPackageKind.EXCEPTIONAL_TERMINATION_DUTIES_DOSSIER
          : TransitionHandoverPackageKind.INTERNAL_CAMPAIGN_CLOSEOUT_DRAFT;
        const reportBody = {
          reportId,
          packageKind,
          generatedAt: generatedAt.toISOString(),
          status,
          organization: {
            name: tenant.name,
            type: tenant.type,
          },
          election: {
            name: settings?.electionName ?? null,
            type: profile.electionType,
            date: profile.electionDate.toISOString(),
            circumscriptionType: profile.circumscriptionType,
            circumscriptionName: profile.circumscriptionName,
          },
          lifecycle: {
            stage: profile.stage,
            retentionPeriodDays: profile.retentionPeriodDays,
            closureType: profile.closureType,
            terminatedAt: profile.terminatedAt?.toISOString() ?? null,
            terminationCause: profile.terminationCause,
            complianceCertified: false as const,
            authorityFilingCertified: false as const,
          },
          termination: exceptionalClosure
            ? {
                requestId: profile.terminationRequest?.id ?? null,
                status: profile.terminationRequest?.status ?? null,
                effectiveAt:
                  profile.terminationRequest?.effectiveAt.toISOString() ?? null,
                reviewedAt:
                  profile.terminationRequest?.reviewedAt?.toISOString() ?? null,
                reviewer: profile.terminationRequest?.reviewedBy ?? null,
              }
            : null,
          finance: {
            entries: this.countAll(financeGroups),
            pendingReview: pendingFinance,
            approvedNotReported,
            reported: reportedFinance,
            income,
            expenses,
            balance: income - expenses,
            reportScope: settings?.reportScope ?? null,
            reportDeadline: settings?.reportDeadline?.toISOString() ?? null,
            officialLimitsReference: settings?.officialLimitsReference ?? null,
            cuentasClarasCodeConfigured: Boolean(
              settings?.cuentasClarasCode?.trim(),
            ),
            closeoutReady: financeCloseoutReadiness.readyForCloseout,
            closeoutBlockerCodes: financeCloseoutReadiness.blockers.map(
              ({ code }) => code,
            ),
          },
          operation: {
            openTasks,
            openCases,
            pendingCommunications,
            e14PendingReview: pendingE14,
            e14Rejected: rejectedE14,
          },
          evidence: {
            confirmedNotAssociated: unconsumedEvidence,
            expiredAuthorizations: expiredEvidence,
          },
          governance: {
            activePrivacyNotices,
            activeTeamByRole: [...teamGroups]
              .sort((left, right) => left.role.localeCompare(right.role))
              .map((group) => ({
                role: group.role,
                count: group._count._all,
              })),
          },
          actions,
          transitionPolicy: {
            automaticTransferAllowed: false as const,
            campaignDataReusedAutomatically: false as const,
            requiredDestinationType: 'PUBLIC_OFFICE' as const,
            explanation:
              'Una eventual gestion publica exige una organizacion separada, finalidad y aviso propios, y una revision documentada antes de transferir cualquier registro autorizado.',
          },
          disclaimer: exceptionalClosure
            ? 'Este expediente documenta obligaciones que sobreviven a una terminacion excepcional. No acredita radicacion, escrutinio oficial, cumplimiento contable, entrega ante autoridad ni extincion de deberes.'
            : 'Este expediente es un borrador interno de cierre ordinario. No acredita radicacion, escrutinio oficial, cumplimiento contable ni entrega ante una autoridad.',
        };
        const sha256 = computeTransitionHandoverSha256(reportBody);
        const reportPayload: TransitionHandoverReportPayload = {
          ...reportBody,
          integrity: {
            algorithm: 'SHA-256' as const,
            scope: 'REPORT_BODY_WITHOUT_INTEGRITY' as const,
            sha256,
          },
        };

        const storedReport = await transaction.transitionHandoverReport.create({
          data: {
            id: reportId,
            tenantId: user.tenantId,
            operationProfileId: profile.id,
            generatedById: actor.id,
            generatedAt,
            status,
            packageKind,
            payload: reportPayload as unknown as Prisma.InputJsonValue,
            sha256,
            createdAt: generatedAt,
          },
          select: {
            id: true,
            generatedAt: true,
            status: true,
            packageKind: true,
            payload: true,
            sha256: true,
          },
        });

        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: actor.id,
            action: 'POST_ELECTION_HANDOVER_REPORT_GENERATED',
            resourceType: 'TransitionHandoverReport',
            resourceId: reportId,
            metadata: {
              sha256,
              status,
              operationProfileId: profile.id,
              actionCount: actions.length,
              blockingActionCount: blockingActions,
            },
          },
        });

        return this.assertStoredReport(storedReport);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async listHandoverReports(
    user: AuthenticatedUser,
    page: number,
    limit: number,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.assertReader(transaction, user);
        const where = { tenantId: user.tenantId };
        const [items, total] = await Promise.all([
          transaction.transitionHandoverReport.findMany({
            where,
            orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * limit,
            take: limit,
            select: {
              id: true,
              operationProfileId: true,
              generatedAt: true,
              status: true,
              packageKind: true,
              sha256: true,
              generatedBy: {
                select: { id: true, name: true, role: true },
              },
            },
          }),
          transaction.transitionHandoverReport.count({ where }),
        ]);
        return {
          items: items.map(({ id, generatedAt, ...item }) => ({
            reportId: id,
            generatedAt: generatedAt.toISOString(),
            ...item,
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async getHandoverReport(
    user: AuthenticatedUser,
    reportId: string,
  ): Promise<TransitionHandoverReportPayload> {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.assertReader(transaction, user);
        const report = await transaction.transitionHandoverReport.findFirst({
          where: { id: reportId, tenantId: user.tenantId },
          select: {
            id: true,
            generatedAt: true,
            status: true,
            packageKind: true,
            payload: true,
            sha256: true,
          },
        });
        if (!report) {
          throw new NotFoundException('Expediente de empalme no encontrado');
        }
        return this.assertStoredReport(report);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async assertReader(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
  ): Promise<void> {
    const [tenant, actor] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      transaction.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          isActive: true,
          role: { in: [...HANDOVER_ROLES] },
        },
        select: { id: true },
      }),
    ]);
    if (!tenant) throw new NotFoundException('Organizacion no encontrada');
    assertCampaignTenant(tenant);
    if (!actor) {
      throw new ForbiddenException(
        'La cuenta vigente no puede consultar expedientes poselectorales',
      );
    }
  }

  private assertStoredReport(
    report: StoredHandoverReport,
  ): TransitionHandoverReportPayload {
    if (
      !report.payload ||
      Array.isArray(report.payload) ||
      typeof report.payload !== 'object'
    ) {
      throw new InternalServerErrorException(
        'El expediente conservado no supera la verificacion interna',
      );
    }
    const payload = report.payload as Record<string, unknown>;
    const integrity = payload.integrity;
    if (
      !integrity ||
      Array.isArray(integrity) ||
      typeof integrity !== 'object'
    ) {
      throw new InternalServerErrorException(
        'El expediente conservado no supera la verificacion interna',
      );
    }
    const body = { ...payload };
    delete body.integrity;
    const integrityRecord = integrity as Record<string, unknown>;
    const valid =
      payload.reportId === report.id &&
      payload.generatedAt === report.generatedAt.toISOString() &&
      payload.status === report.status &&
      payload.packageKind === report.packageKind &&
      integrityRecord.algorithm === 'SHA-256' &&
      integrityRecord.scope === 'REPORT_BODY_WITHOUT_INTEGRITY' &&
      integrityRecord.sha256 === report.sha256 &&
      computeTransitionHandoverSha256(body) === report.sha256;
    if (!valid) {
      throw new InternalServerErrorException(
        'El expediente conservado no supera la verificacion interna',
      );
    }
    return payload as unknown as TransitionHandoverReportPayload;
  }

  private countStatuses<T extends string>(
    groups: ReadonlyArray<CountGroup<T>>,
    statuses: readonly T[],
  ): number {
    const accepted = new Set(statuses);
    return groups.reduce(
      (sum, group) =>
        sum + (accepted.has(group.status) ? group._count._all : 0),
      0,
    );
  }

  private countAll(
    groups: ReadonlyArray<{ readonly _count: { readonly _all: number } }>,
  ): number {
    return groups.reduce((sum, group) => sum + group._count._all, 0);
  }

  private sumFinance(
    groups: ReadonlyArray<{
      readonly type: EntryType;
      readonly _sum: { readonly amount: Prisma.Decimal | null };
    }>,
    type: EntryType,
  ): number {
    return groups.reduce(
      (sum, group) =>
        group.type === type ? sum + Number(group._sum.amount ?? 0) : sum,
      0,
    );
  }

  private buildActions(input: {
    readonly financeCloseoutReadiness: FinanceCloseoutReadiness;
    readonly openTasks: number;
    readonly openCases: number;
    readonly pendingCommunications: number;
    readonly pendingE14: number;
    readonly rejectedE14: number;
    readonly unconsumedEvidence: number;
    readonly expiredEvidence: number;
    readonly activePrivacyNotices: number;
  }): HandoverAction[] {
    const actions: HandoverAction[] = [];
    if (!input.financeCloseoutReadiness.readyForCloseout) {
      const blockerCodes = input.financeCloseoutReadiness.blockers.map(
        ({ code }) => code,
      );
      actions.push({
        code: 'FINANCE_NOT_CLOSED',
        severity: 'BLOCK',
        label: 'Completar el expediente financiero poselectoral',
        detail: `El expediente financiero no esta listo: ${blockerCodes.join(', ')}.`,
        href: '/dashboard/finance',
      });
    }
    if (
      input.financeCloseoutReadiness.blockers.some(
        ({ code }) =>
          code ===
          FINANCE_CLOSEOUT_READINESS_BLOCKER.POST_ELECTION_REPORT_OVERDUE,
      )
    ) {
      actions.push({
        code: 'FINANCE_DEADLINE_EXPIRED',
        severity: 'BLOCK',
        label: 'Escalar vencimiento financiero',
        detail:
          'La fecha de reporte configurada ya paso y el expediente financiero aun no acredita cierre verificable.',
        href: '/dashboard/finance',
      });
    }
    if (input.pendingE14 > 0) {
      actions.push({
        code: 'E14_PENDING_REVIEW',
        severity: 'BLOCK',
        label: 'Resolver actas E-14 pendientes',
        detail: `${input.pendingE14} reportes siguen pendientes de revision humana.`,
        href: '/dashboard/war-room',
      });
    }
    if (input.rejectedE14 > 0) {
      actions.push({
        code: 'E14_REJECTED_EVIDENCE',
        severity: 'WARN',
        label: 'Documentar actas rechazadas',
        detail: `${input.rejectedE14} reportes rechazados requieren justificacion y ruta de conservacion.`,
        href: '/dashboard/war-room',
      });
    }
    if (input.openCases > 0) {
      actions.push({
        code: 'OPEN_CAMPAIGN_CASES',
        severity: 'WARN',
        label: 'Cerrar o transferir incidentes de campana',
        detail: `${input.openCases} casos continuan abiertos. No deben desaparecer al cerrar la operacion.`,
        href: '/dashboard/incidents',
      });
    }
    if (input.openTasks > 0) {
      actions.push({
        code: 'OPEN_CAMPAIGN_TASKS',
        severity: 'WARN',
        label: 'Resolver tareas pendientes',
        detail: `${input.openTasks} tareas permanecen abiertas o bloqueadas.`,
        href: '/dashboard/tasks',
      });
    }
    if (input.pendingCommunications > 0) {
      actions.push({
        code: 'PENDING_COMMUNICATIONS',
        severity: 'WARN',
        label: 'Cancelar o finalizar comunicaciones pendientes',
        detail: `${input.pendingCommunications} comunicaciones siguen pendientes o programadas.`,
        href: '/dashboard/communications',
      });
    }
    if (input.unconsumedEvidence > 0 || input.expiredEvidence > 0) {
      actions.push({
        code: 'UNRESOLVED_STORAGE_EVIDENCE',
        severity: 'WARN',
        label: 'Depurar evidencia sin asociar',
        detail: `${input.unconsumedEvidence} archivos confirmados no estan asociados y ${input.expiredEvidence} autorizaciones expiraron.`,
        href: '/dashboard/audit',
      });
    }
    if (input.activePrivacyNotices === 0) {
      actions.push({
        code: 'NO_ACTIVE_PRIVACY_NOTICE',
        severity: 'BLOCK',
        label: 'Mantener un canal de derechos del titular',
        detail:
          'No hay un aviso de privacidad activo para atender acceso, correccion, revocacion o supresion durante la retencion.',
        href: '/dashboard/settings',
      });
    }
    return actions;
  }
}
