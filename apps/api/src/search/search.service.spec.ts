import {
  PoliticalOperationMode,
  PqrsdDossierStatus,
  PqrsdRiskLevel,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { PrismaService } from '../prisma/prisma.service';
import type { TasksService } from '../tasks/tasks.service';
import type { CommitmentsService } from '../commitments/commitments.service';
import type { CasesService } from '../cases/cases.service';
import { SearchService } from './search.service';

const actor: AuthenticatedUser = {
  userId: 'admin-a',
  tenantId: 'tenant-a',
  role: Role.ADMIN,
};

function buildPrisma(role: Role = Role.ADMIN) {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultMode: PoliticalOperationMode.CAMPAIGN,
        type: TenantType.CANDIDACY,
      }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({ role, divisionId: null }),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'user-a', name: 'Ana Admin', email: 'ana@example.test' },
        ]),
    },
    politicalDivision: { findMany: jest.fn().mockResolvedValue([]) },
    voter: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'voter-a', firstName: 'Ana', lastName: 'Pérez' },
        ]),
    },
    politicalProposal: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'proposal-a', title: 'Agua segura', referenceCode: 'P-01' },
        ]),
    },
    pqrsdDossier: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'pqrsd-a',
          reference: 'PQRSD-INT-001',
          subject: 'Solicitud de alumbrado público',
          status: PqrsdDossierStatus.IN_PROGRESS,
          riskLevel: PqrsdRiskLevel.HIGH,
          currentPrimaryAssignee: {
            id: 'worker-a',
            name: 'Gestora responsable',
            isActive: true,
          },
          currentBackupAssignee: null,
          deadlines: [{ dueAt: new Date('2026-09-15T04:59:00.000Z') }],
        },
      ]),
    },
  };
}

function buildOperationalServices() {
  return {
    tasks: {
      findAll: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'task-a',
            title: 'Llamar a Ana',
            status: 'TODO',
            priority: 'HIGH',
          },
        ],
      }),
    },
    commitments: {
      findAll: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'commitment-a',
            title: 'Agua para el barrio',
            reference: 'CMP-01',
            status: 'PROPOSED',
          },
        ],
      }),
    },
    cases: {
      findAll: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'case-a',
            title: 'Incidente de puesto',
            reference: 'INC-CAM-01',
            status: 'OPEN',
          },
        ],
      }),
    },
  };
}

function buildService(prisma: ReturnType<typeof buildPrisma>) {
  const operations = buildOperationalServices();
  return {
    service: new SearchService(
      prisma as unknown as PrismaService,
      operations.tasks as unknown as TasksService,
      operations.commitments as unknown as CommitmentsService,
      operations.cases as unknown as CasesService,
    ),
    operations,
  };
}

