import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '../../prisma/generated/prisma';
import { CampaignService } from './campaign.service';

describe('Territory leader authorization', () => {
  const user = { userId: 'actor-a', tenantId: 'tenant-a', role: Role.ADMIN };
  function setup() {
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ type: 'CANDIDACY', defaultMode: 'CAMPAIGN' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.ZONE_COORDINATOR,
          divisionId: 'zone-a',
        }),
      },
      politicalDivision: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'zone-a', parentId: null },
          { id: 'place-a', parentId: 'zone-a' },
          { id: 'zone-b', parentId: null },
        ]),
        findFirst: jest.fn().mockResolvedValue({ id: 'place-a' }),
      },
      territoryLeader: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'leader-a' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'leader-a' }),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
      $transaction: jest.fn(),
    };
    client.$transaction.mockImplementation(
      (callback: (tx: typeof client) => unknown) => callback(client),
    );
    return {
      client,
      service: new CampaignService(client as never, {} as never),
    };
  }

  it('rejects reading leaders outside the current coordinator territory despite an old ADMIN token', async () => {
    const { client, service } = setup();
    await expect(
      service.listTerritoryLeaders(user, 'zone-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.territoryLeader.findMany).not.toHaveBeenCalled();
  });

  it('allows a scoped descendant and retains the JWT tenant filter', async () => {
    const { client, service } = setup();
    await service.listTerritoryLeaders(user, 'place-a');
    expect(client.territoryLeader.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', divisionId: 'place-a' },
      orderBy: { name: 'asc' },
    });
  });

  it('enforces current write role before creation', async () => {
    const { client, service } = setup();
    client.user.findFirst.mockResolvedValue({
      role: Role.VOLUNTEER,
      divisionId: 'zone-a',
    });
    await expect(
      service.createTerritoryLeader(user, 'place-a', {
        name: 'Persona',
        roleDescription: 'Enlace',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.territoryLeader.create).not.toHaveBeenCalled();
  });

  it('binds updates to tenant, route division, and leader in one lifecycle transaction', async () => {
    const { client, service } = setup();
    await service.updateTerritoryLeader(user, 'place-a', 'leader-a', {
      phone: '3000000000',
    });
    expect(client.territoryLeader.updateMany).toHaveBeenCalledWith({
      where: { id: 'leader-a', tenantId: 'tenant-a', divisionId: 'place-a' },
      data: { phone: '3000000000' },
    });
    expect(client.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      client.territoryLeader.updateMany.mock.invocationCallOrder[0],
    );
    expect(JSON.stringify(client.auditEvent.create.mock.calls)).not.toContain(
      '3000000000',
    );
  });

  it('does not delete a leader through another division path', async () => {
    const { client, service } = setup();
    client.territoryLeader.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      service.deleteTerritoryLeader(user, 'place-a', 'leader-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.territoryLeader.deleteMany).toHaveBeenCalledWith({
      where: { id: 'leader-b', tenantId: 'tenant-a', divisionId: 'place-a' },
    });
    expect(client.auditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks mutation after closure before touching leader data', async () => {
    const { client, service } = setup();
    client.$queryRaw.mockResolvedValue([{ stage: 'CLOSED' }]);
    await expect(
      service.deleteTerritoryLeader(user, 'place-a', 'leader-a'),
    ).rejects.toMatchObject({ response: { code: 'OPERATION_CLOSED' } });
    expect(client.territoryLeader.deleteMany).not.toHaveBeenCalled();
  });
});
