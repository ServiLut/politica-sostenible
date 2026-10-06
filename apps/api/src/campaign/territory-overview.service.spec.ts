import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DivisionType,
  PoliticalOperationMode,
  Role,
  TenantType,
} from '../../prisma/generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { CampaignController } from './campaign.controller';
import {
  CAMPAIGN_DIVISION_READ_ROLES,
  CampaignService,
} from './campaign.service';
import type { DaneDivipolaClient } from './dane-divipola.client';
import { TerritoryHeatmapMetric } from './dto/territory-heatmap-query.dto';
import { TerritoryOverviewQueryDto } from './dto/territory-overview-query.dto';

type Snapshot = Awaited<ReturnType<CampaignService['getTerritoryHeatmap']>>;
type Item = Snapshot['items'][number];
const actor = { tenantId: 'tenant-a', userId: 'user-a' };
const item = (
  id: string,
  value: number | null,
  extra: Partial<Item> = {},
): Item => ({
  id,
  code: id,
  name: id,
  type: DivisionType.DEPARTAMENTO,
  parentId: null,
  hasChildren: false,
  nextLevel: null,
  value,
  displayValue: value === null ? 'Sin datos' : String(value),
  suppressed: false,
  intensity: 0,
  bucket: 0,
  operationalContext: { expectedTables: 10, acceptedTables: 0 },
  geo: {
    latitude: null,
    longitude: null,
    basis: null,
    locatedPollingPlaces: 0,
    totalPollingPlaces: 0,
  },
  ...extra,
});
const snapshot = (items: Item[]): Snapshot => ({
  generatedAt: '2026-10-06T00:00:00.000Z',
  level: DivisionType.DEPARTAMENTO,
  metric: {
    code: TerritoryHeatmapMetric.OPEN_CASES,
    label: 'Casos territoriales abiertos',
    unit: 'COUNT',
  },
  parent: null,
  breadcrumbs: [],
  privacy: { minimumReportableCount: 3, rule: 'Conteos protegidos' },
  items,
});
const query = (fields: Partial<TerritoryOverviewQueryDto> = {}) =>
  Object.assign(
    new TerritoryOverviewQueryDto(),
    { metric: TerritoryHeatmapMetric.OPEN_CASES },
    fields,
  );
const withSnapshot = (items: Item[]) => {
  const service = new CampaignService(
    {} as PrismaService,
    {} as DaneDivipolaClient,
  );
  const source = snapshot(items);
  const read = jest
    .spyOn(service, 'getTerritoryHeatmap')
    .mockResolvedValue(source);
  return { service, read, source };
};

