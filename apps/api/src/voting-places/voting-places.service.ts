import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VotingPlacesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getVotingPlaces(
    limit: number = 50,
    offset: number = 0,
    municipio?: string,
  ) {
    const cacheKey = `voting_places_db_${limit}_${offset}_${municipio || 'all'}`;
    const cachedData = await this.cacheManager.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    try {
      const where: any = {};
      if (municipio) {
        where.municipio = {
          contains: municipio,
          mode: 'insensitive',
        };
      }

      const [total, data] = await Promise.all([
        this.prisma.votingPlace.count({ where }),
        this.prisma.votingPlace.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { nombre: 'asc' },
        }),
      ]);

      const result = {
        total,
        limit,
        offset,
        data: data.map((item) => ({
          id: item.id,
          departamento: item.departamento,
          municipio: item.municipio,
          puesto: item.nombre,
          direccion: item.direccion,
          mesas: item.totalMesas,
          lat: item.latitud || 0,
          lng: item.longitud || 0,
          codigo: item.codigo,
        })),
      };

      // Save to cache for an hour
      await this.cacheManager.set(cacheKey, result);

      return result;
    } catch (error: any) {
      throw new Error(
        `Failed to fetch voting places from DB: ${error.message}`,
      );
    }
  }
}
