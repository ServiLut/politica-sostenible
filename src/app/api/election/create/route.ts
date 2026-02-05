import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';



export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { name, date, isActive } = await req.json();

    if (!name || !date) {
        return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    // Campaign Context
    const campaign = await prisma.campaign.findFirst({ where: { status: 'active' } });
    if (!campaign) return NextResponse.json({ error: 'No active campaign' }, { status: 500 });

    // Transaction: Create & Toggle if needed
    const result = await prisma.$transaction(async (tx) => {
        if (isActive) {
            // Close others
            await tx.election.updateMany({
                where: { status: 'ACTIVE', campaignId: campaign.id },
                data: { status: 'CLOSED' }
            });
        }

        const election = await tx.election.create({
            data: {
                name,
                electionDate: new Date(date),
                status: isActive ? 'ACTIVE' : 'DRAFT',
                campaignId: campaign.id
            }
        });

        return election;
    });

    await createAuditLog(user.id, 'CREATE_ELECTION', 'Election', result.id, { 
        name, 
        status: result.status 
    });

    return NextResponse.json(result);

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Error creating election' }, { status: 500 });
  }
}

