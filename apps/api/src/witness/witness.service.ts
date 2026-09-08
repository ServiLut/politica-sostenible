import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  DivisionType,
  E14FormType,
  PoliticalOperationMode,
  Prisma,
  Role,
  StorageObjectModule,
  WitnessCredentialType,
  WitnessReclamationGround,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWitnessReportDto } from './dto/create-witness-report.dto';
import { ListWitnessReportsQueryDto } from './dto/list-witness-reports-query.dto';
import { ReviewWitnessReportDto } from './dto/review-witness-report.dto';
import { UpdatePollingPlaceProfileDto } from './dto/update-polling-place-profile.dto';
import { isOwnedCanonicalStoragePath } from '../common/utils/tenant-storage-path.util';
import {
  assertCandidacyCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import { consumeConfirmedStorageUpload } from '../common/utils/confirmed-storage-upload.util';
import { resolveTerritorialAccess } from '../common/utils/territorial-access.util';

const WITNESS_OPERATION_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;

const WITNESS_REVIEW_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.ZONE_COORDINATOR,
] as const;

const WITNESS_PROFILE_ROLES = [Role.ADMIN, Role.CAMPAIGN_MANAGER] as const;

const TERRITORIALLY_SCOPED_WITNESS_ROLES = [
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
] as const;

const TERRITORIALLY_SCOPED_REVIEW_ROLES = [Role.ZONE_COORDINATOR] as const;

const WITNESS_READ_ROLES = [
  ...WITNESS_OPERATION_ROLES,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
] as const;

const CHECK_IN_CLOCK_SKEW_MS = 5 * 60 * 1000;

const WITNESS_REPORT_VIEW_SELECT = {
  id: true,
  witnessId: true,
  puestoId: true,
  mesa: true,
  credentialType: true,
  credentialReference: true,
  checkedInAt: true,
  e14FormType: true,
  candidateVotes: true,
  blankVotes: true,
  nullVotes: true,
  unmarkedVotes: true,
  totalTableVotes: true,
  hasWrittenClaim: true,
  reclamationGround: true,
  reclamationDescription: true,
  observations: true,
  isSynced: true,
  status: true,
  reviewerId: true,
  reviewReason: true,
  reviewedAt: true,
  supersededById: true,
  createdAt: true,
  updatedAt: true,
  puesto: { select: { code: true, name: true, expectedTables: true } },
  witness: { select: { id: true, name: true } },
  reviewer: { select: { id: true, name: true } },
} satisfies Prisma.WitnessReportSelect;

type WitnessReportView = Prisma.WitnessReportGetPayload<{
  select: typeof WITNESS_REPORT_VIEW_SELECT;
}>;

type WitnessTransaction = Prisma.TransactionClient;

export interface CreateWitnessReportOptions {
  isSynced?: boolean;
  source?: 'WEB' | 'OFFLINE_SYNC';
}

interface TableFingerprint {
  puestoId: string;
  mesa: number;
  candidateVotes: number;
  blankVotes: number | null;
  nullVotes: number | null;
  unmarkedVotes: number | null;
  totalTableVotes: number;
  status: WitnessReportStatus;
}

interface NormalizedWitnessTraceability {
  credentialType: WitnessCredentialType;
  credentialReference: string;
  checkedInAt: Date;
  e14FormType: E14FormType;
  blankVotes: number;
  nullVotes: number;
  unmarkedVotes: number;
  hasWrittenClaim: boolean;
  reclamationGround?: WitnessReclamationGround;
  reclamationDescription?: string;
}

@Injectable()
export class WitnessService {
  constructor(private prisma: PrismaService) {}

