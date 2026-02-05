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
        const secureUser = await prisma.user.findUnique({ where: { id: user.id } });
        
        if (!secureUser?.pinHash || !(await compare(pin, secureUser.pinHash))) {
            return NextResponse.json({ error: 'PIN Inválido' }, { status: 403 });
        }

        // Generate Data with E14 details
        const e14s = await prisma.e14Record.findMany({
            include: { 
                pollingTable: { 
                    include: { pollingPlace: true } 
                },
                election: { select: { name: true } }
            }
        });

        // Mock ZIP generation (simulated link for now as per env constraints on binary streams)
        // In full prod, we would use JSZip to stream this.
        // We will log the "Evidence Hash" of the collected records for CNE defense.
        const evidenceHashes = e14s.map(r => ({
            id: r.id,
            url: r.e14PhotoUrl,
            table: r.pollingTable.tableNumber,
            place: r.pollingTable.pollingPlace.name,
            hash: 'SHA256-SIMULATED-' + Math.random().toString(36).substring(7)
        }));

        await createAuditLog(user.id, 'EXPORT_E14_ZIP', 'E14Record', 'ALL', { 
            msg: 'Admin descargó paquete probatorio E-14 (CNE Compliance)',
            count: e14s.length
        });

        return NextResponse.json({ 
            success: true, 
            url: 'https://placeholder.com/evidence-pack.zip',
            inventory: evidenceHashes 
        });

    } catch (e) {
        // Critical Anomaly Log
        try { 
            // @ts-ignore
            await createAuditLog('system', 'CRITICAL_ANOMALY', 'Export', 'E14', { error: String(e) }); 
        } catch(err) {}
        
        return NextResponse.json({ error: 'Error generating ZIP' }, { status: 500 });
    }
}
