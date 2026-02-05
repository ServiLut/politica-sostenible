'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';
import { revalidatePath } from 'next/cache';



/**
 * Obtiene todos los E-14 cargados con su información de ubicación completa.
 */
export async function getUploadedE14s() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      throw new Error('No autorizado');
    }

    const records = await prisma.e14Record.findMany({
      where: {
        e14PhotoUrl: { not: '' }
      },
      include: {
        pollingTable: true,
        pollingPlace: {
          include: {
            territory: true
          }
        }
      },
      orderBy: {
        uploadedAt: 'desc'
      }
    });

    return records;
  } catch (error) {
    console.error('Error fetching E14s:', error);
    return [];
  }
}

/**
 * Actualiza el estado de un acta E-14 (Validación o Anomalía).
 */
export async function updateE14Status(id: string, status: 'VALIDATED' | 'ANOMALY') {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      throw new Error('No autorizado');
    }

    const updated = await prisma.e14Record.update({
      where: { id },
      data: { status }
    });

    await createAuditLog(user.id, `E14_${status}`, 'E14Record', id, {
      msg: `Admin ${user.fullName} marcó E-14 como ${status}`
    });

    revalidatePath('/dashboard/e14');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

