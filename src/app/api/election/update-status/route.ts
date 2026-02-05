import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';



export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id, status } = await req.json();

    // Logic: If setting to ACTIVE, close others
    const result = await prisma.$transaction(async (tx) => {
        if (status === 'ACTIVE') {
            await tx.election.updateMany({
                where: { status: 'ACTIVE', id: { not: id } },
                data: { status: 'CLOSED' }
            });
        }

        const updated = await tx.election.update({
            where: { id },
            data: { status }
        });

        return updated;
    });

    await createAuditLog(user.id, 'UPDATE_ELECTION_STATUS', 'Election', id, { status });

    return NextResponse.json(result);

  } catch (e) {
    console.error('Update Election Status Error:', e);
    return NextResponse.json({ error: 'Error updating election' }, { status: 500 });
  }
}

