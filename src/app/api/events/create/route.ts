import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';



export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name, date, territoryId } = await req.json();

    if (!name || !date) {
        return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    // Context
    const campaign = await prisma.campaign.findFirst({ where: { status: 'active' } });
    if (!campaign) return NextResponse.json({ error: 'No campaign' }, { status: 500 });

    const activeElection = await prisma.election.findFirst({ where: { status: 'ACTIVE' } });

    // Territory logic: If not provided, try user's territory or global
    let finalTerritoryId = territoryId;
    if (!finalTerritoryId) {
        finalTerritoryId = user.territoryId;
    }
    if (!finalTerritoryId) {
        // Fallback to first territory found (Global usually)
        const t = await prisma.territory.findFirst();
        finalTerritoryId = t?.id;
    }

    if (!finalTerritoryId) return NextResponse.json({ error: 'Territorio requerido' }, { status: 400 });

    const event = await prisma.event.create({
        data: {
            name,
            eventDate: new Date(date),
            campaignId: campaign.id,
            electionId: activeElection?.id || null,
            territoryId: finalTerritoryId,
            responsibleUserId: user.id
        }
    });

    await createAuditLog(user.id, 'CREATE_EVENT', 'Event', event.id, { name });

    return NextResponse.json(event);

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Error creating event' }, { status: 500 });
  }
}

