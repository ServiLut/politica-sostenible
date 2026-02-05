import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';



export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const getAll = searchParams.get('all') === 'true';

    // If 'all' requested, verify admin
    if (getAll) {
        const user = await getCurrentUser();
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
    }

    const elections = await prisma.election.findMany({
      where: getAll ? {} : { status: 'ACTIVE' },
      select: { 
          id: true, 
          name: true, 
          electionDate: true, 
          status: true 
      },
      orderBy: { electionDate: 'desc' }
    });
    return NextResponse.json(elections);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching elections' }, { status: 500 });
  }
}
