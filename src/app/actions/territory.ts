'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';



/**
 * Retorna una lista simplificada de territorios para selectores en la UI.
 * Accesible para ADMIN y COORDINATOR.
 */
export async function getAllTerritoriesForSelect() {
  try {
    const user = await getCurrentUser();
    
    // Verificación de ROL: Permitir ADMIN y COORDINATOR
    if (!user || (user.role !== 'ADMIN' && user.role !== 'COORDINATOR')) {
      return [];
    }

    const territories = await prisma.territory.findMany({
      select: {
        id: true,
        name: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    return territories;
  } catch (error) {
    console.error('Error fetching territories for select:', error);
    return [];
  }
}

