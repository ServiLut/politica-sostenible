import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  CandidateListType,
  CommunicationApprovalStatus,
  ConsentPurpose,
  ElectoralCatalogStatus,
  ElectoralCatalogType,
  ElectoralCircumscriptionType,
  FinanceStatus,
  IssueCaseStatus,
  PoliticalOperationMode,
  PoliticalOperationStage,
  PoliticalOperationType,
  Prisma,
  Role,
  TaskStatus,
  WitnessAssignmentStatus,
  WitnessCaptureContext,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  getOperationProfileCoherenceError,
  UpsertOperationProfileDto,
} from './dto/upsert-operation-profile.dto';
import {
  buildOperationReadiness,
  countDivergentE14Tables,
  getElectionDayReadinessBlockers,
  getClosureReadinessBlockers,
  hasExactActiveElectoralProjection,
  OPERATION_PROFILE_READ_ROLES,
} from './operation-readiness';
import {
  FINANCE_COMPLIANCE_SELECT,
  getFinanceComplianceReadiness,
} from '../finance/finance-compliance';
import { getFinanceCloseoutReadiness } from '../finance/finance-closeout-readiness';
import {
  getAllowedNextOperationStages,
  getAllowedOperationStageTransitions,
  isValidOperationStageTransition,
  SAFE_INITIAL_OPERATION_STAGES,
} from './operation-profile-stage-transition';
import {
  electionOperatingWindowSha256,
  normalizeElectionOperatingWindow,
} from './election-operating-window';
import { OperationClosedForMutationException } from '../common/utils/operation-lifecycle-fence.util';
import { evaluateSignatureCollectionReadiness } from '../signature-collection/signature-collection.readiness';
import { toBogotaDateKey } from './election-operating-window';

const E14_FINGERPRINT_FIELDS = [
  'puestoId',
  'mesa',
  'candidateVotes',
  'blankVotes',
  'nullVotes',
  'unmarkedVotes',
  'totalTableVotes',
  'status',
] satisfies Prisma.WitnessReportScalarFieldEnum[];
const OPEN_CASE_STATUSES = [
  IssueCaseStatus.OPEN,
  IssueCaseStatus.TRIAGED,
  IssueCaseStatus.IN_PROGRESS,
  IssueCaseStatus.WAITING_ON_CITIZEN,
  IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY,
];
const OPEN_TASK_STATUSES = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
];

const DATA_RESPONSIBLE_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
];

