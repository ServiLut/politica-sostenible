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
      reports,
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
        select: { puestoId: true, candidateVotes: true, totalTableVotes: true, status: true }
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
    const totalSubmitted = reports.length;

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

    const puestosWithReports = new Set(reports.map(r => r.puestoId));
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
    const acceptedReports = await this.prisma.witnessReport.findMany({
      where: { tenantId, status: WitnessReportStatus.ACCEPTED },
      include: {
        puesto: {
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
        }
      }
    });

    const tallyByDivision = new Map<string, { division: string, totalVotes: number, ourVotes: number, reportCount: number }>();

    for (const report of acceptedReports) {
      // Find top-level division
      let topLevel = report.puesto;
      let current: any = report.puesto;
      while (current && current.parentId && current.parent) {
        current = current.parent;
      }
      topLevel = current || report.puesto;

      const divisionName = topLevel.name;
      if (!tallyByDivision.has(divisionName)) {
        tallyByDivision.set(divisionName, { division: divisionName, totalVotes: 0, ourVotes: 0, reportCount: 0 });
      }

      const tally = tallyByDivision.get(divisionName)!;
      tally.totalVotes += report.totalTableVotes;
      tally.ourVotes += report.candidateVotes;
      tally.reportCount += 1;
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
