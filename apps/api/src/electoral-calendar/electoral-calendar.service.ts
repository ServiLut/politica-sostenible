import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  ElectoralCalendarCommandType,
  ElectoralCalendarDecisionAction,
  ElectoralCalendarMilestoneCategory,
  ElectoralCalendarMilestoneSemantics,
  ElectoralCalendarReleaseStatus,
  ElectoralCalendarResultReviewDecision,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  StorageObjectModule,
  StoredObjectStatus,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivateElectoralCalendarReleaseDto,
  CreateElectoralCalendarReleaseDto,
  RecordElectoralCalendarResultDto,
  ReviewElectoralCalendarResultDto,
  ValidateElectoralCalendarReleaseDto,
} from './dto/electoral-calendar.dto';
import {
  computeElectoralCalendarCommandSha256,
  type ElectoralCalendarCommandName,
} from './electoral-calendar.hash';
import {
  civilDateAt,
  civilDateTimeToUtc,
  isIanaTimeZone,
} from './electoral-calendar.time';

const READ_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];
const MANAGE_ROLES: readonly Role[] = [Role.ADMIN, Role.CAMPAIGN_MANAGER];
const REVIEW_ROLES: readonly Role[] = [Role.COMPLIANCE_OFFICER, Role.AUDITOR];
const RESULT_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.ZONE_COORDINATOR,
];
const RESPONSIBLE_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.FINANCE_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];
const RELEASE_MUTATION_STAGES: readonly PoliticalOperationStage[] = [
  PoliticalOperationStage.EXPLORATION,
  PoliticalOperationStage.PRE_CAMPAIGN,
  PoliticalOperationStage.SIGNATURE_COLLECTION,
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.POST_ELECTION,
];
const RESULT_STAGES: readonly PoliticalOperationStage[] = [
  ...RELEASE_MUTATION_STAGES,
  PoliticalOperationStage.ELECTION_DAY,
];
const SECOND_CONTROL_CATEGORIES = new Set<ElectoralCalendarMilestoneCategory>([
  ElectoralCalendarMilestoneCategory.FINANCE,
  ElectoralCalendarMilestoneCategory.SCRUTINY,
  ElectoralCalendarMilestoneCategory.REGISTRATION,
  ElectoralCalendarMilestoneCategory.SIGNATURES,
]);
const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

const PERSON_SELECT = {
  id: true,
  name: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

const COMMAND_SELECT = {
  id: true,
  clientRequestId: true,
  payloadSha256: true,
  type: true,
  actorUserId: true,
  resourceType: true,
  resourceId: true,
  createdAt: true,
} satisfies Prisma.ElectoralCalendarCommandSelect;

const RESULT_SELECT = {
  id: true,
  outcome: true,
  explanation: true,
  evidencePath: true,
  evidenceSha256: true,
  recordedAt: true,
  recordedBy: { select: PERSON_SELECT },
  review: {
    select: {
      id: true,
      decision: true,
      rationale: true,
      reviewedAt: true,
      reviewer: { select: PERSON_SELECT },
    },
  },
} satisfies Prisma.ElectoralCalendarMilestoneResultSelect;

const MILESTONE_SELECT = {
  id: true,
  stableKey: true,
  category: true,
  semantics: true,
  title: true,
  applicabilityRule: true,
  originalTextSummary: true,
  localDate: true,
  localTime: true,
  timeZone: true,
  occursAtUtc: true,
  responsibleUserId: true,
  backupUserId: true,
  alertOffsetsDays: true,
  stageGateRequired: true,
  resultEvidenceRequired: true,
  linkedTaskId: true,
  linkedEventId: true,
  responsible: { select: PERSON_SELECT },
  backup: { select: PERSON_SELECT },
  linkedTask: { select: { id: true, title: true, status: true, dueAt: true } },
  linkedEvent: {
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
    },
  },
  results: {
    select: RESULT_SELECT,
    orderBy: [{ recordedAt: 'desc' as const }, { id: 'desc' as const }],
  },
} satisfies Prisma.ElectoralCalendarMilestoneSelect;

