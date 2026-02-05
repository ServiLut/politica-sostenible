import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const electionId = searchParams.get('electionId');

    // Security Filter: Define Scope
    let whereClause: any = {};
    
    if (user.role !== 'ADMIN') {
        // 1. Get territories where user is assigned
        let assignedIds: string[] = [];
        if (user.territoryId) {
            assignedIds = [user.territoryId];
        }

        // 2. Filter: Show assigned territory AND its direct children
        if (assignedIds.length > 0) {
            whereClause = {
                OR: [
                    { id: { in: assignedIds } },
                    { parentId: { in: assignedIds } }
                ]
            };
        } else {
            // If user has no territory assigned but is restricted, show nothing
            whereClause = { id: 'non-existent' };
        }
    }

    const territories = await prisma.territory.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        level: true,
        _count: {
          select: { 
            politicalContacts: !electionId ? true : false, 
            electoralContacts: electionId ? { where: { electionId } } : false
          }
        }
      }
    });

    // Transform Data
    const stats = territories.map(t => {
      // @ts-ignore: Dynamic Prisma types can be tricky, safe cast here
      const count = electionId ? (t._count.electoralContacts || 0) : (t._count.politicalContacts || 0);
      
      let status = 'WARNING';
      if (count < 10) status = 'CRITICAL';
      if (count > 50) status = 'SAFE';

      return {
        id: t.id,
        name: t.name,
        level: t.level,
        lat: t.lat ? Number(t.lat) : 0,
        lng: t.lng ? Number(t.lng) : 0,
        count: count,
        status
      };
    });

    return NextResponse.json({
        stats,
        userRole: user.role,
        isRestricted: user.role !== 'ADMIN'
    });

  } catch (error) {
    console.error('Territory Stats Error:', error);
    return NextResponse.json({ error: 'Error fetching stats' }, { status: 500 });
  }
}