  async create(
    tenantId: string,
    witnessId: string,
    data: CreateWitnessReportDto,
    options: CreateWitnessReportOptions = {},
  ) {
    await this.assertCampaignMode(tenantId);
    const traceability = this.normalizeTraceability(data);
    this.assertVoteTotals(data);
    this.assertPrivateEvidencePath(tenantId, data.e14ImageUrl);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const access = await resolveTerritorialAccess({
            client: transaction,
            tenantId,
            userId: witnessId,
            allowedRoles: WITNESS_OPERATION_ROLES,
            territoriallyScopedRoles: TERRITORIALLY_SCOPED_WITNESS_ROLES,
          });

          this.assertDivisionAccess(access.divisionIds, data.puestoId);

          const puesto = await transaction.politicalDivision.findFirst({
            where: {
              id: data.puestoId,
              tenantId,
              type: DivisionType.PUESTO,
            },
            select: { id: true, expectedTables: true },
          });

          if (!puesto) {
            throw new BadRequestException(
              'Puesto invalido para la campana autenticada',
            );
          }

          if (puesto.expectedTables && data.mesa > puesto.expectedTables) {
            throw new BadRequestException(
              `La mesa supera las ${puesto.expectedTables} mesas configuradas para el puesto`,
            );
          }

          const existingByEvidence = await transaction.witnessReport.findFirst({
            where: { tenantId, e14ImageUrl: data.e14ImageUrl },
            select: {
              id: true,
              witnessId: true,
              puestoId: true,
              mesa: true,
              credentialType: true,
              credentialReference: true,
              checkedInAt: true,
              e14FormType: true,
              candidateVotes: true,
              blankVotes: true,
              nullVotes: true,
              unmarkedVotes: true,
              totalTableVotes: true,
              hasWrittenClaim: true,
              reclamationGround: true,
              reclamationDescription: true,
              observations: true,
              isSynced: true,
            },
          });

          if (existingByEvidence) {
            if (
              existingByEvidence.witnessId === witnessId &&
              existingByEvidence.puestoId === data.puestoId &&
              existingByEvidence.mesa === data.mesa &&
              existingByEvidence.credentialType ===
                traceability.credentialType &&
              existingByEvidence.credentialReference ===
                traceability.credentialReference &&
              existingByEvidence.checkedInAt?.getTime() ===
                traceability.checkedInAt.getTime() &&
              existingByEvidence.e14FormType === traceability.e14FormType &&
              existingByEvidence.candidateVotes === data.candidateVotes &&
              existingByEvidence.blankVotes === traceability.blankVotes &&
              existingByEvidence.nullVotes === traceability.nullVotes &&
              existingByEvidence.unmarkedVotes === traceability.unmarkedVotes &&
              existingByEvidence.totalTableVotes === data.totalTableVotes &&
              existingByEvidence.hasWrittenClaim ===
                traceability.hasWrittenClaim &&
              (existingByEvidence.reclamationGround ?? undefined) ===
                traceability.reclamationGround &&
              (existingByEvidence.reclamationDescription ?? undefined) ===
                traceability.reclamationDescription &&
              (existingByEvidence.observations ?? undefined) ===
                data.observations &&
              existingByEvidence.isSynced === (options.isSynced ?? false)
            ) {
              const idempotent = await transaction.witnessReport.findFirst({
                where: { id: existingByEvidence.id, tenantId },
                select: WITNESS_REPORT_VIEW_SELECT,
              });
              if (!idempotent) {
                throw new ConflictException(
                  'El reporte cambio durante la operacion; intente nuevamente',
                );
              }
              return this.presentReport(
                idempotent,
                await this.isTableDivergent(
                  transaction,
                  tenantId,
                  idempotent.puestoId,
                  idempotent.mesa,
                ),
              );
            }

            throw new ConflictException(
              'La evidencia ya esta asociada a otro reporte E-14',
            );
          }

          const report = await transaction.witnessReport.create({
            data: {
              tenantId,
              witnessId,
              puestoId: data.puestoId,
              mesa: data.mesa,
              ...traceability,
              e14ImageUrl: data.e14ImageUrl,
              candidateVotes: data.candidateVotes,
              totalTableVotes: data.totalTableVotes,
              observations: data.observations,
              isSynced: options.isSynced ?? false,
              status: WitnessReportStatus.PENDING,
            },
            select: WITNESS_REPORT_VIEW_SELECT,
          });

          await consumeConfirmedStorageUpload(
            transaction,
            tenantId,
            data.e14ImageUrl,
            StorageObjectModule.E14,
            'WitnessReport',
            report.id,
            witnessId,
          );

          await transaction.auditEvent.create({
            data: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              actorType: AuditActorType.USER,
              actorUserId: witnessId,
              action: 'E14_REPORT_SUBMITTED',
              resourceType: 'WitnessReport',
              resourceId: report.id,
              after: this.auditSnapshot(report),
              metadata: {
                source: options.source ?? 'WEB',
                hasPrivateEvidence: true,
              },
            },
          });

