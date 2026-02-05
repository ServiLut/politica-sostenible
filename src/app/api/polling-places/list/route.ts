import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';



export async function GET(req: NextRequest) {
  try {
    const activeElection = await prisma.election.findFirst({
        where: { status: 'ACTIVE' }
    });

    if (!activeElection) {
        return NextResponse.json([]);
    }

    const { searchParams } = new URL(req.url);
    const territoryId = searchParams.get('territoryId') || searchParams.get('zone_id');

    const where: any = { electionId: activeElection.id };
    if (territoryId) {
        where.territoryId = territoryId;
    }

    const pollingPlaces = await prisma.pollingPlace.findMany({
      where,
      select: { id: true, name: true, address: true },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(pollingPlaces);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching polling places' }, { status: 500 });
  }
}

