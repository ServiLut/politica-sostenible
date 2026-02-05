'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createAuditLog } from '@/lib/audit';

/**
 * Obtiene la lista de usuarios con isActive: false, ordenados por fecha de creación.
 */
export async function getPendingUsers() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'ADMIN') {
    throw new Error('No autorizado: Solo administradores pueden ver solicitudes.');
  }

  try {
    const pendingUsers = await prisma.user.findMany({
      where: {
        isActive: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        organization: {
          select: { name: true }
        }
      }
    });

    return pendingUsers;
  } catch (error) {
    console.error('Error al obtener usuarios pendientes:', error);
    return [];
  }
}

/**
 * Aprueba a un usuario cambiando isActive a true.
 */
export async function approveUser(userId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return { success: false, error: 'No autorizado' };
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    await createAuditLog(
      currentUser.id,
      'APPROVE_USER_REQUEST',
      'User',
      userId,
      { msg: `Admin ${currentUser.fullName} aprobó la solicitud de ${user.fullName}` }
    );

    revalidatePath('/dashboard/requests');
    revalidatePath('/dashboard/team');
    return { success: true };
  } catch (error) {
    console.error('Error al aprobar usuario:', error);
    return { success: false, error: 'Error al procesar la aprobación' };
  }
}

/**
 * Rechaza a un usuario eliminándolo de la base de datos.
 */
export async function rejectUser(userId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return { success: false, error: 'No autorizado' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true }
    });

    await prisma.user.delete({
      where: { id: userId },
    });

    await createAuditLog(
      currentUser.id,
      'REJECT_USER_REQUEST',
      'User',
      userId,
      { msg: `Admin ${currentUser.fullName} rechazó y eliminó la solicitud de ${user?.fullName || 'Usuario Desconocido'}` }
    );

    revalidatePath('/dashboard/requests');
    return { success: true };
  } catch (error) {
    console.error('Error al rechazar usuario:', error);
    return { success: false, error: 'Error al procesar el rechazo' };
  }
}
