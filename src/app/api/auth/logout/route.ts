import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';

export async function POST() {
  const cookieStore = cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) {
        // Log Logout
        await createAuditLog(payload.userId as string, 'LOGOUT', 'Session', undefined, { success: true });
    }
  }

  cookieStore.delete('auth_token');
  
  return NextResponse.json({ success: true, message: 'Sesión finalizada' });
}
