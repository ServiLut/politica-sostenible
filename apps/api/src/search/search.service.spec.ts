import {
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { PrismaService } from '../prisma/prisma.service';
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
  };
}

describe('SearchService', () => {
  it('returns only role-visible resources scoped to the authenticated tenant', async () => {
    const prisma = buildPrisma();
    const service = new SearchService(prisma as unknown as PrismaService);

    await expect(service.globalSearch(actor, '  ana  ')).resolves.toEqual({
      voters: [{ id: 'voter-a', name: 'Ana Pérez' }],
      users: [{ id: 'user-a', name: 'Ana Admin', email: 'ana@example.test' }],
      proposals: [
        { id: 'proposal-a', title: 'Agua segura', referenceCode: 'P-01' },
      ],
      documents: [],
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
    const service = new SearchService(prisma as unknown as PrismaService);

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
  });

  it('does not query campaign resources for a public-office case worker', async () => {
    const prisma = buildPrisma(Role.CASE_WORKER);
    prisma.tenant.findUnique.mockResolvedValue({
      defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
      type: TenantType.PUBLIC_OFFICE,
    });
    const service = new SearchService(prisma as unknown as PrismaService);

    await expect(
      service.globalSearch(
        { ...actor, userId: 'case-worker-a', role: Role.CASE_WORKER },
        'ana',
      ),
    ).resolves.toEqual({ voters: [], users: [], proposals: [], documents: [] });

    expect(prisma.voter.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.politicalProposal.findMany).not.toHaveBeenCalled();
  });

  it('avoids database work for an incomplete search term', async () => {
    const prisma = buildPrisma();
    const service = new SearchService(prisma as unknown as PrismaService);

    await expect(service.globalSearch(actor, 'ab')).resolves.toEqual({
      voters: [],
      users: [],
      proposals: [],
      documents: [],
    });
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
