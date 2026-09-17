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
  DivisionType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  Prisma,
  Role,
  WitnessAssignmentStatus,
  WitnessAssignmentType,
  WitnessCaptureContext,
  WitnessCoverageWindowCommandType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  assertCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';
import {
  resolveTerritorialAccess,
  type TerritorialAccess,
} from '../common/utils/territorial-access.util';
import { toStoredDateOnlyKey } from '../operation-profile/election-operating-window';
import { PrismaService } from '../prisma/prisma.service';
import {
  CancelWitnessAssignmentDto,
  ConfirmWitnessAssignmentDto,
  CreateWitnessCoverageWindowDto,
  CreateWitnessAssignmentDto,
  ListWitnessCoverageWindowsQueryDto,
  ListWitnessAssignmentsQueryDto,
  ReassignWitnessAssignmentDto,
  WitnessCandidateQueryDto,
  WitnessCoverageQueryDto,
  UpdateWitnessCoverageWindowDto,
} from './dto/witness-assignment.dto';
import { buildExactWitnessCoverage } from './witness-assignment-coverage';

const READ_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
  Role.ZONE_COORDINATOR,
  Role.WITNESS,
];
const PLANNER_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.ZONE_COORDINATOR,
];
const CONFIRM_ROLES: readonly Role[] = [...PLANNER_ROLES, Role.WITNESS];
const CANCEL_ROLES: readonly Role[] = [...PLANNER_ROLES, Role.WITNESS];
const TERRITORIALLY_SCOPED_ROLES: readonly Role[] = [Role.ZONE_COORDINATOR];
const ACTIVE_ASSIGNMENT_STATUSES = [
  WitnessAssignmentStatus.PLANNED,
  WitnessAssignmentStatus.CONFIRMED,
] as const;
const MUTABLE_STAGES = new Set<PoliticalOperationStage>([
  PoliticalOperationStage.PRE_CAMPAIGN,
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
]);
const SIMULATION_STAGES = new Set<PoliticalOperationStage>([
  PoliticalOperationStage.CAMPAIGN,
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
]);
const SERIALIZABLE_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;
const REPEATABLE_READ_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;

const ASSIGNMENT_SELECT = {
  id: true,
  tenantId: true,
  operationProfileId: true,
  coverageWindowId: true,
  clientRequestId: true,
  payloadSha256: true,
  captureContext: true,
  puestoId: true,
  tableStart: true,
  tableEnd: true,
  shiftStartsAt: true,
  shiftEndsAt: true,
  assignmentType: true,
  status: true,
  witnessId: true,
  confirmedAt: true,
  confirmationClientRequestId: true,
  confirmationPayloadSha256: true,
  cancelledAt: true,
  cancellationClientRequestId: true,
  cancellationPayloadSha256: true,
  cancellationReason: true,
  supersedesAssignmentId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  witness: {
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      divisionId: true,
    },
  },
  puesto: {
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isActive: true,
      expectedTables: true,
      votingDate: true,
      timeZone: true,
    },
  },
  coverageWindow: {
    select: {
      id: true,
      localDate: true,
      startsAt: true,
      endsAt: true,
      timeZone: true,
      utcOffsetMinutes: true,
      version: true,
    },
  },
} satisfies Prisma.WitnessAssignmentSelect;

const COVERAGE_WINDOW_SELECT = {
  id: true,
  tenantId: true,
  operationProfileId: true,
  clientRequestId: true,
  payloadSha256: true,
  captureContext: true,
  puestoId: true,
  localDate: true,
  startsAt: true,
  endsAt: true,
  timeZone: true,
  utcOffsetMinutes: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  puesto: {
    select: {
      id: true,
      code: true,
      name: true,
      expectedTables: true,
      votingDate: true,
      timeZone: true,
      isActive: true,
    },
  },
} satisfies Prisma.WitnessCoverageWindowSelect;

const PROFILE_SELECT = {
  id: true,
  tenantId: true,
  stage: true,
  electionDate: true,
  votingStartDate: true,
  votingEndDate: true,
  updatedAt: true,
} satisfies Prisma.OperationProfileSelect;

type SelectedAssignment = Prisma.WitnessAssignmentGetPayload<{
  select: typeof ASSIGNMENT_SELECT;
}>;
type SelectedProfile = Prisma.OperationProfileGetPayload<{
  select: typeof PROFILE_SELECT;
}>;
type SelectedCoverageWindow = Prisma.WitnessCoverageWindowGetPayload<{
  select: typeof COVERAGE_WINDOW_SELECT;
}>;
type WitnessTransaction = Prisma.TransactionClient;

interface NormalizedAssignmentInput {
  clientRequestId: string;
  coverageWindowId: string;
  witnessId: string;
  puestoId: string;
  tableStart: number;
  tableEnd: number;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  captureContext: WitnessCaptureContext;
  assignmentType: WitnessAssignmentType;
}

interface NormalizedCoverageWindowInput {
  clientRequestId: string;
  puestoId: string;
  captureContext: WitnessCaptureContext;
  localDate: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  utcOffsetMinutes: number;
}

interface AssignmentContext {
  access: TerritorialAccess;
  profile: SelectedProfile;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalAssignmentInput(input: NormalizedAssignmentInput) {
  return {
    clientRequestId: input.clientRequestId,
    coverageWindowId: input.coverageWindowId,
    witnessId: input.witnessId,
    puestoId: input.puestoId,
    tableStart: input.tableStart,
    tableEnd: input.tableEnd,
    shiftStartsAt: input.shiftStartsAt.toISOString(),
    shiftEndsAt: input.shiftEndsAt.toISOString(),
    captureContext: input.captureContext,
    assignmentType: input.assignmentType,
  };
}

export function computeWitnessAssignmentPayloadSha256(
  dto: CreateWitnessAssignmentDto,
): string {
  return sha256(
    JSON.stringify(canonicalAssignmentInput(normalizeAssignmentInput(dto))),
  );
}

export function computeWitnessAssignmentConfirmationSha256(
  assignmentId: string,
  dto: ConfirmWitnessAssignmentDto,
): string {
  return sha256(
    JSON.stringify({
      assignmentId,
      clientRequestId: dto.clientRequestId.toLowerCase(),
      expectedVersion: dto.expectedVersion,
      decision: 'CONFIRMED',
    }),
  );
}

export function computeWitnessAssignmentCancellationSha256(
  assignmentId: string,
  dto: CancelWitnessAssignmentDto,
): string {
  return sha256(
    JSON.stringify({
      assignmentId,
      clientRequestId: dto.clientRequestId.toLowerCase(),
      expectedVersion: dto.expectedVersion,
      reason: dto.reason.trim(),
      decision: 'CANCELLED',
    }),
  );
}

export function computeWitnessReassignmentPayloadSha256(
  sourceAssignmentId: string,
  dto: ReassignWitnessAssignmentDto,
): string {
  const normalized = normalizeAssignmentInput(dto);
  return sha256(
    JSON.stringify({
      sourceAssignmentId,
      expectedVersion: dto.expectedVersion,
      reason: dto.reason.trim(),
      replacement: canonicalAssignmentInput(normalized),
    }),
  );
}

function parseDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new BadRequestException(`${field} debe ser una fecha valida`);
  }
  return parsed;
}

