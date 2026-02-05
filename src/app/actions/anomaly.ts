'use server';

import { prisma } from '@/lib/prisma';
import {  SeverityLevel } from '@prisma/client';
import { revalidatePath } from 'next/cache';



export async function resolveAnomaly(alertId: string, resolutionNote: string, actorId: string) {
  if (!resolutionNote || resolutionNote.length < 10) {
    throw new Error('Resolution note is too short. Please explain detail.');
  }

  await prisma.$transaction(async (tx) => {
    // 1. Close the Alert
    await tx.anomalyAlert.update({
      where: { id: alertId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        description: `[RESOLVED] ${resolutionNote} (Original: ...)` // Append to desc or use separate field if schema allowed
      }
    });

    // 2. Audit Log
    await tx.auditLog.create({
      data: {
        action: 'RESOLVE_ALERT',
        entity: 'AnomalyAlert',
        entityId: alertId,
        userId: actorId,
        details: { resolutionNote }
      }
    });
  });

  revalidatePath('/security/anomalies');
}

export async function executeQuickAction(alertId: string, actionType: 'BLOCK_USER' | 'REQUIRE_PIN' | 'CREATE_TASK', actorId: string) {
  // Logic to execute the quick action based on the alert context
  // This would interface with other services (AuthService, TaskService)
  
  // Simulation:
  const alert = await prisma.anomalyAlert.findUnique({ where: { id: alertId } });
  if (!alert) throw new Error('Alert not found');

  if (actionType === 'BLOCK_USER') {
     // Logic to block user
     // await prisma.user.update(...)
  }

  // Audit
  await prisma.auditLog.create({
    data: {
      action: `QUICK_ACTION_${actionType}`,
      entity: 'AnomalyAlert',
      entityId: alertId,
      userId: actorId,
      details: { automated: true }
    }
  });

  revalidatePath('/security/anomalies');
}