const PROFILE_SELECT = {
  id: true,
  tenantId: true,
  operationType: true,
  stage: true,
  electionType: true,
  circumscriptionType: true,
  circumscriptionName: true,
  circumscriptionCode: true,
  listType: true,
  electionDate: true,
  votingStartDate: true,
  votingEndDate: true,
  votingWindowSourceUrl: true,
  votingWindowReference: true,
  closureType: true,
  terminatedAt: true,
  terminationCause: true,
  terminationRequestId: true,
  expectedTeamSize: true,
  candidateCount: true,
  dataControllerName: true,
  responsibleDataUserId: true,
  retentionPeriodDays: true,
  revocationProcedure: true,
  responsibleDataUser: {
    select: { id: true, name: true, role: true },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OperationProfileSelect;

const SETTINGS_SELECT = {
  maxTotalBudget: true,
  maxPublicityLimit: true,
} satisfies Prisma.CampaignSettingsSelect;

type SelectedProfile = Prisma.OperationProfileGetPayload<{
  select: typeof PROFILE_SELECT;
}>;

type SelectedSettings = Prisma.CampaignSettingsGetPayload<{
  select: typeof SETTINGS_SELECT;
}>;

const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

@Injectable()
export class OperationProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getReadiness(user: AuthenticatedUser, evaluatedAt = new Date()) {
    return this.prisma.$transaction(
      async (transaction) => {
        const tenantId = user.tenantId;
        const [tenant, actor] = await Promise.all([
          transaction.tenant.findUnique({
            where: { id: tenantId },
            select: CAMPAIGN_TENANT_SELECT,
          }),
          transaction.user.findFirst({
            where: {
              id: user.userId,
              tenantId,
              isActive: true,
              role: { in: [...OPERATION_PROFILE_READ_ROLES] },
            },
            select: { id: true, role: true },
          }),
        ]);
        assertCampaignTenant(tenant);
        if (!actor)
          throw new ForbiddenException(
            'El usuario no tiene acceso vigente al alistamiento',
          );
        const [
          profile,
          settings,
          activeConsentNoticeCount,
          activeNonAdminTeamCount,
          territory,
          reportStatuses,
          fingerprints,
          voterCount,
          caseStatuses,
          taskStatuses,
          overdueTaskCount,
          communicationStatuses,
          financeStatuses,
          lifecycle,
        ] = await Promise.all([
          transaction.operationProfile.findUnique({
            where: { tenantId },
            select: {
              id: true,
              stage: true,
              electionDate: true,
              votingStartDate: true,
              votingEndDate: true,
              votingWindowSourceUrl: true,
              votingWindowReference: true,
              closureType: true,
              terminatedAt: true,
              terminationCause: true,
            },
          }),
          transaction.campaignSettings.findUnique({
            where: { tenantId },
            select: FINANCE_COMPLIANCE_SELECT,
          }),
          transaction.consentNotice.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              purpose: ConsentPurpose.POLITICAL_COMMUNICATION,
              isActive: true,
            },
          }),
          transaction.user.count({
            where: { tenantId, isActive: true, role: { not: Role.ADMIN } },
          }),
          this.readTerritorialReadiness(transaction, tenantId),
          transaction.witnessReport.groupBy({
            by: ['status'],
            where: { tenantId, captureContext: WitnessCaptureContext.REAL },
            _count: { _all: true },
          }),
          transaction.witnessReport.groupBy({
            by: E14_FINGERPRINT_FIELDS,
            where: { tenantId, captureContext: WitnessCaptureContext.REAL },
          }),
          transaction.voter.count({ where: { tenantId } }),
          transaction.issueCase.groupBy({
            by: ['status'],
            where: { tenantId, mode: PoliticalOperationMode.CAMPAIGN },
            _count: { _all: true },
          }),
          transaction.task.groupBy({
            by: ['status'],
            where: { tenantId, mode: PoliticalOperationMode.CAMPAIGN },
            _count: { _all: true },
          }),
          transaction.task.count({
            where: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              status: { in: OPEN_TASK_STATUSES },
              dueAt: { lt: evaluatedAt },
            },
          }),
          transaction.communicationApproval.groupBy({
            by: ['status'],
            where: { tenantId, mode: PoliticalOperationMode.CAMPAIGN },
            _count: { _all: true },
          }),
          transaction.financialEntry.groupBy({
            by: ['status'],
            where: { tenantId },
            _count: { _all: true },
          }),
          transaction.auditEvent.groupBy({
            by: ['action'],
            where: {
              tenantId,
              action: {
                in: [
                  'OPERATION_PROFILE_CREATED',
                  'OPERATION_STAGE_ADOPTION_APPROVED',
                ],
              },
            },
            _count: { _all: true },
          }),
        ]);
        const count = (
          rows: Array<{ status: string; _count: { _all: number } }>,
          statuses: readonly string[],
        ) =>
          rows.reduce(
            (sum, row) =>
              sum + (statuses.includes(row.status) ? row._count._all : 0),
            0,
          );
        const financeCloseoutReadiness =
          profile &&
          [
            PoliticalOperationStage.POST_ELECTION,
            PoliticalOperationStage.CLOSED,
          ].includes(profile.stage as 'POST_ELECTION' | 'CLOSED')
            ? await getFinanceCloseoutReadiness(
                transaction,
                tenantId,
                profile.id,
                evaluatedAt,
              )
            : null;
        return buildOperationReadiness(
          {
            profile,
            activeConsentNoticeCount,
            financeCompliance: getFinanceComplianceReadiness(settings),
            financeReportDeadline: settings?.reportDeadline ?? null,
            activeNonAdminTeamCount,
            ...territory,
            e14PendingCount: count(reportStatuses, [
              WitnessReportStatus.PENDING,
            ]),
            e14RejectedCount: count(reportStatuses, [
              WitnessReportStatus.REJECTED,
            ]),
            e14DivergentTableCount: countDivergentE14Tables(fingerprints),
            openCaseCount: count(caseStatuses, OPEN_CASE_STATUSES),
            openTaskCount: count(taskStatuses, OPEN_TASK_STATUSES),
            overdueTaskCount,
            pendingCommunicationCount: count(communicationStatuses, [
              CommunicationApprovalStatus.PENDING,
            ]),
            pendingFinanceCount: count(financeStatuses, [
              FinanceStatus.PENDING,
            ]),
            unreportedFinanceCount: count(financeStatuses, [
              FinanceStatus.PENDING,
              FinanceStatus.APPROVED,
            ]),
            hasOperationalActivity:
              voterCount > 0 ||
              [
                ...reportStatuses,
                ...caseStatuses,
                ...taskStatuses,
                ...communicationStatuses,
                ...financeStatuses,
              ].some((row) => row._count._all > 0),
            lifecycleCreatedAuditCount:
              lifecycle.find(
                (row) => row.action === 'OPERATION_PROFILE_CREATED',
              )?._count._all ?? 0,
            lifecycleAdoptionAuditCount:
              lifecycle.find(
                (row) => row.action === 'OPERATION_STAGE_ADOPTION_APPROVED',
              )?._count._all ?? 0,
            financeCloseoutReadiness,
          },
          evaluatedAt,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async readTerritorialReadiness(
    transaction: Prisma.TransactionClient,
    tenantId: string,
  ) {
    const [divisions, witnessCoverageWindows, assignments, releases] =
      await Promise.all([
        transaction.politicalDivision.findMany({
          where: { tenantId, isActive: true },
          select: {
            id: true,
            code: true,
            name: true,
            parentId: true,
            type: true,
            expectedTables: true,
            sourceNamespace: true,
            sourceReleaseId: true,
          },
        }),
        transaction.witnessCoverageWindow.findMany({
          where: { tenantId, captureContext: WitnessCaptureContext.REAL },
          select: {
            id: true,
            puestoId: true,
            localDate: true,
            startsAt: true,
            endsAt: true,
            timeZone: true,
            utcOffsetMinutes: true,
          },
        }),
        transaction.witnessAssignment.findMany({
          where: {
            tenantId,
            captureContext: WitnessCaptureContext.REAL,
            status: WitnessAssignmentStatus.CONFIRMED,
          },
          select: {
            coverageWindowId: true,
            puestoId: true,
            tableStart: true,
            tableEnd: true,
            shiftStartsAt: true,
            shiftEndsAt: true,
            assignmentType: true,
            status: true,
            witness: { select: { role: true, isActive: true } },
          },
        }),
        transaction.electoralCatalogRelease.findMany({
          where: {
            tenantId,
            type: ElectoralCatalogType.ELECTORAL_RNEC,
            status: ElectoralCatalogStatus.ACTIVE,
          },
          select: { id: true },
        }),
      ]);
    return {
      divisions,
      witnessCoverageWindows,
      witnessAssignments: assignments.map(({ witness, ...assignment }) => ({
        ...assignment,
        witnessEligible: witness.isActive && witness.role === Role.WITNESS,
      })),
      activeElectoralCatalogReleaseIds: releases.map((release) => release.id),
    };
  }

  async getCurrent(user: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (transaction) => {
        const [tenant, profile, settings] = await Promise.all([
          transaction.tenant.findUnique({
            where: { id: user.tenantId },
            select: CAMPAIGN_TENANT_SELECT,
          }),
          transaction.operationProfile.findUnique({
            where: { tenantId: user.tenantId },
            select: PROFILE_SELECT,
          }),
          transaction.campaignSettings.findUnique({
            where: { tenantId: user.tenantId },
            select: SETTINGS_SELECT,
          }),
        ]);
        assertCampaignTenant(tenant);

        if (!profile) {
          return { configured: false, profile: null };
        }
        if (!settings) {
          throw new ConflictException(
            'La configuracion politica esta incompleta: falta el presupuesto de campana',
          );
        }

        return this.toContext(profile, settings);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }

  async upsert(user: AuthenticatedUser, dto: UpsertOperationProfileDto) {
    const coherenceError = getOperationProfileCoherenceError(dto);
    if (coherenceError) {
      throw new BadRequestException(coherenceError);
    }
    const window = normalizeElectionOperatingWindow(dto);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const tenantId = user.tenantId;
        await transaction.$queryRaw(Prisma.sql`
          WITH lifecycle_lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(hashtextextended(${`operation-profile-lifecycle:${tenantId}`}, 0))
          ) SELECT TRUE AS "locked" FROM lifecycle_lock
        `);
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "OperationProfile" WHERE "tenantId" = ${tenantId} FOR UPDATE`,
        );
        const [tenant, actor, responsible, currentProfile, currentSettings] =
          await Promise.all([
            transaction.tenant.findUnique({
              where: { id: user.tenantId },
              select: CAMPAIGN_TENANT_SELECT,
            }),
            transaction.user.findFirst({
              where: {
                id: user.userId,
                tenantId: user.tenantId,
                role: Role.ADMIN,
                isActive: true,
              },
              select: { id: true },
            }),
            transaction.user.findFirst({
              where: {
                id: dto.responsibleDataUserId,
                tenantId: user.tenantId,
                isActive: true,
                role: { in: [...DATA_RESPONSIBLE_ROLES] },
              },
              select: { id: true, role: true },
            }),
            transaction.operationProfile.findUnique({
              where: { tenantId: user.tenantId },
              select: PROFILE_SELECT,
            }),
            transaction.campaignSettings.findUnique({
              where: { tenantId: user.tenantId },
              select: SETTINGS_SELECT,
            }),
          ]);

        if (!tenant) {
          throw new NotFoundException('Organizacion no encontrada');
        }
        assertCampaignTenant(tenant);
        if (!actor) {
          throw new ForbiddenException(
            'Solo la administracion vigente puede configurar la operacion politica',
          );
        }
        if (!responsible) {
          throw new BadRequestException(
            'El responsable de datos debe ser un usuario activo de esta organizacion con rol de administracion, direccion o cumplimiento',
          );
        }

        if (currentProfile?.stage === PoliticalOperationStage.CLOSED) {
          throw new OperationClosedForMutationException();
        }
        if (!currentProfile && !SAFE_INITIAL_OPERATION_STAGES.has(dto.stage)) {
          throw new BadRequestException(
            'Una operacion nueva solo puede iniciar en EXPLORATION o PRE_CAMPAIGN',
          );
        }
        if (
          currentProfile &&
          !isValidOperationStageTransition(currentProfile.stage, dto.stage)
        ) {
          throw new ConflictException(
            `No se permite cambiar la etapa de ${currentProfile.stage} a ${dto.stage}. Siguientes etapas permitidas: ${getAllowedOperationStageTransitions(currentProfile.stage).join(', ')}`,
          );
        }

        if (
          currentProfile &&
          currentSettings &&
          this.matchesDto(currentProfile, currentSettings, dto)
        ) {
          return this.toContext(currentProfile, currentSettings);
        }

        this.assertExpectedVersion(currentProfile, dto.expectedUpdatedAt);
        if (currentProfile && currentProfile.stage !== dto.stage) {
          await this.assertConfiguredCalendarStageGates(
            transaction,
            tenantId,
            currentProfile.id,
          );
          if (
            currentProfile.stage === PoliticalOperationStage.PRE_CAMPAIGN &&
            dto.stage === PoliticalOperationStage.SIGNATURE_COLLECTION
          ) {
            await this.assertSignatureCollectionEntryReadiness(
              transaction,
              tenantId,
              currentProfile.id,
            );
          }
          if (
            currentProfile.stage ===
            PoliticalOperationStage.SIGNATURE_COLLECTION
          ) {
            await this.assertSignatureCollectionExitReadiness(
              transaction,
              tenantId,
              currentProfile.id,
            );
          }
          if (dto.stage === PoliticalOperationStage.ELECTION_DAY) {
            const territory = await this.readTerritorialReadiness(
              transaction,
              tenantId,
            );
            const blockers = getElectionDayReadinessBlockers(
              territory.divisions,
              territory.witnessCoverageWindows,
              territory.witnessAssignments,
              window.votingStartDate,
              window.votingEndDate,
              new Date(),
              hasExactActiveElectoralProjection(
                territory.divisions,
                territory.activeElectoralCatalogReleaseIds,
              ),
            );
            if (blockers.length)
              throw new ConflictException({
                code: 'ELECTION_DAY_READINESS_BLOCKED',
                message:
                  'No se puede avanzar a Dia D hasta corregir el alistamiento territorial minimo',
                blockers,
              });
          }
          if (dto.stage === PoliticalOperationStage.CLOSED) {
            await this.assertClosureReadiness(
              transaction,
              tenantId,
              currentProfile.id,
            );
          }
        }

        const budget = {
          maxTotalBudget: new Prisma.Decimal(String(dto.maxTotalBudget)),
          maxPublicityLimit: new Prisma.Decimal(String(dto.maxPublicityLimit)),
        };
        const settings = await transaction.campaignSettings.upsert({
          where: { tenantId: user.tenantId },
          create: { tenantId: user.tenantId, ...budget },
          update: budget,
          select: SETTINGS_SELECT,
        });

        const profileData = {
          operationType: dto.operationType,
          stage: dto.stage,
          electionType: dto.electionType,
          circumscriptionType: dto.circumscriptionType,
          circumscriptionName: dto.circumscriptionName,
          circumscriptionCode: dto.circumscriptionCode ?? null,
          listType: dto.listType ?? null,
          electionDate: window.electionDate,
          votingStartDate: window.votingStartDate,
          votingEndDate: window.votingEndDate,
          votingWindowSourceUrl: window.votingWindowSourceUrl,
          votingWindowReference: window.votingWindowReference,
          expectedTeamSize: dto.expectedTeamSize,
          candidateCount: dto.candidateCount,
          dataControllerName: dto.dataControllerName,
          responsibleDataUserId: responsible.id,
          retentionPeriodDays: dto.retentionPeriodDays,
          revocationProcedure: dto.revocationProcedure,
          updatedById: actor.id,
        };

        const profile = currentProfile
          ? await transaction.operationProfile.update({
              where: { tenantId: user.tenantId },
              data: profileData,
              select: PROFILE_SELECT,
            })
          : await transaction.operationProfile.create({
              data: {
                tenantId: user.tenantId,
                ...profileData,
                createdById: actor.id,
              },
              select: PROFILE_SELECT,
            });

        if (currentProfile) {
          const previousElectionWindowSha256 = electionOperatingWindowSha256({
            ...currentProfile,
            operationProfileId: currentProfile.id,
          });
          const currentElectionWindowSha256 = electionOperatingWindowSha256({
            ...profile,
            operationProfileId: profile.id,
          });
          if (previousElectionWindowSha256 !== currentElectionWindowSha256) {
            const revoked = await transaction.offlineE14CaptureGrant.updateMany(
              {
                where: {
                  tenantId,
                  operationProfileId: currentProfile.id,
                  revokedAt: null,
                },
                data: { revokedAt: new Date() },
              },
            );
            await transaction.auditEvent.create({
              data: {
                tenantId,
                mode: PoliticalOperationMode.CAMPAIGN,
                actorType: AuditActorType.USER,
                actorUserId: actor.id,
                action: 'E14_OFFLINE_GRANTS_INVALIDATED_WINDOW_CHANGED',
                resourceType: 'OperationProfile',
                resourceId: currentProfile.id,
                metadata: {
                  previousElectionWindowSha256,
                  currentElectionWindowSha256,
                  invalidatedGrantCount: revoked.count,
                },
              },
            });
          }
        }

        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: actor.id,
            action: currentProfile
              ? 'OPERATION_PROFILE_UPDATED'
              : 'OPERATION_PROFILE_CREATED',
            resourceType: 'OperationProfile',
            resourceId: profile.id,
            before:
              currentProfile && currentSettings
                ? this.toAuditSnapshot(currentProfile, currentSettings)
                : undefined,
            after: this.toAuditSnapshot(profile, settings),
          },
        });

        return this.toContext(profile, settings);
      }, SERIALIZABLE_OPTIONS);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'Otra configuracion fue creada al mismo tiempo; recarga antes de continuar',
        );
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'La configuracion cambio durante la solicitud; recarga e intenta nuevamente',
        );
      }
      throw error;
    }
  }

  private async assertConfiguredCalendarStageGates(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    operationProfileId: string,
  ) {
    const release = await transaction.electoralCalendarRelease.findFirst({
      where: { tenantId, operationProfileId, status: 'ACTIVE' },
      select: {
        milestones: {
          where: {
            tenantId,
            stageGateRequired: true,
            localDate: {
              lte: new Date(`${toBogotaDateKey(new Date())}T00:00:00.000Z`),
            },
          },
          select: {
            category: true,
            results: {
              where: { tenantId },
              select: { review: { select: { decision: true } } },
            },
          },
        },
      },
    });
    const reviewedCategories = new Set([
      'FINANCE',
      'SCRUTINY',
      'REGISTRATION',
      'SIGNATURES',
    ]);
    if (
      release?.milestones.some(
        (milestone) =>
          !milestone.results.some(
            (result) =>
              !reviewedCategories.has(milestone.category) ||
              result.review?.decision === 'APPROVE',
          ),
      )
    ) {
      throw new ConflictException({
        code: 'ELECTORAL_CALENDAR_STAGE_GATES_BLOCKED',
        message:
          'Hay hitos obligatorios del calendario vigente sin resultado verificado; revisa el calendario antes de avanzar',
      });
    }
  }

  private async readSignatureCollectionReadiness(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    operationProfileId: string,
  ) {
    const plan = await transaction.signatureCollectionPlan.findFirst({
      where: { tenantId, operationProfileId },
      select: {
        status: true,
        requiredThreshold: true,
        fileOwner: { select: { isActive: true } },
        custodyOwner: { select: { isActive: true } },
        batches: {
          where: { tenantId },
          select: {
            status: true,
            issuedForms: true,
            returnedForms: true,
            annulledForms: true,
            missingForms: true,
            inCustodyForms: true,
          },
        },
        authorityResults: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          select: {
            validSupports: true,
            outcome: true,
            review: { select: { decision: true } },
          },
        },
      },
    });
    const pendingCountCorrections =
      await transaction.signatureCountCorrectionProposal.count({
        where: { tenantId, operationProfileId, decision: null },
      });
    return evaluateSignatureCollectionReadiness({
      plan: plan
        ? {
            status: plan.status,
            requiredThreshold: plan.requiredThreshold,
            fileOwnerActive: plan.fileOwner.isActive,
            custodyOwnerActive: plan.custodyOwner.isActive,
          }
        : null,
      batches: plan?.batches ?? [],
      authorityResults:
        plan?.authorityResults.map((result) => ({
          ...result,
          decision: result.review?.decision ?? null,
        })) ?? [],
      pendingCountCorrections,
    });
  }

  private async assertSignatureCollectionEntryReadiness(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    operationProfileId: string,
  ) {
    const readiness = await this.readSignatureCollectionReadiness(
      transaction,
      tenantId,
      operationProfileId,
    );
    if (!readiness.entryReady)
      throw new ConflictException({
        code: 'SIGNATURE_COLLECTION_ENTRY_BLOCKED',
        message:
          'Completa el expediente de recoleccion de firmas antes de iniciar',
        blockers: readiness.entryBlockers,
      });
  }

  private async assertSignatureCollectionExitReadiness(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    operationProfileId: string,
  ) {
    const readiness = await this.readSignatureCollectionReadiness(
      transaction,
      tenantId,
      operationProfileId,
    );
    if (!readiness.exitReady)
      throw new ConflictException({
        code: 'SIGNATURE_COLLECTION_EXIT_BLOCKED',
        message:
          'Resuelve las obligaciones y la constancia de autoridad de recoleccion de firmas',
        blockers: readiness.exitBlockers,
      });
  }

  private async assertClosureReadiness(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    operationProfileId: string,
  ) {
    const evaluatedAt = new Date();
    const where = { tenantId, operationProfileId };
    const [
      finance,
      e14PendingCount,
      fingerprints,
      openUrgentCaseCount,
      openUrgentTaskCount,
      commissions,
      requirements,
      documents,
      scrutinyOpenDiscrepancyCount,
      scrutinyOpenActionCount,
      scrutinyPendingDecisionReviewCount,
      scrutinyOfficialDeclarationCount,
    ] = await Promise.all([
      getFinanceCloseoutReadiness(
        transaction,
        tenantId,
        operationProfileId,
        evaluatedAt,
      ),
      transaction.witnessReport.count({
        where: {
          tenantId,
          captureContext: WitnessCaptureContext.REAL,
          status: WitnessReportStatus.PENDING,
        },
      }),
      transaction.witnessReport.groupBy({
        by: E14_FINGERPRINT_FIELDS,
        where: { tenantId, captureContext: WitnessCaptureContext.REAL },
      }),
      transaction.issueCase.count({
        where: {
          tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          priority: 'URGENT',
          status: { in: OPEN_CASE_STATUSES },
        },
      }),
      transaction.task.count({
        where: {
          tenantId,
          mode: PoliticalOperationMode.CAMPAIGN,
          priority: 'URGENT',
          status: { in: OPEN_TASK_STATUSES },
        },
      }),
      transaction.scrutinyCommission.findMany({
        where: { ...where, status: { not: 'CANCELLED' } },
        select: { id: true, status: true },
      }),
      transaction.scrutinyDocumentRequirement.findMany({
        where: {
          ...where,
          commission: { is: { tenantId, status: { not: 'CANCELLED' } } },
        },
        select: { commissionId: true, documentType: true, applicability: true },
      }),
      transaction.scrutinyDocument.findMany({
        where: { ...where, reviewStatus: 'APPROVED' },
        select: {
          commissionId: true,
          type: true,
          custodyEvents: { where: { tenantId }, take: 1, select: { id: true } },
        },
      }),
      transaction.scrutinyDiscrepancy.count({
        where: { ...where, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      }),
      transaction.scrutinyAction.count({
        where: {
          ...where,
          status: {
            in: [
              'DRAFT',
              'APPROVED_INTERNAL',
              'FILED_EXTERNAL',
              'APPEALED_EXTERNAL',
            ],
          },
        },
      }),
      transaction.scrutinyActionDecision.count({
        where: { ...where, reviewStatus: 'PENDING' },
      }),
      transaction.scrutinyDeclaration.count({
        where: { ...where, status: 'OFFICIAL' },
      }),
    ]);
    const required = requirements.filter(
      (requirement) => requirement.applicability === 'REQUIRED',
    );
    const matchingDocuments = (requirement: (typeof required)[number]) =>
      documents.filter(
        (document) =>
          document.commissionId === requirement.commissionId &&
          document.type === requirement.documentType,
      );
    const blockers = getClosureReadinessBlockers(
      {
        financeComplianceReady: finance.summary.financeComplianceReady,
        financeReportDeadline: finance.summary.reportDeadline,
        unreportedFinanceCount: finance.summary.unreportedEntryCount,
        financeCloseoutBlockerCodes: finance.blockers.map(
          (blocker) => blocker.code,
        ),
        e14PendingCount,
        e14DivergentTableCount: countDivergentE14Tables(fingerprints),
        openUrgentCaseCount,
        openUrgentTaskCount,
        scrutinyCommissionCount: commissions.length,
        scrutinyOpenCommissionCount: commissions.filter(
          (commission) => commission.status !== 'CLOSED',
        ).length,
        scrutinyPendingApplicabilityCount: requirements.filter(
          (requirement) => requirement.applicability === 'PENDING',
        ).length,
        scrutinyRequiredDocumentMissingCount: required.filter(
          (requirement) => matchingDocuments(requirement).length === 0,
        ).length,
        scrutinyRequiredCustodyMissingCount: required.filter((requirement) =>
          matchingDocuments(requirement).some(
            (document) => document.custodyEvents.length === 0,
          ),
        ).length,
        scrutinyOpenDiscrepancyCount,
        scrutinyOpenActionCount,
        scrutinyPendingDecisionReviewCount,
        scrutinyOfficialDeclarationRequired: required.some(
          (requirement) =>
            requirement.documentType === 'DECLARATION_CREDENTIAL',
        ),
        scrutinyOfficialDeclarationCount,
      },
      evaluatedAt,
    );
    if (blockers.length)
      throw new ConflictException({
        code: 'OPERATION_CLOSURE_READINESS_BLOCKED',
        message:
          'No se puede cerrar la operacion mientras existan obligaciones poselectorales criticas',
        blockers,
      });
  }

  private assertExpectedVersion(
    current: SelectedProfile | null,
    expectedUpdatedAt: string | undefined,
  ): void {
    if (!current && expectedUpdatedAt) {
      throw new ConflictException(
        'La configuracion esperada ya no existe; recarga antes de continuar',
      );
    }
    if (!current) return;
    if (!expectedUpdatedAt) {
      throw new ConflictException(
        'Debes enviar la version que abriste para no sobrescribir cambios de otro usuario',
      );
    }
    if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new ConflictException(
        'La configuracion fue modificada por otra persona; recarga antes de guardar',
      );
    }
  }

  private matchesDto(
    profile: SelectedProfile,
    settings: SelectedSettings,
    dto: UpsertOperationProfileDto,
  ): boolean {
    const window = normalizeElectionOperatingWindow(dto);
    return (
      profile.operationType === dto.operationType &&
      profile.stage === dto.stage &&
      profile.electionType === dto.electionType &&
      profile.circumscriptionType === dto.circumscriptionType &&
      profile.circumscriptionName === dto.circumscriptionName &&
      profile.circumscriptionCode === (dto.circumscriptionCode ?? null) &&
      profile.listType === (dto.listType ?? null) &&
      profile.electionDate.getTime() === new Date(dto.electionDate).getTime() &&
      profile.votingStartDate.getTime() === window.votingStartDate.getTime() &&
      profile.votingEndDate.getTime() === window.votingEndDate.getTime() &&
      profile.votingWindowSourceUrl === window.votingWindowSourceUrl &&
      profile.votingWindowReference === window.votingWindowReference &&
      profile.expectedTeamSize === dto.expectedTeamSize &&
      profile.candidateCount === dto.candidateCount &&
      profile.dataControllerName === dto.dataControllerName &&
      profile.responsibleDataUserId === dto.responsibleDataUserId &&
      profile.retentionPeriodDays === dto.retentionPeriodDays &&
      profile.revocationProcedure === dto.revocationProcedure &&
      settings.maxTotalBudget.equals(dto.maxTotalBudget) &&
      settings.maxPublicityLimit.equals(dto.maxPublicityLimit)
    );
  }

  private toContext(profile: SelectedProfile, settings: SelectedSettings) {
    return {
      configured: true,
      profile: {
        ...profile,
        allowedNextStages: getAllowedNextOperationStages(profile.stage),
        budget: {
          maxTotalBudget: settings.maxTotalBudget.toNumber(),
          maxPublicityLimit: settings.maxPublicityLimit.toNumber(),
        },
        derived: this.deriveConfiguration(profile),
      },
    };
  }

  private deriveConfiguration(profile: SelectedProfile) {
    const dayDStages: readonly PoliticalOperationStage[] = [
      PoliticalOperationStage.ELECTION_PREPARATION,
      PoliticalOperationStage.SIMULATION,
      PoliticalOperationStage.ELECTION_DAY,
      PoliticalOperationStage.POST_ELECTION,
    ];
    const warRoomStages: readonly PoliticalOperationStage[] = [
      PoliticalOperationStage.SIMULATION,
      PoliticalOperationStage.ELECTION_DAY,
    ];

    return {
      workspace:
        profile.stage === PoliticalOperationStage.ELECTION_DAY
          ? 'ELECTION_DAY'
          : profile.stage === PoliticalOperationStage.SIMULATION
            ? 'SIMULATION'
            : 'DAILY_OPERATION',
      scale:
        profile.expectedTeamSize <= 10
          ? 'SMALL'
          : profile.expectedTeamSize <= 100
            ? 'MEDIUM'
            : 'LARGE',
      dayDEnabled: dayDStages.includes(profile.stage),
      warRoomEnabled: warRoomStages.includes(profile.stage),
      signatureCollectionEnabled:
        profile.operationType === PoliticalOperationType.SIGNATURE_COMMITTEE ||
        profile.stage === PoliticalOperationStage.SIGNATURE_COLLECTION,
      candidateListEnabled:
        profile.operationType ===
          PoliticalOperationType.CORPORATION_CANDIDACY ||
        profile.operationType === PoliticalOperationType.PARTY_MOVEMENT,
      preferentialVoteEnabled:
        profile.listType === CandidateListType.OPEN_PREFERENTIAL,
      territoryScope: this.toTerritoryScope(profile.circumscriptionType),
    };
  }

  private toTerritoryScope(type: ElectoralCircumscriptionType): string {
    const scopes: Record<ElectoralCircumscriptionType, string> = {
      [ElectoralCircumscriptionType.NATIONAL]: 'NATIONAL',
      [ElectoralCircumscriptionType.DEPARTMENTAL]: 'DEPARTMENT',
      [ElectoralCircumscriptionType.MUNICIPAL]: 'MUNICIPALITY',
      [ElectoralCircumscriptionType.LOCAL]: 'LOCALITY',
      [ElectoralCircumscriptionType.SPECIAL]: 'SPECIAL',
      [ElectoralCircumscriptionType.INTERNAL]: 'INTERNAL',
    };
    return scopes[type];
  }

  private toAuditSnapshot(
    profile: SelectedProfile,
    settings: SelectedSettings,
  ): Prisma.InputJsonObject {
    return {
      operationType: profile.operationType,
      stage: profile.stage,
      electionType: profile.electionType,
      circumscriptionType: profile.circumscriptionType,
      circumscriptionName: profile.circumscriptionName,
      circumscriptionCode: profile.circumscriptionCode,
      listType: profile.listType,
      electionDate: profile.electionDate.toISOString(),
      votingStartDate: profile.votingStartDate?.toISOString() ?? null,
      votingEndDate: profile.votingEndDate?.toISOString() ?? null,
      expectedTeamSize: profile.expectedTeamSize,
      candidateCount: profile.candidateCount,
      maxTotalBudget: settings.maxTotalBudget.toString(),
      maxPublicityLimit: settings.maxPublicityLimit.toString(),
      dataControllerName: profile.dataControllerName,
      responsibleDataUserId: profile.responsibleDataUserId,
      retentionPeriodDays: profile.retentionPeriodDays,
      revocationProcedureSha256: createHash('sha256')
        .update(profile.revocationProcedure, 'utf8')
        .digest('hex'),
    };
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
}
