'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { ensureSystemNotLocked } from '@/lib/guards';



export async function updateTerritory(id: string, data: any) {
    await ensureSystemNotLocked();
    const user = await getCurrentUser();
    // Allow ADMIN and COORDINATOR to edit structure
    if (!user || (user.role !== 'ADMIN' && user.role !== 'COORDINATOR')) {
        throw new Error('No tiene permisos para modificar la arquitectura territorial.');
    }

    const { name, level, parentId, responsibleUserId, lat, lng } = data;

    // Prevent circular dependency (basic check)
    if (parentId && parentId === id) {
        throw new Error('Un territorio no puede ser su propio padre.');
    }

    const updated = await prisma.territory.update({
        where: { id },
        data: {
            name,
            level,
            parentId: parentId || null,
            responsibleUserId: responsibleUserId || null,
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null
        }
    });

    await createAuditLog(user.id, 'UPDATE_TERRITORY', 'Territory', id, {
        msg: `Usuario ${user.fullName} actualizó el territorio "${name}" (Nivel: ${level})`
    });

    revalidatePath('/dashboard/settings');
    return { success: true, data: updated };
}

export async function updatePollingPlace(id: string, data: any) {
    await ensureSystemNotLocked();
    const user = await getCurrentUser();
    if (!user || (user.role !== 'ADMIN' && user.role !== 'COORDINATOR')) {
         throw new Error('No tiene permisos para modificar puestos de votación.');
    }

    const { name, address, territoryId } = data;

    const updated = await prisma.pollingPlace.update({
        where: { id },
        data: {
            name,
            address,
            territoryId
        }
    });

    await createAuditLog(user.id, 'UPDATE_POLLING_PLACE', 'PollingPlace', id, {
        msg: `Usuario ${user.fullName} actualizó el puesto de votación "${name}"`
    });

    revalidatePath('/dashboard/settings');
    return { success: true, data: updated };
}

