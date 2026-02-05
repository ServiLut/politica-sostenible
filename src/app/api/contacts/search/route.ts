import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';



export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const territoryId = searchParams.get('territoryId');
    const leaderId = searchParams.get('leaderId');
    const votedStatus = searchParams.get('voted'); // 'true', 'false', or undefined
    
    // Construir filtro base según ROL
    let roleFilter: any = {};

    if (user.role === 'ADMIN') {
        // Sin restricciones
    } else if (user.role === 'COORDINATOR') {
        roleFilter.territoryId = user.territoryId || 'NONE';
    } else if (user.role === 'LEADER') {
        roleFilter.ownerLeaderId = user.id;
    } else {
        roleFilter.id = 'nothing'; // Bloquear otros roles
    }

    // Dynamic Filters
    const dynamicFilters: any[] = [];
    if (territoryId) dynamicFilters.push({ territoryId });
    if (leaderId) dynamicFilters.push({ ownerLeaderId: leaderId });
    
    // Voted Status Filter (Requires joining with ElectoralContact)
    let electoralFilter = {};
    if (votedStatus) {
        const isVoted = votedStatus === 'true';
        electoralFilter = {
            electoralHistory: {
                some: {
                   voted: isVoted
                   // In a real scenario, we should filter by current Election ID too
                   // electionId: currentElectionId 
                }
            }
        };
    }

    const contacts = await prisma.politicalContact.findMany({
      where: {
        AND: [
            roleFilter,
            ...dynamicFilters,
            electoralFilter,
            {
                OR: [
                  { person: { fullName: { contains: q, mode: 'insensitive' } } },
                  { person: { phone: { contains: q } } }
                ]
            }
        ]
      },
      include: {
        person: true,
        territory: true,
        leader: {
            select: { fullName: true }
        },
        electoralHistory: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { voted: true, transportNeed: true }
        }
      },
      take: 50,
      orderBy: { createdAt: 'desc' }
    });

    // Aplanar respuesta para la tabla
    const flatContacts = contacts.map(c => ({
      id: c.id,
      fullName: c.person.fullName || 'Sin Nombre',
      phone: c.person.phone,
      leader: c.leader?.fullName || 'N/A',
      territoryId: c.territoryId,
      territoryName: c.territory?.name || 'Sin Zona',
      status: c.status,
      voted: c.electoralHistory[0]?.voted || false,
      transportNeed: c.electoralHistory[0]?.transportNeed || 'N/A',
      lastContacted: c.lastContacted,
      createdAt: c.createdAt
    }));

    return NextResponse.json(flatContacts);

  } catch (error) {
    console.error('Search Error:', error);
    return NextResponse.json({ error: 'Error searching contacts' }, { status: 500 });
  }
}
