import { prisma } from '@/lib/prisma';



// Interface for the structured response
export interface PostElectionReport {
  summary: {
    totalVotes: number;
    conversionRate: number;
    allStarCount: number;
  };
  politicalPerformance: Array<{
    territoryName: string;
    readyToVote: number;
    actualVotes: number;
    conversionRate: number;
  }>;
  organizationalDiscipline: Array<{
    leaderName: string;
    role: string;
    taskCompliance: number;
    gpsIntegrity: number; // 100 - override_rate
    e14Coverage: number;
    score: number;
    isAllStar: boolean;
  }>;
  techAudit: {
    messageRouter: Array<{
      channel: string;
      total: number;
      successRate: number;
    }>;
    humanBridge: {
      syncsAttempted: number;
      syncsSuccessful: number;
      successRate: number;
    };
  };
}

export class ReportEngine {

  /**
   * GENERATES THE FULL POST-ELECTION REPORT (V4.2)
   * Cross-references Political, Organizational, and Tech data.
   */
  async generatePostElectionReport(electionId: string): Promise<PostElectionReport> {
    
    // -------------------------------------------------------------------------
    // 1. POLITICAL PERFORMANCE (Conversion: Listos vs Votos)
    // -------------------------------------------------------------------------
    const politicalQuery = `
      SELECT 
        t.name as "territoryName",
        COUNT(ec.id) as "readyToVote",
        COUNT(vs.id) as "actualVotes",
        CASE 
          WHEN COUNT(ec.id) = 0 THEN 0 
          ELSE (COUNT(vs.id)::float / COUNT(ec.id)::float) * 100 
        END as "conversionRate"
      FROM territories t
      LEFT JOIN electoral_contacts ec ON ec."territoryId" = t.id AND ec."electionId" = '${electionId}'
      LEFT JOIN voted_statuses vs ON vs."electoralContactId" = ec.id AND vs."hasVoted" = true
      GROUP BY t.name
      ORDER BY "conversionRate" DESC;
    `;

    // -------------------------------------------------------------------------
    // 2. ORGANIZATIONAL DISCIPLINE (Ranking de Líderes)
    // -------------------------------------------------------------------------
    const disciplineQuery = `
      WITH TaskMetrics AS (
        SELECT 
          "assignedToId",
          COUNT(*) as total,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
        FROM tasks
        GROUP BY "assignedToId"
      ),
      GPSMetrics AS (
        SELECT 
          c."leaderId",
          COUNT(*) as total,
          SUM(CASE WHEN a."isOverride" = true THEN 1 ELSE 0 END) as overrides
        FROM attendances a
        JOIN political_contacts c ON a."contactId" = c.id
        GROUP BY c."leaderId"
      ),
      E14Metrics AS (
        -- Links Leader -> Territory -> Tables -> E14
        -- Assumes Leader is responsible for a Territory
        SELECT 
          t."responsibleId",
          COUNT(DISTINCT pt.id) as total_tables,
          COUNT(DISTINCT er.id) as tables_with_e14
        FROM territories t
        JOIN polling_places pp ON pp."territoryId" = t.id
        JOIN polling_tables pt ON pt."pollingPlaceId" = pp.id
        LEFT JOIN e14_records er ON er."pollingTableId" = pt.id AND er."electionId" = '${electionId}'
        WHERE t."responsibleId" IS NOT NULL
        GROUP BY t."responsibleId"
      )
      SELECT 
        p."firstName" || ' ' || p."lastName" as "leaderName",
        a.role,
        -- Task Compliance %
        COALESCE((tm.completed::float / NULLIF(tm.total, 0)::float) * 100, 0) as "taskCompliance",
        -- GPS Integrity % (100 - %Override)
        100 - COALESCE((gm.overrides::float / NULLIF(gm.total, 0)::float) * 100, 0) as "gpsIntegrity",
        -- E14 Coverage %
        COALESCE((em.tables_with_e14::float / NULLIF(em.total_tables, 0)::float) * 100, 0) as "e14Coverage"
      FROM actors a
      JOIN people p ON a."personId" = p.id
      LEFT JOIN TaskMetrics tm ON tm."assignedToId" = a.id
      LEFT JOIN GPSMetrics gm ON gm."leaderId" = a.id
      LEFT JOIN E14Metrics em ON em."responsibleId" = a.id
      WHERE a.role IN ('COORDINADOR', 'LIDER')
      ORDER BY "taskCompliance" DESC, "gpsIntegrity" DESC;
    `;

    // -------------------------------------------------------------------------
    // 3. TECH AUDIT (MessageRouter & HumanBridge)
    // -------------------------------------------------------------------------
    const techQuery = `
      SELECT 
        channel,
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('DELIVERED', 'READ') THEN 1 ELSE 0 END) as success
      FROM messages
      GROUP BY channel;
    `;

    const bridgeQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN details->>'status' = 'SYNC_SUCCESS' THEN 1 ELSE 0 END) as success
      FROM audit_logs
      WHERE action = 'BRIDGE_SYNC' -- Assuming we log this action
      AND timestamp > (SELECT date FROM elections WHERE id = '${electionId}');
    `;

    // -------------------------------------------------------------------------
    // EXECUTION
    // -------------------------------------------------------------------------
    const [politicalData, disciplineData, techData, bridgeData] = await Promise.all([
      prisma.$queryRawUnsafe(politicalQuery),
      prisma.$queryRawUnsafe(disciplineQuery),
      prisma.$queryRawUnsafe(techQuery),
      prisma.$queryRawUnsafe(bridgeQuery)
    ]) as any[];

    // -------------------------------------------------------------------------
    // 4. TALENT IDENTIFICATION (All-Stars) & FORMATTING
    // -------------------------------------------------------------------------
    
    // Process Discipline Data to calculate Scores and find All-Stars
    const processedDiscipline = disciplineData.map((d: any) => {
      // Weighted Score (Example: 40% Tasks, 30% GPS, 30% E14)
      const score = (d.taskCompliance * 0.4) + (d.gpsIntegrity * 0.3) + (d.e14Coverage * 0.3);
      
      // All-Star Condition: 100% in everything relevant (strict)
      // We check if data exists (not 0/0) to be fair. If task total was 0, compliance is 0.
      const isAllStar = 
        d.taskCompliance === 100 && 
        d.gpsIntegrity === 100 && 
        (d.e14Coverage === 100 || d.e14Coverage === 0); // Allow 0 E14 if they don't manage territory directly

      return {
        leaderName: d.leaderName,
        role: d.role,
        taskCompliance: Number(d.taskCompliance.toFixed(1)),
        gpsIntegrity: Number(d.gpsIntegrity.toFixed(1)),
        e14Coverage: Number(d.e14Coverage.toFixed(1)),
        score: Number(score.toFixed(1)),
        isAllStar
      };
    });

    const allStars = processedDiscipline.filter((d: any) => d.isAllStar);

    // Process Tech Data
    const processedTech = techData.map((t: any) => ({
      channel: t.channel,
      total: Number(t.total),
      successRate: t.total > 0 ? Number(((t.success / t.total) * 100).toFixed(1)) : 0
    }));

    const bridgeStats = bridgeData[0] || { total: 0, success: 0 };
    const bridgeTotal = Number(bridgeStats.total || 0);
    const bridgeSuccess = Number(bridgeStats.success || 0);

    return {
      summary: {
        totalVotes: politicalData.reduce((acc: number, curr: any) => acc + Number(curr.actualVotes), 0),
        conversionRate: politicalData.length > 0 
          ? Number((politicalData.reduce((acc: number, curr: any) => acc + curr.conversionRate, 0) / politicalData.length).toFixed(1))
          : 0,
        allStarCount: allStars.length
      },
      politicalPerformance: politicalData.map((p: any) => ({
        territoryName: p.territoryName,
        readyToVote: Number(p.readyToVote),
        actualVotes: Number(p.actualVotes),
        conversionRate: Number(p.conversionRate.toFixed(1))
      })),
      organizationalDiscipline: processedDiscipline,
      techAudit: {
        messageRouter: processedTech,
        humanBridge: {
          syncsAttempted: bridgeTotal,
          syncsSuccessful: bridgeSuccess,
          successRate: bridgeTotal > 0 ? Number(((bridgeSuccess / bridgeTotal) * 100).toFixed(1)) : 0
        }
      }
    };
  }

  // ... (Keep existing methods)
  /**
   * 1. MÉTRICAS OPERATIVAS (Corte por Responsable)
   */
  async getOperationalMetrics(electionId: string, responsibleId?: string) {
    // ... (Original code preserved below)
    // A. TAREAS: Cumplimiento
    const tasksQuery = `
      SELECT 
        "assignedToId",
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_tasks,
        (SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)::float) * 100 as compliance_rate
      FROM tasks
      WHERE "createdAt" > (SELECT date FROM elections WHERE id = '${electionId}')
      ${responsibleId ? `AND "assignedToId" = '${responsibleId}'` : ''}
      GROUP BY "assignedToId"
    `;

    const gpsQuery = `
      SELECT 
        l.id as leader_id,
        COUNT(a.id) as total_attendances,
        SUM(CASE WHEN a."isOverride" = true THEN 1 ELSE 0 END) as override_count,
        (SUM(CASE WHEN a."isOverride" = true THEN 1 ELSE 0 END)::float / NULLIF(COUNT(a.id), 0)::float) * 100 as override_rate
      FROM attendances a
      JOIN political_contacts c ON a."contactId" = c.id
      JOIN actors l ON c."leaderId" = l.id
      WHERE a."timestamp" > NOW() - INTERVAL '30 days'
      ${responsibleId ? `AND l.id = '${responsibleId}'` : ''}
      GROUP BY l.id
    `;

    const expenseQuery = `
      SELECT 
        "responsibleId",
        SUM(amount) as total_spent,
        COUNT(*) as expense_count,
        SUM(CASE WHEN "isFormal" = false THEN amount ELSE 0 END) as petty_cash_spent
      FROM expenses
      WHERE "electionId" = '${electionId}'
      ${responsibleId ? `AND "responsibleId" = '${responsibleId}'` : ''}
      GROUP BY "responsibleId"
    `;

    const [taskStats, gpsStats, expenseStats] = await Promise.all([
      prisma.$queryRawUnsafe(tasksQuery),
      prisma.$queryRawUnsafe(gpsQuery),
      prisma.$queryRawUnsafe(expenseQuery)
    ]);

    return { taskStats, gpsStats, expenseStats };
  }

  async getPoliticalMetrics(electionId: string, territoryId?: string) {
    const coverageQuery = `
      SELECT 
        t.id as territory_id,
        t.name as territory_name,
        COUNT(ec.id) as total_contacts,
        COUNT(ec."pollingTableId") as localized_contacts,
        (COUNT(ec."pollingTableId")::float / NULLIF(COUNT(ec.id), 0)::float) * 100 as coverage_pct
      FROM territories t
      LEFT JOIN electoral_contacts ec ON ec."territoryId" = t.id AND ec."electionId" = '${electionId}'
      ${territoryId ? `WHERE t.id = '${territoryId}'` : ''}
      GROUP BY t.id, t.name
    `;

    const mobilizationQuery = `
      SELECT 
        t.id as territory_id,
        COUNT(vs.id) as votes_reported,
        (SELECT COUNT(*) FROM electoral_contacts WHERE "territoryId" = t.id AND "electionId" = '${electionId}') as target_votes
      FROM territories t
      LEFT JOIN electoral_contacts ec ON ec."territoryId" = t.id AND ec."electionId" = '${electionId}'
      LEFT JOIN voted_statuses vs ON vs."electoralContactId" = ec.id AND vs."hasVoted" = true
      ${territoryId ? `WHERE t.id = '${territoryId}'` : ''}
      GROUP BY t.id
    `;

    const evidenceQuery = `
      SELECT 
        t.id as territory_id,
        COUNT(DISTINCT pt.id) as total_tables,
        COUNT(DISTINCT er."pollingTableId") as tables_with_e14,
        (COUNT(DISTINCT er."pollingTableId")::float / NULLIF(COUNT(DISTINCT pt.id), 0)::float) * 100 as evidence_pct
      FROM territories t
      JOIN polling_places pp ON pp."territoryId" = t.id
      JOIN polling_tables pt ON pt."pollingPlaceId" = pp.id
      LEFT JOIN e14_records er ON er."pollingTableId" = pt.id AND er."electionId" = '${electionId}'
      ${territoryId ? `WHERE t.id = '${territoryId}'` : ''}
      GROUP BY t.id
    `;

    const [coverage, mobilization, evidence] = await Promise.all([
      prisma.$queryRawUnsafe(coverageQuery),
      prisma.$queryRawUnsafe(mobilizationQuery),
      prisma.$queryRawUnsafe(evidenceQuery)
    ]);

    return { coverage, mobilization, evidence };
  }

  async generateDailySnapshot(electionId: string) {
    const today = new Date();
    const coverageMetrics: any[] = (await this.getPoliticalMetrics(electionId)).coverage as any[];
    
    for (const row of coverageMetrics) {
      if (row.total_contacts === 0) continue;

      await prisma.metricHistory.create({
        data: {
          electionId,
          date: today,
          category: 'POLITICAL',
          metric: 'POLITICAL_COVERAGE',
          value: row.coverage_pct,
          dimension: 'TERRITORY',
          dimensionId: row.territory_id,
          details: {
            numerator: row.localized_contacts,
            denominator: row.total_contacts
          }
        }
      });
    }
    console.log(`Snapshot generated for ${today.toISOString()}`);
  }
}
