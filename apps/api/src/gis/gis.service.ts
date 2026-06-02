import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GisService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtiene datos agregados para generar mapas de calor de votantes.
   * Agrupa votantes por ubicación (Puesto de Votación / Coordenadas).
   */
  async getVoterHeatmap(tenantId: string, divisionId?: string) {
    // Nota: En una BD real con miles de datos, usaríamos agregación de PostGIS si estuviera disponible.
    // Aquí simulamos la agrupación por coordenadas de los puestos de votación asociados.
    const votersWithPlaces = await this.prisma.voter.findMany({
      where: { 
        tenantId,
        puestoId: divisionId || undefined,
        puesto: {
           type: 'PUESTO'
        }
      },
      select: {
        id: true,
        puesto: {
          select: {
            name: true,
            code: true,
            // Asumimos que las coordenadas podrían estar en un campo extendido o relacionadas
          }
        }
      }
    });

    // Simulamos la respuesta con coordenadas geográficas (ej: Medellín)
    return votersWithPlaces.map(v => ({
      id: v.id,
      lat: 6.2442 + (Math.random() - 0.5) * 0.1, // Dispersión alrededor de Medellín
      lng: -75.5812 + (Math.random() - 0.5) * 0.1,
      intensity: Math.random() // Para el mapa de calor
    }));
  }

  /**
   * Obtiene puestos de votación con su ubicación geográfica exacta.
   */
  async getSpatialVotingPlaces(municipio: string) {
    return this.prisma.votingPlace.findMany({
      where: {
        municipio: {
          contains: municipio,
          mode: 'insensitive'
        },
        latitud: { not: null },
        longitud: { not: null }
      },
      select: {
        id: true,
        nombre: true,
        latitud: true,
        longitud: true,
        totalMesas: true
      }
    });
  }
}
