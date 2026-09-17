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
  PoliticalOperationMode,
  PqrsdAuthorizationDecision,
  PqrsdClosureCause,
  PqrsdCommandType,
  PqrsdCompetence,
  PqrsdDeadlineCalculationStatus,
  PqrsdDeliveryOutcome,
  PqrsdDocumentType,
  PqrsdDossierStatus,
  PqrsdResponseReviewDecision,
  PqrsdReviewDecision,
  PqrsdRulePackageStatus,
  PqrsdRuleReviewDecision,
  Prisma,
  Role,
  StorageObjectModule,
  StoredObjectStatus,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import {
  civilDateAt,
  civilDateTimeToUtc,
} from '../electoral-calendar/electoral-calendar.time';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttachPqrsdDocumentDto,
  AuthorizePqrsdResponseDto,
  ClosePqrsdDossierDto,
  CreatePqrsdDossierDto,
  CreatePqrsdResponseVersionDto,
  CreatePqrsdRulePackageDto,
  ListPqrsdQueryDto,
  ProposePqrsdClassificationDto,
  ProposePqrsdExtensionDto,
  ProposePqrsdTransferDto,
  RecordPqrsdAcknowledgementDto,
  RecordPqrsdAssignmentDto,
  RecordPqrsdDeliveryAttemptDto,
  RecordPqrsdTransferAttemptDto,
  ReopenPqrsdDossierDto,
  ReviewPqrsdClassificationDto,
  ReviewPqrsdDocumentDto,
  ReviewPqrsdExtensionDto,
  ReviewPqrsdResponseDto,
  ReviewPqrsdRulePackageDto,
  ReviewPqrsdTransferDto,
  type PqrsdCommandDto,
} from './dto/pqrsd.dto';
import { PQRSD_READ_ROLES } from './pqrsd-access.constants';
import { calculatePqrsdDeadline } from './pqrsd-deadline';
import { computePqrsdCommandSha256, type PqrsdCommandName } from './pqrsd.hash';

type Tx = Prisma.TransactionClient;

interface MutationContext {
  actor: { id: string; role: Role };
}

interface CommandResult<T> {
  resourceType: string;
  resourceId: string;
  versionBefore?: number;
  versionAfter?: number;
  result: T;
}

const INTAKE_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
];
const REVIEW_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.COMPLIANCE_OFFICER,
];
const AUTHORIZATION_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
];
const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

