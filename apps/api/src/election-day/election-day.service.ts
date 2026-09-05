import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DivisionType, WitnessReportStatus } from '../../prisma/generated/prisma';

@Injectable()
export class ElectionDayService {
  constructor(private readonly prisma: PrismaService) {}

  async getElectionDayDashboard(tenantId: string) {
    const [
      expectedTablesResult,
      statusGroups,
      puestos,
      distinctPuestos,
      totalSubmittedCount,
      alertCount,
      lastReports
    ] = await Promise.all([
      this.prisma.politicalDivision.aggregate({
        where: { tenantId, type: DivisionType.PUESTO },
        _sum: { expectedTables: true }
      }),
      this.prisma.witnessReport.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true }
      }),
      this.prisma.politicalDivision.findMany({
        where: { tenantId, type: DivisionType.PUESTO },
        select: { id: true, name: true, expectedTables: true }
      }),
      this.prisma.witnessReport.findMany({
        where: { tenantId },
        select: { puestoId: true },
        distinct: ['puestoId']
      }),
      this.prisma.witnessReport.count({
        where: { tenantId }
      }),
      this.prisma.witnessReport.count({
        where: { tenantId, observations: { not: null } }
      }),
      this.prisma.witnessReport.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          puesto: { select: { name: true } },
          witness: { select: { name: true } }
        }
      })
    ]);

    const expectedTables = expectedTablesResult._sum.expectedTables || 0;
    const totalSubmitted = totalSubmittedCount;

    const reportsByStatus = {
      PENDING: 0,
      VERIFIED: 0, // ACCEPTED
      REJECTED: 0,
    };

    for (const group of statusGroups) {
      if (group.status === WitnessReportStatus.PENDING) reportsByStatus.PENDING = group._count._all;
      if (group.status === WitnessReportStatus.ACCEPTED) reportsByStatus.VERIFIED = group._count._all;
      if (group.status === WitnessReportStatus.REJECTED) reportsByStatus.REJECTED = group._count._all;
    }

    const puestosWithReports = new Set(distinctPuestos.map(r => r.puestoId));
    const coverageMap = {
      covered: puestos.filter(p => puestosWithReports.has(p.id)),
      uncovered: puestos.filter(p => !puestosWithReports.has(p.id))
    };

    // Calculate vote tallies by division (Wait, dashboard requirement says: "Vote tallies by division (sum from verified witness reports)")
    // Wait, the dashboard also needs vote tallies? "Vote tallies by division (sum from verified witness reports)".
    // Maybe we just call getVoteTally here? Or inline it.
    const tally = await this.getVoteTally(tenantId);

    return {
      totalExpected: expectedTables,
      totalSubmitted,
      reportsByStatus,
      coverageMap,
      alertCount,
      lastReports,
      voteTallies: tally,
    };
  }

  async getVoteTally(tenantId: string) {
    const reportAggregations = await this.prisma.witnessReport.groupBy({
      by: ['puestoId'],
      where: { tenantId, status: WitnessReportStatus.ACCEPTED },
      _sum: {
        candidateVotes: true,
        totalTableVotes: true,
      },
      _count: {
        _all: true
      }
    });

    const puestos = await this.prisma.politicalDivision.findMany({
      where: {
        tenantId,
        id: { in: reportAggregations.map(r => r.puestoId) }
      },
      include: {
        parent: {
          include: {
            parent: {
              include: {
                parent: true
              }
            }
          }
        }
      }
    });

    const puestoMap = new Map(puestos.map(p => [p.id, p]));
    const tallyByDivision = new Map<string, { division: string, totalVotes: number, ourVotes: number, reportCount: number }>();

    for (const agg of reportAggregations) {
      const puesto = puestoMap.get(agg.puestoId);
      if (!puesto) continue;

      let topLevel = puesto;
      let current: any = puesto;
      while (current && current.parentId && current.parent) {
        current = current.parent;
      }
      topLevel = current || puesto;

      const divisionName = topLevel.name;
      if (!tallyByDivision.has(divisionName)) {
        tallyByDivision.set(divisionName, { division: divisionName, totalVotes: 0, ourVotes: 0, reportCount: 0 });
      }

      const tally = tallyByDivision.get(divisionName)!;
      tally.totalVotes += agg._sum.totalTableVotes || 0;
      tally.ourVotes += agg._sum.candidateVotes || 0;
      tally.reportCount += agg._count._all;
    }

    return Array.from(tallyByDivision.values()).map(t => ({
      ...t,
      percentage: t.totalVotes > 0 ? (t.ourVotes / t.totalVotes) * 100 : 0
    }));
  }

  async getAlerts(tenantId: string) {
    return this.prisma.witnessReport.findMany({
      where: {
        tenantId,
        observations: { not: null }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        puesto: { select: { name: true } },
        witness: { select: { name: true } }
      }
    });
  }
}
