import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignEventStatus,
  PoliticalOperationMode,
  Role,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

describe('EventsService tenant, mode and lifecycle controls', () => {
  const actor: AuthenticatedUser = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    role: Role.CAMPAIGN_MANAGER,
  };
  const baseEvent = {
    id: 'event-a',
    mode: PoliticalOperationMode.CAMPAIGN,
    name: 'Encuentro territorial',
    description: 'Contenido que no debe llegar a auditoría',
    startsAt: new Date('2026-09-01T14:00:00.000Z'),
    endsAt: new Date('2026-09-01T16:00:00.000Z'),
    location: 'Dirección que no debe llegar a auditoría',
    status: CampaignEventStatus.DRAFT,
    capacity: 120,
    responsibleId: 'user-a',
    responsible: {
      id: 'user-a',
      name: 'Responsable',
      role: Role.CAMPAIGN_MANAGER,
    },
    createdAt: new Date('2026-08-21T12:00:00.000Z'),
    updatedAt: new Date('2026-08-21T12:00:00.000Z'),
  };

  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock; findMany: jest.Mock };
    campaignEvent: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    auditEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: EventsService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        }),
      },
      user: {
        findFirst: jest
          .fn()
          .mockImplementation(({ select }) =>
            Promise.resolve(
              'role' in select
                ? { role: Role.CAMPAIGN_MANAGER }
                : { id: 'user-a' },
            ),
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      campaignEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    service = new EventsService(prisma as unknown as PrismaService);
  });

  it('always scopes paginated reads to the JWT tenant and server-side mode', async () => {
    await service.findAll(actor, {
      page: 2,
      limit: 10,
      search: 'territorio',
      status: CampaignEventStatus.SCHEDULED,
    });

    expect(prisma.campaignEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          status: CampaignEventStatus.SCHEDULED,
        }),
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.campaignEvent.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
      }),
    });
  });

  it('rejects an inverted list date range before querying events', async () => {
    await expect(
      service.findAll(actor, {
        startsFrom: '2026-10-02T00:00:00.000Z',
        startsTo: '2026-10-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campaignEvent.findMany).not.toHaveBeenCalled();
  });

  it('hides an event outside the authenticated tenant and active mode', async () => {
    prisma.campaignEvent.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(actor, 'event-from-tenant-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.campaignEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'event-from-tenant-b',
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
        },
      }),
    );
  });

  it.each([
    [PoliticalOperationMode.CAMPAIGN, Role.CASE_WORKER],
    [PoliticalOperationMode.PUBLIC_OFFICE, Role.CAMPAIGN_MANAGER],
    [PoliticalOperationMode.PUBLIC_OFFICE, Role.ZONE_COORDINATOR],
  ])(
    'denies role %s/%s outside its operational mode matrix',
    async (mode, role) => {
      prisma.tenant.findUnique.mockResolvedValue({ defaultMode: mode });
      prisma.user.findFirst.mockResolvedValue({ role });

      await expect(
        service.findAll({ ...actor, role }, { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.campaignEvent.findMany).not.toHaveBeenCalled();
    },
  );

  it('allows public-office auditors to read but not mutate the agenda', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    const auditor = { ...actor, role: Role.AUDITOR };
    prisma.user.findFirst.mockResolvedValue({ role: Role.AUDITOR });

    await expect(service.findAll(auditor, {})).resolves.toMatchObject({
      items: [],
    });
    await expect(
      service.create(auditor, {
        name: 'Rendición pública',
        startsAt: '2026-09-01T14:00:00.000Z',
        endsAt: '2026-09-01T16:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates the complete schedule before writing', async () => {
    await expect(
      service.create(actor, {
        name: 'Horario inválido',
        startsAt: '2026-09-01T16:00:00.000Z',
        endsAt: '2026-09-01T14:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a responsible person outside the JWT tenant and eligible roles', async () => {
    prisma.user.findFirst.mockImplementation(
      ({ where, select }: { where: { id: string }; select: object }) =>
        Promise.resolve(
          'role' in select
            ? { role: Role.CAMPAIGN_MANAGER }
            : where.id === actor.userId
              ? { id: actor.userId }
              : null,
        ),
    );

    await expect(
      service.create(actor, {
        name: 'Encuentro ciudadano',
        startsAt: '2026-09-01T14:00:00.000Z',
        endsAt: '2026-09-01T16:00:00.000Z',
        responsibleId: 'user-from-tenant-b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campaignEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a deactivated responsible person before writing', async () => {
    prisma.user.findFirst.mockImplementation(
      ({
        where,
        select,
      }: {
        where: { id: string; isActive?: boolean };
        select: object;
      }) =>
        Promise.resolve(
          'role' in select
            ? { role: Role.CAMPAIGN_MANAGER }
            : where.id === actor.userId && where.isActive === true
              ? { id: actor.userId }
              : null,
        ),
    );

    await expect(
      service.create(actor, {
        name: 'Encuentro ciudadano',
        startsAt: '2026-09-01T14:00:00.000Z',
        endsAt: '2026-09-01T16:00:00.000Z',
        responsibleId: 'inactive-user',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'inactive-user',
        tenantId: 'tenant-a',
        isActive: true,
        role: { in: expect.any(Array) },
      },
      select: { id: true },
    });
    expect(prisma.campaignEvent.create).not.toHaveBeenCalled();
  });

  it('creates a DRAFT and a minimal audit record atomically', async () => {
    prisma.campaignEvent.create.mockResolvedValue(baseEvent);
    let auditArgs: unknown;
    prisma.auditEvent.create.mockImplementation((args: unknown) => {
      auditArgs = args;
      return Promise.resolve({ id: 'audit-created' });
    });

    await service.create(actor, {
      name: '  Encuentro territorial  ',
      description: 'Descripción sensible del operativo',
      startsAt: '2026-09-01T14:00:00.000Z',
      endsAt: '2026-09-01T16:00:00.000Z',
      location: 'Dirección sensible',
      capacity: 120,
      responsibleId: 'user-a',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.campaignEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.CAMPAIGN,
          status: CampaignEventStatus.DRAFT,
          name: 'Encuentro territorial',
        }),
      }),
    );
    expect(auditArgs).toMatchObject({
      data: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        action: 'CAMPAIGN_EVENT_CREATED',
        resourceId: 'event-a',
        after: {
          status: CampaignEventStatus.DRAFT,
          capacity: 120,
        },
      },
    });
    const serializedAudit = JSON.stringify(auditArgs);
    expect(serializedAudit).not.toContain('Descripción sensible');
    expect(serializedAudit).not.toContain('Dirección sensible');
    expect(serializedAudit).not.toContain('Encuentro territorial');
    expect(serializedAudit).not.toContain('responsibleId');
  });

  it('blocks edits to terminal events', async () => {
    prisma.campaignEvent.findFirst.mockResolvedValue({
      ...baseEvent,
      status: CampaignEventStatus.COMPLETED,
    });

    await expect(
      service.update(actor, 'event-a', { location: 'Nuevo lugar' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.campaignEvent.updateMany).not.toHaveBeenCalled();
  });

  it('updates only the scoped nonterminal event with optimistic status control', async () => {
    const updated = { ...baseEvent, capacity: 200 };
    prisma.campaignEvent.findFirst
      .mockResolvedValueOnce(baseEvent)
      .mockResolvedValueOnce(updated);

    await expect(
      service.update(actor, 'event-a', { capacity: 200 }),
    ).resolves.toMatchObject({ capacity: 200 });
    expect(prisma.campaignEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'event-a',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        status: CampaignEventStatus.DRAFT,
      },
      data: { capacity: 200 },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CAMPAIGN_EVENT_UPDATED' }),
      }),
    );
  });

  it('rejects unsafe status jumps without writing', async () => {
    prisma.campaignEvent.findFirst.mockResolvedValue(baseEvent);

    await expect(
      service.transition(actor, 'event-a', {
        status: CampaignEventStatus.COMPLETED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campaignEvent.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('performs a valid scoped transition and audits only operational metadata', async () => {
    const scheduled = {
      ...baseEvent,
      status: CampaignEventStatus.SCHEDULED,
    };
    prisma.campaignEvent.findFirst
      .mockResolvedValueOnce(baseEvent)
      .mockResolvedValueOnce(scheduled);

    await expect(
      service.transition(actor, 'event-a', {
        status: CampaignEventStatus.SCHEDULED,
      }),
    ).resolves.toMatchObject({ status: CampaignEventStatus.SCHEDULED });
    expect(prisma.campaignEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'event-a',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        status: CampaignEventStatus.DRAFT,
      },
      data: { status: CampaignEventStatus.SCHEDULED },
    });
    const auditCall = prisma.auditEvent.create.mock.calls[0]?.[0];
    expect(auditCall.data.metadata).toEqual({
      transition: 'DRAFT->SCHEDULED',
    });
    expect(JSON.stringify(auditCall)).not.toContain(baseEvent.description);
    expect(JSON.stringify(auditCall)).not.toContain(baseEvent.location);
  });

  it('deletes only a scoped DRAFT without attendance and preserves audit evidence', async () => {
    prisma.campaignEvent.findFirst.mockResolvedValue({
      ...baseEvent,
      _count: { attendees: 0 },
    });

    await expect(service.remove(actor, 'event-a')).resolves.toEqual({
      id: 'event-a',
      deleted: true,
    });
    expect(prisma.campaignEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'event-a',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        status: CampaignEventStatus.DRAFT,
      },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CAMPAIGN_EVENT_DRAFT_DELETED',
          resourceId: 'event-a',
        }),
      }),
    );
  });

  it.each([
    [
      {
        ...baseEvent,
        status: CampaignEventStatus.SCHEDULED,
        _count: { attendees: 0 },
      },
    ],
    [{ ...baseEvent, _count: { attendees: 1 } }],
  ])(
    'refuses destructive deletion when lifecycle evidence must be retained',
    async (event) => {
      prisma.campaignEvent.findFirst.mockResolvedValue(event);

      await expect(service.remove(actor, 'event-a')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.campaignEvent.deleteMany).not.toHaveBeenCalled();
    },
  );

  it('lists only mode-eligible responsible users from the JWT tenant', async () => {
    await service.listResponsibles(actor);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          isActive: true,
          role: {
            in: expect.arrayContaining([
              Role.CAMPAIGN_MANAGER,
              Role.ZONE_COORDINATOR,
              Role.VOLUNTEER,
            ]),
          },
        },
      }),
    );
  });

  it('removes global event writes from zone coordinators until events have territory', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.ZONE_COORDINATOR });

    await expect(
      service.create(
        { ...actor, role: Role.CAMPAIGN_MANAGER },
        {
          name: 'Evento fuera de alcance',
          startsAt: '2026-09-01T14:00:00.000Z',
          endsAt: '2026-09-01T16:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.campaignEvent.create).not.toHaveBeenCalled();
  });

  it('shows low campaign roles only published events and hides drafts by id', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.VOLUNTEER });
    prisma.campaignEvent.findFirst.mockResolvedValue(null);
    const volunteer = { ...actor, userId: 'volunteer-a', role: Role.ADMIN };

    await service.findAll(volunteer, { page: 1, limit: 20 });
    await expect(service.findOne(volunteer, 'draft-a')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.campaignEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          status: {
            in: expect.not.arrayContaining([CampaignEventStatus.DRAFT]),
          },
        }) as object,
      }),
    );
    expect(prisma.campaignEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'draft-a',
          tenantId: 'tenant-a',
          status: {
            in: expect.not.arrayContaining([CampaignEventStatus.DRAFT]),
          },
        }) as object,
      }),
    );
  });

  it('rejects an explicit draft filter from a low campaign role', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: Role.WITNESS });

    await expect(
      service.findAll(
        { ...actor, userId: 'witness-a', role: Role.ADMIN },
        { page: 1, limit: 20, status: CampaignEventStatus.DRAFT },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.campaignEvent.findMany).not.toHaveBeenCalled();
  });
});
