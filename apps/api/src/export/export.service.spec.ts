import { ForbiddenException } from '@nestjs/common';
import {
  ConsentStatus,
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { ExportModule } from './dto/export-module-params.dto';
import { ExportService } from './export.service';

describe('ExportService tenant isolation, privacy and bounded streaming', () => {
  const currentUser: AuthenticatedUser = {
    userId: 'admin-a',
    tenantId: 'tenant-a',
    email: 'admin@example.test',
    role: Role.ADMIN,
  };

  let prisma: {
    tenant: { findUnique: jest.Mock };
    consentNotice: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock; findMany: jest.Mock };
    voter: { findMany: jest.Mock };
    task: { findMany: jest.Mock };
    issueCase: { findMany: jest.Mock };
    commitment: { findMany: jest.Mock };
    campaignEvent: { findMany: jest.Mock };
    auditEvent: { create: jest.Mock };
  };
  let service: ExportService;

  async function collectExport(
    moduleName: ExportModule,
    user: AuthenticatedUser = currentUser,
    signal?: AbortSignal,
  ): Promise<{ fileName: string; csv: string }> {
    const opened = await service.openExport(moduleName, user, signal);
    const chunks: Buffer[] = [];
    for await (const chunk of opened.chunks) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return {
      fileName: opened.fileName,
      csv: Buffer.concat(chunks).toString('utf8'),
    };
  }

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Alcaldía de Prueba',
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      consentNotice: {
        findFirst: jest.fn().mockResolvedValue({ version: 'privacy-2026-09' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ name: 'Administradora' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      voter: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      issueCase: { findMany: jest.fn().mockResolvedValue([]) },
      commitment: { findMany: jest.fn().mockResolvedValue([]) },
      campaignEvent: { findMany: jest.fn().mockResolvedValue([]) },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
    };
    service = new ExportService(prisma as unknown as PrismaService);
  });

  it('uses server-side tenant mode, bounded queries and a tenant-scoped actor', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      name: 'Despacho de Prueba',
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-a',
        title: 'Seguimiento',
        description: '=SUM(1,1)\nsegunda fila',
        status: 'OPEN',
        priority: 'HIGH',
        assignee: { name: 'Responsable' },
        dueAt: new Date('2026-09-10T00:00:00.000Z'),
        completedAt: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);

    const result = await collectExport('tareas');

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: { name: true, defaultMode: true, type: true },
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'admin-a', tenantId: 'tenant-a' },
      select: { name: true },
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 250,
      }),
    );
    expect(prisma.task.findMany.mock.calls[0][0]).not.toHaveProperty('include');
    expect(prisma.task.findMany.mock.calls[0][0].select).toEqual(
      expect.objectContaining({ id: true, title: true, createdAt: true }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
        actorType: 'USER',
        actorUserId: 'admin-a',
        action: 'DATA_EXPORTED',
        resourceType: 'tareas',
        resourceId: 'ALL',
      },
    });
    expect(result.fileName).toMatch(/^export-tareas-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.csv.startsWith('\uFEFF')).toBe(true);
    expect(result.csv).toContain("'=SUM(1,1) segunda fila");
  });

  it('masks voter PII and neutralizes spreadsheet formulas', async () => {
    prisma.voter.findMany.mockResolvedValue([
      {
        id: 'voter-a',
        documentId: '12345678',
        firstName: 'Ana',
        lastName: 'Prueba',
        phone: '3001234567',
        email: 'ana@example.test',
        puesto: { name: 'Puesto 1' },
        mesa: 12,
        consentRecords: [
          {
            id: 'consent-a',
            status: ConsentStatus.GRANTED,
            noticeVersion: 'privacy-2026-09',
            grantedAt: new Date('2026-09-01T00:00:00.000Z'),
            expiresAt: null,
            revokedAt: null,
            createdAt: new Date('2026-09-01T00:00:00.000Z'),
          },
        ],
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);

    const { csv } = await collectExport('personas');

    expect(prisma.voter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 250,
        select: expect.objectContaining({
          id: true,
          puesto: { select: { name: true } },
          consentRecords: expect.objectContaining({ take: 1 }),
        }),
      }),
    );
    expect(csv).toContain('****5678');
    expect(csv).toContain('******4567');
    expect(csv).not.toContain('12345678');
    expect(csv).not.toContain('3001234567');
    expect(csv).not.toContain('ana@example.test');
    expect(csv).toContain('a***@example.test');
    expect(csv).toContain('"Sí"');
  });

  it('never exports historical consent as current after the notice changes', async () => {
    prisma.voter.findMany.mockResolvedValue([
      {
        id: 'voter-a',
        documentId: '12345678',
        firstName: 'Ana',
        lastName: 'Prueba',
        phone: null,
        email: null,
        puesto: null,
        mesa: null,
        consentRecords: [
          {
            id: 'consent-old',
            status: ConsentStatus.GRANTED,
            noticeVersion: 'privacy-2026-08',
            grantedAt: new Date('2026-08-01T00:00:00.000Z'),
            expiresAt: null,
            revokedAt: null,
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
          },
        ],
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);

    const { csv } = await collectExport('personas');

    expect(csv).toContain('"No"');
    expect(csv).not.toContain('"Sí"');
  });

  it.each([
    ['casos', 'issueCase'],
    ['compromisos', 'commitment'],
    ['eventos', 'campaignEvent'],
  ] as const)(
    'filters %s by both JWT tenant and server-side active mode',
    async (moduleName, modelName) => {
      prisma.tenant.findUnique.mockResolvedValue({
        name: 'Despacho de Prueba',
        defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
        type: TenantType.PUBLIC_OFFICE,
      });

      await collectExport(moduleName);

      expect(prisma[modelName].findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-a',
            mode: PoliticalOperationMode.PUBLIC_OFFICE,
          },
          take: 250,
        }),
      );
    },
  );

  it.each([Role.CAMPAIGN_MANAGER, Role.COMPLIANCE_OFFICER, Role.AUDITOR])(
    'blocks team exports for non-admin role %s before reading users',
    async (role) => {
      await expect(
        service.openExport('equipo', { ...currentUser, role }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    },
  );

  it('blocks voter exports outside campaign mode before reading PII', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      name: 'Despacho de Prueba',
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });

    await expect(service.openExport('personas', currentUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.voter.findMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('uses a stable keyset cursor instead of an unbounded offset', async () => {
    const firstBatch = Array.from({ length: 250 }, (_, index) => ({
      id: `task-${index.toString().padStart(3, '0')}`,
      title: `Tarea ${index}`,
      description: null,
      status: 'OPEN',
      priority: 'MEDIUM',
      assignee: null,
      dueAt: null,
      completedAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    }));
    prisma.task.findMany
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([]);

    await collectExport('tareas');

    expect(prisma.task.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.task.findMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        cursor: { id: 'task-249' },
        skip: 1,
        take: 250,
      }),
    );
  });

  it('does not audit a download that the client cancels before completion', async () => {
    const opened = await service.openExport('tareas', currentUser);

    await opened.chunks.next();
    await opened.chunks.return(undefined);

    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('honors an already-aborted request before reading export data', async () => {
    const abortController = new AbortController();
    const opened = await service.openExport(
      'tareas',
      currentUser,
      abortController.signal,
    );
    abortController.abort();

    await expect(opened.chunks.next()).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });
});
