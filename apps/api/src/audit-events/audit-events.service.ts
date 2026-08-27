import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditEventsQueryDto } from './dto/list-audit-events-query.dto';

const AUDIT_READ_ROLES: readonly Role[] = [
  Role.ADMIN,
  Role.COMPLIANCE_OFFICER,
  Role.AUDITOR,
];

const AUDIT_EVENT_SELECT = {
  id: true,
  action: true,
  resourceType: true,
  resourceId: true,
  outcome: true,
  occurredAt: true,
  actorUser: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
} satisfies Prisma.AuditEventSelect;

type SelectedAuditEvent = Prisma.AuditEventGetPayload<{
  select: typeof AUDIT_EVENT_SELECT;
}>;

@Injectable()
export class AuditEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListAuditEventsQueryDto) {
    this.assertReadRole(user.role);
    const mode = await this.getActiveMode(user.tenantId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const occurredFrom = query.occurredFrom
      ? new Date(query.occurredFrom)
      : undefined;
    const occurredTo = query.occurredTo
      ? new Date(query.occurredTo)
      : undefined;

    if (occurredFrom && occurredTo && occurredFrom > occurredTo) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final',
      );
    }

    const action = query.action?.trim();
    const resourceType = query.resourceType?.trim();
    const where: Prisma.AuditEventWhereInput = {
      tenantId: user.tenantId,
      mode,
      ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
      ...(resourceType
        ? { resourceType: { contains: resourceType, mode: 'insensitive' } }
        : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(occurredFrom || occurredTo
        ? {
            occurredAt: {
              ...(occurredFrom ? { gte: occurredFrom } : {}),
              ...(occurredTo ? { lte: occurredTo } : {}),
            },
          }
        : {}),
    };

    const [events, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        select: AUDIT_EVENT_SELECT,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return {
      items: events.map((event) => this.toPublicView(event)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private assertReadRole(role: string | undefined): void {
    if (!role || !AUDIT_READ_ROLES.includes(role as Role)) {
      throw new ForbiddenException(
        'Tu rol no tiene permisos para consultar la auditoría',
      );
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
      throw new NotFoundException('La organización activa no existe');
    }

    return tenant.defaultMode;
  }

  private toPublicView(event: SelectedAuditEvent) {
    return {
      id: event.id,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      outcome: event.outcome,
      occurredAt: event.occurredAt,
      actor: event.actorUser
        ? {
            id: event.actorUser.id,
            name: event.actorUser.name,
            role: event.actorUser.role,
          }
        : null,
    };
  }
}