function dateOnly(value: string, field: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${field} no es una fecha calendario valida`);
  }
  return parsed;
}

function dateTime(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new BadRequestException(`${field} no es una fecha valida`);
  }
  return parsed;
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function addCivilDays(value: string, amount: number): string {
  const date = dateOnly(value, 'localDate');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class PqrsdService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: AuthenticatedUser, query: ListPqrsdQueryDto) {
    return this.prisma.$transaction(async (transaction) => {
      await this.requireReadContext(transaction, user);
      const limit = query.limit ?? 100;
      const [packages, dossiers, team] = await Promise.all([
        transaction.pqrsdRulePackage.findMany({
          where: { tenantId: user.tenantId },
          select: {
            id: true,
            scopeKey: true,
            versionLabel: true,
            sourceUrl: true,
            sourceReference: true,
            sourceSha256: true,
            timeZone: true,
            effectiveFrom: true,
            effectiveTo: true,
            nonWorkingWeekdays: true,
            status: true,
            revision: true,
            activatedAt: true,
            createdById: true,
            rules: {
              select: {
                id: true,
                classificationKey: true,
                label: true,
                durationDays: true,
                dayMethod: true,
                startRule: true,
                legalBasis: true,
                highRisk: true,
              },
              orderBy: { classificationKey: 'asc' },
            },
            calendarExceptions: {
              select: {
                localDate: true,
                type: true,
                label: true,
                sourceReference: true,
              },
              orderBy: { localDate: 'asc' },
            },
            decisions: {
              select: {
                decision: true,
                rationale: true,
                actorId: true,
                decidedAt: true,
              },
            },
          },
          orderBy: [{ scopeKey: 'asc' }, { createdAt: 'desc' }],
          take: 100,
        }),
        transaction.pqrsdDossier.findMany({
          where: {
            tenantId: user.tenantId,
            ...(query.status ? { status: query.status } : {}),
          },
          select: {
            id: true,
            reference: true,
            receivedAt: true,
            receivedTimeZone: true,
            status: true,
            riskLevel: true,
            version: true,
            updatedAt: true,
            currentPrimaryAssignee: {
              select: { id: true, name: true, isActive: true },
            },
            currentBackupAssignee: {
              select: { id: true, name: true, isActive: true },
            },
            petitioner: {
              select: {
                maskedFullName: true,
                maskedDocumentNumber: true,
                maskedEmail: true,
                maskedPhone: true,
              },
            },
            classifications: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              select: {
                categoryLabel: true,
                competence: true,
                department: true,
                review: { select: { decision: true } },
              },
            },
            deadlines: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              select: {
                calculationStatus: true,
                currentDueLocalDate: true,
                dueAt: true,
                package: {
                  select: {
                    timeZone: true,
                    nonWorkingWeekdays: true,
                    calendarExceptions: {
                      select: { localDate: true, type: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
          take: limit,
        }),
        transaction.user.findMany({
          where: {
            tenantId: user.tenantId,
            isActive: true,
            role: { in: [...PQRSD_READ_ROLES] },
          },
          select: { id: true, name: true, role: true },
          orderBy: { name: 'asc' },
        }),
      ]);

      const now = new Date();
      const alerts = dossiers.flatMap((dossier) =>
        this.buildDossierAlerts(dossier, now),
      );
      const activePackages = packages.filter(
        ({ status }) => status === PqrsdRulePackageStatus.ACTIVE,
      );
      return {
        scope: 'PUBLIC_OFFICE_PQRSD_ONLY' as const,
        configurationReady: activePackages.length > 0,
        institutionalStatus:
          activePackages.length > 0
            ? ('INTERNAL_EVIDENCE_SYSTEM_CONFIGURED' as const)
            : ('CONFIGURATION_REQUIRED' as const),
        institutionalMessage:
          activePackages.length > 0
            ? 'La configuracion interna esta aprobada. La radicacion y entrega externas solo se consideran ocurridas cuando existe constancia verificada.'
            : 'Aun no existe un paquete normativo/calendario aprobado. No se habilita la recepcion formal ni se infieren plazos.',
        externalDeliveryAutomated: false,
        generatedAt: now.toISOString(),
        packages,
        dossiers: dossiers.map((dossier) => ({
          ...dossier,
          classifications: dossier.classifications,
          deadlines: dossier.deadlines.map(
            ({ package: packageSnapshot, ...deadline }) => {
              void packageSnapshot;
              return deadline;
            },
          ),
          detailHref: `/dashboard/pqrsd?view=detail&entityId=${encodeURIComponent(dossier.id)}`,
        })),
        alerts,
        team,
        privacy: {
          listDataMasked: true,
          detailAccessAudited: true,
          campaignDataReuse: false,
          exportEnabled: false,
        },
      };
    });
  }

  async detail(user: AuthenticatedUser, dossierId: string, purpose: string) {
    return this.prisma.$transaction(async (transaction) => {
      const context = await this.requireReadContext(transaction, user);
      await this.lockAdvisory(
        transaction,
        `pqrsd:${user.tenantId}:dossier:${dossierId}:detail`,
      );
      const dossier = await transaction.pqrsdDossier.findFirst({
        where: { id: dossierId, tenantId: user.tenantId },
        include: {
          petitioner: true,
          rulePackage: {
            include: {
              rules: { orderBy: { classificationKey: 'asc' } },
              calendarExceptions: { orderBy: { localDate: 'asc' } },
              decisions: true,
            },
          },
          documents: {
            orderBy: { createdAt: 'asc' },
            include: { reviews: true },
          },
          acknowledgements: { orderBy: { issuedAt: 'asc' } },
          classifications: {
            orderBy: { versionNumber: 'asc' },
            include: { review: true, ruleDefinition: true },
          },
          deadlines: { orderBy: { versionNumber: 'asc' } },
          assignments: { orderBy: { effectiveAt: 'asc' } },
          transfers: {
            orderBy: { proposedAt: 'asc' },
            include: {
              review: true,
              attempts: { orderBy: { attemptedAt: 'asc' } },
            },
          },
          extensions: {
            orderBy: { proposedAt: 'asc' },
            include: { review: true, resultingDeadline: true },
          },
          responses: {
            orderBy: { versionNumber: 'asc' },
            include: {
              review: true,
              authorization: true,
              deliveryAttempts: { orderBy: { attemptedAt: 'asc' } },
            },
          },
          closures: { orderBy: { sequence: 'asc' } },
          reopenings: { orderBy: { reopenedAt: 'asc' } },
          statusEvents: { orderBy: { occurredAt: 'asc' } },
          currentPrimaryAssignee: {
            select: { id: true, name: true, role: true },
          },
          currentBackupAssignee: {
            select: { id: true, name: true, role: true },
          },
        },
      });
      if (!dossier)
        throw new NotFoundException('Expediente PQRSD no encontrado');

      await transaction.pqrsdDetailAccess.create({
        data: {
          id: randomUUID(),
          tenantId: user.tenantId,
          dossierId,
          purpose,
          actorId: context.actor.id,
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          actorType: AuditActorType.USER,
          actorUserId: context.actor.id,
          action: 'PQRSD_DETAIL_ACCESSED',
          resourceType: 'PqrsdDossier',
          resourceId: dossierId,
          metadata: {
            purpose,
            containsSensitiveData: true,
            campaignDataReuse: false,
          },
        },
      });
      return {
        ...dossier,
        privacyNotice:
          'Detalle sensible. Este acceso quedó auditado y no autoriza reutilización en la base de datos de campaña.',
      };
    }, SERIALIZABLE_OPTIONS);
  }

  async createRulePackage(
    user: AuthenticatedUser,
    dto: CreatePqrsdRulePackageDto,
  ) {
    const weekdays = new Set(dto.nonWorkingWeekdays);
    if (weekdays.size !== dto.nonWorkingWeekdays.length) {
      throw new BadRequestException(
        'Los dias no laborables no pueden repetirse',
      );
    }
    const exceptionDates = new Set(
      dto.exceptions.map(({ localDate }) => localDate),
    );
    if (exceptionDates.size !== dto.exceptions.length) {
      throw new BadRequestException(
        'Cada fecha excepcional debe tener una unica definicion no ambigua',
      );
    }
    const ruleKeys = new Set(
      dto.rules.map(({ classificationKey }) => classificationKey),
    );
    if (ruleKeys.size !== dto.rules.length) {
      throw new BadRequestException(
        'Las claves de clasificacion no pueden repetirse',
      );
    }
    const effectiveFrom = dateOnly(dto.effectiveFrom, 'effectiveFrom');
    const effectiveTo = dto.effectiveTo
      ? dateOnly(dto.effectiveTo, 'effectiveTo')
      : null;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('La vigencia final precede a la inicial');
    }

    return this.executeCommand(
      user,
      PqrsdCommandType.RULE_PACKAGE_CREATE,
      dto,
      REVIEW_ROLES,
      `rule-package:${dto.scopeKey}:${dto.versionLabel}`,
      async (transaction, context) => {
        const id = randomUUID();
        const result = await transaction.pqrsdRulePackage.create({
          data: {
            id,
            tenantId: user.tenantId,
            scopeKey: dto.scopeKey,
            versionLabel: dto.versionLabel,
            sourceUrl: dto.sourceUrl,
            sourceReference: dto.sourceReference,
            sourceSha256: dto.sourceSha256,
            timeZone: dto.timeZone,
            effectiveFrom,
            effectiveTo,
            nonWorkingWeekdays: dto.nonWorkingWeekdays,
            computationMethodNote: dto.computationMethodNote,
            createdById: context.actor.id,
            rules: {
              create: dto.rules.map((rule) => ({
                id: randomUUID(),
                tenantId: user.tenantId,
                ...rule,
              })),
            },
            calendarExceptions: {
              create: dto.exceptions.map((exception) => ({
                id: randomUUID(),
                tenantId: user.tenantId,
                ...exception,
                localDate: dateOnly(exception.localDate, 'localDate'),
              })),
            },
          },
          include: { rules: true, calendarExceptions: true },
        });
        return {
          resourceType: 'PqrsdRulePackage',
          resourceId: id,
          versionAfter: result.revision,
          result,
        };
      },
    );
  }

  async reviewRulePackage(
    user: AuthenticatedUser,
    packageId: string,
    dto: ReviewPqrsdRulePackageDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.RULE_PACKAGE_REVIEW,
      { ...dto, packageId },
      AUTHORIZATION_ROLES,
      `rule-package:${packageId}`,
      async (transaction, context) => {
        const packageRecord = await transaction.pqrsdRulePackage.findFirst({
          where: { id: packageId, tenantId: user.tenantId },
          include: { rules: true },
        });
        if (!packageRecord)
          throw new NotFoundException('Paquete PQRSD no encontrado');
        if (
          packageRecord.status !== PqrsdRulePackageStatus.DRAFT ||
          packageRecord.revision !== dto.expectedRevision
        ) {
          throw this.versionConflict(
            'El paquete ya fue decidido o cambio de revision',
          );
        }
        if (packageRecord.createdById === context.actor.id) {
          throw new ForbiddenException(
            'Quien preparo el paquete no puede aprobarlo ni rechazarlo',
          );
        }
        if (
          dto.decision === PqrsdRuleReviewDecision.APPROVE_ACTIVATE &&
          packageRecord.rules.length === 0
        ) {
          throw new BadRequestException(
            'No se activa un paquete sin reglas explicitas',
          );
        }
        await transaction.pqrsdRulePackageDecision.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            packageId,
            decision: dto.decision,
            rationale: dto.rationale,
            actorId: context.actor.id,
          },
        });
        const nextStatus =
          dto.decision === PqrsdRuleReviewDecision.APPROVE_ACTIVATE
            ? PqrsdRulePackageStatus.ACTIVE
            : PqrsdRulePackageStatus.REJECTED;
        if (nextStatus === PqrsdRulePackageStatus.ACTIVE) {
          const current = await transaction.pqrsdRulePackage.findFirst({
            where: {
              tenantId: user.tenantId,
              scopeKey: packageRecord.scopeKey,
              status: PqrsdRulePackageStatus.ACTIVE,
              id: { not: packageId },
            },
          });
          if (current) {
            const superseded = await transaction.pqrsdRulePackage.updateMany({
              where: {
                id: current.id,
                tenantId: user.tenantId,
                revision: current.revision,
                status: PqrsdRulePackageStatus.ACTIVE,
              },
              data: {
                status: PqrsdRulePackageStatus.SUPERSEDED,
                revision: { increment: 1 },
              },
            });
            if (superseded.count !== 1) throw this.versionConflict();
          }
        }
        const updated = await transaction.pqrsdRulePackage.updateMany({
          where: {
            id: packageId,
            tenantId: user.tenantId,
            revision: dto.expectedRevision,
            status: PqrsdRulePackageStatus.DRAFT,
          },
          data: {
            status: nextStatus,
            activatedAt:
              nextStatus === PqrsdRulePackageStatus.ACTIVE ? new Date() : null,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw this.versionConflict();
        const result = await transaction.pqrsdRulePackage.findFirstOrThrow({
          where: { id: packageId, tenantId: user.tenantId },
          include: { rules: true, calendarExceptions: true, decisions: true },
        });
        return {
          resourceType: 'PqrsdRulePackage',
          resourceId: packageId,
          versionBefore: dto.expectedRevision,
          versionAfter: result.revision,
          result,
        };
      },
    );
  }

  async createDossier(user: AuthenticatedUser, dto: CreatePqrsdDossierDto) {
    const receivedAt = dateTime(dto.receivedAt, 'receivedAt');
    return this.executeCommand(
      user,
      PqrsdCommandType.DOSSIER_CREATE,
      dto,
      INTAKE_ROLES,
      `dossier-intake:${dto.clientRequestId}`,
      async (transaction, context) => {
        const receivedLocalDate = dateOnly(
          civilDateAt(receivedAt, dto.receivedTimeZone),
          'receivedAt',
        );
        const packageRecord = await transaction.pqrsdRulePackage.findFirst({
          where: {
            tenantId: user.tenantId,
            scopeKey: dto.scopeKey,
            status: PqrsdRulePackageStatus.ACTIVE,
            effectiveFrom: { lte: receivedLocalDate },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: receivedLocalDate } },
            ],
          },
        });
        if (!packageRecord) {
          throw new ConflictException({
            code: 'PQRSD_CONFIGURATION_REQUIRED',
            message:
              'No existe paquete normativo/calendario activo y vigente; la recepcion formal falla cerrada',
          });
        }
        if (packageRecord.timeZone !== dto.receivedTimeZone) {
          throw new BadRequestException(
            'La zona de recepcion debe coincidir con la zona IANA del paquete aprobado',
          );
        }
        const id = randomUUID();
        const reference = `PQRSD-INT-${receivedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`;
        const petitioner = dto.petitioner;
        const dossier = await transaction.pqrsdDossier.create({
          data: {
            id,
            tenantId: user.tenantId,
            reference,
            rulePackageId: packageRecord.id,
            receivedAt,
            receivedTimeZone: dto.receivedTimeZone,
            receivedChannel: dto.receivedChannel,
            externalReceiptNumber: dto.externalReceiptNumber,
            subject: dto.subject,
            description: dto.description,
            acknowledgementRequired: dto.acknowledgementRequired,
            riskLevel: dto.riskLevel,
            createdById: context.actor.id,
            petitioner: {
              create: {
                id: randomUUID(),
                ...petitioner,
                maskedFullName: this.maskName(petitioner.fullName),
                maskedDocumentNumber: petitioner.documentNumber
                  ? this.maskDocument(petitioner.documentNumber)
                  : null,
                maskedEmail: petitioner.email
                  ? this.maskEmail(petitioner.email)
                  : null,
                maskedPhone: petitioner.phone
                  ? this.maskPhone(petitioner.phone)
                  : null,
              },
            },
            statusEvents: {
              create: {
                id: randomUUID(),
                toStatus: PqrsdDossierStatus.RECEIVED,
                reason: 'Recepcion interna registrada con paquete vigente.',
                authority: packageRecord.sourceReference,
                actorId: context.actor.id,
              },
            },
          },
          select: {
            id: true,
            reference: true,
            receivedAt: true,
            status: true,
            riskLevel: true,
            version: true,
            petitioner: {
              select: {
                maskedFullName: true,
                maskedDocumentNumber: true,
                maskedEmail: true,
                maskedPhone: true,
              },
            },
          },
        });
        return {
          resourceType: 'PqrsdDossier',
          resourceId: id,
          versionAfter: dossier.version,
          result: {
            ...dossier,
            internalReferenceOnly: true,
            officialReceiptRecorded: Boolean(dto.externalReceiptNumber),
          },
        };
      },
    );
  }

  async attachDocument(user: AuthenticatedUser, dto: AttachPqrsdDocumentDto) {
    return this.executeCommand(
      user,
      PqrsdCommandType.DOCUMENT_ATTACH,
      dto,
      INTAKE_ROLES,
      `dossier:${dto.dossierId}`,
      async (transaction, context) => {
        const dossier = await this.requireDossier(
          transaction,
          user.tenantId,
          dto.dossierId,
          dto.expectedVersion,
          dto.type === PqrsdDocumentType.REOPENING_SUPPORT,
        );
        if (
          dossier.status === PqrsdDossierStatus.CLOSED &&
          dto.type !== PqrsdDocumentType.REOPENING_SUPPORT
        ) {
          throw new ConflictException(
            'El expediente cerrado solo admite soporte previo para una reapertura autorizada',
          );
        }
        const stored = await transaction.storedObject.findFirst({
          where: {
            path: dto.storagePath,
            tenantId: user.tenantId,
            uploaderId: context.actor.id,
            module: StorageObjectModule.PQRSD,
            status: StoredObjectStatus.CONFIRMED,
            consumedAt: null,
            expectedSha256: dto.sha256,
            reportedSha256: dto.sha256,
            actualSize: { gt: 0 },
          },
          select: {
            id: true,
            path: true,
            contentType: true,
            actualSize: true,
          },
        });
        if (!stored?.actualSize) {
          throw new BadRequestException(
            'El archivo PQRSD debe estar confirmado directamente en Storage y coincidir con el SHA-256 declarado por el cliente',
          );
        }
        const id = randomUUID();
        const document = await transaction.pqrsdDocument.create({
          data: {
            id,
            tenantId: user.tenantId,
            dossierId: dossier.id,
            storedObjectId: stored.id,
            type: dto.type,
            fileName: dto.fileName,
            storagePath: stored.path,
            contentType: stored.contentType,
            sizeBytes: stored.actualSize,
            sha256: dto.sha256,
            sourceReference: dto.sourceReference,
            createdById: context.actor.id,
          },
        });
        await consumeConfirmedStorageUpload(
          transaction,
          user.tenantId,
          stored.path,
          StorageObjectModule.PQRSD,
          'PqrsdDocument',
          id,
          context.actor.id,
          { expectedSha256: dto.sha256 },
        );
        let versionAfter = dossier.version;
        if (dossier.status !== PqrsdDossierStatus.CLOSED) {
          versionAfter = await this.advanceDossier(
            transaction,
            dossier,
            dossier.status,
            context.actor.id,
            `Documento ${dto.type} incorporado; pendiente de revision independiente.`,
            dto.sourceReference ?? 'Gestion documental interna PQRSD',
          );
        }
        return {
          resourceType: 'PqrsdDocument',
          resourceId: id,
          versionBefore: dossier.version,
          versionAfter,
          result: {
            ...document,
            storagePath: undefined,
            storageConfirmed: true,
            independentlyReviewed: false,
            dossierVersion: versionAfter,
          },
        };
      },
    );
  }

  async reviewDocument(
    user: AuthenticatedUser,
    documentId: string,
    dto: ReviewPqrsdDocumentDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.DOCUMENT_REVIEW,
      { ...dto, documentId },
      REVIEW_ROLES,
      `document:${documentId}`,
      async (transaction, context) => {
        const document = await transaction.pqrsdDocument.findFirst({
          where: { id: documentId, tenantId: user.tenantId },
          include: { reviews: true, dossier: true },
        });
        if (!document)
          throw new NotFoundException('Documento PQRSD no encontrado');
        if (document.dossier.version !== dto.expectedVersion) {
          throw this.versionConflict();
        }
        if (document.reviews.length > 0) {
          throw new ConflictException(
            'El documento ya tiene una revision inmutable',
          );
        }
        if (document.createdById === context.actor.id) {
          throw new ForbiddenException(
            'Quien adjunto el documento no puede revisarlo',
          );
        }
        if (
          document.dossier.status === PqrsdDossierStatus.CLOSED &&
          document.type !== PqrsdDocumentType.REOPENING_SUPPORT
        ) {
          throw new ConflictException(
            'El expediente cerrado esta en solo lectura',
          );
        }
        const review = await transaction.pqrsdDocumentReview.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            documentId,
            decision: dto.decision,
            rationale: dto.rationale,
            reviewerId: context.actor.id,
          },
        });
        let versionAfter = document.dossier.version;
        if (document.dossier.status !== PqrsdDossierStatus.CLOSED) {
          versionAfter = await this.advanceDossier(
            transaction,
            document.dossier,
            document.dossier.status,
            context.actor.id,
            `Revision documental: ${dto.decision}.`,
            dto.rationale,
          );
        }
        return {
          resourceType: 'PqrsdDocumentReview',
          resourceId: review.id,
          versionBefore: document.dossier.version,
          versionAfter,
          result: { ...review, dossierVersion: versionAfter },
        };
      },
    );
  }

  async recordAcknowledgement(
    user: AuthenticatedUser,
    dossierId: string,
    dto: RecordPqrsdAcknowledgementDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.ACKNOWLEDGEMENT_RECORD,
      { ...dto, dossierId },
      INTAKE_ROLES,
      `dossier:${dossierId}`,
      async (transaction, context) => {
        const dossier = await this.requireDossier(
          transaction,
          user.tenantId,
          dossierId,
          dto.expectedVersion,
        );
        await this.requireApprovedDocument(
          transaction,
          user.tenantId,
          dossierId,
          dto.documentId,
          [PqrsdDocumentType.RECEIPT_ACKNOWLEDGEMENT],
        );
        const acknowledgement =
          await transaction.pqrsdReceiptAcknowledgement.create({
            data: {
              id: randomUUID(),
              tenantId: user.tenantId,
              dossierId,
              documentId: dto.documentId,
              acknowledgementNumber: dto.acknowledgementNumber,
              channel: dto.channel,
              issuedAt: dateTime(dto.issuedAt, 'issuedAt'),
              actorId: context.actor.id,
            },
          });
        const versionAfter = await this.advanceDossier(
          transaction,
          dossier,
          PqrsdDossierStatus.CLASSIFICATION_PENDING,
          context.actor.id,
          'Acuse de recibo documentado; expediente listo para clasificacion.',
          dto.acknowledgementNumber,
        );
        return {
          resourceType: 'PqrsdReceiptAcknowledgement',
          resourceId: acknowledgement.id,
          versionBefore: dossier.version,
          versionAfter,
          result: { ...acknowledgement, dossierVersion: versionAfter },
        };
      },
    );
  }

  async proposeClassification(
    user: AuthenticatedUser,
    dossierId: string,
    dto: ProposePqrsdClassificationDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.CLASSIFICATION_PROPOSE,
      { ...dto, dossierId },
      INTAKE_ROLES,
      `dossier:${dossierId}`,
      async (transaction, context) => {
        const dossier = await this.requireDossier(
          transaction,
          user.tenantId,
          dossierId,
          dto.expectedVersion,
        );
        if (
          dossier.acknowledgementRequired &&
          (await transaction.pqrsdReceiptAcknowledgement.count({
            where: { tenantId: user.tenantId, dossierId },
          })) === 0
        ) {
          throw new ConflictException(
            'Debe documentarse el acuse requerido antes de clasificar',
          );
        }
        const rule = await transaction.pqrsdRuleDefinition.findFirst({
          where: {
            id: dto.ruleDefinitionId,
            tenantId: user.tenantId,
            packageId: dossier.rulePackageId,
          },
        });
        if (!rule) {
          throw new BadRequestException(
            'La regla no pertenece al paquete congelado del expediente',
          );
        }
        const latest = await transaction.pqrsdClassificationVersion.aggregate({
          where: { tenantId: user.tenantId, dossierId },
          _max: { versionNumber: true },
        });
        const classification =
          await transaction.pqrsdClassificationVersion.create({
            data: {
              id: randomUUID(),
              tenantId: user.tenantId,
              dossierId,
              ruleDefinitionId: rule.id,
              versionNumber: (latest._max.versionNumber ?? 0) + 1,
              categoryKey: dto.categoryKey,
              categoryLabel: dto.categoryLabel,
              competence: dto.competence,
              department: dto.department,
              competentAuthority: dto.competentAuthority,
              rationale: dto.rationale,
              proposedById: context.actor.id,
            },
          });
        const versionAfter = await this.advanceDossier(
          transaction,
          dossier,
          PqrsdDossierStatus.CLASSIFICATION_PENDING,
          context.actor.id,
          'Clasificacion propuesta; pendiente de revision independiente.',
          rule.legalBasis,
        );
        return {
          resourceType: 'PqrsdClassificationVersion',
          resourceId: classification.id,
          versionBefore: dossier.version,
          versionAfter,
          result: { ...classification, dossierVersion: versionAfter },
        };
      },
    );
  }

  async reviewClassification(
    user: AuthenticatedUser,
    classificationId: string,
    dto: ReviewPqrsdClassificationDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.CLASSIFICATION_REVIEW,
      { ...dto, classificationId },
      REVIEW_ROLES,
      `classification:${classificationId}`,
      async (transaction, context) => {
        const classification =
          await transaction.pqrsdClassificationVersion.findFirst({
            where: { id: classificationId, tenantId: user.tenantId },
            include: {
              review: true,
              dossier: true,
              ruleDefinition: true,
            },
          });
        if (!classification) {
          throw new NotFoundException('Clasificacion PQRSD no encontrada');
        }
        if (
          classification.dossier.version !== dto.expectedVersion ||
          classification.review
        ) {
          throw this.versionConflict(
            'La clasificacion ya fue revisada o cambio',
          );
        }
        if (classification.proposedById === context.actor.id) {
          throw new ForbiddenException(
            'Quien propuso la clasificacion no puede revisarla',
          );
        }
        const review = await transaction.pqrsdClassificationReview.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            classificationId,
            decision: dto.decision,
            rationale: dto.rationale,
            reviewerId: context.actor.id,
          },
        });
        let nextStatus: PqrsdDossierStatus =
          PqrsdDossierStatus.CLASSIFICATION_PENDING;
        if (dto.decision === PqrsdReviewDecision.APPROVE) {
          const packageRecord =
            await transaction.pqrsdRulePackage.findFirstOrThrow({
              where: {
                id: classification.dossier.rulePackageId,
                tenantId: user.tenantId,
              },
              include: { calendarExceptions: true },
            });
          const calculated = calculatePqrsdDeadline({
            receivedAt: classification.dossier.receivedAt,
            timeZone: packageRecord.timeZone,
            durationDays: classification.ruleDefinition.durationDays,
            dayMethod: classification.ruleDefinition.dayMethod,
            startRule: classification.ruleDefinition.startRule,
            nonWorkingWeekdays: packageRecord.nonWorkingWeekdays,
            exceptions: packageRecord.calendarExceptions.map((exception) => ({
              localDate: exception.localDate.toISOString().slice(0, 10),
              type: exception.type,
              label: exception.label,
              sourceReference: exception.sourceReference,
            })),
          });
          const manualSupplied = Boolean(
            dto.manualDueLocalDate ||
            dto.manualDeadlineReason ||
            dto.manualDeadlineAuthority,
          );
          const manualFieldCount = [
            dto.manualDueLocalDate,
            dto.manualDeadlineReason,
            dto.manualDeadlineAuthority,
          ].filter(Boolean).length;
          if (manualFieldCount > 0 && manualFieldCount < 3) {
            throw new BadRequestException(
              'La determinacion manual exige fecha, motivo y autoridad completos',
            );
          }
          if (
            calculated.calculationStatus === 'CALCULATION_REQUIRES_REVIEW' &&
            !(
              dto.manualDueLocalDate &&
              dto.manualDeadlineReason &&
              dto.manualDeadlineAuthority
            )
          ) {
            // The ambiguity is intentionally persisted, never converted to a
            // due date by guessing.
          } else if (
            calculated.calculationStatus === 'CALCULATED' &&
            manualSupplied
          ) {
            throw new BadRequestException(
              'No se admite sobrescribir manualmente un calculo reproducible',
            );
          }
          const deadlineCount = await transaction.pqrsdDeadlineVersion.count({
            where: {
              tenantId: user.tenantId,
              dossierId: classification.dossierId,
            },
          });
          const manualDate = dto.manualDueLocalDate ?? null;
          const manualDueAt = manualDate
            ? civilDateTimeToUtc(manualDate, '23:59', packageRecord.timeZone)
            : null;
          await transaction.pqrsdDeadlineVersion.create({
            data: {
              id: randomUUID(),
              tenantId: user.tenantId,
              dossierId: classification.dossierId,
              classificationId,
              packageId: packageRecord.id,
              ruleDefinitionId: classification.ruleDefinitionId,
              versionNumber: deadlineCount + 1,
              calculationStatus: manualDate
                ? PqrsdDeadlineCalculationStatus.MANUAL_REVIEWED
                : calculated.calculationStatus,
              startLocalDate: dateOnly(
                calculated.startLocalDate,
                'startLocalDate',
              ),
              startExplanation: calculated.startExplanation,
              originalDueLocalDate: manualDate
                ? dateOnly(manualDate, 'manualDueLocalDate')
                : calculated.originalDueLocalDate
                  ? dateOnly(
                      calculated.originalDueLocalDate,
                      'originalDueLocalDate',
                    )
                  : null,
              currentDueLocalDate: manualDate
                ? dateOnly(manualDate, 'manualDueLocalDate')
                : calculated.currentDueLocalDate
                  ? dateOnly(
                      calculated.currentDueLocalDate,
                      'currentDueLocalDate',
                    )
                  : null,
              dueAt: manualDueAt ?? calculated.dueAt,
              includedDays: jsonSnapshot(calculated.includedDays),
              excludedDays: jsonSnapshot(calculated.excludedDays),
              calculationTrace: jsonSnapshot({
                ...calculated.calculationTrace,
                manualResolution: manualDate
                  ? {
                      dueLocalDate: manualDate,
                      reason: dto.manualDeadlineReason,
                      authority: dto.manualDeadlineAuthority,
                    }
                  : null,
              }),
              changeReason:
                dto.manualDeadlineReason ??
                'Calculo inicial desde paquete congelado',
              changeAuthority:
                dto.manualDeadlineAuthority ?? packageRecord.sourceReference,
              createdById: context.actor.id,
            },
          });
          nextStatus =
            classification.competence === PqrsdCompetence.TRANSFER_REQUIRED
              ? PqrsdDossierStatus.TRANSFER_PENDING
              : PqrsdDossierStatus.CLASSIFIED;
        }
        const versionAfter = await this.advanceDossier(
          transaction,
          classification.dossier,
          nextStatus,
          context.actor.id,
          `Revision de clasificacion: ${dto.decision}.`,
          dto.rationale,
        );
        return {
          resourceType: 'PqrsdClassificationReview',
          resourceId: review.id,
          versionBefore: classification.dossier.version,
          versionAfter,
          result: { ...review, dossierVersion: versionAfter },
        };
      },
    );
  }

  async recordAssignment(
    user: AuthenticatedUser,
    dossierId: string,
    dto: RecordPqrsdAssignmentDto,
  ) {
    if (dto.primaryAssigneeId === dto.backupAssigneeId) {
      throw new BadRequestException(
        'Responsable principal y suplente deben ser personas distintas',
      );
    }
    return this.executeCommand(
      user,
      PqrsdCommandType.ASSIGNMENT_RECORD,
      { ...dto, dossierId },
      REVIEW_ROLES,
      `dossier:${dossierId}`,
      async (transaction, context) => {
        const dossier = await this.requireDossier(
          transaction,
          user.tenantId,
          dossierId,
          dto.expectedVersion,
        );
        const approvedClassification =
          await transaction.pqrsdClassificationVersion.findFirst({
            where: {
              tenantId: user.tenantId,
              dossierId,
              review: { decision: PqrsdReviewDecision.APPROVE },
              competence: PqrsdCompetence.COMPETENT,
            },
            orderBy: { versionNumber: 'desc' },
          });
        if (!approvedClassification) {
          throw new ConflictException(
            'La asignacion exige clasificacion y competencia aprobadas',
          );
        }
        await Promise.all([
          this.requireAssignableUser(
            transaction,
            user.tenantId,
            dto.primaryAssigneeId,
          ),
          this.requireAssignableUser(
            transaction,
            user.tenantId,
            dto.backupAssigneeId,
          ),
        ]);
        const assignment = await transaction.pqrsdAssignmentEvent.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            dossierId,
            primaryAssigneeId: dto.primaryAssigneeId,
            backupAssigneeId: dto.backupAssigneeId,
            reason: dto.reason,
            effectiveAt: dateTime(dto.effectiveAt, 'effectiveAt'),
            actorId: context.actor.id,
          },
        });
        const versionAfter = await this.advanceDossier(
          transaction,
          dossier,
          PqrsdDossierStatus.ASSIGNED,
          context.actor.id,
          'Responsable principal y suplente asignados.',
          dto.reason,
          {
            currentPrimaryAssigneeId: dto.primaryAssigneeId,
            currentBackupAssigneeId: dto.backupAssigneeId,
          },
        );
        return {
          resourceType: 'PqrsdAssignmentEvent',
          resourceId: assignment.id,
          versionBefore: dossier.version,
          versionAfter,
          result: { ...assignment, dossierVersion: versionAfter },
        };
      },
    );
  }

  async proposeTransfer(
    user: AuthenticatedUser,
    dossierId: string,
    dto: ProposePqrsdTransferDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.TRANSFER_PROPOSE,
      { ...dto, dossierId },
      INTAKE_ROLES,
      `dossier:${dossierId}`,
      async (transaction, context) => {
        const dossier = await this.requireDossier(
          transaction,
          user.tenantId,
          dossierId,
          dto.expectedVersion,
        );
        const classification =
          await transaction.pqrsdClassificationVersion.findFirst({
            where: {
              tenantId: user.tenantId,
              dossierId,
              competence: PqrsdCompetence.TRANSFER_REQUIRED,
              review: { decision: PqrsdReviewDecision.APPROVE },
            },
            orderBy: { versionNumber: 'desc' },
          });
        if (!classification) {
          throw new ConflictException(
            'El traslado exige una declaracion de falta de competencia aprobada',
          );
        }
        await this.requireApprovedDocument(
          transaction,
          user.tenantId,
          dossierId,
          dto.supportDocumentId,
          [PqrsdDocumentType.TRANSFER_SUPPORT],
        );
        const dueLocalDate = dateOnly(dto.dueLocalDate, 'dueLocalDate');
        const transfer = await transaction.pqrsdTransfer.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            dossierId,
            destination: dto.destination,
            destinationReference: dto.destinationReference,
            reason: dto.reason,
            legalAuthority: dto.legalAuthority,
            dueLocalDate,
            dueAt: civilDateTimeToUtc(dto.dueLocalDate, '23:59', dto.timeZone),
            timeZone: dto.timeZone,
            supportDocumentId: dto.supportDocumentId,
            proposedById: context.actor.id,
          },
        });
        const versionAfter = await this.advanceDossier(
          transaction,
          dossier,
          PqrsdDossierStatus.TRANSFER_PENDING,
          context.actor.id,
          'Traslado propuesto; aun no se considera remitido.',
          dto.legalAuthority,
        );
        return {
          resourceType: 'PqrsdTransfer',
          resourceId: transfer.id,
          versionBefore: dossier.version,
          versionAfter,
          result: {
            ...transfer,
            transferCompleted: false,
            dossierVersion: versionAfter,
          },
        };
      },
    );
  }

  async reviewTransfer(
    user: AuthenticatedUser,
    transferId: string,
    dto: ReviewPqrsdTransferDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.TRANSFER_REVIEW,
      { ...dto, transferId },
      REVIEW_ROLES,
      `transfer:${transferId}`,
      async (transaction, context) => {
        const transfer = await transaction.pqrsdTransfer.findFirst({
          where: { id: transferId, tenantId: user.tenantId },
          include: { review: true, dossier: true },
        });
        if (!transfer)
          throw new NotFoundException('Traslado PQRSD no encontrado');
        if (
          transfer.review ||
          transfer.dossier.version !== dto.expectedVersion
        ) {
          throw this.versionConflict('El traslado ya fue revisado o cambio');
        }
        if (transfer.proposedById === context.actor.id) {
          throw new ForbiddenException(
            'Quien propuso el traslado no puede revisarlo',
          );
        }
        const review = await transaction.pqrsdTransferReview.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            transferId,
            decision: dto.decision,
            rationale: dto.rationale,
            reviewerId: context.actor.id,
          },
        });
        const nextStatus =
          dto.decision === PqrsdReviewDecision.APPROVE
            ? PqrsdDossierStatus.TRANSFER_PENDING
            : PqrsdDossierStatus.CLASSIFICATION_PENDING;
        const versionAfter = await this.advanceDossier(
          transaction,
          transfer.dossier,
          nextStatus,
          context.actor.id,
          `Revision de traslado: ${dto.decision}.`,
          dto.rationale,
        );
        return {
          resourceType: 'PqrsdTransferReview',
          resourceId: review.id,
          versionBefore: transfer.dossier.version,
          versionAfter,
          result: { ...review, dossierVersion: versionAfter },
        };
      },
    );
  }

  async recordTransferAttempt(
    user: AuthenticatedUser,
    transferId: string,
    dto: RecordPqrsdTransferAttemptDto,
  ) {
    this.assertDeliveryFields(dto);
    return this.executeCommand(
      user,
      PqrsdCommandType.TRANSFER_ATTEMPT_RECORD,
      { ...dto, transferId },
      INTAKE_ROLES,
      `transfer:${transferId}`,
      async (transaction, context) => {
        const transfer = await transaction.pqrsdTransfer.findFirst({
          where: { id: transferId, tenantId: user.tenantId },
          include: { review: true, dossier: true },
        });
        if (!transfer)
          throw new NotFoundException('Traslado PQRSD no encontrado');
        if (
          transfer.dossier.version !== dto.expectedVersion ||
          transfer.review?.decision !== PqrsdReviewDecision.APPROVE
        ) {
          throw this.versionConflict(
            'El traslado debe estar aprobado y en la version vigente',
          );
        }
        if (dto.outcome === PqrsdDeliveryOutcome.DELIVERED) {
          await this.requireApprovedDocument(
            transaction,
            user.tenantId,
            transfer.dossierId,
            dto.evidenceDocumentId!,
            [PqrsdDocumentType.TRANSFER_PROOF],
          );
        }
        const attempt = await transaction.pqrsdTransferAttempt.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            dossierId: transfer.dossierId,
            transferId,
            attemptedAt: dateTime(dto.attemptedAt, 'attemptedAt'),
            outcome: dto.outcome,
            externalReference: dto.externalReference,
            evidenceDocumentId: dto.evidenceDocumentId,
            failureReason: dto.failureReason,
            actorId: context.actor.id,
          },
        });
        const versionAfter = await this.advanceDossier(
          transaction,
          transfer.dossier,
          PqrsdDossierStatus.TRANSFER_PENDING,
          context.actor.id,
          dto.outcome === PqrsdDeliveryOutcome.DELIVERED
            ? 'Traslado externo verificado; pendiente de cierre documentado.'
            : `Intento de traslado ${dto.outcome}; no se presume entrega.`,
          dto.externalReference ?? dto.failureReason ?? 'Intento registrado',
        );
        return {
          resourceType: 'PqrsdTransferAttempt',
          resourceId: attempt.id,
          versionBefore: transfer.dossier.version,
          versionAfter,
          result: {
            ...attempt,
            transferCompleted: dto.outcome === PqrsdDeliveryOutcome.DELIVERED,
            dossierVersion: versionAfter,
          },
        };
      },
    );
  }

  async proposeExtension(
    user: AuthenticatedUser,
    dossierId: string,
    dto: ProposePqrsdExtensionDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.EXTENSION_PROPOSE,
      { ...dto, dossierId },
      INTAKE_ROLES,
      `dossier:${dossierId}`,
      async (transaction, context) => {
        const dossier = await this.requireDossier(
          transaction,
          user.tenantId,
          dossierId,
          dto.expectedVersion,
        );
        const deadline = await transaction.pqrsdDeadlineVersion.findFirst({
          where: {
            tenantId: user.tenantId,
            dossierId,
            currentDueLocalDate: { not: null },
          },
          orderBy: { versionNumber: 'desc' },
        });
        if (!deadline?.currentDueLocalDate) {
          throw new ConflictException(
            'No se propone prorroga mientras el plazo siga ambiguo o sin determinar',
          );
        }
        const requested = dateOnly(
          dto.requestedDueLocalDate,
          'requestedDueLocalDate',
        );
        if (requested <= deadline.currentDueLocalDate) {
          throw new BadRequestException(
            'La prorroga debe proponer una fecha posterior al plazo vigente',
          );
        }
        await this.requireApprovedDocument(
          transaction,
          user.tenantId,
          dossierId,
          dto.supportDocumentId,
          [PqrsdDocumentType.EXTENSION_SUPPORT],
        );
        const extension = await transaction.pqrsdExtensionProposal.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            dossierId,
            requestedDueLocalDate: requested,
            reason: dto.reason,
            legalAuthority: dto.legalAuthority,
            supportDocumentId: dto.supportDocumentId,
            proposedById: context.actor.id,
          },
        });
        const versionAfter = await this.advanceDossier(
          transaction,
          dossier,
          PqrsdDossierStatus.EXTENSION_PROPOSED,
          context.actor.id,
          'Prorroga propuesta; el plazo no cambia hasta revision independiente.',
          dto.legalAuthority,
        );
        return {
          resourceType: 'PqrsdExtensionProposal',
          resourceId: extension.id,
          versionBefore: dossier.version,
          versionAfter,
          result: {
            ...extension,
            effective: false,
            dossierVersion: versionAfter,
          },
        };
      },
    );
  }

  async reviewExtension(
    user: AuthenticatedUser,
    extensionId: string,
    dto: ReviewPqrsdExtensionDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.EXTENSION_REVIEW,
      { ...dto, extensionId },
      AUTHORIZATION_ROLES,
      `extension:${extensionId}`,
      async (transaction, context) => {
        const extension = await transaction.pqrsdExtensionProposal.findFirst({
          where: { id: extensionId, tenantId: user.tenantId },
          include: { review: true, dossier: true },
        });
        if (!extension)
          throw new NotFoundException('Prorroga PQRSD no encontrada');
        if (
          extension.review ||
          extension.dossier.version !== dto.expectedVersion
        ) {
          throw this.versionConflict('La prorroga ya fue revisada o cambio');
        }
        if (extension.proposedById === context.actor.id) {
          throw new ForbiddenException(
            'Quien propuso la prorroga no puede decidirla',
          );
        }
        const review = await transaction.pqrsdExtensionReview.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            extensionId,
            decision: dto.decision,
            rationale: dto.rationale,
            reviewerId: context.actor.id,
          },
        });
        if (dto.decision === PqrsdReviewDecision.APPROVE) {
          const previous = await transaction.pqrsdDeadlineVersion.findFirst({
            where: { tenantId: user.tenantId, dossierId: extension.dossierId },
            orderBy: { versionNumber: 'desc' },
          });
          if (!previous?.originalDueLocalDate) {
            throw new ConflictException('No existe plazo previo reproducible');
          }
          const packageRecord =
            await transaction.pqrsdRulePackage.findFirstOrThrow({
              where: { id: previous.packageId, tenantId: user.tenantId },
            });
          const dueLocal = extension.requestedDueLocalDate
            .toISOString()
            .slice(0, 10);
          await transaction.pqrsdDeadlineVersion.create({
            data: {
              id: randomUUID(),
              tenantId: user.tenantId,
              dossierId: extension.dossierId,
              classificationId: previous.classificationId,
              packageId: previous.packageId,
              ruleDefinitionId: previous.ruleDefinitionId,
              extensionProposalId: extension.id,
              versionNumber: previous.versionNumber + 1,
              calculationStatus: PqrsdDeadlineCalculationStatus.MANUAL_REVIEWED,
              startLocalDate: previous.startLocalDate,
              startExplanation: previous.startExplanation,
              originalDueLocalDate: previous.originalDueLocalDate,
              currentDueLocalDate: extension.requestedDueLocalDate,
              dueAt: civilDateTimeToUtc(
                dueLocal,
                '23:59',
                packageRecord.timeZone,
              ),
              includedDays: previous.includedDays as Prisma.InputJsonValue,
              excludedDays: previous.excludedDays as Prisma.InputJsonValue,
              calculationTrace: jsonSnapshot({
                previousDeadlineId: previous.id,
                priorTrace: previous.calculationTrace,
                approvedExtensionId: extension.id,
                requestedDueLocalDate: dueLocal,
              }),
              changeReason: extension.reason,
              changeAuthority: extension.legalAuthority,
              createdById: context.actor.id,
            },
          });
        }
        const versionAfter = await this.advanceDossier(
          transaction,
          extension.dossier,
          PqrsdDossierStatus.IN_PROGRESS,
          context.actor.id,
          `Revision de prorroga: ${dto.decision}.`,
          dto.rationale,
        );
        return {
          resourceType: 'PqrsdExtensionReview',
          resourceId: review.id,
          versionBefore: extension.dossier.version,
          versionAfter,
          result: {
            ...review,
            deadlineChanged: dto.decision === PqrsdReviewDecision.APPROVE,
            dossierVersion: versionAfter,
          },
        };
      },
    );
  }

  async createResponseVersion(
    user: AuthenticatedUser,
    dossierId: string,
    dto: CreatePqrsdResponseVersionDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.RESPONSE_VERSION_CREATE,
      { ...dto, dossierId },
      INTAKE_ROLES,
      `dossier:${dossierId}`,
      async (transaction, context) => {
        const dossier = await this.requireDossier(
          transaction,
          user.tenantId,
          dossierId,
          dto.expectedVersion,
        );
        if (
          !dossier.currentPrimaryAssigneeId ||
          !dossier.currentBackupAssigneeId
        ) {
          throw new ConflictException(
            'La respuesta exige responsable principal y suplente vigentes',
          );
        }
        if (
          !([Role.ADMIN, Role.CONSTITUENT_SERVICES_MANAGER] as Role[]).includes(
            context.actor.role,
          ) &&
          ![
            dossier.currentPrimaryAssigneeId,
            dossier.currentBackupAssigneeId,
          ].includes(context.actor.id)
        ) {
          throw new ForbiddenException(
            'Solo responsables asignados o su jefatura pueden redactar',
          );
        }
        const approvedClassification =
          await transaction.pqrsdClassificationVersion.findFirst({
            where: {
              tenantId: user.tenantId,
              dossierId,
              competence: PqrsdCompetence.COMPETENT,
              review: { decision: PqrsdReviewDecision.APPROVE },
            },
            orderBy: { versionNumber: 'desc' },
          });
        if (!approvedClassification) {
          throw new ConflictException(
            'No se redacta respuesta sin competencia aprobada',
          );
        }
        if (dto.attachmentDocumentId) {
          await this.requireApprovedDocument(
            transaction,
            user.tenantId,
            dossierId,
            dto.attachmentDocumentId,
            [PqrsdDocumentType.RESPONSE_ATTACHMENT],
          );
        }
        const count = await transaction.pqrsdResponseVersion.count({
          where: { tenantId: user.tenantId, dossierId },
        });
        const response = await transaction.pqrsdResponseVersion.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            dossierId,
            versionNumber: count + 1,
            body: dto.body,
            contentSha256: sha256(dto.body),
            attachmentDocumentId: dto.attachmentDocumentId,
            draftedById: context.actor.id,
          },
        });
        const versionAfter = await this.advanceDossier(
          transaction,
          dossier,
          PqrsdDossierStatus.DRAFT_RESPONSE,
          context.actor.id,
          `Version ${response.versionNumber} de respuesta creada; no esta autorizada ni entregada.`,
          'Flujo interno PQRSD',
        );
        return {
          resourceType: 'PqrsdResponseVersion',
          resourceId: response.id,
          versionBefore: dossier.version,
          versionAfter,
          result: {
            ...response,
            body: undefined,
            internalStatus: 'DRAFT_NOT_AUTHORIZED' as const,
            dossierVersion: versionAfter,
          },
        };
      },
    );
  }

  async reviewResponse(
    user: AuthenticatedUser,
    responseId: string,
    dto: ReviewPqrsdResponseDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.RESPONSE_REVIEW,
      { ...dto, responseId },
      REVIEW_ROLES,
      `response:${responseId}`,
      async (transaction, context) => {
        const response = await transaction.pqrsdResponseVersion.findFirst({
          where: { id: responseId, tenantId: user.tenantId },
          include: { review: true, dossier: true },
        });
        if (!response)
          throw new NotFoundException('Respuesta PQRSD no encontrada');
        if (
          response.review ||
          response.dossier.version !== dto.expectedVersion
        ) {
          throw this.versionConflict('La respuesta ya fue revisada o cambio');
        }
        if (response.draftedById === context.actor.id) {
          throw new ForbiddenException(
            'Quien redacto no puede revisar su respuesta',
          );
        }
        const review = await transaction.pqrsdResponseReview.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            responseId,
            decision: dto.decision,
            rationale: dto.rationale,
            reviewerId: context.actor.id,
          },
        });
        const nextStatus =
          dto.decision === PqrsdResponseReviewDecision.APPROVE
            ? PqrsdDossierStatus.REVIEWED
            : PqrsdDossierStatus.RETURNED_FOR_CHANGES;
        const versionAfter = await this.advanceDossier(
          transaction,
          response.dossier,
          nextStatus,
          context.actor.id,
          `Revision de respuesta: ${dto.decision}.`,
          dto.rationale,
        );
        return {
          resourceType: 'PqrsdResponseReview',
          resourceId: review.id,
          versionBefore: response.dossier.version,
          versionAfter,
          result: { ...review, dossierVersion: versionAfter },
        };
      },
    );
  }

  async authorizeResponse(
    user: AuthenticatedUser,
    responseId: string,
    dto: AuthorizePqrsdResponseDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.RESPONSE_AUTHORIZE,
      { ...dto, responseId },
      AUTHORIZATION_ROLES,
      `response:${responseId}`,
      async (transaction, context) => {
        const response = await transaction.pqrsdResponseVersion.findFirst({
          where: { id: responseId, tenantId: user.tenantId },
          include: { review: true, authorization: true, dossier: true },
        });
        if (!response)
          throw new NotFoundException('Respuesta PQRSD no encontrada');
        if (
          response.authorization ||
          response.dossier.version !== dto.expectedVersion
        ) {
          throw this.versionConflict('La respuesta ya fue autorizada o cambio');
        }
        if (response.review?.decision !== PqrsdResponseReviewDecision.APPROVE) {
          throw new ConflictException(
            'La autorizacion exige una revision de respuesta aprobada',
          );
        }
        if (
          response.draftedById === context.actor.id ||
          response.review.reviewerId === context.actor.id
        ) {
          throw new ForbiddenException(
            'Redactor, revisor y autorizador deben ser personas distintas',
          );
        }
        if (dto.decision === PqrsdAuthorizationDecision.AUTHORIZE) {
          if (!dto.authorizationReference || !dto.authorizationDocumentId) {
            throw new BadRequestException(
              'Autorizar exige referencia y artefacto documental aprobado',
            );
          }
          await this.requireApprovedDocument(
            transaction,
            user.tenantId,
            response.dossierId,
            dto.authorizationDocumentId,
            [PqrsdDocumentType.AUTHORIZATION_ARTIFACT],
          );
        } else if (dto.authorizationReference || dto.authorizationDocumentId) {
          throw new BadRequestException(
            'Una devolucion no puede presentarse como autorizacion documentada',
          );
        }
        const authorization =
          await transaction.pqrsdResponseAuthorization.create({
            data: {
              id: randomUUID(),
              tenantId: user.tenantId,
              responseId,
              decision: dto.decision,
              rationale: dto.rationale,
              authorizationReference: dto.authorizationReference,
              authorizationDocumentId: dto.authorizationDocumentId,
              authorizerId: context.actor.id,
            },
          });
        const nextStatus =
          dto.decision === PqrsdAuthorizationDecision.AUTHORIZE
            ? PqrsdDossierStatus.AUTHORIZED
            : PqrsdDossierStatus.RETURNED_FOR_CHANGES;
        const versionAfter = await this.advanceDossier(
          transaction,
          response.dossier,
          nextStatus,
          context.actor.id,
          `Decision de autorizacion: ${dto.decision}.`,
          dto.authorizationReference ?? dto.rationale,
        );
        return {
          resourceType: 'PqrsdResponseAuthorization',
          resourceId: authorization.id,
          versionBefore: response.dossier.version,
          versionAfter,
          result: {
            ...authorization,
            externallyDelivered: false,
            dossierVersion: versionAfter,
          },
        };
      },
    );
  }

  async recordDeliveryAttempt(
    user: AuthenticatedUser,
    responseId: string,
    dto: RecordPqrsdDeliveryAttemptDto,
  ) {
    this.assertDeliveryFields(dto);
    return this.executeCommand(
      user,
      PqrsdCommandType.DELIVERY_ATTEMPT_RECORD,
      { ...dto, responseId },
      INTAKE_ROLES,
      `response:${responseId}`,
      async (transaction, context) => {
        const response = await transaction.pqrsdResponseVersion.findFirst({
          where: { id: responseId, tenantId: user.tenantId },
          include: { review: true, authorization: true, dossier: true },
        });
        if (!response)
          throw new NotFoundException('Respuesta PQRSD no encontrada');
        if (
          response.dossier.version !== dto.expectedVersion ||
          response.authorization?.decision !==
            PqrsdAuthorizationDecision.AUTHORIZE
        ) {
          throw this.versionConflict(
            'La entrega exige respuesta autorizada y version vigente',
          );
        }
        if (
          [
            response.draftedById,
            response.review?.reviewerId,
            response.authorization.authorizerId,
          ].includes(context.actor.id)
        ) {
          throw new ForbiddenException(
            'La constancia externa debe registrarla una persona distinta de redactor, revisor y autorizador',
          );
        }
        if (dto.outcome === PqrsdDeliveryOutcome.DELIVERED) {
          await this.requireApprovedDocument(
            transaction,
            user.tenantId,
            response.dossierId,
            dto.evidenceDocumentId!,
            [PqrsdDocumentType.DELIVERY_PROOF],
          );
        }
        const attempt = await transaction.pqrsdDeliveryAttempt.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            dossierId: response.dossierId,
            responseId,
            channel: dto.channel,
            attemptedAt: dateTime(dto.attemptedAt, 'attemptedAt'),
            outcome: dto.outcome,
            externalReference: dto.externalReference,
            evidenceDocumentId: dto.evidenceDocumentId,
            failureReason: dto.failureReason,
            actorId: context.actor.id,
          },
        });
        const delivered = dto.outcome === PqrsdDeliveryOutcome.DELIVERED;
        const versionAfter = await this.advanceDossier(
          transaction,
          response.dossier,
          delivered
            ? PqrsdDossierStatus.DELIVERED
            : PqrsdDossierStatus.DELIVERY_PENDING,
          context.actor.id,
          delivered
            ? 'Entrega externa verificada con constancia aprobada.'
            : `Intento ${dto.outcome}; la respuesta sigue pendiente de entrega.`,
          dto.externalReference ?? dto.failureReason ?? 'Intento de entrega',
        );
        return {
          resourceType: 'PqrsdDeliveryAttempt',
          resourceId: attempt.id,
          versionBefore: response.dossier.version,
          versionAfter,
          result: {
            ...attempt,
            externallyDelivered: delivered,
            dossierVersion: versionAfter,
          },
        };
      },
    );
  }

  async closeDossier(
    user: AuthenticatedUser,
    dossierId: string,
    dto: ClosePqrsdDossierDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.DOSSIER_CLOSE,
      { ...dto, dossierId },
      AUTHORIZATION_ROLES,
      `dossier:${dossierId}`,
      async (transaction, context) => {
        const dossier = await this.requireDossier(
          transaction,
          user.tenantId,
          dossierId,
          dto.expectedVersion,
        );
        if (dto.cause === PqrsdClosureCause.RESPONSE_DELIVERED) {
          const delivery = await transaction.pqrsdDeliveryAttempt.findFirst({
            where: {
              tenantId: user.tenantId,
              dossierId,
              outcome: PqrsdDeliveryOutcome.DELIVERED,
            },
            orderBy: { attemptedAt: 'desc' },
          });
          if (!delivery || delivery.actorId === context.actor.id) {
            throw new ConflictException(
              'El cierre exige entrega verificada por una persona distinta',
            );
          }
        } else if (dto.cause === PqrsdClosureCause.TRANSFER_COMPLETED) {
          const transfer = await transaction.pqrsdTransferAttempt.findFirst({
            where: {
              tenantId: user.tenantId,
              dossierId,
              outcome: PqrsdDeliveryOutcome.DELIVERED,
            },
            orderBy: { attemptedAt: 'desc' },
          });
          if (!transfer || transfer.actorId === context.actor.id) {
            throw new ConflictException(
              'El cierre exige traslado verificado por una persona distinta',
            );
          }
        } else {
          if (!dto.supportDocumentId) {
            throw new BadRequestException(
              'Una causal distinta de entrega o traslado exige soporte aprobado',
            );
          }
          await this.requireApprovedDocument(
            transaction,
            user.tenantId,
            dossierId,
            dto.supportDocumentId,
            [PqrsdDocumentType.CLOSURE_SUPPORT],
          );
        }
        const sequence =
          (await transaction.pqrsdClosure.count({
            where: { tenantId: user.tenantId, dossierId },
          })) + 1;
        const closure = await transaction.pqrsdClosure.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            dossierId,
            sequence,
            cause: dto.cause,
            rationale: dto.rationale,
            legalAuthority: dto.legalAuthority,
            supportDocumentId: dto.supportDocumentId,
            actorId: context.actor.id,
            closedAt: dateTime(dto.closedAt, 'closedAt'),
          },
        });
        const versionAfter = await this.advanceDossier(
          transaction,
          dossier,
          PqrsdDossierStatus.CLOSED,
          context.actor.id,
          `Cierre documentado por causal ${dto.cause}.`,
          dto.legalAuthority,
        );
        return {
          resourceType: 'PqrsdClosure',
          resourceId: closure.id,
          versionBefore: dossier.version,
          versionAfter,
          result: { ...closure, dossierVersion: versionAfter },
        };
      },
    );
  }

  async reopenDossier(
    user: AuthenticatedUser,
    dossierId: string,
    dto: ReopenPqrsdDossierDto,
  ) {
    return this.executeCommand(
      user,
      PqrsdCommandType.DOSSIER_REOPEN,
      { ...dto, dossierId },
      AUTHORIZATION_ROLES,
      `dossier:${dossierId}`,
      async (transaction, context) => {
        const dossier = await this.requireDossier(
          transaction,
          user.tenantId,
          dossierId,
          dto.expectedVersion,
          true,
        );
        if (dossier.status !== PqrsdDossierStatus.CLOSED) {
          throw new ConflictException(
            'Solo un expediente cerrado puede reabrirse',
          );
        }
        const closure = await transaction.pqrsdClosure.findFirst({
          where: { tenantId: user.tenantId, dossierId },
          orderBy: { sequence: 'desc' },
        });
        if (!closure)
          throw new ConflictException('No existe cierre documentado');
        if (closure.actorId === context.actor.id) {
          throw new ForbiddenException(
            'Quien cerro el expediente no puede autorizar su reapertura',
          );
        }
        const support = await this.requireApprovedDocument(
          transaction,
          user.tenantId,
          dossierId,
          dto.supportDocumentId,
          [PqrsdDocumentType.REOPENING_SUPPORT],
        );
        if (support.createdById === context.actor.id) {
          throw new ForbiddenException(
            'Quien preparo el soporte no puede autorizar la reapertura',
          );
        }
        const reopening = await transaction.pqrsdReopening.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            dossierId,
            closureId: closure.id,
            reason: dto.reason,
            legalAuthority: dto.legalAuthority,
            supportDocumentId: dto.supportDocumentId,
            actorId: context.actor.id,
            reopenedAt: dateTime(dto.reopenedAt, 'reopenedAt'),
          },
        });
        await transaction.$queryRaw<Array<{ configured: string }>>(Prisma.sql`
          SELECT set_config('app.pqrsd_reopen_authorized', 'on', TRUE) AS configured
        `);
        const versionAfter = await this.advanceDossier(
          transaction,
          dossier,
          PqrsdDossierStatus.REOPENED,
          context.actor.id,
          'Reapertura excepcional documentada y autorizada.',
          dto.legalAuthority,
        );
        return {
          resourceType: 'PqrsdReopening',
          resourceId: reopening.id,
          versionBefore: dossier.version,
          versionAfter,
          result: { ...reopening, dossierVersion: versionAfter },
        };
      },
    );
  }

  private async executeCommand<T, TInput extends PqrsdCommandDto & object>(
    user: AuthenticatedUser,
    type: PqrsdCommandType,
    input: TInput,
    allowedRoles: readonly Role[],
    resourceLock: string,
    operation: (
      transaction: Tx,
      context: MutationContext,
    ) => Promise<CommandResult<T>>,
  ): Promise<T> {
    const expectedHash = computePqrsdCommandSha256(
      type as PqrsdCommandName,
      input,
    );
    if (expectedHash !== input.payloadSha256) {
      throw new BadRequestException({
        code: 'PQRSD_PAYLOAD_HASH_MISMATCH',
        message:
          'La huella canonica no coincide; no se ejecuto ninguna mutacion',
        expectedPayloadSha256: expectedHash,
      });
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.lockAdvisory(
          transaction,
          `pqrsd:${user.tenantId}:${resourceLock}`,
        );
        const context = await this.requireMutationContext(
          transaction,
          user,
          allowedRoles,
        );
        const replay = await transaction.pqrsdCommand.findUnique({
          where: {
            tenantId_commandId: {
              tenantId: user.tenantId,
              commandId: input.clientRequestId,
            },
          },
        });
        if (replay) {
          if (
            replay.commandType !== type ||
            replay.payloadSha256 !== input.payloadSha256 ||
            replay.actorId !== context.actor.id
          ) {
            throw new ConflictException(
              'El UUID de comando ya fue usado con otro contenido, tipo o actor',
            );
          }
          return replay.resultSnapshot as T;
        }
        const result = await operation(transaction, context);
        const snapshot = jsonSnapshot(result.result);
        await transaction.pqrsdCommand.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            commandId: input.clientRequestId,
            commandType: type,
            payloadSha256: input.payloadSha256,
            resultSnapshot: snapshot,
            actorId: context.actor.id,
            versionBefore: result.versionBefore,
            versionAfter: result.versionAfter,
          },
        });
        await transaction.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode: PoliticalOperationMode.PUBLIC_OFFICE,
            actorType: AuditActorType.USER,
            actorUserId: context.actor.id,
            action: `PQRSD_${type}`,
            resourceType: result.resourceType,
            resourceId: result.resourceId,
            metadata: {
              clientRequestId: input.clientRequestId,
              payloadSha256: input.payloadSha256,
              versionBefore: result.versionBefore ?? null,
              versionAfter: result.versionAfter ?? null,
              piiStoredInAudit: false,
            },
          },
        });
        return result.result;
      }, SERIALIZABLE_OPTIONS);
    } catch (error) {
      if (this.isPrismaError(error, 'P2034')) {
        throw this.versionConflict(
          'El expediente cambio al mismo tiempo; recargue y reintente',
        );
      }
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'El comando, version o control ya existe; recargue para reconciliar',
        );
      }
      throw error;
    }
  }

  private async requireReadContext(transaction: Tx, user: AuthenticatedUser) {
    const [tenant, actor] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: { id: true, type: true },
      }),
      transaction.user.findFirst({
        where: {
          id: user.userId,
          tenantId: user.tenantId,
          isActive: true,
          role: { in: [...PQRSD_READ_ROLES] },
        },
        select: { id: true, role: true },
      }),
    ]);
    if (tenant?.type !== TenantType.PUBLIC_OFFICE) {
      throw new ForbiddenException(
        'PQRSD formal esta disponible exclusivamente para entidades PUBLIC_OFFICE',
      );
    }
    if (!actor) {
      throw new ForbiddenException(
        'El usuario no tiene acceso vigente al expediente PQRSD',
      );
    }
    return { actor };
  }

  private async requireMutationContext(
    transaction: Tx,
    user: AuthenticatedUser,
    allowedRoles: readonly Role[],
  ): Promise<MutationContext> {
    const [tenant, actor] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: { id: true, type: true },
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
    ]);
    if (tenant?.type !== TenantType.PUBLIC_OFFICE) {
      throw new ForbiddenException(
        'PQRSD formal esta restringido a tenants PUBLIC_OFFICE',
      );
    }
    if (!actor) {
      throw new ForbiddenException(
        'El actor no esta activo o su rol no autoriza esta operacion PQRSD',
      );
    }
    return { actor };
  }

  private async requireDossier(
    transaction: Tx,
    tenantId: string,
    dossierId: string,
    expectedVersion: number,
    allowClosed = false,
  ) {
    const dossier = await transaction.pqrsdDossier.findFirst({
      where: { id: dossierId, tenantId },
    });
    if (!dossier) throw new NotFoundException('Expediente PQRSD no encontrado');
    if (dossier.version !== expectedVersion) throw this.versionConflict();
    if (dossier.status === PqrsdDossierStatus.CLOSED && !allowClosed) {
      throw new ConflictException({
        code: 'PQRSD_DOSSIER_CLOSED',
        message: 'El expediente cerrado esta en solo lectura',
      });
    }
    return dossier;
  }

  private async advanceDossier(
    transaction: Tx,
    dossier: {
      id: string;
      tenantId: string;
      status: PqrsdDossierStatus;
      version: number;
    },
    nextStatus: PqrsdDossierStatus,
    actorId: string,
    reason: string,
    authority: string,
    assignment?: {
      currentPrimaryAssigneeId: string;
      currentBackupAssigneeId: string;
    },
  ): Promise<number> {
    const changed = await transaction.pqrsdDossier.updateMany({
      where: {
        id: dossier.id,
        tenantId: dossier.tenantId,
        version: dossier.version,
        status: dossier.status,
      },
      data: {
        status: nextStatus,
        version: { increment: 1 },
        ...assignment,
      },
    });
    if (changed.count !== 1) throw this.versionConflict();
    await transaction.pqrsdStatusEvent.create({
      data: {
        id: randomUUID(),
        tenantId: dossier.tenantId,
        dossierId: dossier.id,
        fromStatus: dossier.status,
        toStatus: nextStatus,
        reason,
        authority,
        actorId,
      },
    });
    return dossier.version + 1;
  }

  private async requireApprovedDocument(
    transaction: Tx,
    tenantId: string,
    dossierId: string,
    documentId: string,
    types: readonly PqrsdDocumentType[],
  ) {
    const document = await transaction.pqrsdDocument.findFirst({
      where: {
        id: documentId,
        tenantId,
        dossierId,
        type: { in: [...types] },
        reviews: { some: { decision: PqrsdReviewDecision.APPROVE } },
      },
    });
    if (!document) {
      throw new BadRequestException(
        'El soporte debe pertenecer al expediente, tener el tipo exigido y revision independiente aprobada',
      );
    }
    return document;
  }

  private async requireAssignableUser(
    transaction: Tx,
    tenantId: string,
    userId: string,
  ) {
    const candidate = await transaction.user.findFirst({
      where: {
        id: userId,
        tenantId,
        isActive: true,
        role: {
          in: [
            Role.ADMIN,
            Role.CONSTITUENT_SERVICES_MANAGER,
            Role.CASE_WORKER,
            Role.COMPLIANCE_OFFICER,
          ],
        },
      },
      select: { id: true },
    });
    if (!candidate) {
      throw new BadRequestException(
        'Responsable o suplente no existe, esta inactivo o tiene rol incompatible',
      );
    }
    return candidate;
  }

  private assertDeliveryFields(input: {
    outcome: PqrsdDeliveryOutcome;
    externalReference?: string;
    evidenceDocumentId?: string;
    failureReason?: string;
  }): void {
    if (input.outcome === PqrsdDeliveryOutcome.DELIVERED) {
      if (!input.externalReference || !input.evidenceDocumentId) {
        throw new BadRequestException(
          'DELIVERED exige referencia externa y constancia documental aprobada',
        );
      }
      if (input.failureReason) {
        throw new BadRequestException(
          'Una entrega verificada no puede incluir causal de falla',
        );
      }
      return;
    }
    if (input.evidenceDocumentId) {
      throw new BadRequestException(
        'Un intento no entregado no puede usar una constancia como prueba de entrega',
      );
    }
    if (
      input.outcome !== PqrsdDeliveryOutcome.PENDING_CONFIRMATION &&
      !input.failureReason
    ) {
      throw new BadRequestException(
        'La falla o rebote exige causal documentada',
      );
    }
  }

  private buildDossierAlerts(
    dossier: {
      id: string;
      reference: string;
      status: PqrsdDossierStatus;
      riskLevel: 'NORMAL' | 'HIGH';
      currentPrimaryAssignee: {
        id: string;
        name: string;
        isActive: boolean;
      } | null;
      currentBackupAssignee: {
        id: string;
        name: string;
        isActive: boolean;
      } | null;
      classifications: Array<{
        categoryLabel: string;
        competence: PqrsdCompetence;
        department: string;
        review: { decision: PqrsdReviewDecision } | null;
      }>;
      deadlines: Array<{
        calculationStatus: PqrsdDeadlineCalculationStatus;
        currentDueLocalDate: Date | null;
        dueAt: Date | null;
        package: {
          timeZone: string;
          nonWorkingWeekdays: number[];
          calendarExceptions: Array<{
            localDate: Date;
            type: 'NON_WORKING' | 'WORKING_OVERRIDE';
          }>;
        };
      }>;
    },
    now: Date,
  ) {
    if (dossier.status === PqrsdDossierStatus.CLOSED) return [];
    const href = `/dashboard/pqrsd?view=detail&entityId=${encodeURIComponent(dossier.id)}`;
    const alerts: Array<{
      code: string;
      severity: 'critical' | 'warning' | 'info';
      dossierId: string;
      reference: string;
      message: string;
      href: string;
      remainingBusinessDays: number | null;
    }> = [];
    const latestClassification = dossier.classifications[0];
    if (
      latestClassification?.review?.decision !== PqrsdReviewDecision.APPROVE
    ) {
      alerts.push({
        code: 'PQRSD_UNCLASSIFIED',
        severity: 'critical',
        dossierId: dossier.id,
        reference: dossier.reference,
        message: 'Sin clasificacion/competencia aprobada.',
        href,
        remainingBusinessDays: null,
      });
    }
    if (
      latestClassification?.review?.decision === PqrsdReviewDecision.APPROVE &&
      latestClassification.competence === PqrsdCompetence.REQUIRES_REVIEW
    ) {
      alerts.push({
        code: 'PQRSD_COMPETENCE_REQUIRES_REVIEW',
        severity: 'critical',
        dossierId: dossier.id,
        reference: dossier.reference,
        message: 'La autoridad competente aun requiere determinacion expresa.',
        href,
        remainingBusinessDays: null,
      });
    }
    if (
      latestClassification?.review?.decision === PqrsdReviewDecision.APPROVE &&
      latestClassification.competence === PqrsdCompetence.TRANSFER_REQUIRED
    ) {
      alerts.push({
        code: 'PQRSD_TRANSFER_REQUIRED',
        severity: 'warning',
        dossierId: dossier.id,
        reference: dossier.reference,
        message: 'Competencia ajena: traslado y constancia siguen requeridos.',
        href,
        remainingBusinessDays: null,
      });
    }
    if (
      latestClassification?.competence === PqrsdCompetence.COMPETENT &&
      (!dossier.currentPrimaryAssignee?.isActive ||
        !dossier.currentBackupAssignee?.isActive)
    ) {
      alerts.push({
        code: 'PQRSD_ASSIGNMENT_INCOMPLETE',
        severity: 'critical',
        dossierId: dossier.id,
        reference: dossier.reference,
        message: 'Falta responsable principal o suplente.',
        href,
        remainingBusinessDays: null,
      });
    }
    const workflowAlert =
      dossier.status === PqrsdDossierStatus.WAITING_ON_PETITIONER
        ? {
            code: 'PQRSD_WAITING_ON_PETITIONER',
            severity: 'info' as const,
            message: 'En espera de informacion del peticionario o tercero.',
          }
        : dossier.status === PqrsdDossierStatus.RETURNED_FOR_CHANGES
          ? {
              code: 'PQRSD_RESPONSE_RETURNED',
              severity: 'warning' as const,
              message: 'El borrador fue devuelto y requiere una nueva version.',
            }
          : dossier.status === PqrsdDossierStatus.AUTHORIZED ||
              dossier.status === PqrsdDossierStatus.DELIVERY_PENDING
            ? {
                code: 'PQRSD_AUTHORIZED_UNDELIVERED',
                severity: 'critical' as const,
                message:
                  'Respuesta autorizada sin constancia de entrega verificada.',
              }
            : dossier.status === PqrsdDossierStatus.REOPENED
              ? {
                  code: 'PQRSD_REOPENED',
                  severity: 'warning' as const,
                  message:
                    'Expediente reabierto; requiere nueva gestion y cierre.',
                }
              : null;
    if (workflowAlert) {
      alerts.push({
        ...workflowAlert,
        dossierId: dossier.id,
        reference: dossier.reference,
        href,
        remainingBusinessDays: null,
      });
    }
    if (dossier.riskLevel === 'HIGH') {
      alerts.push({
        code: 'PQRSD_HIGH_RISK',
        severity: 'critical',
        dossierId: dossier.id,
        reference: dossier.reference,
        message:
          'Riesgo alto marcado; requiere revision reforzada y evaluacion de incidente de datos cuando aplique.',
        href,
        remainingBusinessDays: null,
      });
    }
    const deadline = dossier.deadlines[0];
    if (
      !deadline ||
      deadline.calculationStatus ===
        PqrsdDeadlineCalculationStatus.CALCULATION_REQUIRES_REVIEW ||
      !deadline.currentDueLocalDate
    ) {
      alerts.push({
        code: 'PQRSD_DEADLINE_REQUIRES_REVIEW',
        severity: 'critical',
        dossierId: dossier.id,
        reference: dossier.reference,
        message: 'Plazo ausente o ambiguo; no se interpreta como cero dias.',
        href,
        remainingBusinessDays: null,
      });
      return alerts;
    }
    const due = deadline.currentDueLocalDate.toISOString().slice(0, 10);
    const remaining = this.businessDaysBetween(
      civilDateAt(now, deadline.package.timeZone),
      due,
      deadline.package.nonWorkingWeekdays,
      deadline.package.calendarExceptions.map((exception) => ({
        localDate: exception.localDate.toISOString().slice(0, 10),
        type: exception.type,
      })),
    );
    if (remaining < 0 || [0, 1, 3, 5, 10].includes(remaining)) {
      alerts.push({
        code:
          remaining < 0
            ? 'PQRSD_OVERDUE'
            : remaining === 0
              ? 'PQRSD_DUE_TODAY'
              : `PQRSD_DUE_IN_${remaining}_BUSINESS_DAYS`,
        severity:
          remaining <= 1 ? 'critical' : remaining <= 5 ? 'warning' : 'info',
        dossierId: dossier.id,
        reference: dossier.reference,
        message:
          remaining < 0
            ? `Vencido hace ${Math.abs(remaining)} dias habiles segun snapshot.`
            : remaining === 0
              ? 'Vence hoy segun snapshot.'
              : `Vence en ${remaining} dias habiles segun snapshot.`,
        href,
        remainingBusinessDays: remaining,
      });
    }
    return alerts;
  }

  private businessDaysBetween(
    today: string,
    due: string,
    nonWorkingWeekdays: readonly number[],
    exceptions: ReadonlyArray<{
      localDate: string;
      type: 'NON_WORKING' | 'WORKING_OVERRIDE';
    }>,
  ): number {
    if (today === due) return 0;
    const direction = today < due ? 1 : -1;
    const excluded = new Set(nonWorkingWeekdays);
    const exceptionMap = new Map(
      exceptions.map((item) => [item.localDate, item.type]),
    );
    let cursor = today;
    let count = 0;
    let guard = 0;
    while (cursor !== due) {
      cursor = addCivilDays(cursor, direction);
      const override = exceptionMap.get(cursor);
      const weekday = dateOnly(cursor, 'localDate').getUTCDay();
      const working =
        override === 'WORKING_OVERRIDE' ||
        (override !== 'NON_WORKING' && !excluded.has(weekday));
      if (working) count += direction;
      guard += 1;
      if (guard > 5_000) {
        throw new ConflictException(
          'El calendario congelado no puede evaluarse',
        );
      }
    }
    return count;
  }

  private maskName(value: string): string {
    return value
      .split(/\s+/u)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1)}***`)
      .join(' ');
  }

  private maskDocument(value: string): string {
    return `****${value.replace(/\s/gu, '').slice(-4)}`;
  }

  private maskEmail(value: string): string {
    const [local, domain] = value.split('@');
    return `${local?.slice(0, 1) ?? '*'}***@${domain ?? '***'}`;
  }

  private maskPhone(value: string): string {
    return `***${value.replace(/\D/gu, '').slice(-4)}`;
  }

  private async lockAdvisory(transaction: Tx, lockKey: string) {
    await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      WITH pqrsd_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      )
      SELECT TRUE AS "locked" FROM pqrsd_lock
    `);
  }

  private versionConflict(
    message = 'La version cambio; recargue antes de continuar',
  ) {
    return new ConflictException({
      code: 'PQRSD_VERSION_CONFLICT',
      message,
    });
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
