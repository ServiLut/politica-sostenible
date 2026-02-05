import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import {  ElectionStatus } from '@prisma/client';

// Instancia local para el ejemplo si no existe global


type ApiHandler = (req: NextRequest, context: any) => Promise<NextResponse>;

interface GuardOptions {
  requireActiveElection?: boolean;
  requireEvidence?: boolean; // Para subida de resultados
  handlePii?: boolean;       // Si maneja Cédulas o Datos Personales
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'SUBMIT';
  resourceName: string;
}

/**
 * Middleware de Seguridad Electoral (ElectionGuard).
 * Intercepta peticiones para garantizar integridad, verdad operativa y cierre de comicios.
 * Actualizado V4.2: Bloqueos de Finalidad y Responsabilidad.
 */
export function withElectionGuard(handler: ApiHandler, options: GuardOptions) {
  return async (req: NextRequest, context: any) => {
    try {
      // 1. Clonar el body para inspección sin consumirlo (stream)
      const body = req.method !== 'GET' ? await req.clone().json() : {};
      
      // Extracción de contexto
      const responsibleId = req.headers.get('x-actor-id') || body.responsibleId || body.metadata?.witnessActorId;
      const electionId = body.electionId || context.params?.electionId;
      const votingTableId = body.votingTableId || body.pollingTableId;

      // ----------------------------------------------------------------------
      // VALIDACIÓN 0: RESPONSABILIDAD OBLIGATORIA (Rule B)
      // ----------------------------------------------------------------------
      // Ninguna evidencia o cambio de estado se acepta sin un responsable trazable.
      if (!responsibleId) {
        console.error(`[Security] Anonymous attempt on ${options.resourceName}`);
        return NextResponse.json({ 
          error: 'SECURITY_BLOCK: Missing Responsible ID. Anonymous actions are forbidden.' 
        }, { status: 401 });
      }

      // ----------------------------------------------------------------------
      // VALIDACIÓN 0.5: FINALIDAD DEL DATO (Rule A - Habeas Data)
      // ----------------------------------------------------------------------
      // Si se está procesando una Cédula (PII), la finalidad debe ser explícita.
      if (options.handlePii || body.nationalId || body.cedula) {
        const purpose = body.processingPurpose || body.finalidad;
        
        if (!purpose || typeof purpose !== 'string' || purpose.trim().length === 0) {
          await logSecurityEvent(responsibleId, 'GDPR_BLOCK', 'Missing Data Processing Purpose', { resource: options.resourceName });
          return NextResponse.json({ 
            error: 'LEGAL_BLOCK: Cannot process National ID without explicit "processingPurpose" (Finalidad).' 
          }, { status: 400 });
        }
      }

      // ----------------------------------------------------------------------
      // VALIDACIÓN 1: ESTADO DE LA ELECCIÓN (Cierre Electoral)
      // ----------------------------------------------------------------------
      if (electionId) {
        const election = await prisma.election.findUnique({
          where: { id: electionId },
          select: { status: true }
        });

        if (!election) {
          return NextResponse.json({ error: 'Election not found' }, { status: 404 });
        }

        // BLOQUEO DURO: Si está cerrada, nadie (ni admin) toca los datos crudos.
        if (election.status === ElectionStatus.CLOSED) {
          // Rule 11.11: Absolute Freeze on Closed Elections
          // Allow only specific read-only or authorized post-closure audits if needed, 
          // but strictly block standard data entry/modification.
          const isMutation = ['CREATE', 'UPDATE', 'DELETE', 'SUBMIT'].includes(options.actionType);
          
          if (isMutation) {
            await logSecurityEvent(responsibleId, 'BLOCKED_ATTEMPT', 'Election is CLOSED. Mutation rejected.', { electionId, action: options.actionType });
            return NextResponse.json({ 
              error: 'ELECTION_CLOSED: The election is officially closed. No further changes are accepted.',
              timestamp: new Date().toISOString()
            }, { status: 403 });
          }
        }

        // Regla: Solo una activa
        if (options.requireActiveElection && election.status !== ElectionStatus.ACTIVE) {
          return NextResponse.json({ error: 'Election is not ACTIVE' }, { status: 400 });
        }
      }

      // ----------------------------------------------------------------------
      // VALIDACIÓN 2: INTEGRIDAD DE MESA Y EVIDENCIA
      // ----------------------------------------------------------------------
      if (votingTableId) {
        const table = await prisma.pollingTable.findUnique({
          where: { id: votingTableId },
          include: { pollingPlace: { include: { election: true } } } // Verificar vínculo
        });

        if (!table) {
          return NextResponse.json({ error: 'Polling Table not found' }, { status: 404 });
        }

        if (electionId && table.pollingPlace.election.id !== electionId) {
          await logSecurityEvent(responsibleId, 'INTEGRITY_VIOLATION', 'Table not linked to Election', { tableId: votingTableId, electionId });
          return NextResponse.json({ error: 'Integrity Error: Table does not belong to this Election' }, { status: 400 });
        }
      }

      // VALIDACIÓN DE EVIDENCIA (E-14)
      if (options.requireEvidence) {
        const { e14PhotoUrl, blurScore } = body;

        // Regla: "Número digitado no vale sin foto"
        if (!e14PhotoUrl || typeof e14PhotoUrl !== 'string') {
          return NextResponse.json({ error: 'EVIDENCE_MISSING: E-14 photo is mandatory.' }, { status: 400 });
        }

        // Regla: Anti-Borrosidad (Hard Block)
        const MIN_SHARPNESS_SCORE = 0.15; 
        if (blurScore < MIN_SHARPNESS_SCORE) {
          await logSecurityEvent(responsibleId, 'QUALITY_REJECT', 'Blurry E-14 rejected', { blurScore });
          return NextResponse.json({ error: 'EVIDENCE_POOR_QUALITY: Image is too blurry for audit.' }, { status: 400 });
        }
      }

      // ----------------------------------------------------------------------
      // 3. INYECCIÓN DE RESPONSABILIDAD
      // ----------------------------------------------------------------------
      req.headers.set('x-validated-responsible-id', responsibleId);

      // Ejecutar el handler real si todo pasa
      return await handler(req, context);

    } catch (error) {
      console.error('ElectionGuard Error:', error);
      return NextResponse.json({ error: 'Internal Security Error' }, { status: 500 });
    }
  };
}

// Helper para logs inmutables (Simulación de escritura en AuditLog)
async function logSecurityEvent(userId: string, action: string, reason: string, meta: any) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity: 'SecurityGuard',
        userId: userId.length === 36 ? userId : undefined, // Solo si es UUID válido de usuario, si es string arbitrario no linkea FK
        details: { reason, ...meta }
      }
    });
  } catch (e) {
    console.error('CRITICAL: AUDIT LOG FAILURE', e);
  }
}