describe('Campaign territory overview', () => {
  it('paginates more than 500 authorized territories without changing the snapshot contract', async () => {
    const { service, source, read } = withSnapshot(
      Array.from({ length: 501 }, (_, i) =>
        item(`Lugar ${String(i).padStart(3, '0')}`, i + 3),
      ),
    );
    const first = await service.getTerritoryOverview(
      actor,
      query({ limit: 50 }),
    );
    const last = await service.getTerritoryOverview(
      actor,
      query({ limit: 50, page: 11 }),
    );
    expect(first.items).toHaveLength(50);
    expect(first.items[0].value).toBe(503);
    expect(last.items).toHaveLength(1);
    expect(last.items[0].value).toBe(3);
    expect(first.pageInfo).toEqual({
      page: 1,
      limit: 50,
      totalPages: 11,
      totalItems: 501,
    });
    expect(first.summary).toEqual({
      totalTerritories: 501,
      reportedTerritories: 501,
      zeroTerritories: 0,
      protectedTerritories: 0,
      unavailableTerritories: 0,
    });
    expect(source.items[0].value).toBe(3);
    expect(source.items).toHaveLength(501);
    expect(read).toHaveBeenCalledWith(actor, {
      level: 'DEPARTAMENTO',
      metric: 'OPEN_CASES',
      parentId: undefined,
    });
    const legacy = await service.getTerritoryHeatmap(actor, query());
    expect(legacy).not.toHaveProperty('summary');
    expect(legacy.items).toHaveLength(501);
  });

  it('filters before pagination and retains an unfiltered territorial summary without summing hidden people', async () => {
    const { service } = withSnapshot([
      item('x', 50, { name: 'Otra ciudad' }),
      item('m', 8, { name: 'Medellín', code: '05/001' }),
      item('s', null, {
        name: 'Medellín norte',
        suppressed: true,
        displayValue: 'Menos de 3',
      }),
      item('z', 0, { name: 'Medellín sur' }),
      item('n', null, { name: 'Medellín sin denominador' }),
    ]);
    const result = await service.getTerritoryOverview(
      actor,
      query({ search: 'MEDELLIN', limit: 1, page: 2 }),
    );
    expect(result.items.map(({ id }) => id)).toEqual(['s']);
    expect(result.items[0].value).toBeNull();
    expect(result.pageInfo).toEqual({
      page: 2,
      limit: 1,
      totalPages: 2,
      totalItems: 2,
    });
    expect(result.summary).toEqual({
      totalTerritories: 5,
      reportedTerritories: 2,
      zeroTerritories: 1,
      protectedTerritories: 1,
      unavailableTerritories: 1,
    });
    expect(
      (
        await service.getTerritoryOverview(actor, query({ search: '05001' }))
      ).items.map(({ id }) => id),
    ).toEqual(['m']);
  });

  it('keeps protected counts indistinguishable in ordering and resolves ties by name, code and id', async () => {
    const { service } = withSnapshot([
      item('s-b', null, { suppressed: true, name: 'Bello' }),
      item('zero', 0),
      item('s-a', null, { suppressed: true, name: 'Apartadó' }),
      item('b', 12, { name: 'Igual', code: '02' }),
      item('a2', 12, { name: 'Igual', code: '01' }),
      item('a1', 12, { name: 'Igual', code: '01' }),
      item('na', null),
    ]);
    for (const metric of [
      TerritoryHeatmapMetric.OPEN_CASES,
      TerritoryHeatmapMetric.VOTER_ACTIVITY,
    ]) {
      const result = await service.getTerritoryOverview(
        actor,
        query({ metric, activity: 'ALL' }),
      );
      expect(result.items.map(({ id }) => id)).toEqual([
        'a1',
        'a2',
        'b',
        's-a',
        's-b',
        'zero',
        'na',
      ]);
    }
  });

  it('puts legitimate zero E14 coverage first but excludes unavailable denominators in ACTIVE', async () => {
    const { service } = withSnapshot([
      item('complete', 100),
      item('unknown', null, {
        operationalContext: { expectedTables: 0, acceptedTables: 0 },
      }),
      item('partial', 50),
      item('zero', 0),
    ]);
    const active = await service.getTerritoryOverview(
      actor,
      query({ metric: TerritoryHeatmapMetric.E14_COVERAGE }),
    );
    expect(active.items.map(({ id }) => id)).toEqual([
      'zero',
      'partial',
      'complete',
    ]);
    const all = await service.getTerritoryOverview(
      actor,
      query({ metric: TerritoryHeatmapMetric.E14_COVERAGE, activity: 'ALL' }),
    );
    expect(all.items.map(({ id }) => id)).toEqual([
      'zero',
      'partial',
      'complete',
      'unknown',
    ]);
  });

  it('prioritizes missing team coverage only when ALL is requested', async () => {
    const { service } = withSnapshot([
      item('large', 20),
      item('small', 3),
      item('protected', null, { suppressed: true }),
      item('zero', 0),
      item('unknown', null),
    ]);
    const all = await service.getTerritoryOverview(
      actor,
      query({ metric: TerritoryHeatmapMetric.TEAM_COVERAGE, activity: 'ALL' }),
    );
    expect(all.items.map(({ id }) => id)).toEqual([
      'zero',
      'protected',
      'small',
      'large',
      'unknown',
    ]);
    const active = await service.getTerritoryOverview(
      actor,
      query({ metric: TerritoryHeatmapMetric.TEAM_COVERAGE }),
    );
    expect(active.items.map(({ id }) => id)).toEqual([
      'protected',
      'small',
      'large',
    ]);
  });

  it('returns an empty page explicitly when the query is empty or the page is past its result', async () => {
    const { service } = withSnapshot([item('a', 3)]);
    expect(
      await service.getTerritoryOverview(
        actor,
        query({ page: Number.MAX_SAFE_INTEGER }),
      ),
    ).toMatchObject({
      items: [],
      pageInfo: { page: Number.MAX_SAFE_INTEGER, totalPages: 1, totalItems: 1 },
    });
    expect(
      await service.getTerritoryOverview(actor, query({ search: 'not found' })),
    ).toMatchObject({
      items: [],
      pageInfo: { totalPages: 0, totalItems: 0 },
      summary: { totalTerritories: 1 },
    });
  });

  it.each([
    { limit: 51 },
    { limit: 0 },
    { limit: NaN },
    { page: Infinity },
    { page: 0 },
    { page: 1.5 },
    { search: 'x'.repeat(81) },
  ])(
    'rejects invalid direct-service pagination before any snapshot read: %j',
    async (fields) => {
      const { service, read } = withSnapshot([]);
      await expect(
        service.getTerritoryOverview(actor, query(fields)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each([
    new ForbiddenException('Actor fuera de alcance'),
    new NotFoundException('Territorio ajeno'),
  ])('preserves authorization failures from the snapshot', async (failure) => {
    const { service, read } = withSnapshot([]);
    read.mockRejectedValue(failure);
    await expect(
      service.getTerritoryOverview(
        actor,
        query({ parentId: 'foreign', level: DivisionType.MUNICIPIO }),
      ),
    ).rejects.toBe(failure);
  });

  it('keeps the endpoint on the same role policy and forwards the validated DTO and JWT actor', async () => {
    const getTerritoryOverview = jest.fn().mockResolvedValue({ items: [] });
    const controller = new CampaignController({
      getTerritoryOverview,
    } as unknown as CampaignService);
    const dto = query({ page: 3, search: '05001' });
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        CampaignController.prototype.getTerritoryOverview,
      ),
    ).toEqual([...CAMPAIGN_DIVISION_READ_ROLES]);
    expect(
      Reflect.getMetadata(
        'path',
        CampaignController.prototype.getTerritoryOverview,
      ),
    ).toBe('territory-overview');
    await controller.getTerritoryOverview(actor, dto);
    expect(getTerritoryOverview).toHaveBeenCalledWith(actor, dto);
  });
});

describe('Territory overview with the actual scoped heatmap computation', () => {
  const setup = () => {
    const divisions = [
      {
        id: 'dep-a',
        code: '05',
        name: 'Antioquia',
        type: DivisionType.DEPARTAMENTO,
        parentId: null,
        expectedTables: null,
      },
      {
        id: 'mun-a',
        code: '05/001',
        name: 'Medellín',
        type: DivisionType.MUNICIPIO,
        parentId: 'dep-a',
        expectedTables: null,
      },
      {
        id: 'zone-a',
        code: '01',
        name: 'Zona autorizada',
        type: DivisionType.ZONA,
        parentId: 'mun-a',
        expectedTables: null,
      },
      {
        id: 'place-a',
        code: '01',
        name: 'Puesto autorizado',
        type: DivisionType.PUESTO,
        parentId: 'zone-a',
        expectedTables: 5,
      },
      {
        id: 'dep-b',
        code: '08',
        name: 'Otro alcance',
        type: DivisionType.DEPARTAMENTO,
        parentId: null,
        expectedTables: null,
      },
    ];
    const tx = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          type: TenantType.CANDIDACY,
          defaultMode: PoliticalOperationMode.CAMPAIGN,
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: Role.ZONE_COORDINATOR,
          divisionId: 'zone-a',
        }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      politicalDivision: { findMany: jest.fn().mockResolvedValue(divisions) },
      issueCase: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ divisionId: 'place-a', _count: { _all: 2 } }]),
      },
      voter: { groupBy: jest.fn().mockResolvedValue([]) },
      witnessReport: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CampaignService(
      {
        $transaction: jest.fn(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      } as unknown as PrismaService,
      {} as DaneDivipolaClient,
    );
    return { service, tx };
  };

  it('counts only the assigned branch and never exposes small raw counts through summary or sorting', async () => {
    const { service, tx } = setup();
    const result = await service.getTerritoryOverview(actor, query());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'dep-a',
      value: null,
      suppressed: true,
      displayValue: 'Menos de 3',
    });
    expect(result.summary).toEqual({
      totalTerritories: 1,
      reportedTerritories: 0,
      zeroTerritories: 0,
      protectedTerritories: 1,
      unavailableTerritories: 0,
    });
    expect(JSON.stringify(result)).not.toContain('dep-b');
    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: actor.userId, tenantId: actor.tenantId, isActive: true },
      }),
    );
    for (const [params] of tx.politicalDivision.findMany.mock.calls)
      expect(params).toMatchObject({
        where: { tenantId: actor.tenantId, isActive: true },
      });
    expect(tx.issueCase.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          divisionId: { in: ['zone-a', 'place-a'] },
        }),
      }),
    );
  });

  it('rejects a foreign/out-of-scope parent before operational aggregation', async () => {
    const { service, tx } = setup();
    await expect(
      service.getTerritoryOverview(
        actor,
        query({ level: DivisionType.MUNICIPIO, parentId: 'dep-b' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.issueCase.groupBy).not.toHaveBeenCalled();
  });

  it('rejects a stale JWT identity whose current DB role no longer authorizes the module', async () => {
    const { service, tx } = setup();
    tx.user.findFirst.mockResolvedValue({
      role: Role.FINANCE_MANAGER,
      divisionId: null,
    });
    await expect(
      service.getTerritoryOverview(actor, query()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.politicalDivision.findMany).not.toHaveBeenCalled();
  });
});
