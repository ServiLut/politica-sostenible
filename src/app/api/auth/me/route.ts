import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Retornamos info segura para el frontend
  return NextResponse.json({
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    territoryId: user.territoryId
  });
}
