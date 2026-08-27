import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AuditActorType,
  CommunicationApprovalStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommunicationApprovalDto } from './dto/create-communication-approval.dto';
import { DecideCommunicationApprovalDto } from './dto/decide-communication-approval.dto';
import { ListCommunicationApprovalsQueryDto } from './dto/list-communication-approvals-query.dto';

const COMMUNICATION_INCLUDE = {
  requestedBy: { select: { id: true, name: true, role: true } },
  decidedBy: { select: { id: true, name: true, role: true } },
  issueCase: {
    select: { id: true, reference: true, status: true },
  },
} satisfies Prisma.CommunicationApprovalInclude;

const MODE_READ_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.CASE_WORKER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
  ],
};

const MODE_REQUEST_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.CASE_WORKER,
  ],
};

const MODE_DECISION_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.COMPLIANCE_OFFICER,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.COMPLIANCE_OFFICER,
  ],
};

const SENSITIVE_DECISION_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
];

const MODE_CASE_LINK_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [Role.ADMIN, Role.CAMPAIGN_MANAGER],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
  ],
};

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    user: AuthenticatedUser,
    query: ListCommunicationApprovalsQueryDto,
  ) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_READ_ROLES, 'consultar');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const isCaseWorker = user.role === Role.CASE_WORKER;

    if (
      isCaseWorker &&
      query.requestedById !== undefined &&
      query.requestedById !== user.userId
    ) {
      throw new ForbiddenException(
        'Los gestores de caso sólo pueden consultar sus propias solicitudes',
      );
    }

    const where: Prisma.CommunicationApprovalWhereInput = {
      tenantId: user.tenantId,
      mode,
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.containsSensitiveData !== undefined
        ? { containsSensitiveData: query.containsSensitiveData === 'true' }
        : {}),
      ...(isCaseWorker
        ? { requestedById: user.userId }
        : query.requestedById
          ? { requestedById: query.requestedById }
          : {}),
      ...(query.issueCaseId ? { issueCaseId: query.issueCaseId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { purpose: { contains: search, mode: 'insensitive' } },
            ],
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
      this.prisma.communicationApproval.findMany({
        where,
        include: COMMUNICATION_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.communicationApproval.count({ where }),
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

  async create(user: AuthenticatedUser, dto: CreateCommunicationApprovalDto) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_REQUEST_ROLES, 'solicitar');
    const title = dto.title.trim();
    const message = dto.message.trim();
    const purpose = dto.purpose.trim();

    if (!title || !message || !purpose) {
      throw new BadRequestException(
        'El título, el mensaje y la finalidad no pueden quedar vacíos',
      );
    }

    if (user.role === Role.CASE_WORKER && !dto.issueCaseId) {
      throw new BadRequestException(
        'Los gestores de caso deben relacionar la comunicación con un caso asignado',
      );
    }

    if (dto.issueCaseId) {
      this.assertModeRole(
        user.role,
        mode,
        MODE_CASE_LINK_ROLES,
        'relacionar casos con',
      );
    }

    await Promise.all([
      this.assertUserInTenant(user.tenantId, user.userId),
      dto.issueCaseId
        ? this.assertIssueCaseInScope(
            user,
            mode,
            dto.issueCaseId,
            user.role === Role.CASE_WORKER,
          )
        : Promise.resolve(),
    ]);

    const content = { message } satisfies Prisma.InputJsonObject;
    const contentHash = this.hashContent(content);

    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.communicationApproval.create({
        data: {
          tenantId: user.tenantId,
          mode,
          issueCaseId: dto.issueCaseId,
          channel: dto.channel,
          title,
          content,
          contentHash,
          purpose,
          containsSensitiveData: dto.containsSensitiveData ?? false,
          status: CommunicationApprovalStatus.PENDING,
          requestedById: user.userId,
        },
        include: COMMUNICATION_INCLUDE,
      });

      await tx.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode,
          actorType: AuditActorType.USER,
          actorUserId: user.userId,
          action: 'COMMUNICATION_REVIEW_REQUESTED',
          resourceType: 'CommunicationApproval',
          resourceId: approval.id,
          after: this.auditSnapshot(approval),
        },
      });

      return approval;
    });
  }

  async decide(
    user: AuthenticatedUser,
    id: string,
    dto: DecideCommunicationApprovalDto,
  ) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_DECISION_ROLES, 'decidir');
    await this.assertUserInTenant(user.tenantId, user.userId);
    const decisionReason = dto.decisionReason.trim();

    if (!decisionReason) {
      throw new BadRequestException('El motivo de la decisión es obligatorio');
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.communicationApproval.findFirst({
            where: { id, tenantId: user.tenantId, mode },
            select: {
              id: true,
              status: true,
              requestedById: true,
              channel: true,
              containsSensitiveData: true,
              issueCaseId: true,
              contentHash: true,
            },
          });

          if (!existing) {
            throw new NotFoundException(
              'Solicitud de comunicación no encontrada',
            );
          }

          if (existing.status !== CommunicationApprovalStatus.PENDING) {
            throw new ConflictException(
              'La solicitud ya tiene una decisión final',
            );
          }

          if (existing.requestedById === user.userId) {
            throw new ForbiddenException(
              'La regla de cuatro ojos impide decidir su propia solicitud',
            );
          }

          if (
            existing.containsSensitiveData &&
            !SENSITIVE_DECISION_ROLES.includes(user.role as Role)
          ) {
            throw new ForbiddenException(
              'Las comunicaciones sensibles requieren revisión de administración o cumplimiento',
            );
          }

          const decisionAt = new Date();
          const updateResult = await tx.communicationApproval.updateMany({
            where: {
              id,
              tenantId: user.tenantId,
              mode,
              status: CommunicationApprovalStatus.PENDING,
              requestedById: { not: user.userId },
            },
            data: {
              status: dto.status,
              decidedById: user.userId,
              decisionReason,
              decidedAt: decisionAt,
            },
          });

          if (updateResult.count !== 1) {
            throw new ConflictException(
              'La solicitud fue decidida por otra persona; actualice la cola',
            );
          }

          const updated = await tx.communicationApproval.findFirst({
            where: { id, tenantId: user.tenantId, mode },
            include: COMMUNICATION_INCLUDE,
          });

          if (!updated) {
            throw new NotFoundException(
              'Solicitud de comunicación no encontrada',
            );
          }

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'COMMUNICATION_REVIEW_DECIDED',
              resourceType: 'CommunicationApproval',
              resourceId: id,
              before: this.auditSnapshot(existing),
              after: this.auditSnapshot(updated),
              metadata: { decision: dto.status },
            },
          });

          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException(
          'La solicitud cambió durante la revisión; actualice la cola',
        );
      }
      throw error;
    }
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

  private assertModeRole(
    role: string | undefined,
    mode: PoliticalOperationMode,
    rolesByMode: Readonly<Record<PoliticalOperationMode, readonly Role[]>>,
    action: string,
  ): void {
    if (!rolesByMode[mode].includes(role as Role)) {
      throw new ForbiddenException(
        `Su rol no puede ${action} comunicaciones en el modo operativo actual`,
      );
    }
  }

  private async assertUserInTenant(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });

    if (!user) {
      throw new ForbiddenException(
        'El usuario autenticado no pertenece a la organización actual',
      );
    }
  }

  private async assertIssueCaseInScope(
    user: AuthenticatedUser,
    mode: PoliticalOperationMode,
    issueCaseId: string,
    requireAssignment: boolean,
  ): Promise<void> {
    const issueCase = await this.prisma.issueCase.findFirst({
      where: {
        id: issueCaseId,
        tenantId: user.tenantId,
        mode,
        ...(requireAssignment ? { assigneeId: user.userId } : {}),
      },
      select: { id: true },
    });

    if (!issueCase) {
      throw new BadRequestException(
        'El caso relacionado no pertenece al alcance operativo autorizado',
      );
    }
  }

  private hashContent(content: Prisma.InputJsonObject): string {
    return createHash('sha256')
      .update(JSON.stringify(content), 'utf8')
      .digest('hex');
  }

  private auditSnapshot(value: {
    status: CommunicationApprovalStatus;
    channel: string;
    containsSensitiveData: boolean;
    issueCaseId: string | null;
  }): Prisma.InputJsonObject {
    return {
      status: value.status,
      channel: value.channel,
      containsSensitiveData: value.containsSensitiveData,
      issueCaseId: value.issueCaseId,
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
