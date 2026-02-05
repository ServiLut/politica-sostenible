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

    const { amount } = await req.json();
    const newBudget = parseFloat(amount);

    if (isNaN(newBudget) || newBudget < 0) {
        return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Update Organization Budget
    // Assuming single organization for now or user.organizationId
    const updatedOrg = await prisma.organization.update({
        where: { id: user.organizationId },
        data: { budget: newBudget }
    });

    await createAuditLog(user.id, 'UPDATE_BUDGET', 'Organization', user.organizationId, { 
        oldBudget: 'Unknown', 
        newBudget 
    });

    return NextResponse.json({ success: true, budget: updatedOrg.budget });

  } catch (error) {
    console.error('Update Budget Error:', error);
    return NextResponse.json({ error: 'Error updating budget' }, { status: 500 });
  }
}

