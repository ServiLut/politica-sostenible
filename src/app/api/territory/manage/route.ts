import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';
import { compare } from 'bcryptjs';



export async function DELETE(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { id, pin } = await req.json();

        // 1. PIN Security Check
        const secureUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (!secureUser?.pinHash || !(await compare(pin, secureUser.pinHash))) {
            return NextResponse.json({ error: 'PIN de seguridad inválido' }, { status: 403 });
        }

        // 2. Dependency Check
        const territory = await prisma.territory.findUnique({ 
            where: { id },
            include: { _count: { select: { subTerritories: true, politicalContacts: true } } }
        });

        if (!territory) return NextResponse.json({ error: 'Territorio no encontrado' }, { status: 404 });

        if (territory._count.subTerritories > 0) {
            return NextResponse.json({ error: 'No se puede eliminar: Tiene zonas dependientes (Hijos).' }, { status: 400 });
        }
        if (territory._count.politicalContacts > 0) {
            return NextResponse.json({ error: 'No se puede eliminar: Tiene contactos asignados.' }, { status: 400 });
        }

        // 3. Delete
        await prisma.territory.delete({ where: { id } });

        // 4. Audit
        await createAuditLog(user.id, 'DELETE_TERRITORY', 'Territory', id, { 
            msg: `Admin modificó la estructura territorial eliminando ${territory.name}` 
        });

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Error deleting territory' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    try {
        const { id, name, level, parentId, responsibleUserId, lat, lng } = await req.json();

        const updated = await prisma.territory.update({
            where: { id },
            data: {
                name,
                level,
                parentId: parentId || null,
                responsibleUserId: responsibleUserId || null,
                lat: lat ? parseFloat(lat) : null,
                lng: lng ? parseFloat(lng) : null
            }
        });

        await createAuditLog(user.id, 'UPDATE_TERRITORY', 'Territory', id, { 
            msg: `Admin modificó la estructura territorial en ${updated.name}` 
        });

        return NextResponse.json(updated);

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Error updating territory' }, { status: 500 });
    }
}