          const divergent = await this.isTableDivergent(
            transaction,
            tenantId,
            report.puestoId,
            report.mesa,
          );
          return this.presentReport(report, divergent);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      this.rethrowConcurrencyConflict(error);
    }
  }

  async findAll(
    tenantId: string,
    actorId: string,
    query: ListWitnessReportsQueryDto = new ListWitnessReportsQueryDto(),
  ) {
    await this.assertCampaignMode(tenantId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    return this.prisma.$transaction(
      async (transaction) => {
        const access = await resolveTerritorialAccess({
          client: transaction,
          tenantId,
          userId: actorId,
          allowedRoles: WITNESS_READ_ROLES,
          territoriallyScopedRoles: TERRITORIALLY_SCOPED_WITNESS_ROLES,
        });

        const scope = this.reportScope(tenantId, access.divisionIds);
        const filteredWhere: Prisma.WitnessReportWhereInput = {
          AND: [
            scope,
            {
              ...(query.status ? { status: query.status } : {}),
              ...(query.puestoId ? { puestoId: query.puestoId } : {}),
              ...(query.mesa ? { mesa: query.mesa } : {}),
            },
          ],
        };
        const placeScope: Prisma.PoliticalDivisionWhereInput = {
          tenantId,
          type: DivisionType.PUESTO,
          ...(access.divisionIds === null
            ? {}
            : { id: { in: access.divisionIds } }),
        };

        const [
          reports,
          total,
          statusGroups,
          acceptedTotals,
          acceptedTables,
          totalPlaces,
          configuredPlaces,
          expectedTables,
          fingerprints,
        ] = await Promise.all([
          transaction.witnessReport.findMany({
            where: filteredWhere,
            select: WITNESS_REPORT_VIEW_SELECT,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * limit,
            take: limit,
          }),
          transaction.witnessReport.count({ where: filteredWhere }),
          transaction.witnessReport.groupBy({
            by: ['status'],
            where: scope,
            _count: { _all: true },
          }),
          transaction.witnessReport.aggregate({
            where: { ...scope, status: WitnessReportStatus.ACCEPTED },
            _sum: { candidateVotes: true, totalTableVotes: true },
          }),
          transaction.witnessReport.count({
            where: { ...scope, status: WitnessReportStatus.ACCEPTED },
          }),
          transaction.politicalDivision.count({ where: placeScope }),
          transaction.politicalDivision.count({
            where: { ...placeScope, expectedTables: { not: null } },
          }),
          transaction.politicalDivision.aggregate({
            where: placeScope,
            _sum: { expectedTables: true },
          }),
          transaction.witnessReport.groupBy({
            by: [
              'puestoId',
              'mesa',
              'candidateVotes',
              'blankVotes',
              'nullVotes',
              'unmarkedVotes',
              'totalTableVotes',
              'status',
            ],
            where: {
              ...scope,
              status: {
                in: [WitnessReportStatus.PENDING, WitnessReportStatus.ACCEPTED],
              },
            },
          }),
        ]);

        const divergences = this.collectDivergentTables(
          fingerprints as TableFingerprint[],
        );
        const statusCounts = new Map(
          statusGroups.map((group) => [group.status, group._count._all]),
        );
        const configuredCoverage =
          totalPlaces > 0 && configuredPlaces === totalPlaces;
        const expectedTableCount = expectedTables._sum.expectedTables ?? 0;
        const percentage =
          configuredCoverage && expectedTableCount > 0
            ? Math.min(
                100,
                Math.round((acceptedTables / expectedTableCount) * 10_000) /
                  100,
              )
            : null;

        return {
          items: reports.map((report) =>
            this.presentReport(
              report,
              divergences.has(this.tableKey(report.puestoId, report.mesa)),
            ),
          ),
          pagination: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit),
          },
          summary: {
            totalReports: statusCounts.size
              ? [...statusCounts.values()].reduce(
                  (sum, count) => sum + count,
                  0,
                )
              : 0,
            pendingReports: statusCounts.get(WitnessReportStatus.PENDING) ?? 0,
            acceptedReports:
              statusCounts.get(WitnessReportStatus.ACCEPTED) ?? 0,
            rejectedReports:
              statusCounts.get(WitnessReportStatus.REJECTED) ?? 0,
            supersededReports:
              statusCounts.get(WitnessReportStatus.SUPERSEDED) ?? 0,
            pendingDivergences: divergences.size,
            acceptedCandidateVotes: acceptedTotals._sum.candidateVotes ?? 0,
            acceptedTotalVotes: acceptedTotals._sum.totalTableVotes ?? 0,
            coverage: {
              configuredPlaces,
              totalPlaces,
              acceptedTables,
              expectedTables: configuredCoverage ? expectedTableCount : null,
              percentage,
            },
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async review(
    tenantId: string,
    reviewerId: string,
    reportId: string,
    dto: ReviewWitnessReportDto,
  ) {
    await this.assertCampaignMode(tenantId);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const access = await resolveTerritorialAccess({
            client: transaction,
            tenantId,
            userId: reviewerId,
            allowedRoles: WITNESS_REVIEW_ROLES,
            territoriallyScopedRoles: TERRITORIALLY_SCOPED_REVIEW_ROLES,
          });
          const scope = this.reportScope(tenantId, access.divisionIds);
          const current = await transaction.witnessReport.findFirst({
            where: { id: reportId, ...scope },
            select: WITNESS_REPORT_VIEW_SELECT,
          });

          if (!current) {
            throw new NotFoundException('Reporte E-14 no encontrado');
          }
          if (current.witnessId === reviewerId) {
            throw new ForbiddenException(
              'El reportante no puede revisar su propio E-14',
            );
          }
          if (current.status !== WitnessReportStatus.PENDING) {
            throw new ConflictException(
              'Solo un reporte pendiente puede recibir una decision',
            );
          }
          if (
            dto.status === WitnessReportStatus.ACCEPTED &&
            !this.hasCompleteTraceability(current)
          ) {
            throw new BadRequestException(
              'Un reporte historico sin trazabilidad completa no puede aceptarse; verifique el soporte y registre un rechazo motivado',
            );
          }

          const reviewedAt = new Date();
          if (dto.status === WitnessReportStatus.ACCEPTED) {
            const previouslyAccepted =
              await transaction.witnessReport.findFirst({
                where: {
                  tenantId,
                  puestoId: current.puestoId,
                  mesa: current.mesa,
                  status: WitnessReportStatus.ACCEPTED,
                  id: { not: current.id },
                },
                select: WITNESS_REPORT_VIEW_SELECT,
              });

            if (previouslyAccepted) {
              const superseded = await transaction.witnessReport.updateMany({
                where: {
                  id: previouslyAccepted.id,
                  tenantId,
                  status: WitnessReportStatus.ACCEPTED,
                },
                data: {
                  status: WitnessReportStatus.SUPERSEDED,
                  supersededById: current.id,
                },
              });
              if (superseded.count !== 1) {
                throw new ConflictException(
                  'La conciliacion cambio durante la revision; intente nuevamente',
                );
              }

              await transaction.auditEvent.create({
                data: {
                  tenantId,
                  mode: PoliticalOperationMode.CAMPAIGN,
                  actorType: AuditActorType.USER,
                  actorUserId: reviewerId,
                  action: 'E14_REPORT_SUPERSEDED',
                  resourceType: 'WitnessReport',
                  resourceId: previouslyAccepted.id,
                  before: this.auditSnapshot(previouslyAccepted),
                  after: {
                    ...this.auditSnapshot(previouslyAccepted),
                    status: WitnessReportStatus.SUPERSEDED,
                    supersededById: current.id,
                  },
                  metadata: { replacementReportId: current.id },
                },
              });
            }
          }

          const transition = await transaction.witnessReport.updateMany({
            where: {
              id: current.id,
              tenantId,
              status: WitnessReportStatus.PENDING,
            },
            data: {
              status: dto.status,
              reviewerId,
              reviewReason: dto.reviewReason,
              reviewedAt,
            },
          });

          if (transition.count !== 1) {
            throw new ConflictException(
              'La conciliacion cambio durante la revision; intente nuevamente',
            );
          }

          const reviewed = await transaction.witnessReport.findFirst({
            where: { id: current.id, tenantId },
            select: WITNESS_REPORT_VIEW_SELECT,
          });
          if (!reviewed) {
            throw new ConflictException(
              'No fue posible confirmar la decision de conciliacion',
            );
          }

          await transaction.auditEvent.create({
            data: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              actorType: AuditActorType.USER,
              actorUserId: reviewerId,
              action:
                dto.status === WitnessReportStatus.ACCEPTED
                  ? 'E14_REPORT_ACCEPTED'
                  : 'E14_REPORT_REJECTED',
              resourceType: 'WitnessReport',
              resourceId: current.id,
              before: this.auditSnapshot(current),
              after: this.auditSnapshot(reviewed),
              metadata: { fourEyesValidated: true },
            },
          });

          return this.presentReport(
            reviewed,
            await this.isTableDivergent(
              transaction,
              tenantId,
              reviewed.puestoId,
              reviewed.mesa,
            ),
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      this.rethrowConcurrencyConflict(error);
    }
  }

  async updatePollingPlaceProfile(
    tenantId: string,
    actorId: string,
    puestoId: string,
    dto: UpdatePollingPlaceProfileDto,
  ) {
    await this.assertCampaignMode(tenantId);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await resolveTerritorialAccess({
            client: transaction,
            tenantId,
            userId: actorId,
            allowedRoles: WITNESS_PROFILE_ROLES,
            territoriallyScopedRoles: [],
          });

          const current = await transaction.politicalDivision.findFirst({
            where: { id: puestoId, tenantId, type: DivisionType.PUESTO },
            select: { id: true, code: true, name: true, expectedTables: true },
          });
          if (!current) {
            throw new NotFoundException('Puesto de votacion no encontrado');
          }

          const highestReportedTable =
            await transaction.witnessReport.aggregate({
              where: { tenantId, puestoId },
              _max: { mesa: true },
            });
          const highestMesa = highestReportedTable._max.mesa ?? 0;
          if (dto.expectedTables < highestMesa) {
            throw new BadRequestException(
              `El puesto ya tiene reportes hasta la mesa ${highestMesa}`,
            );
          }

          const updated = await transaction.politicalDivision.update({
            where: { id_tenantId: { id: puestoId, tenantId } },
            data: { expectedTables: dto.expectedTables },
            select: { id: true, code: true, name: true, expectedTables: true },
          });

          await transaction.auditEvent.create({
            data: {
              tenantId,
              mode: PoliticalOperationMode.CAMPAIGN,
              actorType: AuditActorType.USER,
              actorUserId: actorId,
              action: 'E14_POLLING_PLACE_PROFILE_UPDATED',
              resourceType: 'PoliticalDivision',
              resourceId: puestoId,
              before: current,
              after: updated,
              metadata: { changedFields: ['expectedTables'] },
            },
          });

          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      this.rethrowConcurrencyConflict(error);
    }
  }

  private assertVoteTotals(data: CreateWitnessReportDto): void {
    const counts = [
      data.candidateVotes,
      data.blankVotes,
      data.nullVotes,
      data.unmarkedVotes,
      data.totalTableVotes,
    ];
    if (
      counts.some(
        (count) => !Number.isInteger(count) || count < 0 || count > 99_999,
      )
    ) {
      throw new BadRequestException(
        'Todos los conteos de la mesa deben ser enteros entre 0 y 99.999',
      );
    }

    const classifiedVotes =
      data.candidateVotes +
      data.blankVotes +
      data.nullVotes +
      data.unmarkedVotes;
    if (classifiedVotes > data.totalTableVotes) {
      throw new BadRequestException(
        'La suma de votos del candidato, en blanco, nulos y no marcados no puede superar el total de la mesa',
      );
    }
  }

  private normalizeTraceability(
    data: CreateWitnessReportDto,
  ): NormalizedWitnessTraceability {
    if (!Object.values(WitnessCredentialType).includes(data.credentialType)) {
      throw new BadRequestException('El tipo de credencial debe ser E15 o E16');
    }
    if (!Object.values(E14FormType).includes(data.e14FormType)) {
      throw new BadRequestException(
        'Selecciona el ejemplar del formulario E-14',
      );
    }

    const credentialReference = data.credentialReference?.trim();
    if (!credentialReference || credentialReference.length > 120) {
      throw new BadRequestException(
        'La referencia de la credencial es obligatoria y admite hasta 120 caracteres',
      );
    }

    const checkedInAt = new Date(data.checkedInAt);
    if (Number.isNaN(checkedInAt.getTime())) {
      throw new BadRequestException(
        'La hora de presencia del testigo no es valida',
      );
    }
    if (checkedInAt.getTime() > Date.now() + CHECK_IN_CLOCK_SKEW_MS) {
      throw new BadRequestException(
        'La hora de presencia no puede estar en el futuro',
      );
    }

    if (typeof data.hasWrittenClaim !== 'boolean') {
      throw new BadRequestException(
        'Indica si se presento una reclamacion escrita',
      );
    }

    const reclamationDescription = data.reclamationDescription?.trim();
    if (data.hasWrittenClaim) {
      if (
        !data.reclamationGround ||
        !Object.values(WitnessReclamationGround).includes(
          data.reclamationGround,
        ) ||
        !reclamationDescription ||
        reclamationDescription.length < 20 ||
        reclamationDescription.length > 2000
      ) {
        throw new BadRequestException(
          'Una reclamacion escrita requiere causal valida y descripcion de 20 a 2.000 caracteres',
        );
      }
      if (
        data.reclamationGround ===
          WitnessReclamationGround.OTHER_STATUTORY_GROUND &&
        !/(art(?:[íi]culo)?\.?|ley|decreto|numeral)\s+/i.test(
          reclamationDescription,
        )
      ) {
        throw new BadRequestException(
          'La otra causal taxativa debe identificar la norma o el numeral aplicable',
        );
      }
    } else if (data.reclamationGround || reclamationDescription) {
      throw new BadRequestException(
        'No envies causal ni descripcion cuando no hubo reclamacion escrita',
      );
    }

    return {
      credentialType: data.credentialType,
      credentialReference,
      checkedInAt,
      e14FormType: data.e14FormType,
      blankVotes: data.blankVotes,
      nullVotes: data.nullVotes,
      unmarkedVotes: data.unmarkedVotes,
      hasWrittenClaim: data.hasWrittenClaim,
      ...(data.hasWrittenClaim
        ? {
            reclamationGround: data.reclamationGround,
            reclamationDescription,
          }
        : {}),
    };
  }

  private assertPrivateEvidencePath(tenantId: string, path: string): void {
    if (
      !isOwnedCanonicalStoragePath({
        tenantId,
        module: 'e14',
        path,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      })
    ) {
      throw new BadRequestException(
        'El E-14 debe ser una ruta privada confirmada del tenant autenticado',
      );
    }
  }

  private assertDivisionAccess(
    divisionIds: string[] | null,
    puestoId: string,
  ): void {
    if (divisionIds !== null && !divisionIds.includes(puestoId)) {
      throw new ForbiddenException(
        'El puesto no pertenece a la asignacion territorial del usuario',
      );
    }
  }

  private reportScope(
    tenantId: string,
    divisionIds: string[] | null,
  ): Prisma.WitnessReportWhereInput {
    return {
      tenantId,
      ...(divisionIds === null ? {} : { puestoId: { in: divisionIds } }),
    };
  }

  private presentReport(report: WitnessReportView, divergent: boolean) {
    return { ...report, hasEvidence: true, divergent };
  }

  private auditSnapshot(report: WitnessReportView): Prisma.InputJsonObject {
    return {
      id: report.id,
      witnessId: report.witnessId,
      puestoId: report.puestoId,
      mesa: report.mesa,
      credentialType: report.credentialType,
      credentialReference: report.credentialReference,
      checkedInAt: report.checkedInAt?.toISOString() ?? null,
      e14FormType: report.e14FormType,
      candidateVotes: report.candidateVotes,
      blankVotes: report.blankVotes,
      nullVotes: report.nullVotes,
      unmarkedVotes: report.unmarkedVotes,
      totalTableVotes: report.totalTableVotes,
      hasWrittenClaim: report.hasWrittenClaim,
      reclamationGround: report.reclamationGround,
      reclamationDescriptionPresent: report.reclamationDescription !== null,
      isSynced: report.isSynced,
      status: report.status,
      reviewerId: report.reviewerId,
      reviewReason: report.reviewReason,
      reviewedAt: report.reviewedAt?.toISOString() ?? null,
      supersededById: report.supersededById,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
      hasPrivateEvidence: true,
    };
  }

  private async isTableDivergent(
    transaction: WitnessTransaction,
    tenantId: string,
    puestoId: string,
    mesa: number,
  ): Promise<boolean> {
    const reports = await transaction.witnessReport.findMany({
      where: {
        tenantId,
        puestoId,
        mesa,
        status: {
          in: [WitnessReportStatus.PENDING, WitnessReportStatus.ACCEPTED],
        },
      },
      select: {
        candidateVotes: true,
        blankVotes: true,
        nullVotes: true,
        unmarkedVotes: true,
        totalTableVotes: true,
        status: true,
      },
    });

    return (
      reports.some(({ status }) => status === WitnessReportStatus.PENDING) &&
      new Set(reports.map((report) => this.voteFingerprint(report))).size > 1
    );
  }

  private collectDivergentTables(
    fingerprints: TableFingerprint[],
  ): Set<string> {
    const tables = new Map<
      string,
      { hasPending: boolean; fingerprints: Set<string> }
    >();

    for (const report of fingerprints) {
      const key = this.tableKey(report.puestoId, report.mesa);
      const table = tables.get(key) ?? {
        hasPending: false,
        fingerprints: new Set<string>(),
      };
      table.hasPending ||= report.status === WitnessReportStatus.PENDING;
      table.fingerprints.add(this.voteFingerprint(report));
      tables.set(key, table);
    }

    return new Set(
      [...tables.entries()]
        .filter(([, value]) => value.hasPending && value.fingerprints.size > 1)
        .map(([key]) => key),
    );
  }

  private tableKey(puestoId: string, mesa: number): string {
    return `${puestoId}:${mesa}`;
  }

  private voteFingerprint(
    report: Pick<
      TableFingerprint,
      | 'candidateVotes'
      | 'blankVotes'
      | 'nullVotes'
      | 'unmarkedVotes'
      | 'totalTableVotes'
    >,
  ): string {
    return [
      report.candidateVotes,
      report.blankVotes ?? 'legacy',
      report.nullVotes ?? 'legacy',
      report.unmarkedVotes ?? 'legacy',
      report.totalTableVotes,
    ].join(':');
  }

  private hasCompleteTraceability(report: WitnessReportView): boolean {
    return Boolean(
      report.credentialType &&
      report.credentialReference?.trim() &&
      report.checkedInAt &&
      report.e14FormType &&
      report.blankVotes !== null &&
      report.nullVotes !== null &&
      report.unmarkedVotes !== null &&
      report.hasWrittenClaim !== null &&
      (!report.hasWrittenClaim ||
        (report.reclamationGround && report.reclamationDescription?.trim())),
    );
  }

  private async assertCampaignMode(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: CAMPAIGN_TENANT_SELECT,
    });
    assertCandidacyCampaignTenant(tenant);
  }

  private rethrowConcurrencyConflict(error: unknown): never {
    if (this.isPrismaError(error, 'P2002')) {
      throw new ConflictException(
        'La evidencia ya esta asociada o la mesa fue aceptada concurrentemente',
      );
    }
    if (this.isPrismaError(error, 'P2034')) {
      throw new ConflictException(
        'La conciliacion cambio durante la operacion; intente nuevamente',
      );
    }
    throw error;
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