function normalizeAssignmentInput(
  dto: CreateWitnessAssignmentDto,
): NormalizedAssignmentInput {
  return {
    clientRequestId: dto.clientRequestId.toLowerCase(),
    coverageWindowId: dto.coverageWindowId.trim(),
    witnessId: dto.witnessId.trim(),
    puestoId: dto.puestoId.trim(),
    tableStart: dto.tableStart,
    tableEnd: dto.tableEnd,
    shiftStartsAt: parseDate(dto.shiftStartsAt, 'shiftStartsAt'),
    shiftEndsAt: parseDate(dto.shiftEndsAt, 'shiftEndsAt'),
    captureContext: dto.captureContext,
    assignmentType: dto.assignmentType,
  };
}

function normalizeCoverageWindowInput(
  dto: CreateWitnessCoverageWindowDto,
): NormalizedCoverageWindowInput {
  return {
    clientRequestId: dto.clientRequestId.toLowerCase(),
    puestoId: dto.puestoId.trim(),
    captureContext: dto.captureContext,
    localDate: dto.localDate,
    startsAt: parseDate(dto.startsAt, 'startsAt'),
    endsAt: parseDate(dto.endsAt, 'endsAt'),
    timeZone: dto.timeZone.trim(),
    utcOffsetMinutes: dto.utcOffsetMinutes,
  };
}

function canonicalCoverageWindowInput(input: NormalizedCoverageWindowInput) {
  return {
    clientRequestId: input.clientRequestId,
    puestoId: input.puestoId,
    captureContext: input.captureContext,
    localDate: input.localDate,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt.toISOString(),
    timeZone: input.timeZone,
    utcOffsetMinutes: input.utcOffsetMinutes,
  };
}

export function computeWitnessCoverageWindowPayloadSha256(
  dto: CreateWitnessCoverageWindowDto,
): string {
  return sha256(
    JSON.stringify(
      canonicalCoverageWindowInput(normalizeCoverageWindowInput(dto)),
    ),
  );
}

