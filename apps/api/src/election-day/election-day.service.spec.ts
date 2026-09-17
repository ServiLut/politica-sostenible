import { ForbiddenException } from '@nestjs/common';
import {
  DivisionType,
  PoliticalOperationMode,
  PoliticalOperationStage,
  TenantType,
  WitnessCaptureContext,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { ElectionDayService } from './election-day.service';

describe('ElectionDayService', () => {
  it('aggregates only accepted reports from the authenticated tenant', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      {
        puestoId: 'puesto-a',
        _sum: { candidateVotes: 40, totalTableVotes: 100 },
        _count: { _all: 2 },
      },
    ]);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'puesto-a',
        name: 'Puesto Central',
        parentId: 'municipio-a',
        parent: {
          name: 'Municipio A',
          parentId: 'departamento-a',
          parent: {
            name: 'Departamento A',
            parentId: null,
            parent: null,
          },
        },
      },
    ]);
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      operationProfile: {
        findUnique: jest.fn().mockResolvedValue({
          stage: PoliticalOperationStage.ELECTION_DAY,
        }),
      },
      witnessReport: { groupBy },
      politicalDivision: { findMany },
    } as unknown as PrismaService;
    const service = new ElectionDayService(prisma);

    await expect(service.getVoteTally('tenant-a')).resolves.toEqual([
      {
        division: 'Departamento A',
        totalVotes: 100,
        ourVotes: 40,
        reportCount: 2,
        percentage: 40,
      },
    ]);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          captureContext: WitnessCaptureContext.REAL,
          status: WitnessReportStatus.ACCEPTED,
        },
      }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          id: { in: ['puesto-a'] },
          isActive: true,
        },
      }),
    );
  });

  it('keeps dashboard coverage scoped to PUESTO divisions in one tenant', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      operationProfile: {
        findUnique: jest.fn().mockResolvedValue({
          stage: PoliticalOperationStage.SIMULATION,
        }),
      },
      politicalDivision: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { expectedTables: 0 },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      witnessReport: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;
    const service = new ElectionDayService(prisma);
    const publicTally = jest.spyOn(service, 'getVoteTally');

    await service.getElectionDayDashboard('tenant-a');

    expect(prisma.politicalDivision.aggregate).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        type: DivisionType.PUESTO,
        isActive: true,
      },
      _sum: { expectedTables: true },
    });
    expect(prisma.witnessReport.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          captureContext: WitnessCaptureContext.REAL,
          status: WitnessReportStatus.ACCEPTED,
        },
      }),
    );
    expect(prisma.witnessReport.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        captureContext: WitnessCaptureContext.REAL,
        status: WitnessReportStatus.ACCEPTED,
      },
      select: { puestoId: true, mesa: true },
      distinct: ['puestoId', 'mesa'],
    });
    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.operationProfile.findUnique).toHaveBeenCalledTimes(1);
    expect(publicTally).not.toHaveBeenCalled();
  });

  it('keeps a place uncovered until every configured table has an accepted report', async () => {
    const place = {
      id: 'puesto-a',
      name: 'Puesto A',
      expectedTables: 2,
    };
    const divisionFindMany = jest
      .fn()
      .mockResolvedValueOnce([place])
      .mockResolvedValueOnce([]);
    const reportFindMany = jest
      .fn()
      .mockResolvedValueOnce([{ puestoId: 'puesto-a', mesa: 1 }])
      .mockResolvedValueOnce([]);
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      operationProfile: {
        findUnique: jest.fn().mockResolvedValue({
          stage: PoliticalOperationStage.ELECTION_DAY,
        }),
      },
      politicalDivision: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { expectedTables: 2 },
        }),
        findMany: divisionFindMany,
      },
      witnessReport: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: reportFindMany,
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
      },
    } as unknown as PrismaService;

    const result = await new ElectionDayService(prisma).getElectionDayDashboard(
      'tenant-a',
    );

    expect(result.totalAccepted).toBe(1);
    expect(result).not.toHaveProperty('totalSubmitted');
    expect(result.reportsByStatus).toEqual({
      PENDING: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      SUPERSEDED: 0,
    });
    expect(result.coverageMap.covered).toEqual([]);
    expect(result.coverageMap.uncovered).toEqual([
      { ...place, acceptedTables: 1 },
    ]);
    expect(reportFindMany).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: 'tenant-a',
        captureContext: WitnessCaptureContext.REAL,
        status: WitnessReportStatus.ACCEPTED,
      },
      select: { puestoId: true, mesa: true },
      distinct: ['puestoId', 'mesa'],
    });
  });

  it.each([
    PoliticalOperationStage.ELECTION_PREPARATION,
    PoliticalOperationStage.SIMULATION,
    PoliticalOperationStage.ELECTION_DAY,
    PoliticalOperationStage.POST_ELECTION,
  ])('allows election endpoints during %s', async (stage) => {
    const alerts = jest.fn().mockResolvedValue([]);
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        }),
      },
      operationProfile: {
        findUnique: jest.fn().mockResolvedValue({ stage }),
      },
      witnessReport: { findMany: alerts },
    } as unknown as PrismaService;
    const service = new ElectionDayService(prisma);

    await expect(service.getAlerts('tenant-a')).resolves.toEqual([]);
    expect(alerts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          captureContext: WitnessCaptureContext.REAL,
          status: {
            in: [WitnessReportStatus.PENDING, WitnessReportStatus.ACCEPTED],
          },
          OR: [{ observations: { not: null } }, { hasWrittenClaim: true }],
        },
      }),
    );
  });

  it.each([
    [
      'tipo PUBLIC_OFFICE',
      {
        tenant: {
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.PUBLIC_OFFICE,
        },
        stage: PoliticalOperationStage.ELECTION_DAY,
      },
    ],
    [
      'tipo PARTY',
      {
        tenant: {
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.PARTY,
        },
        stage: PoliticalOperationStage.ELECTION_DAY,
      },
    ],
    [
      'tipo GSC',
      {
        tenant: {
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.GSC,
        },
        stage: PoliticalOperationStage.ELECTION_DAY,
      },
    ],
    [
      'modo PUBLIC_OFFICE',
      {
        tenant: {
          defaultMode: PoliticalOperationMode.PUBLIC_OFFICE,
          type: TenantType.CANDIDACY,
        },
        stage: PoliticalOperationStage.ELECTION_DAY,
      },
    ],
    [
      'etapa no electoral',
      {
        tenant: {
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        },
        stage: PoliticalOperationStage.CAMPAIGN,
      },
    ],
    [
      'perfil operativo ausente',
      {
        tenant: {
          defaultMode: PoliticalOperationMode.CAMPAIGN,
          type: TenantType.CANDIDACY,
        },
        stage: null,
      },
    ],
  ])(
    'fails closed for %s before reading election data',
    async (_label, state) => {
      const operational = {
        divisionAggregate: jest.fn(),
        divisionFindMany: jest.fn(),
        reportGroupBy: jest.fn(),
        reportFindMany: jest.fn(),
        reportCount: jest.fn(),
      };
      const prisma = {
        tenant: { findUnique: jest.fn().mockResolvedValue(state.tenant) },
        operationProfile: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              state.stage === null ? null : { stage: state.stage },
            ),
        },
        politicalDivision: {
          aggregate: operational.divisionAggregate,
          findMany: operational.divisionFindMany,
        },
        witnessReport: {
          groupBy: operational.reportGroupBy,
          findMany: operational.reportFindMany,
          count: operational.reportCount,
        },
      } as unknown as PrismaService;
      const service = new ElectionDayService(prisma);

      await expect(
        service.getElectionDayDashboard('tenant-a'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getVoteTally('tenant-a')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.getAlerts('tenant-a')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(operational.divisionAggregate).not.toHaveBeenCalled();
      expect(operational.divisionFindMany).not.toHaveBeenCalled();
      expect(operational.reportGroupBy).not.toHaveBeenCalled();
      expect(operational.reportFindMany).not.toHaveBeenCalled();
      expect(operational.reportCount).not.toHaveBeenCalled();
    },
  );
});
