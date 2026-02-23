import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class VotingPlacesService {
  private readonly API_URL = 'https://www.datos.gov.co/resource/u9sh-7v8v.json';

  constructor(
    private readonly httpService: HttpService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getVotingPlaces(
    limit: number = 5000,
    offset: number = 0,
    municipio?: string,
  ) {
    const cacheKey = `voting_places_${limit}_${offset}_${municipio || 'all'}`;
    const cachedData = await this.cacheManager.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const params: any = {
      $limit: limit,
      $offset: offset,
    };

    if (municipio) {
      params.municipio = municipio.toUpperCase();
    }

    try {
      const response = await lastValueFrom(
        this.httpService.get(this.API_URL, { params }),
      );

      const mappedData = response.data
        .map((item: any) => ({
          departamento: item.departamento,
          municipio: item.municipio,
          puesto: item.puesto,
          direccion: item.direccion,
          mesas: parseInt(item.mesas, 10) || 0,
          lat: parseFloat(item.latitud) || 0,
          lng: parseFloat(item.longitud) || 0,
        }))
        .filter((item: any) => item.lat !== 0 && item.lng !== 0);

      // Save to cache for an hour
      await this.cacheManager.set(cacheKey, mappedData);

      return mappedData;
    } catch (error: any) {
      throw new Error(`Failed to fetch voting places: ${error.message}`);
    }
  }
}
