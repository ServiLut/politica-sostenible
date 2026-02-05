import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';



export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { name, level, lat, lng, parentId, responsibleUserId } = await req.json();
    
    const campaign = await prisma.campaign.findFirst({ where: { status: 'active' } });
    if (!campaign) return NextResponse.json({ error: 'No active campaign' }, { status: 400 });

    const newTerritory = await prisma.territory.create({
      data: {
        name,
        level,
        campaignId: campaign.id,
        parentId: parentId || null,
        responsibleUserId: responsibleUserId || null,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null
      }
    });

    await createAuditLog(
        currentUser.id, 
        'CREATE_TERRITORY', 
        'Territory', 
        newTerritory.id, 
        { msg: `Admin creó la zona ${newTerritory.name} (${newTerritory.level})` }
    );

    return NextResponse.json(newTerritory);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Error creating territory' }, { status: 500 });
  }
}
