import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hash } from 'bcryptjs';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'COORDINATOR')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    include: {
      territory: { select: { id: true, name: true } },
      reportsTo: { select: { fullName: true } }
    },
    orderBy: [
        { isActive: 'desc' }, // Activos primero
        { createdAt: 'desc' }
    ]
  });

  const safeUsers = users.map(u => ({
    ...u,
    territories: u.territory?.name || '',
    territoryId: u.territoryId || '',
  }));

  return NextResponse.json(safeUsers);
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { fullName, role, pin, territoryId, reportsToId, email } = await req.json();
    
    // Validación PIN (Backend backup)
    if (!pin || pin.length !== 4) {
         return NextResponse.json({ error: 'El PIN debe ser de 4 dígitos' }, { status: 400 });
    }

    const pinHash = await hash(pin, 10);
    const organizationId = currentUser.organizationId;

    const newUser = await prisma.user.create({
      data: {
        fullName,
        role,
        email: email || null,
        pinHash,
        organizationId,
        isActive: true,
        territoryId: territoryId || null,
        reportsToId: reportsToId || null
      }
    });

    // AUDITORÍA DE CREACIÓN (Ref: Paso 11.4)
    await createAuditLog(
        currentUser.id, 
        'CREATE_USER', 
        'User', 
        newUser.id, 
        { 
            msg: `Admin ${currentUser.fullName} creó al usuario ${newUser.fullName} con rol ${newUser.role}`,
            role: newUser.role 
        }
    );

    return NextResponse.json({ success: true, userId: newUser.id });

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Error creating user' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { userId, action } = await req.json();
        
        if (action === 'deactivate') {
            // PROTOCOLO DE SALIDA (Ref: Paso 11.7)
            if (userId === currentUser.id) {
                return NextResponse.json({ error: 'No puedes desactivarte a ti mismo' }, { status: 400 });
            }

            const targetUser = await prisma.user.update({
                where: { id: userId },
                data: { isActive: false }
            });

            // Auditoría de Salida
            await createAuditLog(
                currentUser.id,
                'DEACTIVATE_USER',
                'User',
                targetUser.id,
                {
                    msg: `Admin ${currentUser.fullName} DESACTIVÓ al usuario ${targetUser.fullName}. Sesiones destruidas.`,
                    action: 'PROTOCOL_EXIT'
                }
            );

            return NextResponse.json({ success: true, message: 'Usuario desactivado y sesiones revocadas' });
        }
        
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Error updating user' }, { status: 500 });
    }
}
