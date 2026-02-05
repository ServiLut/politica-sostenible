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

        const { active, pin } = await req.json();

        // Security Check
        const secureUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (!secureUser?.pinHash || !(await compare(pin, secureUser.pinHash))) {
            return NextResponse.json({ error: 'PIN Inválido' }, { status: 403 });
        }

        // Toggle Campaign Mode
        // Assuming single campaign or context aware. 
        // We'll update ALL active campaigns for safety in this scope
        await prisma.campaign.updateMany({
            where: { status: 'active' },
            data: { dDayActive: active }
        });

        await createAuditLog(user.id, 'TOGGLE_DDAY', 'GlobalSettings', 'ALL', { 
            active, 
            msg: `MODO DÍA D ${active ? 'ACTIVADO' : 'DESACTIVADO'} por ${user.fullName}` 
        });

        return NextResponse.json({ success: true, active });

    } catch (e) {
        return NextResponse.json({ error: 'Error toggling mode' }, { status: 500 });
    }
}

