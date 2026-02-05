import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { compare } from 'bcryptjs';
import { signSessionToken } from '@/lib/auth';
import { cookies } from 'next/headers';



export async function POST(req: NextRequest) {
  try {
    const { fullName, pin } = await req.json();

    if (!fullName || !pin) {
      return NextResponse.json({ error: 'Faltan credenciales' }, { status: 400 });
    }

    // 1. Buscar Usuario
    // Nota: En producción, fullName puede no ser único. Idealmente usar email o phone.
    // Para V4.2 contexto CRM Político, se usa fullName como identificador rápido.
    const user = await prisma.user.findFirst({
      where: { fullName: fullName }
    });

    if (!user) {
      const { createAuditLog } = await import('@/lib/audit');
      await createAuditLog('SYSTEM', 'LOGIN_FAILED', 'User', 'unknown', { fullName, reason: 'User not found' });
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    // 2. Validar Estado
    if (!user.isActive) {
      const { createAuditLog } = await import('@/lib/audit');
      await createAuditLog(user.id, 'LOGIN_FAILED', 'User', user.id, { reason: 'Inactive' });
      return NextResponse.json({ error: 'Usuario inactivo. Contacte al Admin.' }, { status: 403 });
    }

    // 3. Validar PIN
    if (!user.pinHash) {
      return NextResponse.json({ error: 'PIN no configurado' }, { status: 403 });
    }

    const isPinValid = await compare(pin, user.pinHash);

    if (!isPinValid) {
      const { createAuditLog } = await import('@/lib/audit');
      await createAuditLog(user.id, 'LOGIN_FAILED', 'User', user.id, { reason: 'Invalid PIN' });
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    // 4. Generar Sesión
    const token = await signSessionToken({
      userId: user.id,
      role: user.role,
      orgId: user.organizationId
    });

    // AUDIT LOG
    const { createAuditLog } = await import('@/lib/audit');
    await createAuditLog(user.id, 'LOGIN', 'Session', user.id, { ip: req.ip || 'unknown' });

    // 5. Guardar Cookie Segura
    cookies().set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 1 día
      path: '/',
    });

    return NextResponse.json({ 
      success: true, 
      user: { id: user.id, name: user.fullName, role: user.role } 
    });

  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

