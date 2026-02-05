'use server';

import { prisma } from '@/lib/prisma';
import {  ElectionStatus } from '@prisma/client';
import { withSensitiveProtection } from '@/lib/security/sensitiveGuard';



export const closeElectionDay = withSensitiveProtection(
  'CLOSE_ELECTION',
  async (electionId: string, actorId: string, pin: string) => {
    await prisma.$transaction(async (tx) => {
      // 1. Change Status
      await tx.election.update({
        where: { id: electionId },
        data: { status: ElectionStatus.CLOSED }
      });

      // 2. Freeze all Task generation (Stop Automation)
      await tx.automationRule.updateMany({
        data: { isActive: false }
      });

      // 3. Audit
      await tx.auditLog.create({
        data: {
          action: 'ELECTION_CLOSED',
          entity: 'Election',
          entityId: electionId,
          userId: actorId,
          details: { note: 'Official Closing of Polls. Database Locked.' }
        }
      });
    });

    return { success: true };
  }
);

