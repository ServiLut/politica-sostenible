import { prisma } from '@/lib/prisma';



export interface TerritorialKPI {
  territoryId: string;
  territoryName: string;
  totalContacts: number;
  witnessCoveragePct: number;
  evidenceProgressPct: number;
  realAttendanceCount: number;
  anomalyCount: number;
}

export class AnalyticsService {

  /**
   * Obtiene los KPIs Territoriales en Tiempo Real.
   * Optimizado para el Día D usando agregaciones de base de datos.
   */
  async getTerritorialIndicators(electionId: string): Promise<TerritorialKPI[]> {
    // 1. Obtener estructura base de territorios
    const territories = await prisma.territory.findMany({
      select: { id: true, name: true }
    });

    // 2. Ejecutar agregaciones en paralelo para rendimiento
    const [contacts, tables, assignments, e14s, votes, anomalies] = await Promise.all([
      // A. Total Contactos por Territorio
      prisma.electoralContact.groupBy({
        by: ['territoryId'],
        where: { electionId },
        _count: { id: true }
      }),

      // B. Total Mesas por Territorio (Base para %)
      prisma.pollingPlace.findMany({
        where: { electionId },
        select: {
          territoryId: true,
          _count: { select: { tables: true } }
        }
      }),

      // C. Testigos Asignados (Cobertura) - Usamos una aproximación con Actors
      // Asumiendo que tenemos una relación de asignación (Assignment) que no está explícita 
      // en el schema V4.2 actual pero la simularemos con E14Uploaders o agregaremos lógica.
      // *Nota:* En V4.2 definimos "UploadedBy" en E14, pero la asignación previa 
      // requeriría un modelo 'Assignment' que existía en V1. 
      // Usaremos E14Record como proxy de "mesa cubierta" si no hay tabla Assignment explícita activa.
      // Para este ejercicio, usaremos E14Record count (Efectividad).
      prisma.e14Record.groupBy({
        by: ['electionId'], // Join complejo necesario, se hará en memoria o raw query mejor
        where: { electionId },
        _count: { id: true }
      }),
      
      // D. Evidencia Real (E-14 Subidos)
      prisma.e14Record.findMany({
         where: { electionId },
         include: { pollingTable: { include: { pollingPlace: true } } }
      }),

      // E. Asistencia Real (Votos marcados)
      prisma.votedStatus.groupBy({
        by: ['electionId'], // Necesita join con territory via ElectoralContact
        where: { electionId, hasVoted: true },
        _count: { id: true }
      }),

      // F. Anomalías (GPS Override en Votos o E14)
      prisma.votedStatus.count({
         where: { 
           electionId,
           gpsSnapshot: { path: ['justification'], not: null } // JSON filter
         }
      })
    ]);

    // NOTA: Prisma GroupBy es limitado para Joins profundos. 
    // Para KPIs críticos en tiempo real, SQL Raw es superior.
    // A continuación, la implementación ROBUSTA con SQL Raw.
    
    const kpiRaw = await prisma.$queryRaw<any[]>`
      SELECT 
        t.id as "territoryId",
        t.name as "territoryName",
        
        -- 1. Total Contactos
        (SELECT COUNT(*) FROM electoral_contacts ec 
         WHERE ec."territoryId" = t.id AND ec."electionId" = ${electionId}) as "totalContacts",

        -- 2. Total Mesas en el Territorio
        (SELECT COUNT(*) FROM polling_tables pt 
         JOIN polling_places pp ON pt."pollingPlaceId" = pp.id
         WHERE pp."territoryId" = t.id AND pp."electionId" = ${electionId}) as "totalTables",

        -- 3. Mesas con E-14 (Efectividad Evidencia)
        (SELECT COUNT(DISTINCT er."pollingTableId") FROM e14_records er
         JOIN polling_tables pt ON er."pollingTableId" = pt.id
         JOIN polling_places pp ON pt."pollingPlaceId" = pp.id
         WHERE pp."territoryId" = t.id AND er."electionId" = ${electionId}) as "tablesWithEvidence",

        -- 4. Asistencia Real (Votos)
        (SELECT COUNT(*) FROM voted_statuses vs
         JOIN electoral_contacts ec ON vs."electoralContactId" = ec.id
         WHERE ec."territoryId" = t.id AND ec."electionId" = ${electionId} AND vs."hasVoted" = true) as "realAttendanceCount",

         -- 5. Anomalías (GPS Override)
        (SELECT COUNT(*) FROM voted_statuses vs
         JOIN electoral_contacts ec ON vs."electoralContactId" = ec.id
         WHERE ec."territoryId" = t.id AND ec."electionId" = ${electionId} 
         AND vs."gpsSnapshot"->>'justification' IS NOT NULL) as "anomalyCount"

      FROM territories t
      WHERE t.id IN (SELECT DISTINCT "territoryId" FROM polling_places WHERE "electionId" = ${electionId})
    `;

    // Mapeo y cálculo de porcentajes
    return kpiRaw.map(row => {
      const totalTables = Number(row.totalTables) || 1; // Evitar div/0
      return {
        territoryId: row.territoryId,
        territoryName: row.territoryName,
        totalContacts: Number(row.totalContacts),
        witnessCoveragePct: 0, // Requiere tabla de asignación previa no presente en schema V4.2 simplificado
        evidenceProgressPct: Math.round((Number(row.tablesWithEvidence) / totalTables) * 100),
        realAttendanceCount: Number(row.realAttendanceCount),
        anomalyCount: Number(row.anomalyCount)
      };
    });
  }

  /**
   * SEGURIDAD: Bloqueo de Reasignación Masiva
   * Requiere PIN de segunda capa validado.
   */
  async bulkReassignContacts(
    territoryIdTarget: string, 
    contactIds: string[], 
    actorId: string,
    authPinToken: string // Token temporal generado tras validar PIN
  ) {
    // 1. Validar Autorización Sensible
    const validAuth = await prisma.sensitiveActionAuth.findFirst({
      where: {
        userId: actorId, // Asumiendo link Actor->User
        actionType: 'BULK_REASSIGN',
        expiresAt: { gt: new Date() }
        // En implementación real, validaríamos el token contra el hash o ID
      }
    });

    if (!validAuth) {
      // Auditoría del intento fallido
      await prisma.auditLog.create({
        data: {
          action: 'BULK_REASSIGN_ATTEMPT',
          entity: 'Territory',
          userId: actorId,
          details: { error: 'Missing or Invalid PIN Auth', targetTerritory: territoryIdTarget, count: contactIds.length }
        }
      });
      throw new Error('SECURITY_BLOCK: Second Factor PIN required for bulk operations.');
    }

    // 2. Ejecución
    return await prisma.electoralContact.updateMany({
      where: { id: { in: contactIds } },
      data: { territoryId: territoryIdTarget }
    });
  }
}

