import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  ElectoralCatalogStatus,
  ElectoralCatalogType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  ScrutinyActionStatus,
  ScrutinyActionType,
  ScrutinyCommissionStatus,
  ScrutinyCommandType,
  ScrutinyCoverageStatus,
  ScrutinyDeclarationReviewDecision,
  ScrutinyDeclarationStatus,
  ScrutinyDecisionReviewStatus,
  ScrutinyDiscrepancyStatus,
  ScrutinyDocumentReviewDecision,
  ScrutinyDocumentReviewStatus,
  ScrutinyDocumentType,
  ScrutinyEvidenceState,
  ScrutinyRequirementApplicability,
  ScrutinySessionEventType,
  ScrutinyStandingType,
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
  AddScrutinyActionVersionDto,
  ApproveScrutinyActionDto,
  ConfigureScrutinyRequirementDto,
  CreateScrutinyActionDto,
  CreateScrutinyCommissionDto,
  CreateScrutinyCoverageDto,
  CreateScrutinyDeclarationDto,
  CreateScrutinyDiscrepancyDto,
  CreateScrutinyDocumentDto,
  FileScrutinyActionDto,
  ListScrutinyQueryDto,
  RecordScrutinyCustodyEventDto,
  RecordScrutinyDecisionDto,
  RecordScrutinySessionEventDto,
  ResolveScrutinyDiscrepancyDto,
  ReviewScrutinyDecisionDto,
  ReviewScrutinyDeclarationDto,
  ReviewScrutinyDocumentDto,
  type ScrutinyCommandDto,
} from './dto/scrutiny.dto';
import {
  buildScrutinyTemporalCoverage,
  type ScrutinyCommissionCoverageResult,
} from './scrutiny-coverage';
import {
  computeScrutinyCommandSha256,
  type ScrutinyCommandName,
} from './scrutiny.hash';

const READ_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];
const LEGAL_MUTATION_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
];
const FIELD_MUTATION_ROLES: readonly Role[] = [
  ...LEGAL_MUTATION_ROLES,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];
const MUTATION_STAGES = new Set<PoliticalOperationStage>([
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
]);
const READ_STAGES = new Set<PoliticalOperationStage>([
  ...MUTATION_STAGES,
  PoliticalOperationStage.CLOSED,
]);
const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;
const ESSENTIAL_DOCUMENT_TYPES: readonly ScrutinyDocumentType[] = [
  ScrutinyDocumentType.E14_CLAVEROS,
  ScrutinyDocumentType.E16_CREDENTIAL,
  ScrutinyDocumentType.E23,
  ScrutinyDocumentType.E24,
  ScrutinyDocumentType.E25,
  ScrutinyDocumentType.E26,
  ScrutinyDocumentType.GENERAL_ACT,
  ScrutinyDocumentType.RESOLUTION,
  ScrutinyDocumentType.NOTICE,
  ScrutinyDocumentType.DECLARATION_CREDENTIAL,
];
type Tx = Prisma.TransactionClient;
interface MutationContext {
  actor: { id: string; role: Role };
  profile: { id: string; stage: PoliticalOperationStage };
}
interface CommandResult<T> {
  resourceType: string;
  resourceId: string;
  result: T;
}

const COMMISSION_INCLUDE = {
  legalLead: { select: { id: true, name: true, role: true, isActive: true } },
  scopeDivision: {
    select: { id: true, code: true, name: true, type: true, isActive: true },
  },
  sourceRelease: {
    select: {
      id: true,
      catalogKey: true,
      status: true,
      electionDate: true,
      parserVersion: true,
    },
  },
  requirements: { orderBy: { documentType: 'asc' as const } },
  events: { orderBy: { receivedAt: 'asc' as const }, take: 100 },
  coverage: {
    orderBy: { shiftStartsAt: 'asc' as const },
    include: {
      witness: {
        select: { id: true, name: true, role: true, isActive: true },
      },
      credentialDocument: {
        select: {
          id: true,
          type: true,
          evidenceState: true,
          reviewStatus: true,
        },
      },
    },
  },
} satisfies Prisma.ScrutinyCommissionInclude;

const DOCUMENT_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  custodyEvents: { orderBy: { receivedAt: 'asc' as const }, take: 100 },
} satisfies Prisma.ScrutinyDocumentInclude;

const ACTION_INCLUDE = {
  draftedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  filedBy: { select: { id: true, name: true } },
  versions: { orderBy: { number: 'desc' as const }, take: 5 },
  decision: true,
  appeals: { select: { id: true, status: true, filingReference: true } },
} satisfies Prisma.ScrutinyActionInclude;

