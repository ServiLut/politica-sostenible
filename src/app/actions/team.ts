'use server';

import { prisma } from '@/lib/prisma';
import { hash } from 'bcryptjs';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { ensureSystemNotLocked } from '@/lib/guards';



export async function toggleUserStatus(userId: string, newStatus: boolean) {
  try {
    await ensureSystemNotLocked();
    const currentUser = await getCurrentUser();
    
    if (!currentUser || currentUser.role !== 'ADMIN') {
        return { success: false, error: 'Unauthorized: Only Admins can change user status' };
    }

    if (userId === currentUser.id && newStatus === false) {
        return { success: false, error: 'Self-deactivation is not allowed.' };
    }

    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { isActive: newStatus }
    });

    await createAuditLog(
        currentUser.id,
        newStatus ? 'REACTIVATE_USER' : 'DEACTIVATE_USER',
        'User',
        userId,
        {
            msg: `Admin ${currentUser.fullName} cambió estado de ${updatedUser.fullName} a ${newStatus ? 'ACTIVO' : 'INACTIVO'}`,
            previousStatus: !newStatus,
            newStatus: newStatus
        }
    );

    revalidatePath('/dashboard/team');
    return { success: true, message: `Usuario ${newStatus ? 'Reactivado' : 'Desactivado'}` };

  } catch (error: any) {
    console.error('Toggle Status Error:', error);
    return { success: false, error: error.message || 'Error changing user status' };
  }
}

export async function updateUser(userId: string, data: { fullName: string; role: string; territoryId?: string; pin?: string; reportsToId?: string; email?: string }) {
    try {
        await ensureSystemNotLocked();
        const currentUser = await getCurrentUser();
        
        if (!currentUser || currentUser.role !== 'ADMIN') {
            return { success: false, error: 'Unauthorized' };
        }

        // Definimos explícitamente el objeto de actualización para evitar campos fantasma
        const updateData: {
            fullName: string;
            role: any;
            email: string | null;
            reportsToId?: string;
            territoryId?: string;
            pinHash?: string;
        } = {
            fullName: data.fullName,
            role: data.role as any,
            email: data.email || null,
        };

        // Partial Update: Solo actualizar supervisor si se envía (no vacío)
        if (data.reportsToId) {
            updateData.reportsToId = data.reportsToId;
        }

        // Partial Update: Solo actualizar territorio si hay un ID válido
        if (data.territoryId && data.territoryId !== "undefined" && data.territoryId !== "") {
            updateData.territoryId = data.territoryId;
        }

        // Partial Update: Solo actualizar PIN si se proporciona uno nuevo
        if (data.pin && data.pin.length === 4) {
            updateData.pinHash = await hash(data.pin, 10);
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        await createAuditLog(
            currentUser.id,
            'UPDATE_USER',
            'User',
            userId,
            {
                msg: `Admin ${currentUser.fullName} editó perfil de ${updatedUser.fullName}`,
                changes: { ...data, pin: data.pin ? 'CHANGED' : 'UNCHANGED' }
            }
        );

        revalidatePath('/dashboard/team');
        return { success: true, message: 'Usuario actualizado correctamente' };

    } catch (error: any) {
        console.error('Update User Error:', error);
        return { success: false, error: error.message || 'Error updating user' };
    }
}

export async function getUsers({ page = 1, query = '', role = '' }: { page?: number; query?: string; role?: string }) {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'COORDINATOR')) {
            throw new Error('Unauthorized');
        }

        const pageSize = 10;
        const skip = (page - 1) * pageSize;

        const whereClause: any = {};

        if (query) {
            whereClause.fullName = { contains: query, mode: 'insensitive' };
        }

        if (role && role !== 'ALL') {
            whereClause.role = role as any;
        }

        const [users, totalCount] = await Promise.all([
            prisma.user.findMany({
                where: whereClause,
                include: {
                    territory: { select: { id: true, name: true } },
                    reportsTo: { select: { fullName: true } }
                },
                skip,
                take: pageSize,
                orderBy: [
                    { isActive: 'desc' },
                    { createdAt: 'desc' }
                ]
            }),
            prisma.user.count({ where: whereClause })
        ]);

        const totalPages = Math.ceil(totalCount / pageSize);

        const safeUsers = users.map(u => ({
            id: u.id,
            fullName: u.fullName,
            role: u.role,
            email: u.email || '',
            territories: u.territory?.name || '',
            territoryId: u.territoryId || '',
            reportsTo: u.reportsTo,
            reportsToId: u.reportsToId, // Added for Edit Form
            isActive: u.isActive
        }));

        return { users: safeUsers, totalPages, totalCount };

    } catch (error) {
        console.error('Get Users Error:', error);
        return { users: [], totalPages: 0, totalCount: 0 };
    }
}
