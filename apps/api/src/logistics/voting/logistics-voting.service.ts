import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class LogisticsVotingService implements OnModuleInit {
  private readonly logger = new Logger(LogisticsVotingService.name);
  private readonly SOCRATA_API_URL =
    'https://www.datos.gov.co/resource/u9sh-7v8v.json';

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    // We could trigger a background sync here, but for now we'll just have it as a method.
    // The user said "Usa el PrismaService para guardar/actualizar", which implies a sync process.
  }

  async syncFromSocrata() {
    this.logger.log(
      'Iniciando sincronización de puestos de votación desde Socrata...',
    );
    let offset = 0;
    const limit = 5000;
    let totalSynced = 0;

    try {
      while (true) {
        const response = await firstValueFrom(
          this.httpService.get(this.SOCRATA_API_URL, {
            params: {
              $limit: limit,
              $offset: offset,
              $order: ':id',
            },
          }),
        );

        const data = response.data;
        if (!data || data.length === 0) break;

        const operations = data.map((item: any) => {
          const id =
            item.cod_puesto ||
            `${item.departamento}-${item.municipio}-${item.puesto}`;
          return this.prisma.votingPlace.upsert({
            where: { codigo: id },
            update: {
              nombre: item.puesto,
              departamento: item.departamento,
              municipio: item.municipio,
              direccion: item.direccion,
              latitud: item.latitud ? parseFloat(item.latitud) : null,
              longitud: item.longitud ? parseFloat(item.longitud) : null,
              updatedAt: new Date(),
            },
            create: {
              codigo: id,
              nombre: item.puesto,
              departamento: item.departamento,
              municipio: item.municipio,
              direccion: item.direccion,
              latitud: item.latitud ? parseFloat(item.latitud) : null,
              longitud: item.longitud ? parseFloat(item.longitud) : null,
            },
          });
        });

        // Run in chunks to avoid overwhelming the database
        await Promise.all(operations);

        totalSynced += data.length;
        this.logger.log(`Sincronizados ${totalSynced} puestos...`);
        offset += limit;
        if (data.length < limit) break;
      }
      this.logger.log('Sincronización de puestos completada exitosamente.');
      return totalSynced;
    } catch (error) {
      this.logger.error(
        'Error durante la sincronización de Socrata:',
        error.stack,
      );
      throw error;
    }
  }

  async getVotingPlaces(
    page: number = 1,
    limit: number = 50,
    municipio?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (municipio) {
      where.municipio = { contains: municipio, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.votingPlace.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.votingPlace.count({ where }),
    ]);

    // If there are no items in DB, we might want to suggest a sync or trigger one?
    // For now we just return what we have.

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