function parseDate(value: string, field: string): Date {
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) {
    throw new BadRequestException(`${field} no es una fecha valida`);
  }
  return result;
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class ScrutinyService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: AuthenticatedUser, query: ListScrutinyQueryDto) {
    return this.prisma.$transaction(
      async (transaction) => {
        const context = await this.assertReadContext(transaction, user);
        const limit = query.limit ?? 100;
        const [
          commissions,
          documents,
          discrepancies,
          actions,
          declarations,
          pendingDecisionReviews,
          participants,
        ] = await Promise.all([
          transaction.scrutinyCommission.findMany({
            where: {
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
            },
            orderBy: [{ scheduledStartsAt: 'asc' }, { code: 'asc' }],
            include: COMMISSION_INCLUDE,
            take: limit,
          }),
          transaction.scrutinyDocument.findMany({
            where: {
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
            },
            orderBy: { createdAt: 'desc' },
            include: DOCUMENT_INCLUDE,
            take: limit,
          }),
          transaction.scrutinyDiscrepancy.findMany({
            where: {
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
            },
            orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
            take: limit,
          }),
          transaction.scrutinyAction.findMany({
            where: {
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
              ...(query.actionStatus ? { status: query.actionStatus } : {}),
            },
            orderBy: [{ status: 'asc' }, { deadlineAt: 'asc' }],
            include: ACTION_INCLUDE,
            take: limit,
          }),
          transaction.scrutinyDeclaration.findMany({
            where: {
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
            },
            orderBy: { declaredAt: 'desc' },
            include: { lines: { orderBy: { optionCode: 'asc' } } },
            take: limit,
          }),
          transaction.scrutinyActionDecision.count({
            where: {
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
              reviewStatus: ScrutinyDecisionReviewStatus.PENDING,
            },
          }),
          transaction.user.findMany({
            where: {
              tenantId: user.tenantId,
              isActive: true,
              role: { in: [...FIELD_MUTATION_ROLES] },
            },
            select: { id: true, name: true, role: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: 500,
          }),
        ]);

        const coverage = buildScrutinyTemporalCoverage(
          commissions.map((commission) => ({
            id: commission.id,
            scheduledStartsAt: commission.scheduledStartsAt,
            scheduledEndsAt: commission.scheduledEndsAt,
            status: commission.status,
          })),
          commissions.flatMap((commission) =>
            commission.coverage.map((shift) => ({
              commissionId: commission.id,
              shiftStartsAt: shift.shiftStartsAt,
              shiftEndsAt: shift.shiftEndsAt,
              status: shift.status,
              witnessEligible:
                shift.witness.isActive && shift.witness.role === Role.WITNESS,
              credentialApproved:
                shift.credentialDocument.type ===
                  ScrutinyDocumentType.E16_CREDENTIAL &&
                shift.credentialDocument.reviewStatus ===
                  ScrutinyDocumentReviewStatus.APPROVED,
            })),
          ),
        );
        const readiness = this.buildReadiness(
          context.profile.stage,
          commissions,
          documents,
          discrepancies,
          actions,
          declarations,
          pendingDecisionReviews,
          coverage,
          new Date(),
        );

        return {
          operationStage: context.profile.stage,
          readOnly: context.profile.stage === PoliticalOperationStage.CLOSED,
          stateContract: {
            INTERNAL:
              'Captura o borrador del equipo; no acredita radicacion, decision ni resultado oficial.',
            FILED:
              'Actuacion presentada externamente con autoridad, fecha, canal, referencia y soporte revisado.',
            DECIDED:
              'Decision externa incorporada con documento y revision independiente.',
            OFFICIAL:
              'Dato tomado de una declaracion o credencial oficial aprobada; nunca se calcula ni se proyecta.',
          },
          readiness,
          commissions: commissions.map((commission) => ({
            ...commission,
            temporalCoverage: coverage.find(
              (item) => item.commissionId === commission.id,
            ),
          })),
          documents,
          discrepancies,
          actions,
          declarations,
          participants,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async listParticipants(
    user: AuthenticatedUser,
    query: { search?: string; page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      tenantId: user.tenantId,
      isActive: true,
      role: { in: [...FIELD_MUTATION_ROLES] },
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: { id: true, name: true, role: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createCommission(
    user: AuthenticatedUser,
    dto: CreateScrutinyCommissionDto,
  ) {
    const scheduledStartsAt = parseDate(
      dto.scheduledStartsAt,
      'scheduledStartsAt',
    );
    const scheduledEndsAt = parseDate(dto.scheduledEndsAt, 'scheduledEndsAt');
    if (scheduledEndsAt <= scheduledStartsAt) {
      throw new BadRequestException(
        'El cierre previsto debe ser posterior a la apertura prevista',
      );
    }

    return this.executeCommand(
      user,
      ScrutinyCommandType.COMMISSION_CREATE,
      dto,
      LEGAL_MUTATION_ROLES,
      `commission:${dto.code}`,
      async (transaction, context) => {
        const releases = await transaction.electoralCatalogRelease.findMany({
          where: {
            tenantId: user.tenantId,
            type: ElectoralCatalogType.ELECTORAL_RNEC,
            status: ElectoralCatalogStatus.ACTIVE,
          },
          select: { id: true, electionDate: true },
          take: 2,
        });
        if (releases.length !== 1) {
          throw new ConflictException(
            'Debe existir un unico release electoral RNEC activo antes de crear comisiones',
          );
        }
        const [release] = releases;

        if (dto.scopeDivisionId) {
          const scope = await transaction.politicalDivision.findFirst({
            where: {
              id: dto.scopeDivisionId,
              tenantId: user.tenantId,
              sourceReleaseId: release.id,
              isActive: true,
            },
            select: { id: true, code: true, name: true },
          });
          if (!scope) {
            throw new BadRequestException(
              'El ambito territorial no pertenece a la proyeccion electoral activa',
            );
          }
          if (scope.code !== dto.scopeCode || scope.name !== dto.scopeName) {
            throw new BadRequestException(
              'El codigo y nombre del ambito no coinciden con la division seleccionada',
            );
          }
        }

        await this.assertActiveUser(
          transaction,
          user.tenantId,
          dto.legalLeadUserId,
          LEGAL_MUTATION_ROLES,
          'El responsable juridico no esta activo o no tiene un rol habilitado',
        );

        const id = randomUUID();
        const commission = await transaction.scrutinyCommission.create({
          data: {
            id,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            sourceReleaseId: release.id,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            code: dto.code,
            level: dto.level,
            name: dto.name,
            scopeDivisionId: dto.scopeDivisionId,
            scopeCode: dto.scopeCode,
            scopeName: dto.scopeName,
            venue: dto.venue,
            timeZone: dto.timeZone,
            scheduledStartsAt,
            scheduledEndsAt,
            calendarSourceUrl: dto.calendarSourceUrl,
            calendarSourceReference: dto.calendarSourceReference,
            legalLeadUserId: dto.legalLeadUserId,
            escalationRoute: dto.escalationRoute,
            contingencyPlan: dto.contingencyPlan,
            offlineDrillAt: dto.offlineDrillAt
              ? parseDate(dto.offlineDrillAt, 'offlineDrillAt')
              : null,
            createdById: context.actor.id,
          },
          include: COMMISSION_INCLUDE,
        });

        await transaction.scrutinyDocumentRequirement.createMany({
          data: ESSENTIAL_DOCUMENT_TYPES.map((documentType) => ({
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            commissionId: id,
            documentType,
            applicability: ScrutinyRequirementApplicability.PENDING,
            rationale:
              'Pendiente de determinacion expresa por el responsable juridico para esta comision.',
            declaredById: context.actor.id,
          })),
        });

        const result = await transaction.scrutinyCommission.findFirstOrThrow({
          where: { id, tenantId: user.tenantId },
          include: COMMISSION_INCLUDE,
        });
        return {
          resourceType: 'ScrutinyCommission',
          resourceId: id,
          result: { ...result, initialSnapshot: commission.id },
        };
      },
    );
  }

  async configureRequirement(
    user: AuthenticatedUser,
    commissionId: string,
    dto: ConfigureScrutinyRequirementDto,
  ) {
    if (dto.applicability === ScrutinyRequirementApplicability.PENDING) {
      throw new BadRequestException(
        'La configuracion debe decidir entre REQUIRED y NOT_APPLICABLE',
      );
    }
    return this.executeCommand(
      user,
      ScrutinyCommandType.REQUIREMENT_CONFIGURE,
      { ...dto, commissionId },
      LEGAL_MUTATION_ROLES,
      `commission:${commissionId}`,
      async (transaction, context) => {
        const requirement =
          await transaction.scrutinyDocumentRequirement.findFirst({
            where: {
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
              commissionId,
              documentType: dto.documentType,
            },
          });
        if (!requirement) {
          throw new NotFoundException('Requisito documental no encontrado');
        }
        if (requirement.version !== dto.expectedVersion) {
          throw this.versionConflict();
        }

        const updated =
          await transaction.scrutinyDocumentRequirement.updateMany({
            where: {
              id: requirement.id,
              tenantId: user.tenantId,
              version: dto.expectedVersion,
            },
            data: {
              applicability: dto.applicability,
              rationale: dto.rationale,
              declaredById: context.actor.id,
              version: { increment: 1 },
            },
          });
        if (updated.count !== 1) throw this.versionConflict();
        const result =
          await transaction.scrutinyDocumentRequirement.findFirstOrThrow({
            where: { id: requirement.id, tenantId: user.tenantId },
          });
        return {
          resourceType: 'ScrutinyDocumentRequirement',
          resourceId: result.id,
          result,
        };
      },
    );
  }

  async recordSessionEvent(
    user: AuthenticatedUser,
    commissionId: string,
    dto: RecordScrutinySessionEventDto,
  ) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.SESSION_EVENT_RECORD,
      { ...dto, commissionId },
      FIELD_MUTATION_ROLES,
      `commission:${commissionId}`,
      async (transaction, context) => {
        const commission = await transaction.scrutinyCommission.findFirst({
          where: {
            id: commissionId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
        });
        if (!commission) throw new NotFoundException('Comision no encontrada');
        if (commission.version !== dto.expectedVersion) {
          throw this.versionConflict();
        }
        const status = this.nextCommissionStatus(commission.status, dto.type);
        const event = await transaction.scrutinyCommissionEvent.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            commissionId,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            type: dto.type,
            occurredAt: parseDate(dto.occurredAt, 'occurredAt'),
            notes: dto.notes,
            actorUserId: context.actor.id,
          },
        });
        const updated = await transaction.scrutinyCommission.updateMany({
          where: {
            id: commissionId,
            tenantId: user.tenantId,
            version: dto.expectedVersion,
          },
          data: { status, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw this.versionConflict();
        return {
          resourceType: 'ScrutinyCommissionEvent',
          resourceId: event.id,
          result: event,
        };
      },
    );
  }

  async createDocument(
    user: AuthenticatedUser,
    dto: CreateScrutinyDocumentDto,
  ) {
    this.assertExternalDocumentMetadata(dto);
    return this.executeCommand(
      user,
      ScrutinyCommandType.DOCUMENT_CREATE,
      dto,
      LEGAL_MUTATION_ROLES,
      `document:${dto.storagePath}`,
      async (transaction, context) => {
        await this.requireCommission(
          transaction,
          user.tenantId,
          context.profile.id,
          dto.commissionId,
        );

        if (dto.supersedesDocumentId) {
          const previous = await transaction.scrutinyDocument.findFirst({
            where: {
              id: dto.supersedesDocumentId,
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
              commissionId: dto.commissionId,
              type: dto.type,
              supersededBy: null,
            },
            select: { id: true },
          });
          if (!previous) {
            throw new BadRequestException(
              'El documento reemplazado no es una version vigente del mismo tipo y comision',
            );
          }
        }

        const stored = await transaction.storedObject.findFirst({
          where: {
            tenantId: user.tenantId,
            uploaderId: context.actor.id,
            path: dto.storagePath,
            module: StorageObjectModule.SCRUTINY,
            status: StoredObjectStatus.CONFIRMED,
            consumedAt: null,
            expectedSha256: dto.sha256,
            reportedSha256: dto.sha256,
            actualSize: dto.size,
            contentType: dto.contentType,
          },
          select: { id: true },
        });
        if (!stored) {
          throw new BadRequestException(
            'El archivo debe haberse subido directamente, estar confirmado y coincidir con el SHA declarado por el cliente, el tamano y el tipo registrados',
          );
        }

        const id = randomUUID();
        await consumeConfirmedStorageUpload(
          transaction,
          user.tenantId,
          dto.storagePath,
          StorageObjectModule.SCRUTINY,
          'ScrutinyDocument',
          id,
          context.actor.id,
          { expectedSha256: dto.sha256 },
        );

        const document = await transaction.scrutinyDocument.create({
          data: {
            id,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            commissionId: dto.commissionId,
            storedObjectId: stored.id,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            type: dto.type,
            evidenceState: dto.evidenceState,
            storagePath: dto.storagePath,
            sha256: dto.sha256,
            size: dto.size,
            contentType: dto.contentType,
            declaredIssuer: dto.declaredIssuer,
            authorityInstance: dto.authorityInstance,
            versionLabel: dto.versionLabel,
            cutoffAt: parseDate(dto.cutoffAt, 'cutoffAt'),
            externalAt: dto.externalAt
              ? parseDate(dto.externalAt, 'externalAt')
              : null,
            externalChannel: dto.externalChannel,
            externalReference: dto.externalReference,
            supersedesDocumentId: dto.supersedesDocumentId,
            createdById: context.actor.id,
          },
          include: DOCUMENT_INCLUDE,
        });
        return {
          resourceType: 'ScrutinyDocument',
          resourceId: document.id,
          result: document,
        };
      },
    );
  }

  async reviewDocument(
    user: AuthenticatedUser,
    documentId: string,
    dto: ReviewScrutinyDocumentDto,
  ) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.DOCUMENT_REVIEW,
      { ...dto, documentId },
      LEGAL_MUTATION_ROLES,
      `document:${documentId}`,
      async (transaction, context) => {
        const document = await transaction.scrutinyDocument.findFirst({
          where: {
            id: documentId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
        });
        if (!document) throw new NotFoundException('Documento no encontrado');
        if (document.version !== dto.expectedVersion) {
          throw this.versionConflict();
        }
        if (document.reviewStatus !== ScrutinyDocumentReviewStatus.PENDING) {
          throw new ConflictException(
            'La revision documental ya es definitiva',
          );
        }
        if (document.createdById === context.actor.id) {
          throw new ForbiddenException(
            'Quien incorporo el documento no puede aprobar su propia evidencia',
          );
        }
        const reviewStatus =
          dto.decision === ScrutinyDocumentReviewDecision.APPROVE
            ? ScrutinyDocumentReviewStatus.APPROVED
            : ScrutinyDocumentReviewStatus.REJECTED;
        const updated = await transaction.scrutinyDocument.updateMany({
          where: {
            id: documentId,
            tenantId: user.tenantId,
            version: dto.expectedVersion,
            reviewStatus: ScrutinyDocumentReviewStatus.PENDING,
          },
          data: {
            reviewStatus,
            reviewedById: context.actor.id,
            reviewedAt: new Date(),
            reviewReason: dto.reason,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw this.versionConflict();
        const result = await transaction.scrutinyDocument.findFirstOrThrow({
          where: { id: documentId, tenantId: user.tenantId },
          include: DOCUMENT_INCLUDE,
        });
        return {
          resourceType: 'ScrutinyDocument',
          resourceId: documentId,
          result,
        };
      },
    );
  }

  async createCoverage(
    user: AuthenticatedUser,
    commissionId: string,
    dto: CreateScrutinyCoverageDto,
  ) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.COVERAGE_CREATE,
      { ...dto, commissionId },
      LEGAL_MUTATION_ROLES,
      `commission:${commissionId}`,
      async (transaction, context) => {
        const commission = await this.requireCommission(
          transaction,
          user.tenantId,
          context.profile.id,
          commissionId,
        );
        if (commission.status === ScrutinyCommissionStatus.CLOSED) {
          throw new ConflictException(
            'No se puede planificar cobertura despues del cierre de la audiencia',
          );
        }
        const document = await transaction.scrutinyDocument.findFirst({
          where: {
            id: dto.credentialDocumentId,
            tenantId: user.tenantId,
            commissionId,
            type: ScrutinyDocumentType.E16_CREDENTIAL,
            reviewStatus: ScrutinyDocumentReviewStatus.APPROVED,
          },
          select: { id: true },
        });
        if (!document) {
          throw new BadRequestException(
            'La cobertura exige una credencial E-16 de la misma comision, revisada y aprobada',
          );
        }
        await this.assertActiveUser(
          transaction,
          user.tenantId,
          dto.witnessId,
          [Role.WITNESS],
          'El testigo debe ser una identidad WITNESS activa de la organizacion',
        );

        const validFrom = parseDate(dto.validFrom, 'validFrom');
        const validUntil = parseDate(dto.validUntil, 'validUntil');
        const shiftStartsAt = parseDate(dto.shiftStartsAt, 'shiftStartsAt');
        const shiftEndsAt = parseDate(dto.shiftEndsAt, 'shiftEndsAt');
        if (
          validUntil <= validFrom ||
          shiftEndsAt <= shiftStartsAt ||
          shiftStartsAt < validFrom ||
          shiftEndsAt > validUntil ||
          shiftStartsAt < commission.scheduledStartsAt ||
          shiftEndsAt > commission.scheduledEndsAt
        ) {
          throw new BadRequestException(
            'La vigencia y el turno E-16 deben cubrir una franja valida dentro de la audiencia',
          );
        }
        if (dto.status === ScrutinyCoverageStatus.CANCELLED) {
          throw new BadRequestException(
            'No se puede crear una cobertura ya cancelada',
          );
        }
        const coverage = await transaction.scrutinyCommissionCoverage.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            commissionId,
            witnessId: dto.witnessId,
            credentialDocumentId: dto.credentialDocumentId,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            credentialReference: dto.credentialReference,
            validFrom,
            validUntil,
            shiftStartsAt,
            shiftEndsAt,
            status: dto.status ?? ScrutinyCoverageStatus.CONFIRMED,
            createdById: context.actor.id,
          },
          include: {
            witness: {
              select: { id: true, name: true, role: true, isActive: true },
            },
            credentialDocument: {
              select: {
                id: true,
                type: true,
                evidenceState: true,
                reviewStatus: true,
              },
            },
          },
        });
        return {
          resourceType: 'ScrutinyCommissionCoverage',
          resourceId: coverage.id,
          result: coverage,
        };
      },
    );
  }

  async recordCustodyEvent(
    user: AuthenticatedUser,
    documentId: string,
    dto: RecordScrutinyCustodyEventDto,
  ) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.CUSTODY_EVENT_RECORD,
      { ...dto, documentId },
      FIELD_MUTATION_ROLES,
      `document:${documentId}`,
      async (transaction, context) => {
        await this.requireDocument(
          transaction,
          user.tenantId,
          context.profile.id,
          documentId,
        );
        const event = await transaction.scrutinyCustodyEvent.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            documentId,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            type: dto.type,
            occurredAt: parseDate(dto.occurredAt, 'occurredAt'),
            fromCustodian: dto.fromCustodian,
            toCustodian: dto.toCustodian,
            notes: dto.notes,
            actorUserId: context.actor.id,
          },
        });
        return {
          resourceType: 'ScrutinyCustodyEvent',
          resourceId: event.id,
          result: event,
        };
      },
    );
  }

  async createDiscrepancy(
    user: AuthenticatedUser,
    dto: CreateScrutinyDiscrepancyDto,
  ) {
    if (dto.sourceDocumentId === dto.comparisonDocumentId) {
      throw new BadRequestException('La comparacion requiere dos documentos');
    }
    if (dto.sourceValue === dto.comparisonValue) {
      throw new BadRequestException(
        'Los valores son iguales; no existe una diferencia que registrar',
      );
    }
    return this.executeCommand(
      user,
      ScrutinyCommandType.DISCREPANCY_CREATE,
      dto,
      LEGAL_MUTATION_ROLES,
      `commission:${dto.commissionId}`,
      async (transaction, context) => {
        await this.requireCommission(
          transaction,
          user.tenantId,
          context.profile.id,
          dto.commissionId,
        );
        for (const documentId of [
          dto.sourceDocumentId,
          dto.comparisonDocumentId,
        ]) {
          const document = await transaction.scrutinyDocument.findFirst({
            where: {
              id: documentId,
              tenantId: user.tenantId,
              commissionId: dto.commissionId,
              reviewStatus: ScrutinyDocumentReviewStatus.APPROVED,
            },
            select: { id: true },
          });
          if (!document) {
            throw new BadRequestException(
              'Ambas fuentes deben pertenecer a la comision y estar aprobadas por segunda persona',
            );
          }
        }
        await this.assertActiveUser(
          transaction,
          user.tenantId,
          dto.responsibleUserId,
          FIELD_MUTATION_ROLES,
          'El responsable de la diferencia no tiene acceso vigente',
        );
        const discrepancy = await transaction.scrutinyDiscrepancy.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            commissionId: dto.commissionId,
            sourceDocumentId: dto.sourceDocumentId,
            comparisonDocumentId: dto.comparisonDocumentId,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            scopeReference: dto.scopeReference,
            candidacyReference: dto.candidacyReference,
            sourceValue: dto.sourceValue,
            comparisonValue: dto.comparisonValue,
            classification: dto.classification,
            severity: dto.severity,
            responsibleUserId: dto.responsibleUserId,
            dueAt: parseDate(dto.dueAt, 'dueAt'),
            createdById: context.actor.id,
          },
        });
        return {
          resourceType: 'ScrutinyDiscrepancy',
          resourceId: discrepancy.id,
          result: discrepancy,
        };
      },
    );
  }

  async resolveDiscrepancy(
    user: AuthenticatedUser,
    discrepancyId: string,
    dto: ResolveScrutinyDiscrepancyDto,
  ) {
    if (
      dto.status !== ScrutinyDiscrepancyStatus.EXPLAINED &&
      dto.status !== ScrutinyDiscrepancyStatus.DISMISSED
    ) {
      throw new BadRequestException(
        'La resolucion final debe indicar EXPLAINED o DISMISSED',
      );
    }
    return this.executeCommand(
      user,
      ScrutinyCommandType.DISCREPANCY_RESOLVE,
      { ...dto, discrepancyId },
      LEGAL_MUTATION_ROLES,
      `discrepancy:${discrepancyId}`,
      async (transaction, context) => {
        const discrepancy = await transaction.scrutinyDiscrepancy.findFirst({
          where: {
            id: discrepancyId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
        });
        if (!discrepancy) {
          throw new NotFoundException('Diferencia no encontrada');
        }
        if (discrepancy.version !== dto.expectedVersion) {
          throw this.versionConflict();
        }
        if (
          discrepancy.status !== ScrutinyDiscrepancyStatus.OPEN &&
          discrepancy.status !== ScrutinyDiscrepancyStatus.UNDER_REVIEW
        ) {
          throw new ConflictException(
            'La diferencia ya tiene cierre documentado',
          );
        }
        const resolutionDocument = await transaction.scrutinyDocument.findFirst(
          {
            where: {
              id: dto.resolutionDocumentId,
              tenantId: user.tenantId,
              commissionId: discrepancy.commissionId,
              reviewStatus: ScrutinyDocumentReviewStatus.APPROVED,
              evidenceState: {
                in: [
                  ScrutinyEvidenceState.DECIDED,
                  ScrutinyEvidenceState.OFFICIAL,
                ],
              },
            },
            select: { id: true },
          },
        );
        if (!resolutionDocument) {
          throw new BadRequestException(
            'La explicacion requiere un acto decidido u oficial, revisado y de la misma comision',
          );
        }
        const updated = await transaction.scrutinyDiscrepancy.updateMany({
          where: {
            id: discrepancyId,
            tenantId: user.tenantId,
            version: dto.expectedVersion,
          },
          data: {
            status: dto.status,
            resolution: dto.resolution,
            resolutionDocumentId: dto.resolutionDocumentId,
            resolvedById: context.actor.id,
            resolvedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw this.versionConflict();
        const result = await transaction.scrutinyDiscrepancy.findFirstOrThrow({
          where: { id: discrepancyId, tenantId: user.tenantId },
        });
        return {
          resourceType: 'ScrutinyDiscrepancy',
          resourceId: discrepancyId,
          result,
        };
      },
    );
  }

  async createAction(user: AuthenticatedUser, dto: CreateScrutinyActionDto) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.ACTION_CREATE,
      dto,
      LEGAL_MUTATION_ROLES,
      `commission:${dto.commissionId}`,
      async (transaction, context) => {
        await this.requireCommission(
          transaction,
          user.tenantId,
          context.profile.id,
          dto.commissionId,
        );
        if (dto.type === ScrutinyActionType.APPEAL) {
          if (!dto.parentActionId) {
            throw new BadRequestException(
              'Un recurso debe identificar la actuacion decidida que impugna',
            );
          }
          const parent = await transaction.scrutinyAction.findFirst({
            where: {
              id: dto.parentActionId,
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
              commissionId: dto.commissionId,
              status: ScrutinyActionStatus.DECIDED_EXTERNAL,
              decision: {
                is: { reviewStatus: ScrutinyDecisionReviewStatus.APPROVED },
              },
            },
            select: { id: true },
          });
          if (!parent) {
            throw new BadRequestException(
              'El recurso solo puede enlazarse a una decision externa incorporada y aprobada',
            );
          }
        } else if (dto.parentActionId) {
          throw new BadRequestException(
            'Solo una actuacion de tipo APPEAL puede tener actuacion padre',
          );
        }

        if (dto.standingType === ScrutinyStandingType.ACCREDITED_WITNESS) {
          if (!dto.accreditedCoverageId) {
            throw new BadRequestException(
              'La legitimacion como testigo exige la cobertura E-16 exacta',
            );
          }
          const coverage =
            await transaction.scrutinyCommissionCoverage.findFirst({
              where: {
                id: dto.accreditedCoverageId,
                tenantId: user.tenantId,
                commissionId: dto.commissionId,
                status: ScrutinyCoverageStatus.CONFIRMED,
                credentialDocument: {
                  is: {
                    type: ScrutinyDocumentType.E16_CREDENTIAL,
                    reviewStatus: ScrutinyDocumentReviewStatus.APPROVED,
                  },
                },
              },
              select: { id: true },
            });
          if (!coverage) {
            throw new BadRequestException(
              'La cobertura E-16 no acredita a un testigo vigente para esta comision',
            );
          }
        } else if (dto.accreditedCoverageId) {
          throw new BadRequestException(
            'La cobertura E-16 solo corresponde a legitimacion ACCREDITED_WITNESS',
          );
        }

        const id = randomUUID();
        const action = await transaction.scrutinyAction.create({
          data: {
            id,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            commissionId: dto.commissionId,
            parentActionId: dto.parentActionId,
            accreditedCoverageId: dto.accreditedCoverageId,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            type: dto.type,
            standingType: dto.standingType,
            standingBasis: dto.standingBasis,
            legalGroundCode: dto.legalGroundCode,
            legalGroundVersion: dto.legalGroundVersion,
            legalGroundSourceUrl: dto.legalGroundSourceUrl,
            facts: dto.facts,
            legalBasis: dto.legalBasis,
            affectedReferences: dto.affectedReferences,
            authority: dto.authority,
            deadlineAt: parseDate(dto.deadlineAt, 'deadlineAt'),
            deadlineRule: dto.deadlineRule,
            timeZone: dto.timeZone,
            draftedById: context.actor.id,
          },
        });
        await transaction.scrutinyActionVersion.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            actionId: id,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            number: 1,
            text: dto.text,
            textSha256: this.sha256(dto.text),
            createdById: context.actor.id,
          },
        });
        const result = await transaction.scrutinyAction.findFirstOrThrow({
          where: { id: action.id, tenantId: user.tenantId },
          include: ACTION_INCLUDE,
        });
        return {
          resourceType: 'ScrutinyAction',
          resourceId: id,
          result,
        };
      },
    );
  }

  async addActionVersion(
    user: AuthenticatedUser,
    actionId: string,
    dto: AddScrutinyActionVersionDto,
  ) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.ACTION_VERSION_ADD,
      { ...dto, actionId },
      LEGAL_MUTATION_ROLES,
      `action:${actionId}`,
      async (transaction, context) => {
        const action = await this.requireAction(
          transaction,
          user.tenantId,
          context.profile.id,
          actionId,
        );
        if (
          action.version !== dto.expectedVersion ||
          action.status !== ScrutinyActionStatus.DRAFT
        ) {
          throw this.versionConflict(
            'Solo el borrador vigente puede recibir una nueva version',
          );
        }
        const number = action.currentVersion + 1;
        const version = await transaction.scrutinyActionVersion.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            actionId,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            number,
            text: dto.text,
            textSha256: this.sha256(dto.text),
            createdById: context.actor.id,
          },
        });
        const updated = await transaction.scrutinyAction.updateMany({
          where: {
            id: actionId,
            tenantId: user.tenantId,
            status: ScrutinyActionStatus.DRAFT,
            version: dto.expectedVersion,
          },
          data: {
            currentVersion: { increment: 1 },
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw this.versionConflict();
        return {
          resourceType: 'ScrutinyActionVersion',
          resourceId: version.id,
          result: version,
        };
      },
    );
  }

  async approveAction(
    user: AuthenticatedUser,
    actionId: string,
    dto: ApproveScrutinyActionDto,
  ) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.ACTION_APPROVE,
      { ...dto, actionId },
      LEGAL_MUTATION_ROLES,
      `action:${actionId}`,
      async (transaction, context) => {
        const action = await this.requireAction(
          transaction,
          user.tenantId,
          context.profile.id,
          actionId,
        );
        if (
          action.version !== dto.expectedVersion ||
          action.status !== ScrutinyActionStatus.DRAFT
        ) {
          throw this.versionConflict('El borrador ya cambio o dejo de serlo');
        }
        if (action.draftedById === context.actor.id) {
          throw new ForbiddenException(
            'Quien redacto la actuacion no puede aprobarla',
          );
        }
        const updated = await transaction.scrutinyAction.updateMany({
          where: {
            id: actionId,
            tenantId: user.tenantId,
            status: ScrutinyActionStatus.DRAFT,
            version: dto.expectedVersion,
          },
          data: {
            status: ScrutinyActionStatus.APPROVED_INTERNAL,
            approvedById: context.actor.id,
            approvedAt: new Date(),
            approvalNote: dto.reviewNote,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw this.versionConflict();
        const result = await transaction.scrutinyAction.findFirstOrThrow({
          where: { id: actionId, tenantId: user.tenantId },
          include: ACTION_INCLUDE,
        });
        return {
          resourceType: 'ScrutinyAction',
          resourceId: actionId,
          result,
        };
      },
    );
  }

  async fileAction(
    user: AuthenticatedUser,
    actionId: string,
    dto: FileScrutinyActionDto,
  ) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.ACTION_FILE,
      { ...dto, actionId },
      LEGAL_MUTATION_ROLES,
      `action:${actionId}`,
      async (transaction, context) => {
        const action = await this.requireAction(
          transaction,
          user.tenantId,
          context.profile.id,
          actionId,
        );
        if (
          action.version !== dto.expectedVersion ||
          action.status !== ScrutinyActionStatus.APPROVED_INTERNAL
        ) {
          throw this.versionConflict(
            'La actuacion debe estar aprobada internamente y en la version abierta',
          );
        }
        if (
          context.actor.id === action.draftedById ||
          context.actor.id === action.approvedById
        ) {
          throw new ForbiddenException(
            'Quien redacto o aprobo no puede registrar la radicacion externa',
          );
        }
        await this.requireApprovedDocument(
          transaction,
          user.tenantId,
          dto.supportDocumentId,
          action.commissionId,
          [ScrutinyEvidenceState.FILED],
        );
        const updated = await transaction.scrutinyAction.updateMany({
          where: {
            id: actionId,
            tenantId: user.tenantId,
            status: ScrutinyActionStatus.APPROVED_INTERNAL,
            version: dto.expectedVersion,
          },
          data: {
            status: ScrutinyActionStatus.FILED_EXTERNAL,
            filedById: context.actor.id,
            filedAt: parseDate(dto.filedAt, 'filedAt'),
            filingChannel: dto.channel,
            filingReference: dto.filingReference,
            filingDocumentId: dto.supportDocumentId,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw this.versionConflict();

        if (
          action.type === ScrutinyActionType.APPEAL &&
          action.parentActionId
        ) {
          const parent = await transaction.scrutinyAction.findFirst({
            where: {
              id: action.parentActionId,
              tenantId: user.tenantId,
              operationProfileId: context.profile.id,
            },
            select: { status: true, version: true },
          });
          if (parent?.status === ScrutinyActionStatus.DECIDED_EXTERNAL) {
            await transaction.scrutinyAction.updateMany({
              where: {
                id: action.parentActionId,
                tenantId: user.tenantId,
                status: ScrutinyActionStatus.DECIDED_EXTERNAL,
                version: parent.version,
              },
              data: {
                status: ScrutinyActionStatus.APPEALED_EXTERNAL,
                version: { increment: 1 },
              },
            });
          }
        }

        const result = await transaction.scrutinyAction.findFirstOrThrow({
          where: { id: actionId, tenantId: user.tenantId },
          include: ACTION_INCLUDE,
        });
        return {
          resourceType: 'ScrutinyAction',
          resourceId: actionId,
          result,
        };
      },
    );
  }

  async recordDecision(
    user: AuthenticatedUser,
    actionId: string,
    dto: RecordScrutinyDecisionDto,
  ) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.DECISION_RECORD,
      { ...dto, actionId },
      LEGAL_MUTATION_ROLES,
      `action:${actionId}`,
      async (transaction, context) => {
        const action = await this.requireAction(
          transaction,
          user.tenantId,
          context.profile.id,
          actionId,
        );
        if (
          action.version !== dto.expectedVersion ||
          action.status !== ScrutinyActionStatus.FILED_EXTERNAL
        ) {
          throw this.versionConflict(
            'Solo una actuacion radicada y vigente puede recibir decision',
          );
        }
        await this.requireApprovedDocument(
          transaction,
          user.tenantId,
          dto.decisionDocumentId,
          action.commissionId,
          [ScrutinyEvidenceState.DECIDED, ScrutinyEvidenceState.OFFICIAL],
        );
        if (dto.notificationDocumentId) {
          await this.requireApprovedDocument(
            transaction,
            user.tenantId,
            dto.notificationDocumentId,
            action.commissionId,
            [ScrutinyEvidenceState.DECIDED, ScrutinyEvidenceState.OFFICIAL],
          );
        }
        if (Boolean(dto.notifiedAt) !== Boolean(dto.notificationDocumentId)) {
          throw new BadRequestException(
            'La notificacion requiere tanto fecha como documento, o ninguno de los dos',
          );
        }
        const decision = await transaction.scrutinyActionDecision.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            actionId,
            decisionDocumentId: dto.decisionDocumentId,
            notificationDocumentId: dto.notificationDocumentId,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            outcome: dto.outcome,
            authority: dto.authority,
            decidedAt: parseDate(dto.decidedAt, 'decidedAt'),
            notifiedAt: dto.notifiedAt
              ? parseDate(dto.notifiedAt, 'notifiedAt')
              : null,
            reasoning: dto.reasoning,
            recordedById: context.actor.id,
          },
        });
        return {
          resourceType: 'ScrutinyActionDecision',
          resourceId: decision.id,
          result: decision,
        };
      },
    );
  }

  async reviewDecision(
    user: AuthenticatedUser,
    decisionId: string,
    dto: ReviewScrutinyDecisionDto,
  ) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.DECISION_REVIEW,
      { ...dto, decisionId },
      LEGAL_MUTATION_ROLES,
      `decision:${decisionId}`,
      async (transaction, context) => {
        const decision = await transaction.scrutinyActionDecision.findFirst({
          where: {
            id: decisionId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
          include: { action: true },
        });
        if (!decision) throw new NotFoundException('Decision no encontrada');
        if (
          decision.reviewStatus !== ScrutinyDecisionReviewStatus.PENDING ||
          decision.version !== dto.expectedVersion
        ) {
          throw this.versionConflict('La decision ya fue revisada o cambio');
        }
        if (decision.recordedById === context.actor.id) {
          throw new ForbiddenException(
            'Quien incorporo la decision no puede aprobarla',
          );
        }
        const reviewStatus =
          dto.decision === ScrutinyDocumentReviewDecision.APPROVE
            ? ScrutinyDecisionReviewStatus.APPROVED
            : ScrutinyDecisionReviewStatus.REJECTED;
        const updated = await transaction.scrutinyActionDecision.updateMany({
          where: {
            id: decisionId,
            tenantId: user.tenantId,
            reviewStatus: ScrutinyDecisionReviewStatus.PENDING,
            version: dto.expectedVersion,
          },
          data: {
            reviewStatus,
            reviewedById: context.actor.id,
            reviewedAt: new Date(),
            reviewNote: dto.reviewNote,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw this.versionConflict();

        if (reviewStatus === ScrutinyDecisionReviewStatus.APPROVED) {
          const actionUpdate = await transaction.scrutinyAction.updateMany({
            where: {
              id: decision.actionId,
              tenantId: user.tenantId,
              status: ScrutinyActionStatus.FILED_EXTERNAL,
              version: decision.action.version,
            },
            data: {
              status: ScrutinyActionStatus.DECIDED_EXTERNAL,
              version: { increment: 1 },
            },
          });
          if (actionUpdate.count !== 1) {
            throw this.versionConflict(
              'La actuacion cambio mientras se aprobaba la decision',
            );
          }
        }
        const result =
          await transaction.scrutinyActionDecision.findFirstOrThrow({
            where: { id: decisionId, tenantId: user.tenantId },
          });
        return {
          resourceType: 'ScrutinyActionDecision',
          resourceId: decisionId,
          result,
        };
      },
    );
  }

  async createDeclaration(
    user: AuthenticatedUser,
    dto: CreateScrutinyDeclarationDto,
  ) {
    const optionCodes = new Set(dto.lines.map(({ optionCode }) => optionCode));
    if (optionCodes.size !== dto.lines.length) {
      throw new BadRequestException(
        'Cada opcion declarada debe aparecer una sola vez',
      );
    }
    if (dto.lines.some((line) => line.votes == null && line.seats == null)) {
      throw new BadRequestException(
        'Cada linea oficial debe contener votos, curules o ambos',
      );
    }
    return this.executeCommand(
      user,
      ScrutinyCommandType.DECLARATION_CREATE,
      dto,
      LEGAL_MUTATION_ROLES,
      `declaration:${dto.scopeReference}`,
      async (transaction, context) => {
        if (dto.commissionId) {
          await this.requireCommission(
            transaction,
            user.tenantId,
            context.profile.id,
            dto.commissionId,
          );
        }
        const officialDocument = await transaction.scrutinyDocument.findFirst({
          where: {
            id: dto.officialDocumentId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            ...(dto.commissionId ? { commissionId: dto.commissionId } : {}),
            type: {
              in: [
                ScrutinyDocumentType.DECLARATION_CREDENTIAL,
                ScrutinyDocumentType.RESOLUTION,
              ],
            },
            evidenceState: ScrutinyEvidenceState.OFFICIAL,
            reviewStatus: ScrutinyDocumentReviewStatus.APPROVED,
          },
          select: { id: true },
        });
        if (!officialDocument) {
          throw new BadRequestException(
            'El resultado exige una declaracion, credencial o resolucion oficial revisada; un dato interno no sirve',
          );
        }
        const id = randomUUID();
        await transaction.scrutinyDeclaration.create({
          data: {
            id,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            commissionId: dto.commissionId,
            officialDocumentId: dto.officialDocumentId,
            clientRequestId: dto.clientRequestId,
            payloadSha256: dto.payloadSha256,
            scopeReference: dto.scopeReference,
            authority: dto.authority,
            authorityReference: dto.authorityReference,
            declaredAt: parseDate(dto.declaredAt, 'declaredAt'),
            recordedById: context.actor.id,
          },
        });
        await transaction.scrutinyDeclaredResultLine.createMany({
          data: dto.lines.map((line) => ({
            id: randomUUID(),
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
            declarationId: id,
            optionCode: line.optionCode,
            optionLabel: line.optionLabel,
            votes: line.votes,
            seats: line.seats,
            declaredStatus: line.declaredStatus,
          })),
        });
        const declaration =
          await transaction.scrutinyDeclaration.findFirstOrThrow({
            where: { id, tenantId: user.tenantId },
            include: { lines: { orderBy: { optionCode: 'asc' } } },
          });
        return {
          resourceType: 'ScrutinyDeclaration',
          resourceId: id,
          result: declaration,
        };
      },
    );
  }

  async reviewDeclaration(
    user: AuthenticatedUser,
    declarationId: string,
    dto: ReviewScrutinyDeclarationDto,
  ) {
    return this.executeCommand(
      user,
      ScrutinyCommandType.DECLARATION_REVIEW,
      { ...dto, declarationId },
      LEGAL_MUTATION_ROLES,
      `declaration:${declarationId}`,
      async (transaction, context) => {
        const declaration = await transaction.scrutinyDeclaration.findFirst({
          where: {
            id: declarationId,
            tenantId: user.tenantId,
            operationProfileId: context.profile.id,
          },
          include: { officialDocument: true },
        });
        if (!declaration) {
          throw new NotFoundException('Declaracion no encontrada');
        }
        if (
          declaration.status !== ScrutinyDeclarationStatus.DRAFT_INTERNAL ||
          declaration.version !== dto.expectedVersion
        ) {
          throw this.versionConflict('La declaracion ya fue revisada o cambio');
        }
        if (declaration.recordedById === context.actor.id) {
          throw new ForbiddenException(
            'Quien transcribio el resultado no puede aprobarlo',
          );
        }
        if (
          declaration.officialDocument.evidenceState !==
            ScrutinyEvidenceState.OFFICIAL ||
          declaration.officialDocument.reviewStatus !==
            ScrutinyDocumentReviewStatus.APPROVED
        ) {
          throw new ConflictException(
            'El documento oficial ya no cumple la evidencia requerida',
          );
        }
        const status =
          dto.decision === ScrutinyDeclarationReviewDecision.APPROVE
            ? ScrutinyDeclarationStatus.OFFICIAL
            : ScrutinyDeclarationStatus.REJECTED_INTERNAL;
        const updated = await transaction.scrutinyDeclaration.updateMany({
          where: {
            id: declarationId,
            tenantId: user.tenantId,
            status: ScrutinyDeclarationStatus.DRAFT_INTERNAL,
            version: dto.expectedVersion,
          },
          data: {
            status,
            reviewedById: context.actor.id,
            reviewedAt: new Date(),
            reviewNote: dto.reviewNote,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw this.versionConflict();
        const result = await transaction.scrutinyDeclaration.findFirstOrThrow({
          where: { id: declarationId, tenantId: user.tenantId },
          include: { lines: { orderBy: { optionCode: 'asc' } } },
        });
        return {
          resourceType: 'ScrutinyDeclaration',
          resourceId: declarationId,
          result,
        };
      },
    );
  }

  private buildReadiness(
    stage: PoliticalOperationStage,
    commissions: Array<{
      id: string;
      status: ScrutinyCommissionStatus;
      offlineDrillAt: Date | null;
      requirements: Array<{
        documentType: ScrutinyDocumentType;
        applicability: ScrutinyRequirementApplicability;
      }>;
    }>,
    documents: Array<{
      id: string;
      commissionId: string;
      type: ScrutinyDocumentType;
      evidenceState: ScrutinyEvidenceState;
      reviewStatus: ScrutinyDocumentReviewStatus;
      custodyEvents: readonly unknown[];
    }>,
    discrepancies: Array<{ status: ScrutinyDiscrepancyStatus }>,
    actions: Array<{
      status: ScrutinyActionStatus;
      deadlineAt: Date;
    }>,
    declarations: Array<{ status: ScrutinyDeclarationStatus }>,
    pendingDecisionReviews: number,
    coverage: readonly ScrutinyCommissionCoverageResult[],
    evaluatedAt: Date,
  ) {
    const blockers: Array<{
      code: string;
      count: number;
      detail: string;
      href: string;
    }> = [];
    const activeCommissions = commissions.filter(
      ({ status }) => status !== ScrutinyCommissionStatus.CANCELLED,
    );
    if (activeCommissions.length === 0) {
      blockers.push({
        code: 'NO_SCRUTINY_COMMISSION',
        count: 1,
        detail:
          'No existe una comision de escrutinio vinculada al release electoral activo.',
        href: '/dashboard/scrutiny',
      });
    }

    const pendingRequirements = activeCommissions
      .flatMap(({ requirements }) => requirements)
      .filter(
        ({ applicability }) =>
          applicability === ScrutinyRequirementApplicability.PENDING,
      ).length;
    if (pendingRequirements > 0) {
      blockers.push({
        code: 'SCRUTINY_APPLICABILITY_UNDECIDED',
        count: pendingRequirements,
        detail: `${pendingRequirements} requisitos documentales aun no declaran si son obligatorios o no aplican.`,
        href: '/dashboard/scrutiny',
      });
    }

    const requiredMissing = activeCommissions.flatMap((commission) =>
      commission.requirements.filter(
        (requirement) =>
          requirement.applicability ===
            ScrutinyRequirementApplicability.REQUIRED &&
          !documents.some(
            (document) =>
              document.commissionId === commission.id &&
              document.type === requirement.documentType &&
              document.reviewStatus === ScrutinyDocumentReviewStatus.APPROVED,
          ),
      ),
    ).length;
    if (requiredMissing > 0) {
      blockers.push({
        code: 'SCRUTINY_REQUIRED_DOCUMENTS_MISSING',
        count: requiredMissing,
        detail: `${requiredMissing} documentos declarados obligatorios no tienen una version aprobada.`,
        href: '/dashboard/scrutiny',
      });
    }

    const requiredApprovedDocumentIds = new Set(
      activeCommissions.flatMap((commission) =>
        commission.requirements
          .filter(
            ({ applicability }) =>
              applicability === ScrutinyRequirementApplicability.REQUIRED,
          )
          .flatMap((requirement) =>
            documents
              .filter(
                (document) =>
                  document.commissionId === commission.id &&
                  document.type === requirement.documentType &&
                  document.reviewStatus ===
                    ScrutinyDocumentReviewStatus.APPROVED,
              )
              .map(({ id }) => id),
          ),
      ),
    );
    const documentsWithoutCustody = documents.filter(
      (document) =>
        requiredApprovedDocumentIds.has(document.id) &&
        document.custodyEvents.length === 0,
    ).length;
    if (documentsWithoutCustody > 0) {
      blockers.push({
        code: 'SCRUTINY_DOCUMENT_CUSTODY_MISSING',
        count: documentsWithoutCustody,
        detail: `${documentsWithoutCustody} documentos obligatorios carecen de evento de custodia.`,
        href: '/dashboard/scrutiny',
      });
    }

    const reviewPending = documents.filter(
      ({ reviewStatus }) =>
        reviewStatus === ScrutinyDocumentReviewStatus.PENDING,
    ).length;
    if (reviewPending > 0) {
      blockers.push({
        code: 'SCRUTINY_DOCUMENT_REVIEW_PENDING',
        count: reviewPending,
        detail: `${reviewPending} documentos siguen pendientes de revision independiente.`,
        href: '/dashboard/scrutiny',
      });
    }

    const uncovered = coverage.filter(({ fullyCovered }) => !fullyCovered);
    if (uncovered.length > 0) {
      const gapMinutes = uncovered.reduce(
        (total, item) => total + item.gapMinutes,
        0,
      );
      blockers.push({
        code: 'SCRUTINY_E16_TEMPORAL_COVERAGE_INCOMPLETE',
        count: uncovered.length,
        detail: `${uncovered.length} comisiones acumulan ${gapMinutes} minutos sin cobertura E-16 confirmada.`,
        href: '/dashboard/scrutiny',
      });
    }

    const drillsMissing = activeCommissions.filter(
      ({ offlineDrillAt }) => !offlineDrillAt,
    ).length;
    if (drillsMissing > 0) {
      blockers.push({
        code: 'SCRUTINY_CONTINGENCY_DRILL_MISSING',
        count: drillsMissing,
        detail: `${drillsMissing} comisiones no registran simulacro de contingencia sin conectividad.`,
        href: '/dashboard/scrutiny',
      });
    }

    const openDiscrepancies = discrepancies.filter(
      ({ status }) =>
        status === ScrutinyDiscrepancyStatus.OPEN ||
        status === ScrutinyDiscrepancyStatus.UNDER_REVIEW,
    ).length;
    if (openDiscrepancies > 0) {
      blockers.push({
        code: 'SCRUTINY_DISCREPANCIES_OPEN',
        count: openDiscrepancies,
        detail: `${openDiscrepancies} diferencias conservan valores enfrentados sin explicacion final.`,
        href: '/dashboard/scrutiny',
      });
    }

    const openActions = actions.filter(
      ({ status }) =>
        status === ScrutinyActionStatus.DRAFT ||
        status === ScrutinyActionStatus.APPROVED_INTERNAL ||
        status === ScrutinyActionStatus.FILED_EXTERNAL,
    ).length;
    if (openActions > 0) {
      blockers.push({
        code: 'SCRUTINY_ACTIONS_OPEN',
        count: openActions,
        detail: `${openActions} solicitudes, reclamaciones o recursos siguen sin decision incorporada.`,
        href: '/dashboard/scrutiny',
      });
    }

    const overdueActions = actions.filter(
      ({ status, deadlineAt }) =>
        (status === ScrutinyActionStatus.DRAFT ||
          status === ScrutinyActionStatus.APPROVED_INTERNAL) &&
        deadlineAt < evaluatedAt,
    ).length;
    if (overdueActions > 0) {
      blockers.push({
        code: 'SCRUTINY_ACTION_DEADLINES_EXPIRED',
        count: overdueActions,
        detail: `${overdueActions} actuaciones internas superaron el termino documentado sin radicacion.`,
        href: '/dashboard/scrutiny',
      });
    }

    if (pendingDecisionReviews > 0) {
      blockers.push({
        code: 'SCRUTINY_DECISIONS_PENDING_REVIEW',
        count: pendingDecisionReviews,
        detail: `${pendingDecisionReviews} decisiones externas esperan segunda revision.`,
        href: '/dashboard/scrutiny',
      });
    }

    const declarationRequired = activeCommissions.some(({ requirements }) =>
      requirements.some(
        ({ documentType, applicability }) =>
          documentType === ScrutinyDocumentType.DECLARATION_CREDENTIAL &&
          applicability === ScrutinyRequirementApplicability.REQUIRED,
      ),
    );
    const officialDeclarations = declarations.filter(
      ({ status }) => status === ScrutinyDeclarationStatus.OFFICIAL,
    ).length;
    if (declarationRequired && officialDeclarations === 0) {
      blockers.push({
        code: 'SCRUTINY_OFFICIAL_DECLARATION_MISSING',
        count: 1,
        detail:
          'La declaracion se marco obligatoria, pero no existe un resultado oficial documentado y aprobado por segunda persona.',
        href: '/dashboard/scrutiny',
      });
    }

    if (stage === PoliticalOperationStage.CLOSED && blockers.length > 0) {
      // Historical records remain visible. This state signals a legacy or
      // exceptional close; it never retroactively certifies compliance.
    }

    return {
      ready: blockers.length === 0,
      evaluatedAt: evaluatedAt.toISOString(),
      basis:
        'TENANT_SCOPED_APPROVED_DOCUMENTS_EXPLICIT_APPLICABILITY_E16_TIME_COVERAGE_EXTERNAL_EVIDENCE_FOUR_EYES',
      summary: {
        commissionCount: activeCommissions.length,
        documentCount: documents.length,
        officialDeclarationCount: officialDeclarations,
        blockerCount: blockers.length,
      },
      blockers,
    };
  }

  private async executeCommand<T, TInput extends ScrutinyCommandDto & object>(
    user: AuthenticatedUser,
    type: ScrutinyCommandType,
    input: TInput,
    allowedRoles: readonly Role[],
    resourceLock: string,
    operation: (
      transaction: Tx,
      context: MutationContext,
    ) => Promise<CommandResult<T>>,
  ): Promise<T> {
    const expectedHash = computeScrutinyCommandSha256(
      type as ScrutinyCommandName,
      input,
    );
    if (expectedHash !== input.payloadSha256) {
      throw new BadRequestException({
        code: 'SCRUTINY_PAYLOAD_HASH_MISMATCH',
        message:
          'La huella canonica no coincide con el comando; no se ejecuto ninguna mutacion',
        expectedPayloadSha256: expectedHash,
      });
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.lockLifecycle(transaction, user.tenantId);
        await this.lockAdvisory(
          transaction,
          `scrutiny:${user.tenantId}:${resourceLock}`,
        );
        const context = await this.assertMutationContext(
          transaction,
          user,
          allowedRoles,
        );

        const replay = await transaction.scrutinyCommand.findUnique({
          where: {
            tenantId_clientRequestId: {
              tenantId: user.tenantId,
              clientRequestId: input.clientRequestId,
            },
          },
        });
        if (replay) {
          if (
            replay.type !== type ||
            replay.payloadSha256 !== input.payloadSha256 ||
            replay.actorUserId !== context.actor.id
          ) {
            throw new ConflictException(
              'El UUID de comando ya fue usado con otro contenido, tipo o actor',
            );
          }
          return replay.resultSnapshot as T;
        }

        const result = await operation(transaction, context);
        const snapshot = jsonSnapshot(result.result);
        await transaction.scrutinyCommand.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            clientRequestId: input.clientRequestId,
            payloadSha256: input.payloadSha256,
            type,
            actorUserId: context.actor.id,
            resourceType: result.resourceType,
            resourceId: result.resourceId,
            resultSnapshot: snapshot,
          },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.CAMPAIGN,
            actorType: AuditActorType.USER,
            actorUserId: context.actor.id,
            action: `SCRUTINY_${type}`,
            resourceType: result.resourceType,
            resourceId: result.resourceId,
            metadata: {
              clientRequestId: input.clientRequestId,
              payloadSha256: input.payloadSha256,
              operationStage: context.profile.stage,
            },
          },
        });
        return result.result;
      }, SERIALIZABLE_OPTIONS);
    } catch (error) {
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'El expediente cambio al mismo tiempo; recarga y reintenta con una nueva version',
        );
      }
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'El comando o registro ya existe; recarga para reconciliar el resultado',
        );
      }
      throw error;
    }
  }

  private async assertReadContext(transaction: Tx, user: AuthenticatedUser) {
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
          role: { in: [...READ_ROLES] },
        },
        select: { id: true, role: true },
      }),
      transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: { id: true, stage: true },
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!actor) {
      throw new ForbiddenException(
        'El usuario no tiene acceso vigente al expediente de escrutinio',
      );
    }
    if (!profile || !READ_STAGES.has(profile.stage)) {
      throw new ConflictException(
        'El expediente de escrutinio solo esta disponible desde Dia D',
      );
    }
    return { actor, profile };
  }

  private async assertMutationContext(
    transaction: Tx,
    user: AuthenticatedUser,
    allowedRoles: readonly Role[],
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
          role: { in: [...allowedRoles] },
        },
        select: { id: true, role: true },
      }),
      transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: { id: true, stage: true },
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!actor) {
      throw new ForbiddenException(
        'El actor no esta activo o su rol no autoriza esta mutacion de escrutinio',
      );
    }
    if (!profile) {
      throw new ConflictException('Falta el perfil de operacion electoral');
    }
    if (!MUTATION_STAGES.has(profile.stage)) {
      throw new ConflictException({
        code:
          profile.stage === PoliticalOperationStage.CLOSED
            ? 'OPERATION_CLOSED'
            : 'OPERATION_STAGE_NOT_ALLOWED',
        message:
          profile.stage === PoliticalOperationStage.CLOSED
            ? 'La operacion cerrada conserva el escrutinio en solo lectura'
            : 'Las mutaciones de escrutinio se habilitan desde Dia D y durante poseleccion',
        currentStage: profile.stage,
        allowedStages: [...MUTATION_STAGES],
      });
    }
    return { actor, profile };
  }

  private async assertActiveUser(
    transaction: Tx,
    tenantId: string,
    userId: string,
    roles: readonly Role[],
    message: string,
  ) {
    const actor = await transaction.user.findFirst({
      where: {
        id: userId,
        tenantId,
        isActive: true,
        role: { in: [...roles] },
      },
      select: { id: true },
    });
    if (!actor) throw new BadRequestException(message);
    return actor;
  }

  private async requireCommission(
    transaction: Tx,
    tenantId: string,
    operationProfileId: string,
    commissionId: string,
  ) {
    const commission = await transaction.scrutinyCommission.findFirst({
      where: { id: commissionId, tenantId, operationProfileId },
    });
    if (!commission) throw new NotFoundException('Comision no encontrada');
    if (commission.status === ScrutinyCommissionStatus.CANCELLED) {
      throw new ConflictException(
        'La comision cancelada no admite nuevas mutaciones',
      );
    }
    return commission;
  }

  private async requireDocument(
    transaction: Tx,
    tenantId: string,
    operationProfileId: string,
    documentId: string,
  ) {
    const document = await transaction.scrutinyDocument.findFirst({
      where: { id: documentId, tenantId, operationProfileId },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    return document;
  }

  private async requireApprovedDocument(
    transaction: Tx,
    tenantId: string,
    documentId: string,
    commissionId: string,
    states: readonly ScrutinyEvidenceState[],
  ) {
    const document = await transaction.scrutinyDocument.findFirst({
      where: {
        id: documentId,
        tenantId,
        commissionId,
        evidenceState: { in: [...states] },
        reviewStatus: ScrutinyDocumentReviewStatus.APPROVED,
      },
      select: { id: true },
    });
    if (!document) {
      throw new BadRequestException(
        'El soporte no pertenece a la comision, no tiene el estado externo requerido o carece de segunda revision',
      );
    }
    return document;
  }

  private async requireAction(
    transaction: Tx,
    tenantId: string,
    operationProfileId: string,
    actionId: string,
  ) {
    const action = await transaction.scrutinyAction.findFirst({
      where: { id: actionId, tenantId, operationProfileId },
    });
    if (!action) throw new NotFoundException('Actuacion no encontrada');
    return action;
  }

  private nextCommissionStatus(
    current: ScrutinyCommissionStatus,
    event: ScrutinySessionEventType,
  ): ScrutinyCommissionStatus {
    const transitions: Partial<
      Record<
        ScrutinyCommissionStatus,
        Partial<Record<ScrutinySessionEventType, ScrutinyCommissionStatus>>
      >
    > = {
      [ScrutinyCommissionStatus.PLANNED]: {
        [ScrutinySessionEventType.OPENED]: ScrutinyCommissionStatus.ACTIVE,
      },
      [ScrutinyCommissionStatus.ACTIVE]: {
        [ScrutinySessionEventType.SUSPENDED]:
          ScrutinyCommissionStatus.SUSPENDED,
        [ScrutinySessionEventType.CLOSED]: ScrutinyCommissionStatus.CLOSED,
      },
      [ScrutinyCommissionStatus.SUSPENDED]: {
        [ScrutinySessionEventType.RESUMED]: ScrutinyCommissionStatus.ACTIVE,
        [ScrutinySessionEventType.CLOSED]: ScrutinyCommissionStatus.CLOSED,
      },
    };
    const next = transitions[current]?.[event];
    if (!next) {
      throw new ConflictException(
        `El evento ${event} no es valido cuando la comision esta ${current}`,
      );
    }
    return next;
  }

  private assertExternalDocumentMetadata(dto: CreateScrutinyDocumentDto) {
    const external = dto.evidenceState !== ScrutinyEvidenceState.INTERNAL;
    const complete = Boolean(
      dto.externalAt && dto.externalChannel && dto.externalReference,
    );
    if (external !== complete) {
      throw new BadRequestException(
        external
          ? 'Un documento externo exige autoridad temporal, canal y referencia verificable'
          : 'Un documento interno no puede fingir metadatos de radicacion o decision externa',
      );
    }
  }

  private async lockLifecycle(transaction: Tx, tenantId: string) {
    await this.lockAdvisory(
      transaction,
      `operation-profile-lifecycle:${tenantId}`,
    );
  }

  private async lockAdvisory(transaction: Tx, lockKey: string) {
    // Do not project PostgreSQL's `void` lock result: Prisma's pg adapter
    // cannot deserialize it. MATERIALIZED forces the volatile call while the
    // public projection exposes only a supported boolean.
    await transaction.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`
        WITH scrutiny_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
        )
        SELECT TRUE AS "locked" FROM scrutiny_lock
      `,
    );
  }

  private sha256(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private versionConflict(
    message = 'La version cambio; recarga antes de continuar',
  ) {
    return new ConflictException({
      code: 'SCRUTINY_VERSION_CONFLICT',
      message,
    });
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