describe('SearchService', () => {
  it('returns only role-visible resources scoped to the authenticated tenant', async () => {
    const prisma = buildPrisma();
    const { service, operations } = buildService(prisma);

    await expect(service.globalSearch(actor, '  ana  ')).resolves.toEqual({
      voters: [{ id: 'voter-a', name: 'Ana Pérez' }],
      users: [{ id: 'user-a', name: 'Ana Admin', email: 'ana@example.test' }],
      proposals: [
        { id: 'proposal-a', title: 'Agua segura', referenceCode: 'P-01' },
      ],
      tasks: [
        {
          id: 'task-a',
          title: 'Llamar a Ana',
          status: 'TODO',
          priority: 'HIGH',
        },
      ],
      commitments: [
        {
          id: 'commitment-a',
          title: 'Agua para el barrio',
          reference: 'CMP-01',
          status: 'PROPOSED',
        },
      ],
      cases: [],
      incidents: [
        {
          id: 'case-a',
          title: 'Incidente de puesto',
          reference: 'INC-CAM-01',
          status: 'OPEN',
        },
      ],
      pqrsd: [],
    });

    expect(prisma.voter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
        select: { id: true, firstName: true, lastName: true },
      }),
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          isActive: true,
        }),
      }),
    );
    expect(prisma.politicalProposal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
      }),
    );
    expect(prisma.pqrsdDossier.findMany).not.toHaveBeenCalled();
    expect(operations.tasks.findAll).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ search: 'ana', limit: 5 }),
    );
    expect(operations.commitments.findAll).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ search: 'ana', limit: 5 }),
    );
    expect(operations.cases.findAll).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ search: 'ana', limit: 5 }),
    );
  });

  it('limits a zone coordinator search to the assigned territorial subtree', async () => {
    const prisma = buildPrisma(Role.ZONE_COORDINATOR);
    prisma.user.findFirst.mockResolvedValue({
      role: Role.ZONE_COORDINATOR,
      divisionId: 'zone-a',
    });
    prisma.politicalDivision.findMany.mockResolvedValue([
      { id: 'zone-a', parentId: null },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'other-zone', parentId: null },
    ]);
    const { service, operations } = buildService(prisma);

    await service.globalSearch(
      { ...actor, userId: 'coordinator-a', role: Role.ZONE_COORDINATOR },
      'ana',
    );

    expect(prisma.voter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          puestoId: { in: expect.arrayContaining(['zone-a', 'puesto-a']) },
        }),
      }),
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.politicalProposal.findMany).not.toHaveBeenCalled();
    expect(operations.tasks.findAll).toHaveBeenCalled();
    expect(operations.commitments.findAll).toHaveBeenCalled();
    expect(operations.cases.findAll).not.toHaveBeenCalled();
  });

  it('does not query campaign resources for a public-office case worker', async () => {
    const prisma = buildPrisma(Role.CASE_WORKER);
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    const { service, operations } = buildService(prisma);

    await expect(
      service.globalSearch(
        { ...actor, userId: 'case-worker-a', role: Role.CASE_WORKER },
        'ana',
      ),
    ).resolves.toEqual({
      voters: [],
      users: [],
      proposals: [],
      tasks: [
        {
          id: 'task-a',
          title: 'Llamar a Ana',
          status: 'TODO',
          priority: 'HIGH',
        },
      ],
      commitments: [
        {
          id: 'commitment-a',
          title: 'Agua para el barrio',
          reference: 'CMP-01',
          status: 'PROPOSED',
        },
      ],
      cases: [
        {
          id: 'case-a',
          title: 'Incidente de puesto',
          reference: 'INC-CAM-01',
          status: 'OPEN',
        },
      ],
      incidents: [],
      pqrsd: [
        {
          id: 'pqrsd-a',
          reference: 'PQRSD-INT-001',
          subject: 'Solicitud de alumbrado público',
          status: PqrsdDossierStatus.IN_PROGRESS,
          riskLevel: PqrsdRiskLevel.HIGH,
          dueAt: '2026-09-15T04:59:00.000Z',
          responsible: { id: 'worker-a', name: 'Gestora responsable' },
        },
      ],
    });

    expect(prisma.voter.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.politicalProposal.findMany).not.toHaveBeenCalled();
    expect(operations.cases.findAll).toHaveBeenCalled();
    expect(prisma.pqrsdDossier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          OR: [
            {
              reference: { contains: 'ana', mode: 'insensitive' },
            },
            { subject: { contains: 'ana', mode: 'insensitive' } },
          ],
        },
        select: expect.not.objectContaining({
          description: expect.anything(),
          petitioner: expect.anything(),
        }),
      }),
    );
    const pqrsdQuery = prisma.pqrsdDossier.findMany.mock.calls[0][0] as {
      select: Record<string, unknown> & {
        deadlines: unknown;
      };
    };
    const pqrsdSelect = pqrsdQuery.select;
    expect(Object.keys(pqrsdSelect).sort()).toEqual(
      [
        'currentBackupAssignee',
        'currentPrimaryAssignee',
        'deadlines',
        'id',
        'reference',
        'riskLevel',
        'status',
        'subject',
      ].sort(),
    );
    expect(pqrsdSelect.deadlines).toEqual({
      orderBy: { versionNumber: 'desc' },
      take: 1,
      select: { dueAt: true },
    });
  });

  it('avoids database work for an incomplete search term', async () => {
    const prisma = buildPrisma();
    const { service, operations } = buildService(prisma);

    await expect(service.globalSearch(actor, 'ab')).resolves.toEqual({
      voters: [],
      users: [],
      proposals: [],
      tasks: [],
      commitments: [],
      cases: [],
      incidents: [],
      pqrsd: [],
    });
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(operations.tasks.findAll).not.toHaveBeenCalled();
    expect(operations.commitments.findAll).not.toHaveBeenCalled();
    expect(operations.cases.findAll).not.toHaveBeenCalled();
  });

  it('uses the persisted role and keeps formal PQRSD hidden from communications', async () => {
    const prisma = buildPrisma(Role.COMMUNICATIONS_MANAGER);
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    const { service } = buildService(prisma);

    const result = await service.globalSearch(
      { ...actor, role: Role.ADMIN },
      'alumbrado',
    );

    expect(prisma.pqrsdDossier.findMany).not.toHaveBeenCalled();
    expect(result.pqrsd).toEqual([]);
  });
});