function localDateInTimeZone(instant: Date, timeZone: string): string {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new BadRequestException('timeZone debe ser una zona IANA válida');
  }
  const parts = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function offsetMinutesAt(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  });
  const value = formatter
    .formatToParts(instant)
    .find(({ type }) => type === 'timeZoneName')?.value;
  if (value === 'GMT') return 0;
  const match = value?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    throw new BadRequestException(
      'No fue posible validar el offset UTC de la zona IANA',
    );
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class WitnessAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, query: ListWitnessAssignmentsQueryDto) {
    return this.prisma.$transaction(async (transaction) => {
      const { access, profile } = await this.getContext(
        transaction,
        user,
        READ_ROLES,
      );
      const where = this.assignmentReadWhere(
        user,
        access,
        profile.id,
        query.captureContext,
        query.puestoId,
        query.witnessId,
      );
      if (query.status) where.status = query.status;
      const page = query.page ?? 1;
      const limit = query.limit ?? 25;
      const [items, total] = await Promise.all([
        transaction.witnessAssignment.findMany({
          where,
          select: ASSIGNMENT_SELECT,
          orderBy: [
            { status: 'asc' },
            { shiftStartsAt: 'asc' },
            { puestoId: 'asc' },
            { tableStart: 'asc' },
            { id: 'asc' },
          ],
          skip: (page - 1) * limit,
          take: limit,
        }),
        transaction.witnessAssignment.count({ where }),
      ]);

      return {
        operationStage: profile.stage,
        readOnly: !MUTABLE_STAGES.has(profile.stage),
        items: items.map((assignment) => this.present(assignment)),
        pagination: {
          page,
          limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      };
    }, REPEATABLE_READ_OPTIONS);
  }

  async listCoverageWindows(
    user: AuthenticatedUser,
    query: ListWitnessCoverageWindowsQueryDto,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const { access, profile } = await this.getContext(
        transaction,
        user,
        READ_ROLES,
      );
      if (query.puestoId) this.assertPlaceAccess(access, query.puestoId);
      let allowedPlaceIds = access.divisionIds;
      if (access.role === Role.WITNESS) {
        const own = await transaction.witnessAssignment.findMany({
          where: {
            tenantId: user.tenantId,
            operationProfileId: profile.id,
            captureContext: query.captureContext,
            witnessId: user.userId,
            status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          },
          select: { puestoId: true },
          distinct: ['puestoId'],
        });
        allowedPlaceIds = own.map(({ puestoId }) => puestoId);
      }
      const items = await transaction.witnessCoverageWindow.findMany({
        where: {
          tenantId: user.tenantId,
          operationProfileId: profile.id,
          captureContext: query.captureContext,
          ...(query.puestoId
            ? { puestoId: query.puestoId }
            : allowedPlaceIds
              ? { puestoId: { in: allowedPlaceIds } }
              : {}),
        },
        select: COVERAGE_WINDOW_SELECT,
        orderBy: [
          { localDate: 'asc' },
          { startsAt: 'asc' },
          { puestoId: 'asc' },
        ],
      });
      return {
        operationStage: profile.stage,
        readOnly: !MUTABLE_STAGES.has(profile.stage),
        items: items.map((window) => this.presentCoverageWindow(window)),
      };
    }, REPEATABLE_READ_OPTIONS);
  }

  async createCoverageWindow(
    user: AuthenticatedUser,
    dto: CreateWitnessCoverageWindowDto,
  ) {
    const input = normalizeCoverageWindowInput(dto);
    const payloadSha256 = sha256(
      JSON.stringify(canonicalCoverageWindowInput(input)),
    );

    return this.runMutation(async (transaction) => {
      await this.lockMutation(transaction, user.tenantId);
      const { access, profile } = await this.getContext(
        transaction,
        user,
        PLANNER_ROLES,
      );
      this.assertMutationStage(profile, input.captureContext);
      const replay = await transaction.witnessCoverageWindowCommand.findUnique({
        where: {
          tenantId_clientRequestId: {
            tenantId: user.tenantId,
            clientRequestId: input.clientRequestId,
          },
        },
        select: {
          coverageWindowId: true,
          payloadSha256: true,
          type: true,
        },
      });
      if (replay) {
        if (
          replay.type !== WitnessCoverageWindowCommandType.CREATE ||
          replay.payloadSha256 !== payloadSha256
        ) {
          throw new ConflictException(
            'clientRequestId ya fue utilizado para otra ventana o contenido',
          );
        }
        return this.presentCoverageWindow(
          await this.requireCoverageWindow(
            transaction,
            user.tenantId,
            profile.id,
            replay.coverageWindowId,
          ),
        );
      }

      await this.validateCoverageWindowInput(
        transaction,
        user.tenantId,
        access,
        profile,
        input,
      );
      const created = await transaction.witnessCoverageWindow.create({
        data: {
          tenantId: user.tenantId,
          operationProfileId: profile.id,
          clientRequestId: input.clientRequestId,
          payloadSha256,
          captureContext: input.captureContext,
          puestoId: input.puestoId,
          localDate: new Date(`${input.localDate}T00:00:00.000Z`),
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timeZone: input.timeZone,
          utcOffsetMinutes: input.utcOffsetMinutes,
          createdById: user.userId,
          updatedById: user.userId,
        },
        select: COVERAGE_WINDOW_SELECT,
      });
      await transaction.witnessCoverageWindowCommand.create({
        data: {
          tenantId: user.tenantId,
          coverageWindowId: created.id,
          clientRequestId: input.clientRequestId,
          payloadSha256,
          type: WitnessCoverageWindowCommandType.CREATE,
          actorUserId: user.userId,
        },
      });
      await this.auditResource(
        transaction,
        user,
        'WITNESS_COVERAGE_WINDOW_CREATED',
        'WitnessCoverageWindow',
        created.id,
        {
          captureContext: created.captureContext,
          localDate: dateOnly(created.localDate),
          startsAt: created.startsAt.toISOString(),
          endsAt: created.endsAt.toISOString(),
          timeZone: created.timeZone,
          utcOffsetMinutes: created.utcOffsetMinutes,
          version: created.version,
        },
      );
      return this.presentCoverageWindow(created);
    });
  }

  async updateCoverageWindow(
    user: AuthenticatedUser,
    windowId: string,
    dto: UpdateWitnessCoverageWindowDto,
  ) {
    const clientRequestId = dto.clientRequestId.toLowerCase();
    const startsAt = parseDate(dto.startsAt, 'startsAt');
    const endsAt = parseDate(dto.endsAt, 'endsAt');
    const payloadSha256 = sha256(
      JSON.stringify({
        windowId,
        clientRequestId,
        expectedVersion: dto.expectedVersion,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timeZone: dto.timeZone.trim(),
        utcOffsetMinutes: dto.utcOffsetMinutes,
      }),
    );

    return this.runMutation(async (transaction) => {
      await this.lockMutation(transaction, user.tenantId);
      const { access, profile } = await this.getContext(
        transaction,
        user,
        PLANNER_ROLES,
      );
      this.assertMutationStage(profile);
      const replay = await transaction.witnessCoverageWindowCommand.findUnique({
        where: {
          tenantId_clientRequestId: {
            tenantId: user.tenantId,
            clientRequestId,
          },
        },
        select: { coverageWindowId: true, payloadSha256: true, type: true },
      });
      if (replay) {
        if (
          replay.coverageWindowId !== windowId ||
          replay.type !== WitnessCoverageWindowCommandType.UPDATE ||
          replay.payloadSha256 !== payloadSha256
        ) {
          throw new ConflictException(
            'clientRequestId ya fue utilizado para otra reprogramación',
          );
        }
        return this.presentCoverageWindow(
          await this.requireCoverageWindow(
            transaction,
            user.tenantId,
            profile.id,
            windowId,
          ),
        );
      }

      const current = await this.requireCoverageWindow(
        transaction,
        user.tenantId,
        profile.id,
        windowId,
      );
      this.assertPlaceAccess(access, current.puestoId);
      this.assertMutationStage(profile, current.captureContext);
      await this.validateCoverageWindowInput(
        transaction,
        user.tenantId,
        access,
        profile,
        {
          clientRequestId,
          puestoId: current.puestoId,
          captureContext: current.captureContext,
          localDate: dateOnly(current.localDate),
          startsAt,
          endsAt,
          timeZone: dto.timeZone.trim(),
          utcOffsetMinutes: dto.utcOffsetMinutes,
        },
      );
      const activeAssignments = await transaction.witnessAssignment.count({
        where: {
          tenantId: user.tenantId,
          coverageWindowId: current.id,
          status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
        },
      });
      if (activeAssignments > 0) {
        throw new ConflictException({
          code: 'WITNESS_COVERAGE_WINDOW_HAS_ASSIGNMENTS',
          message:
            'Cancela o reasigna todas las asignaciones activas antes de cambiar la ventana',
        });
      }
      const updated = await transaction.witnessCoverageWindow.updateMany({
        where: {
          id: current.id,
          tenantId: user.tenantId,
          operationProfileId: profile.id,
          version: dto.expectedVersion,
        },
        data: {
          payloadSha256,
          startsAt,
          endsAt,
          timeZone: dto.timeZone.trim(),
          utcOffsetMinutes: dto.utcOffsetMinutes,
          updatedById: user.userId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw this.coverageWindowConcurrentChange();
      await transaction.witnessCoverageWindowCommand.create({
        data: {
          tenantId: user.tenantId,
          coverageWindowId: current.id,
          clientRequestId,
          payloadSha256,
          type: WitnessCoverageWindowCommandType.UPDATE,
          actorUserId: user.userId,
        },
      });
      const result = await this.requireCoverageWindow(
        transaction,
        user.tenantId,
        profile.id,
        current.id,
      );
      await this.auditResource(
        transaction,
        user,
        'WITNESS_COVERAGE_WINDOW_UPDATED',
        'WitnessCoverageWindow',
        result.id,
        {
          startsAt: result.startsAt.toISOString(),
          endsAt: result.endsAt.toISOString(),
          timeZone: result.timeZone,
          utcOffsetMinutes: result.utcOffsetMinutes,
          version: result.version,
        },
        {
          startsAt: current.startsAt.toISOString(),
          endsAt: current.endsAt.toISOString(),
          timeZone: current.timeZone,
          utcOffsetMinutes: current.utcOffsetMinutes,
          version: current.version,
        },
      );
      return this.presentCoverageWindow(result);
    });
  }

  async coverage(user: AuthenticatedUser, query: WitnessCoverageQueryDto) {
    return this.prisma.$transaction(async (transaction) => {
      const { access, profile } = await this.getContext(
        transaction,
        user,
        READ_ROLES,
      );
      const placeWhere: Prisma.PoliticalDivisionWhereInput = {
        tenantId: user.tenantId,
        type: DivisionType.PUESTO,
        isActive: true,
      };
      if (access.divisionIds) placeWhere.id = { in: access.divisionIds };
      if (query.puestoId) {
        this.assertPlaceAccess(access, query.puestoId);
        placeWhere.id = query.puestoId;
      }

      if (access.role === Role.WITNESS) {
        const ownAssignments = await transaction.witnessAssignment.findMany({
          where: {
            tenantId: user.tenantId,
            operationProfileId: profile.id,
            captureContext: query.captureContext,
            witnessId: user.userId,
            status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          },
          select: { puestoId: true },
          distinct: ['puestoId'],
        });
        const ownPlaceIds = ownAssignments.map(({ puestoId }) => puestoId);
        if (query.puestoId && !ownPlaceIds.includes(query.puestoId)) {
          throw new ForbiddenException(
            'Un testigo solo puede consultar cobertura de sus puestos asignados',
          );
        }
        placeWhere.id = { in: ownPlaceIds };
      }

      const places = await transaction.politicalDivision.findMany({
        where: placeWhere,
        select: { id: true, code: true, name: true, expectedTables: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      });
      const [windows, assignments] =
        places.length === 0
          ? [[], []]
          : await Promise.all([
              transaction.witnessCoverageWindow.findMany({
                where: {
                  tenantId: user.tenantId,
                  operationProfileId: profile.id,
                  captureContext: query.captureContext,
                  puestoId: { in: places.map(({ id }) => id) },
                },
                select: {
                  id: true,
                  puestoId: true,
                  localDate: true,
                  startsAt: true,
                  endsAt: true,
                  timeZone: true,
                  utcOffsetMinutes: true,
                },
                orderBy: [{ localDate: 'asc' }, { startsAt: 'asc' }],
              }),
              transaction.witnessAssignment.findMany({
                where: {
                  tenantId: user.tenantId,
                  operationProfileId: profile.id,
                  captureContext: query.captureContext,
                  puestoId: { in: places.map(({ id }) => id) },
                  status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
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
            ]);
      const exact = buildExactWitnessCoverage(
        places,
        windows,
        assignments.map((assignment) => ({
          coverageWindowId: assignment.coverageWindowId,
          puestoId: assignment.puestoId,
          tableStart: assignment.tableStart,
          tableEnd: assignment.tableEnd,
          shiftStartsAt: assignment.shiftStartsAt,
          shiftEndsAt: assignment.shiftEndsAt,
          assignmentType: assignment.assignmentType,
          status: assignment.status,
          witnessEligible:
            assignment.witness.isActive &&
            assignment.witness.role === Role.WITNESS,
        })),
      );
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const start = (page - 1) * limit;
      const { places: exactPlaces, ...summary } = exact;

      return {
        operationStage: profile.stage,
        captureContext: query.captureContext,
        readinessBasis:
          'CONFIRMED_ACTIVE_WITNESS_FULL_DECLARED_WINDOW_EXACT_TABLE_PRIMARY_AND_BACKUP',
        votingWindow:
          query.captureContext === WitnessCaptureContext.REAL
            ? {
                startsOn: toStoredDateOnlyKey(profile.votingStartDate),
                endsOn: toStoredDateOnlyKey(profile.votingEndDate),
              }
            : null,
        summary,
        places: exactPlaces.slice(start, start + limit),
        pagination: {
          page,
          limit,
          total: exactPlaces.length,
          totalPages:
            exactPlaces.length === 0
              ? 0
              : Math.ceil(exactPlaces.length / limit),
        },
      };
    }, REPEATABLE_READ_OPTIONS);
  }

  async listCandidates(
    user: AuthenticatedUser,
    query: WitnessCandidateQueryDto,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const { access, profile } = await this.getContext(
        transaction,
        user,
        PLANNER_ROLES,
      );
      const where: Prisma.UserWhereInput = {
        tenantId: user.tenantId,
        role: Role.WITNESS,
        isActive: true,
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {}),
      };
      if (access.divisionIds) {
        where.divisionId = { in: access.divisionIds };
      }
      const items = await transaction.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          division: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 200,
      });
      return {
        operationStage: profile.stage,
        truncated: items.length === 200,
        items,
      };
    }, REPEATABLE_READ_OPTIONS);
  }

  async create(user: AuthenticatedUser, dto: CreateWitnessAssignmentDto) {
    const input = normalizeAssignmentInput(dto);
    const payloadSha256 = sha256(
      JSON.stringify(canonicalAssignmentInput(input)),
    );

    return this.runMutation(async (transaction) => {
      await this.lockMutation(transaction, user.tenantId);
      const { access, profile } = await this.getContext(
        transaction,
        user,
        PLANNER_ROLES,
      );
      this.assertMutationStage(profile, input.captureContext);

      const existing = await transaction.witnessAssignment.findUnique({
        where: {
          tenantId_clientRequestId: {
            tenantId: user.tenantId,
            clientRequestId: input.clientRequestId,
          },
        },
        select: ASSIGNMENT_SELECT,
      });
      if (existing) {
        this.assertIdempotent(existing, payloadSha256, 'clientRequestId');
        return this.present(existing);
      }

      await this.validateAssignmentInput(
        transaction,
        user.tenantId,
        access,
        profile,
        input,
      );
      await this.assertNoOverlap(transaction, user.tenantId, profile.id, input);
      const created = await transaction.witnessAssignment.create({
        data: {
          tenantId: user.tenantId,
          operationProfileId: profile.id,
          coverageWindowId: input.coverageWindowId,
          clientRequestId: input.clientRequestId,
          payloadSha256,
          captureContext: input.captureContext,
          puestoId: input.puestoId,
          tableStart: input.tableStart,
          tableEnd: input.tableEnd,
          shiftStartsAt: input.shiftStartsAt,
          shiftEndsAt: input.shiftEndsAt,
          assignmentType: input.assignmentType,
          witnessId: input.witnessId,
          createdById: user.userId,
        },
        select: ASSIGNMENT_SELECT,
      });
      await this.audit(
        transaction,
        user,
        'WITNESS_ASSIGNMENT_CREATED',
        created,
        {
          status: created.status,
          version: created.version,
          captureContext: created.captureContext,
          assignmentType: created.assignmentType,
          tableCount: created.tableEnd - created.tableStart + 1,
          shiftStartsAt: created.shiftStartsAt.toISOString(),
          shiftEndsAt: created.shiftEndsAt.toISOString(),
        },
      );
      return this.present(created);
    });
  }

  async confirm(
    user: AuthenticatedUser,
    assignmentId: string,
    dto: ConfirmWitnessAssignmentDto,
  ) {
    const payloadSha256 = computeWitnessAssignmentConfirmationSha256(
      assignmentId,
      dto,
    );
    const clientRequestId = dto.clientRequestId.toLowerCase();

    return this.runMutation(async (transaction) => {
      await this.lockMutation(transaction, user.tenantId);
      const { access, profile } = await this.getContext(
        transaction,
        user,
        CONFIRM_ROLES,
      );
      this.assertMutationStage(profile);
      const replay = await transaction.witnessAssignment.findFirst({
        where: {
          tenantId: user.tenantId,
          confirmationClientRequestId: clientRequestId,
        },
        select: ASSIGNMENT_SELECT,
      });
      if (replay) {
        this.assertLifecycleReplay(
          replay,
          assignmentId,
          payloadSha256,
          replay.confirmationPayloadSha256,
        );
        return this.present(replay);
      }

      const current = await this.requireAssignment(
        transaction,
        user,
        access,
        profile.id,
        assignmentId,
      );
      this.assertMutationStage(profile, current.captureContext);
      this.assertWitnessActorCanMutate(access.role, user.userId, current);
      if (current.status !== WitnessAssignmentStatus.PLANNED) {
        throw new ConflictException(
          'Solo una asignacion planificada puede confirmarse',
        );
      }
      await this.assertWitnessEligible(
        transaction,
        user.tenantId,
        current.witnessId,
      );
      const updated = await transaction.witnessAssignment.updateMany({
        where: {
          id: current.id,
          tenantId: user.tenantId,
          operationProfileId: profile.id,
          status: WitnessAssignmentStatus.PLANNED,
          version: dto.expectedVersion,
        },
        data: {
          status: WitnessAssignmentStatus.CONFIRMED,
          confirmedById: user.userId,
          confirmedAt: new Date(),
          confirmationClientRequestId: clientRequestId,
          confirmationPayloadSha256: payloadSha256,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw this.concurrentChange();
      const confirmed = await this.requireSelected(
        transaction,
        user.tenantId,
        current.id,
      );
      await this.audit(
        transaction,
        user,
        'WITNESS_ASSIGNMENT_CONFIRMED',
        confirmed,
        { status: confirmed.status, version: confirmed.version },
        { status: current.status, version: current.version },
      );
      return this.present(confirmed);
    });
  }

  async cancel(
    user: AuthenticatedUser,
    assignmentId: string,
    dto: CancelWitnessAssignmentDto,
  ) {
    const payloadSha256 = computeWitnessAssignmentCancellationSha256(
      assignmentId,
      dto,
    );
    const clientRequestId = dto.clientRequestId.toLowerCase();

    return this.runMutation(async (transaction) => {
      await this.lockMutation(transaction, user.tenantId);
      const { access, profile } = await this.getContext(
        transaction,
        user,
        CANCEL_ROLES,
      );
      this.assertMutationStage(profile);
      const replay = await transaction.witnessAssignment.findFirst({
        where: {
          tenantId: user.tenantId,
          cancellationClientRequestId: clientRequestId,
        },
        select: ASSIGNMENT_SELECT,
      });
      if (replay) {
        this.assertLifecycleReplay(
          replay,
          assignmentId,
          payloadSha256,
          replay.cancellationPayloadSha256,
        );
        return this.present(replay);
      }

      const current = await this.requireAssignment(
        transaction,
        user,
        access,
        profile.id,
        assignmentId,
      );
      this.assertMutationStage(profile, current.captureContext);
      this.assertWitnessActorCanMutate(access.role, user.userId, current);
      if (current.status === WitnessAssignmentStatus.CANCELLED) {
        throw new ConflictException('La asignacion ya fue cancelada');
      }
      const updated = await transaction.witnessAssignment.updateMany({
        where: {
          id: current.id,
          tenantId: user.tenantId,
          operationProfileId: profile.id,
          status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          version: dto.expectedVersion,
        },
        data: {
          status: WitnessAssignmentStatus.CANCELLED,
          cancelledById: user.userId,
          cancelledAt: new Date(),
          cancellationClientRequestId: clientRequestId,
          cancellationPayloadSha256: payloadSha256,
          cancellationReason: dto.reason.trim(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw this.concurrentChange();
      const cancelled = await this.requireSelected(
        transaction,
        user.tenantId,
        current.id,
      );
      await this.audit(
        transaction,
        user,
        'WITNESS_ASSIGNMENT_CANCELLED',
        cancelled,
        { status: cancelled.status, version: cancelled.version },
        { status: current.status, version: current.version },
      );
      return this.present(cancelled);
    });
  }

  async reassign(
    user: AuthenticatedUser,
    sourceAssignmentId: string,
    dto: ReassignWitnessAssignmentDto,
  ) {
    const input = normalizeAssignmentInput(dto);
    const payloadSha256 = computeWitnessReassignmentPayloadSha256(
      sourceAssignmentId,
      dto,
    );

    return this.runMutation(async (transaction) => {
      await this.lockMutation(transaction, user.tenantId);
      const { access, profile } = await this.getContext(
        transaction,
        user,
        PLANNER_ROLES,
      );
      this.assertMutationStage(profile, input.captureContext);
      const replay = await transaction.witnessAssignment.findUnique({
        where: {
          tenantId_clientRequestId: {
            tenantId: user.tenantId,
            clientRequestId: input.clientRequestId,
          },
        },
        select: ASSIGNMENT_SELECT,
      });
      if (replay) {
        this.assertIdempotent(replay, payloadSha256, 'clientRequestId');
        if (replay.supersedesAssignmentId !== sourceAssignmentId) {
          throw new ConflictException(
            'clientRequestId ya identifica una reasignacion diferente',
          );
        }
        return this.present(replay);
      }

      const source = await this.requireAssignment(
        transaction,
        user,
        access,
        profile.id,
        sourceAssignmentId,
      );
      if (source.status === WitnessAssignmentStatus.CANCELLED) {
        throw new ConflictException(
          'No se puede reasignar una asignacion cancelada',
        );
      }
      await this.validateAssignmentInput(
        transaction,
        user.tenantId,
        access,
        profile,
        input,
      );
      await this.assertNoOverlap(
        transaction,
        user.tenantId,
        profile.id,
        input,
        source.id,
      );
      const cancellation = await transaction.witnessAssignment.updateMany({
        where: {
          id: source.id,
          tenantId: user.tenantId,
          operationProfileId: profile.id,
          status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          version: dto.expectedVersion,
        },
        data: {
          status: WitnessAssignmentStatus.CANCELLED,
          cancelledById: user.userId,
          cancelledAt: new Date(),
          cancellationClientRequestId: input.clientRequestId,
          cancellationPayloadSha256: payloadSha256,
          cancellationReason: dto.reason.trim(),
          version: { increment: 1 },
        },
      });
      if (cancellation.count !== 1) throw this.concurrentChange();

      const replacement = await transaction.witnessAssignment.create({
        data: {
          tenantId: user.tenantId,
          operationProfileId: profile.id,
          coverageWindowId: input.coverageWindowId,
          clientRequestId: input.clientRequestId,
          payloadSha256,
          captureContext: input.captureContext,
          puestoId: input.puestoId,
          tableStart: input.tableStart,
          tableEnd: input.tableEnd,
          shiftStartsAt: input.shiftStartsAt,
          shiftEndsAt: input.shiftEndsAt,
          assignmentType: input.assignmentType,
          witnessId: input.witnessId,
          createdById: user.userId,
          supersedesAssignmentId: source.id,
        },
        select: ASSIGNMENT_SELECT,
      });
      await this.audit(
        transaction,
        user,
        'WITNESS_ASSIGNMENT_REASSIGNED',
        replacement,
        {
          status: replacement.status,
          version: replacement.version,
          supersedesAssignmentId: source.id,
        },
        { status: source.status, version: source.version },
      );
      return this.present(replacement);
    });
  }

  private async getContext(
    transaction: WitnessTransaction,
    user: AuthenticatedUser,
    roles: readonly Role[],
  ): Promise<AssignmentContext> {
    const [tenant, profile, access] = await Promise.all([
      transaction.tenant.findUnique({
        where: { id: user.tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      transaction.operationProfile.findUnique({
        where: { tenantId: user.tenantId },
        select: PROFILE_SELECT,
      }),
      resolveTerritorialAccess({
        client: transaction,
        tenantId: user.tenantId,
        userId: user.userId,
        allowedRoles: roles,
        territoriallyScopedRoles: TERRITORIALLY_SCOPED_ROLES,
      }),
    ]);
    assertCampaignTenant(tenant);
    if (!profile) {
      throw new ConflictException({
        code: 'OPERATION_STAGE_NOT_CONFIGURED',
        message:
          'Configura o adopta el perfil electoral antes de planificar testigos',
      });
    }
    return { access, profile };
  }

  private assignmentReadWhere(
    user: AuthenticatedUser,
    access: TerritorialAccess,
    operationProfileId: string,
    captureContext: WitnessCaptureContext,
    puestoId?: string,
    witnessId?: string,
  ): Prisma.WitnessAssignmentWhereInput {
    if (puestoId) this.assertPlaceAccess(access, puestoId);
    if (
      access.role === Role.WITNESS &&
      witnessId &&
      witnessId !== user.userId
    ) {
      throw new ForbiddenException(
        'Un testigo solo puede consultar sus propias asignaciones',
      );
    }
    return {
      tenantId: user.tenantId,
      operationProfileId,
      captureContext,
      ...(access.role === Role.WITNESS
        ? { witnessId: user.userId }
        : witnessId
          ? { witnessId }
          : {}),
      ...(puestoId
        ? { puestoId }
        : access.divisionIds
          ? { puestoId: { in: access.divisionIds } }
          : {}),
    };
  }

  private assertMutationStage(
    profile: SelectedProfile,
    captureContext?: WitnessCaptureContext,
  ): void {
    if (!MUTABLE_STAGES.has(profile.stage)) {
      throw new ConflictException({
        code:
          profile.stage === PoliticalOperationStage.CLOSED
            ? 'OPERATION_CLOSED'
            : 'WITNESS_PLANNING_READ_ONLY',
        message:
          'La planificacion de testigos es de solo lectura en la etapa actual',
        currentStage: profile.stage,
      });
    }
    if (
      captureContext === WitnessCaptureContext.SIMULATION &&
      !SIMULATION_STAGES.has(profile.stage)
    ) {
      throw new ConflictException({
        code: 'WITNESS_SIMULATION_STAGE_NOT_ALLOWED',
        message:
          'Las asignaciones de simulacro solo se gestionan durante campana, preparacion o simulacro',
        currentStage: profile.stage,
      });
    }
  }

  private async validateAssignmentInput(
    transaction: WitnessTransaction,
    tenantId: string,
    access: TerritorialAccess,
    profile: SelectedProfile,
    input: NormalizedAssignmentInput,
  ): Promise<void> {
    if (input.tableEnd < input.tableStart) {
      throw new BadRequestException(
        'La mesa final debe ser mayor o igual a la mesa inicial',
      );
    }
    const duration =
      input.shiftEndsAt.getTime() - input.shiftStartsAt.getTime();
    if (duration <= 0) {
      throw new BadRequestException(
        'El fin del turno debe ser posterior a su inicio',
      );
    }
    this.assertPlaceAccess(access, input.puestoId);

    const [place, witness, coverageWindow] = await Promise.all([
      transaction.politicalDivision.findFirst({
        where: {
          id: input.puestoId,
          tenantId,
          type: DivisionType.PUESTO,
          isActive: true,
        },
        select: { id: true, expectedTables: true },
      }),
      transaction.user.findFirst({
        where: {
          id: input.witnessId,
          tenantId,
          role: Role.WITNESS,
          isActive: true,
        },
        select: { id: true, divisionId: true },
      }),
      transaction.witnessCoverageWindow.findFirst({
        where: {
          id: input.coverageWindowId,
          tenantId,
          operationProfileId: profile.id,
          captureContext: input.captureContext,
          puestoId: input.puestoId,
        },
        select: { id: true, startsAt: true, endsAt: true },
      }),
    ]);
    if (!place) {
      throw new BadRequestException(
        'El puesto no existe, no esta activo o pertenece a otra organizacion',
      );
    }
    if (!Number.isInteger(place.expectedTables) || !place.expectedTables) {
      throw new ConflictException(
        'Configura las mesas esperadas del puesto antes de asignar testigos',
      );
    }
    if (input.tableEnd > place.expectedTables) {
      throw new BadRequestException(
        `El rango supera las ${place.expectedTables} mesas configuradas para el puesto`,
      );
    }
    if (!witness) {
      throw new BadRequestException(
        'El usuario debe ser un TESTIGO activo de la organizacion autenticada',
      );
    }
    if (!coverageWindow) {
      throw new BadRequestException(
        'La ventana de cobertura no existe o no corresponde al perfil, contexto y puesto',
      );
    }
    if (
      input.shiftStartsAt < coverageWindow.startsAt ||
      input.shiftEndsAt > coverageWindow.endsAt
    ) {
      throw new BadRequestException(
        'El turno debe quedar completamente dentro de la ventana operativa declarada',
      );
    }
    if (
      access.role === Role.ZONE_COORDINATOR &&
      (!witness.divisionId || !access.divisionIds?.includes(witness.divisionId))
    ) {
      throw new ForbiddenException(
        'El testigo no pertenece al alcance territorial vigente del coordinador',
      );
    }
  }

  private async validateCoverageWindowInput(
    transaction: WitnessTransaction,
    tenantId: string,
    access: TerritorialAccess,
    profile: SelectedProfile,
    input: NormalizedCoverageWindowInput,
  ): Promise<void> {
    this.assertPlaceAccess(access, input.puestoId);
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException(
        'El fin de la ventana debe ser posterior a su inicio',
      );
    }
    const place = await transaction.politicalDivision.findFirst({
      where: {
        id: input.puestoId,
        tenantId,
        type: DivisionType.PUESTO,
        isActive: true,
      },
      select: {
        id: true,
        expectedTables: true,
        votingDate: true,
        timeZone: true,
      },
    });
    if (!place) {
      throw new BadRequestException(
        'El puesto no existe, no está activo o pertenece a otra organización',
      );
    }
    if (!Number.isInteger(place.expectedTables) || !place.expectedTables) {
      throw new ConflictException(
        'Configura las mesas esperadas del puesto antes de declarar su ventana',
      );
    }

    const finalInstant = new Date(input.endsAt.getTime() - 1);
    const startLocalDate = localDateInTimeZone(input.startsAt, input.timeZone);
    const endLocalDate = localDateInTimeZone(finalInstant, input.timeZone);
    if (
      startLocalDate !== input.localDate ||
      endLocalDate !== input.localDate
    ) {
      throw new BadRequestException(
        'La ventana debe corresponder a una sola jornada en la zona IANA declarada',
      );
    }
    const startOffset = offsetMinutesAt(input.startsAt, input.timeZone);
    const endOffset = offsetMinutesAt(finalInstant, input.timeZone);
    if (
      startOffset !== input.utcOffsetMinutes ||
      endOffset !== input.utcOffsetMinutes
    ) {
      throw new BadRequestException({
        code: 'WITNESS_COVERAGE_OFFSET_MISMATCH',
        message:
          'El offset no corresponde a la zona IANA durante toda la ventana; divídela si cruza un cambio horario',
        expectedStartOffsetMinutes: startOffset,
        expectedEndOffsetMinutes: endOffset,
      });
    }

    if (input.captureContext === WitnessCaptureContext.REAL) {
      if (!place.votingDate) {
        throw new ConflictException({
          code: 'POLLING_PLACE_VOTING_DATE_REQUIRED',
          message:
            'El puesto debe tener una fecha de votación trazable antes de planificar cobertura REAL',
        });
      }
      if (!place.timeZone) {
        throw new ConflictException({
          code: 'POLLING_PLACE_TIME_ZONE_REQUIRED',
          message:
            'El puesto debe tener una zona IANA persistida; no se presume America/Bogota',
        });
      }
      if (dateOnly(place.votingDate) !== input.localDate) {
        throw new BadRequestException(
          'La jornada REAL debe coincidir con votingDate del puesto electoral',
        );
      }
      if (place.timeZone !== input.timeZone) {
        throw new BadRequestException(
          'La zona IANA de la ventana REAL debe coincidir con la del puesto',
        );
      }
      const votingStart = toStoredDateOnlyKey(profile.votingStartDate);
      const votingEnd = toStoredDateOnlyKey(profile.votingEndDate);
      if (input.localDate < votingStart || input.localDate > votingEnd) {
        throw new BadRequestException(
          `La jornada REAL debe estar dentro de la ventana electoral ${votingStart} a ${votingEnd}`,
        );
      }
    }
  }

  private async requireCoverageWindow(
    transaction: WitnessTransaction,
    tenantId: string,
    operationProfileId: string,
    windowId: string,
  ): Promise<SelectedCoverageWindow> {
    const window = await transaction.witnessCoverageWindow.findFirst({
      where: { id: windowId, tenantId, operationProfileId },
      select: COVERAGE_WINDOW_SELECT,
    });
    if (!window) {
      throw new NotFoundException('Ventana de cobertura no encontrada');
    }
    return window;
  }

  private coverageWindowConcurrentChange(): ConflictException {
    return new ConflictException({
      code: 'WITNESS_COVERAGE_WINDOW_VERSION_CONFLICT',
      message:
        'La ventana cambió desde que fue abierta; recarga antes de continuar',
    });
  }

  private async assertNoOverlap(
    transaction: WitnessTransaction,
    tenantId: string,
    operationProfileId: string,
    input: NormalizedAssignmentInput,
    excludeAssignmentId?: string,
  ): Promise<void> {
    const common = {
      tenantId,
      operationProfileId,
      captureContext: input.captureContext,
      status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
      shiftStartsAt: { lt: input.shiftEndsAt },
      shiftEndsAt: { gt: input.shiftStartsAt },
      ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
    } satisfies Prisma.WitnessAssignmentWhereInput;
    const [tableConflict, witnessConflict] = await Promise.all([
      transaction.witnessAssignment.findFirst({
        where: {
          ...common,
          puestoId: input.puestoId,
          assignmentType: input.assignmentType,
          tableStart: { lte: input.tableEnd },
          tableEnd: { gte: input.tableStart },
        },
        select: { id: true },
      }),
      transaction.witnessAssignment.findFirst({
        where: { ...common, witnessId: input.witnessId },
        select: { id: true },
      }),
    ]);
    if (tableConflict) {
      throw new ConflictException({
        code: 'WITNESS_TABLE_SHIFT_OVERLAP',
        message:
          'Ya existe cobertura del mismo tipo para una mesa y franja horaria superpuestas',
      });
    }
    if (witnessConflict) {
      throw new ConflictException({
        code: 'WITNESS_DOUBLE_BOOKED',
        message:
          'El testigo ya tiene otra asignacion durante parte de este turno',
      });
    }
  }

  private async requireAssignment(
    transaction: WitnessTransaction,
    user: AuthenticatedUser,
    access: TerritorialAccess,
    operationProfileId: string,
    assignmentId: string,
  ): Promise<SelectedAssignment> {
    const assignment = await transaction.witnessAssignment.findFirst({
      where: {
        id: assignmentId,
        tenantId: user.tenantId,
        operationProfileId,
      },
      select: ASSIGNMENT_SELECT,
    });
    if (!assignment) {
      throw new NotFoundException('Asignacion de testigo no encontrada');
    }
    this.assertPlaceAccess(access, assignment.puestoId);
    if (access.role === Role.WITNESS && assignment.witnessId !== user.userId) {
      throw new ForbiddenException(
        'Un testigo solo puede operar sus propias asignaciones',
      );
    }
    return assignment;
  }

  private async requireSelected(
    transaction: WitnessTransaction,
    tenantId: string,
    assignmentId: string,
  ): Promise<SelectedAssignment> {
    const assignment = await transaction.witnessAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      select: ASSIGNMENT_SELECT,
    });
    if (!assignment) {
      throw new NotFoundException('Asignacion de testigo no encontrada');
    }
    return assignment;
  }

  private assertWitnessActorCanMutate(
    role: Role,
    actorUserId: string,
    assignment: SelectedAssignment,
  ): void {
    if (role === Role.WITNESS && assignment.witnessId !== actorUserId) {
      throw new ForbiddenException(
        'Un testigo solo puede operar sus propias asignaciones',
      );
    }
  }

  private async assertWitnessEligible(
    transaction: WitnessTransaction,
    tenantId: string,
    witnessId: string,
  ): Promise<void> {
    const witness = await transaction.user.findFirst({
      where: { id: witnessId, tenantId, role: Role.WITNESS, isActive: true },
      select: { id: true },
    });
    if (!witness) {
      throw new ConflictException(
        'La asignacion no puede confirmarse porque el testigo ya no esta activo con rol TESTIGO',
      );
    }
  }

  private assertPlaceAccess(access: TerritorialAccess, puestoId: string): void {
    if (access.divisionIds && !access.divisionIds.includes(puestoId)) {
      throw new ForbiddenException(
        'El puesto esta fuera del alcance territorial vigente del usuario',
      );
    }
  }

  private assertIdempotent(
    assignment: SelectedAssignment,
    expectedHash: string,
    field: string,
  ): void {
    if (assignment.payloadSha256 !== expectedHash) {
      throw new ConflictException(
        `${field} ya fue utilizado con un contenido diferente`,
      );
    }
  }

  private assertLifecycleReplay(
    assignment: SelectedAssignment,
    assignmentId: string,
    expectedHash: string,
    storedHash: string | null,
  ): void {
    if (assignment.id !== assignmentId || storedHash !== expectedHash) {
      throw new ConflictException(
        'clientRequestId ya fue utilizado para otra mutacion',
      );
    }
  }

  private concurrentChange(): ConflictException {
    return new ConflictException({
      code: 'WITNESS_ASSIGNMENT_VERSION_CONFLICT',
      message:
        'La asignacion cambio desde que fue abierta; recarga antes de continuar',
    });
  }

  private async lockMutation(
    transaction: WitnessTransaction,
    tenantId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      WITH witness_lifecycle_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`operation-profile-lifecycle:${tenantId}`}, 0)
        )
      )
      SELECT TRUE AS "locked" FROM witness_lifecycle_lock
    `);
    await transaction.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      WITH witness_assignment_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`witness-assignment:${tenantId}`}, 0)
        )
      )
      SELECT TRUE AS "locked" FROM witness_assignment_lock
    `);
  }

  private async audit(
    transaction: WitnessTransaction,
    user: AuthenticatedUser,
    action: string,
    assignment: SelectedAssignment,
    after: Prisma.InputJsonValue,
    before?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.auditResource(
      transaction,
      user,
      action,
      'WitnessAssignment',
      assignment.id,
      after,
      before,
    );
  }

  private async auditResource(
    transaction: WitnessTransaction,
    user: AuthenticatedUser,
    action: string,
    resourceType: string,
    resourceId: string,
    after: Prisma.InputJsonValue,
    before?: Prisma.InputJsonValue,
  ): Promise<void> {
    await transaction.auditEvent.create({
      data: {
        tenantId: user.tenantId,
        mode: PoliticalOperationMode.CAMPAIGN,
        actorType: AuditActorType.USER,
        actorUserId: user.userId,
        action,
        resourceType,
        resourceId,
        ...(before ? { before } : {}),
        after,
      },
    });
  }

  private presentCoverageWindow(window: SelectedCoverageWindow) {
    return {
      id: window.id,
      captureContext: window.captureContext,
      puestoId: window.puestoId,
      localDate: dateOnly(window.localDate),
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      timeZone: window.timeZone,
      utcOffsetMinutes: window.utcOffsetMinutes,
      version: window.version,
      createdAt: window.createdAt,
      updatedAt: window.updatedAt,
      puesto: window.puesto,
    };
  }

  private present(assignment: SelectedAssignment) {
    return {
      id: assignment.id,
      coverageWindowId: assignment.coverageWindowId,
      captureContext: assignment.captureContext,
      puestoId: assignment.puestoId,
      tableStart: assignment.tableStart,
      tableEnd: assignment.tableEnd,
      shiftStartsAt: assignment.shiftStartsAt,
      shiftEndsAt: assignment.shiftEndsAt,
      assignmentType: assignment.assignmentType,
      status: assignment.status,
      witnessId: assignment.witnessId,
      confirmedAt: assignment.confirmedAt,
      cancelledAt: assignment.cancelledAt,
      cancellationReason: assignment.cancellationReason,
      supersedesAssignmentId: assignment.supersedesAssignmentId,
      version: assignment.version,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      witness: {
        id: assignment.witness.id,
        name: assignment.witness.name,
        isActive: assignment.witness.isActive,
        role: assignment.witness.role,
      },
      puesto: {
        id: assignment.puesto.id,
        code: assignment.puesto.code,
        name: assignment.puesto.name,
        expectedTables: assignment.puesto.expectedTables,
        isActive: assignment.puesto.isActive,
      },
      coverageWindow: {
        id: assignment.coverageWindow.id,
        localDate: dateOnly(assignment.coverageWindow.localDate),
        startsAt: assignment.coverageWindow.startsAt,
        endsAt: assignment.coverageWindow.endsAt,
        timeZone: assignment.coverageWindow.timeZone,
        utcOffsetMinutes: assignment.coverageWindow.utcOffsetMinutes,
        version: assignment.coverageWindow.version,
      },
      eligible:
        assignment.witness.isActive &&
        assignment.witness.role === Role.WITNESS &&
        assignment.puesto.isActive &&
        assignment.puesto.type === DivisionType.PUESTO,
    };
  }

  private async runMutation<T>(
    operation: (transaction: WitnessTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, SERIALIZABLE_OPTIONS);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof ConflictException) throw error;
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof NotFoundException) throw error;

      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : null;
      const serialized = JSON.stringify(error);
      if (
        code === 'P2002' ||
        code === 'P2004' ||
        serialized.includes('23P01') ||
        serialized.includes('WitnessAssignment_no_')
      ) {
        throw new ConflictException({
          code: 'WITNESS_ASSIGNMENT_OVERLAP',
          message:
            'La asignacion entra en conflicto con una mesa o turno ya reservado',
        });
      }
      if (code === 'P2034' || serialized.includes('40001')) {
        throw this.concurrentChange();
      }
      throw error;
    }
  }
}
