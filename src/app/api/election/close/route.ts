import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';
import { compare } from 'bcryptjs';



export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { pin } = await req.json();

        // PIN Verification
        const secureUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (!secureUser?.pinHash || !(await compare(pin, secureUser.pinHash))) {
            return NextResponse.json({ error: 'PIN de Seguridad Inválido' }, { status: 403 });
        }

        // Close Active Elections
        const activeElections = await prisma.election.findMany({ where: { status: 'ACTIVE' } });
        
        await prisma.election.updateMany({
            where: { status: 'ACTIVE' },
            data: { status: 'CLOSED' }
        });

        // Audit
        await createAuditLog(user.id, 'CLOSE_ELECTION', 'Election', 'ALL', { 
            msg: `CIERRE DEFINITIVO DE ELECCIÓN ejecutado por ${user.fullName}. Base de datos en MODO LECTURA.`,
            affected: activeElections.map(e => e.id)
        });

        return NextResponse.json({ success: true, message: 'Elección Cerrada. Infraestructura bloqueada.' });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'System Error' }, { status: 500 });
    }
}