const RELEASE_SELECT = {
  id: true,
  basedOnReleaseId: true,
  electionType: true,
  electionDate: true,
  circumscriptionType: true,
  circumscriptionName: true,
  circumscriptionCode: true,
  roundCode: true,
  versionLabel: true,
  status: true,
  sourceAuthority: true,
  sourceUrl: true,
  sourceReference: true,
  sourcePublishedAt: true,
  sourceCutoffAt: true,
  sourceSha256: true,
  version: true,
  validatedAt: true,
  activatedAt: true,
  supersededAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: PERSON_SELECT },
  validatedBy: { select: PERSON_SELECT },
  activatedBy: { select: PERSON_SELECT },
  decisions: {
    select: {
      id: true,
      action: true,
      sourceReviewedAcknowledged: true,
      diffReviewedAcknowledged: true,
      affectedTasksResolvedAcknowledged: true,
      rationale: true,
      createdAt: true,
      actor: { select: PERSON_SELECT },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  milestones: {
    select: MILESTONE_SELECT,
    orderBy: [{ localDate: 'asc' as const }, { stableKey: 'asc' as const }],
  },
} satisfies Prisma.ElectoralCalendarReleaseSelect;

type SelectedRelease = Prisma.ElectoralCalendarReleaseGetPayload<{
  select: typeof RELEASE_SELECT;
}>;
type SelectedMilestone = Prisma.ElectoralCalendarMilestoneGetPayload<{
  select: typeof MILESTONE_SELECT;
}>;
type SelectedResult = Prisma.ElectoralCalendarMilestoneResultGetPayload<{
  select: typeof RESULT_SELECT;
}>;
type SelectedCommand = Prisma.ElectoralCalendarCommandGetPayload<{
  select: typeof COMMAND_SELECT;
}>;
type MutationContext = Readonly<{
  actor: { id: string; role: Role };
  profile: {
    id: string;
    stage: PoliticalOperationStage;
    electionType: SelectedRelease['electionType'];
    electionDate: Date;
    circumscriptionType: SelectedRelease['circumscriptionType'];
    circumscriptionName: string;
    circumscriptionCode: string | null;
  };
}>;

@Injectable()
export class ElectoralCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /** Internal consumer for the executive briefing; absence is a setup state. */
  async getCommandCenterSummary(tenantId: string, evaluatedAt = new Date()) {
    const profile = await this.prisma.operationProfile.findUnique({
      where: { tenantId },
      select: { id: true, stage: true },
    });
    if (!profile) {
      return {
        configured: false,
        activeReleaseId: null,
        upcoming30Days: [],
        overdue: [],
        alertsDue: [],
        potentialAssignmentConflicts: [],
        unresolvedRequiredGates: [],
        href: '/dashboard/electoral-calendar',
        disclaimer:
          'No hay perfil operativo; no se presume ningun calendario aplicable.',
      };
    }
    const active = await this.prisma.electoralCalendarRelease.findFirst({
      where: {
        tenantId,
        operationProfileId: profile.id,
        status: ElectoralCalendarReleaseStatus.ACTIVE,
      },
      select: RELEASE_SELECT,
    });
    if (!active) {
      return {
        configured: true,
        activeReleaseId: null,
        upcoming30Days: [],
        overdue: [],
        alertsDue: [],
        potentialAssignmentConflicts: [],
        unresolvedRequiredGates: [],
        href: '/dashboard/electoral-calendar',
        disclaimer:
          'No existe una version ACTIVE; ninguna fecha se trata como vigente para la operacion.',
      };
    }
    return {
      configured: true,
      ...this.buildActiveSummary(active, evaluatedAt),
      href: '/dashboard/electoral-calendar',
      disclaimer:
        'Fechas de control interno; confirme siempre la fuente electoral aplicable.',
    };
  }

  async getOverview(user: AuthenticatedUser, evaluatedAt = new Date()) {
    return this.prisma.$transaction(async (transaction) => {
      const context = await this.requireReadContext(transaction, user);
      const [releases, operators] = await Promise.all([
        transaction.electoralCalendarRelease.findMany({
          where: {
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
          select: RELEASE_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        transaction.user.findMany({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            role: { in: [...RESPONSIBLE_ROLES] },
          },
          select: PERSON_SELECT,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
      ]);
      const active = releases.find(
        (release) => release.status === ElectoralCalendarReleaseStatus.ACTIVE,
      );
      return {
        disclaimer:
          'Control interno versionado. No reemplaza el calendario, una notificacion ni una decision de la autoridad electoral.',
        evaluatedAt,
        profile: {
          id: context.profile.id,
          stage: context.profile.stage,
          electionType: context.profile.electionType,
          electionDate: context.profile.electionDate,
          circumscriptionType: context.profile.circumscriptionType,
          circumscriptionName: context.profile.circumscriptionName,
          circumscriptionCode: context.profile.circumscriptionCode,
        },
        readOnly: context.profile.stage === PoliticalOperationStage.CLOSED,
        releases: releases.map((release) => ({
          ...release,
          diff: this.releaseDiff(
            release.basedOnReleaseId
              ? releases.find((item) => item.id === release.basedOnReleaseId)
              : undefined,
            release,
          ),
          milestones: release.milestones.map((milestone) => ({
            ...milestone,
            resolution: this.resolveMilestone(milestone),
          })),
        })),
        activeSummary: active
          ? this.buildActiveSummary(active, evaluatedAt)
          : {
              activeReleaseId: null,
              upcoming30Days: [],
              overdue: [],
              alertsDue: [],
              potentialAssignmentConflicts: [],
              unresolvedRequiredGates: [],
            },
        operators,
      };
    });
  }

  createRelease(
    user: AuthenticatedUser,
    dto: CreateElectoralCalendarReleaseDto,
  ) {
    const normalized = {
      ...dto,
      milestones: dto.milestones.map((milestone) => ({
        ...milestone,
        alertOffsetsDays: [...milestone.alertOffsetsDays].sort(
          (left, right) => right - left,
        ),
      })),
    };
    return this.runCommand({
      user,
      type: 'RELEASE_STAGE',
      dto,
      hashInput: normalized,
      roles: MANAGE_ROLES,
      stages: RELEASE_MUTATION_STAGES,
      resourceType: 'ElectoralCalendarRelease',
      load: (transaction, id) =>
        this.loadRelease(transaction, user.tenantId, id),
      mutate: async (transaction, context, commandId, releaseId) => {
        const publishedAt = this.dateOnly(dto.sourcePublishedAt);
        const cutoffAt = new Date(dto.sourceCutoffAt);
        if (
          Number.isNaN(cutoffAt.getTime()) ||
          cutoffAt.getTime() < publishedAt.getTime()
        ) {
          throw new BadRequestException(
            'El corte de la fuente no puede ser anterior a su publicacion',
          );
        }
        const stableKeys = new Set(
          dto.milestones.map((item) => item.stableKey),
        );
        if (stableKeys.size !== dto.milestones.length) {
          throw new BadRequestException(
            'Cada hito necesita una clave estable unica dentro de la version',
          );
        }
        const currentActive =
          await transaction.electoralCalendarRelease.findFirst({
            where: {
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
              roundCode: dto.roundCode,
              status: ElectoralCalendarReleaseStatus.ACTIVE,
            },
            select: { id: true },
          });
        if ((currentActive?.id ?? null) !== (dto.basedOnReleaseId ?? null)) {
          throw new ConflictException({
            code: 'CALENDAR_BASELINE_CHANGED',
            message: currentActive
              ? 'La nueva version debe declarar como base el paquete activo de la ronda'
              : 'No existe un paquete activo que pueda usarse como base',
          });
        }
        await this.validateMilestoneInputs(transaction, user.tenantId, dto);
        await transaction.electoralCalendarRelease.create({
          data: {
            id: releaseId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            initialCommandId: commandId,
            basedOnReleaseId: dto.basedOnReleaseId ?? null,
            electionType: context.profile.electionType,
            electionDate: context.profile.electionDate,
            circumscriptionType: context.profile.circumscriptionType,
            circumscriptionName: context.profile.circumscriptionName,
            circumscriptionCode: context.profile.circumscriptionCode,
            roundCode: dto.roundCode,
            versionLabel: dto.versionLabel,
            sourceAuthority: dto.sourceAuthority,
            sourceUrl: dto.sourceUrl,
            sourceReference: dto.sourceReference,
            sourcePublishedAt: publishedAt,
            sourceCutoffAt: cutoffAt,
            sourceSha256: dto.sourceSha256,
            createdById: context.actor.id,
          },
        });
        await transaction.electoralCalendarMilestone.createMany({
          data: dto.milestones.map((milestone) => ({
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            releaseId,
            stableKey: milestone.stableKey,
            category: milestone.category,
            semantics: milestone.semantics,
            title: milestone.title,
            applicabilityRule: milestone.applicabilityRule,
            originalTextSummary: milestone.originalTextSummary,
            localDate: this.dateOnly(milestone.localDate),
            localTime: milestone.localTime ?? null,
            timeZone: milestone.timeZone,
            occursAtUtc: milestone.localTime
              ? civilDateTimeToUtc(
                  milestone.localDate,
                  milestone.localTime,
                  milestone.timeZone,
                )
              : null,
            responsibleUserId: milestone.responsibleUserId ?? null,
            backupUserId: milestone.backupUserId ?? null,
            alertOffsetsDays: [...milestone.alertOffsetsDays].sort(
              (left, right) => right - left,
            ),
            stageGateRequired: milestone.stageGateRequired,
            resultEvidenceRequired: milestone.resultEvidenceRequired,
            linkedTaskId: milestone.linkedTaskId ?? null,
            linkedEventId: milestone.linkedEventId ?? null,
          })),
        });
      },
    });
  }

  validateRelease(
    user: AuthenticatedUser,
    releaseId: string,
    dto: ValidateElectoralCalendarReleaseDto,
  ) {
    return this.runCommand({
      user,
      type: 'RELEASE_VALIDATE',
      dto,
      hashInput: { releaseId, ...dto },
      roles: REVIEW_ROLES,
      stages: RELEASE_MUTATION_STAGES,
      resourceType: 'ElectoralCalendarRelease',
      resourceId: releaseId,
      load: (transaction, id) =>
        this.loadRelease(transaction, user.tenantId, id),
      mutate: async (transaction, context, commandId) => {
        const release = await this.lockRelease(
          transaction,
          user.tenantId,
          releaseId,
        );
        this.assertProfileSnapshot(context, release);
        this.assertReleaseVersion(release, dto.expectedVersion);
        if (release.status !== ElectoralCalendarReleaseStatus.STAGED) {
          throw new ConflictException(
            'Solo una version STAGED puede validarse',
          );
        }
        if (release.createdById === context.actor.id) {
          throw new ForbiddenException({
            code: 'FOUR_EYES_REQUIRED',
            message: 'Quien cargo la version no puede validar su propia fuente',
          });
        }
        if (!dto.sourceReviewedAcknowledged) {
          throw new BadRequestException(
            'La validacion exige confirmar la revision de la fuente aplicable',
          );
        }
        await this.assertReleaseReady(transaction, user.tenantId, releaseId);
        await transaction.electoralCalendarReleaseDecision.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            releaseId,
            commandId,
            action: ElectoralCalendarDecisionAction.VALIDATE,
            sourceReviewedAcknowledged: true,
            diffReviewedAcknowledged: false,
            affectedTasksResolvedAcknowledged: false,
            rationale: dto.rationale,
            actorUserId: context.actor.id,
          },
        });
        const updated = await transaction.electoralCalendarRelease.updateMany({
          where: {
            id: releaseId,
            tenantId: user.tenantId,
            version: dto.expectedVersion,
            status: ElectoralCalendarReleaseStatus.STAGED,
          },
          data: {
            status: ElectoralCalendarReleaseStatus.VALIDATED,
            validatedById: context.actor.id,
            validatedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.concurrentChange();
      },
    });
  }

  activateRelease(
    user: AuthenticatedUser,
    releaseId: string,
    dto: ActivateElectoralCalendarReleaseDto,
  ) {
    return this.runCommand({
      user,
      type: 'RELEASE_ACTIVATE',
      dto,
      hashInput: { releaseId, ...dto },
      roles: REVIEW_ROLES,
      stages: RELEASE_MUTATION_STAGES,
      resourceType: 'ElectoralCalendarRelease',
      resourceId: releaseId,
      load: (transaction, id) =>
        this.loadRelease(transaction, user.tenantId, id),
      mutate: async (transaction, context, commandId) => {
        await transaction.$queryRaw<Array<{ locked: boolean }>>(
          Prisma.sql`
            WITH electoral_calendar_lock AS MATERIALIZED (
              SELECT pg_advisory_xact_lock(
                hashtextextended(${`electoral-calendar:${user.tenantId}:${context.profile.id}`}, 0)
              )
            )
            SELECT TRUE AS "locked" FROM electoral_calendar_lock
          `,
        );
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "ElectoralCalendarRelease" WHERE "tenantId" = ${user.tenantId} AND "operationProfileId" = ${context.profile.id} FOR UPDATE`,
        );
        const release = await this.loadReleaseRecord(
          transaction,
          user.tenantId,
          releaseId,
        );
        this.assertProfileSnapshot(context, release);
        this.assertReleaseVersion(release, dto.expectedVersion);
        if (release.status !== ElectoralCalendarReleaseStatus.VALIDATED) {
          throw new ConflictException(
            'Solo una version VALIDATED puede activarse',
          );
        }
        if (release.createdById === context.actor.id) {
          throw new ForbiddenException({
            code: 'FOUR_EYES_REQUIRED',
            message: 'Quien cargo la version no puede activarla',
          });
        }
        if (
          !dto.sourceReviewedAcknowledged ||
          !dto.diffReviewedAcknowledged ||
          !dto.affectedTasksResolvedAcknowledged
        ) {
          throw new BadRequestException(
            'La activacion exige revisar fuente, diff y tareas afectadas',
          );
        }
        await this.assertReleaseReady(transaction, user.tenantId, releaseId);
        const current = await transaction.electoralCalendarRelease.findFirst({
          where: {
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            roundCode: release.roundCode,
            status: ElectoralCalendarReleaseStatus.ACTIVE,
          },
          select: { id: true, createdById: true, version: true },
        });
        if ((current?.id ?? null) !== (release.basedOnReleaseId ?? null)) {
          throw new ConflictException({
            code: 'CALENDAR_BASELINE_CHANGED',
            message:
              'El calendario activo cambio; genere y revise nuevamente el diff',
          });
        }
        await transaction.electoralCalendarReleaseDecision.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            releaseId,
            commandId,
            action: ElectoralCalendarDecisionAction.ACTIVATE,
            sourceReviewedAcknowledged: true,
            diffReviewedAcknowledged: true,
            affectedTasksResolvedAcknowledged: true,
            rationale: dto.rationale,
            actorUserId: context.actor.id,
          },
        });
        const transitionAt = new Date();
        if (current) {
          const internalCommandId = randomUUID();
          const internalClientRequestId = randomUUID();
          const internalHash = computeElectoralCalendarCommandSha256(
            'RELEASE_ACTIVATE',
            {
              supersededReleaseId: current.id,
              replacementReleaseId: releaseId,
            },
          );
          await transaction.electoralCalendarCommand.create({
            data: {
              id: internalCommandId,
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
              clientRequestId: internalClientRequestId,
              payloadSha256: internalHash,
              type: ElectoralCalendarCommandType.RELEASE_ACTIVATE,
              actorUserId: context.actor.id,
              resourceType: 'ElectoralCalendarRelease',
              resourceId: current.id,
              resultSnapshot: { replacementReleaseId: releaseId },
            },
          });
          await transaction.electoralCalendarReleaseDecision.create({
            data: {
              id: randomUUID(),
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
              releaseId: current.id,
              commandId: internalCommandId,
              action: ElectoralCalendarDecisionAction.SUPERSEDE,
              sourceReviewedAcknowledged: true,
              diffReviewedAcknowledged: true,
              affectedTasksResolvedAcknowledged: true,
              rationale: `Sustituido por la version ${release.versionLabel}: ${dto.rationale}`,
              actorUserId: context.actor.id,
            },
          });
          const superseded =
            await transaction.electoralCalendarRelease.updateMany({
              where: {
                id: current.id,
                tenantId: user.tenantId,
                version: current.version,
                status: ElectoralCalendarReleaseStatus.ACTIVE,
              },
              data: {
                status: ElectoralCalendarReleaseStatus.SUPERSEDED,
                supersededAt: transitionAt,
                version: { increment: 1 },
              },
            });
          if (superseded.count !== 1) this.concurrentChange();
        }
        const activated = await transaction.electoralCalendarRelease.updateMany(
          {
            where: {
              id: releaseId,
              tenantId: user.tenantId,
              version: dto.expectedVersion,
              status: ElectoralCalendarReleaseStatus.VALIDATED,
            },
            data: {
              status: ElectoralCalendarReleaseStatus.ACTIVE,
              activatedById: context.actor.id,
              activatedAt: transitionAt,
              version: { increment: 1 },
            },
          },
        );
        if (activated.count !== 1) this.concurrentChange();
      },
    });
  }

  recordResult(
    user: AuthenticatedUser,
    milestoneId: string,
    dto: RecordElectoralCalendarResultDto,
  ) {
    this.assertEvidencePair(dto.evidenceStoragePath, dto.evidenceSha256);
    return this.runCommand({
      user,
      type: 'MILESTONE_RESULT_RECORD',
      dto,
      hashInput: { milestoneId, ...dto },
      roles: RESULT_ROLES,
      stages: RESULT_STAGES,
      resourceType: 'ElectoralCalendarMilestoneResult',
      load: (transaction, id) =>
        this.loadResult(transaction, user.tenantId, id),
      mutate: async (transaction, context, commandId, resultId) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "ElectoralCalendarMilestone" WHERE "id" = ${milestoneId}::uuid AND "tenantId" = ${user.tenantId} FOR UPDATE`,
        );
        const milestone =
          await transaction.electoralCalendarMilestone.findFirst({
            where: { id: milestoneId, tenantId: user.tenantId },
            select: {
              id: true,
              operationProfileId: true,
              releaseId: true,
              category: true,
              resultEvidenceRequired: true,
              release: { select: { status: true } },
              results: {
                select: {
                  id: true,
                  review: { select: { decision: true } },
                },
                orderBy: { recordedAt: 'desc' },
              },
            },
          });
        if (!milestone) throw new NotFoundException('Hito no encontrado');
        if (milestone.operationProfileId !== context.profile.id) {
          throw new NotFoundException('Hito no encontrado');
        }
        if (
          milestone.release.status !== ElectoralCalendarReleaseStatus.ACTIVE
        ) {
          throw new ConflictException(
            'Solo el paquete interno ACTIVE acepta resultados',
          );
        }
        const sensitive = SECOND_CONTROL_CATEGORIES.has(milestone.category);
        const unresolvedPending = milestone.results.some(
          (result) => !result.review && sensitive,
        );
        const alreadyResolved = milestone.results.some(
          (result) =>
            !sensitive ||
            result.review?.decision ===
              ElectoralCalendarResultReviewDecision.APPROVE,
        );
        if (alreadyResolved || unresolvedPending) {
          throw new ConflictException(
            alreadyResolved
              ? 'El hito ya tiene un resultado efectivo inmutable'
              : 'El resultado existente espera segundo control',
          );
        }
        let evidence: { id: string; path: string } | null = null;
        if (dto.evidenceStoragePath && dto.evidenceSha256) {
          if (
            !dto.evidenceStoragePath.startsWith(
              `${user.tenantId}/electoral-calendar/`,
            )
          ) {
            throw new BadRequestException(
              'La evidencia no pertenece a la ruta privada del calendario',
            );
          }
          evidence = await transaction.storedObject.findFirst({
            where: {
              tenantId: user.tenantId,
              uploaderId: context.actor.id,
              path: dto.evidenceStoragePath,
              module: StorageObjectModule.ELECTORAL_CALENDAR,
              status: StoredObjectStatus.CONFIRMED,
              consumedAt: null,
              expectedSha256: dto.evidenceSha256,
              reportedSha256: dto.evidenceSha256,
            },
            select: { id: true, path: true },
          });
          if (!evidence) {
            throw new BadRequestException(
              'La evidencia debe estar confirmada, sin consumir y conservar el SHA declarado por el cliente',
            );
          }
        }
        if (milestone.resultEvidenceRequired && !evidence) {
          throw new BadRequestException(
            'Este hito exige evidencia documental confirmada',
          );
        }
        await transaction.electoralCalendarMilestoneResult.create({
          data: {
            id: resultId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            releaseId: milestone.releaseId,
            milestoneId,
            commandId,
            outcome: dto.outcome,
            explanation: dto.explanation,
            evidenceStoredObjectId: evidence?.id ?? null,
            evidencePath: evidence?.path ?? null,
            evidenceSha256: dto.evidenceSha256 ?? null,
            recordedById: context.actor.id,
          },
        });
        if (evidence && dto.evidenceSha256) {
          await consumeConfirmedStorageUpload(
            transaction,
            user.tenantId,
            evidence.path,
            StorageObjectModule.ELECTORAL_CALENDAR,
            'ElectoralCalendarMilestoneResult',
            resultId,
            context.actor.id,
            { expectedSha256: dto.evidenceSha256 },
          );
        }
      },
    });
  }

  reviewResult(
    user: AuthenticatedUser,
    resultId: string,
    dto: ReviewElectoralCalendarResultDto,
  ) {
    return this.runCommand({
      user,
      type: 'MILESTONE_RESULT_REVIEW',
      dto,
      hashInput: { resultId, ...dto },
      roles: REVIEW_ROLES,
      stages: RESULT_STAGES,
      resourceType: 'ElectoralCalendarMilestoneResult',
      resourceId: resultId,
      load: (transaction, id) =>
        this.loadResult(transaction, user.tenantId, id),
      mutate: async (transaction, context, commandId) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "ElectoralCalendarMilestoneResult" WHERE "id" = ${resultId}::uuid AND "tenantId" = ${user.tenantId} FOR UPDATE`,
        );
        const result =
          await transaction.electoralCalendarMilestoneResult.findFirst({
            where: { id: resultId, tenantId: user.tenantId },
            select: {
              id: true,
              operationProfileId: true,
              milestoneId: true,
              recordedById: true,
              review: { select: { id: true } },
              milestone: { select: { category: true } },
            },
          });
        if (!result || result.operationProfileId !== context.profile.id) {
          throw new NotFoundException('Resultado de hito no encontrado');
        }
        if (!SECOND_CONTROL_CATEGORIES.has(result.milestone.category)) {
          throw new ConflictException(
            'Este resultado no exige segundo control especializado',
          );
        }
        if (result.review) {
          throw new ConflictException(
            'El resultado ya tiene una revision inmutable',
          );
        }
        if (result.recordedById === context.actor.id) {
          throw new ForbiddenException({
            code: 'FOUR_EYES_REQUIRED',
            message: 'Quien registro el resultado no puede revisarlo',
          });
        }
        if (dto.decision === ElectoralCalendarResultReviewDecision.APPROVE) {
          const existingApproved =
            await transaction.electoralCalendarMilestoneResult.findFirst({
              where: {
                tenantId: user.tenantId,
                milestoneId: result.milestoneId,
                id: { not: result.id },
                review: {
                  is: {
                    decision: ElectoralCalendarResultReviewDecision.APPROVE,
                  },
                },
              },
              select: { id: true },
            });
          if (existingApproved) {
            throw new ConflictException(
              'El hito ya tiene otro resultado aprobado por segundo control',
            );
          }
        }
        await transaction.electoralCalendarResultReview.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            resultId,
            commandId,
            decision: dto.decision,
            rationale: dto.rationale,
            reviewedById: context.actor.id,
          },
        });
      },
    });
  }

  private runCommand<T>(input: {
    user: AuthenticatedUser;
    type: ElectoralCalendarCommandName;
    dto: object & { clientRequestId: string; payloadSha256: string };
    hashInput: object;
    roles: readonly Role[];
    stages: readonly PoliticalOperationStage[];
    resourceType: string;
    resourceId?: string;
    load: (
      transaction: Prisma.TransactionClient,
      resourceId: string,
    ) => Promise<T>;
    mutate: (
      transaction: Prisma.TransactionClient,
      context: MutationContext,
      commandId: string,
      resourceId: string,
    ) => Promise<void>;
  }): Promise<{ resource: T; command: SelectedCommand; noOp: boolean }> {
    this.assertCommandIdentity(input.dto);
    const expectedHash = computeElectoralCalendarCommandSha256(
      input.type,
      input.hashInput,
    );
    if (expectedHash !== input.dto.payloadSha256) {
      throw new BadRequestException({
        code: 'CALENDAR_PAYLOAD_HASH_MISMATCH',
        message: 'payloadSha256 no corresponde al comando canonico',
      });
    }
    const resourceId = input.resourceId ?? randomUUID();
    const execute = () =>
      this.prisma.$transaction(async (transaction) => {
        const context = await this.requireMutationContext(
          transaction,
          input.user,
          input.roles,
          input.stages,
        );
        const existing = await transaction.electoralCalendarCommand.findFirst({
          where: {
            tenantId: input.user.tenantId,
            clientRequestId: input.dto.clientRequestId,
          },
          select: COMMAND_SELECT,
        });
        if (existing) {
          if (
            existing.type !== input.type ||
            existing.payloadSha256 !== expectedHash ||
            existing.actorUserId !== context.actor.id ||
            existing.resourceType !== input.resourceType
          ) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_REUSED',
              message:
                'clientRequestId ya fue usado con otro comando, contenido o actor',
            });
          }
          return {
            resource: await input.load(transaction, existing.resourceId),
            command: existing,
            noOp: true,
          };
        }
        const commandId = randomUUID();
        const command = await transaction.electoralCalendarCommand.create({
          data: {
            id: commandId,
            tenantId: input.user.tenantId,
            operationProfileId: context.profile.id,
            clientRequestId: input.dto.clientRequestId,
            payloadSha256: expectedHash,
            type: input.type as ElectoralCalendarCommandType,
            actorUserId: context.actor.id,
            resourceType: input.resourceType,
            resourceId,
            resultSnapshot: { resourceType: input.resourceType, resourceId },
          },
          select: COMMAND_SELECT,
        });
        await input.mutate(transaction, context, commandId, resourceId);
        const resource = await input.load(transaction, resourceId);
        await transaction.auditEvent.create({
          data: {
            tenantId: input.user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: context.actor.id,
            action: `ELECTORAL_CALENDAR_${input.type}`,
            resourceType: input.resourceType,
            resourceId,
            after: {
              commandId,
              clientRequestId: input.dto.clientRequestId,
              payloadSha256: expectedHash,
            },
          },
        });
        return { resource, command, noOp: false };
      }, SERIALIZABLE);
    return execute().catch(async (error: unknown) => {
      if (this.isPrismaError(error, 'P2002')) {
        try {
          return await execute();
        } catch (replayError) {
          if (this.isPrismaError(replayError, 'P2034')) this.concurrentChange();
          throw replayError;
        }
      }
      if (this.isPrismaError(error, 'P2034')) this.concurrentChange();
      throw error;
    });
  }

  private async requireMutationContext(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    roles: readonly Role[],
    stages: readonly PoliticalOperationStage[],
  ): Promise<MutationContext> {
    await transaction.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`
        WITH electoral_calendar_lifecycle_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`operation-profile-lifecycle:${user.tenantId}`}, 0)
          )
        )
        SELECT TRUE AS "locked" FROM electoral_calendar_lifecycle_lock
      `,
    );
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "OperationProfile" WHERE "tenantId" = ${user.tenantId} FOR UPDATE`,
    );
    const context = await this.loadContext(transaction, user, roles);
    if (context.profile.stage === PoliticalOperationStage.CLOSED) {
      throw new ConflictException({
        code: 'OPERATION_CLOSED',
        message: 'La operacion cerrada conserva el calendario en solo lectura',
      });
    }
    if (!stages.includes(context.profile.stage)) {
      throw new ConflictException({
        code: 'ELECTORAL_CALENDAR_STAGE_BLOCKED',
        message:
          context.profile.stage === PoliticalOperationStage.ELECTION_DAY
            ? 'Durante la jornada no se permite cambiar el paquete de fechas activo'
            : `La accion no esta habilitada en ${context.profile.stage}`,
      });
    }
    return context;
  }

  private requireReadContext(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
  ) {
    return this.loadContext(transaction, user, READ_ROLES);
  }

  private async loadContext(
    transaction: Prisma.TransactionClient,
    user: AuthenticatedUser,
    roles: readonly Role[],
  ): Promise<MutationContext> {
    const [tenant, actor, profile] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      transaction.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          isActive: true,
          role: { in: [...roles] },
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
          circumscriptionCode: true,
        },
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!actor) {
      throw new ForbiddenException(
        'El usuario vigente no tiene acceso al calendario electoral',
      );
    }
    if (!profile) {
      throw new ConflictException(
        'Configure el perfil operativo antes de gestionar el calendario',
      );
    }
    return { actor, profile };
  }

  private async validateMilestoneInputs(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateElectoralCalendarReleaseDto,
  ) {
    const userIds = new Set<string>();
    const taskIds = new Set<string>();
    const eventIds = new Set<string>();
    for (const milestone of dto.milestones) {
      if (!isIanaTimeZone(milestone.timeZone)) {
        throw new BadRequestException(
          `La zona IANA de ${milestone.stableKey} no es valida`,
        );
      }
      if (milestone.localTime) {
        civilDateTimeToUtc(
          milestone.localDate,
          milestone.localTime,
          milestone.timeZone,
        );
      }
      if (
        milestone.semantics ===
          ElectoralCalendarMilestoneSemantics.EXTERNAL_DEADLINE &&
        (!milestone.responsibleUserId ||
          !milestone.backupUserId ||
          milestone.responsibleUserId === milestone.backupUserId)
      ) {
        throw new BadRequestException(
          `El plazo externo ${milestone.stableKey} exige responsable y suplente diferentes`,
        );
      }
      if (
        milestone.stageGateRequired &&
        milestone.semantics !==
          ElectoralCalendarMilestoneSemantics.EXTERNAL_DEADLINE
      ) {
        throw new BadRequestException(
          'Solo un plazo externo configurado expresamente puede bloquear una etapa',
        );
      }
      if (milestone.responsibleUserId) userIds.add(milestone.responsibleUserId);
      if (milestone.backupUserId) userIds.add(milestone.backupUserId);
      if (milestone.linkedTaskId) taskIds.add(milestone.linkedTaskId);
      if (milestone.linkedEventId) eventIds.add(milestone.linkedEventId);
    }
    const [users, tasks, events] = await Promise.all([
      transaction.user.findMany({
        where: {
          tenantId,
          id: { in: [...userIds] },
          isActive: true,
          role: { in: [...RESPONSIBLE_ROLES] },
        },
        select: { id: true },
      }),
      transaction.task.findMany({
        where: {
          tenantId,
          id: { in: [...taskIds] },
          mode: PoliticalOperationMode.CAMPAIGN,
        },
        select: { id: true },
      }),
      transaction.campaignEvent.findMany({
        where: {
          tenantId,
          id: { in: [...eventIds] },
          mode: PoliticalOperationMode.CAMPAIGN,
        },
        select: { id: true },
      }),
    ]);
    if (
      users.length !== userIds.size ||
      tasks.length !== taskIds.size ||
      events.length !== eventIds.size
    ) {
      throw new BadRequestException(
        'Un responsable, tarea o evento no existe, no esta activo o pertenece a otro ambito',
      );
    }
  }

  private async assertReleaseReady(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    releaseId: string,
  ) {
    const release = await transaction.electoralCalendarRelease.findFirst({
      where: { id: releaseId, tenantId },
      select: {
        sourceUrl: true,
        sourceReference: true,
        sourceSha256: true,
        milestones: {
          select: {
            stableKey: true,
            localDate: true,
            localTime: true,
            timeZone: true,
            semantics: true,
            responsibleUserId: true,
            backupUserId: true,
            responsible: { select: { isActive: true } },
            backup: { select: { isActive: true } },
          },
        },
      },
    });
    if (!release || release.milestones.length === 0) {
      throw new ConflictException('La version necesita al menos un hito');
    }
    if (
      !release.sourceUrl.startsWith('https://') ||
      release.sourceReference.trim().length < 5 ||
      !SHA256.test(release.sourceSha256)
    ) {
      throw new ConflictException('La fuente versionada esta incompleta');
    }
    for (const milestone of release.milestones) {
      if (!isIanaTimeZone(milestone.timeZone)) {
        throw new ConflictException(
          `El hito ${milestone.stableKey} no tiene una zona IANA valida`,
        );
      }
      if (milestone.localTime) {
        civilDateTimeToUtc(
          this.isoDate(milestone.localDate),
          milestone.localTime,
          milestone.timeZone,
        );
      }
      if (
        milestone.semantics ===
          ElectoralCalendarMilestoneSemantics.EXTERNAL_DEADLINE &&
        (!milestone.responsibleUserId ||
          !milestone.backupUserId ||
          milestone.responsibleUserId === milestone.backupUserId ||
          !milestone.responsible?.isActive ||
          !milestone.backup?.isActive)
      ) {
        throw new ConflictException(
          `El plazo externo ${milestone.stableKey} no conserva dos responsables activos y distintos`,
        );
      }
    }
  }

  private releaseDiff(
    baseline: SelectedRelease | undefined,
    candidate: SelectedRelease,
  ) {
    const before = new Map(
      (baseline?.milestones ?? []).map((item) => [item.stableKey, item]),
    );
    const after = new Map(
      candidate.milestones.map((item) => [item.stableKey, item]),
    );
    const added = candidate.milestones
      .filter((item) => !before.has(item.stableKey))
      .map((item) => this.diffPoint(item));
    const removed = (baseline?.milestones ?? [])
      .filter((item) => !after.has(item.stableKey))
      .map((item) => this.diffPoint(item));
    const moved: Array<Record<string, unknown>> = [];
    const changed: Array<Record<string, unknown>> = [];
    for (const item of candidate.milestones) {
      const previous = before.get(item.stableKey);
      if (!previous) continue;
      if (
        this.isoDate(previous.localDate) !== this.isoDate(item.localDate) ||
        previous.localTime !== item.localTime ||
        previous.timeZone !== item.timeZone
      ) {
        moved.push({
          stableKey: item.stableKey,
          title: item.title,
          from: this.diffPoint(previous),
          to: this.diffPoint(item),
        });
      }
      if (
        previous.title !== item.title ||
        previous.category !== item.category ||
        previous.semantics !== item.semantics ||
        previous.applicabilityRule !== item.applicabilityRule ||
        previous.responsibleUserId !== item.responsibleUserId ||
        previous.backupUserId !== item.backupUserId ||
        previous.stageGateRequired !== item.stageGateRequired ||
        previous.resultEvidenceRequired !== item.resultEvidenceRequired ||
        JSON.stringify(previous.alertOffsetsDays) !==
          JSON.stringify(item.alertOffsetsDays)
      ) {
        changed.push({
          stableKey: item.stableKey,
          title: item.title,
          note: 'Cambio de contenido, semantica, responsables o control',
        });
      }
    }
    return {
      baselineReleaseId: baseline?.id ?? null,
      added,
      removed,
      moved,
      changed,
      hasChanges: Boolean(
        added.length || removed.length || moved.length || changed.length,
      ),
    };
  }

  private buildActiveSummary(release: SelectedRelease, evaluatedAt: Date) {
    const entries = release.milestones.map((milestone) => {
      const today = civilDateAt(evaluatedAt, milestone.timeZone);
      const daysRemaining = Math.round(
        (Date.parse(`${this.isoDate(milestone.localDate)}T00:00:00.000Z`) -
          Date.parse(`${today}T00:00:00.000Z`)) /
          86_400_000,
      );
      return {
        ...milestone,
        resolution: this.resolveMilestone(milestone),
        daysRemaining,
      };
    });
    const open = entries.filter((item) => !item.resolution.resolved);
    const groups = new Map<string, typeof entries>();
    for (const item of open.filter((entry) => entry.responsibleUserId)) {
      const key = `${item.responsibleUserId}:${this.isoDate(item.localDate)}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return {
      activeReleaseId: release.id,
      versionLabel: release.versionLabel,
      sourceCutoffAt: release.sourceCutoffAt,
      upcoming30Days: open.filter(
        (item) => item.daysRemaining >= 0 && item.daysRemaining <= 30,
      ),
      overdue: open.filter((item) => item.daysRemaining < 0),
      alertsDue: open.filter((item) =>
        item.alertOffsetsDays.includes(item.daysRemaining),
      ),
      potentialAssignmentConflicts: [...groups.values()]
        .filter((items) => items.length > 1)
        .map((items) => ({
          responsible: items[0].responsible,
          localDate: this.isoDate(items[0].localDate),
          milestoneIds: items.map((item) => item.id),
          note: 'Coincidencia potencial; el sistema no presume un choque horario.',
        })),
      unresolvedRequiredGates: open.filter((item) => item.stageGateRequired),
      notificationDeliveryClaimed: false,
    };
  }

  private resolveMilestone(milestone: SelectedMilestone) {
    const secondControl = SECOND_CONTROL_CATEGORIES.has(milestone.category);
    const effective = milestone.results.find(
      (result) =>
        !secondControl ||
        result.review?.decision ===
          ElectoralCalendarResultReviewDecision.APPROVE,
    );
    const pending = milestone.results.find((result) => !result.review);
    return {
      requiresSecondControl: secondControl,
      resolved: Boolean(effective),
      status: effective?.outcome ?? (pending ? 'PENDING_REVIEW' : 'OPEN'),
      effectiveResult: effective ?? null,
      pendingResult: pending ?? null,
    };
  }

  private diffPoint(milestone: SelectedMilestone) {
    return {
      stableKey: milestone.stableKey,
      title: milestone.title,
      localDate: this.isoDate(milestone.localDate),
      localTime: milestone.localTime,
      timeZone: milestone.timeZone,
    };
  }

  private assertProfileSnapshot(
    context: MutationContext,
    release: {
      operationProfileId: string;
      electionType: MutationContext['profile']['electionType'];
      electionDate: Date;
      circumscriptionType: MutationContext['profile']['circumscriptionType'];
      circumscriptionName: string;
      circumscriptionCode: string | null;
    },
  ) {
    if (
      release.operationProfileId !== context.profile.id ||
      release.electionType !== context.profile.electionType ||
      this.isoDate(release.electionDate) !==
        this.isoDate(context.profile.electionDate) ||
      release.circumscriptionType !== context.profile.circumscriptionType ||
      release.circumscriptionName !== context.profile.circumscriptionName ||
      release.circumscriptionCode !== context.profile.circumscriptionCode
    ) {
      throw new ConflictException({
        code: 'CALENDAR_PROFILE_CHANGED',
        message:
          'El perfil electoral cambio; esta version no puede validarse ni activarse',
      });
    }
  }

  private async lockRelease(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    releaseId: string,
  ) {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "ElectoralCalendarRelease" WHERE "id" = ${releaseId}::uuid AND "tenantId" = ${tenantId} FOR UPDATE`,
    );
    return this.loadReleaseRecord(transaction, tenantId, releaseId);
  }

  private async loadReleaseRecord(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const release = await transaction.electoralCalendarRelease.findFirst({
      where: { id, tenantId },
    });
    if (!release)
      throw new NotFoundException('Version de calendario no encontrada');
    return release;
  }

  private async loadRelease(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ): Promise<SelectedRelease> {
    const release = await transaction.electoralCalendarRelease.findFirst({
      where: { id, tenantId },
      select: RELEASE_SELECT,
    });
    if (!release)
      throw new NotFoundException('Version de calendario no encontrada');
    return release;
  }

  private async loadResult(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ): Promise<SelectedResult> {
    const result = await transaction.electoralCalendarMilestoneResult.findFirst(
      {
        where: { id, tenantId },
        select: RESULT_SELECT,
      },
    );
    if (!result) throw new NotFoundException('Resultado de hito no encontrado');
    return result;
  }

  private assertReleaseVersion(
    release: { version: number },
    expectedVersion: number,
  ) {
    if (release.version !== expectedVersion) this.concurrentChange();
  }

  private assertCommandIdentity(dto: {
    clientRequestId: string;
    payloadSha256: string;
  }) {
    if (!UUID_V4.test(dto.clientRequestId) || !SHA256.test(dto.payloadSha256)) {
      throw new BadRequestException(
        'El comando requiere clientRequestId UUID v4 y payloadSha256 valido',
      );
    }
  }

  private assertEvidencePair(path?: string, sha256?: string) {
    if (Boolean(path) !== Boolean(sha256)) {
      throw new BadRequestException(
        'La ruta de evidencia y su SHA-256 deben enviarse juntas',
      );
    }
  }

  private concurrentChange(): never {
    throw new ConflictException({
      code: 'CALENDAR_CONCURRENT_CHANGE',
      message:
        'El calendario cambio concurrentemente; recargue e intente de nuevo',
    });
  }

  private dateOnly(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('La fecha civil no es valida');
    }
    return date;
  }

  private isoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private isPrismaError(error: unknown, code: string) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }
}
