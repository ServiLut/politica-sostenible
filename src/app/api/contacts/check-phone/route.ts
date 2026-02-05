import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';



export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ error: 'Phone required' }, { status: 400 });
    }

    const activeCampaign = await prisma.campaign.findFirst({
      where: { status: 'active' }
    });

    if (!activeCampaign) return NextResponse.json({ exists: false });

    const person = await prisma.person.findUnique({
      where: { phone: phone }
    });

    if (person) {
        const contact = await prisma.politicalContact.findFirst({
            where: { personId: person.id, campaignId: activeCampaign.id },
            include: { leader: true }
        });

        if (contact) {
            return NextResponse.json({ 
                exists: true, 
                leaderName: contact.leader?.fullName || 'Desconocido'
            });
        }
    }

    return NextResponse.json({ exists: false });

  } catch (error) {
    return NextResponse.json({ error: 'Error checking phone' }, { status: 500 });
  }
}

