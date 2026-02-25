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
          include: {
            tables: true,
          },
          orderBy: { departamento: 'asc' },
        }),
        this.prisma.votingPlace.count({ where }),
      ]);

      this.logger.log(
        `Se encontraron ${items.length} resultados de un total de ${total}`,
      );

      const itemsWithTotals = items.map((item) => {
        const totalMesasRegistradas = item.tables.length;
        const totalVotosCandidato = item.tables.reduce(
          (acc, t) => acc + t.votosCandidato,
          0,
        );
        const totalVotosBlanco = item.tables.reduce(
          (acc, t) => acc + t.votosBlanco,
          0,
        );
        const totalVotosMesa = item.tables.reduce(
          (acc, t) => acc + t.votosTotales,
          0,
        );

        return {
          id: item.id,
          nombre: item.nombre,
          departamento: item.departamento,
          municipio: item.municipio,
          direccion: item.direccion,
          totalMesas: item.totalMesas,
          isComplete: item.isComplete,
          totalMesasRegistradas,
          totalVotosCandidato,
          totalVotosBlanco,
          totalVotosMesa,
          tables: item.tables,
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
    votosBlanco: number,
    votosTotales: number,
  ) {
    this.logger.log(
      `Upserting table result: placeId=${votingPlaceId}, mesa=${mesaNumero}, votos=${votosCandidato}, blanco=${votosBlanco}, totales=${votosTotales}`,
    );
    try {
      // Usar una transacción para asegurar consistencia
      return await this.prisma.$transaction(async (tx) => {
        const result = await tx.tableResult.upsert({
          where: {
            votingPlaceId_mesaNumero: {
              votingPlaceId,
              mesaNumero,
            },
          },
          update: {
            votosCandidato,
            votosBlanco,
            votosTotales,
          },
          create: {
            votingPlaceId,
            mesaNumero,
            votosCandidato,
            votosBlanco,
            votosTotales,
          },
        });

        // Actualizar el total de mesas del puesto si es 0 o menor al número reportado
        const station = await tx.votingPlace.findUnique({
          where: { id: votingPlaceId },
          select: { totalMesas: true },
        });

        if (
          station &&
          (station.totalMesas === 0 || station.totalMesas < mesaNumero)
        ) {
          await tx.votingPlace.update({
            where: { id: votingPlaceId },
            data: { totalMesas: Math.max(station.totalMesas, mesaNumero) },
          });
        }

        this.logger.log(`Upsert exitoso: ${result.id}`);
        return result;
      });
    } catch (error) {
      this.logger.error(`Error en addOrUpdateTableResult: ${error.message}`);
      throw error;
    }
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

  async markAsComplete(votingPlaceId: string, isComplete: boolean) {
    return this.prisma.votingPlace.update({
      where: { id: votingPlaceId },
      data: { isComplete },
    });
  }

  async updateVotingPlace(
    id: string,
    data: { totalMesas?: number; nombre?: string; direccion?: string },
  ) {
    return this.prisma.votingPlace.update({
      where: { id },
      data,
    });
  }
}
