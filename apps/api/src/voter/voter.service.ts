import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVoterDto } from './dto/create-voter.dto';

@Injectable()
export class VoterService {
  constructor(private prisma: PrismaService) {}

  /**
   * Registra un nuevo votante asegurando el aislamiento por Tenant.
   */
  async create(tenantId: string, registrarId: string, dto: CreateVoterDto) {
    // 1. Verificar si ya existe en esta campaña
    const existingVoter = await this.prisma.voter.findUnique({
      where: {
        documentId_tenantId: {
          documentId: dto.documentId,
          tenantId,
        },
      },
    });

    if (existingVoter) {
      throw new ConflictException('Este ciudadano ya está registrado en la campaña.');
    }

    // 2. Crear el registro
    const voter = await this.prisma.voter.create({
      data: {
        ...dto,
        tenantId,
        registrarId,
      },
    });

    // 3. Gamificación: Otorgar puntos al registrador y loguear
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: registrarId },
        data: { points: { increment: 100 } },
      }),
      this.prisma.pointLog.create({
        data: {
          userId: registrarId,
          amount: 100,
          reason: 'Registro Votante Nuevo',
        },
      }),
    ]);

    return voter;
  }

  /**
   * Obtiene todos los votantes de la campaña.
   */
  async findAll(tenantId: string) {
    return this.prisma.voter.findMany({
      where: { tenantId },
      include: {
        puesto: true,
        registrar: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtiene estadísticas rápidas para el dashboard.
   */
  async getStats(tenantId: string) {
    const [total, signatures] = await Promise.all([
      this.prisma.voter.count({ where: { tenantId } }),
      this.prisma.voter.count({ where: { tenantId, isSignatureValid: true } }),
    ]);

    return { total, signatures };
  }
}
