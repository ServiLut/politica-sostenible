import { prisma } from '@/lib/prisma';

export async function getGlobalLockStatus() {
    try {
        const org = await prisma.organization.findFirst({ select: { isEmergencyLocked: true } });
        return org?.isEmergencyLocked || false;
    } catch (e) {
        console.error('Lock Status Read Error:', e);
        return false;
    }
}