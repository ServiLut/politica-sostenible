import { prisma } from '@/lib/prisma';
import {  SeverityLevel, TaskStatus } from '@prisma/client';
import { MessageRouter } from '@/services/comms/MessageRouter';
import { subMinutes, subHours } from 'date-fns';



export class AnomalyDetector {

  /**
   * 1. DETECTOR: MULTI-IP & GEO ANOMALY
   * Checks if an actor is accessing from multiple IPs or unusual locations in a short window.
   */
  async checkNetworkAnomalies(userId: string, currentIp: string, electionId: string): Promise<void> {
    const WINDOW_MINUTES = 60;
    const since = subMinutes(new Date(), WINDOW_MINUTES);

    // AuditLog doesn't have direct IP column, so we fetch recent logs for user and parse details
    const logs = await prisma.auditLog.findMany({
      where: {
        userId,
        createdAt: { gt: since },
      },
      select: { details: true }
    });

    // Extract IPs from details
    const uniqueIps = new Set<string>();
    logs.forEach(log => {
        const det = log.details as any;
        if (det && det.ip && det.ip !== currentIp) {
            uniqueIps.add(det.ip);
        }
    });
    
    // If user has used > 3 different IPs in 1 hour
    if (uniqueIps.size >= 3) {
      await this.createAlertAndTask(
        electionId,
        'SUSPICIOUS_MULTI_IP',
        `User ${userId} accessed from ${uniqueIps.size + 1} distinct IPs in ${WINDOW_MINUTES}min.`,
        userId,
        SeverityLevel.HIGH
      );
    }
  }

  /**
   * 2. DETECTOR: DATA EXFILTRATION (Export Spikes)
   * Checks if a user is downloading excessively.
   */
  async checkExportSpikes(actorId: string, electionId: string): Promise<void> {
    const WINDOW_HOURS = 1;
    const THRESHOLD = 3;
    const since = subHours(new Date(), WINDOW_HOURS);

    // Use AuditLog with action EXPORT since ExportAudit doesn't exist
    const count = await prisma.auditLog.count({
      where: {
        userId: actorId,
        action: 'EXPORT',
        createdAt: { gt: since }
      }
    });

    if (count > THRESHOLD) {
      await this.createAlertAndTask(
        electionId,
        'DATA_EXFILTRATION_RISK',
        `High export volume: ${count} downloads in last hour by Actor ${actorId}.`,
        actorId,
        SeverityLevel.CRITICAL
      );
    }
  }

  /**
   * 3. DETECTOR: ABUSO DE OVERRIDE (Falsificación de Asistencia)
   * Trigger: Scheduled Job (Hourly) or Post-Event.
   */
  async checkOverrideAbuse(leaderId: string, electionId: string) {
    // Get recent attendances managed by this leader
    // EventAttendance -> PoliticalContact -> User (Leader)
    const attendances = await prisma.eventAttendance.findMany({
      where: {
        contact: { ownerLeaderId: leaderId },
        confirmedAt: { gt: subMinutes(new Date(), 60 * 24 * 7) } // Last 7 days
      },
      select: { overrideUsed: true }
    });

    if (attendances.length < 5) return; // Need minimum sample size

    const overrideCount = attendances.filter(a => a.overrideUsed).length;
    const ratio = overrideCount / attendances.length;

    // Threshold > 30% overrides
    if (ratio > 0.3) {
      await this.createAlertAndTask(
        electionId,
        'GPS_OVERRIDE_ABUSE',
        `Leader ${leaderId} has ${Math.round(ratio * 100)}% invalid GPS logs. Potential fraud.`,
        leaderId,
        SeverityLevel.HIGH
      );
    }
  }

  /**
   * 4. DETECTOR: REGISTRO IMPOSIBLE (Bot/Script Attack)
   */
  async checkRapidRegistration(ipAddress: string, userId: string, electionId: string) {
    const WINDOW_MINUTES = 10;
    const THRESHOLD = 50;
    const since = subMinutes(new Date(), WINDOW_MINUTES);

    const count = await prisma.auditLog.count({
      where: {
        action: 'CREATE_CONTACT',
        userId: userId,
        createdAt: { gt: since }
      }
    });

    if (count > THRESHOLD) {
      await this.createAlertAndTask(
        electionId,
        'IMPOSSIBLE_REGISTRATION_RATE',
        `User ${userId} created ${count} contacts in ${WINDOW_MINUTES}min.`,
        userId,
        SeverityLevel.CRITICAL
      );
      return { block: true, reason: 'RATE_LIMIT_EXCEEDED' };
    }
    return { block: false };
  }

  /**
   * 5. DETECTOR: MARCACIÓN MASIVA "VOTÓ" (Fraude en Reporte)
   */
  async checkBulkVoting(territoryId: string, electionId: string) {
    const WINDOW_MINUTES = 15;
    const since = subMinutes(new Date(), WINDOW_MINUTES);

    // Get total expected voters in territory
    const totalContacts = await prisma.electoralContact.count({
      where: { territoryId, electionId }
    });
    
    // Get votes reported in last 15 mins
    const recentVotes = await prisma.votedStatus.count({
      where: {
        electionId,
        electoralContact: { territoryId },
        createdAt: { gt: since }
      }
    });

    const velocity = recentVotes / (totalContacts || 1);

    if (velocity > 0.8) { 
      await this.createAlertAndTask(
        electionId,
        'BULK_VOTING_ANOMALY',
        `Territory ${territoryId} reported 80% voting in 15 mins.`,
        undefined, // System anomaly
        SeverityLevel.CRITICAL
      );
      
      return { block: true, requirePin: true };
    }
    return { block: false };
  }

  // --- SHARED HELPERS ---

  private async createAlertAndTask(
    electionId: string, 
    type: string, 
    description: string, 
    suspectActorId?: string,
    severity: SeverityLevel = SeverityLevel.MEDIUM
  ) {
    // 1. Log Anomaly Alert
    await prisma.anomalyAlert.create({
      data: {
        electionId,
        type,
        severity,
        description,
        status: 'OPEN'
      }
    });

    // 2. Notify Security Team (Fire & Forget)
    if (severity === SeverityLevel.CRITICAL) {
        const SECURITY_TEAM_NUMBER = process.env.SECURITY_PHONE || '+573000000000';
        MessageRouter.sendSystemAlert(SECURITY_TEAM_NUMBER, `🚨 ALERTA: ${type}. ${description}`).catch(console.error);
    }

    // 3. Create Verification Task for Coordinator
    if (suspectActorId) {
        const suspect = await prisma.user.findUnique({ 
            where: { id: suspectActorId },
            include: { reportsTo: true }
        });

        const assigneeId = suspect?.reportsToId; 
        
        if (assigneeId) {
            await prisma.task.create({
                data: {
                    title: `🛡️ VERIFICACIÓN: ${type}`,
                    description: `${description} Investigar y reportar.`,
                    priority: severity === 'CRITICAL' ? 100 : 75,
                    dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 Hours
                    status: TaskStatus.PENDING,
                    assignedToId: assigneeId,
                    // territoryId is optional in schema, so we can omit if not known
                }
            }).catch(err => console.warn("Could not create verification task", err));
        }
    }
  }
}

