import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { compare } from 'bcryptjs';
import { signSessionToken } from '@/lib/auth';
import { cookies } from 'next/headers';



export async function POST(req: NextRequest) {
  try {
    const { fullName, pin } = await req.json();
    console.log(`[LOGIN] Attempt for: ${fullName}`);

    if (!fullName || !pin) {
      return NextResponse.json({ error: 'Faltan credenciales' }, { status: 400 });
    }

    // 1. Buscar Usuario
    const user = await prisma.user.findFirst({
      where: { fullName: fullName }
    });
    console.log(`[LOGIN] User lookup result: ${user ? 'Found' : 'Not Found'}`);

    if (!user) {
      console.log(`[LOGIN] User not found: ${fullName}`);
      const { createAuditLog } = await import('@/lib/audit');
      await createAuditLog('SYSTEM', 'LOGIN_FAILED', 'User', 'unknown', { fullName, reason: 'User not found' });
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    // 2. Validar Estado
    if (!user.isActive) {
      console.log(`[LOGIN] User inactive: ${user.id}`);
      const { createAuditLog } = await import('@/lib/audit');
      await createAuditLog(user.id, 'LOGIN_FAILED', 'User', user.id, { reason: 'Inactive' }, { id: user.id, role: user.role });
      return NextResponse.json({ error: 'Usuario inactivo. Contacte al Admin.' }, { status: 403 });
    }

    // 3. Validar PIN
    if (!user.pinHash) {
      return NextResponse.json({ error: 'PIN no configurado' }, { status: 403 });
    }

    console.log(`[LOGIN] Comparing PIN for user: ${user.id}...`);
    const start = Date.now();
    const isPinValid = await compare(pin, user.pinHash);
    const duration = Date.now() - start;
    console.log(`[LOGIN] PIN comparison took ${duration}ms`);

    if (!isPinValid) {
      const { createAuditLog } = await import('@/lib/audit');
      await createAuditLog(user.id, 'LOGIN_FAILED', 'User', user.id, { reason: 'Invalid PIN' }, { id: user.id, role: user.role });
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    // 4. Generar Sesión
    const token = await signSessionToken({
      userId: user.id,
      role: user.role,
      orgId: user.organizationId
    });

    // AUDIT LOG
    console.log(`[LOGIN] Success. Creating audit log for ${user.id}`);
    const { createAuditLog } = await import('@/lib/audit');
    // Non-blocking success log
    createAuditLog(user.id, 'LOGIN', 'Session', user.id, { ip: req.ip || 'unknown' }, { id: user.id, role: user.role })
      .catch(e => console.error('Delayed Audit Log Error:', e));

    // 5. Guardar Cookie Segura
    cookies().set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 1 día
      path: '/',
    });

    console.log(`[LOGIN] Sending success response for ${user.id}`);
    return NextResponse.json({ 
      success: true, 
      user: { id: user.id, name: user.fullName, role: user.role } 
    });

  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

