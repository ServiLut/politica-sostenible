import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';



export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { contactId, reason } = await req.json();

    // 1. Validate Target
    const contact = await prisma.politicalContact.findUnique({
        where: { id: contactId },
        include: { leader: true, person: true }
    });

    if (!contact) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });

    // 2. Check existing pending request
    const existing = await prisma.contactTransferRequest.findFirst({
        where: {
            contactId,
            status: 'pending',
            toLeaderId: user.id
        }
    });

    if (existing) return NextResponse.json({ error: 'Ya existe una solicitud pendiente' }, { status: 400 });

    // 3. Create Request
    await prisma.contactTransferRequest.create({
        data: {
            contactId,
            fromLeaderId: contact.ownerLeaderId || 'system',
            toLeaderId: user.id,
            status: 'pending',
            reason: reason || 'Captura duplicada en terreno'
        }
    });

    // 4. Audit
    await createAuditLog(
        user.id, 
        'REQUEST_TRANSFER', 
        'PoliticalContact', 
        contactId, 
        { 
            msg: `Líder ${user.fullName} solicitó traspaso de ${contact.person.fullName} (Actual: ${contact.leader?.fullName})`,
            reason 
        }
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Transfer Error:', error);
    return NextResponse.json({ error: 'Error requesting transfer' }, { status: 500 });
  }
}

