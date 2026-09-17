import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DivisionType,
  PoliticalOperationStage,
  WitnessCaptureContext,
  WitnessReportStatus,
} from '../../prisma/generated/prisma';
import {
  assertCandidacyCampaignTenant,
  CAMPAIGN_TENANT_SELECT,
} from '../common/utils/campaign-mode.util';

interface DivisionAncestor {
  name: string;
  parentId: string | null;
  parent?: DivisionAncestor | null;
}

const ELECTION_DAY_STAGES: readonly PoliticalOperationStage[] = [
  PoliticalOperationStage.ELECTION_PREPARATION,
  PoliticalOperationStage.SIMULATION,
  PoliticalOperationStage.ELECTION_DAY,
  PoliticalOperationStage.POST_ELECTION,
];

@Injectable()
export class ElectionDayService {
  constructor(private readonly prisma: PrismaService) {}

  async getElectionDayDashboard(tenantId: string) {
    await this.assertElectionDayDomain(tenantId);

    const [
      expectedTablesResult,
      statusGroups,
      puestos,
      acceptedTables,
      totalAcceptedCount,
      alertCount,
      lastReports,
      tally,
    ] = await Promise.all([
      this.prisma.politicalDivision.aggregate({
        where: { tenantId, type: DivisionType.PUESTO, isActive: true },
        _sum: { expectedTables: true },
      }),
      this.prisma.witnessReport.groupBy({
        by: ['status'],
        where: { tenantId, captureContext: WitnessCaptureContext.REAL },
        _count: { _all: true },
      }),
      this.prisma.politicalDivision.findMany({
        where: { tenantId, type: DivisionType.PUESTO, isActive: true },
        select: { id: true, name: true, expectedTables: true },
      }),
      this.prisma.witnessReport.findMany({
        where: {
          tenantId,
          captureContext: WitnessCaptureContext.REAL,
          status: WitnessReportStatus.ACCEPTED,
        },
        select: { puestoId: true, mesa: true },
        distinct: ['puestoId', 'mesa'],
      }),
      this.prisma.witnessReport.count({
        where: {
          tenantId,
          captureContext: WitnessCaptureContext.REAL,
          status: WitnessReportStatus.ACCEPTED,
        },
      }),
      this.prisma.witnessReport.count({
        where: this.activeAlertWhere(tenantId),
      }),
      this.prisma.witnessReport.findMany({
        where: { tenantId, captureContext: WitnessCaptureContext.REAL },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          puesto: { select: { name: true } },
          witness: { select: { name: true } },
        },
      }),
      this.getVoteTallyForAuthorizedTenant(tenantId),
    ]);

    const expectedTables = expectedTablesResult._sum.expectedTables || 0;
    const reportsByStatus = {
      PENDING: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      SUPERSEDED: 0,
    };

    for (const group of statusGroups) {
      if (group.status === WitnessReportStatus.PENDING)
        reportsByStatus.PENDING = group._count._all;
      if (group.status === WitnessReportStatus.ACCEPTED)
        reportsByStatus.ACCEPTED = group._count._all;
      if (group.status === WitnessReportStatus.REJECTED)
        reportsByStatus.REJECTED = group._count._all;
      if (group.status === WitnessReportStatus.SUPERSEDED)
        reportsByStatus.SUPERSEDED = group._count._all;
    }

    const acceptedTablesByPlace = new Map<string, number>();
    for (const table of acceptedTables) {
      acceptedTablesByPlace.set(
        table.puestoId,
        (acceptedTablesByPlace.get(table.puestoId) ?? 0) + 1,
      );
    }
    const placesWithCoverage = puestos.map((puesto) => ({
      ...puesto,
      acceptedTables: acceptedTablesByPlace.get(puesto.id) ?? 0,
    }));
    const coverageMap = {
      covered: placesWithCoverage.filter(
        (place) =>
          place.expectedTables !== null &&
          place.expectedTables > 0 &&
          place.acceptedTables >= place.expectedTables,
      ),
      uncovered: placesWithCoverage.filter(
        (place) =>
          place.expectedTables === null ||
          place.expectedTables <= 0 ||
          place.acceptedTables < place.expectedTables,
      ),
    };

