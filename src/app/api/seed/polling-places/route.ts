import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';



export async function GET(req: NextRequest) {
  try {
    const activeElection = await prisma.election.findFirst({
        where: { status: 'ACTIVE' }
    });

    if (!activeElection) {
        return NextResponse.json({ error: 'No active election found' }, { status: 400 });
    }

    const territories = await prisma.territory.findMany();
    let createdCount = 0;

    for (const territory of territories) {
        // Check if places exist
        const count = await prisma.pollingPlace.count({
            where: { territoryId: territory.id }
        });

        if (count === 0) {
            // Seed 2 places
            await prisma.pollingPlace.createMany({
                data: [
                    {
                        name: `Institución Educativa ${territory.name}`,
                        territoryId: territory.id,
                        electionId: activeElection.id,
                        address: 'Calle Principal # 10-20'
                    },
                    {
                        name: `Coliseo Deportivo ${territory.name}`,
                        territoryId: territory.id,
                        electionId: activeElection.id,
                        address: 'Carrera 5 # 8-90'
                    }
                ]
            });
            createdCount += 2;
        }
    }

    return NextResponse.json({ 
        success: true, 
        message: `Seeded ${createdCount} polling places across ${territories.length} territories.` 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

