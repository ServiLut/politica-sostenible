import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateWitnessReportDto {
  puestoId: string;
  mesa: number;
  e14ImageUrl: string;
  candidateVotes: number;
  totalTableVotes: number;
  observations?: string;
}

@Injectable()
export class WitnessService {
  constructor(private prisma: PrismaService) {}

  async create(
    tenantId: string,
    witnessId: string,
    data: CreateWitnessReportDto,
  ) {
    return this.prisma.witnessReport.create({
      data: {
        ...data,
        tenantId,
        witnessId,
        // En una app real, puestoId vendría de la ubicación del testigo
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.witnessReport.findMany({
      where: { tenantId },
      include: {
        puesto: true,
        witness: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
