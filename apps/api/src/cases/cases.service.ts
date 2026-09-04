import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AuditActorType,
  IssueCaseStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIssueCaseDto } from './dto/create-issue-case.dto';
import { ListIssueCasesQueryDto } from './dto/list-issue-cases-query.dto';
import { UpdateIssueCaseDto } from './dto/update-issue-case.dto';

const CASE_INCLUDE = {
  assignee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true, role: true } },
  voter: { select: { id: true, firstName: true, lastName: true } },
  division: { select: { id: true, name: true, type: true } },
  _count: {
    select: {
      interactions: true,
      tasks: true,
      commitments: true,
    },
  },
  interactions: {
    where: { outcome: { not: null } },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.IssueCaseInclude;

type IssueCaseWithResolution = Prisma.IssueCaseGetPayload<{
  include: typeof CASE_INCLUDE;
}>;

const CASE_WRITE_ROLES = [
  Role.ADMIN,
  Role.CAMPAIGN_MANAGER,
  Role.CONSTITUENT_SERVICES_MANAGER,
  Role.CASE_WORKER,
] as const;

const CASE_READ_ROLES = [
  ...CASE_WRITE_ROLES,
  Role.AUDITOR,
  Role.COMPLIANCE_OFFICER,
] as const;

const CASE_MODE_READ_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.AUDITOR,
    Role.COMPLIANCE_OFFICER,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
    Role.AUDITOR,
    Role.COMPLIANCE_OFFICER,
  ],
};

const CASE_MODE_WRITE_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [Role.ADMIN, Role.CAMPAIGN_MANAGER],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
  ],
};

const CASE_GLOBAL_MANAGER_ROLES = [
  Role.ADMIN,
  Role.CONSTITUENT_SERVICES_MANAGER,
] as const;

const CASE_STATUS_TRANSITIONS: Readonly<
  Record<IssueCaseStatus, readonly IssueCaseStatus[]>
> = {
  [IssueCaseStatus.OPEN]: [
    IssueCaseStatus.TRIAGED,
    IssueCaseStatus.IN_PROGRESS,
    IssueCaseStatus.CANCELLED,
  ],
  [IssueCaseStatus.TRIAGED]: [
    IssueCaseStatus.IN_PROGRESS,
    IssueCaseStatus.WAITING_ON_CITIZEN,
    IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY,
    IssueCaseStatus.RESOLVED,
    IssueCaseStatus.CANCELLED,
  ],
  [IssueCaseStatus.IN_PROGRESS]: [
    IssueCaseStatus.WAITING_ON_CITIZEN,
    IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY,
    IssueCaseStatus.RESOLVED,
    IssueCaseStatus.CANCELLED,
  ],
  [IssueCaseStatus.WAITING_ON_CITIZEN]: [
    IssueCaseStatus.IN_PROGRESS,
    IssueCaseStatus.RESOLVED,
    IssueCaseStatus.CANCELLED,
  ],
  [IssueCaseStatus.WAITING_ON_EXTERNAL_ENTITY]: [
    IssueCaseStatus.IN_PROGRESS,
    IssueCaseStatus.RESOLVED,
    IssueCaseStatus.CANCELLED,
  ],
  [IssueCaseStatus.RESOLVED]: [
    IssueCaseStatus.CLOSED,
    IssueCaseStatus.IN_PROGRESS,
  ],
  [IssueCaseStatus.CLOSED]: [IssueCaseStatus.IN_PROGRESS],
  [IssueCaseStatus.CANCELLED]: [IssueCaseStatus.OPEN],
};

