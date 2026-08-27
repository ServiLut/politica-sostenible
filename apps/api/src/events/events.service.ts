import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  CampaignEventStatus,
  PoliticalOperationMode,
  Prisma,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignEventDto } from './dto/create-campaign-event.dto';
import { ListCampaignEventsQueryDto } from './dto/list-campaign-events-query.dto';
import { TransitionCampaignEventDto } from './dto/transition-campaign-event.dto';
import { UpdateCampaignEventDto } from './dto/update-campaign-event.dto';

const EVENT_SELECT = {
  id: true,
  mode: true,
  name: true,
  description: true,
  startsAt: true,
  endsAt: true,
  location: true,
  status: true,
  capacity: true,
  responsibleId: true,
  responsible: { select: { id: true, name: true, role: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CampaignEventSelect;

const MODE_READ_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.FINANCE_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.COMPLIANCE_OFFICER,
    Role.AUDITOR,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
    Role.VOLUNTEER,
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

const MODE_WRITE_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.ZONE_COORDINATOR,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
  ],
};

const MODE_RESPONSIBLE_ROLES: Readonly<
  Record<PoliticalOperationMode, readonly Role[]>
> = {
  [PoliticalOperationMode.CAMPAIGN]: [
    Role.ADMIN,
    Role.CAMPAIGN_MANAGER,
    Role.FINANCE_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.ZONE_COORDINATOR,
    Role.WITNESS,
    Role.VOLUNTEER,
  ],
  [PoliticalOperationMode.PUBLIC_OFFICE]: [
    Role.ADMIN,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.COMMUNICATIONS_MANAGER,
    Role.CASE_WORKER,
  ],
};

const STATUS_TRANSITIONS: Readonly<
  Record<CampaignEventStatus, readonly CampaignEventStatus[]>
> = {
  [CampaignEventStatus.DRAFT]: [
    CampaignEventStatus.SCHEDULED,
    CampaignEventStatus.CANCELLED,
  ],
  [CampaignEventStatus.SCHEDULED]: [
    CampaignEventStatus.IN_PROGRESS,
    CampaignEventStatus.CANCELLED,
  ],
  [CampaignEventStatus.IN_PROGRESS]: [
    CampaignEventStatus.COMPLETED,
    CampaignEventStatus.CANCELLED,
  ],
  [CampaignEventStatus.COMPLETED]: [],
  [CampaignEventStatus.CANCELLED]: [],
};

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListCampaignEventsQueryDto) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_READ_ROLES, 'consultar');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const startsFrom = query.startsFrom
      ? new Date(query.startsFrom)
      : undefined;
    const startsTo = query.startsTo ? new Date(query.startsTo) : undefined;

    if (startsFrom && startsTo && startsFrom > startsTo) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final',
      );
    }

    const where: Prisma.CampaignEventWhereInput = {
      tenantId: user.tenantId,
      mode,
      ...(query.status ? { status: query.status } : {}),
      ...(query.responsibleId ? { responsibleId: query.responsibleId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { location: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(startsFrom || startsTo
        ? {
            startsAt: {
              ...(startsFrom ? { gte: startsFrom } : {}),
              ...(startsTo ? { lte: startsTo } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.campaignEvent.findMany({
        where,
        select: EVENT_SELECT,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.campaignEvent.count({ where }),
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

  async findOne(user: AuthenticatedUser, id: string) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_READ_ROLES, 'consultar');
    const event = await this.prisma.campaignEvent.findFirst({
      where: { id, tenantId: user.tenantId, mode },
      select: EVENT_SELECT,
    });

    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    return event;
  }

  async listResponsibles(user: AuthenticatedUser) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_WRITE_ROLES, 'gestionar');

    return this.prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        role: { in: [...MODE_RESPONSIBLE_ROLES[mode]] },
      },
      select: { id: true, name: true, role: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async create(user: AuthenticatedUser, dto: CreateCampaignEventDto) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_WRITE_ROLES, 'crear');
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertValidSchedule(startsAt, endsAt);
    this.assertNonBlank(dto.name, 'El nombre del evento es obligatorio');

    await Promise.all([
      this.assertActorInTenant(user),
      dto.responsibleId
        ? this.assertResponsibleInScope(user.tenantId, mode, dto.responsibleId)
        : Promise.resolve(),
    ]);

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.campaignEvent.create({
        data: {
          tenantId: user.tenantId,
          mode,
          name: dto.name.trim(),
          description: dto.description?.trim() || undefined,
          startsAt,
          endsAt,
          location: dto.location?.trim() || undefined,
          capacity: dto.capacity,
          responsibleId: dto.responsibleId,
          status: CampaignEventStatus.DRAFT,
        },
        select: EVENT_SELECT,
      });

      await tx.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          mode,
          actorType: AuditActorType.USER,
          actorUserId: user.userId,
          action: 'CAMPAIGN_EVENT_CREATED',
          resourceType: 'CampaignEvent',
          resourceId: event.id,
          after: this.auditSnapshot(event),
        },
      });

      return event;
    });
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateCampaignEventDto,
  ) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Debe enviar al menos un cambio');
    }

    const mode = await this.getActiveMode(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_WRITE_ROLES, 'actualizar');
    await this.assertActorInTenant(user);
    const existing = await this.prisma.campaignEvent.findFirst({
      where: { id, tenantId: user.tenantId, mode },
      select: EVENT_SELECT,
    });

    if (!existing) {
      throw new NotFoundException('Evento no encontrado');
    }

    if (
      existing.status === CampaignEventStatus.COMPLETED ||
      existing.status === CampaignEventStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Los eventos finalizados o cancelados no pueden modificarse',
      );
    }

    if (dto.name !== undefined) {
      this.assertNonBlank(dto.name, 'El nombre del evento es obligatorio');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    this.assertValidSchedule(startsAt, endsAt);

    if (dto.responsibleId) {
      await this.assertResponsibleInScope(
        user.tenantId,
        mode,
        dto.responsibleId,
      );
    }

    const data: Prisma.CampaignEventUncheckedUpdateManyInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.startsAt !== undefined) data.startsAt = startsAt;
    if (dto.endsAt !== undefined) data.endsAt = endsAt;
    if (dto.location !== undefined) {
      data.location = dto.location?.trim() || null;
    }
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.responsibleId !== undefined) {
      data.responsibleId = dto.responsibleId;
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const result = await tx.campaignEvent.updateMany({
            where: {
              id,
              tenantId: user.tenantId,
              mode,
              status: existing.status,
            },
            data,
          });

          if (result.count !== 1) {
            throw new ConflictException(
              'El evento cambió durante la edición; actualice la agenda',
            );
          }

          const updated = await tx.campaignEvent.findFirst({
            where: { id, tenantId: user.tenantId, mode },
            select: EVENT_SELECT,
          });

          if (!updated) {
            throw new NotFoundException('Evento no encontrado');
          }

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'CAMPAIGN_EVENT_UPDATED',
              resourceType: 'CampaignEvent',
              resourceId: id,
              before: this.auditSnapshot(existing),
              after: this.auditSnapshot(updated),
            },
          });

          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      this.rethrowWriteConflict(error);
    }
  }

  async transition(
    user: AuthenticatedUser,
    id: string,
    dto: TransitionCampaignEventDto,
  ) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertModeRole(
      user.role,
      mode,
      MODE_WRITE_ROLES,
      'cambiar el estado de',
    );
    await this.assertActorInTenant(user);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.campaignEvent.findFirst({
            where: { id, tenantId: user.tenantId, mode },
            select: EVENT_SELECT,
          });

          if (!existing) {
            throw new NotFoundException('Evento no encontrado');
          }

          this.assertStatusTransition(existing.status, dto.status);
          const result = await tx.campaignEvent.updateMany({
            where: {
              id,
              tenantId: user.tenantId,
              mode,
              status: existing.status,
            },
            data: { status: dto.status },
          });

          if (result.count !== 1) {
            throw new ConflictException(
              'El evento cambió durante la transición; actualice la agenda',
            );
          }

          const updated = await tx.campaignEvent.findFirst({
            where: { id, tenantId: user.tenantId, mode },
            select: EVENT_SELECT,
          });

          if (!updated) {
            throw new NotFoundException('Evento no encontrado');
          }

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'CAMPAIGN_EVENT_STATUS_CHANGED',
              resourceType: 'CampaignEvent',
              resourceId: id,
              before: this.auditSnapshot(existing),
              after: this.auditSnapshot(updated),
              metadata: { transition: `${existing.status}->${dto.status}` },
            },
          });

          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      this.rethrowWriteConflict(error);
    }
  }

  async remove(user: AuthenticatedUser, id: string) {
    const mode = await this.getActiveMode(user.tenantId);
    this.assertModeRole(user.role, mode, MODE_WRITE_ROLES, 'eliminar');
    await this.assertActorInTenant(user);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.campaignEvent.findFirst({
            where: { id, tenantId: user.tenantId, mode },
            select: {
              ...EVENT_SELECT,
              _count: { select: { attendees: true } },
            },
          });

          if (!existing) {
            throw new NotFoundException('Evento no encontrado');
          }

          if (existing.status !== CampaignEventStatus.DRAFT) {
            throw new ConflictException(
              'Sólo se pueden eliminar borradores; cancele los eventos publicados',
            );
          }

          if (existing._count.attendees > 0) {
            throw new ConflictException(
              'No se puede eliminar un evento con asistencias registradas',
            );
          }

          const result = await tx.campaignEvent.deleteMany({
            where: {
              id,
              tenantId: user.tenantId,
              mode,
              status: CampaignEventStatus.DRAFT,
            },
          });

          if (result.count !== 1) {
            throw new ConflictException(
              'El evento cambió durante la eliminación; actualice la agenda',
            );
          }

          await tx.auditEvent.create({
            data: {
              tenantId: user.tenantId,
              mode,
              actorType: AuditActorType.USER,
              actorUserId: user.userId,
              action: 'CAMPAIGN_EVENT_DRAFT_DELETED',
              resourceType: 'CampaignEvent',
              resourceId: id,
              before: this.auditSnapshot(existing),
            },
          });

          return { id, deleted: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      this.rethrowWriteConflict(error);
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
        `Su rol no puede ${action} eventos en el modo operativo actual`,
      );
    }
  }

  private async assertActorInTenant(user: AuthenticatedUser): Promise<void> {
    const actor = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId, isActive: true },
      select: { id: true },
    });

    if (!actor) {
      throw new ForbiddenException(
        'El usuario autenticado no pertenece a la organización actual',
      );
    }
  }

  private async assertResponsibleInScope(
    tenantId: string,
    mode: PoliticalOperationMode,
    responsibleId: string,
  ): Promise<void> {
    const responsible = await this.prisma.user.findFirst({
      where: {
        id: responsibleId,
        tenantId,
        isActive: true,
        role: { in: [...MODE_RESPONSIBLE_ROLES[mode]] },
      },
      select: { id: true },
    });

    if (!responsible) {
      throw new BadRequestException(
        'El responsable no pertenece al equipo elegible de la organización',
      );
    }
  }

  private assertValidSchedule(startsAt: Date, endsAt: Date): void {
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      throw new BadRequestException(
        'La hora de finalización debe ser posterior a la hora de inicio',
      );
    }
  }

  private assertStatusTransition(
    current: CampaignEventStatus,
    next: CampaignEventStatus,
  ): void {
    if (current === next || !STATUS_TRANSITIONS[current].includes(next)) {
      throw new BadRequestException(
        `Transición de estado no permitida: ${current} → ${next}`,
      );
    }
  }

  private assertNonBlank(value: string, message: string): void {
    if (!value.trim()) {
      throw new BadRequestException(message);
    }
  }

  private auditSnapshot(value: {
    status: CampaignEventStatus;
    startsAt: Date;
    endsAt: Date;
    capacity: number | null;
  }): Prisma.InputJsonObject {
    return {
      status: value.status,
      startsAt: value.startsAt.toISOString(),
      endsAt: value.endsAt.toISOString(),
      capacity: value.capacity,
    };
  }

  private rethrowWriteConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034'
    ) {
      throw new ConflictException(
        'El evento cambió en otra sesión; actualice la agenda',
      );
    }

    throw error;
  }
}
