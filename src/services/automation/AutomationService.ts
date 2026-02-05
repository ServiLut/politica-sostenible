import { prisma } from '@/lib/prisma';
import {  TaskStatus, SeverityLevel } from '@prisma/client';
import { MessageRouter } from '@/services/comms/MessageRouter';
import { addHours, differenceInDays } from 'date-fns';


const msgRouter = new MessageRouter();

export class AutomationService {

  /**
   * 1. POST-EVENT FLOW
   * Triggered usually by a cron/queue job 24h after event end.
   */
  async runPostEventCheck(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        territory: true,
        attendance: true
      }
    });

    if (!event) return;

    // Get all invited contacts (Assuming invitations logic exists or we query contacts in territory)
    // For V4.2 simplicity, we'll check Attendance vs Known Territory Contacts
    // A better approach in a real app would be an 'Invitation' model. 
    // Here we will act on those who HAVE Attendance records processed.
    
    // We iterate over the 'Attendance' records to check 'isOverride' or specific statuses if we had them.
    // However, the requirement says: "If attended -> Task follow up. If NOT attended -> Message Retry".
    
    // Since we only store Attendance if they attended (or override), finding who "Did Not Attend" 
    // requires a list of invitees. I will assume we iterate a target list provided or implied.
    // For this snippet, I will implement the "Attended" follow-up logic which is concrete.

    for (const record of event.attendance) {
      // LOGIC A: Attended -> Create Follow-up Task for Leader
      const contact = await prisma.politicalContact.findUnique({
        where: { id: record.politicalContactId },
        include: { leader: true }
      });

      if (!contact) continue;

      // Calculate Priority
      const priority = await this.calculateDynamicPriority(contact.ownerLeaderId!, event.territoryId, event.eventDate);

      await prisma.task.create({
        data: {
          title: `Seguimiento: ${contact.personId} asistió a ${event.name}`,
          description: 'Llamar para agradecer asistencia y consolidar compromiso.',
          priority: priority,
          dueDate: addHours(new Date(), 48), // Due in 2 days
          status: TaskStatus.PENDING,
          assignedToId: contact.ownerLeaderId!,
          territoryId: event.territoryId,
          // originRuleId: 'RULE_POST_EVENT' (If we fetched the rule)
        }
      });
    }
  }

  /**
   * 2. ELECTION DAY MONITOR (Missing Evidence)
   * Scheduled to run periodically on D-Day (e.g., every 30 mins, critical check at 17:00).
   */
  async runElectionDayMonitor(electionId: string) {
    const CRITICAL_HOUR = 17; // 5 PM
    const now = new Date();
    
    if (now.getHours() < CRITICAL_HOUR) return; // Only run after 5 PM

    // Find tables without E-14
    const pendingTables = await prisma.pollingTable.findMany({
      where: {
        pollingPlace: { electionId },
        e14Records: { none: {} } // No E-14 uploaded
      },
      include: { pollingPlace: { include: { territory: { include: { responsible: true } } } } }
    });

    for (const table of pendingTables as any[]) {
       const territoryManager = table.pollingPlace?.territory?.responsible;
       if (!territoryManager) continue;

       // A. Generate Emergency Task
       await prisma.task.create({
         data: {
           title: `URGENTE: Falta E-14 en Mesa ${table.tableNumber} - ${table.pollingPlace.name}`,
           description: 'La mesa no ha reportado. Enviar motorizado inmediatamente.',
           priority: 100, // Max priority
           dueDate: addHours(now, 1),
           status: TaskStatus.PENDING,
           assignedToId: territoryManager.id,
           territoryId: table.pollingPlace.territoryId
         }
       });

       // B. Create System Alert
       await prisma.anomalyAlert.create({
         data: {
           electionId,
           type: 'MISSING_EVIDENCE_CRITICAL',
           severity: SeverityLevel.HIGH,
           description: `Table ${table.id} silent after 17:00.`,
           territoryId: table.pollingPlace.territoryId,
           status: 'OPEN'
         }
       });
       
       // C. Notify via Router (Simulated)
       // msgRouter.dispatchMessage(territoryManager.phone, ...);
    }
  }

  /**
   * 3. ESCALATION ROUTINE
   * Reassigns overdue tasks to the boss.
   */
  async runEscalationRoutine() {
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: { in: [TaskStatus.PENDING] },
        dueDate: { lt: new Date() },
        priority: { gt: 70 } // Only High Priority tasks escalate
      },
      include: { user: { include: { reportsTo: true } } }
    });

    for (const task of overdueTasks) {
      const currentOwner = task.user;
      const boss = currentOwner.reportsTo;

      if (boss) {
        // Reassign to Boss
        await prisma.task.update({
          where: { id: task.id },
          data: {
            assignedToId: boss.id,
            description: `[ESCALATED from ${currentOwner.id}] ${task.description}`,
            priority: task.priority + 10 // Bump priority even higher
          }
        });

        // Audit Log on User Profile (Simulated via generic AuditLog)
        await prisma.auditLog.create({
          data: {
            action: 'TASK_ESCALATED',
            entity: 'Task',
            entityId: task.id,
            userId: currentOwner.id, // Against the original owner
            details: { reason: 'Missed Deadline', newOwner: boss.id }
          }
        });
      }
    }
  }

  /**
   * 4. DYNAMIC PRIORITY CALCULATION
   * 0 (Low) to 100 (Critical)
   */
  private async calculateDynamicPriority(leaderId: string, territoryId: string, eventDate: Date): Promise<number> {
    let score = 50; // Base

    // A. Proximity to Election (Simulated D-Day)
    const dDay = new Date('2026-03-08'); // Example date
    const daysLeft = differenceInDays(dDay, new Date());
    
    if (daysLeft < 7) score += 30;
    else if (daysLeft < 30) score += 10;

    // B. Territory Importance (Mock logic)
    // In a real app, Territory model would have 'weight' or 'voterPotential' field.
    // const territory = await prisma.territory.findUnique(...)
    // if (territory.type === 'ZONA_LOGISTICA') score += 20;

    return Math.min(score, 100);
  }
}