interface CaseAuditSource {
  reference: string;
  status: IssueCaseStatus;
  priority: string;
  category: string;
  assigneeId: string | null;
  dueAt: Date | null;
  confidential: boolean;
}

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListIssueCasesQueryDto) {
    this.assertCaseReadAccess(user);
    const mode = await this.getActiveMode(user.tenantId);
    this.assertRoleAllowedForMode(user, mode, 'read');
    // Least-privilege policy: creation alone grants no visibility; a
    // CASE_WORKER can only access records currently assigned to that user.
    const isCaseWorker = this.isCaseWorker(user);
    if (
      isCaseWorker &&
      query.assigneeId !== undefined &&
      query.assigneeId !== user.userId
    ) {
      throw new ForbiddenException(
        'Los gestores de caso solo pueden consultar sus casos asignados',
      );
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const where: Prisma.IssueCaseWhereInput = {
      tenantId: user.tenantId,
      mode,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.sourceChannel ? { sourceChannel: query.sourceChannel } : {}),
      ...(isCaseWorker
        ? { assigneeId: user.userId }
        : query.assigneeId
          ? { assigneeId: query.assigneeId }
          : {}),
      ...(query.category
        ? {
            category: {
              equals: query.category.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
      ...(query.confidential !== undefined
        ? { confidential: query.confidential === 'true' }
        : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
              {
                externalContactRef: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            dueAt: {
              ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
              ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
            },
          }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom
                ? { gte: new Date(query.createdFrom) }
                : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.issueCase.findMany({
        where,
        include: CASE_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.issueCase.count({ where }),
    ]);

    return {
      items: items.map((issueCase) => this.toIssueCaseView(issueCase)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    this.assertCaseReadAccess(user);
    const mode = await this.getActiveMode(user.tenantId);
    this.assertRoleAllowedForMode(user, mode, 'read');
    const issueCase = await this.prisma.issueCase.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        mode,
        ...(this.isCaseWorker(user) ? { assigneeId: user.userId } : {}),
      },
      include: CASE_INCLUDE,
    });

    if (!issueCase) {
      throw new NotFoundException('Caso no encontrado');
    }

    return this.toIssueCaseView(issueCase);
  }

  async listAssignees(user: AuthenticatedUser) {
    this.assertCaseWriteAccess(user);
    const mode = await this.getActiveMode(user.tenantId);
    this.assertRoleAllowedForMode(user, mode, 'write');

    if (this.isCaseWorker(user)) {
      return this.prisma.user.findMany({
        where: { id: user.userId, tenantId: user.tenantId },
        select: { id: true, name: true, role: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
    }

    if (!this.canManageAllCases(user, mode)) {
      throw new ForbiddenException(
        'Su rol no puede administrar responsables de casos',
      );
    }

    const eligibleRoles = CASE_MODE_WRITE_ROLES[mode];

    return this.prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        role: { in: [...eligibleRoles] },
      },
      select: { id: true, name: true, role: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async create(user: AuthenticatedUser, dto: CreateIssueCaseDto) {
    this.assertCaseWriteAccess(user);
    const mode = await this.getActiveMode(user.tenantId);
    this.assertRoleAllowedForMode(user, mode, 'write');
    const isCaseWorker = this.isCaseWorker(user);
    if (
      isCaseWorker &&
      dto.assigneeId !== undefined &&
      dto.assigneeId !== user.userId
    ) {
      throw new ForbiddenException(
        'Los gestores de caso no pueden asignar casos a otros usuarios',
      );
    }
    if (!isCaseWorker && !this.canManageAllCases(user, mode)) {
      throw new ForbiddenException(
        'Su rol no puede administrar todos los casos',
      );
    }
    const externalContactRef = dto.externalContactRef?.trim();
    if (dto.externalContactRef !== undefined && !externalContactRef) {
      throw new BadRequestException(
        'El contacto externo no puede quedar vacio',
      );
    }
    this.assertUnambiguousSubject(dto.voterId, externalContactRef);
    const assigneeId = isCaseWorker ? user.userId : dto.assigneeId;
    const reference = dto.reference
      ? this.normalizeReference(dto.reference)
      : this.generateReference(mode);

    await Promise.all([
      this.assertUserInTenant(user.tenantId, user.userId, 'creador'),
      this.assertReferenceAvailable(user.tenantId, mode, reference),
      assigneeId
        ? this.assertUserInTenant(user.tenantId, assigneeId, 'responsable')
        : Promise.resolve(),
      dto.voterId
        ? this.assertVoterInTenant(user.tenantId, dto.voterId)
        : Promise.resolve(),
      dto.divisionId
        ? this.assertDivisionInTenant(user.tenantId, dto.divisionId)
        : Promise.resolve(),
    ]);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const issueCase = await tx.issueCase.create({
          data: {
            tenantId: user.tenantId,
            mode,
            reference,
            title: dto.title.trim(),
            description: dto.description.trim(),
            category: dto.category.trim(),
            sourceChannel: dto.sourceChannel,
            priority: dto.priority,
            voterId: dto.voterId,
            externalContactRef,
            divisionId: dto.divisionId,
            assigneeId,
            createdById: user.userId,
            confidential: dto.confidential,
            dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          },
          include: CASE_INCLUDE,
        });

        await tx.auditEvent.create({
          data: {
            tenantId: user.tenantId,
            mode,
            actorType: AuditActorType.USER,
            actorUserId: user.userId,
            action: 'ISSUE_CASE_CREATED',
            resourceType: 'IssueCase',
            resourceId: issueCase.id,
            after: this.auditSnapshot(issueCase),
          },
        });

        return this.toIssueCaseView(issueCase);
      });
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'La referencia ya existe en el modo operativo actual',
        );
      }
      throw error;
    }
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateIssueCaseDto) {
    this.assertCaseWriteAccess(user);
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Debe enviar al menos un cambio');
    }

    const mode = await this.getActiveMode(user.tenantId);
    this.assertRoleAllowedForMode(user, mode, 'write');
    const isCaseWorker = this.isCaseWorker(user);
    if (!isCaseWorker && !this.canManageAllCases(user, mode)) {
      throw new ForbiddenException(
        'Su rol no puede administrar todos los casos',
      );
    }
    if (
      isCaseWorker &&
      dto.assigneeId !== undefined &&
      dto.assigneeId !== user.userId
    ) {
      throw new ForbiddenException(
        'Los gestores de caso no pueden reasignar ni desasignar casos',
      );
    }

    const normalizedExternalContactRef =
      dto.externalContactRef === undefined || dto.externalContactRef === null
        ? dto.externalContactRef
        : dto.externalContactRef.trim();
    if (
      dto.externalContactRef !== undefined &&
      dto.externalContactRef !== null &&
      !normalizedExternalContactRef
    ) {
      throw new BadRequestException(
        'El contacto externo no puede quedar vacio',
      );
    }
    if (dto.voterId && normalizedExternalContactRef) {
      this.assertUnambiguousSubject(dto.voterId, normalizedExternalContactRef);
    }

    await Promise.all([
      dto.assigneeId
        ? this.assertUserInTenant(user.tenantId, dto.assigneeId, 'responsable')
        : Promise.resolve(),
      dto.voterId
        ? this.assertVoterInTenant(user.tenantId, dto.voterId)
        : Promise.resolve(),
      dto.divisionId
        ? this.assertDivisionInTenant(user.tenantId, dto.divisionId)
        : Promise.resolve(),
    ]);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.issueCase.findFirst({
            where: {
              id,
              tenantId: user.tenantId,
              mode,
              ...(isCaseWorker ? { assigneeId: user.userId } : {}),
            },
            select: {
              id: true,
              reference: true,
              status: true,
              priority: true,
              category: true,
              assigneeId: true,
              dueAt: true,
              confidential: true,
              voterId: true,
              externalContactRef: true,
              firstResponseAt: true,
              resolvedAt: true,
            },
          });
          if (!existing) {
            throw new NotFoundException('Caso no encontrado');
          }

          if (dto.status !== undefined) {
            this.assertStatusTransition(existing.status, dto.status);
          }
          if (
            dto.status === IssueCaseStatus.RESOLVED &&
            existing.status !== IssueCaseStatus.RESOLVED
          ) {
            await this.assertResolutionEvidence(
              tx,
              user.tenantId,
              mode,
              existing.id,
            );
          }
          this.assertUnambiguousSubject(
            dto.voterId === undefined ? existing.voterId : dto.voterId,
            normalizedExternalContactRef === undefined
              ? existing.externalContactRef
              : normalizedExternalContactRef,
          );

          const data: Prisma.IssueCaseUncheckedUpdateInput = {};
          if (dto.title !== undefined) data.title = dto.title.trim();
          if (dto.description !== undefined) {
            data.description = dto.description.trim();
          }
          if (dto.category !== undefined) data.category = dto.category.trim();
          if (dto.sourceChannel !== undefined) {
            data.sourceChannel = dto.sourceChannel;
          }
          if (dto.priority !== undefined) data.priority = dto.priority;
          if (dto.voterId !== undefined) data.voterId = dto.voterId;
          if (dto.externalContactRef !== undefined) {
            data.externalContactRef = normalizedExternalContactRef ?? null;
          }
          if (dto.divisionId !== undefined) data.divisionId = dto.divisionId;
          if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
          if (dto.confidential !== undefined) {
            data.confidential = dto.confidential;
          }
          if (dto.dueAt !== undefined) {
            data.dueAt = dto.dueAt === null ? null : new Date(dto.dueAt);
          }
          if (dto.status !== undefined && dto.status !== existing.status) {
            const transitionAt = new Date();
            data.status = dto.status;
            if (dto.status === IssueCaseStatus.RESOLVED) {
              data.resolvedAt = transitionAt;
            } else if (dto.status === IssueCaseStatus.CLOSED) {
              data.resolvedAt = existing.resolvedAt ?? transitionAt;
            } else {
              data.resolvedAt = null;
            }
          }

          const updated = await tx.issueCase.update({
            where: {
              id,
              tenantId: user.tenantId,
              mode,
              ...(isCaseWorker ? { assigneeId: user.userId } : {}),
            },
            data,
            include: CASE_INCLUDE,
          });

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'ISSUE_CASE_UPDATED',
              resourceType: 'IssueCase',
              resourceId: id,
              before: this.auditSnapshot(existing),
              after: this.auditSnapshot(updated),
              metadata: { changedFields: Object.keys(dto).sort() },
            },
          });

          return this.toIssueCaseView(updated);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2025')) {
        throw new NotFoundException('Caso no encontrado');
      }
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'El caso cambio durante la actualizacion; intente nuevamente',
        );
      }
      throw error;
    }
  }

  private assertCaseReadAccess(user: AuthenticatedUser): void {
    if (
      !CASE_READ_ROLES.includes(user.role as (typeof CASE_READ_ROLES)[number])
    ) {
      throw new ForbiddenException(
        'Su rol no tiene acceso a la atención de casos ciudadanos',
      );
    }
  }

  private assertUnambiguousSubject(
    voterId: string | null | undefined,
    externalContactRef: string | null | undefined,
  ): void {
    if (voterId && externalContactRef) {
      throw new BadRequestException(
        'Un caso no puede relacionar simultaneamente un ciudadano y un contacto externo',
      );
    }
  }

  private assertCaseWriteAccess(user: AuthenticatedUser): void {
    if (
      !CASE_WRITE_ROLES.includes(user.role as (typeof CASE_WRITE_ROLES)[number])
    ) {
      throw new ForbiddenException(
        'Su rol no puede crear ni modificar casos ciudadanos',
      );
    }
  }

  private assertRoleAllowedForMode(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    access: 'read' | 'write',
  ): void {
    const allowedRoles =
      access === 'write'
        ? CASE_MODE_WRITE_ROLES[mode]
        : CASE_MODE_READ_ROLES[mode];

    if (!allowedRoles?.includes(user.role as Role)) {
      throw new ForbiddenException(
        'Su rol no es compatible con la atención de casos del modo activo',
      );
    }
  }

  private isCaseWorker(user: AuthenticatedUser): boolean {
    return user.role === Role.CASE_WORKER;
  }

  private canManageAllCases(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
  ): boolean {
    return (
      CASE_GLOBAL_MANAGER_ROLES.includes(
        user.role as (typeof CASE_GLOBAL_MANAGER_ROLES)[number],
      ) ||
      (user.role === Role.CAMPAIGN_MANAGER &&
        mode === PoliticalOperationMode.CAMPAIGN)
    );
  }

  private async getActiveMode(
    tenantId: string,
  ): Promise<PoliticalOperationMode> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultMode: true },
    });

    if (!tenant) {
      throw new NotFoundException('Organización no encontrada');
    }

    return tenant.defaultMode;
  }

  private async assertUserInTenant(
    tenantId: string,
    userId: string,
    label: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException(
        `${label} inválido para la organización actual`,
      );
    }
  }

  private async assertVoterInTenant(
    tenantId: string,
    voterId: string,
  ): Promise<void> {
    const voter = await this.prisma.voter.findFirst({
      where: { id: voterId, tenantId },
      select: { id: true },
    });

    if (!voter) {
      throw new BadRequestException(
        'Ciudadano inválido para la organización actual',
      );
    }
  }

  private async assertDivisionInTenant(
    tenantId: string,
    divisionId: string,
  ): Promise<void> {
    const division = await this.prisma.politicalDivision.findFirst({
      where: { id: divisionId, tenantId },
      select: { id: true },
    });

    if (!division) {
      throw new BadRequestException(
        'División territorial inválida para la organización actual',
      );
    }
  }

  private async assertReferenceAvailable(
    tenantId: string,
    mode: PoliticalOperationMode,
    reference: string,
  ): Promise<void> {
    const existing = await this.prisma.issueCase.findFirst({
      where: { tenantId, mode, reference },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'La referencia ya existe en el modo operativo actual',
      );
    }
  }

  private assertStatusTransition(
    current: IssueCaseStatus,
    next: IssueCaseStatus,
  ): void {
    if (current === next) {
      return;
    }

    if (!CASE_STATUS_TRANSITIONS[current].includes(next)) {
      throw new BadRequestException(
        `Transición de estado no permitida: ${current} → ${next}`,
      );
    }
  }

  private async assertResolutionEvidence(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    mode: PoliticalOperationMode,
    issueCaseId: string,
  ): Promise<void> {
    const evidence = await transaction.interaction.findFirst({
      where: {
        tenantId,
        mode,
        issueCaseId,
        outcome: { not: null },
      },
      select: { id: true },
    });

    if (!evidence) {
      throw new BadRequestException(
        'Registre primero en la bitacora una interaccion con resultado antes de resolver el caso',
      );
    }
  }

  private toIssueCaseView(issueCase: IssueCaseWithResolution) {
    const { interactions: resolutionEvidence = [], ...caseData } = issueCase;
    return {
      ...caseData,
      resolutionReady: resolutionEvidence.length > 0,
    };
  }

  private normalizeReference(reference: string): string {
    return reference.trim().toUpperCase();
  }

  private generateReference(mode: PoliticalOperationMode): string {
    const modePrefix =
      mode === PoliticalOperationMode.PUBLIC_OFFICE ? 'GP' : 'CAM';
    const suffix = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
    return `PQRS-${modePrefix}-${new Date().getUTCFullYear()}-${suffix}`;
  }

  private auditSnapshot(value: CaseAuditSource): Prisma.InputJsonObject {
    return {
      reference: value.reference,
      status: value.status,
      priority: value.priority,
      category: value.category,
      assigneeId: value.assigneeId,
      dueAt: value.dueAt?.toISOString() ?? null,
      confidential: value.confidential,
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
