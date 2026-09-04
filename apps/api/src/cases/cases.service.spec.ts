import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CommunicationChannel,
  IssueCaseStatus,
  PoliticalOperationMode,
  Role,
  WorkPriority,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CasesService } from './cases.service';

describe('CasesService tenant and mode isolation', () => {
  const currentUser: AuthenticatedUser = {
    userId: 'agent-a',
    tenantId: 'tenant-a',
    role: Role.ADMIN,
  };

  let prisma: {
    tenant: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock; findMany: jest.Mock };
    voter: { findFirst: jest.Mock };
    politicalDivision: { findFirst: jest.Mock };
    interaction: { findFirst: jest.Mock };
    issueCase: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    auditEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: CasesService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ defaultMode: PoliticalOperationMode.CAMPAIGN }),
      },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      voter: { findFirst: jest.fn() },
      politicalDivision: { findFirst: jest.fn() },
      interaction: { findFirst: jest.fn() },
      issueCase: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    service = new CasesService(prisma as unknown as PrismaService);
  });

  it('always scopes paginated reads to the JWT tenant and server-side mode', async () => {
    let capturedFindMany: unknown;
    let capturedCount: unknown;
    prisma.issueCase.findMany.mockImplementation((args: unknown) => {
      capturedFindMany = args;
      return Promise.resolve([]);
    });
    prisma.issueCase.count.mockImplementation((args: unknown) => {
      capturedCount = args;
      return Promise.resolve(0);
    });

    await service.findAll(currentUser, { page: 2, limit: 10, search: 'agua' });

    const findManyArgs = capturedFindMany as
      | {
          where: { tenantId: string; mode: PoliticalOperationMode };
          skip: number;
          take: number;
        }
      | undefined;
    const countArgs = capturedCount as
      | { where: { tenantId: string; mode: PoliticalOperationMode } }
      | undefined;

    expect(findManyArgs?.where.tenantId).toBe('tenant-a');
    expect(findManyArgs?.where.mode).toBe(PoliticalOperationMode.CAMPAIGN);
    expect(findManyArgs?.skip).toBe(10);
    expect(findManyArgs?.take).toBe(10);
    expect(countArgs?.where).toMatchObject({
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.CAMPAIGN,
    });
  });

  it('reports resolution readiness without exposing the supporting relation', async () => {
    prisma.issueCase.findMany.mockResolvedValue([
      {
        id: 'case-ready',
        reference: 'PQRS-CAM-2026-READY',
        interactions: [{ id: 'interaction-result' }],
      },
    ]);
    prisma.issueCase.count.mockResolvedValue(1);

    const result = await service.findAll(currentUser, { page: 1, limit: 20 });

    expect(result.items[0]).toMatchObject({
      id: 'case-ready',
      resolutionReady: true,
    });
    expect(result.items[0]).not.toHaveProperty('interactions');
  });

  it('does not update a case owned by another tenant', async () => {
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.update(currentUser, 'case-from-tenant-b', {
        status: IssueCaseStatus.TRIAGED,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'case-from-tenant-b',
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
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
    expect(prisma.issueCase.update).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects an assignee from another tenant before creating the case', async () => {
    prisma.issueCase.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === currentUser.userId ? { id: where.id } : null,
        ),
    );

    await expect(
      service.create(currentUser, {
        title: 'Falla de alumbrado',
        description: 'Tres luminarias apagadas',
        category: 'Servicios públicos',
        sourceChannel: CommunicationChannel.WEB,
        assigneeId: 'agent-from-tenant-b',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'agent-from-tenant-b', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(prisma.issueCase.create).not.toHaveBeenCalled();
  });

  it('checks reference uniqueness inside tenant and active mode', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({ id: 'existing-case' });
    prisma.user.findFirst.mockResolvedValue({ id: currentUser.userId });

    await expect(
      service.create(currentUser, {
        reference: 'PQRS-2026-001',
        title: 'Solicitud',
        description: 'Solicitud ciudadana verificable',
        category: 'Información',
        sourceChannel: CommunicationChannel.EMAIL,
      }),
    ).rejects.toThrow('La referencia ya existe');

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        reference: 'PQRS-2026-001',
      },
      select: { id: true },
    });
  });

  it('rejects creating a case with two competing subjects', async () => {
    await expect(
      service.create(currentUser, {
        title: 'Solicitud ambigua',
        description: 'No debe mezclar identidades',
        category: 'Informacion',
        sourceChannel: CommunicationChannel.PHONE,
        voterId: 'voter-a',
        externalContactRef: 'citizen-ref-a',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.issueCase.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects updating a case into an ambiguous subject', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      reference: 'PQRS-CAM-2026-001',
      status: IssueCaseStatus.OPEN,
      priority: WorkPriority.MEDIUM,
      category: 'Informacion',
      assigneeId: null,
      dueAt: null,
      confidential: false,
      voterId: 'voter-a',
      externalContactRef: null,
      firstResponseAt: null,
      resolvedAt: null,
    });

    await expect(
      service.update(currentUser, 'case-a', {
        externalContactRef: 'citizen-ref-a',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.issueCase.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('creates the case and a redacted audit event in one transaction', async () => {
    prisma.issueCase.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: currentUser.userId });
    prisma.issueCase.create.mockResolvedValue({
      id: 'case-created',
      reference: 'PQRS-CAM-2026-001',
      status: IssueCaseStatus.OPEN,
      priority: WorkPriority.MEDIUM,
      category: 'Servicios públicos',
      assigneeId: null,
      dueAt: null,
      confidential: false,
    });
    let capturedAudit: unknown;
    prisma.auditEvent.create.mockImplementation((args: unknown) => {
      capturedAudit = args;
      return Promise.resolve({ id: 'audit-created' });
    });

    await service.create(currentUser, {
      reference: 'PQRS-CAM-2026-001',
      title: 'Falla de alumbrado',
      description: 'Dato ciudadano que no debe copiarse al audit log',
      category: 'Servicios públicos',
      sourceChannel: CommunicationChannel.WEB,
    });

    const audit = capturedAudit as
      | {
          data: {
            tenantId: string;
            mode: PoliticalOperationMode;
            action: string;
            resourceId: string;
            after: Record<string, unknown>;
          };
        }
      | undefined;
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit?.data).toMatchObject({
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.CAMPAIGN,
      action: 'ISSUE_CASE_CREATED',
      resourceId: 'case-created',
    });
    expect(audit?.data.after).toMatchObject({
      reference: 'PQRS-CAM-2026-001',
      status: IssueCaseStatus.OPEN,
      category: 'Servicios públicos',
    });
    expect(audit?.data.after).not.toHaveProperty('description');
    expect(audit?.data.after).not.toHaveProperty('externalContactRef');
  });

  it('rejects invalid status jumps and never writes an audit event', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      reference: 'PQRS-CAM-2026-001',
      status: IssueCaseStatus.OPEN,
      priority: WorkPriority.MEDIUM,
      category: 'Información',
      assigneeId: null,
      dueAt: null,
      confidential: false,
      firstResponseAt: null,
      resolvedAt: null,
    });

    await expect(
      service.update(currentUser, 'case-a', {
        status: IssueCaseStatus.CLOSED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.issueCase.update).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('validates transitions against the status read inside the transaction', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      reference: 'PQRS-CAM-2026-001',
      status: IssueCaseStatus.CANCELLED,
      priority: WorkPriority.MEDIUM,
      category: 'Informacion',
      assigneeId: null,
      dueAt: null,
      confidential: false,
      voterId: null,
      externalContactRef: null,
      firstResponseAt: null,
      resolvedAt: null,
    });

    await expect(
      service.update(currentUser, 'case-a', {
        status: IssueCaseStatus.TRIAGED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.issueCase.findFirst.mock.invocationCallOrder[0],
    );
    expect(prisma.issueCase.update).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('does not infer first response from a status transition', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      reference: 'PQRS-CAM-2026-001',
      status: IssueCaseStatus.OPEN,
      priority: WorkPriority.MEDIUM,
      category: 'Informacion',
      assigneeId: null,
      dueAt: null,
      confidential: false,
      firstResponseAt: null,
      resolvedAt: null,
    });
    prisma.issueCase.update.mockResolvedValue({
      id: 'case-a',
      reference: 'PQRS-CAM-2026-001',
      status: IssueCaseStatus.TRIAGED,
      priority: WorkPriority.MEDIUM,
      category: 'Informacion',
      assigneeId: null,
      dueAt: null,
      confidential: false,
      firstResponseAt: null,
      resolvedAt: null,
    });

    await service.update(currentUser, 'case-a', {
      status: IssueCaseStatus.TRIAGED,
    });

    const updateArgs = prisma.issueCase.update.mock.calls[0]?.[0] as
      | { data: Record<string, unknown> }
      | undefined;
    expect(updateArgs?.data).toMatchObject({
      status: IssueCaseStatus.TRIAGED,
      resolvedAt: null,
    });
    expect(updateArgs?.data).not.toHaveProperty('firstResponseAt');
  });

  it('rejects resolving a case without a prior interaction outcome', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-without-resolution',
      reference: 'PQRS-CAM-2026-010',
      status: IssueCaseStatus.IN_PROGRESS,
      priority: WorkPriority.HIGH,
      category: 'Servicios',
      assigneeId: null,
      dueAt: null,
      confidential: false,
      voterId: null,
      externalContactRef: null,
      firstResponseAt: null,
      resolvedAt: null,
    });
    prisma.interaction.findFirst.mockResolvedValue(null);

    await expect(
      service.update(currentUser, 'case-without-resolution', {
        status: IssueCaseStatus.RESOLVED,
      }),
    ).rejects.toThrow(
      'Registre primero en la bitacora una interaccion con resultado antes de resolver el caso',
    );

    expect(prisma.interaction.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.CAMPAIGN,
        issueCaseId: 'case-without-resolution',
        outcome: { not: null },
      },
      select: { id: true },
    });
    expect(prisma.issueCase.update).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('resolves a case when a prior interaction has a traceable outcome', async () => {
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-with-resolution',
      reference: 'PQRS-CAM-2026-011',
      status: IssueCaseStatus.IN_PROGRESS,
      priority: WorkPriority.HIGH,
      category: 'Servicios',
      assigneeId: null,
      dueAt: null,
      confidential: false,
      voterId: null,
      externalContactRef: null,
      firstResponseAt: null,
      resolvedAt: null,
    });
    prisma.interaction.findFirst.mockResolvedValue({
      id: 'interaction-result',
    });
    prisma.issueCase.update.mockResolvedValue({
      id: 'case-with-resolution',
      reference: 'PQRS-CAM-2026-011',
      status: IssueCaseStatus.RESOLVED,
      priority: WorkPriority.HIGH,
      category: 'Servicios',
      assigneeId: null,
      dueAt: null,
      confidential: false,
      resolvedAt: new Date(),
      interactions: [{ id: 'interaction-result' }],
    });

    await expect(
      service.update(currentUser, 'case-with-resolution', {
        status: IssueCaseStatus.RESOLVED,
      }),
    ).resolves.toMatchObject({
      id: 'case-with-resolution',
      status: IssueCaseStatus.RESOLVED,
      resolutionReady: true,
    });

    expect(prisma.issueCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: IssueCaseStatus.RESOLVED,
          resolvedAt: expect.any(Date),
        }),
      }),
    );
  });

  it.each([Role.VOLUNTEER, Role.WITNESS])(
    'denies PQRS reads to operational role %s',
    async (role) => {
      await expect(
        service.findAll({ ...currentUser, role }, { page: 1, limit: 20 }),
      ).rejects.toMatchObject({ status: 403 });

      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
      expect(prisma.issueCase.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([Role.AUDITOR, Role.COMPLIANCE_OFFICER])(
    'allows %s to read but denies case mutations',
    async (role) => {
      const readOnlyUser = { ...currentUser, role };

      await expect(
        service.findAll(readOnlyUser, { page: 1, limit: 20 }),
      ).resolves.toMatchObject({ items: [] });
      await expect(
        service.update(readOnlyUser, 'case-a', {
          status: IssueCaseStatus.TRIAGED,
        }),
      ).rejects.toMatchObject({ status: 403 });
    },
  );

  it('scopes CASE_WORKER lists to cases assigned to the authenticated worker', async () => {
    const caseWorker = { ...currentUser, role: Role.CASE_WORKER };
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    let capturedFindMany: unknown;
    prisma.issueCase.findMany.mockImplementation((args: unknown) => {
      capturedFindMany = args;
      return Promise.resolve([]);
    });

    await service.findAll(caseWorker, { page: 1, limit: 20 });

    expect(capturedFindMany).toMatchObject({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        assigneeId: 'agent-a',
      },
    });
  });

  it('returns 403 when CASE_WORKER tries to list another assignee', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await expect(
      service.findAll(
        { ...currentUser, role: Role.CASE_WORKER },
        { page: 1, limit: 20, assigneeId: 'agent-b' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.issueCase.findMany).not.toHaveBeenCalled();
    expect(prisma.issueCase.count).not.toHaveBeenCalled();
  });

  it('hides an unassigned or cross-user case from CASE_WORKER reads', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(
        { ...currentUser, role: Role.CASE_WORKER },
        'case-assigned-to-agent-b',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const findFirstCalls = prisma.issueCase.findFirst.mock
      .calls as unknown as Array<
      [{ where: Record<string, unknown>; include: Record<string, unknown> }]
    >;
    expect(findFirstCalls[0]?.[0]?.where).toEqual({
      id: 'case-assigned-to-agent-b',
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.PUBLIC_OFFICE,
      assigneeId: 'agent-a',
    });
    expect(findFirstCalls[0]?.[0]?.include).toBeDefined();
  });

  it('hides an unassigned or cross-user case from CASE_WORKER updates', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.issueCase.findFirst.mockResolvedValue(null);

    await expect(
      service.update(
        { ...currentUser, role: Role.CASE_WORKER },
        'case-assigned-to-agent-b',
        { status: IssueCaseStatus.TRIAGED },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.issueCase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'case-assigned-to-agent-b',
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
          assigneeId: 'agent-a',
        },
      }),
    );
    expect(prisma.issueCase.update).not.toHaveBeenCalled();
  });

  it('forces CASE_WORKER as assignee when creating a case', async () => {
    const caseWorker = { ...currentUser, role: Role.CASE_WORKER };
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.issueCase.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: caseWorker.userId });
    prisma.issueCase.create.mockResolvedValue({
      id: 'case-worker-created',
      reference: 'PQRS-CAM-2026-002',
      status: IssueCaseStatus.OPEN,
      priority: WorkPriority.MEDIUM,
      category: 'Servicios',
      assigneeId: caseWorker.userId,
      dueAt: null,
      confidential: false,
    });

    await service.create(caseWorker, {
      reference: 'PQRS-CAM-2026-002',
      title: 'Solicitud asignada',
      description: 'Caso gestionado por el agente autenticado',
      category: 'Servicios',
      sourceChannel: CommunicationChannel.WEB,
    });

    const createCalls = prisma.issueCase.create.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(createCalls[0]?.[0]?.data).toMatchObject({ assigneeId: 'agent-a' });
  });

  it('returns 403 when CASE_WORKER attempts to assign a new case to another user', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await expect(
      service.create(
        { ...currentUser, role: Role.CASE_WORKER },
        {
          title: 'Solicitud',
          description: 'Solicitud que debe conservar minimo privilegio',
          category: 'Servicios',
          sourceChannel: CommunicationChannel.WEB,
          assigneeId: 'agent-b',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.issueCase.findFirst).not.toHaveBeenCalled();
    expect(prisma.issueCase.create).not.toHaveBeenCalled();
  });

  it('returns 403 when CASE_WORKER attempts to reassign an owned case', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });
    prisma.issueCase.findFirst.mockResolvedValue({
      id: 'case-a',
      reference: 'PQRS-CAM-2026-001',
      status: IssueCaseStatus.OPEN,
      priority: WorkPriority.MEDIUM,
      category: 'Servicios',
      assigneeId: 'agent-a',
      dueAt: null,
      confidential: false,
      firstResponseAt: null,
      resolvedAt: null,
    });

    await expect(
      service.update({ ...currentUser, role: Role.CASE_WORKER }, 'case-a', {
        assigneeId: 'agent-b',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.issueCase.update).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('only lists the authenticated worker as an assignable user', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await service.listAssignees({ ...currentUser, role: Role.CASE_WORKER });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: 'agent-a', tenantId: 'tenant-a' },
      select: { id: true, name: true, role: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  });

  it.each([
    [PoliticalOperationMode.CAMPAIGN, Role.CONSTITUENT_SERVICES_MANAGER],
    [PoliticalOperationMode.CAMPAIGN, Role.CASE_WORKER],
    [PoliticalOperationMode.PUBLIC_OFFICE, Role.CAMPAIGN_MANAGER],
  ])(
    'fails closed for incompatible role %s/%s on both reads and writes',
    async (mode, role) => {
      prisma.tenant.findUnique.mockResolvedValue({ defaultMode: mode });
      const incompatibleUser = { ...currentUser, role };

      await expect(
        service.findAll(incompatibleUser, { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.create(incompatibleUser, {
          title: 'Solicitud fuera de modo',
          description: 'No debe atravesar la matriz de autorización',
          category: 'Servicios',
          sourceChannel: CommunicationChannel.WEB,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.issueCase.findMany).not.toHaveBeenCalled();
      expect(prisma.issueCase.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [PoliticalOperationMode.CAMPAIGN, [Role.ADMIN, Role.CAMPAIGN_MANAGER]],
    [
      PoliticalOperationMode.PUBLIC_OFFICE,
      [Role.ADMIN, Role.CONSTITUENT_SERVICES_MANAGER, Role.CASE_WORKER],
    ],
  ])(
    'only lists write-compatible assignees for mode %s',
    async (mode, roles) => {
      prisma.tenant.findUnique.mockResolvedValue({ defaultMode: mode });

      await service.listAssignees(currentUser);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-a',
          role: { in: roles },
        },
        select: { id: true, name: true, role: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
    },
  );
});
