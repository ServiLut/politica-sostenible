import { prisma } from '@/lib/prisma';

export async function createAuditLog(
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  details?: any
) {
  try {
    // 1. Snapshot Role for Forensics (Ref: Paso 11.4)
    // We fetch the user to get the CURRENT role at the time of the event.
    const user = await prisma.user.findUnique({
        where: { id: userId.includes('-') ? userId : '00000000-0000-0000-0000-000000000000' }, // Quick check for UUID-like
        select: { id: true, role: true }
    });

    const enrichedDetails = {
        ...details,
        _originalUserId: userId,
        _snapshotRole: user?.role || 'SYSTEM' // Forensic Trace
    };

    await prisma.auditLog.create({
      data: {
        userId: user ? user.id : null, // Only link if it's a real user
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