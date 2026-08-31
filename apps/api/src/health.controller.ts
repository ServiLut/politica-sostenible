import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @Public()
  live() {
    return { status: 'ok' as const };
  }

  @Get('ready')
  @Public()
  async ready() {
    try {
      await this.prisma.tenant.findFirst({ select: { id: true } });
      return { status: 'ok' as const, database: 'connected' as const };
    } catch {
      throw new ServiceUnavailableException('Database is not ready');
    }
  }

  @Get()
  @Public()
  check() {
    return this.ready();
  }
}
