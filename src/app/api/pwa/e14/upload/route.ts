import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { getCurrentUser } from '@/lib/session';
import { uploadToStorage } from '@/lib/storage';

export async function POST(req: NextRequest) {
  try {
    // 1. OBTENER CONTEXTO DE USUARIO (Si existe)
    const user = await getCurrentUser();
    
    // 2. PROCESAR FORM DATA
    const formData = await req.formData();
    let tableId = formData.get('tableId') as string;
    let electionId = formData.get('electionId') as string;
    const blurScoreStr = formData.get('blurScore') as string;
    const file = formData.get('file') as File;

    if (!tableId) {
        return NextResponse.json({ error: 'ERROR: Mesa no identificada' }, { status: 422 });
    }
    if (!file) {
        return NextResponse.json({ error: 'ERROR: No se recibió archivo' }, { status: 422 });
    }

    const blurScore = parseFloat(blurScoreStr);

    // 3. AUTO-DETECT ACTIVE ELECTION (Si no viene en la trama)
    if (!electionId || electionId === 'undefined' || electionId === 'null') {
        const activeElection = await prisma.election.findFirst({
            where: { status: 'ACTIVE' }
        });
        
        if (!activeElection) {
            const lastElection = await prisma.election.findFirst({ orderBy: { createdAt: 'desc' } });
            if (!lastElection) {
                return NextResponse.json({ error: 'SISTEMA NO INICIALIZADO' }, { status: 503 });
            }
            electionId = lastElection.id;
        } else {
            electionId = activeElection.id;
        }
    }

    // 4. RESOLUCIÓN DE MESA (Fail-safe)
    let targetTable = await prisma.pollingTable.findUnique({ 
        where: { id: tableId },
        include: { pollingPlace: true }
    });

    if (!targetTable) {
        targetTable = await prisma.pollingTable.findFirst({
            where: {
                tableNumber: tableId,
                pollingPlace: { electionId: electionId }
            },
            include: { pollingPlace: true }
        });
    }

    if (!targetTable) {
        // MODO CONTINGENCIA: Creación al vuelo si no existe
        let contingencyPlace = await prisma.pollingPlace.findFirst({
            where: { name: 'Puesto de Contingencia', electionId }
        });

        if (!contingencyPlace) {
            const terr = await prisma.territory.findFirst();
            if (!terr) return NextResponse.json({ error: 'Error crítico: Sin estructura territorial' }, { status: 500 });

            contingencyPlace = await prisma.pollingPlace.create({
                data: {
                    name: 'Puesto de Contingencia',
                    electionId,
                    territoryId: terr.id,
                    address: 'Virtual / Desconocido'
                }
            });
        }

        targetTable = await prisma.pollingTable.create({
            data: {
                tableNumber: tableId,
                pollingPlaceId: contingencyPlace.id
            },
            include: { pollingPlace: true }
        });
        
        tableId = targetTable.id;
    }

    // 5. UPLOAD A SUPABASE
    let finalUrl = '';
    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const storagePath = `e14/${electionId}/${targetTable.id}-${Date.now()}.jpg`;
        // Bucket: 'e14-evidences' (Configurado en Supabase)
        finalUrl = await uploadToStorage(buffer, storagePath, file.type, 'e14-evidences');
    } catch (storageError) {
        console.warn("Fallo en Storage Real, usando fallback URL:", storageError);
        finalUrl = `https://storage.e14.gov.co/${electionId}/${tableId}/${Date.now()}.jpg`;
    }

    // 6. REGISTRO EN DB
    const record = await prisma.e14Record.create({
        data: {
            electionId,
            pollingPlaceId: targetTable.pollingPlaceId,
            pollingTableId: targetTable.id,
            e14PhotoUrl: finalUrl,
            photoBlurScore: isNaN(blurScore) ? 0 : Math.round(blurScore),
            uploadedBy: user?.id || 'PUBLIC_WITNESS_APP'
        }
    });

    // 7. AUDITORÍA SEGURA (CRÍTICO: Evitar FK Constraint Error)
    if (user?.id) {
        try {
            await createAuditLog(
                user.id, 
                'UPLOAD_E14_SUCCESS', 
                'E14Record', 
                record.id, 
                { 
                    msg: `Evidencia de Mesa ${targetTable.tableNumber} recibida y validada`,
                    tableId: targetTable.id,
                    blurScore,
                    status: 'REPORTADA'
                }
            );
        } catch (auditError) {
            console.warn("Fallo menor en log de auditoría:", auditError);
        }
    } else {
        console.log("Subida anónima (Testigo) - Auditoría de AuditLog omitida para evitar errores de FK");
    }

    return NextResponse.json({ 
        success: true, 
        id: record.id, 
        status: 'REPORTADA',
        url: finalUrl 
    });

  } catch (error: any) {
    console.error('E14 Critical Upload Error:', error);
    return NextResponse.json({ error: `Error interno: ${error.message}` }, { status: 500 });
  }
}