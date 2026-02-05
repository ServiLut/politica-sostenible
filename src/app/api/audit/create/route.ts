import { NextRequest, NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const { userId, action, entity, entityId, details } = await req.json();
    
    // Simple validation
    if (!userId || !action) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    await createAuditLog(userId, action, entity, entityId, details);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Error logging' }, { status: 500 });
  }
}
