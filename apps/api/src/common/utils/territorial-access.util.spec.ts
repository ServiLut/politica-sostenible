import { ForbiddenException } from '@nestjs/common';
import { Role } from '../../../prisma/generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTerritorialAccess } from './territorial-access.util';

describe('resolveTerritorialAccess', () => {
  it('returns tenant-wide access only for an allowed current database role', async () => {
    const divisionFindMany = jest.fn();
    const result = await resolveTerritorialAccess({
      client: {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            role: Role.ADMIN,
            divisionId: null,
          }),
        },
        politicalDivision: { findMany: divisionFindMany },
      } as unknown as PrismaService,
      tenantId: 'tenant-a',
      userId: 'admin-a',
      allowedRoles: [Role.ADMIN, Role.WITNESS],
      territoriallyScopedRoles: [Role.WITNESS],
    });

    expect(result).toEqual({ role: Role.ADMIN, divisionIds: null });
    expect(divisionFindMany).not.toHaveBeenCalled();
  });

  it('includes only the assigned tenant division and its descendants', async () => {
    const userFindFirst = jest.fn().mockResolvedValue({
      role: Role.WITNESS,
      divisionId: 'zone-a',
    });
    const divisionFindMany = jest.fn().mockResolvedValue([
      { id: 'country-a', parentId: null },
      { id: 'zone-a', parentId: 'country-a' },
      { id: 'puesto-a', parentId: 'zone-a' },
      { id: 'puesto-a-child', parentId: 'puesto-a' },
      { id: 'zone-b', parentId: 'country-a' },
      { id: 'puesto-b', parentId: 'zone-b' },
      // Defensive: an invalid cross-reference cannot introduce a node.
      { id: 'orphan', parentId: 'outside-tenant' },
    ]);

    const result = await resolveTerritorialAccess({
      client: {
        user: { findFirst: userFindFirst },
        politicalDivision: { findMany: divisionFindMany },
      } as unknown as PrismaService,
      tenantId: 'tenant-a',
      userId: 'witness-a',
      allowedRoles: [Role.ADMIN, Role.WITNESS],
      territoriallyScopedRoles: [Role.WITNESS],
    });

    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: 'witness-a', tenantId: 'tenant-a', isActive: true },
      select: { role: true, divisionId: true },
    });
    expect(divisionFindMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: { id: true, parentId: true },
    });
    expect(result.divisionIds).toEqual(
      expect.arrayContaining(['zone-a', 'puesto-a', 'puesto-a-child']),
    );
    expect(result.divisionIds).not.toEqual(
      expect.arrayContaining(['zone-b', 'puesto-b', 'orphan']),
    );
  });

  it.each([
    ['missing actor', null],
    ['stale token role', { role: Role.VOLUNTEER, divisionId: 'puesto-a' }],
    ['inactive actor', null],
  ])('denies a %s', async (_case, actor) => {
    await expect(
      resolveTerritorialAccess({
        client: {
          user: { findFirst: jest.fn().mockResolvedValue(actor) },
          politicalDivision: { findMany: jest.fn() },
        } as unknown as PrismaService,
        tenantId: 'tenant-a',
        userId: 'actor-a',
        allowedRoles: [Role.ADMIN, Role.WITNESS],
        territoriallyScopedRoles: [Role.WITNESS],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when a scoped actor has no valid tenant division', async () => {
    const client = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.WITNESS,
          divisionId: 'division-from-another-tenant',
        }),
      },
      politicalDivision: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'zone-a', parentId: null }]),
      },
    } as unknown as PrismaService;

    await expect(
      resolveTerritorialAccess({
        client,
        tenantId: 'tenant-a',
        userId: 'witness-a',
        allowedRoles: [Role.WITNESS],
        territoriallyScopedRoles: [Role.WITNESS],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
