import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';



export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'ADMIN';
    const myTerritoryId = user.territoryId;

    // Filter Logic
    const territoryFilter = isAdmin ? {} : {
        territoryId: myTerritoryId || 'NONE'
    };

    if (!isAdmin && !myTerritoryId) {
         return NextResponse.json([]);
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const contacts = await prisma.politicalContact.findMany({
      where: {
        createdAt: {
          gte: sevenDaysAgo
        },
        ...territoryFilter
      },
      select: {
        createdAt: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Procesar en memoria (Map: "YYYY-MM-DD" -> count)
    const grouped = contacts.reduce((acc: any, curr) => {
      const date = curr.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    const chartData = Object.keys(grouped).map(date => ({
      date,
      count: grouped[date]
    }));

    return NextResponse.json(chartData);

  } catch (error) {
    console.error('Chart Error:', error);
    return NextResponse.json({ error: 'Error fetching chart data' }, { status: 500 });
  }
}