    return {
      totalExpected: expectedTables,
      totalAccepted: totalAcceptedCount,
      reportsByStatus,
      coverageMap,
      alertCount,
      lastReports,
      voteTallies: tally,
    };
  }

  async getVoteTally(tenantId: string) {
    await this.assertElectionDayDomain(tenantId);
    return this.getVoteTallyForAuthorizedTenant(tenantId);
  }

  async getAlerts(tenantId: string) {
    await this.assertElectionDayDomain(tenantId);
    return this.prisma.witnessReport.findMany({
      where: this.activeAlertWhere(tenantId),
      orderBy: { createdAt: 'desc' },
      include: {
        puesto: { select: { name: true } },
        witness: { select: { name: true } },
      },
    });
  }

  private async getVoteTallyForAuthorizedTenant(tenantId: string) {
    const reportAggregations = await this.prisma.witnessReport.groupBy({
      by: ['puestoId'],
      where: {
        tenantId,
        captureContext: WitnessCaptureContext.REAL,
        status: WitnessReportStatus.ACCEPTED,
      },
      _sum: {
        candidateVotes: true,
        totalTableVotes: true,
      },
      _count: {
        _all: true,
      },
    });

    const puestos = await this.prisma.politicalDivision.findMany({
      where: {
        tenantId,
        id: { in: reportAggregations.map((r) => r.puestoId) },
        isActive: true,
      },
      include: {
        parent: {
          include: {
            parent: {
              include: {
                parent: true,
              },
            },
          },
        },
      },
    });

    const puestoMap = new Map(puestos.map((p) => [p.id, p]));
    const tallyByDivision = new Map<
      string,
      {
        division: string;
        totalVotes: number;
        ourVotes: number;
        reportCount: number;
      }
    >();

    for (const agg of reportAggregations) {
      const puesto = puestoMap.get(agg.puestoId);
      if (!puesto) continue;

      let current: DivisionAncestor = puesto;
      while (current && current.parentId && current.parent) {
        current = current.parent;
      }

      const divisionName = current.name;
      if (!tallyByDivision.has(divisionName)) {
        tallyByDivision.set(divisionName, {
          division: divisionName,
          totalVotes: 0,
          ourVotes: 0,
          reportCount: 0,
        });
      }

      const tally = tallyByDivision.get(divisionName)!;
      tally.totalVotes += agg._sum.totalTableVotes || 0;
      tally.ourVotes += agg._sum.candidateVotes || 0;
      tally.reportCount += agg._count._all;
    }

    return Array.from(tallyByDivision.values()).map((t) => ({
      ...t,
      percentage: t.totalVotes > 0 ? (t.ourVotes / t.totalVotes) * 100 : 0,
    }));
  }

  private async assertElectionDayDomain(tenantId: string): Promise<void> {
    const [tenant, profile] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: CAMPAIGN_TENANT_SELECT,
      }),
      this.prisma.operationProfile.findUnique({
        where: { tenantId },
        select: { stage: true },
      }),
    ]);

    assertCandidacyCampaignTenant(tenant);
    if (!profile || !ELECTION_DAY_STAGES.includes(profile.stage)) {
      throw new ForbiddenException(
        'La operación electoral no está habilitada en la etapa actual.',
      );
    }
  }

  private activeAlertWhere(tenantId: string) {
    return {
      tenantId,
      captureContext: WitnessCaptureContext.REAL,
      status: {
        in: [WitnessReportStatus.PENDING, WitnessReportStatus.ACCEPTED],
      },
      OR: [{ observations: { not: null } }, { hasWrittenClaim: true }],
    };
  }
}
