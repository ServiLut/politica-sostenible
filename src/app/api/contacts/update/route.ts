import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';



export async function POST(req: NextRequest) {
  try {
    const { contactId, territoryId } = await req.json();

    if (!contactId) {
        return NextResponse.json({ error: 'Falta contactId' }, { status: 400 });
    }

    const updated = await prisma.politicalContact.update({
        where: { id: contactId },
        data: {
            territoryId: territoryId || null // Permitir desasignar enviando string vacío
        }
    });

    return NextResponse.json({ success: true, contact: updated });

  } catch (error) {
    console.error('Update Error:', error);
    return NextResponse.json({ error: 'Error updating contact' }, { status: 500 });
  }
}

