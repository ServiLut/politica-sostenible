import { ForbiddenException } from '@nestjs/common';
import {
  ConsentStatus,
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ExportService } from './export.service';

describe('ExportService tenant isolation and privacy', () => {
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

  it('uses the server-side tenant mode and scopes both actor and exported records', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      name: 'Despacho de Prueba',
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    prisma.task.findMany.mockResolvedValue([
      {
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

    const result = await service.generateExport('tareas', currentUser);

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: { name: true, defaultMode: true, type: true },
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'admin-a', tenantId: 'tenant-a' },
      select: { name: true },
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        mode: PoliticalOperationMode.PUBLIC_OFFICE,
      },
      include: { assignee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
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

    const csv = result.toString('utf8');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("'=SUM(1,1) segunda fila");
  });

  it('masks sensitive voter values and neutralizes spreadsheet formulas', async () => {
    prisma.voter.findMany.mockResolvedValue([
      {
        documentId: '12345678',
        firstName: 'Ana',
        lastName: 'Prueba',
        phone: '3001234567',
        email: 'ana@example.test',
        puesto: { name: 'Puesto 1' },
        mesa: 12,
        consentAccepted: true,
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

    const result = await service.generateExport('personas', currentUser);

    expect(prisma.voter.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      include: {
        puesto: { select: { name: true } },
        consentRecords: expect.objectContaining({ take: 1 }),
      },
      orderBy: { createdAt: 'desc' },
    });
    const csv = result.toString('utf8');
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
        documentId: '12345678',
        firstName: 'Ana',
        lastName: 'Prueba',
        phone: null,
        email: null,
        puesto: null,
        mesa: null,
        consentAccepted: true,
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

    const csv = (
      await service.generateExport('personas', currentUser)
    ).toString('utf8');

    expect(csv).toContain('"No"');
    expect(csv).not.toContain('"Sí"');
  });

  it.each([
    ['casos', 'issueCase'],
    ['compromisos', 'commitment'],
    ['eventos', 'campaignEvent'],
  ] as const)(
    'filters %s by both the JWT tenant and the server-side active mode',
    async (moduleName, modelName) => {
      prisma.tenant.findUnique.mockResolvedValue({
        name: 'Despacho de Prueba',
        defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
        type: TenantType.PUBLIC_OFFICE,
      });

      await service.generateExport(moduleName, currentUser);

      expect(prisma[modelName].findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-a',
            mode: PoliticalOperationMode.PUBLIC_OFFICE,
          },
        }),
      );
    },
  );

  it.each([Role.CAMPAIGN_MANAGER, Role.COMPLIANCE_OFFICER, Role.AUDITOR])(
    'blocks team exports for non-admin role %s before reading users',
    async (role) => {
      await expect(
        service.generateExport('equipo', { ...currentUser, role }),
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

    await expect(
      service.generateExport('personas', currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.voter.findMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });
});
