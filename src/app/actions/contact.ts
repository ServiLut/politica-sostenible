'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';
import { uploadToStorage } from '@/lib/storage';
import { revalidatePath } from 'next/cache';
import { ensureElectionIsOpen } from '@/lib/guards';



async function getActiveElectionId() {
    const election = await prisma.election.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true }
    });
    return election?.id;
}

export async function getPollingPlaces(search: string = '') {
    const user = await getCurrentUser();
    if (!user) return [];

    const activeElectionId = await getActiveElectionId();
    if (!activeElectionId) return [];

    try {
        const places = await prisma.pollingPlace.findMany({
            where: {
                electionId: activeElectionId,
                name: { contains: search, mode: 'insensitive' }
            },
            select: {
                id: true,
                name: true,
                tables: {
                    select: { id: true, tableNumber: true }
                }
            },
            take: 20
        });
        return places;
    } catch (e) {
        console.error('Polling Search Error:', e);
        return [];
    }
}

export async function updatePollingPlace(contactId: string, pollingPlaceId: string, tableId: string) {
  try {
    await ensureElectionIsOpen();
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');

    const electionId = await getActiveElectionId();
    if (!electionId) throw new Error('No active election');

    // Find Electoral Contact
    let electoralContact = await prisma.electoralContact.findFirst({
        where: {
            politicalContactId: contactId,
            electionId: electionId
        }
    });

    if (!electoralContact) {
        // Create if not exists (upsert logic basically)
        electoralContact = await prisma.electoralContact.create({
            data: {
                politicalContactId: contactId,
                electionId: electionId,
                pollingPlaceId,
                pollingTableId: tableId
            }
        });
    } else {
        await prisma.electoralContact.update({
            where: { id: electoralContact.id },
            data: {
                pollingPlaceId,
                pollingTableId: tableId
            }
        });
    }

    await createAuditLog(user.id, 'UPDATE_POLLING_PLACE', 'ElectoralContact', electoralContact.id, {
        newPollingPlace: pollingPlaceId,
        newTable: tableId
    });

    // Sync with Person Record
    const contact = await prisma.politicalContact.findUnique({
        where: { id: contactId },
        select: { personId: true }
    });
    if (contact) {
        await prisma.person.update({
            where: { id: contact.personId },
            data: { 
                pollingPlace: pollingPlaceId ? { connect: { id: pollingPlaceId } } : undefined 
            }
        });
    }

    revalidatePath(`/dashboard/directory/${contactId}`);
    return { success: true };
  } catch (e: any) {
      return { success: false, error: e.message };
  }
}

export async function updateTransportNeed(contactId: string, needsTransport: boolean) {
  try {
    await ensureElectionIsOpen();
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');

    const electionId = await getActiveElectionId();
    if (!electionId) throw new Error('No active election');

    const transportNeed = needsTransport ? 'transport' : 'walk';

    // 1. Update/Create Electoral Contact (Legacy/Detailed)
    let electoralContact = await prisma.electoralContact.findFirst({
        where: {
            politicalContactId: contactId,
            electionId: electionId
        }
    });

    if (!electoralContact) {
         electoralContact = await prisma.electoralContact.create({
            data: {
                politicalContactId: contactId,
                electionId: electionId,
                transportNeed
            }
        });
    } else {
        await prisma.electoralContact.update({
            where: { id: electoralContact.id },
            data: { transportNeed }
        });
    }

    // 2. Sync with Person Record (Simplified/Modern)
    const contact = await prisma.politicalContact.findUnique({
        where: { id: contactId },
        select: { personId: true }
    });
    
    if (contact) {
        await prisma.person.update({
            where: { id: contact.personId },
            data: { transportNeed: needsTransport }
        });
    }

    await createAuditLog(user.id, 'UPDATE_TRANSPORT', 'ElectoralContact', electoralContact.id, {
        transportNeed
    });

    revalidatePath(`/dashboard/directory/${contactId}`);
    revalidatePath('/dashboard'); // FORCE DASHBOARD REFRESH
    return { success: true };
  } catch (e: any) {
      return { success: false, error: e.message };
  }
}

export async function createPollingPlace(name: string, address: string = 'Dirección Manual') {
  try {
    await ensureElectionIsOpen();
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');

    const electionId = await getActiveElectionId();
    if (!electionId) throw new Error('No active election');
    
    // Fallback Territory
    const userTerritory = await prisma.user.findUnique({
        where: { id: user.id },
        select: { territoryId: true }
    });
    
    let territoryId = userTerritory?.territoryId;
    
    if (!territoryId) {
        const anyTerritory = await prisma.territory.findFirst();
        territoryId = anyTerritory?.id;
    }

    if (!territoryId) throw new Error('No territory available to assign polling place');

    const newPlace = await prisma.pollingPlace.create({
        data: {
            name: `${name} (MANUAL)`,
            address,
            electionId,
            territoryId
        }
    });
    
    // Create 30 tables by default (Ref: User Request)
    const tablesData = Array.from({ length: 30 }, (_, i) => ({
        pollingPlaceId: newPlace.id,
        tableNumber: (i + 1).toString()
    }));

    await prisma.pollingTable.createMany({
        data: tablesData
    });

    await createAuditLog(user.id, 'CREATE_POLLING_PLACE', 'PollingPlace', newPlace.id, {
        name,
        origin: 'MANUAL_OVERRIDE'
    });

    return { success: true, place: newPlace };
  } catch (e: any) {
      return { success: false, error: e.message };
  }
}

export async function uploadEvidenceAction(formData: FormData) {
    try {
        await ensureElectionIsOpen();
        const user = await getCurrentUser();
        if (!user) throw new Error('Unauthorized');

        const contactId = formData.get('contactId') as string;
        const type = formData.get('type') as string; // 'front' | 'back'
        const file = formData.get('file') as File;

        if (!file || !contactId) throw new Error('Missing data');

        const electionId = await getActiveElectionId();
        if (!electionId) throw new Error('No active election');

        const contact = await prisma.politicalContact.findUnique({
            where: { id: contactId },
            include: { person: true }
        });

        if (!contact) throw new Error('Contact not found');

        const buffer = Buffer.from(await file.arrayBuffer());
        const path = `${electionId}/${contact.person.id}/${type}_${Date.now()}.jpg`;
        
        // Upload to Supabase (Handles its own errors)
        const storagePath = await uploadToStorage(buffer, path, file.type);

        // Update Person Record
        const updateData: any = {};
        if (type === 'front') updateData.idCardFrontUrl = storagePath;
        if (type === 'back') updateData.idCardBackUrl = storagePath;

        await prisma.person.update({
            where: { id: contact.personId },
            data: updateData
        });

        await createAuditLog(user.id, 'UPLOAD_EVIDENCE', 'Person', contact.personId, {
            type,
            path: storagePath
        });

        revalidatePath(`/dashboard/directory/${contactId}`);
        return { success: true, path: storagePath };

    } catch (e: any) {
        console.error('Action Upload Error:', e);
        // Return structured error to UI
        return { success: false, error: e.message || 'Error desconocido' };
    }
}

export async function getSecureDocumentUrl(path: string, contactName: string) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    if (user.role !== 'ADMIN') throw new Error('Forbidden: Only Admins can view evidence');

    const { getSignedUrl } = await import('@/lib/storage');
    const signedUrl = await getSignedUrl(path);

    await createAuditLog(user.id, 'DOCUMENT_VIEWED', 'Evidence', path, {
        contactName,
        viewer: user.fullName
    });

    return { success: true, url: signedUrl };
}
