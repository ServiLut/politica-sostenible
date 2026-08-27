import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditOutcome,
  PoliticalOperationMode,
  Role,
} from '../../prisma/generated/prisma';
import { AuditEventsController } from './audit-events.controller';
import { AuditEventsService } from './audit-events.service';

describe('AuditEventsService privacy and isolation', () => {
  const currentUser: AuthenticatedUser = {
    userId: 'auditor-a',
    tenantId: 'tenant-a',
    role: Role.AUDITOR,
  };

  let prisma: {
    tenant: { findUnique: jest.Mock };
    auditEvent: { findMany: jest.Mock; count: jest.Mock };
  };
  let service: AuditEventsService;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        }),
      },
      auditEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new AuditEventsService(prisma as unknown as PrismaService);
  });

  it('scopes every paginated read to the JWT tenant and server-side mode', async () => {
    await service.findAll(currentUser, {
      page: 2,
      limit: 10,
      action: 'CASE_',
      resourceType: 'IssueCase',
      outcome: AuditOutcome.SUCCESS,
      occurredFrom: '2026-08-01T00:00:00.000Z',
      occurredTo: '2026-08-31T23:59:59.999Z',
    });

    const expectedWhere = {
      tenantId: 'tenant-a',
      mode: PoliticalOperationMode.CAMPAIGN,
      action: { contains: 'CASE_', mode: 'insensitive' },
      resourceType: { contains: 'IssueCase', mode: 'insensitive' },
      outcome: AuditOutcome.SUCCESS,
      occurredAt: {
        gte: new Date('2026-08-01T00:00:00.000Z'),
        lte: new Date('2026-08-31T23:59:59.999Z'),
      },
    };
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-a' },
      select: { defaultMode: true },
    });
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.auditEvent.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
  });

  it('uses PUBLIC_OFFICE when that is the tenant active mode', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
    });

    await service.findAll(currentUser, { page: 1, limit: 20 });

    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          mode: PoliticalOperationMode.PUBLIC_OFFICE,
        },
      }),
    );
  });

  it('returns only the documented public view and renames actorUser', async () => {
    prisma.auditEvent.findMany.mockResolvedValue([
      {
        id: 'audit-a',
        action: 'CASE_UPDATED',
        resourceType: 'IssueCase',
        resourceId: 'case-a',
        outcome: AuditOutcome.SUCCESS,
        occurredAt: new Date('2026-08-21T15:30:00.000Z'),
        actorUser: {
          id: 'actor-a',
          name: 'Control interno',
          role: Role.COMPLIANCE_OFFICER,
          email: 'private@example.test',
        },
        before: { confidential: 'old secret' },
        after: { confidential: 'new secret' },
        metadata: { token: 'secret' },
        sourceIpHash: 'private-hash',
        userAgent: 'private-user-agent',
        requestId: 'private-request-id',
      },
    ]);
    prisma.auditEvent.count.mockResolvedValue(1);

    const result = await service.findAll(currentUser, {
      page: 1,
      limit: 20,
    });

    expect(result.items).toEqual([
      {
        id: 'audit-a',
        action: 'CASE_UPDATED',
        resourceType: 'IssueCase',
        resourceId: 'case-a',
        outcome: AuditOutcome.SUCCESS,
        occurredAt: new Date('2026-08-21T15:30:00.000Z'),
        actor: {
          id: 'actor-a',
          name: 'Control interno',
          role: Role.COMPLIANCE_OFFICER,
        },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('old secret');
    expect(JSON.stringify(result)).not.toContain('private-hash');
    expect(JSON.stringify(result)).not.toContain('private-request-id');
  });

  it.each([Role.ADMIN, Role.COMPLIANCE_OFFICER, Role.AUDITOR])(
    'allows the exact read role %s',
    async (role) => {
      await expect(
        service.findAll({ ...currentUser, role }, { page: 1, limit: 20 }),
      ).resolves.toMatchObject({ items: [] });
    },
  );

  it.each([
    Role.CAMPAIGN_MANAGER,
    Role.CONSTITUENT_SERVICES_MANAGER,
    Role.CASE_WORKER,
    Role.FINANCE_MANAGER,
    Role.VOLUNTEER,
  ])('rejects the non-audit role %s before accessing data', async (role) => {
    await expect(
      service.findAll({ ...currentUser, role }, { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it('rejects an inverted date interval before reading audit events', async () => {
    await expect(
      service.findAll(currentUser, {
        page: 1,
        limit: 20,
        occurredFrom: '2026-08-22T00:00:00.000Z',
        occurredTo: '2026-08-21T23:59:59.999Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it('declares only ADMIN, COMPLIANCE_OFFICER and AUDITOR in controller RBAC', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AuditEventsController)).toEqual([
      Role.ADMIN,
      Role.COMPLIANCE_OFFICER,
      Role.AUDITOR,
    ]);
  });
});
