import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    // SECURITY CHECK: Only ADMIN can approve mass messages
    if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized: Admin privileges required for mass approval' }, { status: 403 });
    }

    // Mock logic for mass approval
    // In a real scenario, this would update many rows in Prisma
    const { batchId } = await req.json();

    await createAuditLog(user.id, 'APPROVE_MASS_MESSAGES', 'MessageBatch', batchId, { 
        msg: `Admin ${user.fullName} aprobó envío masivo.` 
    });

    return NextResponse.json({ success: true, message: 'Batch approved for dispatch' });

  } catch (error) {
    return NextResponse.json({ error: 'Error approving messages' }, { status: 500 });
  }
}
