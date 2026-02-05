'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { ensureElectionIsOpen } from '@/lib/guards';

/**
 * Actualiza los datos personales y estado de un votante.
 */
export async function updateVoterProfile(contactId: string, data: {
  fullName?: string;
  phone?: string;
  address?: string;
  status?: 'active' | 'suspended' | 'deleted';
  territoryId?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('No autorizado');

    // Validación de Permisos: LEADER no puede borrar (DELETED)
    if (data.status === 'deleted' && user.role === 'LEADER') {
      throw new Error('Permisos insuficientes para eliminar contacto');
    }

    const contact = await prisma.politicalContact.findUnique({
      where: { id: contactId },
      include: { person: true }
    });

    if (!contact) throw new Error('Contacto no encontrado');

    // Mapear estado si es necesario (la DB usa strings o enums)
    // En schema.prisma, PoliticalContact.status es un String (default: "active")
    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.territoryId) updateData.territoryId = data.territoryId;

    await prisma.politicalContact.update({
      where: { id: contactId },
      data: updateData
    });

    // Actualizar datos en Person
    const personUpdate: any = {};
    if (data.fullName) personUpdate.fullName = data.fullName;
    if (data.phone) personUpdate.phone = data.phone;
    if (data.address) personUpdate.address = data.address;

    if (Object.keys(personUpdate).length > 0) {
      await prisma.person.update({
        where: { id: contact.personId },
        data: personUpdate
      });
    }

    await createAuditLog(user.id, 'UPDATE_VOTER_PROFILE', 'PoliticalContact', contactId, {
      changes: data
    });

    revalidatePath(`/dashboard/directory/${contactId}`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Asigna puesto de votación y número de mesa explícito.
 */
export async function assignPollingPlace(contactId: string, pollingPlaceId: string, tableNumber: string) {
  try {
    await ensureElectionIsOpen();
    const user = await getCurrentUser();
    if (!user) throw new Error('No autorizado');

    // Obtener elección activa
    const activeElection = await prisma.election.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true }
    });
    if (!activeElection) throw new Error('No hay elección activa');

    // Buscar si ya existe el registro electoral para esta elección
    let electoralContact = await prisma.electoralContact.findFirst({
        where: {
            politicalContactId: contactId,
            electionId: activeElection.id
        }
    });

    // Buscar el ID de la mesa si existe en ese puesto (opcional, pero mejor para integridad)
    // Pero el requerimiento pide guardar tableNumber explícitamente en Person.
    const table = await prisma.pollingTable.findFirst({
        where: {
            pollingPlaceId: pollingPlaceId,
            tableNumber: tableNumber
        }
    });

    if (!electoralContact) {
        electoralContact = await prisma.electoralContact.create({
            data: {
                politicalContactId: contactId,
                electionId: activeElection.id,
                pollingPlaceId: pollingPlaceId,
                pollingTableId: table?.id // Opcional según schema
            }
        });
    } else {
        await prisma.electoralContact.update({
            where: { id: electoralContact.id },
            data: {
                pollingPlaceId: pollingPlaceId,
                pollingTableId: table?.id
            }
        });
    }

    // Sincronizar con la tabla Person (Donde se visualiza el tableNumber directo)
    const contact = await prisma.politicalContact.findUnique({
        where: { id: contactId },
        select: { personId: true }
    });

    if (contact) {
        await prisma.person.update({
            where: { id: contact.personId },
            data: {
                pollingPlaceId: pollingPlaceId,
                tableNumber: tableNumber
            }
        });
    }

    await createAuditLog(user.id, 'ASSIGN_POLLING_PLACE', 'ElectoralContact', electoralContact.id, {
        pollingPlaceId,
        tableNumber
    });

    revalidatePath(`/dashboard/directory/${contactId}`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
