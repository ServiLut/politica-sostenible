import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';



export async function GET(req: NextRequest) {
  try {
      const territories = await prisma.territory.findMany({
        include: {
            parent: { select: { id: true, name: true } },
            responsible: { select: { id: true, fullName: true } },
            _count: { select: { subTerritories: true } }
        },
        orderBy: { name: 'asc' }
      });
      
      // Transform for easier frontend consumption
      const data = (territories as any[]).map(t => ({
          id: t.id,
          name: t.name,
          level: t.level,
          parentId: t.parentId,
          parentName: t.parent?.name || '-',
          responsibleId: t.responsibleUserId,
          responsibleName: t.responsible?.fullName || 'Sin Asignar',
          childrenCount: t._count?.subTerritories || 0,
          lat: t.lat,
          lng: t.lng
      }));

      return NextResponse.json(data);
  } catch (e) {
      return NextResponse.json({ error: 'Error fetching territories' }, { status: 500 });
  }
}
