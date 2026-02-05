'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { compare } from 'bcryptjs';
import { createAuditLog } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function toggleSystemLock(locked: boolean, pin?: string) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');

    // Find organization context
    const org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) throw new Error('No Organization Context Found');

    if (locked) {
        // LOCKING (Only Admins can initiate lock)
        if (user.role !== 'ADMIN') throw new Error('Forbidden: Only Admins can manage security lock');

        await prisma.organization.update({
            where: { id: org.id },
            data: { isEmergencyLocked: true }
        });

        await createAuditLog(user.id, 'SYSTEM_LOCK_ENGAGED', 'System', 'GLOBAL', {
            msg: `Emergency Protocol Activated by ${user.fullName} (GLOBAL LOCK)`
        });

        revalidatePath('/'); // Force global refresh
        return { success: true, locked: true };
    } else {
        // UNLOCKING (Requires PIN - Any Admin PIN allows unlock if user is not admin)
        if (!pin) throw new Error('PIN required to unlock system');

        let valid = false;

        if (user.role === 'ADMIN') {
             // Admin unlocking: Check their own PIN
             const secureUser = await prisma.user.findUnique({ where: { id: user.id } });
             if (secureUser && secureUser.pinHash) {
                 valid = await compare(pin, secureUser.pinHash);
             }
        } else {
            // Non-Admin stuck in lock screen: Check against ANY active Admin's PIN
            const admins = await prisma.user.findMany({ 
                where: { 
                    role: 'ADMIN', 
                    isActive: true,
                    organizationId: org.id 
                } 
            });
            
            for (const admin of admins) {
                if (admin.pinHash && await compare(pin, admin.pinHash)) {
                    valid = true;
                    break;
                }
            }
        }

        if (!valid) throw new Error('Invalid Security PIN');

        await prisma.organization.update({
            where: { id: org.id },
            data: { isEmergencyLocked: false }
        });

        await createAuditLog(user.id, 'SYSTEM_UNLOCK', 'System', 'GLOBAL', {
            msg: `Emergency Protocol Deactivated by ${user.fullName} (GLOBAL UNLOCK)`
        });

        revalidatePath('/'); // Force global refresh
        return { success: true, locked: false };
    }
}

// Alias for compatibility
export async function setSystemLockStatus(locked: boolean, pin?: string) {
    return toggleSystemLock(locked, pin);
}

export async function getSecurityLogs() {
    try {
        const logs = await prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: {
                user: { select: { fullName: true, role: true } }
            }
        });

        return { success: true, data: logs };
    } catch (error) {
        console.error("Error fetching logs:", error);
        return { success: false, data: [] };
    }
}