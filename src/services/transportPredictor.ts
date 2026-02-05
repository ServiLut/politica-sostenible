import { prisma } from '@/lib/prisma';



export type TransportNeed = 'A_PIE' | 'REQUIERE_TRANSPORTE' | 'PENDIENTE_GEO';

export interface TransportResult {
  contactId: string;
  distanceMetros: number | null;
  need: TransportNeed;
  territoryId: string | null;
}

export class TransportPredictorService {
  
  /**
   * Fórmula de Haversine para calcular distancia entre dos puntos en la tierra.
   */
  private calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distancia en metros
  }

  /**
   * Procesa un lote de contactos electorales para predecir necesidad de transporte.
   */
  async predictBatch(electionId: string, batchSize: number = 500): Promise<TransportResult[]> {
    const contacts = await prisma.electoralContact.findMany({
      where: { electionId },
      include: {
        pollingPlace: { select: { lat: true, lng: true } },
        territory: { select: { id: true, name: true } }
      },
      take: batchSize
    });

    return contacts.map(contact => {
      // Decimal to Number conversion
      const homeLat = contact.homeLat ? Number(contact.homeLat) : null;
      const homeLng = contact.homeLng ? Number(contact.homeLng) : null;
      
      const placeLat = contact.pollingPlace?.lat ? Number(contact.pollingPlace.lat) : null;
      const placeLng = contact.pollingPlace?.lng ? Number(contact.pollingPlace.lng) : null;

      // Validación de Coordenadas
      if (!homeLat || !homeLng || !placeLat || !placeLng) {
        return {
          contactId: contact.id,
          distanceMetros: null,
          need: 'PENDIENTE_GEO',
          territoryId: contact.territoryId
        };
      }

      const distance = this.calculateHaversine(homeLat, homeLng, placeLat, placeLng);
      
      return {
        contactId: contact.id,
        distanceMetros: Math.round(distance),
        need: distance >= 1000 ? 'REQUIERE_TRANSPORTE' : 'A_PIE',
        territoryId: contact.territoryId
      };
    });
  }

  /**
   * Agrega las necesidades de transporte por territorio para dimensionar flota.
   */
  async aggregateFleetNeeds(electionId: string) {
    const results = await this.predictBatch(electionId, 10000); // Lote grande para análisis
    
    const aggregation: Record<string, { total: number, walk: number, transport: number, pending: number }> = {};

    results.forEach(res => {
      const terrId = res.territoryId || 'UNKNOWN';
      if (!aggregation[terrId]) {
        aggregation[terrId] = { total: 0, walk: 0, transport: 0, pending: 0 };
      }
      
      const stats = aggregation[terrId];
      stats.total++;
      if (res.need === 'A_PIE') stats.walk++;
      else if (res.need === 'REQUIERE_TRANSPORTE') stats.transport++;
      else stats.pending++;
    });

    return aggregation;
  }
}
