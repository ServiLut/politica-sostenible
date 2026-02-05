import { prisma } from '@/lib/prisma';

export async function createAuditLog(
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  details?: any,
  userSnapshot?: { id: string; role: string }
) {
  try {
    let user = userSnapshot;

    // 1. Snapshot Role for Forensics
    // If not provided, we fetch the user to get the CURRENT role at the time of the event.
    if (!user && userId !== 'SYSTEM' && userId.includes('-')) {
      user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true }
      }) || undefined;
    }

    const enrichedDetails = {
        ...details,
        _originalUserId: userId,
        _snapshotRole: user?.role || 'SYSTEM' // Forensic Trace
    };

    await prisma.auditLog.create({
      data: {
        userId: user ? user.id : null,
        action,
        entity,
        entityId,
        details: JSON.stringify(enrichedDetails),
      }
    });
  } catch (error) {
    console.error('Audit Log Error:', error);
    // Non-blocking error handling
  }
}