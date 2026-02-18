import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LogisticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Sincroniza un acta E-14. Implementa resolución de conflictos básica.
   */
  async syncE14(data: any) {
    const {
      puestoId,
      mesa,
      candidateVotes,
      totalTableVotes,
      e14ImageUrl,
      tenantId,
      witnessId,
      observations,
    } = data;

    // Buscar si ya existe un reporte para esta mesa en este puesto
    const existing = await this.prisma.witnessReport.findFirst({
      where: { puestoId, mesa, tenantId },
    });

    if (existing) {
      // Si existe y los datos de votos son diferentes, reportar conflicto
      if (
        existing.candidateVotes !== candidateVotes ||
        existing.totalTableVotes !== totalTableVotes
      ) {
        console.warn(
          `[Conflict] Mesa ${mesa} en Puesto ${puestoId} tiene datos discrepantes.`,
        );
        // Podríamos guardar el duplicado con un flag de conflicto en una tabla de auditoría
        throw new ConflictException('CONFLICT');
      }
      // Si son iguales, simplemente ignoramos el duplicado (Idempotencia)
      return existing;
    }

    // Crear el reporte si no existe
    return this.prisma.witnessReport.create({
      data: {
        tenantId,
        witnessId,
        puestoId,
        mesa,
        e14ImageUrl,
        candidateVotes,
        totalTableVotes,
        observations,
        isSynced: true,
      },
    });
  }

  /**
   * Sincroniza un nuevo simpatizante recolectado offline.
   */
  async syncVoter(data: any) {
    const {
      documentId,
      firstName,
      lastName,
      phone,
      email,
      tenantId,
      registrarId,
      puestoId,
    } = data;

    return this.prisma.voter.upsert({
      where: { documentId_tenantId: { documentId, tenantId } },
      update: {
        firstName,
        lastName,
        phone,
        email,
        puestoId,
      },
      create: {
        documentId,
        firstName,
        lastName,
        phone,
        email,
        tenantId,
        registrarId,
        puestoId,
        consentAccepted: true,
      },
    });
  }
}
