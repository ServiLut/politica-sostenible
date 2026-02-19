import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      // Intentar contar registros en tablas clave
      const tenants = await this.prisma.tenant.count();
      const voters = await this.prisma.voter.count();
      const finance = await this.prisma.financialEntry.count();

      return {
        status: 'ok',
        database: 'connected',
        tables: {
          tenants,
          voters,
          finance,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        code: error.code,
      };
    }
  }
}
