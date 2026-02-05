import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';



// Zod Schema V4.2
const captureSchema = z.object({
  fullName: z.string().min(3, "El nombre es muy corto"),
  phone: z.string().min(7, "El teléfono debe tener al menos 7 dígitos"),
  territoryId: z.string().uuid("Territorio inválido"),
  address: z.string().min(5, "La dirección es muy corta"),
  pollingPlaceId: z.string().optional().or(z.literal('')),
  tableNumber: z.string().optional().or(z.literal('')),
  transportNeed: z.boolean().optional(),
  consentGranted: z.literal(true, { message: "Consentimiento requerido" }),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Zod Validation
    const validation = captureSchema.safeParse(body);
    if (!validation.success) {
        return NextResponse.json({ 
            error: validation.error.issues[0].message 
        }, { status: 400 });
    }

    const { fullName, phone, consentGranted, territoryId, address, pollingPlaceId, tableNumber, transportNeed, gpsLat, gpsLng } = validation.data;

    const { getCurrentUser } = await import('@/lib/session');
    const sessionUser = await getCurrentUser();
    
    // LOCK CHECK: Is Election Closed?
    const activeElection = await prisma.election.findFirst({ where: { status: 'ACTIVE' } });
    const anyClosed = await prisma.election.findFirst({ where: { status: 'CLOSED' }, orderBy: { createdAt: 'desc' } });
    
    if (!activeElection && anyClosed) {
         return NextResponse.json({ error: 'ELECCIÓN CERRADA. Solo lectura.' }, { status: 403 });
    }

    const activeCampaign = await prisma.campaign.findFirst({
      where: { status: 'active' }
    });

    if (!activeCampaign) {
      return NextResponse.json({ error: 'No hay campaña activa' }, { status: 500 });
    }

    let actingUser: any = sessionUser;
    if (!actingUser) {
        // Fallback safety
        actingUser = await prisma.user.findFirst({ where: { isActive: true } });
    }

    if (!actingUser) {
        return NextResponse.json({ error: 'No hay usuarios activos para asignar.' }, { status: 500 });
    }

    // 1. Deduplication & Person Creation
    let person = await prisma.person.findUnique({
      where: { phone: phone }
    });

    if (person) {
        const existingContact = await prisma.politicalContact.findFirst({
            where: { personId: person.id, campaignId: activeCampaign.id },
            include: { leader: true }
        });

        if (existingContact) {
            return NextResponse.json({ 
                error: 'DUPLICATE',
                message: `Registrado con Líder: ${existingContact.leader?.fullName || 'Desconocido'}`,
            }, { status: 409 });
        }
        
        // Update Person Fields (Address, Transport, Polling Place)
        await prisma.person.update({
            where: { id: person.id },
            data: { 
                address: address || undefined,
                transportNeed: transportNeed || false,
                pollingPlace: pollingPlaceId ? { connect: { id: pollingPlaceId } } : undefined,
                tableNumber: tableNumber || null
            } 
        });
    } else {
      person = await prisma.person.create({
        data: {
          fullName: fullName,
          phone: phone,
          address: address,
          transportNeed: transportNeed || false,
          pollingPlace: pollingPlaceId ? { connect: { id: pollingPlaceId } } : undefined,
          tableNumber: tableNumber || null
        }
      });
    }

    // 2. Create Political Contact
    let contact = await prisma.politicalContact.create({
        data: {
          personId: person.id,
          campaignId: activeCampaign.id,
          ownerLeaderId: actingUser.id,
          status: 'active',
          territoryId: territoryId
        }
    });

    // 3. Create Electoral Contact (Logistics)
    if (activeElection) {
        await prisma.electoralContact.create({
            data: {
                politicalContactId: contact.id,
                electionId: activeElection.id,
                pollingPlaceId: pollingPlaceId || null,
                transportNeed: transportNeed ? 'REQUIERE TRANSPORTE' : 'CAMINANTE',
                homeLat: gpsLat || null,
                homeLng: gpsLng || null,
                territoryId: territoryId
            }
        });
    }

    // 4. Consent
    await prisma.consent.create({
      data: {
        politicalContactId: contact.id,
        consentText: 'Autorización tratamiento de datos V4.2',
        version: 'v4.2-full',
        channel: 'PWA_CAPTURE',
        granted: true
      }
    });

    // 5. Audit Log
    const { createAuditLog } = await import('@/lib/audit');
    await createAuditLog(
        actingUser.id, 
        'CAPTURE', 
        'PoliticalContact', 
        contact.id, 
        { 
            msg: `Captura V4.2 por ${actingUser.fullName}`,
            territoryId,
            transportNeed,
            address,
            pollingPlaceId
        }
    );

    // 6. Revalidate
    const { revalidatePath } = await import('next/cache');
    revalidatePath('/dashboard');

    return NextResponse.json({ 
      success: true, 
      contactId: contact.id
    });

  } catch (error: any) {
    console.error('Capture Error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
