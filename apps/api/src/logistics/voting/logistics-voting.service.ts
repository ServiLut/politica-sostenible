import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LogisticsVotingService implements OnModuleInit {
  private readonly logger = new Logger(LogisticsVotingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Initialization logic if needed
  }

  async getVotingPlaces(
    page: number = 1,
    limit: number = 50,
    municipio?: string,
    departamento?: string,
    nombre?: string,
  ) {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (municipio) {
        where.municipio = { equals: municipio, mode: 'insensitive' };
      }
      if (departamento) {
        where.departamento = { equals: departamento, mode: 'insensitive' };
      }
      if (nombre) {
        where.nombre = { contains: nombre, mode: 'insensitive' };
      }

      this.logger.log(
        `Consultando puestos con filtro: ${JSON.stringify(where)}`,
      );

      const [items, total] = await Promise.all([
        this.prisma.votingPlace.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            nombre: true,
            departamento: true,
            municipio: true,
            direccion: true,
            latitud: true,
            longitud: true,
          },
          orderBy: { departamento: 'asc' },
        }),
        this.prisma.votingPlace.count({ where }),
      ]);

      this.logger.log(
        `Se encontraron ${items.length} resultados de un total de ${total}`,
      );

      // Adaptar la respuesta para que no falle si faltan campos
      const itemsWithTotals = items.map((item) => {
        return {
          ...item,
          totalMesas: 0,
          totalMesasRegistradas: 0,
          totalVotosCandidato: 0,
          totalVotosMesa: 0,
        };
      });

      return {
        items: itemsWithTotals,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(
        'Error al obtener puestos de votación de la DB:',
        error,
      );
      throw error;
    }
  }

  async getUniqueDepartments() {
    const departments = await this.prisma.votingPlace.findMany({
      distinct: ['departamento'],
      select: { departamento: true },
      orderBy: { departamento: 'asc' },
    });
    return departments.map((d) => d.departamento);
  }

  async getUniqueMunicipalities(departamento: string) {
    const municipalities = await this.prisma.votingPlace.findMany({
      where: { departamento: { equals: departamento, mode: 'insensitive' } },
      distinct: ['municipio'],
      select: { municipio: true },
      orderBy: { municipio: 'asc' },
    });
    return municipalities.map((m) => m.municipio);
  }

  async addOrUpdateTableResult(
    votingPlaceId: string,
    mesaNumero: number,
    votosCandidato: number,
    votosTotales: number,
  ) {
    return this.prisma.tableResult.upsert({
      where: {
        votingPlaceId_mesaNumero: {
          votingPlaceId,
          mesaNumero,
        },
      },
      update: {
        votosCandidato,
        votosTotales,
      },
      create: {
        votingPlaceId,
        mesaNumero,
        votosCandidato,
        votosTotales,
      },
    });
  }

  async createVotingPlace(data: {
    nombre: string;
    departamento: string;
    municipio: string;
    direccion: string;
    totalMesas?: number;
    latitud?: number;
    longitud?: number;
  }) {
    const codigo = `${data.departamento}-${data.municipio}-${data.nombre}`
      .replace(/\s+/g, '-')
      .toLowerCase();

    return this.prisma.votingPlace.create({
      data: {
        ...data,
        codigo,
      },
    });
  }

  async getTableResults(votingPlaceId: string) {
    return this.prisma.tableResult.findMany({
      where: { votingPlaceId },
      orderBy: { mesaNumero: 'asc' },
    });
  }
}
